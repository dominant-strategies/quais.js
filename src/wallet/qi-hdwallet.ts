

import { HDWallet, NeuteredAddressInfo } from './hdwallet';
import { HDNodeWallet } from "./hdnodewallet";
import { QiTransactionRequest, Provider } from '../providers/index.js';
import { computeAddress } from "../address/index.js";
import { getBytes, hexlify } from '../utils/index.js';
import { TransactionLike, QiTransaction, TxInput } from '../transaction/index.js';
import { MuSigFactory } from "@brandonblack/musig"
import { schnorr } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { musigCrypto } from '../crypto/index.js';
import { Outpoint } from '../transaction/utxo.js';
import { ShardData } from '../constants/shards.js';

type OutpointInfo = {
	outpoint: Outpoint;
	address: string;
};

export class QiHDWallet extends HDWallet {

	protected static _GAP_LIMIT: number = 20;

	protected static _cointype: number = 969;

	protected static _parentPath = `m/44'/${this._cointype}'`;

	protected _changeAddresses: Map<string, NeuteredAddressInfo> = new Map();

	protected _outpoints: OutpointInfo[] = [];

	private constructor(root: HDNodeWallet, provider?: Provider) {
		super(root, provider);
	}

	getNextChangeAddress(account: number, zone: string): NeuteredAddressInfo {
		if (!this._accounts.has(account)) {
			this.addAccount(account);
		}
		const filteredAccountInfos = Array.from(this._changeAddresses.values()).filter((addressInfo) =>
			addressInfo.account === account && addressInfo.zone === zone
		);
		const lastIndex = filteredAccountInfos.reduce((maxIndex, addressInfo) => Math.max(maxIndex, addressInfo.index), -1);
		// call derive address with change = true
		const addressNode = this.deriveAddress(account, lastIndex + 1, zone, true);

		const neuteredAddressInfo = {
			pubKey: addressNode.publicKey,
			address: addressNode.address,
			account: account,
			index: addressNode.index,
			change: true,
			zone: zone
		};

		this._changeAddresses.set(neuteredAddressInfo.address, neuteredAddressInfo);

		return neuteredAddressInfo;
	}

	importOutpoints(outpoints: OutpointInfo[]): void {
		this._outpoints.push(...outpoints);
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
		const privKey = this.derivePrivateKeyForInput(input);
		const signature = schnorr.sign(hash, getBytes(privKey));
		return hexlify(signature);
	}

	// createMuSigSignature returns a MuSig signature for the given message
	// and private keys corresponding to the input addresses
	private createMuSigSignature(tx: QiTransaction, hash: Uint8Array): string {
		const musig = MuSigFactory(musigCrypto);

		// Collect private keys corresponding to the pubkeys found on the inputs
		const privKeysSet = new Set<string>();
		tx.txInputs!.forEach((input) => {
			const privKey = this.derivePrivateKeyForInput(input)
			privKeysSet.add(privKey);
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

	// Helper method that returns the private key for the public key
	derivePrivateKeyForInput(input: TxInput): string {
		if (!input.pub_key) throw new Error('Missing public key for input');
		const pubKey = hexlify(input.pub_key);
		const address = computeAddress(pubKey);
		// get address info
		const addressInfo = this.getAddressInfo(address);
		if (!addressInfo) throw new Error(`Address not found: ${address}`);
		// derive an HDNode for the address and get the private key
		const accountNode = this._accounts.get(addressInfo.account);
		if (!accountNode) {
			throw new Error(`Account ${addressInfo.account} not found for address ${address}`);
		}
		const changeNode = accountNode.deriveChild(0);
		const addressNode = changeNode.deriveChild(addressInfo.index);
		return addressNode.privateKey;
	}



	async rescan(zone: string, account: number = 0): Promise<void> {
		if (!this.validateZone(zone)) throw new Error(`Invalid zone: ${zone}`);
		if (!this.provider) throw new Error('Provider not set');

		if (!this._accounts.has(account)) {
			this.addAccount(account);
		}

		let nakedAddressesCount = 0;
		let changeAddressesCount = 0;

		while (nakedAddressesCount < QiHDWallet._GAP_LIMIT || changeAddressesCount < QiHDWallet._GAP_LIMIT) { 
			const addressInfo = this.getNextAddress(account, zone);
			const outpoints = await this.getOutpointsByAddress(addressInfo.address);
			if (outpoints.length === 0) {
					nakedAddressesCount++;
			} else {
					nakedAddressesCount = 0;
					const newOutpointsInfo = outpoints.map((outpoint) => {
						return { outpoint, address: addressInfo.address };
					});
					this._outpoints.push(...newOutpointsInfo);
			}

			const changeAddressInfo = this.getNextChangeAddress(account, zone);
			const changeOutpoints = await this.getOutpointsByAddress(changeAddressInfo.address);
			if (changeOutpoints.length === 0) {
					changeAddressesCount++;
			} else {
					changeAddressesCount = 0;
					const newOutpointsInfo = changeOutpoints.map((outpoint) => {
						return { outpoint, address: changeAddressInfo.address };
					});
					this._outpoints.push(...newOutpointsInfo);
			}
		}
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


}