/**
 *  Generally the [[Wallet]] and [[JsonRpcSigner]] and their sub-classes
 *  are sufficent for most developers, but this is provided to
 *  fascilitate more complex Signers.
 *
 *  @_section: api/providers/abstract-signer: Subclassing Signer [abstract-signer]
 */
import { resolveAddress } from "../address/index.js";
import { Transaction } from "../transaction/index.js";
import { defineProperties, getBigInt, resolveProperties, assert, assertArgument, isUTXOAddress } from "../utils/index.js";
import { copyRequest } from "./provider.js";
import { getTxType } from "../utils/index.js";
function checkProvider(signer, operation) {
    if (signer.provider) {
        return signer.provider;
    }
    assert(false, "missing provider", "UNSUPPORTED_OPERATION", { operation });
}
async function populate(signer, tx) {
    let pop = copyRequest(tx);
    if (pop.to != null) {
        pop.to = resolveAddress(pop.to);
    }
    if (pop.from != null) {
        const from = pop.from;
        pop.from = Promise.all([
            signer.getAddress(),
            resolveAddress(from)
        ]).then(([address, from]) => {
            assertArgument(address.toLowerCase() === from.toLowerCase(), "transaction from mismatch", "tx.from", from);
            return address;
        });
    }
    else {
        pop.from = signer.getAddress();
    }
    return await resolveProperties(pop);
}
/**
 *  An **AbstractSigner** includes most of teh functionality required
 *  to get a [[Signer]] working as expected, but requires a few
 *  Signer-specific methods be overridden.
 *
 */
export class AbstractSigner {
    /**
     *  The provider this signer is connected to.
     */
    provider;
    /**
     *  Creates a new Signer connected to %%provider%%.
     */
    constructor(provider) {
        defineProperties(this, { provider: (provider || null) });
    }
    _getAddress(address) {
        return resolveAddress(address);
    }
    async shardFromAddress(_address) {
        let address = this._getAddress(_address);
        return (await address).slice(0, 4);
    }
    async getNonce(blockTag) {
        return checkProvider(this, "getTransactionCount").getTransactionCount(await this.getAddress(), blockTag);
    }
    async populateCall(tx) {
        const pop = await populate(this, tx);
        return pop;
    }
    // async populateQiTransaction(tx: TransactionRequest): Promise<TransactionLike<string>> {
    // }
    async populateTransaction(tx) {
        const provider = checkProvider(this, "populateTransaction");
        const shard = await this.shardFromAddress(tx.from);
        const pop = await populate(this, tx);
        if (pop.type == null) {
            pop.type = await getTxType(pop.from ?? null, pop.to ?? null);
        }
        if (pop.nonce == null) {
            pop.nonce = await this.getNonce("pending");
        }
        if (pop.gasLimit == null) {
            if (pop.type == 0)
                pop.gasLimit = await this.estimateGas(pop);
            else {
                //Special cases for type 2 tx to bypass address out of scope in the node
                let temp = pop.to;
                pop.to = "0x0000000000000000000000000000000000000000";
                pop.gasLimit = getBigInt(2 * Number(await this.estimateGas(pop)));
                pop.to = temp;
            }
        }
        // Populate the chain ID
        const network = await (this.provider).getNetwork();
        if (pop.chainId != null) {
            const chainId = getBigInt(pop.chainId);
            assertArgument(chainId === network.chainId, "transaction chainId mismatch", "tx.chainId", shard);
        }
        else {
            pop.chainId = network.chainId;
        }
        if (pop.maxFeePerGas == null || pop.maxPriorityFeePerGas == null) {
            const feeData = await provider.getFeeData(shard);
            if (pop.maxFeePerGas == null) {
                pop.maxFeePerGas = feeData.maxFeePerGas;
            }
            if (pop.maxPriorityFeePerGas == null) {
                pop.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
            }
        }
        //@TOOD: Don't await all over the place; save them up for
        // the end for better batching
        return await resolveProperties(pop);
    }
    async populateUTXOTransaction(tx) {
        const pop = {
            inputsUTXO: tx.inputs,
            outputsUTXO: tx.outputs,
            type: 2,
            from: String(tx.from)
        };
        //@TOOD: Don't await all over the place; save them up for
        // the end for better batching
        return await resolveProperties(pop);
    }
    async estimateGas(tx) {
        return checkProvider(this, "estimateGas").estimateGas(await this.populateCall(tx));
    }
    async call(tx) {
        return checkProvider(this, "call").call(await this.populateCall(tx));
    }
    async sendTransaction(tx) {
        const provider = checkProvider(this, "sendTransaction");
        let sender = await this.getAddress();
        tx.from = sender;
        const shard = await this.shardFromAddress(tx.from);
        let pop;
        if (isUTXOAddress(sender)) {
            pop = await this.populateUTXOTransaction(tx);
        }
        else {
            pop = await this.populateTransaction(tx);
        }
        //        delete pop.from;
        const txObj = Transaction.from(pop);
        const signedTx = await this.signTransaction(txObj);
        // console.log("signedTX: ", JSON.stringify(txObj))
        return await provider.broadcastTransaction(shard, signedTx);
    }
}
/**
 *  A **VoidSigner** is a class deisgned to allow an address to be used
 *  in any API which accepts a Signer, but for which there are no
 *  credentials available to perform any actual signing.
 *
 *  This for example allow impersonating an account for the purpose of
 *  static calls or estimating gas, but does not allow sending transactions.
 */
export class VoidSigner extends AbstractSigner {
    /**
     *  The signer address.
     */
    address;
    /**
     *  Creates a new **VoidSigner** with %%address%% attached to
     *  %%provider%%.
     */
    constructor(address, provider) {
        super(provider);
        defineProperties(this, { address });
    }
    async getAddress() { return this.address; }
    connect(provider) {
        return new VoidSigner(this.address, provider);
    }
    #throwUnsupported(suffix, operation) {
        assert(false, `VoidSigner cannot sign ${suffix}`, "UNSUPPORTED_OPERATION", { operation });
    }
    async signTransaction(tx) {
        this.#throwUnsupported("transactions", "signTransaction");
    }
    async signMessage(message) {
        this.#throwUnsupported("messages", "signMessage");
    }
    async signTypedData(domain, types, value) {
        this.#throwUnsupported("typed-data", "signTypedData");
    }
}
//# sourceMappingURL=abstract-signer.js.map