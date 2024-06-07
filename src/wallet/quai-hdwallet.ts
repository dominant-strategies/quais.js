import { HDWallet } from './hdwallet.js';
import { HDNodeWallet } from './hdnodewallet.js';
import { QuaiTransactionRequest, Provider, TransactionResponse } from '../providers/index.js';
import { resolveAddress } from '../address/index.js';

export class QuaiHDWallet extends HDWallet {
    protected static _cointype: number = 994;

    protected static _parentPath = `m/44'/${this._cointype}'`;

    private constructor(root: HDNodeWallet, provider?: Provider) {
        super(root, provider);
    }

    private _getHDNode(from: string): HDNodeWallet {
        const fromAddressInfo = this._addresses.get(from);
        if (!fromAddressInfo) {
            throw new Error(`Address ${from} is not known to wallet`);
        }

        // derive a HD node for the from address using the index
        const accountNode = this._accounts.get(fromAddressInfo.account);
        if (!accountNode) {
            throw new Error(`Account ${fromAddressInfo.account} not found`);
        }
        const changeNode = accountNode.deriveChild(0);
        return changeNode.deriveChild(fromAddressInfo.index);
    }

    async signTransaction(tx: QuaiTransactionRequest): Promise<string> {
        const from = await resolveAddress(tx.from);
        const fromNode = this._getHDNode(from);
        const signedTx = await fromNode.signTransaction(tx);
        return signedTx;
    }

    async sendTransaction(tx: QuaiTransactionRequest): Promise<TransactionResponse> {
        if (!this.provider) {
            throw new Error('Provider is not set');
        }
        const from = await resolveAddress(tx.from);
        const fromNode = this._getHDNode(from);
        const fromNodeConnected = fromNode.connect(this.provider);
        return await fromNodeConnected.sendTransaction(tx);
    }
}
