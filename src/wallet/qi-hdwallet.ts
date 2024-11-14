import {
    AbstractHDWallet,
    NeuteredAddressInfo,
    SerializedHDWallet,
    _guard,
    MAX_ADDRESS_DERIVATION_ATTEMPTS,
    HARDENED_OFFSET,
} from './hdwallet.js';
import { HDNodeWallet } from './hdnodewallet.js';
import { QiTransactionRequest, Provider, TransactionResponse } from '../providers/index.js';
import { computeAddress, isQiAddress } from '../address/index.js';
import { getBytes, getZoneForAddress, hexlify, isHexString, toQuantity } from '../utils/index.js';
import { TransactionLike, QiTransaction, TxInput, FewestCoinSelector } from '../transaction/index.js';
import { MuSigFactory } from '@brandonblack/musig';
import { schnorr } from '@noble/curves/secp256k1';
import { keccak256, musigCrypto, SigningKey } from '../crypto/index.js';
import { Outpoint, UTXO, denominations } from '../transaction/utxo.js';
import { AllowedCoinType, Shard, toShard, Zone } from '../constants/index.js';
import { Mnemonic } from './mnemonic.js';
import { PaymentCodePrivate, PaymentCodePublic, PC_VERSION, validatePaymentCode } from './payment-codes.js';
import { BIP32Factory } from './bip32/bip32.js';
import { bs58check } from './bip32/crypto.js';
import { type BIP32API, HDNodeBIP32Adapter } from './bip32/types.js';
import ecc from '@bitcoinerlab/secp256k1';
import { SelectedCoinsResult } from '../transaction/abstract-coinselector.js';
import { QiPerformActionTransaction } from '../providers/abstract-provider.js';

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

/**
 * Interface representing an address in the Qi HD wallet.
 *
 * @extends NeuteredAddressInfo
 */
export interface QiAddressInfo extends NeuteredAddressInfo {
    change: boolean;
    status: AddressStatus;
    derivationPath: DerivationPath;
}

/**
 * @extends SerializedHDWallet
 * @property {OutpointInfo[]} outpoints - Array of outpoint information.
 * @property {QiAddressInfo[]} changeAddresses - Array of change addresses.
 * @property {QiAddressInfo[]} gapAddresses - Array of gap addresses.
 * @property {QiAddressInfo[]} gapChangeAddresses - Array of gap change addresses.
 * @interface SerializedQiHDWallet
 */
export interface SerializedQiHDWallet extends SerializedHDWallet {
    outpoints: OutpointInfo[];
    pendingOutpoints: OutpointInfo[];
    addresses: Array<QiAddressInfo>;
    senderPaymentCodeInfo: { [key: string]: QiAddressInfo[] };
}

type AddressUsageCallback = (address: string) => Promise<boolean>;

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
    protected _availableOutpoints: OutpointInfo[] = [];

    /**
     * Map of outpoints that are pending confirmation of being spent.
     */
    protected _pendingOutpoints: OutpointInfo[] = [];

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
        const filteredAddresses = addresses?.filter(
            (addressInfo) => addressInfo.account === account && addressInfo.zone === zone,
        );
        return filteredAddresses?.reduce((maxIndex, addressInfo) => Math.max(maxIndex, addressInfo.index), -1) || -1;
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
        const addresses = this._addressesMap.get(isChange ? 'BIP44:change' : 'BIP44:external') || [];
        const lastIndex = this._findLastUsedIndex(addresses, account, zone);
        const addressNode = this.deriveNextAddressNode(account, lastIndex + 1, zone, isChange);

        const privateKeysArray = this._addressesMap.get(QiHDWallet.PRIVATE_KEYS_PATH) || [];
        const existingPrivateKeyIndex = privateKeysArray.findIndex((info) => info.address === addressNode.address);
        if (existingPrivateKeyIndex !== -1) {
            privateKeysArray.splice(existingPrivateKeyIndex, 1);
            this._addressesMap.set(QiHDWallet.PRIVATE_KEYS_PATH, privateKeysArray);
        }

        const newAddrInfo = {
            pubKey: addressNode.publicKey,
            address: addressNode.address,
            account,
            index: addressNode.index,
            change: isChange,
            zone,
            status: AddressStatus.UNUSED,
            derivationPath: isChange ? 'BIP44:change' : 'BIP44:external',
        };
        this._addressesMap.get(isChange ? 'BIP44:change' : 'BIP44:external')?.push(newAddrInfo);
        return newAddrInfo;
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

        // check if any of the outpoints are already in the availableOutpoints
        const newOutpoints = outpoints.filter(
            (outpoint) =>
                !this._availableOutpoints.some(
                    (o) =>
                        o.outpoint.txhash === outpoint.outpoint.txhash && o.outpoint.index === outpoint.outpoint.index,
                ),
        );
        this._availableOutpoints.push(...newOutpoints);
    }

    /**
     * Gets the outpoints for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {OutpointInfo[]} The outpoints for the zone.
     */
    public getOutpoints(zone: Zone): OutpointInfo[] {
        this.validateZone(zone);
        return this._availableOutpoints.filter((outpoint) => outpoint.zone === zone);
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
     * Gets the **total** balance for the specified zone, including locked UTXOs.
     *
     * @param {Zone} zone - The zone to get the balance for.
     * @returns {bigint} The total balance for the zone.
     */
    public getBalanceForZone(zone: Zone): bigint {
        this.validateZone(zone);

        return this._availableOutpoints
            .filter((outpoint) => outpoint.zone === zone)
            .reduce((total, outpoint) => {
                const denominationValue = denominations[outpoint.outpoint.denomination];
                return total + denominationValue;
            }, BigInt(0));
    }

    /**
     * Gets the locked balance for the specified zone.
     *
     * @param {Zone} zone - The zone to get the locked balance for.
     * @returns {bigint} The locked balance for the zone.
     */
    public async getSpendableBalanceForZone(zone: Zone, blockNumber?: number): Promise<bigint> {
        this.validateZone(zone);
        if (!this.provider) {
            throw new Error('Provider is not set');
        }
        if (!blockNumber) {
            blockNumber = await this.provider.getBlockNumber(toShard(zone));
        }
        return this._availableOutpoints
            .filter((utxo) => utxo.outpoint.lock === 0 || utxo.outpoint.lock! < blockNumber!)
            .reduce((total, utxo) => {
                const denominationValue = denominations[utxo.outpoint.denomination];
                return total + denominationValue;
            }, BigInt(0));
    }

    /**
     * Gets the locked balance for the specified zone.
     *
     * @param {Zone} zone - The zone to get the locked balance for.
     * @returns {bigint} The locked balance for the zone.
     */
    public async getLockedBalanceForZone(zone: Zone, blockNumber?: number): Promise<bigint> {
        this.validateZone(zone);
        if (!this.provider) {
            throw new Error('Provider is not set');
        }
        if (!blockNumber) {
            blockNumber = await this.provider.getBlockNumber(toShard(zone));
        }
        return this._availableOutpoints
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
     * @param {number} [minDenominationToUse] - The minimum denomination to allow for the UTXOs.
     * @returns {UTXO[]} An array of UTXO objects.
     */
    private outpointsToUTXOs(zone: Zone, minDenominationToUse?: number): UTXO[] {
        this.validateZone(zone);
        let zoneOutpoints = this._availableOutpoints.filter((outpointInfo) => outpointInfo.zone === zone);

        // Filter outpoints by minimum denomination if specified
        // This will likely only be used for converting to Quai
        // as the min denomination for converting is 10 (100 Qi)
        if (minDenominationToUse !== undefined) {
            zoneOutpoints = zoneOutpoints.filter(
                (outpointInfo) => outpointInfo.outpoint.denomination >= minDenominationToUse,
            );
        }
        return zoneOutpoints.map((outpointInfo) => {
            const utxo = new UTXO();
            utxo.txhash = outpointInfo.outpoint.txhash;
            utxo.index = outpointInfo.outpoint.index;
            utxo.address = outpointInfo.address;
            utxo.denomination = outpointInfo.outpoint.denomination;
            utxo.lock = outpointInfo.outpoint.lock ?? null;
            return utxo;
        });
    }

    private async prepareAndSendTransaction(
        amount: bigint,
        originZone: Zone,
        getDestinationAddresses: (count: number) => Promise<string[]>,
        minDenominationToUse?: number,
    ): Promise<TransactionResponse> {
        if (!this.provider) {
            throw new Error('Provider is not set');
        }

        // 1. Check the wallet has enough balance in the originating zone to send the transaction
        const currentBlock = await this.provider.getBlockNumber(originZone as unknown as Shard);
        const balance = await this.getSpendableBalanceForZone(originZone, currentBlock);
        if (balance < amount) {
            throw new Error(
                `Insufficient balance in the originating zone: want ${Number(amount) / 1000} Qi got ${balance} Qi`,
            );
        }

        // 2. Select the UXTOs from the specified zone to use as inputs, and generate the spend and change outputs
        const zoneUTXOs = this.outpointsToUTXOs(originZone, minDenominationToUse);
        if (zoneUTXOs.length === 0) {
            if (minDenominationToUse === 10) {
                throw new Error('Qi denominations too small to convert.');
            } else {
                throw new Error('No Qi available in zone.');
            }
        }

        const unlockedUTXOs = zoneUTXOs.filter((utxo) => utxo.lock === 0 || utxo.lock! < currentBlock);
        if (unlockedUTXOs.length === 0) {
            throw new Error('Insufficient spendable balance in zone.');
        }

        const fewestCoinSelector = new FewestCoinSelector(unlockedUTXOs);

        const spendTarget: bigint = amount;
        let selection = fewestCoinSelector.performSelection(spendTarget);

        // 3. Generate as many unused addresses as required to populate the spend outputs
        const sendAddresses = await getDestinationAddresses(selection.spendOutputs.length);

        const getChangeAddressesForOutputs = async (count: number): Promise<string[]> => {
            const currentChangeAddresses = this._addressesMap.get('BIP44:change') || [];
            const outpusChangeAddresses: QiAddressInfo[] = [];

            for (let i = 0; i < currentChangeAddresses.length; i++) {
                if (currentChangeAddresses[i].status === AddressStatus.UNUSED) {
                    outpusChangeAddresses.push(currentChangeAddresses[i]);
                }

                if (outpusChangeAddresses.length === count) break;
            }

            // Generate the remaining number of change addresses if needed
            const remainingAddressesNeeded = count - outpusChangeAddresses.length;
            if (remainingAddressesNeeded > 0) {
                outpusChangeAddresses.push(
                    ...Array(remainingAddressesNeeded)
                        .fill(0)
                        .map(() => this.getNextChangeAddressSync(0, originZone)),
                );
            }

            // Combine the existing change addresses with the newly generated addresses and ensure they are unique and sorted by index
            const mergedChangeAddresses = [
                ...outpusChangeAddresses.map((address) => ({ ...address, status: AddressStatus.ATTEMPTED_USE })),
                ...currentChangeAddresses,
            ];
            const sortedAndFilteredChangeAddresses = mergedChangeAddresses
                .filter((address, index, self) => self.findIndex((t) => t.address === address.address) === index)
                .sort((a, b) => a.index - b.index);

            // Update the _addressesMap with the modified change addresses and statuses
            this._addressesMap.set('BIP44:change', sortedAndFilteredChangeAddresses);

            return outpusChangeAddresses.map((address) => address.address);
        };

        // 4. Get change addresses
        const changeAddresses = await getChangeAddressesForOutputs(selection.changeOutputs.length);

        // 5. Create the transaction and sign it using the signTransaction method
        let inputPubKeys = selection.inputs.map((input) => this.locateAddressInfo(input.address)?.pubKey);
        if (inputPubKeys.some((pubkey) => !pubkey)) {
            throw new Error('Missing public key for input address');
        }

        let attempts = 0;
        let finalFee = 0n;
        const MAX_FEE_ESTIMATION_ATTEMPTS = 5;

        while (attempts < MAX_FEE_ESTIMATION_ATTEMPTS) {
            const feeEstimationTx = this.prepareFeeEstimationTransaction(
                selection,
                inputPubKeys.map((pubkey) => pubkey!),
                sendAddresses,
                changeAddresses,
            );

            finalFee = await this.provider.estimateFeeForQi(feeEstimationTx);

            // Get new selection with updated fee 2x
            selection = fewestCoinSelector.performSelection(spendTarget, finalFee * 2n);

            // Determine if new addresses are needed for the change outputs
            const changeAddressesNeeded = selection.changeOutputs.length - changeAddresses.length;
            if (changeAddressesNeeded > 0) {
                // Need more change addresses
                const newChangeAddresses = await getChangeAddressesForOutputs(changeAddressesNeeded);
                changeAddresses.push(...newChangeAddresses);
            } else if (changeAddressesNeeded < 0) {
                // Have extra change addresses, remove the addresses starting from the end
                // TODO: Set the status of the addresses to UNUSED in _addressesMap. This fine for now as it will be fixed during next sync
                changeAddresses.splice(changeAddressesNeeded);
            }

            // Determine if new addresses are needed for the spend outputs
            const spendAddressesNeeded = selection.spendOutputs.length - sendAddresses.length;
            if (spendAddressesNeeded > 0) {
                // Need more send addresses
                const newSendAddresses = await getDestinationAddresses(spendAddressesNeeded);
                sendAddresses.push(...newSendAddresses);
            } else if (spendAddressesNeeded < 0) {
                // Have extra send addresses, remove the excess
                // TODO: Set the status of the addresses to UNUSED in _addressesMap. This fine for now as it will be fixed during next sync
                sendAddresses.splice(spendAddressesNeeded);
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

        // Move used outpoints to pendingOutpoints
        this.moveOutpointsToPending(tx.txInputs);

        // Sign the transaction
        const signedTx = await this.signTransaction(tx);

        // Broadcast the transaction to the network using the provider
        return this.provider.broadcastTransaction(originZone, signedTx);
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

        return this.prepareAndSendTransaction(amount, zone, getDestinationAddresses, 10);
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

        return this.prepareAndSendTransaction(amount, originZone, getDestinationAddresses);
    }

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
     * Checks the status of pending outpoints and updates the wallet's UTXO set accordingly.
     *
     * @param zone The zone in which to check the pending outpoints.
     */
    private async checkPendingOutpoints(zone: Zone): Promise<void> {
        // Create a copy to iterate over, as we'll be modifying the _pendingOutpoints array
        const pendingOutpoints = [...this._pendingOutpoints.filter((info) => info.zone === zone)];

        const uniqueAddresses = new Set<string>(pendingOutpoints.map((info) => info.address));
        let outpointsByAddress: Outpoint[] = [];
        try {
            outpointsByAddress = (
                await Promise.all(Array.from(uniqueAddresses).map((address) => this.getOutpointsByAddress(address)))
            ).flat();
        } catch (error) {
            console.error('Error getting outpoints by address', error);
        }

        const allOutpointsByAddress = outpointsByAddress.flat();

        for (const outpointInfo of pendingOutpoints) {
            const isSpent = !allOutpointsByAddress.some(
                (outpoint) =>
                    outpoint.txhash === outpointInfo.outpoint.txhash && outpoint.index === outpointInfo.outpoint.index,
            );

            if (isSpent) {
                // Outpoint has been spent; remove it from pendingOutpoints
                this.removeOutpointFromPending(outpointInfo.outpoint);
            } else {
                // Outpoint is still unspent; move it back to available outpoints
                this.moveOutpointToAvailable(outpointInfo);
            }
        }
    }

    /**
     * Moves specified inputs to pending outpoints.
     *
     * @param inputs List of inputs used in the transaction.
     */
    private moveOutpointsToPending(inputs: TxInput[]): void {
        inputs.forEach((input) => {
            const index = this._availableOutpoints.findIndex(
                (outpointInfo) =>
                    outpointInfo.outpoint.txhash === input.txhash && outpointInfo.outpoint.index === input.index,
            );
            if (index !== -1) {
                const [outpointInfo] = this._availableOutpoints.splice(index, 1);
                this._pendingOutpoints.push(outpointInfo);
            }
        });
    }

    /**
     * Removes an outpoint from the pending outpoints.
     *
     * @param outpoint The outpoint to remove.
     */
    private removeOutpointFromPending(outpoint: Outpoint): void {
        this._pendingOutpoints = this._pendingOutpoints.filter(
            (info) => !(info.outpoint.txhash === outpoint.txhash && info.outpoint.index === outpoint.index),
        );
    }

    /**
     * Moves an outpoint from pending back to available outpoints.
     *
     * @param outpointInfo The outpoint info to move.
     */
    private moveOutpointToAvailable(outpointInfo: OutpointInfo): void {
        this.removeOutpointFromPending(outpointInfo.outpoint);
        this._availableOutpoints.push(outpointInfo);
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
            const changeIndex = addressInfo.change ? 1 : 0;
            const addressNode = this._root
                .deriveChild(addressInfo.account + HARDENED_OFFSET)
                .deriveChild(changeIndex)
                .deriveChild(addressInfo.index);
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
                addresses.map((addr) => ({ ...addr, status: AddressStatus.UNKNOWN })),
            ]),
        );

        // flush available and pending outpoints
        this._availableOutpoints = [];
        this._pendingOutpoints = [];

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
    public async sync(zone: Zone, account: number = 0): Promise<void> {
        this.validateZone(zone);
        await this._scan(zone, account);
        await this.checkPendingOutpoints(zone);
    }

    /**
     * Internal method to scan the specified zone for addresses with unspent outputs. This method handles the actual
     * scanning logic, generating new addresses until the gap limit is reached for both gap and change addresses.
     *
     * @param {Zone} zone - The zone in which to scan for addresses.
     * @param {number} [account=0] - The index of the account to scan. Default is `0`
     * @returns {Promise<void>} A promise that resolves when the scan is complete.
     * @throws {Error} If the provider is not set.
     */
    private async _scan(zone: Zone, account: number = 0): Promise<void> {
        if (!this.provider) throw new Error('Provider not set');

        const derivationPaths: DerivationPath[] = ['BIP44:external', 'BIP44:change', ...this.openChannels];

        await Promise.all(derivationPaths.map((path) => this._scanDerivationPath(path, zone, account)));
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
    private async _scanDerivationPath(path: DerivationPath, zone: Zone, account: number): Promise<void> {
        const addresses = this._addressesMap.get(path) || [];
        let consecutiveUnusedCount = 0;
        const checkStatuses = [AddressStatus.UNKNOWN, AddressStatus.ATTEMPTED_USE, AddressStatus.UNUSED];

        // Check existing addresses
        for (let i = 0; i < addresses.length; i++) {
            const addr = addresses[i];
            if (checkStatuses.includes(addr.status)) {
                const { isUsed, outpoints } = await this.checkAddressUse(addr.address);
                addresses[i].status = isUsed ? AddressStatus.USED : AddressStatus.UNUSED;

                // import outpoints if any are found
                if (outpoints.length > 0) {
                    this.importOutpoints(
                        outpoints.map((outpoint) => ({
                            outpoint,
                            address: addr.address,
                            zone: addr.zone,
                            account: addr.account,
                        })),
                    );
                }
            }

            if (addr.status === AddressStatus.USED) {
                consecutiveUnusedCount = 0;
            } else {
                consecutiveUnusedCount++;
            }

            // If the consecutive unused count has reached the gap limit, break
            if (consecutiveUnusedCount >= QiHDWallet._GAP_LIMIT) break;
        }

        // Generate new addresses if needed
        while (consecutiveUnusedCount < QiHDWallet._GAP_LIMIT) {
            const isChange = path.endsWith(':change');

            const newAddrInfo = path.includes('BIP44')
                ? this._getNextQiAddress(account, zone, isChange)
                : this.getNextReceiveAddress(path, zone, account);

            const { isUsed, outpoints } = await this.checkAddressUse(newAddrInfo.address);
            newAddrInfo.status = isUsed ? AddressStatus.USED : AddressStatus.UNUSED;

            // import outpoints if any are found
            if (outpoints.length > 0) {
                this.importOutpoints(
                    outpoints.map((outpoint) => ({
                        outpoint,
                        address: newAddrInfo.address,
                        zone: newAddrInfo.zone,
                        account: newAddrInfo.account,
                    })),
                );
            }

            if (newAddrInfo.status === AddressStatus.USED) {
                consecutiveUnusedCount = 0;
            } else {
                consecutiveUnusedCount++;
            }
        }
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
        const digest = keccak256(message);
        const signature = schnorr.sign(digest, getBytes(privKey));
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
            outpoints: this._availableOutpoints,
            pendingOutpoints: this._pendingOutpoints,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            addresses: Array.from(this._addressesMap.entries()).flatMap(([_, addresses]) => addresses),
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

        const validateQiAddressInfo = (addressInfo: QiAddressInfo): void => {
            wallet.validateNeuteredAddressInfo(addressInfo);

            if (!Object.values(AddressStatus).includes(addressInfo.status)) {
                throw new Error(`Invalid QiAddressInfo: status '${addressInfo.status}' is not a valid AddressStatus`);
            }

            if (
                addressInfo.derivationPath !== 'BIP44:external' &&
                addressInfo.derivationPath !== 'BIP44:change' &&
                !validatePaymentCode(addressInfo.derivationPath)
            ) {
                throw new Error(
                    `Invalid QiAddressInfo: derivationPath '${addressInfo.derivationPath}' is not valid. It should be 'BIP44:external', 'BIP44:change', or a valid BIP47 payment code`,
                );
            }
        };

        // First, group addresses by derivation path
        const addressesByPath = new Map<string, QiAddressInfo[]>();
        for (const addressInfo of serialized.addresses) {
            validateQiAddressInfo(addressInfo);
            let key = addressInfo.derivationPath;
            if (isHexString(key, 32)) {
                key = QiHDWallet.PRIVATE_KEYS_PATH;
            }

            if (!addressesByPath.has(key)) {
                addressesByPath.set(key, []);
            }
            addressesByPath.get(key)!.push(addressInfo);
        }

        // Then, set all paths in the wallet's address map
        for (const [key, addresses] of addressesByPath) {
            wallet._addressesMap.set(key, addresses);
        }

        // validate and import the counter party payment code info
        for (const [paymentCode, paymentCodeInfoArray] of Object.entries(serialized.senderPaymentCodeInfo)) {
            if (!validatePaymentCode(paymentCode)) {
                throw new Error(`Invalid payment code: ${paymentCode}`);
            }
            for (const pcInfo of paymentCodeInfoArray) {
                validateQiAddressInfo(pcInfo);
            }
            wallet._paymentCodeSendAddressMap.set(paymentCode, paymentCodeInfoArray);
        }

        // validate the available outpoints and import them
        wallet.validateOutpointInfo(serialized.outpoints);
        wallet._availableOutpoints.push(...serialized.outpoints);

        // validate the pending outpoints and import them
        wallet.validateOutpointInfo(serialized.pendingOutpoints);
        wallet._pendingOutpoints.push(...serialized.pendingOutpoints);

        return wallet;
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
                    status: AddressStatus.UNUSED,
                    derivationPath: receiverPaymentCode,
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
                    status: AddressStatus.UNUSED,
                    derivationPath: senderPaymentCode,
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
        return this._addAddress(account, addressIndex, true);
    }

    private _addAddress(account: number, addressIndex: number, isChange: boolean): QiAddressInfo {
        const derivationPath = isChange ? 'BIP44:change' : 'BIP44:external';

        const existingAddresses = this._addressesMap.get(derivationPath) || [];
        if (existingAddresses.some((info) => info.index === addressIndex)) {
            throw new Error(`Address index ${addressIndex} already exists in wallet under path ${derivationPath}`);
        }

        const addressNode = this._root
            .deriveChild(account + HARDENED_OFFSET)
            .deriveChild(isChange ? 1 : 0)
            .deriveChild(addressIndex);
        const zone = getZoneForAddress(addressNode.address);
        if (!zone) {
            throw new Error(`Failed to derive a Qi valid address zone for the index ${addressIndex}`);
        }

        if (!isQiAddress(addressNode.address)) {
            throw new Error(`Address ${addressNode.address} is not a valid Qi address`);
        }

        const addressInfo: QiAddressInfo = {
            pubKey: addressNode.publicKey,
            address: addressNode.address,
            account,
            index: addressIndex,
            change: isChange,
            zone,
            status: AddressStatus.UNUSED,
            derivationPath,
        };

        const addresses = this._addressesMap.get(derivationPath);
        if (!addresses) {
            this._addressesMap.set(derivationPath, [addressInfo]);
        } else {
            addresses.push(addressInfo);
        }

        return addressInfo;
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
