import { AbstractHDWallet } from './hdwallet.js';
import { HDNodeWallet } from './hdnodewallet.js';
import { QuaiTransactionRequest, Provider, TransactionResponse } from '../providers/index.js';
import { resolveAddress } from '../address/index.js';
import { AllowedCoinType } from '../constants/index.js';
import { SerializedHDWallet } from './hdwallet.js';
import { Mnemonic } from './mnemonic.js';

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
}
