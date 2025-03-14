import { AbstractQiWallet } from './abstract-qi-wallet.js';
import { AddressStatus, QiAddressInfo } from '../qi-hdwallet.js';
import { BIP44 } from '../bip44/bip44.js';
import { Zone } from '../../constants/index.js';
import { HDNodeWallet } from '../hdnodewallet.js';
import { getZoneForAddress } from '../../utils/index.js';
import { isQiAddress } from '../../address/index.js';

export class Bip44QiWallet extends AbstractQiWallet {
    private readonly bip44: BIP44;
    private readonly isChange: boolean;
    private static readonly DEFAULT_GAP_LIMIT = 5;

    constructor(bip44: BIP44, isChange: boolean) {
        super(Bip44QiWallet.DEFAULT_GAP_LIMIT);
        this.bip44 = bip44;
        this.isChange = isChange;
    }

    /**
     * Derives a new BIP44 address for a specific zone and account.
     *
     * @remarks
     * This method follows BIP-0044 derivation path m/44'/969'/account'/change/index where:
     *
     * - 969 is the coin type for Qi
     * - Account is the account index
     * - Change is 0 for external addresses and 1 for change addresses
     * - Index is incremented for each new address
     *
     * @param {Zone} zone - The zone to derive the address for
     * @param {number} [account=0] - The account index to use for derivation. Default is `0`
     * @returns {QiAddressInfo} Information about the newly derived address including:
     *
     *   - The derived address
     *   - Public key
     *   - Derivation index
     *   - Account number
     *   - Zone
     *   - Change flag
     *   - Status and other metadata
     */
    public deriveNewAddress(zone: Zone, account: number = 0): QiAddressInfo {
        const index = this.getLastDerivationIndex(zone, account) + 1;
        const hdNode = this.bip44.deriveNextAddressNode(this.coinType, account, index, zone, this.isChange);
        const newIndex = hdNode.index;
        this.saveLastDerivationIndex(zone, account, newIndex);
        const qiAddressInfo: QiAddressInfo = {
            address: hdNode.address,
            pubKey: hdNode.publicKey,
            index: newIndex,
            account,
            zone,
            change: this.isChange,
            status: AddressStatus.UNKNOWN,
            derivationPath: this.isChange ? 'BIP44:change' : 'BIP44:external',
            lastSyncedBlock: null,
        };
        this.saveQiAddressInfo(qiAddressInfo);
        return qiAddressInfo;
    }

    /**
     * Gets the HD node wallet for a specific account and address index.
     *
     * @remarks
     * This method retrieves the HD node wallet following the BIP-0044 derivation path m/44'/969'/account'/change/index
     * where:
     *
     * - 969 is the coin type for Qi
     * - Account is the account index
     * - Change is 0 for external addresses and 1 for change addresses
     * - Index is the address index
     *
     * @param {number} account - The account index to derive the node from
     * @param {number} index - The address index to derive the node from
     * @returns {HDNodeWallet} The derived HD node wallet containing the private key and address
     */
    public getAddressNode(account: number, index: number): HDNodeWallet {
        return this.bip44._getAddressNode(account, this.isChange, index);
    }

    /**
     * Adds a new address to the wallet at a specific account and index.
     *
     * @remarks
     * This method adds a new BIP-0044 address to the wallet by deriving it at the specified account and index. It
     * follows the derivation path m/44'/969'/account'/change/index where:
     *
     * - 969 is the coin type for Qi
     * - Account is the account index
     * - Change is 0 for external addresses and 1 for change addresses
     * - Index is the address index
     *
     * The method validates that:
     *
     * 1. The index is not already in use for the account
     * 2. The derived address has a valid zone
     * 3. The address is a valid Qi address
     *
     * @param {number} account - The account index to derive the address from
     * @param {number} addressIndex - The address index to derive the address at
     * @returns {QiAddressInfo} Information about the newly added address including:
     *
     *   - The derived address
     *   - Public key
     *   - Derivation index
     *   - Account number
     *   - Zone
     *   - Change flag
     *   - Status and other metadata
     *
     * @throws {Error} If the address index is already in use
     * @throws {Error} If unable to derive a valid zone for the address
     * @throws {Error} If the derived address is not a valid Qi address
     */
    public addAddress(account: number, addressIndex: number): QiAddressInfo {
        const derivationPath = this.isChange ? 'BIP44:change' : 'BIP44:external';
        // check if the index is already in use
        if (this.getAddressesForAccount(account).some((addr) => addr.index === addressIndex)) {
            throw new Error(
                `Address index ${addressIndex} already exists in wallet under account ${account} and derivation path ${derivationPath}`,
            );
        }

        const addressNode = this.getAddressNode(account, addressIndex);
        const zone = getZoneForAddress(addressNode.address);
        if (!zone) {
            throw new Error(`Failed to derive a Qi valid address zone for the index ${addressIndex}`);
        }

        if (!isQiAddress(addressNode.address)) {
            throw new Error(`Address ${addressNode.address} is not a valid Qi address`);
        }

        const qiAddressInfo: QiAddressInfo = {
            address: addressNode.address,
            pubKey: addressNode.publicKey,
            index: addressIndex,
            account,
            zone,
            change: this.isChange,
            status: AddressStatus.UNKNOWN,
            derivationPath: derivationPath,
            lastSyncedBlock: null,
        };
        this.saveQiAddressInfo(qiAddressInfo);
        this.saveLastDerivationIndex(zone, account, addressIndex);
        return qiAddressInfo;
    }
}
