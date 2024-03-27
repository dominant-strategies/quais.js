/**
 *  Generally the [[Wallet]] and [[JsonRpcSigner]] and their sub-classes
 *  are sufficent for most developers, but this is provided to
 *  fascilitate more complex Signers.
 *
 *  @_section: api/providers/abstract-signer: Subclassing Signer [abstract-signer]
 */
import { resolveAddress } from "../address/index.js";
import { Transaction } from "../transaction/index.js";
import {
    defineProperties, getBigInt, resolveProperties,
    assert, assertArgument
} from "../utils/index.js";
import { copyRequest } from "./provider.js";

import type { TypedDataDomain, TypedDataField } from "../hash/index.js";
import type { TransactionLike } from "../transaction/index.js";

import type {
    BlockTag, Provider, TransactionRequest, TransactionResponse
} from "./provider.js";
import type { Signer } from "./signer.js";
import { getTxType } from "../utils/index.js";

function checkProvider(signer: AbstractSigner, operation: string): Provider {
    if (signer.provider) { return signer.provider; }
    assert(false, "missing provider", "UNSUPPORTED_OPERATION", { operation });
}

async function populate(signer: AbstractSigner, tx: TransactionRequest): Promise<TransactionLike<string>> {
    let pop: any = copyRequest(tx);

    if (pop.to != null) { pop.to = resolveAddress(pop.to, signer); }

    if (pop.from != null) {
        const from = pop.from;
        pop.from = Promise.all([
            signer.getAddress(),
            resolveAddress(from, signer)
        ]).then(([ address, from ]) => {
            assertArgument(address.toLowerCase() === from.toLowerCase(),
                "transaction from mismatch", "tx.from", from);
            return address;
        });
    } else {
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
export abstract class AbstractSigner<P extends null | Provider = null | Provider> implements Signer {
    /**
     *  The provider this signer is connected to.
     */
    readonly provider!: P;

    /**
     *  Creates a new Signer connected to %%provider%%.
     */
    constructor(provider?: P) {
        defineProperties<AbstractSigner>(this, { provider: (provider || null) });
    }

    /**
     *  Resolves to the Signer address.
     */
    abstract getAddress(): Promise<string>;

    /**
     *  Returns the signer connected to %%provider%%.
     *
     *  This may throw, for example, a Signer connected over a Socket or
     *  to a specific instance of a node may not be transferrable.
     */
    abstract connect(provider: null | Provider): Signer;

    async getNonce(blockTag?: BlockTag): Promise<number> {
        return checkProvider(this, "getTransactionCount").getTransactionCount(await this.getAddress(), blockTag);
    }

    async populateCall(tx: TransactionRequest): Promise<TransactionLike<string>> {
        const pop = await populate(this, tx);
        return pop;
    }

    // async populateQiTransaction(tx: TransactionRequest): Promise<TransactionLike<string>> {

    // }

    async populateTransaction(tx: TransactionRequest): Promise<TransactionLike<string>> {
        console.log("populateTransaction")
        const provider = checkProvider(this, "populateTransaction");

        const pop = await populate(this, tx);

        if (pop.type == null) {
            pop.type = await getTxType(pop.from ?? null, pop.to ?? null);
        }

        if (pop.nonce == null) {
            pop.nonce = await this.getNonce("pending");
        }

        if (pop.gasLimit == null) {
            if (pop.type == 0 ) pop.gasLimit = await this.estimateGas(pop);
            else {
                //Special cases for type 2 tx to bypass address out of scope in the node
                let temp = pop.to
                pop.to =  "0x0000000000000000000000000000000000000000"
                pop.gasLimit = getBigInt(2 * Number(await this.estimateGas(pop)));
                pop.to = temp
            }
        }

        // Populate the chain ID
        const network = await (<Provider>(this.provider)).getNetwork();

        if (pop.chainId != null) {
            const chainId = getBigInt(pop.chainId);
            assertArgument(chainId === network.chainId, "transaction chainId mismatch", "tx.chainId", tx.chainId);
        } else {
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
        //@TOOD: Don't await all over the place; save them up for
        // the end for better batching
        return await resolveProperties(pop);
    }

    async estimateGas(tx: TransactionRequest): Promise<bigint> {
                return checkProvider(this, "estimateGas").estimateGas(await this.populateCall(tx));
    }

    async call(tx: TransactionRequest): Promise<string> {
        return checkProvider(this, "call").call(await this.populateCall(tx));
    }

    async resolveName(name: string): Promise<null | string> {
        const provider = checkProvider(this, "resolveName");
        return await provider.resolveName(name);
    }

    async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
        console.log('sendTransaction', tx)
        const provider = checkProvider(this, "sendTransaction");
        const pop = await this.populateTransaction(tx);
        console.log("populated tx", pop)
        delete pop.from;
        
        const txObj = Transaction.from(pop);
        const signedTx = await this.signTransaction(txObj);
        const result = await provider.broadcastTransaction(signedTx);
        return result
    }

    abstract signTransaction(tx: TransactionRequest): Promise<string>;
    abstract signMessage(message: string | Uint8Array): Promise<string>;
    abstract signTypedData(domain: TypedDataDomain, types: Record<string, Array<TypedDataField>>, value: Record<string, any>): Promise<string>;
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
    readonly address!: string;

    /**
     *  Creates a new **VoidSigner** with %%address%% attached to
     *  %%provider%%.
     */
    constructor(address: string, provider?: null | Provider) {
        super(provider);
        defineProperties<VoidSigner>(this, { address });
    }

    async getAddress(): Promise<string> { return this.address; }

    connect(provider: null | Provider): VoidSigner {
        return new VoidSigner(this.address, provider);
    }

    #throwUnsupported(suffix: string, operation: string): never {
        assert(false, `VoidSigner cannot sign ${ suffix }`, "UNSUPPORTED_OPERATION", { operation });
    }

    async signTransaction(tx: TransactionRequest): Promise<string> {
        this.#throwUnsupported("transactions", "signTransaction");
    }

    async signMessage(message: string | Uint8Array): Promise<string> {
        this.#throwUnsupported("messages", "signMessage");
    }

    async signTypedData(domain: TypedDataDomain, types: Record<string, Array<TypedDataField>>, value: Record<string, any>): Promise<string> {
        this.#throwUnsupported("typed-data", "signTypedData");
    }
}

