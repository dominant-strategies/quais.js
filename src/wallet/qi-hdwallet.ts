/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
import {
    AbstractHDWallet,
    NeuteredAddressInfo,
    SerializedHDWallet,
    _guard,
    MAX_ADDRESS_DERIVATION_ATTEMPTS,
    HARDENED_OFFSET,
} from './hdwallet.js';
import { HDNodeWallet } from './hdnodewallet.js';
import { QiTransactionRequest, Provider, TransactionResponse, Block } from '../providers/index.js';
import { computeAddress, isQiAddress } from '../address/index.js';
import { getBytes, getZoneForAddress, hexlify, isHexString, toQuantity } from '../utils/index.js';
import {
    TransactionLike,
    QiTransaction,
    TxInput,
    FewestCoinSelector,
    AggregateCoinSelector,
} from '../transaction/index.js';
import { MuSigFactory } from '@brandonblack/musig';
import { schnorr } from '@noble/curves/secp256k1';
import { keccak256, musigCrypto, SigningKey } from '../crypto/index.js';
import { Outpoint, OutpointDeltas, UTXO, denominations } from '../transaction/utxo.js';
import { AllowedCoinType, toShard, Zone } from '../constants/index.js';
import { Mnemonic } from './mnemonic.js';
import { PaymentCodePrivate, PaymentCodePublic, PC_VERSION, validatePaymentCode } from './payment-codes.js';
import { BIP32Factory } from './bip32/bip32.js';
import { bs58check } from './bip32/crypto.js';
import { type BIP32API, HDNodeBIP32Adapter } from './bip32/types.js';
import ecc from '@bitcoinerlab/secp256k1';
import { SelectedCoinsResult } from '../transaction/abstract-coinselector.js';
import { QiPerformActionTransaction } from '../providers/abstract-provider.js';
import { ConversionCoinSelector } from '../transaction/coinselector-conversion.js';
import { toUtf8Bytes } from '../quais.js';

/**
 * @property {Outpoint} outpoint - The outpoint object.
 * @property {string} address - The address associated with the outpoint.
 * @property {Zone} zone - The zone of the outpoint.
 * @property {number} [account] - The account number (optional).
 * @interface OutpointInfo
 */
export interface OutpointInfo {
    outpoint: Outpoint;
    address: string;
    zone: Zone;
    account?: number;
}

/**
 * Enum representing the status of an address in the wallet.
 *
 * @enum {string}
 */
export enum AddressStatus {
    USED = 'USED',
    UNUSED = 'UNUSED',
    ATTEMPTED_USE = 'ATTEMPTED_USE',
    UNKNOWN = 'UNKNOWN',
}

/**
 * Type representing the derivation path of an address in the wallet.
 *
 * @type {string}
 */
type DerivationPath = 'BIP44:external' | 'BIP44:change' | string; // string for payment codes

export type LastSyncedBlock = { hash: string; number: number };

/**
 * Interface representing an address in the Qi HD wallet.
 *
 * @extends NeuteredAddressInfo
 */
export interface QiAddressInfo extends NeuteredAddressInfo {
    change: boolean;
    status: AddressStatus;
    derivationPath: DerivationPath;
    lastSyncedBlock: LastSyncedBlock | null;
}

/**
 * @extends SerializedHDWallet
 * @property {OutpointInfo[]} outpoints - Array of outpoint information.
 * @property {QiAddressInfo[]} addresses - Array of Qi address information.
 * @property {Record<string, QiAddressInfo[]>} senderPaymentCodeInfo - Map of payment code to array ofQi address
 *   information.
 * @interface SerializedQiHDWallet
 */
export interface SerializedQiHDWallet extends SerializedHDWallet {
    addresses: Array<QiAddressInfo>;
    senderPaymentCodeInfo: { [key: string]: QiAddressInfo[] };
}

type AddressUsageCallback = (address: string) => Promise<boolean>;
type OutpointDeltaResponse = { [address: string]: Outpoint[] };
type OutpointsCallback = (outpoints: OutpointDeltaResponse) => Promise<void>;

/**
 * Current known issues:
 *
 * - When generating send addresses we are not checking if the address has already been used before
 * - When syncing is seems like we are adding way too many change addresses
 * - Bip44 external and change address maps also have gap addresses in them
 * - It is unclear if we have checked if addresses have been used and if they are used
 * - We should always check all addresses that were previously included in a transaction to see if they have been used
 */

/**
 * The Qi HD wallet is a BIP44-compliant hierarchical deterministic wallet used for managing a set of addresses in the
 * Qi ledger. This is wallet implementation is the primary way to interact with the Qi UTXO ledger on the Quai network.
 *
 * The Qi HD wallet supports:
 *
 * - Adding accounts to the wallet heierchy
 * - Generating addresses for a specific account in any {@link Zone}
 * - Signing and sending transactions for any address in the wallet
 * - Serializing the wallet to JSON and deserializing it back to a wallet instance.
 *
 * @category Wallet
 * @example
 *
 * ```ts
 * import { QiHDWallet, Zone } from 'quais';
 * import { Outpoint } from '../../lib/commonjs/transaction/utxo';
 *
 * const wallet = new QiHDWallet();
 * const cyrpus1Address = await wallet.getNextAddress(0, Zone.Cyrpus1); // get the first address in the Cyrpus1 zone
 * await wallet.sendTransaction({ txInputs: [...], txOutputs: [...] }); // send a transaction
 * const serializedWallet = wallet.serialize(); // serialize current (account/address) state of the wallet
 * .
 * .
 * .
 * const deserializedWallet = QiHDWallet.deserialize(serializedWallet); // create a new wallet instance from the serialized data
 * ```
 */
export class QiHDWallet extends AbstractHDWallet<QiAddressInfo> {
    /**
     * @ignore
     * @type {number}
     */
    protected static _version: number = 1;

    /**
     * @ignore
     * @type {number}
     */
    protected static _GAP_LIMIT: number = 5;

    /**
     * @ignore
     * @type {AllowedCoinType}
     */
    protected static _coinType: AllowedCoinType = 969;

    /**
     * @ignore
     * @type {string}
     */
    private static readonly PRIVATE_KEYS_PATH: string = 'privateKeys' as const;

    /**
     * A map containing address information for all addresses known to the wallet. This includes:
     *
     * - BIP44 derived addresses (external)
     * - BIP44 derived change addresses
     * - BIP47 payment code derived addresses for receiving funds
     *
     * The key is the derivation path or payment code, and the value is an array of QiAddressInfo objects.
     *
     * @private
     * @type {Map<DerivationPath, QiAddressInfo[]>}
     */
    private _addressesMap: Map<DerivationPath, QiAddressInfo[]> = new Map();

    /**
     * Array of outpoint information.
     *
     * @ignore
     * @type {OutpointInfo[]}
     */
    protected _availableOutpoints: Map<string, OutpointInfo> = new Map();

    /**
     * @ignore
     * @type {AddressUsageCallback}
     */
    protected _addressUseChecker: AddressUsageCallback | undefined;

    /**
     * A map containing address information for sending funds to counterparties using BIP47 payment codes.
     *
     * @remarks
     * The key is the receiver's payment code, and the value is an array of QiAddressInfo objects. These addresses are
     * derived from the receiver's payment code and are used only for sending funds. They are not part of the set of
     * addresses that this wallet can control or spend from. This map is used to keep track of addresses generated for
     * each payment channel to ensure proper address rotation and avoid address reuse when sending funds.
     * @private
     * @type {Map<string, QiAddressInfo[]>}
     */
    private _paymentCodeSendAddressMap: Map<string, QiAddressInfo[]> = new Map();

    /**
     * @ignore
     * @param {HDNodeWallet} root - The root HDNodeWallet.
     * @param {Provider} [provider] - The provider (optional).
     */
    constructor(guard: any, root: HDNodeWallet, provider?: Provider) {
        super(guard, root, provider);
        this._addressesMap.set('BIP44:external', []);
        this._addressesMap.set('BIP44:change', []);
        this._addressesMap.set(QiHDWallet.PRIVATE_KEYS_PATH, []);
    }

    /**
     * Gets the payment codes for all open channels.
     *
     * @returns {string[]} The payment codes for all open channels.
     */
    get openChannels(): string[] {
        return Array.from(this._addressesMap.keys()).filter(
            (key) => !key.startsWith('BIP44:') && key !== QiHDWallet.PRIVATE_KEYS_PATH,
        );
    }

    /**
     * Sets the address use checker. The provided callback function should accept an address as input and return a
     * boolean indicating whether the address is in use. If the callback returns true, the address is considered used
     * and if it returns false, the address is considered unused.
     *
     * @param {AddressUsageCallback} checker - The address use checker.
     */
    public setAddressUseChecker(checker: AddressUsageCallback): void {
        this._addressUseChecker = checker;
    }

    /**
     * Finds the last used index in an array of QiAddressInfo objects. If no index is found, returns -1.
     *
     * @param {QiAddressInfo[]} addresses - The array of QiAddressInfo objects.
     * @returns {number} The last used index.
     */
    protected _findLastUsedIndex(addresses: QiAddressInfo[] | undefined, account: number, zone: Zone): number {
        if (!addresses) return -1;
        return (
            addresses
                .filter((addressInfo) => addressInfo.account === account && addressInfo.zone === zone)
                .reduce((maxIndex, addressInfo) => Math.max(maxIndex, addressInfo.index), -1) || -1
        );
    }

    /**
     * Derives the next Qi BIP 44 address for the specified account and zone.
     *
     * @param {number} account - The account number.
     * @param {Zone} zone - The zone.
     * @param {boolean} isChange - Whether to derive a change address.
     * @returns {QiAddressInfo} The next Qi address information.
     */
    private _getNextQiAddress(account: number, zone: Zone, isChange: boolean): QiAddressInfo {
        const derivationPath = isChange ? 'BIP44:change' : 'BIP44:external';
        const addresses = this._addressesMap.get(derivationPath) || [];

        const lastIndex = this._findLastUsedIndex(addresses, account, zone);
        const addressNode = this.deriveNextAddressNode(account, lastIndex + 1, zone, isChange);
        const newAddressInfo = this._createAndStoreQiAddressInfo(addressNode, account, zone, isChange);

        const privateKeysArray = this._addressesMap.get(QiHDWallet.PRIVATE_KEYS_PATH) || [];
        const existingPrivateKeyIndex = privateKeysArray.findIndex((info) => info.address === newAddressInfo.address);

        if (existingPrivateKeyIndex !== -1) {
            // Update the newAddressInfo directly with the status and last synced block from the private key address
            const pkAddressInfo = privateKeysArray[existingPrivateKeyIndex];
            newAddressInfo.status = pkAddressInfo.status;
            newAddressInfo.lastSyncedBlock = pkAddressInfo.lastSyncedBlock;

            // Remove the address from the privateKeysArray
            privateKeysArray.splice(existingPrivateKeyIndex, 1);
            this._addressesMap.set(QiHDWallet.PRIVATE_KEYS_PATH, privateKeysArray);
        }

        return newAddressInfo;
    }

    private _createAndStoreQiAddressInfo(
        addressNode: HDNodeWallet,
        account: number,
        zone: Zone,
        isChange: boolean,
    ): QiAddressInfo {
        const derivationPath = isChange ? 'BIP44:change' : 'BIP44:external';
        const qiAddressInfo: QiAddressInfo = {
            zone,
            account,
            derivationPath,
            address: addressNode.address,
            pubKey: addressNode.publicKey,
            index: addressNode.index,
            change: isChange,
            status: AddressStatus.UNKNOWN,
            lastSyncedBlock: null,
        };

        this._addressesMap.get(derivationPath)!.push(qiAddressInfo); // _addressesMap is initialized within the constructor
        return qiAddressInfo;
    }

    /**
     * Promise that resolves to the next address for the specified account and zone.
     *
     * @param {number} account - The account number.
     * @param {Zone} zone - The zone.
     * @returns {Promise<QiAddressInfo>} The next Qi address information.
     */
    public async getNextAddress(account: number, zone: Zone): Promise<QiAddressInfo> {
        return Promise.resolve(this.getNextAddressSync(account, zone));
    }

    /**
     * Synchronously retrieves the next address for the specified account and zone.
     *
     * @param {number} account - The account number.
     * @param {Zone} zone - The zone.
     * @returns {QiAddressInfo} The next Qi address information.
     */
    public getNextAddressSync(account: number, zone: Zone): QiAddressInfo {
        return this._getNextQiAddress(account, zone, false);
    }

    /**
     * Promise that resolves to the next change address for the specified account and zone.
     *
     * @param {number} account - The index of the account for which to retrieve the next change address.
     * @param {Zone} zone - The zone in which to retrieve the next change address.
     * @returns {Promise<NeuteredAddressInfo>} The next change neutered address information.
     */
    public async getNextChangeAddress(account: number, zone: Zone): Promise<QiAddressInfo> {
        return Promise.resolve(this.getNextChangeAddressSync(account, zone));
    }

    /**
     * Synchronously retrieves the next change address for the specified account and zone.
     *
     * @param {number} account - The index of the account for which to retrieve the next change address.
     * @param {Zone} zone - The zone in which to retrieve the next change address.
     * @returns {NeuteredAddressInfo} The next change neutered address information.
     */
    public getNextChangeAddressSync(account: number, zone: Zone): QiAddressInfo {
        return this._getNextQiAddress(account, zone, true);
    }

    /**
     * Imports an array of outpoints.
     *
     * @param {OutpointInfo[]} outpoints - The outpoints to import.
     */
    public importOutpoints(outpoints: OutpointInfo[]): void {
        this.validateOutpointInfo(outpoints);

        for (const outpoint of outpoints) {
            const key = `${outpoint.outpoint.txhash}:${outpoint.outpoint.index}`;
            if (!this._availableOutpoints.has(key)) {
                this._availableOutpoints.set(key, outpoint);
            }
        }
    }

    /**
     * Gets the outpoints for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {OutpointInfo[]} The outpoints for the zone.
     */
    public getOutpoints(zone: Zone): OutpointInfo[] {
        this.validateZone(zone);
        return Array.from(this._availableOutpoints.values()).filter((outpoint) => outpoint.zone === zone);
    }

    /**
     * Signs a Qi transaction and returns the serialized transaction.
     *
     * @param {QiTransactionRequest} tx - The transaction to sign.
     * @returns {Promise<string>} The serialized transaction.
     * @throws {Error} If the UTXO transaction is invalid.
     */
    public async signTransaction(tx: QiTransactionRequest): Promise<string> {
        const txobj = QiTransaction.from(<TransactionLike>tx);
        if (!txobj.txInputs || txobj.txInputs.length == 0 || !txobj.txOutputs)
            throw new Error('Invalid UTXO transaction, missing inputs or outputs');

        const hash = getBytes(keccak256(txobj.unsignedSerialized));

        let signature: string;
        if (txobj.txInputs.length === 1) {
            signature = this.createSchnorrSignature(txobj.txInputs[0], hash);
        } else {
            signature = this.createMuSigSignature(txobj, hash);
        }
        txobj.signature = signature;
        return txobj.serialized;
    }

    /**
     * Locates the address information for the given address, searching through standard addresses, change addresses,
     * and payment channel addresses.
     *
     * @param {string} address - The address to locate.
     * @returns {QiAddressInfo | null} The address info or null if not found.
     */
    public locateAddressInfo(address: string): QiAddressInfo | null {
        for (const [, addressInfos] of this._addressesMap.entries()) {
            const addressInfo = addressInfos.find((info) => info.address === address);
            if (addressInfo) {
                return addressInfo;
            }
        }
        return null;
    }

    /**
     * Gets the total balance for the specified zone, including locked UTXOs.
     *
     * @param {Zone} zone - The zone to get the balance for.
     * @param {number} [blockNumber] - The block number to use for the lock check.
     * @param {boolean} useAvailableOutpoints - Whether to use available outpoints to calculate the balance.
     * @returns {Promise<bigint>} The total balance for the zone.
     */
    public async getBalanceForZone(
        zone: Zone,
        blockNumber?: number,
        useAvailableOutpoints: boolean = false,
    ): Promise<bigint> {
        if (!this.provider) throw new Error('Provider is not set');
        this.validateZone(zone);
        if (!blockNumber && useAvailableOutpoints) {
            blockNumber = await this.provider.getBlockNumber(toShard(zone));
        }

        return (
            (await this.getSpendableBalanceForZone(zone, blockNumber, useAvailableOutpoints)) +
            (await this.getLockedBalanceForZone(zone, blockNumber, useAvailableOutpoints))
        );
    }

    /**
     * Gets the **spendable** balance for the specified zone by calling {@link getBalance} for all known addresses in the
     * zone.
     *
     * @param {Zone} zone - The zone to get the balance for.
     * @param {boolean} useAvailableOutpoints - Whether to use available outpoints to calculate the balance.
     * @returns {bigint} The spendable balance for the zone.
     */
    public async getSpendableBalanceForZone(
        zone: Zone,
        blockNumber?: number,
        useAvailableOutpoints: boolean = false,
    ): Promise<bigint> {
        if (!this.provider) throw new Error('Provider is not set');
        this.validateZone(zone);

        if (useAvailableOutpoints) {
            if (!blockNumber) {
                blockNumber = await this.provider.getBlockNumber(toShard(zone));
            }
            return this._calculateAvailableOutpointSpendableBalanceForZone(zone, blockNumber);
        }
        return this._fetchSpendableBalanceForZone(zone);
    }

    /**
     * Gets the **locked** balance for the specified zone by calling {@link getLockedBalance} for all known addresses in
     * the zone.
     *
     * @param {Zone} zone - The zone to get the balance for.
     * @param {boolean} useAvailableOutpoints - Whether to use available outpoints to calculate the balance.
     * @returns {bigint} The locked balance for the zone.
     */
    public async getLockedBalanceForZone(
        zone: Zone,
        blockNumber?: number,
        useAvailableOutpoints: boolean = false,
    ): Promise<bigint> {
        if (!this.provider) throw new Error('Provider is not set');
        this.validateZone(zone);

        if (useAvailableOutpoints) {
            if (!blockNumber) {
                blockNumber = await this.provider.getBlockNumber(toShard(zone));
            }
            return this._calculateAvailableOutpointLockedBalanceForZone(zone, blockNumber);
        }
        return this._fetchLockedBalanceForZone(zone);
    }

    /**
     * Gets the spendable balance for the specified zone by calling {@link getBalance} for all known addresses in the
     * zone.
     *
     * @param {Zone} zone - The zone to get the spendable balance for.
     * @returns {bigint} The spendable balance for the zone.
     */
    private async _fetchSpendableBalanceForZone(zone: Zone): Promise<bigint> {
        const balanceMethod = async (address: string) => this.provider?.getBalance(address, 'latest') || BigInt(0);
        return this._fetchBalanceForZone(zone, balanceMethod);
    }

    /**
     * Gets the locked balance for the specified zone by calling {@link getLockedBalance} for all known addresses in the
     * zone.
     *
     * @param {Zone} zone - The zone to get the locked balance for.
     * @returns {bigint} The locked balance for the zone.
     */
    private async _fetchLockedBalanceForZone(zone: Zone): Promise<bigint> {
        const balanceMethod = async (address: string) => this.provider?.getLockedBalance(address) || BigInt(0);
        return this._fetchBalanceForZone(zone, balanceMethod);
    }

    /**
     * Fetches the balance for the specified zone by calling the provided balance method for all known addresses in the
     * zone.
     *
     * @param {Zone} zone - The zone to get the balance for.
     * @param {Function} balanceMethod - The method to call to get the balance for each address.
     * @returns {Promise<bigint>} The balance for the zone.
     */
    private async _fetchBalanceForZone(
        zone: Zone,
        balanceMethod: (address: string) => Promise<bigint>,
    ): Promise<bigint> {
        const allAddresses = Array.from(this._addressesMap.values())
            .flat()
            .filter((address) => address.zone === zone);
        const allBalances = await Promise.all(
            allAddresses.map((address) => balanceMethod(address.address) ?? BigInt(0)),
        );
        return allBalances.reduce((total, balance) => BigInt(total) + BigInt(balance), BigInt(0));
    }

    /**
     * Gets the spendable balance for the specified zone using the available outpoints.
     *
     * @param {Zone} zone - The zone to get the spendable balance for.
     * @param {number} [blockNumber] - The block number to use for the lock check.
     * @returns {bigint} The spendable balance for the zone.
     */
    private async _calculateAvailableOutpointSpendableBalanceForZone(
        zone: Zone,
        blockNumber?: number,
    ): Promise<bigint> {
        return this.getOutpoints(zone)
            .filter((utxo) => utxo.outpoint.lock === 0 || utxo.outpoint.lock! < blockNumber!)
            .reduce((total, utxo) => {
                const denominationValue = denominations[utxo.outpoint.denomination];
                return total + denominationValue;
            }, BigInt(0));
    }

    /**
     * Gets the locked balance for the specified zone using the available outpoints.
     *
     * @param {Zone} zone - The zone to get the locked balance for.
     * @param {number} [blockNumber] - The block number to use for the lock check.
     * @returns {bigint} The locked balance for the zone.
     */
    private async _calculateAvailableOutpointLockedBalanceForZone(zone: Zone, blockNumber?: number): Promise<bigint> {
        return this.getOutpoints(zone)
            .filter((utxo) => utxo.outpoint.lock !== 0 && blockNumber! < utxo.outpoint.lock!)
            .reduce((total, utxo) => {
                const denominationValue = denominations[utxo.outpoint.denomination];
                return total + denominationValue;
            }, BigInt(0));
    }

    /**
     * Converts outpoints for a specific zone to UTXO format.
     *
     * @param {Zone} zone - The zone to filter outpoints for.
     * @returns {UTXO[]} An array of UTXO objects.
     */
    private outpointsToUTXOs(zone: Zone): UTXO[] {
        return this.getOutpoints(zone).map((outpointInfo) => {
            const utxo = new UTXO();
            utxo.txhash = outpointInfo.outpoint.txhash;
            utxo.index = outpointInfo.outpoint.index;
            utxo.address = outpointInfo.address;
            utxo.denomination = outpointInfo.outpoint.denomination;
            utxo.lock = outpointInfo.outpoint.lock ?? null;
            return utxo;
        });
    }

    /**
     * Converts an amount of Qi to Quai and sends it to a specified Quai address.
     *
     * @param {string} destinationAddress - The Quai address to send the converted Quai to.
     * @param {bigint} amount - The amount of Qi to convert to Quai.
     * @returns {Promise<TransactionResponse>} A promise that resolves to the transaction response.
     * @throws {Error} If the destination address is invalid, the amount is zero, or the conversion fails.
     */
    public async convertToQuai(destinationAddress: string, amount: bigint): Promise<TransactionResponse> {
        const zone = getZoneForAddress(destinationAddress);
        if (!zone) {
            throw new Error(`Invalid zone for Quai address: ${destinationAddress}`);
        }

        if (isQiAddress(destinationAddress)) {
            throw new Error(`Invalid Quai address: ${destinationAddress}`);
        }

        if (amount <= 0) {
            throw new Error('Amount must be greater than 0');
        }

        const getDestinationAddresses = async (count: number): Promise<string[]> => {
            return Array(count).fill(destinationAddress);
        };

        return this.prepareAndSendTransaction(
            amount,
            zone,
            getDestinationAddresses,
            (utxos) => new ConversionCoinSelector(utxos),
        );
    }

    /**
     * Sends a transaction to a specified recipient payment code in a specified zone.
     *
     * @param {string} recipientPaymentCode - The payment code of the recipient.
     * @param {bigint} amount - The amount of Qi to send.
     * @param {Zone} originZone - The zone where the transaction originates.
     * @param {Zone} destinationZone - The zone where the transaction is sent.
     * @returns {Promise<TransactionResponse>} A promise that resolves to the transaction response.
     * @throws {Error} If the payment code is invalid, the amount is zero, or the zones are invalid.
     */
    public async sendTransaction(
        recipientPaymentCode: string,
        amount: bigint,
        originZone: Zone,
        destinationZone: Zone,
    ): Promise<TransactionResponse> {
        if (!validatePaymentCode(recipientPaymentCode)) {
            throw new Error('Invalid payment code');
        }
        if (amount <= 0) {
            throw new Error('Amount must be greater than 0');
        }
        this.validateZone(originZone);
        this.validateZone(destinationZone);

        const getDestinationAddresses = async (count: number): Promise<string[]> => {
            const addresses: string[] = [];
            while (addresses.length < count) {
                const address = this.getNextSendAddress(recipientPaymentCode, destinationZone).address;
                const { isUsed } = await this.checkAddressUse(address);
                if (!isUsed) {
                    addresses.push(address);
                }
            }
            return addresses;
        };

        return this.prepareAndSendTransaction(
            amount,
            originZone,
            getDestinationAddresses,
            (utxos) => new FewestCoinSelector(utxos),
        );
    }

    /**
     * Aggregates all the available UTXOs for the specified zone and account. This method creates a new transaction with
     * all the available UTXOs as inputs and as fewest outputs as possible.
     *
     * @param {Zone} zone - The zone to aggregate the balance for.
     * @returns {Promise<TransactionResponse>} The transaction response.
     */
    public async aggregate(zone: Zone): Promise<TransactionResponse> {
        this.validateZone(zone);
        if (!this.provider) {
            throw new Error('Provider is not set');
        }

        const zoneUTXOs = this.outpointsToUTXOs(zone);
        if (zoneUTXOs.length === 0) {
            throw new Error('No UTXOs available in zone.');
        }

        const aggregateCoinSelector = new AggregateCoinSelector(zoneUTXOs);
        // TODO: Calculate mempool max fee
        const fee = BigInt(1000); // temporary hardcode fee to 1 Qi
        const selection = aggregateCoinSelector.performSelection({ fee, maxDenomination: 6, includeLocked: false });

        const sendAddressesInfo = this._getUnusedBIP44Addresses(1, 0, 'BIP44:external', zone);
        const sendAddresses = sendAddressesInfo.map((addressInfo) => addressInfo.address);
        const changeAddresses: string[] = [];
        const inputPubKeys = selection.inputs.map((input) => {
            const addressInfo = this.locateAddressInfo(input.address);
            if (!addressInfo) {
                throw new Error(`Could not locate address info for address: ${input.address}`);
            }
            return addressInfo.pubKey;
        });

        // Proceed with creating and signing the transaction
        const chainId = (await this.provider.getNetwork()).chainId;
        const tx = await this.prepareTransaction(
            selection,
            inputPubKeys,
            sendAddresses,
            changeAddresses,
            Number(chainId),
        );

        // Sign the transaction
        const signedTx = await this.signTransaction(tx);

        // Broadcast the transaction to the network using the provider
        return this.provider.broadcastTransaction(zone, signedTx);
    }

    /**
     * Prepares and sends a transaction with the specified parameters.
     *
     * @private
     * @param {bigint} amount - The amount of Qi to send.
     * @param {Zone} originZone - The zone where the transaction originates.
     * @param {Function} getDestinationAddresses - A function that returns a promise resolving to an array of
     *   destination addresses.
     * @returns {Promise<TransactionResponse>} A promise that resolves to the transaction response.
     * @throws {Error} If provider is not set, insufficient balance, no available UTXOs, or insufficient spendable
     *   balance.
     */
    private async prepareAndSendTransaction(
        amount: bigint,
        originZone: Zone,
        getDestinationAddresses: (count: number) => Promise<string[]>,
        coinSelectorCreator: (utxos: UTXO[]) => FewestCoinSelector | ConversionCoinSelector,
    ): Promise<TransactionResponse> {
        if (!this.provider) {
            throw new Error('Provider is not set');
        }

        // 1. Check the wallet has enough balance in the originating zone to send the transaction
        const currentBlock = await this.provider.getBlock(toShard(originZone), 'latest')!;
        const balance = await this.getSpendableBalanceForZone(originZone, currentBlock?.woHeader.number, true);
        if (balance < amount) {
            throw new Error(
                `Insufficient balance in the originating zone: want ${Number(amount) / 1000} Qi got ${balance} Qi`,
            );
        }

        // 2. Select the UXTOs from the specified zone to use as inputs, and generate the spend and change outputs
        const zoneUTXOs = this.outpointsToUTXOs(originZone);
        if (zoneUTXOs.length === 0) {
            throw new Error('No Qi available in zone.');
        }
        const unlockedUTXOs = zoneUTXOs.filter(
            (utxo) => utxo.lock === 0 || utxo.lock! < currentBlock?.woHeader.number!,
        );
        if (unlockedUTXOs.length === 0) {
            throw new Error('Insufficient spendable balance in zone.');
        }

        const coinSelector = coinSelectorCreator(unlockedUTXOs);

        const spendTarget: bigint = amount;
        let selection = coinSelector.performSelection({ target: spendTarget });

        // 3. Generate as many unused addresses as required to populate the spend outputs
        const sendAddresses = await getDestinationAddresses(selection.spendOutputs.length);

        const getChangeAddressesForOutputs = async (count: number): Promise<string[]> => {
            const currentChangeAddresses = this._addressesMap.get('BIP44:change') || [];
            const outputChangeAddresses: QiAddressInfo[] = [];

            for (let i = 0; i < currentChangeAddresses.length; i++) {
                if (currentChangeAddresses[i].status === AddressStatus.UNUSED) {
                    outputChangeAddresses.push(currentChangeAddresses[i]);
                }

                if (outputChangeAddresses.length === count) break;
            }

            // Generate the remaining number of change addresses if needed
            const remainingAddressesNeeded = count - outputChangeAddresses.length;
            if (remainingAddressesNeeded > 0) {
                outputChangeAddresses.push(
                    ...Array(remainingAddressesNeeded)
                        .fill(0)
                        .map(() => this.getNextChangeAddressSync(0, originZone)),
                );
            }

            // Combine the existing change addresses with the newly generated addresses and ensure they are unique and sorted by index
            const mergedChangeAddresses = [
                // Not updated last synced block because we are not certain of the success of the transaction
                // so we will want to get deltas from last **checked** block
                ...outputChangeAddresses.map((address) => ({
                    ...address,
                    status: AddressStatus.ATTEMPTED_USE,
                })),
                ...currentChangeAddresses,
            ];
            const sortedAndFilteredChangeAddresses = mergedChangeAddresses
                .filter((address, index, self) => self.findIndex((t) => t.address === address.address) === index)
                .sort((a, b) => a.index - b.index);

            // Update the _addressesMap with the modified change addresses and statuses
            this._addressesMap.set('BIP44:change', sortedAndFilteredChangeAddresses);

            return outputChangeAddresses.map((address) => address.address);
        };

        // 4. Get change addresses
        const changeAddresses = await getChangeAddressesForOutputs(selection.changeOutputs.length);

        // 5. Create the transaction and sign it using the signTransaction method
        let inputPubKeys = selection.inputs.map((input) => this.locateAddressInfo(input.address)?.pubKey);
        if (inputPubKeys.some((pubkey) => !pubkey)) {
            throw new Error('Missing public key for input address');
        }

        let attempts = 0;
        const MAX_FEE_ESTIMATION_ATTEMPTS = 5;

        while (attempts < MAX_FEE_ESTIMATION_ATTEMPTS) {
            const feeEstimationTx = this.prepareFeeEstimationTransaction(
                selection,
                inputPubKeys.map((pubkey) => pubkey!),
                sendAddresses,
                changeAddresses,
            );

            const estimatedFee = await this.provider.estimateFeeForQi(feeEstimationTx);

            // Get new selection with updated fee 2x
            selection = coinSelector.performSelection({ target: spendTarget, fee: estimatedFee * 3n });
            // Determine if new addresses are needed for the change outputs
            const changeAddressesNeeded = selection.changeOutputs.length - changeAddresses.length;
            if (changeAddressesNeeded > 0) {
                // Need more change addresses
                const newChangeAddresses = await getChangeAddressesForOutputs(changeAddressesNeeded);
                changeAddresses.push(...newChangeAddresses);
            } else if (changeAddressesNeeded < 0) {
                // Have extra change addresses, remove the excess
                const addressesToSetToUnused = changeAddresses.slice(changeAddressesNeeded);

                // Set the status of the addresses back to UNUSED in _addressesMap for removed addresses
                const changeAddressesMap = this._addressesMap.get('BIP44:change')!;
                const updatedChangeAddressesMap = changeAddressesMap.map((a) => {
                    if (addressesToSetToUnused.includes(a.address)) {
                        return { ...a, status: AddressStatus.UNUSED };
                    }
                    return a;
                });
                this._addressesMap.set('BIP44:change', updatedChangeAddressesMap);
            }

            // Determine if new addresses are needed for the spend outputs
            const spendAddressesNeeded = selection.spendOutputs.length - sendAddresses.length;
            if (spendAddressesNeeded > 0) {
                // Need more send addresses
                const newSendAddresses = await getDestinationAddresses(spendAddressesNeeded);
                sendAddresses.push(...newSendAddresses);
            } else if (spendAddressesNeeded < 0) {
                // It would be great to reset the status of the addresses to UNUSED in _addressesMap but we do not
                // know exactly how these addresses are derived, so we just remove them from the array
                sendAddresses.slice(spendAddressesNeeded);
            }

            inputPubKeys = selection.inputs.map((input) => this.locateAddressInfo(input.address)?.pubKey);

            // Calculate total new outputs needed (absolute value)
            const totalNewOutputsNeeded = Math.abs(changeAddressesNeeded) + Math.abs(spendAddressesNeeded);

            // If we need 5 or fewer new outputs, we can break the loop
            if ((changeAddressesNeeded <= 0 && spendAddressesNeeded <= 0) || totalNewOutputsNeeded <= 5) {
                break;
            }

            attempts++;
        }

        // Proceed with creating and signing the transaction
        const chainId = (await this.provider.getNetwork()).chainId;
        const tx = await this.prepareTransaction(
            selection,
            inputPubKeys.map((pubkey) => pubkey!),
            sendAddresses,
            changeAddresses,
            Number(chainId),
        );

        // Sign the transaction
        const signedTx = await this.signTransaction(tx);
        // Broadcast the transaction to the network using the provider
        return this.provider.broadcastTransaction(originZone, signedTx);
    }

    /**
     * Prepares a transaction with the specified parameters.
     *
     * @private
     * @param {SelectedCoinsResult} selection - The selected coins result.
     * @param {string[]} inputPubKeys - The public keys of the inputs.
     * @param {string[]} sendAddresses - The addresses to send to.
     * @param {string[]} changeAddresses - The addresses to change to.
     * @param {number} chainId - The chain ID.
     * @returns {Promise<QiTransaction>} A promise that resolves to the prepared transaction.
     */
    private async prepareTransaction(
        selection: SelectedCoinsResult,
        inputPubKeys: string[],
        sendAddresses: string[],
        changeAddresses: string[],
        chainId: number,
    ): Promise<QiTransaction> {
        const tx = new QiTransaction();
        tx.txInputs = selection.inputs.map((input, index) => ({
            txhash: input.txhash!,
            index: input.index!,
            pubkey: inputPubKeys[index],
        }));
        // 5.3 Create the "sender" outputs
        const senderOutputs = selection.spendOutputs.map((output, index) => ({
            address: sendAddresses[index],
            denomination: output.denomination,
        }));

        // 5.4 Create the "change" outputs
        const changeOutputs = selection.changeOutputs.map((output, index) => ({
            address: changeAddresses[index],
            denomination: output.denomination,
        }));

        tx.txOutputs = [...senderOutputs, ...changeOutputs].map((output) => ({
            address: output.address,
            denomination: output.denomination!,
        }));
        tx.chainId = chainId;
        return tx;
    }

    /**
     * Prepares a fee estimation transaction with the specified parameters.
     *
     * @private
     * @param {SelectedCoinsResult} selection - The selected coins result.
     * @param {string[]} inputPubKeys - The public keys of the inputs.
     * @param {string[]} sendAddresses - The addresses to send to.
     * @param {string[]} changeAddresses - The addresses to change to.
     * @returns {QiPerformActionTransaction} The prepared transaction.
     */
    private prepareFeeEstimationTransaction(
        selection: SelectedCoinsResult,
        inputPubKeys: string[],
        sendAddresses: string[],
        changeAddresses: string[],
    ): QiPerformActionTransaction {
        const txIn = selection.inputs.map((input, index) => ({
            previousOutpoint: { txHash: input.txhash!, index: toQuantity(input.index!) },
            pubkey: inputPubKeys[index],
        }));

        // 5.3 Create the "sender" outputs
        const senderOutputs = selection.spendOutputs.map((output, index) => ({
            address: sendAddresses[index],
            denomination: output.denomination,
        }));

        // 5.4 Create the "change" outputs
        const changeOutputs = selection.changeOutputs.map((output, index) => ({
            address: changeAddresses[index],
            denomination: output.denomination,
        }));

        const txOut = [...senderOutputs, ...changeOutputs].map((output) => ({
            address: output.address,
            denomination: toQuantity(output.denomination!),
        }));

        return {
            txType: 2,
            txIn,
            txOut,
        };
    }

    /**
     * Gets a set of unused BIP44 addresses from the specified derivation path. It first checks if there are any unused
     * addresses available in the _addressesMap and uses those if possible. If there are not enough unused addresses, it
     * will generate new ones.
     *
     * @param amount - The number of addresses to get.
     * @param path - The derivation path to get addresses from.
     * @param zone - The zone to get addresses from.
     * @returns An array of addresses.
     */
    private _getUnusedBIP44Addresses(
        amount: number,
        account: number,
        path: DerivationPath,
        zone: Zone,
    ): QiAddressInfo[] {
        const addresses = this._addressesMap.get(path) || [];
        const unusedAddresses = addresses.filter(
            (address) =>
                address.status === AddressStatus.UNUSED && address.account === account && address.zone === zone,
        );
        if (unusedAddresses.length >= amount) {
            return unusedAddresses.slice(0, amount);
        }

        const remainingAddressesNeeded = amount - unusedAddresses.length;
        const isChange = path === 'BIP44:change';
        const newAddresses = Array.from({ length: remainingAddressesNeeded }, () =>
            this._getNextQiAddress(account, zone, isChange),
        );
        return [...unusedAddresses, ...newAddresses];
    }

    /**
     * Returns a schnorr signature for the given message and private key.
     *
     * @ignore
     * @param {TxInput} input - The transaction input.
     * @param {Uint8Array} hash - The hash of the message.
     * @returns {string} The schnorr signature.
     */
    private createSchnorrSignature(input: TxInput, hash: Uint8Array): string {
        const privKey = this.getPrivateKeyForTxInput(input);
        const signature = schnorr.sign(hash, getBytes(privKey));
        return hexlify(signature);
    }

    /**
     * Returns a MuSig signature for the given message and private keys corresponding to the input addresses.
     *
     * @ignore
     * @param {QiTransaction} tx - The Qi transaction.
     * @param {Uint8Array} hash - The hash of the message.
     * @returns {string} The MuSig signature.
     */
    private createMuSigSignature(tx: QiTransaction, hash: Uint8Array): string {
        const musig = MuSigFactory(musigCrypto);

        // Collect private keys corresponding to the pubkeys found on the inputs
        const privKeys = tx.txInputs.map((input) => this.getPrivateKeyForTxInput(input));

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

    /**
     * Retrieves the private key for a given transaction input.
     *
     * This method derives the private key for a transaction input by locating the address info and then deriving the
     * private key based on where the address info was found:
     *
     * - For BIP44 addresses (standard or change), it uses the HD wallet to derive the private key.
     * - For payment channel addresses (BIP47), it uses PaymentCodePrivate to derive the private key.
     *
     * @param {TxInput} input - The transaction input containing the public key.
     * @returns {string} The private key corresponding to the transaction input.
     * @throws {Error} If the input does not contain a public key or if the address information cannot be found.
     */
    private getPrivateKeyForTxInput(input: TxInput): string {
        if (!input.pubkey) throw new Error('Missing public key for input');
        const address = computeAddress(input.pubkey);
        return this.getPrivateKey(address);
    }

    /**
     * Returns the private key for a given address. This method should be used with caution as it exposes the private
     * key to the user.
     *
     * @param {string} address - The address associated with the desired private key.
     * @returns {string} The private key.
     */
    public getPrivateKey(address: string): string {
        const addressInfo = this.locateAddressInfo(address);

        if (!addressInfo) {
            throw new Error(`Address not found: ${address}`);
        }

        // Handle imported private keys
        if (isHexString(addressInfo.derivationPath, 32)) {
            return addressInfo.derivationPath;
        }

        if (addressInfo.derivationPath === 'BIP44:external' || addressInfo.derivationPath === 'BIP44:change') {
            // (BIP44 addresses)
            const addressNode = this._getAddressNode(addressInfo.account, addressInfo.change, addressInfo.index);
            return addressNode.privateKey;
        } else {
            // (BIP47 addresses)
            const pcAddressInfo = addressInfo;
            const account = pcAddressInfo.account;
            const index = pcAddressInfo.index;

            const counterpartyPaymentCode = pcAddressInfo.derivationPath;
            if (!counterpartyPaymentCode) {
                throw new Error('Counterparty payment code not found for payment channel address');
            }

            const bip32 = BIP32Factory(ecc);
            const buf = bs58check.decode(counterpartyPaymentCode);
            const version = buf[0];
            if (version !== PC_VERSION) throw new Error('Invalid payment code version');

            const counterpartyPCodePublic = new PaymentCodePublic(ecc, bip32, buf.slice(1));
            const paymentCodePrivate = this._getPaymentCodePrivate(account);
            const paymentPrivateKey = paymentCodePrivate.derivePaymentPrivateKey(counterpartyPCodePublic, index);
            return hexlify(paymentPrivateKey);
        }
    }

    /**
     * Scans the specified zone for addresses with unspent outputs. Starting at index 0, it will generate new addresses
     * until the gap limit is reached for external and change BIP44 addresses and payment channel addresses.
     *
     * @param {Zone} zone - The zone in which to scan for addresses.
     * @param {number} [account=0] - The index of the account to scan. Default is `0`
     * @returns {Promise<void>} A promise that resolves when the scan is complete.
     * @throws {Error} If the zone is invalid.
     */
    public async scan(zone: Zone, account: number = 0): Promise<void> {
        this.validateZone(zone);

        // set status of all addresses to unknown
        this._addressesMap = new Map(
            Array.from(this._addressesMap.entries()).map(([key, addresses]) => [
                key,
                addresses.map((addr) => ({ ...addr, status: AddressStatus.UNKNOWN, lastSyncedBlock: null })),
            ]),
        );

        // flush available
        this._availableOutpoints.clear();

        // Reset each map so that all keys have empty array values but keys are preserved
        this._paymentCodeSendAddressMap = new Map(
            Array.from(this._paymentCodeSendAddressMap.keys()).map((key) => [key, []]),
        );

        await this._scan(zone, account);
    }

    /**
     * Scans the specified zone for addresses with unspent outputs. Starting at the last address index, it will generate
     * new addresses until the gap limit is reached for external and change BIP44 addresses and payment channel
     * addresses.
     *
     * @param {Zone} zone - The zone in which to sync addresses.
     * @param {number} [account=0] - The index of the account to sync. Default is `0`
     * @returns {Promise<void>} A promise that resolves when the sync is complete.
     * @throws {Error} If the zone is invalid.
     */
    public async sync(
        zone: Zone,
        account: number = 0,
        onOutpointsCreated?: OutpointsCallback,
        onOutpointsDeleted?: OutpointsCallback,
    ): Promise<void> {
        this.validateZone(zone);
        await this._scan(zone, account, onOutpointsCreated, onOutpointsDeleted);
    }

    /**
     * Internal method to scan the specified zone for addresses with unspent outputs. This method handles the actual
     * scanning logic, generating new addresses until the gap limit is reached for both gap and change addresses.
     *
     * @param {Zone} zone - The zone in which to scan for addresses.
     * @param {number} [account=0] - The index of the account to scan. Default is `0`
     * @param {Function} [onCreate] - A callback function that is called when a new address is created.
     * @param {Function} [onDelete] - A callback function that is called when an address is deleted.
     * @returns {Promise<void>} A promise that resolves when the scan is complete.
     * @throws {Error} If the provider is not set.
     */
    private async _scan(
        zone: Zone,
        account: number = 0,
        onOutpointsCreated?: OutpointsCallback,
        onOutpointsDeleted?: OutpointsCallback,
    ): Promise<void> {
        if (!this.provider) throw new Error('Provider not set');

        const derivationPaths: DerivationPath[] = ['BIP44:external', 'BIP44:change', ...this.openChannels];
        const currentBlock = (await this.provider!.getBlock(toShard(zone), 'latest')) as Block;
        for (const path of derivationPaths) {
            await this._scanDerivationPath(
                path,
                zone,
                account,
                currentBlock,
                false,
                onOutpointsCreated,
                onOutpointsDeleted,
            );

            // Yield control back to the event loop
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        await this._scanDerivationPath(
            QiHDWallet.PRIVATE_KEYS_PATH,
            zone,
            account,
            currentBlock,
            true,
            onOutpointsCreated,
            onOutpointsDeleted,
        );
    }

    /**
     * Scans for the next address in the specified zone and account, checking for associated outpoints, and updates the
     * address count and gap addresses accordingly.
     *
     * @param {Zone} zone - The zone in which the address is being scanned.
     * @param {number} account - The index of the account for which the address is being scanned.
     * @param {boolean} isChange - A flag indicating whether the address is a change address.
     * @returns {Promise<void>} A promise that resolves when the scan is complete.
     * @throws {Error} If an error occurs during the address scanning or outpoints retrieval process.
     */
    private async _scanDerivationPath(
        path: DerivationPath,
        zone: Zone,
        account: number,
        currentBlock: Block,
        skipGap: boolean = false,
        onOutpointsCreated?: OutpointsCallback,
        onOutpointsDeleted?: OutpointsCallback,
    ): Promise<void> {
        const addresses = this._addressesMap.get(path) || [];
        const updatedAddresses: QiAddressInfo[] = [];
        const createdOutpoints: { [address: string]: Outpoint[] } = {};
        const deletedOutpoints: { [address: string]: Outpoint[] } = {};

        // Addresses with a last synced block are checked for outpoint deltas
        const previouslySyncedAddresses: QiAddressInfo[] = [];
        const unsyncedAddresses: QiAddressInfo[] = [];
        for (const addr of addresses) {
            if (addr.lastSyncedBlock !== null) {
                previouslySyncedAddresses.push(addr);
            } else {
                unsyncedAddresses.push(addr);
            }
        }

        if (previouslySyncedAddresses.length > 0) {
            // get all unique txhashes from used addresses last synced block to current block
            const addressesByLastSyncedTxHash: { [txHash: string]: string[] } = {};
            for (const addr of previouslySyncedAddresses) {
                if (addr.lastSyncedBlock?.hash) {
                    if (!addressesByLastSyncedTxHash[addr.lastSyncedBlock.hash]) {
                        addressesByLastSyncedTxHash[addr.lastSyncedBlock.hash] = [addr.address];
                    } else {
                        addressesByLastSyncedTxHash[addr.lastSyncedBlock.hash].push(addr.address);
                    }
                }
            }

            // Get outpoint deltas for each unique txhash
            const deltasBatches = await Promise.all(
                Object.entries(addressesByLastSyncedTxHash).map(([txHash, addresses]) =>
                    this.provider!.getOutpointDeltas(addresses, txHash),
                ),
            );

            // combine deltas into single object
            const deltas: OutpointDeltas = {};
            for (const deltaBatch of deltasBatches) {
                for (const [address, delta] of Object.entries(deltaBatch)) {
                    if (!deltas[address]) {
                        deltas[address] = { created: delta.created, deleted: delta.deleted };
                    } else {
                        deltas[address].created.push(...delta.created);
                        deltas[address].deleted.push(...delta.deleted);
                    }
                }
            }

            // Process deltas
            for (const [address, delta] of Object.entries(deltas)) {
                const addressInfo = addresses.find((a) => a.address === address)!;

                const updatedAddressInfo = {
                    ...addressInfo,
                    lastSyncedBlock: {
                        hash: currentBlock.hash,
                        number: currentBlock.woHeader.number,
                    },
                };

                // Handle created outpoints
                if (delta.created && delta.created.length > 0) {
                    this.importOutpoints(
                        delta.created.map((outpoint) => ({
                            outpoint,
                            address,
                            zone,
                            account,
                        })),
                    );
                    createdOutpoints[address] = delta.created;

                    // set address status to used even if it may have already has this status
                    updatedAddressInfo.status = AddressStatus.USED;
                }

                // Handle deleted outpoints
                if (delta.deleted && delta.deleted.length > 0) {
                    // Remove corresponding outpoints from availableOutpoints
                    for (const outpoint of delta.deleted) {
                        this._availableOutpoints.delete(`${outpoint.txhash}:${outpoint.index}`);
                    }
                    deletedOutpoints[address] = delta.deleted;
                }

                updatedAddresses.push(updatedAddressInfo);
            }
        }

        let consecutiveUnusedCount = 0;

        // Check unsynced addresses for outpoints
        // Batch check unsynced addresses for outpoints
        if (unsyncedAddresses.length > 0) {
            const checkAddressUsePromises = unsyncedAddresses.map((addr) => this.checkAddressUse(addr.address));
            const checkResults = await Promise.all(checkAddressUsePromises);

            for (let i = 0; i < unsyncedAddresses.length; i++) {
                const addr = unsyncedAddresses[i];
                const { isUsed, outpoints } = checkResults[i];

                addr.status = isUsed ? AddressStatus.USED : AddressStatus.UNUSED;
                addr.lastSyncedBlock = {
                    hash: currentBlock.hash,
                    number: currentBlock.woHeader.number,
                };

                // Import outpoints if any are found
                if (outpoints.length > 0) {
                    this.importOutpoints(
                        outpoints.map((outpoint) => ({
                            outpoint,
                            address: addr.address,
                            zone: addr.zone,
                            account: addr.account,
                        })),
                    );
                    createdOutpoints[addr.address] = outpoints;
                }

                if (addr.status === AddressStatus.USED) {
                    consecutiveUnusedCount = 0;
                } else {
                    consecutiveUnusedCount++;
                }

                updatedAddresses.push(addr);

                // If the consecutive unused count has reached the gap limit, break
                if (consecutiveUnusedCount >= QiHDWallet._GAP_LIMIT) break;
            }
        }

        if (!skipGap) {
            // Generate new addresses if needed until the gap limit is reached
            while (consecutiveUnusedCount < QiHDWallet._GAP_LIMIT) {
                const isChange = path.endsWith(':change');

                // Determine how many addresses to generate in this batch
                const remainingGap = QiHDWallet._GAP_LIMIT - consecutiveUnusedCount;

                // Generate 'remainingGap' addresses
                const newAddresses: QiAddressInfo[] = [];
                for (let i = 0; i < remainingGap; i++) {
                    const newAddrInfo = path.includes('BIP44')
                        ? this._getNextQiAddress(account, zone, isChange)
                        : this.getNextReceiveAddress(path, zone, account);
                    newAddresses.push(newAddrInfo);
                }

                // Batch check the new addresses for use
                const checkAddressUsePromises = newAddresses.map((addr) => this.checkAddressUse(addr.address));
                const checkResults = await Promise.all(checkAddressUsePromises);

                // Process the results
                for (let i = 0; i < newAddresses.length; i++) {
                    const newAddrInfo = newAddresses[i];
                    const { isUsed, outpoints } = checkResults[i];

                    newAddrInfo.status = isUsed ? AddressStatus.USED : AddressStatus.UNUSED;
                    newAddrInfo.lastSyncedBlock = {
                        hash: currentBlock.hash,
                        number: currentBlock.woHeader.number,
                    };

                    // Import outpoints if any are found
                    if (outpoints.length > 0) {
                        this.importOutpoints(
                            outpoints.map((outpoint) => ({
                                outpoint,
                                address: newAddrInfo.address,
                                zone: newAddrInfo.zone,
                                account: newAddrInfo.account,
                            })),
                        );
                        createdOutpoints[newAddrInfo.address] = outpoints;
                    }

                    if (newAddrInfo.status === AddressStatus.USED) {
                        consecutiveUnusedCount = 0;
                    } else {
                        consecutiveUnusedCount++;
                    }

                    addresses.push(newAddrInfo);

                    // Check if the consecutive unused count has reached the gap limit
                    if (consecutiveUnusedCount >= QiHDWallet._GAP_LIMIT) {
                        break;
                    }
                }

                // Yield control back to the event loop after each iteration
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        // Create a map to track unique addresses
        const uniqueAddressMap = new Map<string, QiAddressInfo>();

        // Process addresses in order, with updated addresses taking precedence
        addresses.forEach((addr) => {
            const updatedAddr = updatedAddresses.find((a) => a.address === addr.address);
            uniqueAddressMap.set(addr.address, updatedAddr || addr);
        });

        // Convert map values back to array
        const updatedAddressesForMap = Array.from(uniqueAddressMap.values());

        this._addressesMap.set(path, updatedAddressesForMap);

        const executeCreatedOutpointsCallback = async () => {
            if (onOutpointsCreated && Object.keys(createdOutpoints).length > 0) {
                try {
                    await onOutpointsCreated(createdOutpoints);
                } catch (error: any) {
                    console.error(`Error in onOutpointsCreated callback: ${error.message}`);
                }
            }
        };

        const executeDeletedOutpointsCallback = async () => {
            if (onOutpointsDeleted && Object.keys(deletedOutpoints).length > 0) {
                try {
                    await onOutpointsDeleted(deletedOutpoints);
                } catch (error: any) {
                    console.error(`Error in onOutpointsDeleted callback: ${error.message}`);
                }
            }
        };

        // execute callbacks
        await Promise.all([executeCreatedOutpointsCallback(), executeDeletedOutpointsCallback()]);
    }

    /**
     * Queries the network node for the outpoints of the specified address.
     *
     * @ignore
     * @param {string} address - The address to query.
     * @returns {Promise<Outpoint[]>} The outpoints for the address.
     * @throws {Error} If the query fails.
     */
    private async getOutpointsByAddress(address: string): Promise<Outpoint[]> {
        try {
            return await this.provider!.getOutpointsByAddress(address);
        } catch (error) {
            throw new Error(`Failed to get outpoints for address: ${address} - error: ${error}`);
        }
    }

    /**
     * Checks if the specified address is used by querying the network node for the outpoints of the address. If the
     * address is used, the outpoints are imported into the wallet.
     *
     * @param {string} address - The address to check.
     * @returns {Promise<{ isUsed: boolean; outpoints: Outpoint[] }>} A promise that resolves to an object containing a
     *   boolean indicating whether the address is used and an array of outpoints.
     * @throws {Error} If the query fails.
     */
    private async checkAddressUse(address: string): Promise<{ isUsed: boolean; outpoints: Outpoint[] }> {
        let isUsed = false;
        let outpoints: Outpoint[] = [];
        try {
            outpoints = await this.getOutpointsByAddress(address);
            if (outpoints.length > 0) {
                isUsed = true;
            } else if (this._addressUseChecker !== undefined && (await this._addressUseChecker(address))) {
                // address checker returned true, so the address is used
                isUsed = true;
            }
        } catch (error) {
            throw new Error(`Failed to get outpoints for address: ${address} - error: ${error}`);
        }
        return { isUsed, outpoints };
    }

    /**
     * Gets the addresses for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {QiAddressInfo[]} The addresses for the zone.
     */
    public getAddressesForZone(zone: Zone): QiAddressInfo[] {
        this.validateZone(zone);
        return this._addressesMap.get('BIP44:external')?.filter((addressInfo) => addressInfo.zone === zone) || [];
    }

    /**
     * Gets the change addresses for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {QiAddressInfo[]} The change addresses for the zone.
     */
    public getChangeAddressesForZone(zone: Zone): QiAddressInfo[] {
        this.validateZone(zone);
        return this._addressesMap.get('BIP44:change')?.filter((addressInfo) => addressInfo.zone === zone) || [];
    }

    /**
     * Gets the gap addresses for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {QiAddressInfo[]} The gap addresses for the zone.
     */
    public getGapAddressesForZone(zone: Zone): QiAddressInfo[] {
        this.validateZone(zone);
        const gapAddresses = this._addressesMap.get('BIP44:external') || [];
        return gapAddresses.filter(
            (addressInfo) => addressInfo.zone === zone && addressInfo.status === AddressStatus.UNUSED,
        );
    }

    /**
     * Gets the gap change addresses for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {QiAddressInfo[]} The gap change addresses for the zone.
     */
    public getGapChangeAddressesForZone(zone: Zone): QiAddressInfo[] {
        this.validateZone(zone);
        const gapChangeAddresses = this._addressesMap.get('BIP44:change') || [];
        return gapChangeAddresses.filter(
            (addressInfo) => addressInfo.zone === zone && addressInfo.status === AddressStatus.UNUSED,
        );
    }

    /**
     * Gets the payment channel addresses for the specified zone.
     *
     * @param {string} paymentCode - The payment code.
     * @param {Zone} zone - The zone.
     * @returns {QiAddressInfo[]} The payment channel addresses for the zone.
     */
    public getPaymentChannelAddressesForZone(paymentCode: string, zone: Zone): QiAddressInfo[] {
        return this._addressesMap.get(paymentCode)?.filter((addressInfo) => addressInfo.zone === zone) || [];
    }

    /**
     * Gets the gap payment channel addresses for the specified payment code.
     *
     * @param {string} paymentCode - The payment code.
     * @returns {QiAddressInfo[]} The gap payment channel addresses for the payment code.
     */
    public getGapPaymentChannelAddressesForZone(paymentCode: string, zone: Zone): QiAddressInfo[] {
        return (
            this._addressesMap
                .get(paymentCode)
                ?.filter((addressInfo) => addressInfo.status === AddressStatus.UNUSED && addressInfo.zone === zone) ||
            []
        );
    }

    /**
     * Signs a message using the private key associated with the given address.
     *
     * @param {string} address - The address for which the message is to be signed.
     * @param {string | Uint8Array} message - The message to be signed, either as a string or Uint8Array.
     * @returns {Promise<string>} A promise that resolves to the signature of the message in hexadecimal string format.
     * @throws {Error} If the address does not correspond to a valid HD node or if signing fails.
     */
    public async signMessage(address: string, message: string | Uint8Array): Promise<string> {
        const privKey = this.getPrivateKey(address);
        const messageBytes =
            typeof message === 'string'
                ? getBytes(toUtf8Bytes(message)) // Add UTF-8 encoding to support arbitrary strings
                : message;
        const digest = keccak256(messageBytes);
        const digestBytes = getBytes(digest);
        const signature = schnorr.sign(digestBytes, getBytes(privKey));
        return hexlify(signature);
    }

    /**
     * Serializes the HD wallet state into a format suitable for storage or transmission.
     *
     * @returns {SerializedQiHDWallet} An object representing the serialized state of the HD wallet, including
     *   outpoints, change addresses, gap addresses, and other inherited properties.
     */
    public serialize(): SerializedQiHDWallet {
        const hdwalletSerialized = super.serialize();

        return {
            ...hdwalletSerialized,
            addresses: Array.from(this._addressesMap.values()).flatMap((addresses) => addresses),
            senderPaymentCodeInfo: Object.fromEntries(
                Array.from(this._paymentCodeSendAddressMap.entries()).map(([key, value]) => [key, Array.from(value)]),
            ),
        };
    }

    /**
     * Deserializes a serialized QiHDWallet object and reconstructs the wallet instance.
     *
     * @param {SerializedQiHDWallet} serialized - The serialized object representing the state of a QiHDWallet.
     * @returns {Promise<QiHDWallet>} A promise that resolves to a reconstructed QiHDWallet instance.
     * @throws {Error} If the serialized data is invalid or if any addresses in the gap addresses or gap change
     *   addresses do not exist in the wallet.
     */
    public static async deserialize(serialized: SerializedQiHDWallet): Promise<QiHDWallet> {
        super.validateSerializedWallet(serialized);

        // create the wallet instance
        const mnemonic = Mnemonic.fromPhrase(serialized.phrase);
        const path = (this as any).parentPath(serialized.coinType);
        const root = HDNodeWallet.fromMnemonic(mnemonic, path);
        const wallet = new this(_guard, root);

        // validate and import all the wallet addresses
        for (const addressInfo of serialized.addresses) {
            let key = addressInfo.derivationPath;
            if (isHexString(key, 32)) {
                key = QiHDWallet.PRIVATE_KEYS_PATH;
            } else if (key.includes('BIP44')) {
                // only validate if it's not a private key or a BIP44 path
                wallet.validateAddressInfo(addressInfo);
            } else {
                // payment code addresses require different derivation validation
                wallet.validateBaseAddressInfo(addressInfo);
                wallet.validateExtendedProperties(addressInfo);
            }
            const existingAddresses = wallet._addressesMap.get(key);
            if (!existingAddresses) {
                wallet._addressesMap.set(key, [addressInfo]);
                // if the address is already in the map, we don't need to add it again
            } else if (!existingAddresses.some((addr) => addr.address === addressInfo.address)) {
                existingAddresses!.push(addressInfo);
            }
        }

        // validate and import the counter party payment code info
        for (const [paymentCode, paymentCodeInfoArray] of Object.entries(serialized.senderPaymentCodeInfo)) {
            if (!validatePaymentCode(paymentCode)) {
                throw new Error(`Invalid payment code: ${paymentCode}`);
            }
            for (const pcInfo of paymentCodeInfoArray) {
                // Basic property validation
                wallet.validateBaseAddressInfo(pcInfo);
                wallet.validateExtendedProperties(pcInfo);
            }
            wallet._paymentCodeSendAddressMap.set(paymentCode, paymentCodeInfoArray);
        }

        return wallet;
    }

    protected validateAddressDerivation(info: QiAddressInfo): void {
        const addressNode = this._getAddressNode(info.account, info.change, info.index);

        // Validate derived address matches
        if (addressNode.address !== info.address) {
            throw new Error(`Address mismatch: derived ${addressNode.address} but got ${info.address}`);
        }

        // Validate derived public key matches
        if (addressNode.publicKey !== info.pubKey) {
            throw new Error(`Public key mismatch: derived ${addressNode.publicKey} but got ${info.pubKey}`);
        }

        // Validate zone
        const zone = getZoneForAddress(addressNode.address);
        if (!zone || zone !== info.zone) {
            throw new Error(`Zone mismatch: derived ${zone} but got ${info.zone}`);
        }

        // Validate it's a valid Qi address
        if (!isQiAddress(addressNode.address)) {
            throw new Error(`Address ${addressNode.address} is not a valid Qi address`);
        }
    }

    protected validateExtendedProperties(info: QiAddressInfo): void {
        // Validate status
        if (!Object.values(AddressStatus).includes(info.status)) {
            throw new Error(`Invalid status: ${info.status}`);
        }

        // Validate derivation path
        if (typeof info.derivationPath !== 'string' || !info.derivationPath) {
            throw new Error(`Invalid derivation path: ${info.derivationPath}`);
        }

        // Validate derivation path format
        this.validateDerivationPath(info.derivationPath, info.change);

        // Validate last synced block
        // 1. Validate lastSyncBlock.hash is a valid hash
        if (info.lastSyncedBlock && !isHexString(info.lastSyncedBlock.hash, 32)) {
            throw new Error(`Invalid last synced block hash: ${info.lastSyncedBlock.hash}`);
        }
        // 2. Validate lastSyncBlock.height is a number
        if (
            info.lastSyncedBlock &&
            (typeof info.lastSyncedBlock.number !== 'number' || info.lastSyncedBlock.number < 0)
        ) {
            throw new Error(`Invalid last synced block number: ${info.lastSyncedBlock.number}`);
        }
    }

    /**
     * Validates that the derivation path is either a BIP44 path or a valid payment code.
     *
     * @private
     * @param {string} path - The derivation path to validate
     * @param {boolean} isChange - Whether this is a change address
     * @throws {Error} If the path is invalid
     */
    private validateDerivationPath(path: string, isChange: boolean): void {
        // Check if it's a BIP44 path
        if (path === 'BIP44:external' || path === 'BIP44:change') {
            // Validate that the path matches the change flag
            const expectedPath = isChange ? 'BIP44:change' : 'BIP44:external';
            if (path !== expectedPath) {
                throw new Error(
                    `BIP44 path mismatch: address marked as ${isChange ? 'change' : 'external'} ` +
                        `but has path ${path}`,
                );
            }
            return;
        }

        // Check if it's a private key path
        if (path === QiHDWallet.PRIVATE_KEYS_PATH) {
            if (isChange) {
                throw new Error('Imported private key addresses cannot be change addresses');
            }
            return;
        }

        // If not a BIP44 path or private key, must be a valid payment code
        if (!validatePaymentCode(path)) {
            throw new Error(
                `Invalid derivation path: must be 'BIP44:external', 'BIP44:change', ` +
                    `'${QiHDWallet.PRIVATE_KEYS_PATH}', or a valid payment code. Got: ${path}`,
            );
        }

        // Payment code addresses cannot be change addresses
        if (isChange) {
            throw new Error('Payment code addresses cannot be change addresses');
        }
    }

    /**
     * Validates an array of OutpointInfo objects. This method checks the validity of each OutpointInfo object by
     * performing the following validations:
     *
     * - Validates the zone using the `validateZone` method.
     * - Checks if the address exists in the wallet.
     * - Checks if the account (if provided) exists in the wallet.
     * - Validates the Outpoint by ensuring that `Txhash`, `Index`, and `Denomination` are not null.
     *
     * @ignore
     * @param {OutpointInfo[]} outpointInfo - An array of OutpointInfo objects to be validated.
     * @throws {Error} If any of the validations fail, an error is thrown with a descriptive message.
     */
    private validateOutpointInfo(outpointInfo: OutpointInfo[]): void {
        outpointInfo.forEach((info) => {
            // validate zone
            this.validateZone(info.zone);

            // validate address and account
            this.validateAddressAndAccount(info.address, info.account);

            // validate Outpoint
            if (info.outpoint.txhash == null || info.outpoint.index == null || info.outpoint.denomination == null) {
                throw new Error(`Invalid Outpoint: ${JSON.stringify(info)} `);
            }
        });
    }

    private validateAddressAndAccount(address: string, account?: number): void {
        const addressInfo = this.locateAddressInfo(address);
        if (!addressInfo) {
            throw new Error(`Address ${address} not found in wallet`);
        }
        if (account && account !== addressInfo.account) {
            throw new Error(`Address ${address} does not match account ${account}`);
        }
    }

    /**
     * Creates a new BIP47 payment code for the specified account. The payment code is derived from the account's BIP32
     * root key.
     *
     * @param {number} account - The account index to derive the payment code from.
     * @returns {Promise<string>} A promise that resolves to the Base58-encoded BIP47 payment code.
     */
    public getPaymentCode(account: number = 0): string {
        const privatePcode = this._getPaymentCodePrivate(account);
        return privatePcode.toBase58();
    }

    /**
     * Generates a BIP47 private payment code for the specified account. The payment code is created by combining the
     * account's public key and chain code.
     *
     * @private
     * @param {number} account - The account index for which to generate the private payment code.
     * @returns {Promise<PaymentCodePrivate>} A promise that resolves to the PaymentCodePrivate instance.
     */
    private _getPaymentCodePrivate(account: number): PaymentCodePrivate {
        const bip32 = BIP32Factory(ecc) as BIP32API;

        const accountNode = this._root.deriveChild(account + HARDENED_OFFSET);

        // payment code array
        const pc = new Uint8Array(80);

        // set version + options
        pc.set([1, 0]);

        // set the public key
        const pubKey = accountNode.publicKey;
        pc.set(getBytes(pubKey), 2);

        // set the chain code
        const chainCode = accountNode.chainCode;
        pc.set(getBytes(chainCode), 35);

        const adapter = new HDNodeBIP32Adapter(accountNode);

        return new PaymentCodePrivate(adapter, ecc, bip32, pc);
    }

    /**
     * Generates a payment address for sending funds to the specified receiver's BIP47 payment code. Uses Diffie-Hellman
     * key exchange to derive the address from the receiver's public key and sender's private key.
     *
     * @param {string} receiverPaymentCode - The Base58-encoded BIP47 payment code of the receiver.
     * @returns {Promise<string>} A promise that resolves to the payment address for sending funds.
     * @throws {Error} Throws an error if the payment code version is invalid.
     */
    public getNextSendAddress(receiverPaymentCode: string, zone: Zone, account: number = 0): QiAddressInfo {
        const bip32 = BIP32Factory(ecc) as BIP32API;
        const buf = bs58check.decode(receiverPaymentCode);
        const version = buf[0];
        if (version !== PC_VERSION) throw new Error('Invalid payment code version');

        const walletPCodePrivate = this._getPaymentCodePrivate(account);
        const receiverPCodePublic = new PaymentCodePublic(ecc, bip32, buf.slice(1));

        const paymentCodeInfoArray = this._paymentCodeSendAddressMap.get(receiverPaymentCode);
        const lastIndex = this._findLastUsedIndex(paymentCodeInfoArray, account, zone);

        let addrIndex = lastIndex + 1;
        for (let attempts = 0; attempts < MAX_ADDRESS_DERIVATION_ATTEMPTS; attempts++) {
            const address = receiverPCodePublic.getPaymentAddress(walletPCodePrivate, addrIndex);
            if (this.isValidAddressForZone(address, zone)) {
                const pubkey = receiverPCodePublic.derivePaymentPublicKey(walletPCodePrivate, addrIndex);
                const pcInfo: QiAddressInfo = {
                    address,
                    pubKey: hexlify(pubkey),
                    index: addrIndex,
                    account,
                    zone,
                    change: false,
                    status: AddressStatus.UNKNOWN,
                    derivationPath: receiverPaymentCode,
                    lastSyncedBlock: null,
                };
                if (paymentCodeInfoArray) {
                    paymentCodeInfoArray.push(pcInfo);
                } else {
                    this._paymentCodeSendAddressMap.set(receiverPaymentCode, [pcInfo]);
                }
                return pcInfo;
            }
            addrIndex++;
        }

        throw new Error(
            `Failed to derive a valid address for the zone ${zone} after ${MAX_ADDRESS_DERIVATION_ATTEMPTS} attempts.`,
        );
    }

    /**
     * Generates a payment address for receiving funds from the specified sender's BIP47 payment code. Uses
     * Diffie-Hellman key exchange to derive the address from the sender's public key and receiver's private key.
     *
     * @param {string} senderPaymentCode - The Base58-encoded BIP47 payment code of the sender.
     * @returns {Promise<string>} A promise that resolves to the payment address for receiving funds.
     * @throws {Error} Throws an error if the payment code version is invalid.
     */
    public getNextReceiveAddress(senderPaymentCode: string, zone: Zone, account: number = 0): QiAddressInfo {
        const bip32 = BIP32Factory(ecc) as BIP32API;
        const buf = bs58check.decode(senderPaymentCode);
        const version = buf[0];
        if (version !== PC_VERSION) throw new Error('Invalid payment code version');

        const senderPCodePublic = new PaymentCodePublic(ecc, bip32, buf.slice(1));
        const walletPCodePrivate = this._getPaymentCodePrivate(account);

        const paymentCodeInfoArray = this._addressesMap.get(senderPaymentCode);
        const lastIndex = this._findLastUsedIndex(paymentCodeInfoArray, account, zone);

        let addrIndex = lastIndex + 1;
        for (let attempts = 0; attempts < MAX_ADDRESS_DERIVATION_ATTEMPTS; attempts++) {
            const address = walletPCodePrivate.getPaymentAddress(senderPCodePublic, addrIndex);
            if (this.isValidAddressForZone(address, zone)) {
                const pubkey = walletPCodePrivate.derivePaymentPublicKey(senderPCodePublic, addrIndex);
                const pcInfo: QiAddressInfo = {
                    address,
                    pubKey: hexlify(pubkey),
                    index: addrIndex,
                    account,
                    zone,
                    change: false,
                    status: AddressStatus.UNKNOWN,
                    derivationPath: senderPaymentCode,
                    lastSyncedBlock: null,
                };
                if (paymentCodeInfoArray) {
                    paymentCodeInfoArray.push(pcInfo);
                } else {
                    this._addressesMap.set(senderPaymentCode, [pcInfo]);
                }
                return pcInfo;
            }
            addrIndex++;
        }

        throw new Error(
            `Failed to derive a valid address for the zone ${zone} after ${MAX_ADDRESS_DERIVATION_ATTEMPTS} attempts.`,
        );
    }

    /**
     * Receives a payment code and stores it in the wallet for future use. If the payment code is already in the wallet,
     * it will be ignored.
     *
     * @param {string} paymentCode - The payment code to store.
     */
    public openChannel(paymentCode: string): void {
        if (!validatePaymentCode(paymentCode)) {
            throw new Error(`Invalid payment code: ${paymentCode}`);
        }
        if (!this._addressesMap.has(paymentCode)) {
            this._addressesMap.set(paymentCode, []);
        }

        if (!this._paymentCodeSendAddressMap.has(paymentCode)) {
            this._paymentCodeSendAddressMap.set(paymentCode, []);
        }
    }

    public channelIsOpen(paymentCode: string): boolean {
        return this._addressesMap.has(paymentCode) && this._paymentCodeSendAddressMap.has(paymentCode);
    }

    /**
     * Gets the address info for a given address.
     *
     * @param {string} address - The address.
     * @returns {QiAddressInfo | null} The address info or null if not found.
     */
    public getAddressInfo(address: string): QiAddressInfo | null {
        const externalAddressInfo = this._addressesMap.get('BIP44:external')?.find((addr) => addr.address === address);
        if (!externalAddressInfo) {
            return null;
        }
        return externalAddressInfo;
    }

    /**
     * Gets the address info for a given address.
     *
     * @param {string} address - The address.
     * @returns {QiAddressInfo | null} The address info or null if not found.
     */
    public getChangeAddressInfo(address: string): QiAddressInfo | null {
        const changeAddressInfo = this._addressesMap.get('BIP44:change')?.find((addr) => addr.address === address);
        if (!changeAddressInfo) {
            return null;
        }
        return changeAddressInfo;
    }

    /**
     * Imports a private key and adds it to the wallet.
     *
     * @param {string} privateKey - The private key to import (hex string)
     * @returns {Promise<QiAddressInfo>} The address information for the imported key
     * @throws {Error} If the private key is invalid or the address is already in use
     */
    public async importPrivateKey(privateKey: string): Promise<QiAddressInfo> {
        if (!isHexString(privateKey, 32)) {
            throw new Error(`Invalid private key format: must be 32-byte hex string (got ${privateKey})`);
        }

        const pubKey = SigningKey.computePublicKey(privateKey, true);
        const address = computeAddress(pubKey);

        // Validate address is for correct zone and ledger
        const addressZone = getZoneForAddress(address);
        if (!addressZone) {
            throw new Error(`Private key does not correspond to a valid address for any zone (got ${address})`);
        }
        if (!isQiAddress(address)) {
            throw new Error(`Private key does not correspond to a valid Qi address (got ${address})`);
        }

        for (const [path, addresses] of this._addressesMap.entries()) {
            if (addresses.some((info) => info.address === address)) {
                throw new Error(`Address ${address} already exists in wallet under path ${path}`);
            }
        }

        const addressInfo: QiAddressInfo = {
            pubKey,
            address,
            account: 0,
            index: -1,
            change: false,
            zone: addressZone,
            status: AddressStatus.UNUSED,
            derivationPath: privateKey, // Store private key in derivationPath
            lastSyncedBlock: null,
        };

        this._addressesMap.get(QiHDWallet.PRIVATE_KEYS_PATH)!.push(addressInfo);

        return addressInfo;
    }

    /**
     * Gets all addresses that were imported via private keys.
     *
     * @param {Zone} [zone] - Optional zone to filter addresses by
     * @returns {QiAddressInfo[]} Array of address info objects for imported addresses
     */
    public getImportedAddresses(zone?: Zone): QiAddressInfo[] {
        const importedAddresses = this._addressesMap.get(QiHDWallet.PRIVATE_KEYS_PATH) || [];

        if (zone !== undefined) {
            this.validateZone(zone);
            return importedAddresses.filter((info) => info.zone === zone);
        }

        return [...importedAddresses];
    }

    /**
     * Adds a new address to the wallet.
     *
     * @param {number} account - The account number.
     * @param {number} addressIndex - The address index.
     * @returns {QiAddressInfo} The address info for the new address.
     */
    public addAddress(account: number, addressIndex: number): QiAddressInfo {
        if (account < 0 || addressIndex < 0) {
            throw new Error('Account and address index must be non-negative integers');
        }
        return this._addAddress(account, addressIndex, false);
    }

    /**
     * Adds a new change address to the wallet.
     *
     * @param {number} account - The account number.
     * @param {number} addressIndex - The address index.
     * @returns {QiAddressInfo} The address info for the new address.
     */
    public addChangeAddress(account: number, addressIndex: number): QiAddressInfo {
        if (account < 0 || addressIndex < 0) {
            throw new Error('Account and address index must be non-negative integers');
        }
        return this._addAddress(account, addressIndex, true);
    }

    private _addAddress(account: number, addressIndex: number, isChange: boolean): QiAddressInfo {
        const derivationPath = isChange ? 'BIP44:change' : 'BIP44:external';

        const existingAddresses = this._addressesMap.get(derivationPath) || [];
        if (existingAddresses.some((info) => info.index === addressIndex)) {
            throw new Error(`Address index ${addressIndex} already exists in wallet under path ${derivationPath}`);
        }
        const addressNode = this._getAddressNode(account, isChange, addressIndex);
        const zone = getZoneForAddress(addressNode.address);
        if (!zone) {
            throw new Error(`Failed to derive a Qi valid address zone for the index ${addressIndex}`);
        }

        if (!isQiAddress(addressNode.address)) {
            throw new Error(`Address ${addressNode.address} is not a valid Qi address`);
        }

        return this._createAndStoreQiAddressInfo(addressNode, account, zone, isChange);
    }

    /**
     * Gets the addresses for a given account.
     *
     * @param {number} account - The account number.
     * @returns {QiAddressInfo[]} The addresses for the account.
     */
    public getAddressesForAccount(account: number): QiAddressInfo[] {
        const addresses = this._addressesMap.values();
        return Array.from(addresses)
            .flat()
            .filter((info) => info.account === account);
    }
}
