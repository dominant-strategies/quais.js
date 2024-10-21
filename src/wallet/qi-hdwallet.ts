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
import { getBytes, getZoneForAddress, hexlify } from '../utils/index.js';
import { TransactionLike, QiTransaction, TxInput, FewestCoinSelector } from '../transaction/index.js';
import { MuSigFactory } from '@brandonblack/musig';
import { schnorr } from '@noble/curves/secp256k1';
import { keccak256, musigCrypto } from '../crypto/index.js';
import { Outpoint, UTXO, denominations } from '../transaction/utxo.js';
import { AllowedCoinType, Zone } from '../constants/index.js';
import { Mnemonic } from './mnemonic.js';
import { PaymentCodePrivate, PaymentCodePublic, PC_VERSION, validatePaymentCode } from './payment-codes.js';
import { BIP32Factory } from './bip32/bip32.js';
import { bs58check } from './bip32/crypto.js';
import { type BIP32API, HDNodeBIP32Adapter } from './bip32/types.js';
import ecc from '@bitcoinerlab/secp256k1';
import { SelectedCoinsResult } from '../transaction/abstract-coinselector.js';

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
enum AddressStatus {
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
interface QiAddressInfo extends NeuteredAddressInfo {
    status: AddressStatus;
    counterpartyPaymentCode?: string;
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
    changeAddresses: QiAddressInfo[];
    gapAddresses: QiAddressInfo[];
    gapChangeAddresses: QiAddressInfo[];
    // usedGapAddresses: NeuteredAddressInfo[]; //! Do we need this?
    // usedGapChangeAddresses: NeuteredAddressInfo[]; //! Do we need this?
    receiverPaymentCodeInfo: { [key: string]: QiAddressInfo[] };
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
export class QiHDWallet extends AbstractHDWallet {
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
     * Finds the last used index in an array of QiAddressInfo objects.
     *
     * @param {QiAddressInfo[]} addresses - The array of QiAddressInfo objects.
     * @returns {number} The last used index.
     */
    private _findLastUsedIndex(addresses: QiAddressInfo[] | undefined): number {
        return addresses?.reduce((maxIndex, addressInfo) => Math.max(maxIndex, addressInfo.index), -1) || 0;
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
        const lastIndex = this._findLastUsedIndex(addresses);
        const addressNode = this.deriveNextAddressNode(account, lastIndex + 1, zone, isChange);
        const newAddrInfo = {
            pubKey: addressNode.publicKey,
            address: addressNode.address,
            account,
            index: addressNode.index,
            change: isChange,
            zone,
            status: AddressStatus.UNUSED,
        };
        addresses.push(newAddrInfo);
        this._addressesMap.set(isChange ? 'BIP44:change' : 'BIP44:external', addresses);
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
        return this._getNextQiAddress(account, zone, false);
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
    public async getNextChangeAddress(account: number, zone: Zone): Promise<NeuteredAddressInfo> {
        return Promise.resolve(this._getNextQiAddress(account, zone, true));
    }

    /**
     * Synchronously retrieves the next change address for the specified account and zone.
     *
     * @param {number} account - The index of the account for which to retrieve the next change address.
     * @param {Zone} zone - The zone in which to retrieve the next change address.
     * @returns {NeuteredAddressInfo} The next change neutered address information.
     */
    public getNextChangeAddressSync(account: number, zone: Zone): NeuteredAddressInfo {
        return this._getNextQiAddress(account, zone, true);
    }

    /**
     * Imports an array of outpoints.
     *
     * @param {OutpointInfo[]} outpoints - The outpoints to import.
     */
    public importOutpoints(outpoints: OutpointInfo[]): void {
        this.validateOutpointInfo(outpoints);
        this._availableOutpoints.push(...outpoints);
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

        const shouldUseSchnorrSignature = (inputs: TxInput[]): boolean => {
            if (inputs.length === 1) return true;
            const firstPubKey = inputs[0].pubkey;
            return inputs.every((input) => input.pubkey === firstPubKey);
        };

        let signature: string;
        if (shouldUseSchnorrSignature(txobj.txInputs)) {
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
     * Gets the balance for the specified zone.
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
     * Converts outpoints for a specific zone to UTXO format.
     *
     * @param {Zone} zone - The zone to filter outpoints for.
     * @returns {UTXO[]} An array of UTXO objects.
     */
    private outpointsToUTXOs(zone: Zone): UTXO[] {
        this.validateZone(zone);
        return this._availableOutpoints
            .filter((outpointInfo) => outpointInfo.zone === zone)
            .map((outpointInfo) => {
                const utxo = new UTXO();
                utxo.txhash = outpointInfo.outpoint.txhash;
                utxo.index = outpointInfo.outpoint.index;
                utxo.address = outpointInfo.address;
                utxo.denomination = outpointInfo.outpoint.denomination;
                return utxo;
            });
    }

    private async prepareAndSendTransaction(
        amount: bigint,
        originZone: Zone,
        getDestinationAddresses: (count: number) => Promise<string[]>,
    ): Promise<TransactionResponse> {
        if (!this.provider) {
            throw new Error('Provider is not set');
        }

        // 1. Check the wallet has enough balance in the originating zone to send the transaction
        const balance = this.getBalanceForZone(originZone);
        if (balance < amount) {
            throw new Error(`Insufficient balance in the originating zone: want ${amount} Qi got ${balance} Qi`);
        }

        // 2. Select the UXTOs from the specified zone to use as inputs, and generate the spend and change outputs
        const zoneUTXOs = this.outpointsToUTXOs(originZone);
        const fewestCoinSelector = new FewestCoinSelector(zoneUTXOs);

        const spendTarget: bigint = amount;
        let selection = fewestCoinSelector.performSelection(spendTarget);

        // 3. Generate as many unused addresses as required to populate the spend outputs
        const sendAddresses = await getDestinationAddresses(selection.spendOutputs.length);

        const getChangeAddresses = async (count: number): Promise<string[]> => {
            const changeAddresses = this._addressesMap.get('BIP44:change') || [];
            const gapLimit = QiHDWallet._GAP_LIMIT;
            const addresses: string[] = [];
            let lastUsedIndex = -1;
            let consecutiveUnusedCount = 0;

            // Find the last used index and count consecutive unused addresses
            for (let i = changeAddresses.length - 1; i >= 0; i--) {
                // ! we are assuming that the addresses are always in order according to their derivation index
                if (changeAddresses[i].status !== AddressStatus.UNUSED) {
                    lastUsedIndex = changeAddresses[i].index;
                    break;
                }
                consecutiveUnusedCount++;
            }

            // Generate new addresses until we have GAP_LIMIT consecutive unused addresses
            while (consecutiveUnusedCount < gapLimit) {
                const newChangeAddress = await this.getNextChangeAddress(0, originZone);
                const newChangeAddressInfo: QiAddressInfo = {
                    ...newChangeAddress,
                    status: AddressStatus.UNUSED,
                };
                changeAddresses.push(newChangeAddressInfo);
                consecutiveUnusedCount++;
            }

            // Select the first 'count' addresses within the GAP_LIMIT
            for (let i = lastUsedIndex + 1; i < changeAddresses.length && addresses.length < count; i++) {
                const addressInfo = changeAddresses[i];
                addresses.push(addressInfo.address);
                addressInfo.status = AddressStatus.ATTEMPTED_USE;
            }

            // Update the _addressesMap with the modified change addresses
            this._addressesMap.set('BIP44:change', changeAddresses);

            return addresses;
        };
        // 4. Get change addresses
        let changeAddresses = await getChangeAddresses(selection.changeOutputs.length);

        // 5. Create the transaction and sign it using the signTransaction method
        let inputPubKeys = selection.inputs.map((input) => this.locateAddressInfo(input.address)?.pubKey);
        if (inputPubKeys.some((pubkey) => !pubkey)) {
            throw new Error('Missing public key for input address');
        }

        const chainId = (await this.provider.getNetwork()).chainId;
        let tx = await this.prepareTransaction(
            selection,
            inputPubKeys.map((pubkey) => pubkey!),
            sendAddresses,
            changeAddresses,
            Number(chainId),
        );

        const gasLimit = await this.provider.estimateGas(tx);
        const gasPrice = denominations[1]; // 0.005 Qi
        const minerTip = (gasLimit * gasPrice) / 100n; // 1% extra as tip
        // const feeData = await this.provider.getFeeData(originZone, true);
        // const conversionRate = await this.provider.getLatestQuaiRate(originZone, feeData.gasPrice);

        // 5.6 Calculate total fee for the transaction using the gasLimit, gasPrice, and minerTip
        const totalFee = gasLimit * gasPrice + minerTip;

        // Get new selection with fee
        selection = fewestCoinSelector.performSelection(spendTarget, totalFee);

        // Determine if new addresses are needed for the change and spend outputs
        const changeAddressesNeeded = selection.changeOutputs.length - changeAddresses.length;
        if (changeAddressesNeeded > 0) {
            changeAddresses = await getChangeAddresses(changeAddressesNeeded);
        }

        const spendAddressesNeeded = selection.spendOutputs.length - sendAddresses.length;
        if (spendAddressesNeeded > 0) {
            const newSendAddresses = await getDestinationAddresses(spendAddressesNeeded);
            sendAddresses.push(...newSendAddresses);
        }

        inputPubKeys = selection.inputs.map((input) => this.locateAddressInfo(input.address)?.pubKey);

        tx = await this.prepareTransaction(
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

        return this.prepareAndSendTransaction(amount, zone, getDestinationAddresses);
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
        const privKeysSet = new Set<string>();
        tx.txInputs!.forEach((input) => {
            const privKey = this.getPrivateKeyForTxInput(input);
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
        const addressInfo = this.locateAddressInfo(address);

        if (!addressInfo) {
            throw new Error(`Address not found: ${address}`);
        }

        if (!('counterpartyPaymentCode' in addressInfo)) {
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
            const index = pcAddressInfo.index - 1;

            const counterpartyPaymentCode = pcAddressInfo.counterpartyPaymentCode;
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
        // flush the existing addresses and outpoints
        this._addressesMap = new Map();
        this._availableOutpoints = [];

        // Reset each map so that all keys have empty array values but keys are preserved
        const resetSenderPaymentCodeInfo = new Map(
            Array.from(this._paymentCodeSendAddressMap.keys()).map((key) => [key, []]),
        );

        this._paymentCodeSendAddressMap = resetSenderPaymentCodeInfo;

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

        const derivationPaths: DerivationPath[] = [
            'BIP44:external',
            'BIP44:change',
            ...Array.from(this._addressesMap.keys()).filter((path) => !path.startsWith('BIP44:')),
        ];

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

        // Check existing addresses
        for (let i = 0; i < addresses.length; i++) {
            const addr = addresses[i];
            if (addr.status === AddressStatus.UNKNOWN || addr.status === AddressStatus.ATTEMPTED_USE) {
                const isUsed = await this.checkAddressUse(addr.address);
                addr.status = isUsed ? AddressStatus.USED : AddressStatus.UNUSED;
            }

            if (addr.status === AddressStatus.USED) {
                consecutiveUnusedCount = 0;
            } else {
                consecutiveUnusedCount++;
            }

            if (consecutiveUnusedCount >= QiHDWallet._GAP_LIMIT && i >= QiHDWallet._GAP_LIMIT) {
                break;
            }
        }

        // Generate new addresses if needed
        while (consecutiveUnusedCount < QiHDWallet._GAP_LIMIT) {
            const isChange = path.endsWith(':change');
            const newAddrInfo = this._getNextQiAddress(account, zone, isChange);
            const isUsed = await this.checkAddressUse(newAddrInfo.address);
            newAddrInfo.status = isUsed ? AddressStatus.USED : AddressStatus.UNUSED;
            addresses.push(newAddrInfo);

            if (newAddrInfo.status === AddressStatus.USED) {
                consecutiveUnusedCount = 0;
            } else {
                consecutiveUnusedCount++;
            }
        }

        this._addressesMap.set(path, addresses);
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
                this.importOutpoints(
                    outpoints.map((outpoint) => ({
                        outpoint,
                        address,
                        zone: getZoneForAddress(address)!,
                        account: 0,
                    })),
                );
            } else if (this._addressUseChecker !== undefined && (await this._addressUseChecker(address))) {
                // address checker returned true, so the address is used
                //! How do we get the outpoints for the address?
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
    public getAddressForZone(zone: Zone): QiAddressInfo[] {
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
        return gapAddresses.filter((addressInfo) => addressInfo.zone === zone);
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
        return gapChangeAddresses.filter((addressInfo) => addressInfo.zone === zone);
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
        const addrNode = this._getHDNodeForAddress(address);
        const privKey = addrNode.privateKey;
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

        const getGapAddresses = (addresses: QiAddressInfo[]): QiAddressInfo[] => {
            const reversedAddresses = [...addresses].reverse();
            const gapAddresses: QiAddressInfo[] = [];
            for (const address of reversedAddresses) {
                if (address.status === AddressStatus.UNUSED) {
                    gapAddresses.push(address);
                } else {
                    break;
                }
            }
            return gapAddresses.reverse();
        };

        return {
            ...hdwalletSerialized,
            outpoints: this._availableOutpoints,
            pendingOutpoints: this._pendingOutpoints,
            addresses: Array.from(this._addressesMap.get('BIP44:external') || []),
            changeAddresses: Array.from(this._addressesMap.get('BIP44:change') || []),
            gapAddresses: getGapAddresses(this._addressesMap.get('BIP44:external') || []),
            gapChangeAddresses: getGapAddresses(this._addressesMap.get('BIP44:change') || []),
            // usedGapAddresses: this._usedGapAddresses, //! Do we need this?
            // usedGapChangeAddresses: this._usedGapChangeAddresses, //! Do we need this?
            receiverPaymentCodeInfo: Object.fromEntries(
                Array.from(this._addressesMap.entries())
                    .filter(([key]) => key !== 'BIP44:external' && key !== 'BIP44:change')
                    .map(([key, value]) => [key, Array.from(value)]),
            ),
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

        wallet.validateAndImportAddresses(serialized.addresses as QiAddressInfo[], 'BIP44:external'); //!Fix: cast to QiAddressInfo[]
        wallet.validateAndImportAddresses(serialized.changeAddresses, 'BIP44:change');

        // validate and import the payment code info
        wallet.validateAndImportCounterPartyPaymentCode(serialized.receiverPaymentCodeInfo);

        // validate the available outpoints and import them
        wallet.validateOutpointInfo(serialized.outpoints);
        wallet._availableOutpoints.push(...serialized.outpoints);

        // validate the pending outpoints and import them
        wallet.validateOutpointInfo(serialized.pendingOutpoints);
        wallet._pendingOutpoints.push(...serialized.pendingOutpoints);

        return wallet;
    }

    private validateAndImportAddresses = (addresses: QiAddressInfo[], path: DerivationPath) => {
        for (const addressInfo of addresses) {
            this.validateQiAddressInfo(addressInfo);
        }
        this._addressesMap.set(path, addresses);
    };

    /**
     * Validates and imports a map of payment code info.
     *
     * @param {Object<string, QiAddressInfo[]>} paymentCodeInfoMap - The map of payment code info to validate and
     *   import.
     * @throws {Error} If any of the payment code info is invalid.
     */
    private validateAndImportCounterPartyPaymentCode(paymentCodeInfoMap: { [key: string]: QiAddressInfo[] }): void {
        const targetMap = this._paymentCodeSendAddressMap;

        for (const [paymentCode, paymentCodeInfoArray] of Object.entries(paymentCodeInfoMap)) {
            if (!validatePaymentCode(paymentCode)) {
                throw new Error(`Invalid payment code: ${paymentCode}`);
            }
            for (const pcInfo of paymentCodeInfoArray) {
                this.validateQiAddressInfo(pcInfo);
            }
            targetMap.set(paymentCode, paymentCodeInfoArray);
        }
    }

    private validateQiAddressInfo(addressInfo: QiAddressInfo): void {
        this.validateNeuteredAddressInfo(addressInfo);

        if (!Object.values(AddressStatus).includes(addressInfo.status)) {
            throw new Error(`Invalid QiAddressInfo: status '${addressInfo.status}' is not a valid AddressStatus`);
        }

        if (
            addressInfo.counterpartyPaymentCode !== undefined &&
            !validatePaymentCode(addressInfo.counterpartyPaymentCode)
        ) {
            throw new Error(
                `Invalid QiAddressInfo: counterpartyPaymentCode '${addressInfo.counterpartyPaymentCode}' is not a valid payment code`,
            );
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

    // helper method to get a bip32 API instance
    private _getBIP32API(): BIP32API {
        return BIP32Factory(ecc) as BIP32API;
    }

    // helper method to decode a base58 string into a Uint8Array
    private _decodeBase58(base58: string): Uint8Array {
        return bs58check.decode(base58);
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
        const bip32 = this._getBIP32API();

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
        const bip32 = this._getBIP32API();
        const buf = this._decodeBase58(receiverPaymentCode);
        const version = buf[0];
        if (version !== PC_VERSION) throw new Error('Invalid payment code version');

        const walletPCodePrivate = this._getPaymentCodePrivate(account);
        const receiverPCodePublic = new PaymentCodePublic(ecc, bip32, buf.slice(1));

        const paymentCodeInfoArray = this._paymentCodeSendAddressMap.get(receiverPaymentCode);
        const lastIndex = this._findLastUsedIndex(paymentCodeInfoArray);

        let addrIndex = lastIndex;
        for (let attempts = 0; attempts < MAX_ADDRESS_DERIVATION_ATTEMPTS; attempts++) {
            const address = receiverPCodePublic.getPaymentAddress(walletPCodePrivate, addrIndex++);
            if (this.isValidAddressForZone(address, zone)) {
                const pubkey = receiverPCodePublic.derivePaymentPublicKey(walletPCodePrivate, addrIndex - 1);
                const pcInfo: QiAddressInfo = {
                    address,
                    pubKey: hexlify(pubkey),
                    index: addrIndex,
                    account,
                    zone,
                    change: false,
                    status: AddressStatus.UNUSED,
                };
                if (paymentCodeInfoArray) {
                    paymentCodeInfoArray.push(pcInfo);
                } else {
                    this._paymentCodeSendAddressMap.set(receiverPaymentCode, [pcInfo]);
                }
                return pcInfo;
            }
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
        const bip32 = this._getBIP32API();
        const buf = this._decodeBase58(senderPaymentCode);
        const version = buf[0];
        if (version !== PC_VERSION) throw new Error('Invalid payment code version');

        const senderPCodePublic = new PaymentCodePublic(ecc, bip32, buf.slice(1));
        const walletPCodePrivate = this._getPaymentCodePrivate(account);

        const paymentCodeInfoArray = this._addressesMap.get(senderPaymentCode);
        const lastIndex = this._findLastUsedIndex(paymentCodeInfoArray);

        let addrIndex = lastIndex;
        for (let attempts = 0; attempts < MAX_ADDRESS_DERIVATION_ATTEMPTS; attempts++) {
            const address = walletPCodePrivate.getPaymentAddress(senderPCodePublic, addrIndex++);
            if (this.isValidAddressForZone(address, zone)) {
                const pubkey = walletPCodePrivate.derivePaymentPublicKey(senderPCodePublic, addrIndex - 1);
                const pcInfo: QiAddressInfo = {
                    address,
                    pubKey: hexlify(pubkey),
                    index: addrIndex,
                    account,
                    zone,
                    change: false,
                    status: AddressStatus.UNUSED,
                    counterpartyPaymentCode: senderPaymentCode,
                };
                if (paymentCodeInfoArray) {
                    paymentCodeInfoArray.push(pcInfo);
                } else {
                    this._addressesMap.set(senderPaymentCode, [pcInfo]);
                }
                return pcInfo;
            }
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
}
