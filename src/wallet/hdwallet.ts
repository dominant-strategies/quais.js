import { HDNodeWallet } from "./hdnodewallet";
import { Mnemonic } from "./mnemonic.js";
import { LangEn } from "../wordlists/lang-en.js"
import type { Wordlist } from "../wordlists/index.js";
import { randomBytes } from "../crypto/index.js";
import { getZoneForAddress, isQiAddress } from "../utils/index.js";
import { ZoneData, ShardData } from '../constants/index.js';
import { TransactionRequest, Provider, TransactionResponse } from '../providers/index.js';

export interface NeuteredAddressInfo {
	pubKey: string;
	address: string;
	account: number;
	index: number;
	change: boolean;
	zone: string;
}

// Constant to represent the maximum attempt to derive an address
const MAX_ADDRESS_DERIVATION_ATTEMPTS = 10000000;

export abstract class HDWallet {
	protected static _coinType?: number = 969 || 994;

	// Map of account number to HDNodeWallet
	protected _accounts: Map<number, HDNodeWallet> = new Map();

	// Map of addresses to address info
	protected _addresses: Map<string, NeuteredAddressInfo> = new Map();

	// Map of addresses to private keys
	protected _privateKeys: Map<string, string> = new Map();

	// Root node of the HD wallet
	protected _root: HDNodeWallet;

	// Wallet parent path
	protected static _parentPath: string = "";

	protected provider?: Provider;

	/**
	 *  @private
	 */
	protected constructor(root: HDNodeWallet, provider?: Provider) {
		this._root = root;
		this.provider = provider;
	}

	protected parentPath(): string {
		return (this.constructor as typeof HDWallet)._parentPath;
	}
	
	protected coinType(): number {
		return (this.constructor as typeof HDWallet)._coinType!;
	}

	// helper methods that adds an account HD node to the HD wallet following the BIP-44 standard.
	protected addAccount(accountIndex: number): void {
		const newNode = this._root.deriveChild(accountIndex);
		this._accounts.set(accountIndex, newNode);
	}

	protected deriveAddress(account: number, startingIndex: number, zone: string, isChange: boolean = false): HDNodeWallet {
		const isValidAddressForZone = (address: string) => {
            const zone = getZoneForAddress(address);
            if (!zone) {
                return false;
            }
            const shardNickname = ZoneData.find((zoneData) => zoneData.byte === zone)?.nickname;
			const isCorrectShard = shardNickname === zone.toLowerCase();
			const isCorrectLedger = (this.coinType() === 969) ? isQiAddress(address) : !isQiAddress(address);
			return isCorrectShard && isCorrectLedger;
		}
		// derive the address node
		const accountNode = this._accounts.get(account);
		const changeIndex = isChange ? 1 : 0;
		const changeNode = accountNode!.deriveChild(changeIndex);
		let addrIndex: number = startingIndex;
		let addressNode: HDNodeWallet;
		do {
			addressNode = changeNode.deriveChild(addrIndex);
			addrIndex++;
			// put a hard limit on the number of addresses to derive
			if (addrIndex - startingIndex > MAX_ADDRESS_DERIVATION_ATTEMPTS) {
				throw new Error(`Failed to derive a valid address for the zone ${zone} after MAX_ADDRESS_DERIVATION_ATTEMPTS attempts.`);
			}
		} while (!isValidAddressForZone(addressNode.address));

		return addressNode;

	}

	addAddress(account: number, zone: string, addressIndex: number): NeuteredAddressInfo {
		if (!this._accounts.has(account)) {
			this.addAccount(account);
		}
		// check if address already exists for the index
		this._addresses.forEach((addressInfo) => {
			if (addressInfo.index === addressIndex) {
				throw new Error(`Address for index ${addressIndex} already exists`);
			}
		});

		const addressNode = this.deriveAddress(account, addressIndex, zone);

		// create the NeuteredAddressInfo object and update the maps
		const neuteredAddressInfo = {
			pubKey: addressNode.publicKey,
			address: addressNode.address,
			account: account,
			index: addressNode.index,
			change: false,
			zone: zone
		};

		this._addresses.set(neuteredAddressInfo.address, neuteredAddressInfo);

		this._privateKeys.set(addressNode.address, addressNode.privateKey);

		return neuteredAddressInfo;

	}

	getNextAddress(accountIndex: number, zone: string): NeuteredAddressInfo {
		if (!this.validateZone(zone)) throw new Error(`Invalid zone: ${zone}`);
		if (!this._accounts.has(accountIndex)) {
			this.addAccount(accountIndex);
		}

		const filteredAccountInfos = Array.from(this._addresses.values()).filter((addressInfo) =>
			addressInfo.account === accountIndex && addressInfo.zone === zone
		);
		const lastIndex = filteredAccountInfos.reduce((maxIndex, addressInfo) => Math.max(maxIndex, addressInfo.index), -1);
		const addressNode = this.deriveAddress(accountIndex, lastIndex + 1, zone);

		// create the NeuteredAddressInfo object and update the maps
		const neuteredAddressInfo = {
			pubKey: addressNode.publicKey,
			address: addressNode.address,
			account: accountIndex,
			index: addressNode.index,
			change: false,
			zone: zone
		};
		this._addresses.set(neuteredAddressInfo.address, neuteredAddressInfo);
		this._privateKeys.set(addressNode.address, addressNode.privateKey);

		return neuteredAddressInfo;
	}

	getAddressInfo(address: string): NeuteredAddressInfo | null {
		const addressInfo = this._addresses.get(address);
		if (!addressInfo) {
			return null;
		}
		return addressInfo;
	}

	getAddressesForAccount(account: number): NeuteredAddressInfo[] {
		const addresses = this._addresses.values();
		return Array.from(addresses).filter((addressInfo) => addressInfo.account === account);
	}

	getAddressesForZone(zone: string): NeuteredAddressInfo[] {
		if (!this.validateZone(zone)) throw new Error(`Invalid zone: ${zone}`);
		const addresses = this._addresses.values();
		return Array.from(addresses).filter((addressInfo) => addressInfo.zone === zone);
	}

	protected static createInstance<T extends HDWallet>(this: new (root: HDNodeWallet) => T, mnemonic: Mnemonic): T {
		const root = HDNodeWallet.fromMnemonic(mnemonic, (this as any)._parentPath);
		return new this(root);
	}

	static fromMnemonic<T extends HDWallet>(this: new (root: HDNodeWallet) => T, mnemonic: Mnemonic): T {
		return (this as any).createInstance(mnemonic);
	}

	static createRandom<T extends HDWallet>(this: new (root: HDNodeWallet) => T, password?: string, wordlist?: Wordlist): T {
		if (password == null) { password = ""; }
		if (wordlist == null) { wordlist = LangEn.wordlist(); }
		const mnemonic = Mnemonic.fromEntropy(randomBytes(16), password, wordlist);
		return (this as any).createInstance(mnemonic);
	}

	static fromPhrase<T extends HDWallet>(this: new (root: HDNodeWallet) => T, phrase: string, password?: string, wordlist?: Wordlist): T {
		if (password == null) { password = ""; }
		if (wordlist == null) { wordlist = LangEn.wordlist(); }
		const mnemonic = Mnemonic.fromPhrase(phrase, password, wordlist);
		return (this as any).createInstance(mnemonic);
	}

	// TODO: Implement this method
	// static fromExtendedKey(extendedKey: string): HDWallet {}

	abstract signTransaction(tx: TransactionRequest): Promise<string>

	// TODO: Implement this method
	abstract sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>

	connect(provider: Provider): void {
		this.provider = provider;
	}

    // helper function to validate the zone
    protected validateZone(zone: string): boolean {
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