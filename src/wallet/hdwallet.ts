import { HDNodeWallet } from './hdnodewallet.js';
import { Mnemonic } from './mnemonic.js';
import { LangEn } from '../wordlists/lang-en.js';
import type { Wordlist } from '../wordlists/index.js';
import { randomBytes } from '../crypto/index.js';
import { getZoneForAddress, assertPrivate } from '../utils/index.js';
import { isQiAddress } from '../address/index.js';
import { Zone } from '../constants/index.js';
import { TransactionRequest, Provider } from '../providers/index.js';
import { AllowedCoinType } from '../constants/index.js';

export const HARDENED_OFFSET = 2 ** 31;

/**
 * Interface representing information about a neutered address.
 */
export interface NeuteredAddressInfo {
    pubKey: string;
    address: string;
    account: number;
    index: number;
    zone: Zone;
}

/**
 * Interface representing the serialized state of an HD wallet.
 */
export interface SerializedHDWallet {
    version: number;
    phrase: string;
    coinType: AllowedCoinType;
}

/**
 * Constant to represent the maximum attempt to derive an address.
 */
export const MAX_ADDRESS_DERIVATION_ATTEMPTS = 10000000;

export const _guard = {};

/**
 * Abstract class representing a Hierarchical Deterministic (HD) wallet.
 */
export abstract class AbstractHDWallet<T extends NeuteredAddressInfo = NeuteredAddressInfo> {
    protected static _version: number = 1;

    protected static _coinType?: AllowedCoinType;

    // Map of addresses to address info
    protected _addresses: Map<string, NeuteredAddressInfo> = new Map();

    /**
     * Root node of the HD wallet.
     */
    protected _root: HDNodeWallet;

    protected provider?: Provider;

    /**
     * @param {HDNodeWallet} root - The root node of the HD wallet.
     * @param {Provider} [provider] - The provider for the HD wallet.
     */
    constructor(guard: any, root: HDNodeWallet, provider?: Provider) {
        assertPrivate(guard, _guard, 'AbstractHDWallet');
        this._root = root;
        this.provider = provider;
    }

    /**
     * Returns the parent path for a given coin type.
     *
     * @param {number} coinType - The coin type.
     * @returns {string} The parent path.
     */
    protected static parentPath(coinType: number): string {
        return `m/44'/${coinType}'`;
    }

    /**
     * Returns the coin type of the wallet.
     *
     * @returns {AllowedCoinType} The coin type.
     */
    protected coinType(): AllowedCoinType {
        return (this.constructor as typeof AbstractHDWallet)._coinType!;
    }

    /**
     * Returns the extended public key of the root node of the HD wallet.
     *
     * @returns {string} The extended public key.
     */
    get xPub(): string {
        return this._root.extendedKey;
    }

    // helper method to check if an address is valid for a given zone
    protected isValidAddressForZone(address: string, zone: Zone): boolean {
        const addressZone = getZoneForAddress(address);
        if (!addressZone) {
            return false;
        }
        const isCorrectShard = addressZone === zone;
        const isCorrectLedger = this.coinType() === 969 ? isQiAddress(address) : !isQiAddress(address);
        return isCorrectShard && isCorrectLedger;
    }

    /**
     * Gets the BIP44 change node for a given account and change flag.
     *
     * @param {number} account - The account number.
     * @param {boolean} change - Whether to get the change node.
     * @returns {HDNodeWallet} The change node.
     */
    protected _getChangeNode(account: number, change: boolean): HDNodeWallet {
        const changeIndex = change ? 1 : 0;
        return this._root.deriveChild(account + HARDENED_OFFSET).deriveChild(changeIndex);
    }

    /**
     * Gets the BIP44 address node for a given account, change flag, and address index.
     *
     * @param {number} account - The account number.
     * @param {boolean} change - Whether to get the change node.
     * @param {number} addressIndex - The address index.
     * @returns {HDNodeWallet} The address node.
     */
    protected _getAddressNode(account: number, change: boolean, addressIndex: number): HDNodeWallet {
        return this._getChangeNode(account, change).deriveChild(addressIndex);
    }

    /**
     * Derives the next valid address node for a specified account, starting index, and zone. The method ensures the
     * derived address belongs to the correct shard and ledger, as defined by the Quai blockchain specifications.
     *
     * @param {number} account - The account number from which to derive the address node.
     * @param {number} startingIndex - The index from which to start deriving addresses.
     * @param {Zone} zone - The zone (shard) for which the address should be valid.
     * @param {boolean} [isChange=false] - Whether to derive a change address. Default is `false`
     * @returns {HDNodeWallet} - The derived HD node wallet containing a valid address for the specified zone.
     * @throws {Error} If a valid address for the specified zone cannot be derived within the allowed attempts.
     */
    protected deriveNextAddressNode(
        account: number,
        startingIndex: number,
        zone: Zone,
        isChange: boolean = false,
    ): HDNodeWallet {
        const changeNode = this._getChangeNode(account, isChange);
        let addrIndex = startingIndex;
        let addressNode: HDNodeWallet;

        for (let attempts = 0; attempts < MAX_ADDRESS_DERIVATION_ATTEMPTS; attempts++) {
            addressNode = changeNode.deriveChild(addrIndex++);
            if (this.isValidAddressForZone(addressNode.address, zone)) {
                return addressNode;
            }
        }

        throw new Error(
            `Failed to derive a valid address for the zone ${zone} after ${MAX_ADDRESS_DERIVATION_ATTEMPTS} attempts.`,
        );
    }

    /**
     * Adds an address to the wallet for a given account and address index.
     *
     * @param {number} account - The account number to add the address to
     * @param {number} addressIndex - The index of the address to add
     * @returns {T | null} The address info object if successful, null otherwise
     */
    abstract addAddress(account: number, addressIndex: number): T | null;

    /**
     * Gets the next available address for a given account and zone.
     *
     * @param {number} account - The account number to get the next address for
     * @param {Zone} zone - The zone to get the next address in
     * @returns {Promise<T>} Promise that resolves to the next address info
     */
    abstract getNextAddress(account: number, zone: Zone): Promise<T>;

    /**
     * Synchronously gets the next available address for a given account and zone.
     *
     * @param {number} account - The account number to get the next address for
     * @param {Zone} zone - The zone to get the next address in
     * @returns {T} The next address info
     */
    abstract getNextAddressSync(account: number, zone: Zone): T;

    /**
     * Gets the address info for a given address string.
     *
     * @param {string} address - The address to get info for
     * @returns {T | null} The address info if found, null otherwise
     */
    abstract getAddressInfo(address: string): T | null;

    /**
     * Gets the private key for a given address.
     *
     * @param {string} address - The address to get the private key for
     * @returns {string} The private key as a hex string
     */
    abstract getPrivateKey(address: string): string;

    /**
     * Gets all addresses belonging to a specific zone.
     *
     * @param {Zone} zone - The zone to get addresses for
     * @returns {T[]} Array of address info objects in the zone
     */
    abstract getAddressesForZone(zone: Zone): T[];

    /**
     * Gets all addresses belonging to a specific account.
     *
     * @param {number} account - The account number to get addresses for
     * @returns {T[]} Array of address info objects in the account
     */
    abstract getAddressesForAccount(account: number): T[];

    /**
     * Finds the highest used index for a given account and zone.
     *
     * @param {T[] | undefined} addresses - Array of address info objects to search
     * @param {number} account - The account number to find the last index for
     * @param {Zone} zone - The zone to find the last index in
     * @returns {number} The highest used index, or -1 if none found
     * @protected
     */
    protected abstract _findLastUsedIndex(addresses: T[] | undefined, account: number, zone: Zone): number;

    /**
     * Abstract method to sign a message using the private key associated with the given address.
     *
     * @param {string} address - The address for which the message is to be signed.
     * @param {string | Uint8Array} message - The message to be signed, either as a string or Uint8Array.
     * @returns {Promise<string>} A promise that resolves to the signature of the message in hexadecimal string format.
     * @throws {Error} If the method is not implemented in the subclass.
     */
    abstract signMessage(address: string, message: string | Uint8Array): Promise<string>;

    /**
     * Abstract method to sign a transaction.
     *
     * @param {TransactionRequest} tx - The transaction request.
     * @returns {Promise<string>} A promise that resolves to the signed transaction.
     */
    abstract signTransaction(tx: TransactionRequest): Promise<string>;

    /**
     * Creates an instance of the HD wallet.
     *
     * @param {new (root: HDNodeWallet) => T} this - The constructor of the HD wallet.
     * @param {Mnemonic} mnemonic - The mnemonic.
     * @returns {T} The created instance.
     */
    protected static createInstance<T extends AbstractHDWallet>(
        this: new (guard: any, root: HDNodeWallet) => T,
        mnemonic: Mnemonic,
    ): T {
        const coinType = (this as any)._coinType;
        const root = HDNodeWallet.fromMnemonic(mnemonic, (this as any).parentPath(coinType));
        return new (this as any)(_guard, root);
    }

    /**
     * Creates an HD wallet from a mnemonic.
     *
     * @param {new (root: HDNodeWallet) => T} this - The constructor of the HD wallet.
     * @param {Mnemonic} mnemonic - The mnemonic.
     * @returns {T} The created instance.
     */
    static fromMnemonic<T extends AbstractHDWallet>(
        this: new (guard: any, root: HDNodeWallet) => T,
        mnemonic: Mnemonic,
    ): T {
        return (this as any).createInstance(mnemonic);
    }

    /**
     * Creates a random HD wallet.
     *
     * @param {new (root: HDNodeWallet) => T} this - The constructor of the HD wallet.
     * @param {string} [password] - The password.
     * @param {Wordlist} [wordlist] - The wordlist.
     * @returns {T} The created instance.
     */
    static createRandom<T extends AbstractHDWallet>(
        this: new (guard: any, root: HDNodeWallet) => T,
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

    /**
     * Creates an HD wallet from a phrase.
     *
     * @param {new (root: HDNodeWallet) => T} this - The constructor of the HD wallet.
     * @param {string} phrase - The phrase.
     * @param {string} [password] - The password.
     * @param {Wordlist} [wordlist] - The wordlist.
     * @returns {T} The created instance.
     */
    static fromPhrase<T extends AbstractHDWallet>(
        this: new (guard: any, root: HDNodeWallet) => T,
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

    /**
     * Connects the wallet to a provider.
     *
     * @param {Provider} provider - The provider.
     */
    public connect(provider: Provider): void {
        this.provider = provider;
    }

    /**
     * Validates the zone.
     *
     * @param {Zone} zone - The zone.
     * @throws {Error} If the zone is invalid.
     */
    protected validateZone(zone: Zone): void {
        if (!Object.values(Zone).includes(zone)) {
            throw new Error(`Invalid zone: ${zone}`);
        }
    }

    /**
     * Serializes the HD wallet state into a format suitable for storage or transmission.
     *
     * @returns {SerializedHDWallet} An object representing the serialized state of the HD wallet, including version,
     *   mnemonic phrase, coin type, and addresses.
     */
    public serialize(): SerializedHDWallet {
        return {
            version: (this.constructor as any)._version,
            phrase: this._root.mnemonic!.phrase,
            coinType: this.coinType(),
        };
    }

    /**
     * Deserializes a serialized HD wallet object and reconstructs the wallet instance. This method must be implemented
     * in the subclass.
     *
     * @param {SerializedHDWallet} _serialized - The serialized object representing the state of an HD wallet.
     * @returns {AbstractHDWallet} An instance of AbstractHDWallet.
     * @throws {Error} This method must be implemented in the subclass.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public static async deserialize(_serialized: SerializedHDWallet): Promise<AbstractHDWallet> {
        throw new Error('deserialize method must be implemented in the subclass');
    }

    /**
     * Validates an address info object, including basic properties and address derivation.
     *
     * @param {T} info - The address info to validate
     * @throws {Error} If validation fails
     * @protected
     */
    protected validateAddressInfo(info: T): void {
        // Basic property validation
        this.validateBaseAddressInfo(info);

        // Validate address derivation
        this.validateAddressDerivation(info);

        // Allow subclasses to add their own validation
        this.validateExtendedProperties(info);
    }

    /**
     * Validates the NeuteredAddressInfo object.
     *
     * @param {NeuteredAddressInfo} info - The NeuteredAddressInfo object to be validated.
     * @throws {Error} If the NeuteredAddressInfo object is invalid.
     * @protected
     */
    protected validateBaseAddressInfo(info: NeuteredAddressInfo): void {
        if (!/^(0x)?[0-9a-fA-F]{40}$/.test(info.address)) {
            throw new Error(
                `Invalid NeuteredAddressInfo: address must be a 40-character hexadecimal string prefixed with 0x: ${info.address}`,
            );
        }

        if (!/^0x[0-9a-fA-F]{66}$/.test(info.pubKey)) {
            throw new Error(
                `Invalid NeuteredAddressInfo: pubKey must be a 66-character hexadecimal string prefixed with 0x: ${info.pubKey}`,
            );
        }

        if (!Number.isInteger(info.account) || info.account < 0) {
            throw new Error(`Invalid NeuteredAddressInfo: account must be a non-negative integer: ${info.account}`);
        }

        if (!Number.isInteger(info.index) || info.index < 0) {
            throw new Error(`Invalid NeuteredAddressInfo: index must be a non-negative integer: ${info.index}`);
        }

        if (!Object.values(Zone).includes(info.zone)) {
            throw new Error(`Invalid NeuteredAddressInfo: zone '${info.zone}' is not a valid Zone`);
        }
    }

    /**
     * Validates that the address, pubKey and zone match what would be derived from the other properties.
     *
     * @param {T} info - The address info to validate
     * @throws {Error} If validation fails
     * @protected
     */
    protected abstract validateAddressDerivation(info: T): void;

    /**
     * Hook for subclasses to add their own validation logic. Base implementation does nothing.
     *
     * @param {T} _info - The address info to validate
     * @protected
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected validateExtendedProperties(_info: T): void {
        // Base implementation does nothing
    }

    /**
     * Validates the version and coinType of the serialized wallet.
     *
     * @param {SerializedHDWallet} serialized - The serialized wallet data to be validated.
     * @throws {Error} If the version or coinType of the serialized wallet does not match the expected values.
     * @protected
     * @static
     */
    protected static validateSerializedWallet(serialized: SerializedHDWallet): void {
        if (serialized.version !== (this as any)._version) {
            throw new Error(`Invalid version ${serialized.version} for wallet (expected ${(this as any)._version})`);
        }
        if (serialized.coinType !== (this as any)._coinType) {
            throw new Error(`Invalid coinType ${serialized.coinType} for wallet (expected ${(this as any)._coinType})`);
        }
    }
}
