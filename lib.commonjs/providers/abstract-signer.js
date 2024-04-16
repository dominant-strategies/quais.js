"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoidSigner = exports.AbstractSigner = void 0;
/**
 *  Generally the [[Wallet]] and [[JsonRpcSigner]] and their sub-classes
 *  are sufficent for most developers, but this is provided to
 *  fascilitate more complex Signers.
 *
 *  @_section: api/providers/abstract-signer: Subclassing Signer [abstract-signer]
 */
const index_js_1 = require("../address/index.js");
const index_js_2 = require("../transaction/index.js");
const index_js_3 = require("../utils/index.js");
const provider_js_1 = require("./provider.js");
const index_js_4 = require("../utils/index.js");
function checkProvider(signer, operation) {
    if (signer.provider) {
        return signer.provider;
    }
    (0, index_js_3.assert)(false, "missing provider", "UNSUPPORTED_OPERATION", { operation });
}
async function populate(signer, tx) {
    let pop = (0, provider_js_1.copyRequest)(tx);
    if (pop.to != null) {
        pop.to = (0, index_js_1.resolveAddress)(pop.to, signer);
    }
    if (pop.from != null) {
        const from = pop.from;
        pop.from = Promise.all([
            signer.getAddress(),
            (0, index_js_1.resolveAddress)(from, signer)
        ]).then(([address, from]) => {
            (0, index_js_3.assertArgument)(address.toLowerCase() === from.toLowerCase(), "transaction from mismatch", "tx.from", from);
            return address;
        });
    }
    else {
        pop.from = signer.getAddress();
    }
    return await (0, index_js_3.resolveProperties)(pop);
}
/**
 *  An **AbstractSigner** includes most of teh functionality required
 *  to get a [[Signer]] working as expected, but requires a few
 *  Signer-specific methods be overridden.
 *
 */
class AbstractSigner {
    /**
     *  The provider this signer is connected to.
     */
    provider;
    /**
     *  Creates a new Signer connected to %%provider%%.
     */
    constructor(provider) {
        (0, index_js_3.defineProperties)(this, { provider: (provider || null) });
    }
    async getNonce(blockTag) {
        return checkProvider(this, "getTransactionCount").getTransactionCount(await this.getAddress(), blockTag);
    }
    async populateCall(tx) {
        const pop = await populate(this, tx);
        return pop;
    }
    async populateTransaction(tx) {
        const provider = checkProvider(this, "populateTransaction");
        const pop = await populate(this, tx);
        if (pop.nonce == null) {
            pop.nonce = await this.getNonce("pending");
        }
        if (pop.type == null) {
            pop.type = (0, index_js_4.getTxType)(pop.from ?? null, pop.to ?? null);
        }
        if (pop.gasLimit == null) {
            if (pop.type == 0)
                pop.gasLimit = await this.estimateGas(pop);
            else {
                //Special cases for type 2 tx to bypass address out of scope in the node
                let temp = pop.to;
                pop.to = "0x0000000000000000000000000000000000000000";
                pop.gasLimit = (0, index_js_3.getBigInt)(2 * Number(await this.estimateGas(pop)));
                pop.to = temp;
            }
        }
        // Populate the chain ID
        const network = await (this.provider).getNetwork();
        if (pop.chainId != null) {
            const chainId = (0, index_js_3.getBigInt)(pop.chainId);
            (0, index_js_3.assertArgument)(chainId === network.chainId, "transaction chainId mismatch", "tx.chainId", tx.chainId);
        }
        else {
            pop.chainId = network.chainId;
        }
        if (pop.maxFeePerGas == null || pop.maxPriorityFeePerGas == null) {
            const feeData = await provider.getFeeData();
            if (pop.maxFeePerGas == null) {
                pop.maxFeePerGas = feeData.maxFeePerGas;
            }
            if (pop.maxPriorityFeePerGas == null) {
                pop.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
            }
        }
        if (pop.type == 2) {
            pop.externalGasLimit = (0, index_js_3.getBigInt)(Number(pop.gasLimit) * 9);
            pop.externalGasTip = (0, index_js_3.getBigInt)(Number(pop.maxPriorityFeePerGas) * 9);
            pop.externalGasPrice = (0, index_js_3.getBigInt)(Number(pop.maxFeePerGas) * 9);
        }
        //@TOOD: Don't await all over the place; save them up for
        // the end for better batching
        return await (0, index_js_3.resolveProperties)(pop);
    }
    async estimateGas(tx) {
        return checkProvider(this, "estimateGas").estimateGas(await this.populateCall(tx));
    }
    async call(tx) {
        return checkProvider(this, "call").call(await this.populateCall(tx));
    }
    async resolveName(name) {
        const provider = checkProvider(this, "resolveName");
        return await provider.resolveName(name);
    }
    async sendTransaction(tx) {
        const provider = checkProvider(this, "sendTransaction");
        const pop = await this.populateTransaction(tx);
        console.log('pop', pop.from);
        delete pop.from;
        const txObj = index_js_2.Transaction.from(pop);
        console.log(JSON.stringify(txObj, null, 4));
        const signedTx = await this.signTransaction(txObj);
        return await provider.broadcastTransaction(signedTx);
    }
}
exports.AbstractSigner = AbstractSigner;
/**
 *  A **VoidSigner** is a class deisgned to allow an address to be used
 *  in any API which accepts a Signer, but for which there are no
 *  credentials available to perform any actual signing.
 *
 *  This for example allow impersonating an account for the purpose of
 *  static calls or estimating gas, but does not allow sending transactions.
 */
class VoidSigner extends AbstractSigner {
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
        (0, index_js_3.defineProperties)(this, { address });
    }
    async getAddress() { return this.address; }
    connect(provider) {
        return new VoidSigner(this.address, provider);
    }
    #throwUnsupported(suffix, operation) {
        (0, index_js_3.assert)(false, `VoidSigner cannot sign ${suffix}`, "UNSUPPORTED_OPERATION", { operation });
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
exports.VoidSigner = VoidSigner;
//# sourceMappingURL=abstract-signer.js.map