import { HDNodeWallet } from './hdnodewallet.js';
import { Mnemonic } from './mnemonic.js';
import { LangEn } from '../wordlists/lang-en.js';
import type { Wordlist } from '../wordlists/index.js';
import { randomBytes } from '../crypto/index.js';
import { getZoneForAddress, isQiAddress } from '../utils/index.js';
import { Zone } from '../constants/index.js';
import { TransactionRequest, Provider, TransactionResponse } from '../providers/index.js';
import { AllowedCoinType } from '../constants/index.js';
import { QiHDWallet } from './qi-hdwallet.js';
import { QuaiHDWallet } from './quai-hdwallet.js';

export interface NeuteredAddressInfo {
    pubKey: string;
    address: string;
    account: number;
    index: number;
    change: boolean;
    zone: Zone;
}

export interface SerializedHDWallet {
    version: number;
    phrase: string;
    coinType: AllowedCoinType;
    addresses: Array<NeuteredAddressInfo>;
}

// Constant to represent the maximum attempt to derive an address
const MAX_ADDRESS_DERIVATION_ATTEMPTS = 10000000;

export abstract class AbstractHDWallet {
    protected static _version: number = 1;

    protected static _coinType?: AllowedCoinType;

    // Map of account number to HDNodeWallet
    protected _accounts: Map<number, HDNodeWallet> = new Map();

    // Map of addresses to address info
    protected _addresses: Map<string, NeuteredAddressInfo> = new Map();

    // Root node of the HD wallet
    protected _root: HDNodeWallet;

    protected provider?: Provider;

    /**
     * @private
     */
    protected constructor(root: HDNodeWallet, provider?: Provider) {
        this._root = root;
        this.provider = provider;
    }

    protected static parentPath(coinType: number): string {
        return `m/44'/${coinType}'`;
    }

    protected coinType(): AllowedCoinType {
        return (this.constructor as typeof AbstractHDWallet)._coinType!;
    }

    // helper methods that adds an account HD node to the HD wallet following the BIP-44 standard.
    protected addAccount(accountIndex: number): void {
        const newNode = this._root.deriveChild(accountIndex);
        this._accounts.set(accountIndex, newNode);
    }

    protected deriveAddress(
        account: number,
        startingIndex: number,
        zone: Zone,
        isChange: boolean = false,
    ): HDNodeWallet {
        this.validateZone(zone);
        const isValidAddressForZone = (address: string) => {
            const addressZone = getZoneForAddress(address);
            if (!addressZone) {
                return false;
            }
            const isCorrectShard = addressZone === zone;
            const isCorrectLedger = this.coinType() === 969 ? isQiAddress(address) : !isQiAddress(address);
            return isCorrectShard && isCorrectLedger;
        };
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
                throw new Error(
                    `Failed to derive a valid address for the zone ${zone} after ${MAX_ADDRESS_DERIVATION_ATTEMPTS} attempts.`,
                );
            }
        } while (!isValidAddressForZone(addressNode.address));

        return addressNode;
    }

    public addAddress(account: number, addressIndex: number, isChange: boolean = false): NeuteredAddressInfo {
        return this._addAddress(this._addresses, account, addressIndex, isChange);
    }

    // helper method to add an address to the wallet address map
    protected _addAddress(
        addressMap: Map<string, NeuteredAddressInfo>,
        account: number,
        addressIndex: number,
        isChange: boolean = false,
    ): NeuteredAddressInfo {
        if (!this._accounts.has(account)) {
            this.addAccount(account);
        }
        // check if address already exists for the index
        this._addresses.forEach((addressInfo) => {
            if (addressInfo.index === addressIndex) {
                throw new Error(`Address for index ${addressIndex} already exists`);
            }
        });

        // derive the address node
        const changeIndex = isChange ? 1 : 0;
        const addressNode = this._root.deriveChild(account).deriveChild(changeIndex).deriveChild(addressIndex);
        const zone = getZoneForAddress(addressNode.address);
        if (!zone) {
            throw new Error(`Failed to derive a valid address zone for the index ${addressIndex}`);
        }

        // create the NeuteredAddressInfo object and update the map
        const neuteredAddressInfo = {
            pubKey: addressNode.publicKey,
            address: addressNode.address,
            account: account,
            index: addressNode.index,
            change: isChange,
            zone: zone,
        };

        addressMap.set(neuteredAddressInfo.address, neuteredAddressInfo);

        return neuteredAddressInfo;
    }

    public getNextAddress(accountIndex: number, zone: Zone): NeuteredAddressInfo {
        this.validateZone(zone);
        if (!this._accounts.has(accountIndex)) {
            this.addAccount(accountIndex);
        }

        const filteredAccountInfos = Array.from(this._addresses.values()).filter(
            (addressInfo) => addressInfo.account === accountIndex && addressInfo.zone === zone,
        );
        const lastIndex = filteredAccountInfos.reduce(
            (maxIndex, addressInfo) => Math.max(maxIndex, addressInfo.index),
            -1,
        );
        const addressNode = this.deriveAddress(accountIndex, lastIndex + 1, zone);

        // create the NeuteredAddressInfo object and update the maps
        const neuteredAddressInfo = {
            pubKey: addressNode.publicKey,
            address: addressNode.address,
            account: accountIndex,
            index: addressNode.index,
            change: false,
            zone: zone,
        };
        this._addresses.set(neuteredAddressInfo.address, neuteredAddressInfo);

        return neuteredAddressInfo;
    }

    public getAddressInfo(address: string): NeuteredAddressInfo | null {
        const addressInfo = this._addresses.get(address);
        if (!addressInfo) {
            return null;
        }
        return addressInfo;
    }

    public getAddressesForAccount(account: number): NeuteredAddressInfo[] {
        const addresses = this._addresses.values();
        return Array.from(addresses).filter((addressInfo) => addressInfo.account === account);
    }

    public getAddressesForZone(zone: Zone): NeuteredAddressInfo[] {
        this.validateZone(zone);
        const addresses = this._addresses.values();
        return Array.from(addresses).filter((addressInfo) => addressInfo.zone === zone);
    }

    protected static createInstance<T extends AbstractHDWallet>(
        this: new (root: HDNodeWallet) => T,
        mnemonic: Mnemonic,
    ): T {
        const coinType = (this as any)._coinType;
        const root = HDNodeWallet.fromMnemonic(mnemonic, (this as any).parentPath(coinType));
        return new this(root);
    }

    static fromMnemonic<T extends AbstractHDWallet>(this: new (root: HDNodeWallet) => T, mnemonic: Mnemonic): T {
        return (this as any).createInstance(mnemonic);
    }

    static createRandom<T extends AbstractHDWallet>(
        this: new (root: HDNodeWallet) => T,
        password?: string,
        wordlist?: Wordlist,
    ): T {
        if (password == null) {
            password = '';
        }
        if (wordlist == null) {
            wordlist = LangEn.wordlist();
        }
        const mnemonic = Mnemonic.fromEntropy(randomBytes(16), password, wordlist);
        return (this as any).createInstance(mnemonic);
    }

    static fromPhrase<T extends AbstractHDWallet>(
        this: new (root: HDNodeWallet) => T,
        phrase: string,
        password?: string,
        wordlist?: Wordlist,
    ): T {
        if (password == null) {
            password = '';
        }
        if (wordlist == null) {
            wordlist = LangEn.wordlist();
        }
        const mnemonic = Mnemonic.fromPhrase(phrase, password, wordlist);
        return (this as any).createInstance(mnemonic);
    }

    abstract signTransaction(tx: TransactionRequest): Promise<string>;

    abstract sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>;

    public connect(provider: Provider): void {
        this.provider = provider;
    }

    protected validateZone(zone: Zone): void {
        if (!Object.values(Zone).includes(zone)) {
            throw new Error(`Invalid zone: ${zone}`);
        }
    }

    // Returns the HD node that derives the address.
    // If the address is not found in the wallet, an error is thrown.
    protected _getHDNodeForAddress(addr: string): HDNodeWallet {
        const addressInfo = this._addresses.get(addr);
        if (!addressInfo) {
            throw new Error(`Address ${addr} is not known to this wallet`);
        }

        // derive a HD node for the from address using the index
        const accountNode = this._accounts.get(addressInfo.account);
        if (!accountNode) {
            throw new Error(`Account ${addressInfo.account} not found`);
        }
        const changeIndex = addressInfo.change ? 1 : 0;
        const changeNode = accountNode.deriveChild(changeIndex);
        return changeNode.deriveChild(addressInfo.index);
    }

    abstract signMessage(address: string, message: string | Uint8Array): Promise<string>;

    public async serialize(): Promise<SerializedHDWallet> {
        const addresses = Array.from(this._addresses.values());
        return {
            version: (this.constructor as any)._version,
            phrase: this._root.mnemonic!.phrase,
            coinType: this.coinType(),
            addresses: addresses,
        };
    }

    static async deserialize<T extends AbstractHDWallet>(
        this: new (root: HDNodeWallet, provider?: Provider) => T,
        serialized: SerializedHDWallet,
    ): Promise<QuaiHDWallet | QiHDWallet> {
        // validate the version and coinType
        if (serialized.version !== (this as any)._version) {
            throw new Error(`Invalid version ${serialized.version} for wallet (expected ${(this as any)._version})`);
        }
        if (serialized.coinType !== (this as any)._coinType) {
            throw new Error(`Invalid coinType ${serialized.coinType} for wallet (expected ${(this as any)._coinType})`);
        }
        // create the wallet instance
        const mnemonic = Mnemonic.fromPhrase(serialized.phrase);
        const path = (this as any).parentPath(serialized.coinType);
        const root = HDNodeWallet.fromMnemonic(mnemonic, path);
        const wallet = new this(root);

        // import the addresses
        wallet.importSerializedAddresses(wallet._addresses, serialized.addresses);

        return wallet as T;
    }

    // This method is used to import addresses from a serialized wallet.
    // It validates the addresses and adds them to the wallet.
    protected importSerializedAddresses(
        addressMap: Map<string, NeuteredAddressInfo>,
        addresses: NeuteredAddressInfo[],
    ): void {
        for (const addressInfo of addresses) {
            const newAddressInfo = this._addAddress(
                addressMap,
                addressInfo.account,
                addressInfo.index,
                addressInfo.change,
            );
            // validate the address info
            if (addressInfo.address !== newAddressInfo.address) {
                throw new Error(`Address mismatch: ${addressInfo.address} != ${newAddressInfo.address}`);
            }
            if (addressInfo.pubKey !== newAddressInfo.pubKey) {
                throw new Error(`Public key mismatch: ${addressInfo.pubKey} != ${newAddressInfo.pubKey}`);
            }
            if (addressInfo.zone !== newAddressInfo.zone) {
                throw new Error(`Zone mismatch: ${addressInfo.zone} != ${newAddressInfo.zone}`);
            }
        }
    }
}
