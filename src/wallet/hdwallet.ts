import { HDNodeWallet } from './hdnodewallet.js';
import { Mnemonic } from './mnemonic.js';
import { LangEn } from '../wordlists/lang-en.js';
import type { Wordlist } from '../wordlists/index.js';
import { randomBytes } from '../crypto/index.js';
import { getZoneForAddress } from '../utils/index.js';
import { isQiAddress } from '../address/index.js';
import { Zone } from '../constants/index.js';
import { TransactionRequest, Provider, TransactionResponse } from '../providers/index.js';
import { AllowedCoinType } from '../constants/index.js';

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

    /**
     * Derives the next valid address node for a specified account, starting index, and zone. The method ensures the
     * derived address belongs to the correct shard and ledger, as defined by the Quai blockchain specifications.
     *
     * @param {number} account - The account number from which to derive the address node.
     * @param {number} startingIndex - The index from which to start deriving addresses.
     * @param {Zone} zone - The zone (shard) for which the address should be valid.
     * @param {boolean} [isChange=false] - Whether to derive a change address (default is false). Default is `false`
     *   Default is `false` Default is `false`
     *
     * @returns {HDNodeWallet} - The derived HD node wallet containing a valid address for the specified zone.
     * @throws {Error} If a valid address for the specified zone cannot be derived within the allowed attempts.
     */
    protected deriveNextAddressNode(
        account: number,
        startingIndex: number,
        zone: Zone,
        isChange: boolean = false,
    ): HDNodeWallet {
        const changeIndex = isChange ? 1 : 0;
        const changeNode = this._root.deriveChild(account).deriveChild(changeIndex);

        let addrIndex = startingIndex;
        let addressNode: HDNodeWallet;

        const isValidAddressForZone = (address: string): boolean => {
            const addressZone = getZoneForAddress(address);
            if (!addressZone) {
                return false;
            }
            const isCorrectShard = addressZone === zone;
            const isCorrectLedger = this.coinType() === 969 ? isQiAddress(address) : !isQiAddress(address);
            return isCorrectShard && isCorrectLedger;
        };

        for (let attempts = 0; attempts < MAX_ADDRESS_DERIVATION_ATTEMPTS; attempts++) {
            addressNode = changeNode.deriveChild(addrIndex++);
            if (isValidAddressForZone(addressNode.address)) {
                return addressNode;
            }
        }

        throw new Error(
            `Failed to derive a valid address for the zone ${zone} after ${MAX_ADDRESS_DERIVATION_ATTEMPTS} attempts.`,
        );
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
        // check if address already exists for the index
        this._addresses.forEach((addressInfo) => {
            if (addressInfo.index === addressIndex) {
                throw new Error(`Address for index ${addressIndex} already exists`);
            }
        });

        // derive the address node and validate the zone
        const changeIndex = isChange ? 1 : 0;
        const addressNode = this._root.deriveChild(account).deriveChild(changeIndex).deriveChild(addressIndex);
        const zone = getZoneForAddress(addressNode.address);
        if (!zone) {
            throw new Error(`Failed to derive a valid address zone for the index ${addressIndex}`);
        }

        return this.createAndStoreAddressInfo(addressNode, account, zone, isChange, addressMap);
    }

    /**
     * Retrieves the next address for the specified account and zone.
     *
     * @param {number} account - The index of the account for which to retrieve the next address.
     * @param {Zone} zone - The zone in which to retrieve the next address.
     *
     * @returns {NeuteredAddressInfo} The next neutered address information.
     */
    public getNextAddress(account: number, zone: Zone): NeuteredAddressInfo {
        return this._getNextAddress(account, zone, false, this._addresses);
    }

    /**
     * Derives and returns the next address information for the specified account and zone.
     *
     * @param {number} accountIndex - The index of the account for which the address is being generated.
     * @param {Zone} zone - The zone in which the address is to be used.
     * @param {boolean} isChange - A flag indicating whether the address is a change address.
     * @param {Map<string, NeuteredAddressInfo>} addressMap - A map storing the neutered address information.
     *
     * @returns {NeuteredAddressInfo} The derived neutered address information.
     * @throws {Error} If the zone is invalid.
     */
    protected _getNextAddress(
        accountIndex: number,
        zone: Zone,
        isChange: boolean,
        addressMap: Map<string, NeuteredAddressInfo>,
    ): NeuteredAddressInfo {
        this.validateZone(zone);
        const lastIndex = this.getLastAddressIndex(addressMap, zone, accountIndex, isChange);
        const addressNode = this.deriveNextAddressNode(accountIndex, lastIndex + 1, zone, isChange);
        return this.createAndStoreAddressInfo(addressNode, accountIndex, zone, isChange, addressMap);
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

    /**
     * Derives and returns the Hierarchical Deterministic (HD) node wallet associated with a given address.
     *
     * This method fetches the account and address information from the wallet's internal storage, derives the
     * appropriate change node based on whether the address is a change address, and further derives the final HD node
     * using the address index.
     *
     * @param {string} addr - The address for which to derive the HD node.
     *
     * @returns {HDNodeWallet} - The derived HD node wallet corresponding to the given address.
     * @throws {Error} If the given address is not known to the wallet.
     * @throws {Error} If the account associated with the address is not found.
     */
    protected _getHDNodeForAddress(addr: string): HDNodeWallet {
        const addressInfo = this._addresses.get(addr);
        if (!addressInfo) {
            throw new Error(`Address ${addr} is not known to this wallet`);
        }

        const changeIndex = addressInfo.change ? 1 : 0;
        return this._root.deriveChild(addressInfo.account).deriveChild(changeIndex).deriveChild(addressInfo.index);
    }

    /**
     * Abstract method to sign a message using the private key associated with the given address.
     *
     * @param {string} address - The address for which the message is to be signed.
     * @param {string | Uint8Array} message - The message to be signed, either as a string or Uint8Array.
     *
     * @returns {Promise<string>} A promise that resolves to the signature of the message in hexadecimal string format.
     * @throws {Error} If the method is not implemented in the subclass.
     */
    abstract signMessage(address: string, message: string | Uint8Array): Promise<string>;

    /**
     * Serializes the HD wallet state into a format suitable for storage or transmission.
     *
     * @returns {SerializedHDWallet} An object representing the serialized state of the HD wallet, including version,
     *   mnemonic phrase, coin type, and addresses.
     */
    public serialize(): SerializedHDWallet {
        const addresses = Array.from(this._addresses.values());
        return {
            version: (this.constructor as any)._version,
            phrase: this._root.mnemonic!.phrase,
            coinType: this.coinType(),
            addresses: addresses,
        };
    }

    /**
     * Deserializes a serialized HD wallet object and reconstructs the wallet instance. This method must be implemented
     * in the subclass.
     *
     * @param {SerializedHDWallet} _serialized - The serialized object representing the state of an HD wallet.
     *
     * @returns {AbstractHDWallet} An instance of AbstractHDWallet.
     * @throws {Error} This method must be implemented in the subclass.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public static async deserialize(_serialized: SerializedHDWallet): Promise<AbstractHDWallet> {
        throw new Error('deserialize method must be implemented in the subclass');
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

    /**
     * Imports addresses from a serialized wallet into the addresses map. Before adding the addresses, a validation is
     * performed to ensure the address, public key, and zone match the expected values.
     *
     * @param {Map<string, NeuteredAddressInfo>} addressMap - The map where the addresses will be imported.
     * @param {NeuteredAddressInfo[]} addresses - The array of addresses to be imported, each containing account, index,
     *   change, address, pubKey, and zone information.
     * @throws {Error} If there is a mismatch between the expected and actual address, public key, or zone.
     * @protected
     */
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

    /**
     * Retrieves the highest address index from the given address map for a specified zone, account, and change type.
     *
     * This method filters the address map based on the provided zone, account, and change type, then determines the
     * maximum address index from the filtered addresses.
     *
     * @param {Map<string, NeuteredAddressInfo>} addressMap - The map containing address information, where the key is
     *   an address string and the value is a NeuteredAddressInfo object.
     * @param {Zone} zone - The specific zone to filter the addresses by.
     * @param {number} account - The account number to filter the addresses by.
     * @param {boolean} isChange - A boolean indicating whether to filter for change addresses (true) or receiving
     *   addresses (false).
     *
     * @returns {number} - The highest address index for the specified criteria, or -1 if no addresses match.
     * @protected
     */
    protected getLastAddressIndex(
        addressMap: Map<string, NeuteredAddressInfo>,
        zone: Zone,
        account: number,
        isChange: boolean,
    ): number {
        const addresses = Array.from(addressMap.values()).filter(
            (addressInfo) =>
                addressInfo.account === account && addressInfo.zone === zone && addressInfo.change === isChange,
        );
        return addresses.reduce((maxIndex, addressInfo) => Math.max(maxIndex, addressInfo.index), -1);
    }

    /**
     * Creates and stores address information in the address map for a specified account, zone, and change type.
     *
     * This method constructs a NeuteredAddressInfo object using the provided HDNodeWallet and other parameters, then
     * stores this information in the provided address map.
     *
     * @param {HDNodeWallet} addressNode - The HDNodeWallet object containing the address and public key information.
     * @param {number} account - The account number to associate with the address.
     * @param {Zone} zone - The specific zone to associate with the address.
     * @param {boolean} isChange - A boolean indicating whether the address is a change address (true) or a receiving
     *   address (false).
     * @param {Map<string, NeuteredAddressInfo>} addressMap - The map to store the created NeuteredAddressInfo, with the
     *   address as the key.
     *
     * @returns {NeuteredAddressInfo} - The created NeuteredAddressInfo object.
     * @protected
     */
    protected createAndStoreAddressInfo(
        addressNode: HDNodeWallet,
        account: number,
        zone: Zone,
        isChange: boolean,
        addressMap: Map<string, NeuteredAddressInfo>,
    ): NeuteredAddressInfo {
        const neuteredAddressInfo: NeuteredAddressInfo = {
            pubKey: addressNode.publicKey,
            address: addressNode.address,
            account,
            index: addressNode.index,
            change: isChange,
            zone,
        };

        addressMap.set(neuteredAddressInfo.address, neuteredAddressInfo);

        return neuteredAddressInfo;
    }
}
