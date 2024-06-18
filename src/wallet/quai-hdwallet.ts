import { AbstractHDWallet } from './hdwallet.js';
import { HDNodeWallet } from './hdnodewallet.js';
import { QuaiTransactionRequest, Provider, TransactionResponse } from '../providers/index.js';
import { resolveAddress } from '../address/index.js';
import { AllowedCoinType } from '../constants/index.js';
import { SerializedHDWallet } from './hdwallet.js';
import { Mnemonic } from './mnemonic.js';
import { TypedDataDomain, TypedDataField } from '../hash/index.js';

export class QuaiHDWallet extends AbstractHDWallet {
    protected static _version: number = 1;

    protected static _coinType: AllowedCoinType = 994;

    private constructor(root: HDNodeWallet, provider?: Provider) {
        super(root, provider);
    }

    public async signTransaction(tx: QuaiTransactionRequest): Promise<string> {
        const from = await resolveAddress(tx.from);
        const fromNode = this._getHDNodeForAddress(from);
        const signedTx = await fromNode.signTransaction(tx);
        return signedTx;
    }

    public async sendTransaction(tx: QuaiTransactionRequest): Promise<TransactionResponse> {
        if (!this.provider) {
            throw new Error('Provider is not set');
        }
        const from = await resolveAddress(tx.from);
        const fromNode = this._getHDNodeForAddress(from);
        const fromNodeConnected = fromNode.connect(this.provider);
        return await fromNodeConnected.sendTransaction(tx);
    }

    public async signMessage(address: string, message: string | Uint8Array): Promise<string> {
        const addrNode = this._getHDNodeForAddress(address);
        return await addrNode.signMessage(message);
    }

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
