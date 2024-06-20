import { AbstractHDWallet } from './hdwallet.js';
import { HDNodeWallet } from './hdnodewallet.js';
import { QuaiTransactionRequest, Provider, TransactionResponse } from '../providers/index.js';
import { resolveAddress } from '../address/index.js';
import { AllowedCoinType } from '../constants/index.js';
import { SerializedHDWallet } from './hdwallet.js';
import { Mnemonic } from './mnemonic.js';
import { TypedDataDomain, TypedDataField } from '../hash/index.js';

/**
 * The Quai HD wallet is a BIP44-compliant hierarchical deterministic wallet used for managing a set of addresses in the
 * Quai ledger. This is the easiest way to manage the interaction of managing accounts and addresses on the Quai
 * network, however, if your use case requires a single address Quai address, you can use the {@link Wallet} class.
 *
 * The Quai HD wallet supports:
 *
 * - Adding accounts to the wallet heierchy
 * - Generating addresses for a specific account in any {@link Zone}
 * - Signing and sending transactions for any address in the wallet
 * - Signing and verifying EIP1193 typed data for any address in the wallet.
 * - Serializing the wallet to JSON and deserializing it back to a wallet instance.
 *
 * @category Wallet
 * @example
 *
 * ```ts
 * import { QuaiHDWallet, Zone } from 'quais';
 *
 * const wallet = new QuaiHDWallet();
 * const cyrpus1Address = wallet.getNextAddress(0, Zone.Cyrpus1); // get the first address in the Cyrpus1 zone
 * await wallet.sendTransaction({ from: address, to: '0x...', value: 100 }); // send a transaction
 * const serializedWallet = wallet.serialize(); // serialize current (account/address) state of the wallet
 * .
 * .
 * .
 * const deserializedWallet = QuaiHDWallet.deserialize(serializedWallet); // create a new wallet instance from the serialized data
 * ```
 */
export class QuaiHDWallet extends AbstractHDWallet {
    /**
     * The version of the wallet.
     *
     * @type {number}
     * @static
     */
    protected static _version: number = 1;

    /**
     * The coin type for the wallet.
     *
     * @type {AllowedCoinType}
     * @static
     */
    protected static _coinType: AllowedCoinType = 994;

    /**
     * Create a QuaiHDWallet instance.
     *
     * @param {HDNodeWallet} root - The root HD node wallet.
     * @param {Provider} [provider] - The provider.
     */
    private constructor(root: HDNodeWallet, provider?: Provider) {
        super(root, provider);
    }

    /**
     * Sign a transaction.
     *
     * @param {QuaiTransactionRequest} tx - The transaction request.
     *
     * @returns {Promise<string>} A promise that resolves to the signed transaction.
     */
    public async signTransaction(tx: QuaiTransactionRequest): Promise<string> {
        const from = await resolveAddress(tx.from);
        const fromNode = this._getHDNodeForAddress(from);
        const signedTx = await fromNode.signTransaction(tx);
        return signedTx;
    }

    /**
     * Send a transaction.
     *
     * @param {QuaiTransactionRequest} tx - The transaction request.
     *
     * @returns {Promise<TransactionResponse>} A promise that resolves to the transaction response.
     * @throws {Error} If the provider is not set.
     */
    public async sendTransaction(tx: QuaiTransactionRequest): Promise<TransactionResponse> {
        if (!this.provider) {
            throw new Error('Provider is not set');
        }
        const from = await resolveAddress(tx.from);
        const fromNode = this._getHDNodeForAddress(from);
        const fromNodeConnected = fromNode.connect(this.provider);
        return await fromNodeConnected.sendTransaction(tx);
    }

    /**
     * Sign a message.
     *
     * @param {string} address - The address.
     * @param {string | Uint8Array} message - The message to sign.
     *
     * @returns {Promise<string>} A promise that resolves to the signed message.
     */
    public async signMessage(address: string, message: string | Uint8Array): Promise<string> {
        const addrNode = this._getHDNodeForAddress(address);
        return await addrNode.signMessage(message);
    }

    /**
     * Deserializes the given serialized HD wallet data into an instance of QuaiHDWallet.
     *
     * @async
     * @param {SerializedHDWallet} serialized - The serialized wallet data to be deserialized.
     *
     * @returns {Promise<QuaiHDWallet>} A promise that resolves to an instance of QuaiHDWallet.
     * @throws {Error} If validation of the serialized wallet data fails or if deserialization fails.
     * @public
     * @static
     */
    public static async deserialize(serialized: SerializedHDWallet): Promise<QuaiHDWallet> {
        super.validateSerializedWallet(serialized);
        // create the wallet instance
        const mnemonic = Mnemonic.fromPhrase(serialized.phrase);
        const path = (this as any).parentPath(serialized.coinType);
        const root = HDNodeWallet.fromMnemonic(mnemonic, path);
        const wallet = new this(root);

        // import the addresses
        wallet.importSerializedAddresses(wallet._addresses, serialized.addresses);

        return wallet;
    }

    /**
     * Signs typed data using the private key associated with the given address.
     *
     * @param {string} address - The address for which the typed data is to be signed.
     * @param {TypedDataDomain} domain - The domain information of the typed data, defining the scope of the signature.
     * @param {Record<string, TypedDataField[]>} types - The types of the data to be signed, mapping each data type name
     *   to its fields.
     * @param {Record<string, unknown>} value - The actual data to be signed.
     *
     * @returns {Promise<string>} A promise that resolves to the signed data in string format.
     * @throws {Error} If the address does not correspond to a valid HD node or if signing fails.
     */
    public async signTypedData(
        address: string,
        domain: TypedDataDomain,
        types: Record<string, Array<TypedDataField>>,
        value: Record<string, unknown>,
    ): Promise<string> {
        const addrNode = this._getHDNodeForAddress(address);
        return addrNode.signTypedData(domain, types, value);
    }
}
