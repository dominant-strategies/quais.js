import {
    AbstractHDWallet,
    NeuteredAddressInfo,
    SerializedHDWallet,
    _guard,
    MAX_ADDRESS_DERIVATION_ATTEMPTS,
} from './hdwallet.js';
import { HDNodeWallet } from './hdnodewallet.js';
import { QiTransactionRequest, Provider, TransactionResponse } from '../providers/index.js';
import { computeAddress } from '../address/index.js';
import { getBytes, hexlify } from '../utils/index.js';
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

interface paymentCodeInfo {
    address: string;
    index: number;
    isUsed: boolean;
    zone: Zone;
    account: number;
}

/**
 * @extends SerializedHDWallet
 * @property {OutpointInfo[]} outpoints - Array of outpoint information.
 * @property {NeuteredAddressInfo[]} changeAddresses - Array of change addresses.
 * @property {NeuteredAddressInfo[]} gapAddresses - Array of gap addresses.
 * @property {NeuteredAddressInfo[]} gapChangeAddresses - Array of gap change addresses.
 * @interface SerializedQiHDWallet
 */
export interface SerializedQiHDWallet extends SerializedHDWallet {
    outpoints: OutpointInfo[];
    changeAddresses: NeuteredAddressInfo[];
    gapAddresses: NeuteredAddressInfo[];
    gapChangeAddresses: NeuteredAddressInfo[];
    receiverPaymentCodeInfo: { [key: string]: paymentCodeInfo[] };
    senderPaymentCodeInfo: { [key: string]: paymentCodeInfo[] };
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
    protected static _GAP_LIMIT: number = 20;

    /**
     * @ignore
     * @type {AllowedCoinType}
     */
    protected static _coinType: AllowedCoinType = 969;

    /**
     * Map of change addresses to address info.
     *
     * @ignore
     * @type {Map<string, NeuteredAddressInfo>}
     */
    protected _changeAddresses: Map<string, NeuteredAddressInfo> = new Map();

    /**
     * Array of gap addresses.
     *
     * @ignore
     * @type {NeuteredAddressInfo[]}
     */
    protected _gapChangeAddresses: NeuteredAddressInfo[] = [];

    /**
     * Array of gap change addresses.
     *
     * @ignore
     * @type {NeuteredAddressInfo[]}
     */
    protected _gapAddresses: NeuteredAddressInfo[] = [];

    /**
     * Array of outpoint information.
     *
     * @ignore
     * @type {OutpointInfo[]}
     */
    protected _outpoints: OutpointInfo[] = [];

    /**
     * Map of paymentcodes to paymentCodeInfo for the receiver
     */
    private _receiverPaymentCodeInfo: Map<string, paymentCodeInfo[]> = new Map();

    /**
     * Map of paymentcodes to paymentCodeInfo for the sender
     */
    private _senderPaymentCodeInfo: Map<string, paymentCodeInfo[]> = new Map();

    /**
     * @ignore
     * @param {HDNodeWallet} root - The root HDNodeWallet.
     * @param {Provider} [provider] - The provider (optional).
     */
    constructor(guard: any, root: HDNodeWallet, provider?: Provider) {
        super(guard, root, provider);
    }

    // getters for the payment code info maps
    public get receiverPaymentCodeInfo(): { [key: string]: paymentCodeInfo[] } {
        return Object.fromEntries(this._receiverPaymentCodeInfo);
    }

    public get senderPaymentCodeInfo(): { [key: string]: paymentCodeInfo[] } {
        return Object.fromEntries(this._senderPaymentCodeInfo);
    }

    /**
     * Promise that resolves to the next change address for the specified account and zone.
     *
     * @param {number} account - The index of the account for which to retrieve the next change address.
     * @param {Zone} zone - The zone in which to retrieve the next change address.
     * @returns {Promise<NeuteredAddressInfo>} The next change neutered address information.
     */
    public async getNextChangeAddress(account: number, zone: Zone): Promise<NeuteredAddressInfo> {
        return Promise.resolve(this._getNextAddress(account, zone, true, this._changeAddresses));
    }

    /**
     * Synchronously retrieves the next change address for the specified account and zone.
     *
     * @param {number} account - The index of the account for which to retrieve the next change address.
     * @param {Zone} zone - The zone in which to retrieve the next change address.
     * @returns {NeuteredAddressInfo} The next change neutered address information.
     */
    public getNextChangeAddressSync(account: number, zone: Zone): NeuteredAddressInfo {
        return this._getNextAddress(account, zone, true, this._changeAddresses);
    }

    /**
     * Imports an array of outpoints.
     *
     * @param {OutpointInfo[]} outpoints - The outpoints to import.
     */
    public importOutpoints(outpoints: OutpointInfo[]): void {
        this.validateOutpointInfo(outpoints);
        this._outpoints.push(...outpoints);
    }

    /**
     * Gets the outpoints for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {OutpointInfo[]} The outpoints for the zone.
     */
    public getOutpoints(zone: Zone): OutpointInfo[] {
        this.validateZone(zone);
        return this._outpoints.filter((outpoint) => outpoint.zone === zone);
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
     * Gets the balance for the specified zone.
     *
     * @param {Zone} zone - The zone to get the balance for.
     * @returns {bigint} The total balance for the zone.
     */
    public getBalanceForZone(zone: Zone): bigint {
        this.validateZone(zone);

        return this._outpoints
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
        return this._outpoints
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

    /**
     * Sends a transaction using the traditional method (compatible with AbstractHDWallet).
     *
     * @param tx The transaction request.
     */
    public async sendTransaction(
        recipientPaymentCode: string,
        amount: bigint,
        originZone: Zone,
        destinationZone: Zone,
    ): Promise<TransactionResponse> {
        if (!this.provider) {
            throw new Error('Provider is not set');
        }
        // This is the new method call (recipientPaymentCode, amount, originZone, destinationZone)
        if (!validatePaymentCode(recipientPaymentCode)) {
            throw new Error('Invalid payment code');
        }
        if (amount <= 0) {
            throw new Error('Amount must be greater than 0');
        }
        if (!Object.values(Zone).includes(originZone) || !Object.values(Zone).includes(destinationZone)) {
            throw new Error('Invalid zone');
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
        const sendAddresses: string[] = [];
        for (let i = 0; i < selection.spendOutputs.length; i++) {
            sendAddresses.push(await this.getNextSendAddress(recipientPaymentCode, destinationZone));
        }
        // 4. Generate as many addresses as required to populate the change outputs
        const changeAddresses: string[] = [];
        for (let i = 0; i < selection.changeOutputs.length; i++) {
            changeAddresses.push((await this.getNextChangeAddress(0, originZone)).address);
        }
        // 5. Create the transaction and sign it using the signTransaction method

        // 5.1 Fetch the public keys for the input addresses
        let inputPubKeys = selection.inputs.map((input) => this.getAddressInfo(input.address)?.pubKey);
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
        const feeData = await this.provider.getFeeData(originZone, false);

        // 5.6 Calculate total fee for the transaction using the gasLimit, gasPrice, maxFeePerGas and maxPriorityFeePerGas
        const totalFee =
            gasLimit * (feeData.gasPrice ?? 1n) + (feeData.maxFeePerGas ?? 0n) + (feeData.maxPriorityFeePerGas ?? 0n);

        // Get new selection with increased fee
        selection = fewestCoinSelector.increaseFee(totalFee);

        // 5.7 Determine if new addresses are needed for the change outputs
        const changeAddressesNeeded = selection.changeOutputs.length > changeAddresses.length;
        if (changeAddressesNeeded) {
            for (let i = 0; i < selection.changeOutputs.length; i++) {
                changeAddresses.push((await this.getNextChangeAddress(0, originZone)).address);
            }
        }

        const spendAddressesNeeded = selection.spendOutputs.length > sendAddresses.length;
        if (spendAddressesNeeded) {
            for (let i = 0; i < selection.spendOutputs.length; i++) {
                sendAddresses.push(await this.getNextSendAddress(recipientPaymentCode, destinationZone));
            }
        }

        inputPubKeys = selection.inputs.map((input) => this.getAddressInfo(input.address)?.pubKey);

        tx = await this.prepareTransaction(
            selection,
            inputPubKeys.map((pubkey) => pubkey!),
            sendAddresses,
            changeAddresses,
            Number(chainId),
        );

        // 5.6 Sign the transaction
        const signedTx = await this.signTransaction(tx);

        // 6. Broadcast the transaction to the network using the provider
        return this.provider.broadcastTransaction(originZone, signedTx);
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
     * This method derives the private key for a transaction input by following these steps:
     *
     * 1. Ensures the input contains a public key.
     * 2. Computes the address from the public key.
     * 3. Fetches address information associated with the computed address.
     * 4. Derives the hierarchical deterministic (HD) node corresponding to the address.
     * 5. Returns the private key of the derived HD node.
     *
     * @ignore
     * @param {TxInput} input - The transaction input containing the public key.
     * @returns {string} The private key corresponding to the transaction input.
     * @throws {Error} If the input does not contain a public key or if the address information cannot be found.
     */
    private getPrivateKeyForTxInput(input: TxInput): string {
        if (!input.pubkey) throw new Error('Missing public key for input');
        const address = computeAddress(input.pubkey);
        // get address info
        const addressInfo = this.getAddressInfo(address);
        if (!addressInfo) throw new Error(`Address not found: ${address}`);
        // derive an HDNode for the address and get the private key
        const changeIndex = addressInfo.change ? 1 : 0;
        const addressNode = this._root
            .deriveChild(addressInfo.account)
            .deriveChild(changeIndex)
            .deriveChild(addressInfo.index);
        return addressNode.privateKey;
    }

    /**
     * Scans the specified zone for addresses with unspent outputs. Starting at index 0, it will generate new addresses
     * until the gap limit is reached for both gap and change addresses.
     *
     * @param {Zone} zone - The zone in which to scan for addresses.
     * @param {number} [account=0] - The index of the account to scan. Default is `0`
     * @returns {Promise<void>} A promise that resolves when the scan is complete.
     * @throws {Error} If the zone is invalid.
     */
    public async scan(zone: Zone, account: number = 0): Promise<void> {
        this.validateZone(zone);
        // flush the existing addresses and outpoints
        this._addresses = new Map();
        this._changeAddresses = new Map();
        this._gapAddresses = [];
        this._gapChangeAddresses = [];
        this._outpoints = [];

        await this._scan(zone, account);
    }

    /**
     * Scans the specified zone for addresses with unspent outputs. Starting at the last address index, it will generate
     * new addresses until the gap limit is reached for both gap and change addresses. If no account is specified, it
     * will scan all accounts known to the wallet.
     *
     * @param {Zone} zone - The zone in which to sync addresses.
     * @param {number} [account] - The index of the account to sync. If not specified, all accounts will be scanned.
     * @returns {Promise<void>} A promise that resolves when the sync is complete.
     * @throws {Error} If the zone is invalid.
     */
    public async sync(zone: Zone, account?: number): Promise<void> {
        this.validateZone(zone);
        // if no account is specified, scan all accounts.
        if (account === undefined) {
            const addressInfos = Array.from(this._addresses.values());
            const accounts = addressInfos.reduce<number[]>((unique, info) => {
                if (!unique.includes(info.account)) {
                    unique.push(info.account);
                }
                return unique;
            }, []);

            for (const acc of accounts) {
                await this._scan(zone, acc);
            }
        } else {
            await this._scan(zone, account);
        }
        return;
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

        let gapAddressesCount = 0;
        let changeGapAddressesCount = 0;

        while (gapAddressesCount < QiHDWallet._GAP_LIMIT || changeGapAddressesCount < QiHDWallet._GAP_LIMIT) {
            [gapAddressesCount, changeGapAddressesCount] = await Promise.all([
                gapAddressesCount < QiHDWallet._GAP_LIMIT
                    ? this.scanAddress(zone, account, false, gapAddressesCount)
                    : gapAddressesCount,
                changeGapAddressesCount < QiHDWallet._GAP_LIMIT
                    ? this.scanAddress(zone, account, true, changeGapAddressesCount)
                    : changeGapAddressesCount,
            ]);
        }
    }

    /**
     * Scans for the next address in the specified zone and account, checking for associated outpoints, and updates the
     * address count and gap addresses accordingly.
     *
     * @param {Zone} zone - The zone in which the address is being scanned.
     * @param {number} account - The index of the account for which the address is being scanned.
     * @param {boolean} isChange - A flag indicating whether the address is a change address.
     * @param {number} addressesCount - The current count of addresses scanned.
     * @returns {Promise<number>} A promise that resolves to the updated address count.
     * @throws {Error} If an error occurs during the address scanning or outpoints retrieval process.
     */
    private async scanAddress(zone: Zone, account: number, isChange: boolean, addressesCount: number): Promise<number> {
        const addressMap = isChange ? this._changeAddresses : this._addresses;
        const addressInfo = this._getNextAddress(account, zone, isChange, addressMap);
        const outpoints = await this.getOutpointsByAddress(addressInfo.address);
        if (outpoints.length > 0) {
            this.importOutpoints(
                outpoints.map((outpoint) => ({
                    outpoint,
                    address: addressInfo.address,
                    zone,
                    account,
                })),
            );
            addressesCount = 0;
            isChange ? (this._gapChangeAddresses = []) : (this._gapAddresses = []);
        } else {
            addressesCount++;
            isChange ? this._gapChangeAddresses.push(addressInfo) : this._gapAddresses.push(addressInfo);
        }
        return addressesCount;
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
     * Gets the change addresses for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {NeuteredAddressInfo[]} The change addresses for the zone.
     */
    public getChangeAddressesForZone(zone: Zone): NeuteredAddressInfo[] {
        this.validateZone(zone);
        const changeAddresses = this._changeAddresses.values();
        return Array.from(changeAddresses).filter((addressInfo) => addressInfo.zone === zone);
    }

    /**
     * Gets the gap addresses for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {NeuteredAddressInfo[]} The gap addresses for the zone.
     */
    public getGapAddressesForZone(zone: Zone): NeuteredAddressInfo[] {
        this.validateZone(zone);
        const gapAddresses = this._gapAddresses.filter((addressInfo) => addressInfo.zone === zone);
        return gapAddresses;
    }

    /**
     * Gets the gap change addresses for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {NeuteredAddressInfo[]} The gap change addresses for the zone.
     */
    public getGapChangeAddressesForZone(zone: Zone): NeuteredAddressInfo[] {
        this.validateZone(zone);
        const gapChangeAddresses = this._gapChangeAddresses.filter((addressInfo) => addressInfo.zone === zone);
        return gapChangeAddresses;
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
        return {
            outpoints: this._outpoints,
            changeAddresses: Array.from(this._changeAddresses.values()),
            gapAddresses: this._gapAddresses,
            gapChangeAddresses: this._gapChangeAddresses,
            receiverPaymentCodeInfo: Object.fromEntries(this._receiverPaymentCodeInfo),
            senderPaymentCodeInfo: Object.fromEntries(this._senderPaymentCodeInfo),
            ...hdwalletSerialized,
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

        // import the addresses
        wallet.importSerializedAddresses(wallet._addresses, serialized.addresses);
        // import the change addresses
        wallet.importSerializedAddresses(wallet._changeAddresses, serialized.changeAddresses);

        // import the gap addresses, verifying they already exist in the wallet
        for (const gapAddressInfo of serialized.gapAddresses) {
            const gapAddress = gapAddressInfo.address;
            if (!wallet._addresses.has(gapAddress)) {
                throw new Error(`Address ${gapAddress} not found in wallet`);
            }
            wallet._gapAddresses.push(gapAddressInfo);
        }
        // import the gap change addresses, verifying they already exist in the wallet
        for (const gapChangeAddressInfo of serialized.gapChangeAddresses) {
            const gapChangeAddress = gapChangeAddressInfo.address;
            if (!wallet._changeAddresses.has(gapChangeAddress)) {
                throw new Error(`Address ${gapChangeAddress} not found in wallet`);
            }
            wallet._gapChangeAddresses.push(gapChangeAddressInfo);
        }

        // validate the outpoints and import them
        wallet.validateOutpointInfo(serialized.outpoints);
        wallet._outpoints.push(...serialized.outpoints);

        // validate and import the payment code info
        wallet.validateAndImportPaymentCodeInfo(serialized.receiverPaymentCodeInfo, 'receiver');
        wallet.validateAndImportPaymentCodeInfo(serialized.senderPaymentCodeInfo, 'sender');

        return wallet;
    }

    /**
     * Validates and imports a map of payment code info.
     *
     * @param {Map<string, paymentCodeInfo[]>} paymentCodeInfoMap - The map of payment code info to validate and import.
     * @param {'receiver' | 'sender'} target - The target map to update ('receiver' or 'sender').
     * @throws {Error} If any of the payment code info is invalid.
     */
    private validateAndImportPaymentCodeInfo(
        paymentCodeInfoMap: { [key: string]: paymentCodeInfo[] },
        target: 'receiver' | 'sender',
    ): void {
        const targetMap = target === 'receiver' ? this._receiverPaymentCodeInfo : this._senderPaymentCodeInfo;

        for (const [paymentCode, paymentCodeInfoArray] of Object.entries(paymentCodeInfoMap)) {
            if (!validatePaymentCode(paymentCode)) {
                throw new Error(`Invalid payment code: ${paymentCode}`);
            }
            for (const pcInfo of paymentCodeInfoArray) {
                this.validatePaymentCodeInfo(pcInfo);
            }
            targetMap.set(paymentCode, paymentCodeInfoArray);
        }
    }

    /**
     * Validates a payment code info object.
     *
     * @param {paymentCodeInfo} pcInfo - The payment code info to validate.
     * @throws {Error} If the payment code info is invalid.
     */
    private validatePaymentCodeInfo(pcInfo: paymentCodeInfo): void {
        if (!/^(0x)?[0-9a-fA-F]{40}$/.test(pcInfo.address)) {
            throw new Error('Invalid payment code info: address must be a 40-character hexadecimal string');
        }
        if (!Number.isInteger(pcInfo.index) || pcInfo.index < 0) {
            throw new Error('Invalid payment code info: index must be a non-negative integer');
        }
        if (typeof pcInfo.isUsed !== 'boolean') {
            throw new Error('Invalid payment code info: isUsed must be a boolean');
        }
        if (!Object.values(Zone).includes(pcInfo.zone)) {
            throw new Error(`Invalid payment code info: zone '${pcInfo.zone}' is not a valid Zone`);
        }
        if (!Number.isInteger(pcInfo.account) || pcInfo.account < 0) {
            throw new Error('Invalid payment code info: account must be a non-negative integer');
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
            const addressInfo = this.getAddressInfo(info.address);
            if (!addressInfo) {
                throw new Error(`Address ${info.address} not found in wallet`);
            }
            if (info.account !== undefined && info.account !== addressInfo.account) {
                throw new Error(`Account ${info.account} not found for address ${info.address}`);
            }
            // validate Outpoint
            if (info.outpoint.txhash == null || info.outpoint.index == null || info.outpoint.denomination == null) {
                throw new Error(`Invalid Outpoint: ${JSON.stringify(info)} `);
            }
        });
    }

    /**
     * Creates a new BIP47 payment code for the specified account. The payment code is derived from the account's BIP32
     * root key.
     *
     * @param {number} account - The account index to derive the payment code from.
     * @returns {Promise<string>} A promise that resolves to the Base58-encoded BIP47 payment code.
     */
    public async getPaymentCode(account: number = 0): Promise<string> {
        const privatePcode = await this._getPaymentCodePrivate(account);
        return privatePcode.toBase58();
    }

    // helper method to get a bip32 API instance
    private async _getBIP32API(): Promise<BIP32API> {
        return BIP32Factory(ecc) as BIP32API;
    }

    // helper method to decode a base58 string into a Uint8Array
    private async _decodeBase58(base58: string): Promise<Uint8Array> {
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
    private async _getPaymentCodePrivate(account: number): Promise<PaymentCodePrivate> {
        const bip32 = await this._getBIP32API();

        const accountNode = this._root.deriveChild(account);

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
    public async getNextSendAddress(receiverPaymentCode: string, zone: Zone, account: number = 0): Promise<string> {
        const bip32 = await this._getBIP32API();
        const buf = await this._decodeBase58(receiverPaymentCode);
        const version = buf[0];
        if (version !== PC_VERSION) throw new Error('Invalid payment code version');

        const receiverPCodePrivate = await this._getPaymentCodePrivate(account);
        const senderPCodePublic = new PaymentCodePublic(ecc, bip32, buf.slice(1));

        const paymentCodeInfoArray = this._receiverPaymentCodeInfo.get(receiverPaymentCode);
        const lastIndex =
            paymentCodeInfoArray && paymentCodeInfoArray.length > 0
                ? paymentCodeInfoArray[paymentCodeInfoArray.length - 1].index
                : 0;

        let addrIndex = lastIndex;
        for (let attempts = 0; attempts < MAX_ADDRESS_DERIVATION_ATTEMPTS; attempts++) {
            const address = senderPCodePublic.getPaymentAddress(receiverPCodePrivate, addrIndex++);
            if (this.isValidAddressForZone(address, zone)) {
                const pcInfo: paymentCodeInfo = {
                    address,
                    index: addrIndex,
                    account,
                    zone,
                    isUsed: false,
                };
                if (paymentCodeInfoArray) {
                    paymentCodeInfoArray.push(pcInfo);
                } else {
                    this._receiverPaymentCodeInfo.set(receiverPaymentCode, [pcInfo]);
                }
                return address;
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
    public async getNextReceiveAddress(senderPaymentCode: string, zone: Zone, account: number = 0): Promise<string> {
        const bip32 = await this._getBIP32API();
        const buf = await this._decodeBase58(senderPaymentCode);
        const version = buf[0];
        if (version !== PC_VERSION) throw new Error('Invalid payment code version');

        const senderPCodePublic = new PaymentCodePublic(ecc, bip32, buf.slice(1));
        const receiverPCodePrivate = await this._getPaymentCodePrivate(account);

        const paymentCodeInfoArray = this._senderPaymentCodeInfo.get(senderPaymentCode);
        const lastIndex =
            paymentCodeInfoArray && paymentCodeInfoArray.length > 0
                ? paymentCodeInfoArray[paymentCodeInfoArray.length - 1].index
                : 0;

        let addrIndex = lastIndex;
        for (let attempts = 0; attempts < MAX_ADDRESS_DERIVATION_ATTEMPTS; attempts++) {
            const address = receiverPCodePrivate.getPaymentAddress(senderPCodePublic, addrIndex++);
            if (this.isValidAddressForZone(address, zone)) {
                const pcInfo: paymentCodeInfo = {
                    address,
                    index: addrIndex,
                    account,
                    zone,
                    isUsed: false,
                };
                if (paymentCodeInfoArray) {
                    paymentCodeInfoArray.push(pcInfo);
                } else {
                    this._senderPaymentCodeInfo.set(senderPaymentCode, [pcInfo]);
                }
                return address;
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
     * @param {'receiver' | 'sender'} type - The type of payment code ('receiver' or 'sender').
     */
    public openChannel(paymentCode: string, type: 'receiver' | 'sender'): void {
        if (!validatePaymentCode(paymentCode)) {
            throw new Error(`Invalid payment code: ${paymentCode}`);
        }
        if (type === 'receiver') {
            if (this._receiverPaymentCodeInfo.has(paymentCode)) {
                return;
            }
            this._receiverPaymentCodeInfo.set(paymentCode, []);
        } else {
            if (this._senderPaymentCodeInfo.has(paymentCode)) {
                return;
            }
            this._senderPaymentCodeInfo.set(paymentCode, []);
        }
    }
}
