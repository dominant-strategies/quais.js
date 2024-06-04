
import { HDWallet } from './hdwallet';
import { HDNodeWallet } from "./hdnodewallet";
import { QuaiTransactionRequest, Provider } from '../providers/index.js';
import { resolveAddress } from "../address/index.js";

export class QuaiHDWallet extends HDWallet {
    protected static _cointype: number = 994;

    protected static _parentPath = `m/44'/${this._cointype}'`;

    private constructor(root: HDNodeWallet, provider?: Provider) {
        super(root, provider);
    }

    async signTransaction(tx: QuaiTransactionRequest): Promise<string> {
        // check the wallet has the private key for the from address
        const from = await resolveAddress(tx.from);
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
        const fromNode = changeNode.deriveChild(fromAddressInfo.index);
        // sign the transaction with the derived HD node
        const signedTx = await fromNode.signTransaction(tx);
        return signedTx;        
    }

    
}