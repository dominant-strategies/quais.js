/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
import { AbstractHDWallet, NeuteredAddressInfo, SerializedHDWallet, _guard } from './abstract-hdwallet.js';
import { HDNodeWallet } from './hdnodewallet.js';
import { QiTransactionRequest, Provider, TransactionResponse } from '../providers/index.js';
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
import { keccak256, musigCrypto } from '../crypto/index.js';
import { Outpoint, UTXO } from '../transaction/utxo.js';
import { AllowedCoinType, toShard, Zone } from '../constants/index.js';
import { Mnemonic } from './mnemonic.js';
import { validatePaymentCode } from './payment-codes.js';
import { SelectedCoinsResult } from '../transaction/abstract-coinselector.js';
import { QiPerformActionTransaction } from '../providers/abstract-provider.js';
import { ConversionCoinSelector } from '../transaction/coinselector-conversion.js';
import { toUtf8Bytes } from '../quais.js';
import { Bip44QiWallet } from './qi-wallets/bip44-qi-wallet.js';
import { BIP44 } from './bip44/bip44.js';
import { PrivatekeyQiWallet } from './qi-wallets/privkey-qi-wallet.js';
import { PaymentChannel } from './qi-wallets/bip47-paymentchannel.js';
import { generatePaymentCodePrivate, getPrivateKeyFromPaymentCode } from './qi-wallets/bip47-self-qi-wallet.js';
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
    derivationPath: DerivationPath;
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
export type DerivationPath = 'BIP44:external' | 'BIP44:change' | 'PrivateKey' | string; // string for payment codes

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
 * Interface representing options for Qi transactions.
 */
export interface QiTransactionOptions {
    /**
     * Optional transaction data payload.
     */
    data?: Uint8Array;
}

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
    protected static override _version: number = 1;

    /**
     * @ignore
     * @type {AllowedCoinType}
     */
    protected static override _coinType: AllowedCoinType = 969;

    /**
     * @ignore
     * @type {string}
     */
    private static readonly PRIVATE_KEYS_PATH: string = 'privateKeys' as const;

    /**
     * The BIP44 wallet instance used for deriving external (receiving) addresses. This follows the BIP44 derivation
     * path m/44'/969'/account'/0/index
     *
     * @private
     * @type {Bip44QiWallet}
     * @readonly
     */
    private readonly externalBip44: Bip44QiWallet;

    /**
     * The BIP44 wallet instance used for deriving change (sending) addresses. This follows the BIP44 derivation path
     * m/44'/969'/account'/0/index
     *
     * @private
     * @type {Bip44QiWallet}
     * @readonly
     */
    private readonly changeBip44: Bip44QiWallet;

    /**
     * The BIP47 HDNode instance used for deriving payment code addresses. This follows the BIP47 derivation path
     * m/47'/969'/account'/0/index
     *
     * @private
     * @type {HDNodeWallet}
     * @readonly
     */
    private readonly bip47HDNode: HDNodeWallet;

    /**
     * The BIP47 derivation path m/47'/969'
     *
     * @private
     * @type {string}
     * @readonly
     */
    private static readonly bip47derivationPath: string = "m/47'/969'";

    /**
     * Map of payment channels indexed by counterparty payment code
     */
    private readonly paymentChannels: Map<string, PaymentChannel> = new Map();

    /**
     * The private key wallet instance used for deriving addresses from private keys.
     *
     * @private
     * @type {PrivatekeyQiWallet}
     * @readonly
     */
    private readonly privatekeyWallet: PrivatekeyQiWallet;

    /**
     * @ignore
     * @type {AddressUsageCallback}
     */
    protected _addressUseChecker: AddressUsageCallback | undefined;

    /**
     * @ignore
     * @param {HDNodeWallet} root - The root HDNodeWallet.
     * @param {Provider} [provider] - The provider (optional).
     */
    constructor(guard: any, root: HDNodeWallet, provider?: Provider) {
        super(guard, root, provider);

        const bip44 = new BIP44(this._root, QiHDWallet._coinType);
        // initialize bip44 wallet for external and change addresses
        this.externalBip44 = new Bip44QiWallet(bip44, false);
        this.changeBip44 = new Bip44QiWallet(bip44, true);

        // initialize payment channels
        this.paymentChannels = new Map();

        // initialize private key wallet
        this.privatekeyWallet = new PrivatekeyQiWallet();

        // initialize bip47 HDNode
        this.bip47HDNode = HDNodeWallet.fromMnemonic(this._root.mnemonic!, QiHDWallet.bip47derivationPath);
    }

    /**
     * Returns the extended public key of the root node of the BIP44 HD wallet.
     *
     * @returns {string} The extended public key.
     */
    public xPub(): string {
        return this._root.extendedKey;
    }

    /**
     * Connects the wallet to a provider and propagates the connection to all subwallets.
     *
     * @param {Provider} provider - The provider.
     * @override
     */
    public connect(provider: Provider): void {
        // Call parent class connect method
        super.connect(provider);

        // Propagate provider to subwallets
        this.externalBip44.setProvider(provider);
        this.changeBip44.setProvider(provider);
        this.privatekeyWallet.setProvider(provider);

        // Update payment channels
        for (const channel of this.paymentChannels.values()) {
            channel.selfWallet.setProvider(provider);
        }
    }

    /**
     * Gets the payment codes for all open channels.
     *
     * @returns {string[]} The payment codes for all open channels.
     */
    get openChannels(): string[] {
        return Array.from(this.paymentChannels.keys());
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
        return this.externalBip44.deriveNewAddress(zone, account);
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
        return this.changeBip44.deriveNewAddress(zone, account);
    }

    /**
     * Imports an array of outpoints into their corresponding wallets based on their derivation paths.
     *
     * @param {OutpointInfo[]} outpoints - The outpoints to import.
     */
    public importOutpoints(outpoints: OutpointInfo[]): void {
        this.validateOutpointInfo(outpoints);

        // Group outpoints by derivation path for batch processing
        const groupedOutpoints = new Map<DerivationPath, OutpointInfo[]>();

        for (const outpoint of outpoints) {
            const path = outpoint.derivationPath;
            if (!groupedOutpoints.has(path)) {
                groupedOutpoints.set(path, []);
            }
            groupedOutpoints.get(path)!.push(outpoint);
        }

        // Process each group of outpoints
        for (const [path, pathOutpoints] of groupedOutpoints) {
            switch (path) {
                case 'BIP44:external':
                    this.externalBip44.importOutpoints(pathOutpoints);
                    break;
                case 'BIP44:change':
                    this.changeBip44.importOutpoints(pathOutpoints);
                    break;
                case 'PrivateKey':
                    this.privatekeyWallet.importOutpoints(pathOutpoints);
                    break;
                default: {
                    // Handle payment code paths
                    const paymentChannel = this.paymentChannels.get(path);
                    if (!paymentChannel) {
                        throw new Error(`Payment channel not found for derivation path: ${path}`);
                    }
                    paymentChannel.selfWallet.importOutpoints(pathOutpoints);
                    break;
                }
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
        const bip44ExternalOutpoints = this.externalBip44.getOutpoints(zone);
        const bip44ChangeOutpoints = this.changeBip44.getOutpoints(zone);
        const privatekeyOutpoints = this.privatekeyWallet.getOutpoints(zone);
        return [...bip44ExternalOutpoints, ...bip44ChangeOutpoints, ...privatekeyOutpoints];
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
    public getAddressInfo(address: string): QiAddressInfo | null {
        // search in bip44 wallets
        const externalAddress = this.externalBip44.getAddressInfo(address);
        if (externalAddress) {
            return externalAddress;
        }
        const changeAddress = this.changeBip44.getAddressInfo(address);
        if (changeAddress) {
            return changeAddress;
        }

        // search in payment code self addresses
        for (const paymentChannel of this.paymentChannels.values()) {
            const paymentCodeAddress = paymentChannel.selfWallet.getAddressInfo(address);
            if (paymentCodeAddress) {
                return paymentCodeAddress;
            }
        }

        // search in private key wallet
        const privateKeyAddress = this.privatekeyWallet.getAddressInfo(address);
        if (privateKeyAddress) {
            return privateKeyAddress;
        }

        return null;
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
     * @param {QiTransactionOptions} [options] - Optional transaction configuration.
     * @returns {Promise<TransactionResponse>} A promise that resolves to the transaction response.
     * @throws {Error} If the destination address is invalid, the amount is zero, or the conversion fails.
     */
    public async convertToQuai(
        destinationAddress: string,
        amount: bigint,
        options: QiTransactionOptions = {},
    ): Promise<TransactionResponse> {
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
            options,
        );
    }

    /**
     * Sends a transaction to a specified recipient payment code in a specified zone.
     *
     * @param {string} recipientPaymentCode - The payment code of the recipient.
     * @param {bigint} amount - The amount of Qi to send.
     * @param {Zone} originZone - The zone where the transaction originates.
     * @param {Zone} destinationZone - The zone where the transaction is sent.
     * @param {QiTransactionOptions} [options] - Optional transaction configuration.
     * @returns {Promise<TransactionResponse>} A promise that resolves to the transaction response.
     * @throws {Error} If the payment code is invalid, the amount is zero, or the zones are invalid.
     */
    public async sendTransaction(
        recipientPaymentCode: string,
        amount: bigint,
        originZone: Zone,
        destinationZone: Zone,
        options: QiTransactionOptions = {},
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
            options,
        );
    }

    /**
     * Aggregates all the available UTXOs for the specified zone and account. This method creates a new transaction with
     * all the available UTXOs as inputs and as fewest outputs as possible.
     *
     * @param {Zone} zone - The zone to aggregate the balance for.
     * @param {QiTransactionOptions} [options] - Optional transaction configuration.
     * @returns {Promise<TransactionResponse>} The transaction response.
     */
    public async aggregate(zone: Zone, options: QiTransactionOptions = {}): Promise<TransactionResponse> {
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

        const sendAddressesInfo = this.getUnusedBIP44Addresses(1, 0, 'BIP44:external', zone);
        const sendAddresses = sendAddressesInfo.map((addressInfo) => addressInfo.address);
        const changeAddresses: string[] = [];

        // Proceed with creating and signing the transaction
        const chainId = (await this.provider.getNetwork()).chainId;
        const tx = await this.prepareTransaction(selection, sendAddresses, changeAddresses, Number(chainId), options);

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
        options: QiTransactionOptions = {},
    ): Promise<TransactionResponse> {
        if (!this.provider) {
            throw new Error('Provider is not set');
        }

        // 1. Check the wallet has enough balance in the originating zone to send the transaction
        const currentBlock = await this.provider.getBlock(toShard(originZone), 'latest')!;
        const balance = await this.getSpendableBalance(originZone, currentBlock?.woHeader.number, true);
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

        // 4. Get change addresses
        const changeAddresses = await this.getChangeAddressesForOutputs(selection.changeOutputs.length, originZone);

        // 5. Create the transaction and sign it using the signTransaction method
        let inputPubKeys = selection.inputs.map((input) => this.getAddressInfo(input.address)?.pubKey);
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
                const newChangeAddresses = await this.getChangeAddressesForOutputs(changeAddressesNeeded, originZone);
                changeAddresses.push(...newChangeAddresses);
            } else if (changeAddressesNeeded < 0) {
                // Have extra change addresses, remove the excess
                const addressesToSetToUnused = changeAddresses.slice(changeAddressesNeeded);

                // Set the status of the addresses back to UNUSED in _addressesMap for removed addresses
                const currentChangeAddresses = this.changeBip44.getAddressesInZone(originZone);
                const updatedChangeAddresses = currentChangeAddresses.map((a) => {
                    if (addressesToSetToUnused.includes(a.address)) {
                        return { ...a, status: AddressStatus.UNUSED };
                    }
                    return a;
                });
                this.changeBip44.setAddresses(updatedChangeAddresses);
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

            inputPubKeys = selection.inputs.map((input) => this.getAddressInfo(input.address)?.pubKey);

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
        const tx = await this.prepareTransaction(selection, sendAddresses, changeAddresses, Number(chainId), options);

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
     * @param {string[]} sendAddresses - The addresses to send to.
     * @param {string[]} changeAddresses - The addresses to change to.
     * @param {number} chainId - The chain ID.
     * @returns {Promise<QiTransaction>} A promise that resolves to the prepared transaction.
     */
    private async prepareTransaction(
        selection: SelectedCoinsResult,
        sendAddresses: string[],
        changeAddresses: string[],
        chainId: number,
        options: QiTransactionOptions = {},
    ): Promise<QiTransaction> {
        const tx = new QiTransaction();

        interface InputWithPubKey {
            utxo: UTXO;
            pubKey: string;
        }

        const inputsWithPubKeys: InputWithPubKey[] = selection.inputs.map((input) => {
            const addressInfo = this.getAddressInfo(input.address);
            if (!addressInfo?.pubKey) {
                throw new Error(`Missing public key for input address: ${input.address}`);
            }
            return {
                utxo: input,
                pubKey: addressInfo.pubKey,
            };
        });

        tx.txInputs = inputsWithPubKeys.map((input) => ({
            txhash: input.utxo.txhash!,
            index: input.utxo.index!,
            pubkey: input.pubKey,
        }));

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

        // Set data if provided in options
        if (options.data) {
            tx.data = options.data;
        }

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
     * Gets a set of unused change addresses for transaction outputs and updates their status in the wallet. This method
     * retrieves unused BIP44 change addresses, marks them as attempted use, and maintains the wallet's address mapping
     * state.
     *
     * @private
     * @param {number} count - The number of change addresses needed
     * @param {Zone} zone - The zone to get change addresses from
     * @param {number} [account=0] - The account index to use (defaults to 0). Default is `0`
     * @returns {Promise<string[]>} A promise that resolves to an array of change addresses
     */
    private async getChangeAddressesForOutputs(count: number, zone: Zone, account: number = 0): Promise<string[]> {
        // Get unused change addresses using existing helper
        const unusedAddresses = this.getUnusedBIP44Addresses(count, account, 'BIP44:change', zone);

        // Update address statuses in wallet
        const currentAddresses = this.changeBip44.getAddressesInZone(zone);
        const updatedAddresses = [
            // Mark selected addresses as attempted use
            ...unusedAddresses.map((addr) => ({ ...addr, status: AddressStatus.ATTEMPTED_USE })),
            // Keep other existing addresses unchanged
            ...currentAddresses.filter((addr) => !unusedAddresses.some((unused) => unused.address === addr.address)),
        ].sort((a, b) => a.index - b.index);

        // Update wallet's address map
        this.changeBip44.setAddresses(updatedAddresses);

        // Return just the addresses
        return unusedAddresses.map((addr) => addr.address);
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
    private getUnusedBIP44Addresses(
        amount: number,
        account: number,
        path: DerivationPath,
        zone: Zone,
    ): QiAddressInfo[] {
        const wallet = path === 'BIP44:external' ? this.externalBip44 : this.changeBip44;
        const addresses = wallet.getAddressesInZone(zone);
        const unusedAddresses = addresses.filter(
            (address) =>
                address.status === AddressStatus.UNUSED && address.account === account && address.zone === zone,
        );
        if (unusedAddresses.length >= amount) {
            return unusedAddresses.slice(0, amount);
        }

        const remainingAddressesNeeded = amount - unusedAddresses.length;
        const newAddresses = Array.from({ length: remainingAddressesNeeded }, () =>
            wallet.deriveNewAddress(zone, account),
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
        const addressInfo = this.getAddressInfo(address);

        if (!addressInfo) {
            throw new Error(`Address not found: ${address}`);
        }

        // Handle imported private keys
        if (isHexString(addressInfo.derivationPath, 32)) {
            return addressInfo.derivationPath;
        }

        const account = addressInfo.account;
        const index = addressInfo.index;

        if (addressInfo.derivationPath === 'BIP44:external' || addressInfo.derivationPath === 'BIP44:change') {
            // (BIP44 addresses)
            const isChange = addressInfo.derivationPath === 'BIP44:change';
            const bip44 = isChange ? this.changeBip44 : this.externalBip44;
            const addressNode = bip44.getAddressNode(account, index);
            return addressNode.privateKey;
        } else {
            // (BIP47 addresses)
            const counterpartyPaymentCode = addressInfo.derivationPath;
            const privateKey = getPrivateKeyFromPaymentCode(this.bip47HDNode, counterpartyPaymentCode, index, account);
            return privateKey;
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
        const bip44Scans = [this.externalBip44.scan(zone, account), this.changeBip44.scan(zone, account)];
        const paymentChannelScans = Array.from(this.paymentChannels.values()).map((pc) =>
            pc.selfWallet.scan(zone, account),
        );
        const privateKeyScans = this.privatekeyWallet.scan(zone, account);
        await Promise.all([...bip44Scans, ...paymentChannelScans, privateKeyScans]);
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
        const bip44Syncs = [
            this.externalBip44.sync(zone, account, onOutpointsCreated, onOutpointsDeleted),
            this.changeBip44.sync(zone, account, onOutpointsCreated, onOutpointsDeleted),
        ];
        const paymentChannelSyncs = Array.from(this.paymentChannels.values()).map((pc) =>
            pc.selfWallet.sync(zone, account, onOutpointsCreated, onOutpointsDeleted),
        );
        const privateKeySyncs = this.privatekeyWallet.sync(zone, account, onOutpointsCreated, onOutpointsDeleted);
        await Promise.all([...bip44Syncs, ...paymentChannelSyncs, privateKeySyncs]);
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
        return this.externalBip44.getAddressesInZone(zone);
    }

    /**
     * Gets the change addresses for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {QiAddressInfo[]} The change addresses for the zone.
     */
    public getChangeAddressesForZone(zone: Zone): QiAddressInfo[] {
        this.validateZone(zone);
        return this.changeBip44.getAddressesInZone(zone);
    }

    /**
     * Gets the gap addresses for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {QiAddressInfo[]} The gap addresses for the zone.
     */
    public getGapAddressesForZone(zone: Zone): QiAddressInfo[] {
        this.validateZone(zone);
        const externalAddresses = this.externalBip44.getAddressesInZone(zone);
        return externalAddresses.filter((addressInfo) => addressInfo.status === AddressStatus.UNUSED);
    }

    /**
     * Gets the gap change addresses for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {QiAddressInfo[]} The gap change addresses for the zone.
     */
    public getGapChangeAddressesForZone(zone: Zone): QiAddressInfo[] {
        this.validateZone(zone);
        const changeAddresses = this.changeBip44.getAddressesInZone(zone);
        return changeAddresses.filter((addressInfo) => addressInfo.status === AddressStatus.UNUSED);
    }

    /**
     * Gets the payment channel addresses for the specified zone.
     *
     * @param {string} paymentCode - The payment code.
     * @param {Zone} zone - The zone.
     * @returns {QiAddressInfo[]} The payment channel addresses for the zone.
     */
    public getPaymentChannelAddressesForZone(paymentCode: string, zone: Zone): QiAddressInfo[] {
        return this.paymentChannels.get(paymentCode)?.selfWallet.getAddressesInZone(zone) || [];
    }

    /**
     * Gets the gap payment channel addresses for the specified payment code.
     *
     * @param {string} paymentCode - The payment code.
     * @returns {QiAddressInfo[]} The gap payment channel addresses for the payment code.
     */
    public getGapPaymentChannelAddressesForZone(paymentCode: string, zone: Zone): QiAddressInfo[] {
        const addressesInfo = this.getPaymentChannelAddressesForZone(paymentCode, zone);
        return addressesInfo.filter((addressInfo) => addressInfo.status === AddressStatus.UNUSED);
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

        // get all addresses from BIP44 wallets
        const bip44Addresses = this.externalBip44.exportAllAddresses();
        const bip44ChangeAddresses = this.changeBip44.exportAllAddresses();
        // get self address from BIP47 payment channels
        const paymentChannelSelfAddresses = Array.from(this.paymentChannels.values()).flatMap((pc) =>
            pc.selfWallet.exportAllAddresses(),
        );
        // get addresses from imported private keys
        const importedPrivateKeysAddresses = this.privatekeyWallet.exportAllAddresses();

        const allAddresses = [
            ...bip44Addresses,
            ...bip44ChangeAddresses,
            ...paymentChannelSelfAddresses,
            ...importedPrivateKeysAddresses,
        ];

        // Create senderPaymentCodeInfo object
        const senderPaymentCodeInfo = Object.fromEntries(
            Array.from(this.paymentChannels.entries()).map(([paymentCode, channel]) => [
                paymentCode,
                channel.counterpartyWallet.exportAllAddresses(),
            ]),
        );

        return {
            ...hdwalletSerialized,
            addresses: allAddresses,
            senderPaymentCodeInfo,
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

        // import all addresses
        for (const addressInfo of serialized.addresses) {
            if (isHexString(addressInfo.derivationPath, 32)) {
                // private key address
                wallet.privatekeyWallet.importAddressInfo(addressInfo);
            } else if (addressInfo.derivationPath === 'BIP44:external') {
                // BIP44 external address
                wallet.validateAddressInfo(addressInfo);
                wallet.externalBip44.importAddressInfo(addressInfo);
            } else if (addressInfo.derivationPath === 'BIP44:change') {
                // BIP44 change address
                wallet.validateAddressInfo(addressInfo);
                wallet.changeBip44.importAddressInfo(addressInfo);
            } else if (validatePaymentCode(addressInfo.derivationPath)) {
                // payment code self address
                wallet.validateBaseAddressInfo(addressInfo);
                wallet.validateExtendedProperties(addressInfo);

                // Create payment channel if it doesn't exist
                if (!wallet.paymentChannels.has(addressInfo.derivationPath)) {
                    wallet.openChannel(addressInfo.derivationPath);
                }
                const channel = wallet.paymentChannels.get(addressInfo.derivationPath)!;
                channel.selfWallet.importAddressInfo(addressInfo);
            } else {
                throw new Error(`Invalid derivation path: ${addressInfo.derivationPath}`);
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
            if (!wallet.paymentChannels.has(paymentCode)) {
                wallet.openChannel(paymentCode);
            }
            const channel = wallet.paymentChannels.get(paymentCode)!;
            for (const pcInfo of paymentCodeInfoArray) {
                channel.counterpartyWallet.importAddressInfo(pcInfo);
            }
        }

        return wallet;
    }

    protected validateAddressDerivation(info: QiAddressInfo): void {
        const isChange = info.derivationPath === 'BIP44:change';
        const bip44 = isChange ? this.changeBip44 : this.externalBip44;
        const addressNode = bip44.getAddressNode(info.account, info.index);

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
        const addressInfo = this.getAddressInfo(address);
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
        const privatePcode = generatePaymentCodePrivate(this.bip47HDNode, account);
        return privatePcode.toBase58();
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
        if (!this.paymentChannels.has(receiverPaymentCode)) {
            throw new Error(`Receiver payment code ${receiverPaymentCode} not found in wallet`);
        }
        const paymentChannel = this.paymentChannels.get(receiverPaymentCode);
        return paymentChannel!.getNextSendingAddress(zone, account);
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
        if (!this.paymentChannels.has(senderPaymentCode)) {
            throw new Error(`Sender payment code ${senderPaymentCode} not found in wallet`);
        }
        const paymentChannel = this.paymentChannels.get(senderPaymentCode);
        return paymentChannel!.getNextReceivingAddress(zone, account);
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

        const pc = new PaymentChannel(this.bip47HDNode, paymentCode);
        this.paymentChannels.set(paymentCode, pc);

        // set the provider for the self wallet
        pc.selfWallet.setProvider(this.provider!);
    }

    public channelIsOpen(paymentCode: string): boolean {
        return this.paymentChannels.has(paymentCode);
    }

    /**
     * Imports a private key and adds it to the wallet.
     *
     * @param {string} privateKey - The private key to import (hex string)
     * @returns {Promise<QiAddressInfo>} The address information for the imported key
     * @throws {Error} If the private key is invalid or the address is already in use
     */
    public async importPrivateKey(privateKey: string): Promise<QiAddressInfo> {
        const addrInfo = this.privatekeyWallet.importPrivateKey(privateKey);
        // check address is not in BIP44 wallets
        if (this.externalBip44.getAddressInfo(addrInfo.address) || this.changeBip44.getAddressInfo(addrInfo.address)) {
            throw new Error(`Address ${addrInfo.address} already exists in BIP44 derivation path`);
        }

        for (const paymentChannel of this.paymentChannels.values()) {
            if (paymentChannel.getReceivingAddressInfo(addrInfo.address)) {
                throw new Error(`Address ${addrInfo.address} already exists in BIP47 derivation path`);
            }
        }
        return addrInfo;
    }

    /**
     * Gets all addresses that were imported via private keys.
     *
     * @param {Zone} [zone] - Optional zone to filter addresses by
     * @returns {QiAddressInfo[]} Array of address info objects for imported addresses
     */
    public getImportedAddresses(zone?: Zone): QiAddressInfo[] {
        return this.privatekeyWallet.getImportedAddresses(zone);
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
        return this.externalBip44.addAddress(account, addressIndex);
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
        return this.changeBip44.addAddress(account, addressIndex);
    }

    /**
     * Gets the addresses for a given account.
     *
     * @param {number} account - The account number.
     * @returns {QiAddressInfo[]} The addresses for the account.
     */
    public getAddressesForAccount(account: number): QiAddressInfo[] {
        const externalAddresses = this.externalBip44.getAddressesForAccount(account);
        const changeAddresses = this.changeBip44.getAddressesForAccount(account);
        const paymentCodeAddresses: QiAddressInfo[] = [];
        for (const paymentChannel of this.paymentChannels.values()) {
            paymentCodeAddresses.push(...paymentChannel.getReceivingAddressesForAccount(account));
        }
        const privateKeyAddresses = this.privatekeyWallet.getAddressesForAccount(account);
        return [...externalAddresses, ...changeAddresses, ...paymentCodeAddresses, ...privateKeyAddresses];
    }

    /**
     * Gets the total balance for a specific zone by summing balances from all address types:
     *
     * - BIP44 external addresses
     * - BIP44 change addresses
     * - BIP47 payment channel addresses
     * - Imported private key addresses
     *
     * @param {Zone} zone - The zone to get the balance for
     * @returns {Promise<bigint>} The total balance in the zone as a bigint
     */
    public async getBalanceForZone(zone: Zone): Promise<bigint> {
        const bip44externalBalance = await this.externalBip44.getTotalBalance(zone);
        const bip44changeBalance = await this.changeBip44.getTotalBalance(zone);
        // get the sum of bip47 self wallets
        let bip47AddressesBalance = BigInt(0);
        for (const pc of this.paymentChannels.values()) {
            bip47AddressesBalance += await pc.selfWallet.getTotalBalance(zone);
        }

        const privatekeyBalance = await this.privatekeyWallet.getTotalBalance(zone);
        return bip44externalBalance + bip44changeBalance + bip47AddressesBalance + privatekeyBalance;
    }

    public async getLockedBalance(
        zone: Zone,
        blockNumber?: number,
        useCachedOutpoints: boolean = false,
    ): Promise<bigint> {
        const bip44externalBalance = await this.externalBip44.getLockedBalance(zone, blockNumber, useCachedOutpoints);
        const bip44changeBalance = await this.changeBip44.getLockedBalance(zone, blockNumber, useCachedOutpoints);
        let bip47AddressesBalance = BigInt(0);
        for (const pc of this.paymentChannels.values()) {
            bip47AddressesBalance += await pc.selfWallet.getLockedBalance(zone);
        }
        const privatekeyBalance = await this.privatekeyWallet.getLockedBalance(zone, blockNumber, useCachedOutpoints);
        return bip44externalBalance + bip44changeBalance + bip47AddressesBalance + privatekeyBalance;
    }

    public async getSpendableBalance(
        zone: Zone,
        blockNumber?: number,
        useCachedOutpoints: boolean = false,
    ): Promise<bigint> {
        const bip44externalBalance = await this.externalBip44.getSpendableBalance(
            zone,
            blockNumber,
            useCachedOutpoints,
        );
        const bip44changeBalance = await this.changeBip44.getSpendableBalance(zone, blockNumber, useCachedOutpoints);
        let bip47AddressesBalance = BigInt(0);
        for (const pc of this.paymentChannels.values()) {
            bip47AddressesBalance += await pc.selfWallet.getSpendableBalance(zone);
        }
        const privatekeyBalance = await this.privatekeyWallet.getSpendableBalance(
            zone,
            blockNumber,
            useCachedOutpoints,
        );
        return bip44externalBalance + bip44changeBalance + bip47AddressesBalance + privatekeyBalance;
    }
}
