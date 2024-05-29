import { ShardData } from '../constants/index.js';
import { SigningKey, keccak256 as addressKeccak256 } from '../crypto/index.js';
import { getBytes, getShardForAddress, hexlify } from '../utils/index.js';
import { Provider, QiTransactionRequest } from '../providers/index.js';
import { TransactionLike, computeAddress, QiTransaction, TxInput } from '../transaction/index.js';
import { Mnemonic } from './mnemonic.js';
import { HDWallet, AddressInfo } from "./hdwallet.js";
import { MuSigFactory } from "@brandonblack/musig"
import { schnorr } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { getAddress } from "../address/index.js";
import { QI_COIN_TYPE } from '../constants/index.js';
import { musigCrypto } from '../crypto/index.js';

type Outpoint = {
    Txhash: string;
    Index: number;
    Denomination: number;
};

// keeps track of the addresses and outpoints for a given shard (zone)
type ShardWalletData = {
    addressesInfo: AddressInfo[];
    outpoints: Map<string, Outpoint[]>;
};

const GAP = 20;

/**
 * @category Wallet
 * @todo Write documentation for this class.
 */
export class QiHDWallet extends HDWallet {
    coinType: number = QI_COIN_TYPE;

    /**
     * Map of shard name (zone) to shardWalletData shardWalletData contains the addresses and outpoints for the shard
     * that are known to the wallet
     */
    #shardWalletsMap: Map<string, ShardWalletData> = new Map();

    get shardWalletsMap(): Map<string, ShardWalletData> {
        return this.#shardWalletsMap;
    }

    set shardWallets(shardWallets: Map<string, ShardWalletData>) {
        this.#shardWalletsMap = shardWallets;
    }

    constructor(
        guard: any,
        signingKey: SigningKey,
        accountFingerprint: string,
        chainCode: string,
        path: null | string,
        index: number,
        depth: number,
        mnemonic: null | Mnemonic,
        provider: null | Provider,
    ) {
        super(guard, signingKey, accountFingerprint, chainCode, path, index, depth, mnemonic, provider);
    }

    // helper function to validate the zone
    private validateZone(zone: string): boolean {
        zone = zone.toLowerCase();
        const shard = ShardData.find(
            (shard) =>
                shard.name.toLowerCase() === zone ||
                shard.nickname.toLowerCase() === zone ||
                shard.byte.toLowerCase() === zone,
        );
        return shard !== undefined;
    }

    // getOutpointsByAddress queries the network node for the outpoints of the specified address
    private async getOutpointsByAddress(address: string): Promise<Outpoint[]> {
        try {
            const outpointsMap = await this.provider!.getOutpointsByAddress(address);
            if (!outpointsMap) {
                return [];
            }
            return Object.values(outpointsMap) as Outpoint[];
        } catch (error) {
            throw new Error(`Failed to get outpoints for address: ${address}`);
        }
    }

    /**
     * Initializes the wallet by generating addresses and private keys for the specified zone. The wallet will generate
     * addresses until it has `GAP` number of naked addresses. A provider must be set before calling this method.
     *
     * @param {string} zone - Zone identifier used to validate the derived address.
     *
     * @returns {Promise<void>}
     */
    public async init(zone: string): Promise<void> {
        if (!this.validateZone(zone)) throw new Error(`Invalid zone: ${zone}`);
        if (!this.provider) throw new Error('Provider not set');

        let shardWalletData = this.#shardWalletsMap.get(zone);
        if (!shardWalletData) {
            shardWalletData = { addressesInfo: [], outpoints: new Map() };
            this.#shardWalletsMap.set(zone, shardWalletData);
        }

        let nakedCount = 0;
        let derivationIndex = 0;

        while (nakedCount < GAP) {
            const addressInfo = this.deriveAddress(derivationIndex, zone, "Qi");
            // store the address, private key and index
            shardWalletData.addressesInfo.push(addressInfo);
            // query the network node for the outpoints of the address and update the balance
            const outpoints = await this.getOutpointsByAddress(addressInfo.address);
            shardWalletData!.outpoints.set(addressInfo.address, outpoints);

            // check if the address is naked (i.e. has no UTXOs)
            if (outpoints.length == 0) {
                nakedCount++;
            } else {
                nakedCount = 0;
            }
            derivationIndex = addressInfo.index + 1;
        }
    }

    /**
     * Returns the first naked address for a given zone.
     *
     * @param {string} zone - The zone identifier.
     *
     * @returns {Promise<string>} The naked address.
     * @throws {Error} If the zone is invalid or the wallet has not been initialized.
     */
    async getAddress(zone: string): Promise<string> {
        if (!this.validateZone(zone)) throw new Error(`Invalid zone: ${zone}`);

        const shardWalletData = this.#shardWalletsMap.get(zone);
        if (!shardWalletData) {
            throw new Error(`Wallet has not been initialized for zone: ${zone}`);
        }
        // After the wallet has been initialized, the first naked address is always
        // the first address within the pack of last GAP addresses
        if (shardWalletData.addressesInfo.length < GAP) {
            throw new Error(`No enough naked addresses available for zone: ${zone}`);
        }
        return shardWalletData.addressesInfo[shardWalletData.addressesInfo.length - GAP].address;
    }

    /**
     * Signs a Qi transaction and returns the serialized transaction
     *
     * @param {QiTransactionRequest} tx - The transaction to sign.
     *
     * @returns {Promise<string>} The serialized transaction.
     * @throws {Error} If the UTXO transaction is invalid.
     */
    async signTransaction(tx: QiTransactionRequest): Promise<string> {
        const txobj = QiTransaction.from(<TransactionLike>tx);
        if (!txobj.txInputs || txobj.txInputs.length == 0 || !txobj.txOutputs)
            throw new Error('Invalid UTXO transaction, missing inputs or outputs');

        const hash = keccak_256(txobj.unsignedSerialized);

        let signature: string;

        if (txobj.txInputs.length == 1) {
            signature = this.createSchnorrSignature(txobj.txInputs[0], hash);
        } else {
            signature = this.createMuSigSignature(txobj, hash);
        }

        txobj.signature = signature;
        return txobj.serialized;
    }

    // createSchnorrSignature returns a schnorr signature for the given message and private key
    private createSchnorrSignature(input: TxInput, hash: Uint8Array): string {
        // get the private key that generates the address for the first input
        if (!input.pub_key) throw new Error('Missing public key for input');
        const pubKey = input.pub_key;
        const address = this.getAddressFromPubKey(hexlify(pubKey));
        // get shard from address
        const shard = getShardForAddress(address);
        if (!shard) throw new Error(`Invalid shard location for address: ${address}`);
        // get the wallet data corresponding to the shard
        const shardWalletData = this.#shardWalletsMap.get(shard.nickname);
        if (!shardWalletData) throw new Error(`Missing wallet data for shard: ${shard.name}`);
        // get the private key corresponding to the address
        const privKey = shardWalletData.addressesInfo.find((utxoAddr) => utxoAddr.address === address)?.privKey;
        if (!privKey) throw new Error(`Missing private key for ${hexlify(pubKey)}`);
        // create the schnorr signature
        const signature = schnorr.sign(hash, getBytes(privKey));
        return hexlify(signature);
    }

    // createMuSigSignature returns a MuSig signature for the given message
    // and private keys corresponding to the input addresses
    private createMuSigSignature(tx: QiTransaction, hash: Uint8Array): string {
        const musig = MuSigFactory(musigCrypto);

        // Collect private keys corresponding to the addresses of the inputs
        const privKeysSet = new Set<string>();
        tx.txInputs!.forEach((input) => {
            if (!input.pub_key) throw new Error('Missing public key for input');
            const address = computeAddress(hexlify(input.pub_key));

            // get shard from address
            const shard = getShardForAddress(address);
            if (!shard) throw new Error(`Invalid address: ${address}`);
            // get the wallet data corresponding to the shard
            const shardWalletData = this.#shardWalletsMap.get(shard.nickname);
            if (!shardWalletData) throw new Error(`Missing wallet data for shard: ${(shard.name, shard.nickname)}`);

            const utxoAddrObj = shardWalletData.addressesInfo.find((utxoAddr) => utxoAddr.address === address);
            if (!utxoAddrObj) {
                throw new Error(`Private key not found for public key associated with address: ${address}`);
            }
            privKeysSet.add(utxoAddrObj.privKey);
        });
        const privKeys = Array.from(privKeysSet);

        // Create an array of public keys corresponding to the private keys for musig aggregation
        const pubKeys: Uint8Array[] = privKeys
            .map((privKey) => musigCrypto.getPublicKey(getBytes(privKey!), true))
            .filter((pubKey) => pubKey !== null) as Uint8Array[];

        // Generate nonces for each public key
        const nonces = pubKeys.map((pk) => musig.nonceGen({ publicKey: getBytes(pk!) }));
        const aggNonce = musig.nonceAgg(nonces);

        const signingSession = musig.startSigningSession(aggNonce, hash, pubKeys);

        // Create partial signatures for each private key
        const partialSignatures = privKeys.map((sk, index) =>
            musig.partialSign({
                secretKey: getBytes(sk || ''),
                publicNonce: nonces[index],
                sessionKey: signingSession,
                verify: true,
            }),
        );

        // Aggregate the partial signatures into a final aggregated signature
        const finalSignature = musig.signAgg(partialSignatures, signingSession);

        return hexlify(finalSignature);
    }

    // getAddressFromPubKey returns the address corresponding to the given public key
    getAddressFromPubKey(pubkey: string): string {
        return getAddress(addressKeccak256('0x' + pubkey.substring(4)).substring(26));
    }
}
