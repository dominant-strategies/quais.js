import { HDNodeWallet } from '../hdnodewallet.js';
import { AllowedCoinType, Zone } from '../../constants/index.js';
import { isValidAddressForZone } from '../utils.js';

/**
 * Constant to represent the hardened offset for BIP44 derivation.
 */
export const HARDENED_OFFSET = 2 ** 31;

/**
 * Constant to represent the maximum attempt to derive an address.
 */
export const MAX_ADDRESS_DERIVATION_ATTEMPTS = 10000000;

export class BIP44 {
    protected _coinType: AllowedCoinType;

    /**
     * Root node of the HD wallet.
     */
    protected _root: HDNodeWallet;

    constructor(root: HDNodeWallet, coinType: AllowedCoinType) {
        this._root = root;
        this._coinType = coinType;
    }

    /**
     * Returns the coin type of the wallet.
     *
     * @returns {AllowedCoinType} The coin type.
     */
    protected coinType(): AllowedCoinType {
        return this._coinType!;
    }

    /**
     * Returns the extended public key of the root node of the HD wallet.
     *
     * @returns {string} The extended public key.
     */
    get xPub(): string {
        return this._root.extendedKey;
    }

    /**
     * Returns the parent path for a given coin type.
     */
    protected parentPath(): string {
        if (!this._coinType) {
            throw new Error('Coin type not set');
        }
        return `m/44'/${this._coinType}'`;
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
    public _getAddressNode(account: number, change: boolean, addressIndex: number): HDNodeWallet {
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
    public deriveNextAddressNode(
        coinType: AllowedCoinType,
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
            if (isValidAddressForZone(this.coinType(), addressNode.address, zone)) {
                return addressNode;
            }
        }

        throw new Error(
            `Failed to derive a valid address for the zone ${zone} after ${MAX_ADDRESS_DERIVATION_ATTEMPTS} attempts.`,
        );
    }

    /**
     * Derives the next valid address node for a specified account, starting index, and zone using React Native fast
     * crypto. This async version uses react-native-fast-crypto for secp256k1 operations. The method ensures the derived
     * address belongs to the correct shard and ledger, as defined by the Quai blockchain specifications.
     *
     * @param {number} account - The account number from which to derive the address node.
     * @param {number} startingIndex - The index from which to start deriving addresses.
     * @param {Zone} zone - The zone (shard) for which the address should be valid.
     * @param {boolean} [isChange=false] - Whether to derive a change address. Default is `false`
     * @returns {Promise<HDNodeWallet>} - The derived HD node wallet containing a valid address for the specified zone.
     * @throws {Error} If a valid address for the specified zone cannot be derived within the allowed attempts.
     */
    public async deriveNextAddressNodeReactNativeAsync(
        account: number,
        startingIndex: number,
        zone: Zone,
        isChange: boolean = false,
    ): Promise<HDNodeWallet> {
        const changeNode = this._getChangeNode(account, isChange);
        let addrIndex = startingIndex;
        let addressNode: HDNodeWallet;

        for (let attempts = 0; attempts < MAX_ADDRESS_DERIVATION_ATTEMPTS; attempts++) {
            addressNode = await changeNode.deriveChildReactNative(addrIndex++);
            if (isValidAddressForZone(this.coinType(), addressNode.address, zone)) {
                return addressNode;
            }
        }

        throw new Error(
            `Failed to derive a valid address for the zone ${zone} after ${MAX_ADDRESS_DERIVATION_ATTEMPTS} attempts.`,
        );
    }
}
