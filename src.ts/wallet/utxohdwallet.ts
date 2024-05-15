
import { N, ShardData } from '../constants';
import { SigningKey, keccak256 as addressKeccak256 } from "../crypto/index.js";
import {
    BytesLike,
    Numeric,
    Provider,
    TransactionLike,
    Wordlist,
    assertArgument,
    assertPrivate,
    computeHmac,
    dataSlice,
    defineProperties,
    getBytes,
    getNumber,
    getShardForAddress,
    hexlify,
    isBytesLike,
    isUTXOAddress,
    randomBytes,
    ripemd160,
    sha256,
    toBeHex,
    toBigInt,
    computeAddress
} from '../quais.js';
import { Mnemonic } from './mnemonic.js';
import { HardenedBit, derivePath, ser_I } from './utils.js';
import { BaseWallet } from "./base-wallet.js";
import { MuSigFactory } from "@brandonblack/musig"
import { nobleCrypto } from "./musig-crypto.js";
import { schnorr } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { QiTransaction } from '../transaction/qi-transaction.js';
import { QiTransactionRequest } from '../providers/provider.js';
import { TxInput } from "../transaction/utxo.js";
import { getAddress } from "../address/index.js";

type AddressInfo = {
    address: string;
    privKey: string;
    index: number;
};

type Outpoint = {
    Txhash: string;
    Index: number;
    Denomination: number;
};

// keeps track of the addresses and outpoints for a given shard (zone)
type ShardWalletData = {
    addressesInfo: AddressInfo[];
    outpoints: Map<string, Outpoint[]>;
}

const MasterSecret = new Uint8Array([ 66, 105, 116, 99, 111, 105, 110, 32, 115, 101, 101, 100 ]);
const COIN_TYPE = 969;
const GAP = 20;
const _guard = { };

/**
 *  @TODO write documentation for this class.
 * 
 *  @category Wallet
 */
export class UTXOHDWallet extends BaseWallet {
     /**
     *  The compressed public key.
     */
     readonly #publicKey!: string;

     /**
      *  The fingerprint.
      *
      *  A fingerprint allows quick qay to detect parent and child nodes,
      *  but developers should be prepared to deal with collisions as it
      *  is only 4 bytes.
      */
     readonly fingerprint!: string;
 
     /**
      *  The parent fingerprint.
      */
     readonly accountFingerprint!: string;
 
     /**
      *  The mnemonic used to create this HD Node, if available.
      *
      *  Sources such as extended keys do not encode the mnemonic, in
      *  which case this will be `null`.
      */
     readonly mnemonic!: null | Mnemonic;
 
     /**
      *  The chaincode, which is effectively a public key used
      *  to derive children.
      */
     readonly chainCode!: string;
 
     /**
      *  The derivation path of this wallet.
      *
      *  Since extended keys do not provider full path details, this
      *  may be `null`, if instantiated from a source that does not
      *  enocde it.
      */
     readonly path!: null | string;
 
     /**
      *  The child index of this wallet. Values over `2 *\* 31` indicate
      *  the node is hardened.
      */
     readonly index!: number;
 
     /**
      *  The depth of this wallet, which is the number of components
      *  in its path.
      */
     readonly depth!: number;

     coinType?: number;

    /**
     * Map of shard name (zone) to shardWalletData
     * shardWalletData contains the addresses and outpoints for the shard
     * that are known to the wallet
     */
    #shardWalletsMap: Map<string, ShardWalletData> = new Map();

    get shardWalletsMap(): Map<string, ShardWalletData> {
        return this.#shardWalletsMap;
    }

    set shardWallets(shardWallets: Map<string, ShardWalletData>) {
        this.#shardWalletsMap = shardWallets;
    }

    /**
     * Gets the current publicKey
     */
    get publicKey(): string {
        return this.#publicKey;
    }
    /**
     *  @private
     */
    constructor(guard: any, signingKey: SigningKey, accountFingerprint: string, chainCode: string, path: null | string, index: number, depth: number, mnemonic: null | Mnemonic, provider: null | Provider) {
        super(signingKey, provider);
        assertPrivate(guard, _guard);

        this.#publicKey = signingKey.compressedPublicKey 

        const fingerprint = dataSlice(ripemd160(sha256(this.#publicKey)), 0, 4);
        defineProperties<UTXOHDWallet>(this, {
            accountFingerprint, fingerprint,
            chainCode, path, index, depth
        });
        defineProperties<UTXOHDWallet>(this, { mnemonic });
    }
    
    connect(provider: null | Provider): UTXOHDWallet {
        return new UTXOHDWallet(_guard, this.signingKey, this.accountFingerprint,
            this.chainCode, this.path, this.index, this.depth, this.mnemonic, provider);
    }

    derivePath(path: string): UTXOHDWallet {
        return derivePath<UTXOHDWallet>(this, path);
    }
    
    static #fromSeed(_seed: BytesLike, mnemonic: null | Mnemonic): UTXOHDWallet {
        assertArgument(isBytesLike(_seed), "invalid seed", "seed", "[REDACTED]");

        const seed = getBytes(_seed, "seed");
        assertArgument(seed.length >= 16 && seed.length <= 64 , "invalid seed", "seed", "[REDACTED]");

        const I = getBytes(computeHmac("sha512", MasterSecret, seed));
        const signingKey = new SigningKey(hexlify(I.slice(0, 32)));

        const result = new UTXOHDWallet(_guard, signingKey, "0x00000000", hexlify(I.slice(32)),
            "m", 0, 0, mnemonic, null);
        return result;
    }
    
    setCoinType(): void {
        this.coinType = Number(this.path?.split("/")[2].replace("'", ""));
    }

    /**
     *  Creates a new random HDNode.
     * 
     *  @param {string} path - The BIP44 path to derive.
     *  @param {string} [password] - The password to use for the mnemonic.
     *  @param {Wordlist} [wordlist] - The wordlist to use for the mnemonic.
     *  @returns {UTXOHDWallet} The new HDNode.
     */
    static createRandom( path: string, password?: string, wordlist?: Wordlist): UTXOHDWallet {
        if (path == null || !this.isValidPath(path)) { throw new Error('Invalid path: ' + path)}
        const mnemonic = Mnemonic.fromEntropy(randomBytes(16), password, wordlist)
        return UTXOHDWallet.#fromSeed(mnemonic.computeSeed(), mnemonic).derivePath(path);
    }

    /**
     *  Create an HD Node from `mnemonic`.
     * 
     *  @param {Mnemonic} mnemonic - The mnemonic to create the HDNode from.
     *  @param {string} path - The BIP44 path to derive.
     *  @returns {UTXOHDWallet} The new HDNode.
     */
    static fromMnemonic(mnemonic: Mnemonic, path: string): UTXOHDWallet {
        if (path == null || !this.isValidPath(path)) { throw new Error('Invalid path: ' + path)}
        return UTXOHDWallet.#fromSeed(mnemonic.computeSeed(), mnemonic).derivePath(path);
    }

    /**
     *  Creates an HD Node from a mnemonic `phrase`.
     * 
     *  @param {string} phrase - The mnemonic phrase to create the HDNode from.
     *  @param {string} path - The BIP44 path to derive.
     *  @param {string} [password] - The password to use for the mnemonic.
     *  @param {Wordlist} [wordlist] - The wordlist to use for the mnemonic.
     *  @returns {UTXOHDWallet} The new HDNode.
     */
    static fromPhrase(phrase: string, path: string, password?: string, wordlist?: Wordlist): UTXOHDWallet {
        if (path == null || !this.isValidPath(path)) { throw new Error('Invalid path: ' + path)}
        const mnemonic = Mnemonic.fromPhrase(phrase, password, wordlist)
        return UTXOHDWallet.#fromSeed(mnemonic.computeSeed(), mnemonic).derivePath(path);
    }

    /**
     * Checks if the provided BIP44 path is valid and limited to the change level.
     * @param {string} path - The BIP44 path to validate.
     * @returns {boolean} true if the path is valid and does not include the address_index; false otherwise.
     */
    static isValidPath(path: string): boolean {
        // BIP44 path regex pattern for up to the 'change' level, excluding 'address_index'
        // This pattern matches paths like "m/44'/0'/0'/0" and "m/44'/60'/0'/1", but not "m/44'/60'/0'/0/0"
        const pathRegex = /^m\/44'\/\d+'\/\d+'\/[01]$/;
        return pathRegex.test(path);
    }

    /**
     *  Return the child for `index`.
     * 
     *  @param {number} _index - The index to derive.
     *  @returns {UTXOHDWallet} The derived child.
     */
    deriveChild(_index: Numeric): UTXOHDWallet {
        const index = getNumber(_index, "index");
        assertArgument(index <= 0xffffffff, "invalid index", "index", index);

        // Base path
        let newDepth = this.depth + 1;
        let path = this.path;
        if (path) {
            let pathFields = path.split("/");
            if (pathFields.length == 6){
                pathFields.pop();
                path = pathFields.join("/");
                newDepth--;
            }

            path += "/" + (index & ~HardenedBit);
            if (index & HardenedBit) { path += "'"; }
        }
        const { IR, IL } = ser_I(index, this.chainCode, this.#publicKey, this.privateKey);
        const ki = new SigningKey(toBeHex((toBigInt(IL) + BigInt(this.privateKey)) % N, 32));
        
        //BIP44 if we are at the account depth get that fingerprint, otherwise continue with the current one
        let newFingerprint = this.depth == 3 ? this.fingerprint : this.accountFingerprint;

        return new UTXOHDWallet(_guard, ki, newFingerprint, hexlify(IR),
            path, index, newDepth, this.mnemonic, this.provider);

    }

    /**
     *  Derives an address that is valid for a specified zone on the Qi ledger.
     * 
     *  @param {number} startingIndex - The index to derive.
     *  @param {string} zone - The zone to derive the address for
     *  @returns {UTXOHDWallet} The derived address.
     *  @throws {Error} If the wallet's address derivation path is missing or if 
     *  a valid address cannot be derived for the specified zone after 1000 attempts.
     */
    private deriveAddress(startingIndex: number, zone: string): AddressInfo{
        if (!this.path) throw new Error("Missing wallet's address derivation path");

        let newWallet: UTXOHDWallet;

        // helper function to check if the generated address is valid for the specified zone
        const isValidAddressForZone = (address: string) => {
            return (getShardForAddress(address)?.nickname.toLowerCase() === zone &&
                newWallet.coinType == COIN_TYPE &&
                isUTXOAddress(address) == true);
        }

        let addrIndex: number = startingIndex;
        do {
            newWallet = this.derivePath(addrIndex.toString());
            addrIndex++;
            // put a hard limit on the number of addresses to derive
            if (addrIndex - startingIndex > 1000) {
                throw new Error(`Failed to derive a valid address for the zone ${zone} after 1000 attempts.`);
            }
        } while (!isValidAddressForZone(newWallet.address));

        const addresInfo = { address: newWallet.address, privKey: newWallet.privateKey, index: addrIndex - 1};
        
        return addresInfo;
    }


    // helper function to validate the zone
    private validateZone(zone: string): boolean {
        zone = zone.toLowerCase()
        const shard = ShardData.find(shard => shard.name.toLowerCase() === zone ||
            shard.nickname.toLowerCase() === zone ||
            shard.byte.toLowerCase() === zone);
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
     * Initializes the wallet by generating addresses and private keys for the specified zone.
     * The wallet will generate addresses until it has `GAP` number of naked addresses.
     * A provider must be set before calling this method.
     *
     * @param {string} zone - Zone identifier used to validate the derived address.
     * @returns {Promise<void>}
     */
    public async init(zone: string): Promise<void> {
        if (!this.validateZone(zone)) throw new Error(`Invalid zone: ${zone}`);
        if (!this.provider) throw new Error("Provider not set");

        let shardWalletData = this.#shardWalletsMap.get(zone);
        if (!shardWalletData) {
            shardWalletData = { addressesInfo: [], outpoints: new Map() };
            this.#shardWalletsMap.set(zone, shardWalletData);  
        }
        
        let nakedCount = 0;
        let derivationIndex = 0;  
    
        while (nakedCount < GAP) {
            const addressInfo = this.deriveAddress(derivationIndex, zone);
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
     *  Returns the first naked address for a given zone.
     * 
     *  @param {string} zone - The zone identifier.
     *  @returns {Promise<string>} The naked address.
     *  @throws {Error} If the zone is invalid or the wallet has not been initialized.
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
     *  Signs a Qi transaction and returns the serialized transaction
     *
     *  @param {QiTransactionRequest} tx - The transaction to sign.
     *  @returns {Promise<string>} The serialized transaction.
     *  @throws {Error} If the UTXO transaction is invalid.
     */
    async signTransaction(tx: QiTransactionRequest): Promise<string> {
        const txobj = QiTransaction.from((<TransactionLike>tx))
        if (!txobj.txInputs || txobj.txInputs.length == 0 || !txobj.txOutputs) throw new Error('Invalid UTXO transaction, missing inputs or outputs')
        
        const hash = keccak_256(txobj.unsignedSerialized)

        let signature: string;

        if (txobj.txInputs.length == 1){
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
        const privKey = shardWalletData.addressesInfo.find(utxoAddr => utxoAddr.address === address)?.privKey;
        if (!privKey) throw new Error(`Missing private key for ${hexlify(pubKey)}`);
        // create the schnorr signature
        const signature = schnorr.sign(hash, getBytes(privKey) );
        return hexlify(signature);
    }

    // createMuSigSignature returns a MuSig signature for the given message
    // and private keys corresponding to the input addresses
    private createMuSigSignature(tx: QiTransaction, hash: Uint8Array): string {
        const musig = MuSigFactory(nobleCrypto);

        // Collect private keys corresponding to the addresses of the inputs
        const privKeysSet = new Set<string>();
        tx.txInputs!.forEach(input => {
            if (!input.pub_key) throw new Error('Missing public key for input');
            const address = computeAddress(hexlify(input.pub_key));

            // get shard from address
            const shard = getShardForAddress(address);
            if (!shard) throw new Error(`Invalid address: ${address}`);
            // get the wallet data corresponding to the shard
            const shardWalletData = this.#shardWalletsMap.get(shard.nickname);
            if (!shardWalletData) throw new Error(`Missing wallet data for shard: ${shard.name, shard.nickname}`);

            const utxoAddrObj = shardWalletData.addressesInfo.find(utxoAddr => utxoAddr.address === address);
            if (!utxoAddrObj) {
                throw new Error(`Private key not found for public key associated with address: ${address}`);
            }
            privKeysSet.add(utxoAddrObj.privKey);
        });
        const privKeys = Array.from(privKeysSet);

        // Create an array of public keys corresponding to the private keys for musig aggregation
        const pubKeys: Uint8Array[] = privKeys.map(privKey => nobleCrypto.getPublicKey(getBytes(privKey!), true)).filter(pubKey => pubKey !== null) as Uint8Array[];

        // Generate nonces for each public key
        const nonces = pubKeys.map(pk => musig.nonceGen({publicKey: getBytes(pk!)}));
        const aggNonce = musig.nonceAgg(nonces);

        const signingSession = musig.startSigningSession(
            aggNonce,
            hash,
            pubKeys
        );

        // Create partial signatures for each private key
        const partialSignatures = privKeys.map((sk, index) =>
            musig.partialSign({
                secretKey: getBytes(sk || ''),
                publicNonce: nonces[index],
                sessionKey: signingSession,
                verify: true
            })
        );

        // Aggregate the partial signatures into a final aggregated signature
        const finalSignature = musig.signAgg(partialSignatures, signingSession);
        
        return hexlify(finalSignature);
    }

    // getAddressFromPubKey returns the address corresponding to the given public key
    getAddressFromPubKey(pubkey: string): string {
        return getAddress(addressKeccak256("0x" + pubkey.substring(4)).substring(26))
    }
}