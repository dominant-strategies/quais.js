/**
 * Generally the [Wallet](../classes/Wallet) and [JsonRpcSigner](../classes/JsonRpcSigner) and their sub-classes are
 * sufficent for most developers, but this is provided to fascilitate more complex Signers.
 */
import { AddressLike, resolveAddress, validateAddress } from '../address/index.js';
import { defineProperties, getBigInt, resolveProperties, assert, assertArgument } from '../utils/index.js';
import { addressFromTransactionRequest, copyRequest, QuaiTransactionRequest } from '../providers/provider.js';

import type { TypedDataDomain, TypedDataField } from '../hash/index.js';
import type { TransactionLike } from '../transaction/index.js';

import type { BlockTag, Provider, TransactionRequest, TransactionResponse } from '../providers/provider.js';
import type { Signer } from './signer.js';
import { getTxType } from '../utils/index.js';
import { QuaiTransaction, QuaiTransactionLike } from '../transaction/index.js';
import { toZone, Zone } from '../constants/index.js';
import { AccessList } from '../transaction/index.js';

function checkProvider(signer: AbstractSigner, operation: string): Provider {
    if (signer.provider) {
        return signer.provider;
    }
    assert(false, 'missing provider', 'UNSUPPORTED_OPERATION', { operation });
}

async function populate(signer: AbstractSigner, tx: TransactionRequest): Promise<TransactionLike> {
    const pop: any = copyRequest(tx);

    if (pop.to != null) {
        pop.to = resolveAddress(pop.to);
        validateAddress(pop.to);
    }

    if (pop.from != null) {
        const from = pop.from;
        pop.from = await Promise.all([signer.getAddress(), resolveAddress(from)]).then(([address, from]) => {
            assertArgument(address.toLowerCase() === from.toLowerCase(), 'transaction from mismatch', 'tx.from', from);
            return address;
        });
    } else {
        pop.from = await signer.getAddress();
    }
    validateAddress(pop.from);

    return await resolveProperties(pop);
}

/**
 * An **AbstractSigner** includes most of teh functionality required to get a {@link Signer | **Signer**} working as
 * expected, but requires a few Signer-specific methods be overridden.
 *
 * @category Signers
 */
export abstract class AbstractSigner<P extends null | Provider = null | Provider> implements Signer {
    /**
     * The provider this signer is connected to.
     */
    readonly provider!: P;

    /**
     * Creates a new Signer connected to `provider`.
     */
    constructor(provider?: P) {
        defineProperties<AbstractSigner>(this, { provider: provider || null });
    }

    /**
     * Resolves to the Signer address.
     */
    abstract getAddress(): Promise<string>;

    /**
     * @ignore
     */
    _getAddress(address: AddressLike): string | Promise<string> {
        return resolveAddress(address);
    }

    async zoneFromAddress(_address: AddressLike): Promise<Zone> {
        const address: string | Promise<string> = this._getAddress(_address);
        return toZone((await address).slice(0, 4));
    }
    /**
     * Returns the signer connected to `provider`.
     *
     * This may throw, for example, a Signer connected over a Socket or to a specific instance of a node may not be
     * transferrable.
     *
     * @param {Provider} provider - The provider to connect to.
     * @returns {Signer} The connected signer.
     */
    abstract connect(provider: null | Provider): Signer;

    async getNonce(blockTag?: BlockTag): Promise<number> {
        return checkProvider(this, 'getTransactionCount').getTransactionCount(await this.getAddress(), blockTag);
    }

    async populateCall(tx: TransactionRequest): Promise<TransactionLike> {
        const pop = await populate(this, tx);
        return pop;
    }

    async populateQuaiTransaction(tx: QuaiTransactionRequest): Promise<QuaiTransactionLike> {
        const provider = checkProvider(this, 'populateTransaction');
        const zone = await this.zoneFromAddress(tx.from);

        const pop = (await populate(this, tx)) as QuaiTransactionLike;

        if (pop.type == null) {
            pop.type = getTxType(pop.from ?? null, pop.to ?? null);
        }

        if (pop.nonce == null || pop.nonce === 0) {
            pop.nonce = await this.getNonce('pending');
        }

        // Populate the chain ID
        const network = await (<Provider>this.provider).getNetwork();

        if (pop.chainId != null && pop.chainId !== 0n) {
            const chainId = getBigInt(pop.chainId);
            assertArgument(chainId === network.chainId, 'transaction chainId mismatch', 'tx.chainId', zone);
        } else {
            pop.chainId = network.chainId;
        }

        // Create a base transaction object to be used for gas estimation and access list creation
        const baseTx: QuaiTransactionLike = {
            chainId: pop.chainId,
            type: pop.type,
            from: pop.from,
            nonce: pop.nonce,
        };
        if (pop.to) baseTx.to = pop.to;
        if (pop.data) baseTx.data = pop.data;
        if (pop.value) baseTx.value = pop.value;

        if (pop.gasLimit == null || pop.gasLimit === 0n) {
            if (pop.type == 0) {
                pop.gasLimit = await this.estimateGas(baseTx);
            } else {
                //Special cases for type 2 tx to bypass address out of scope in the node
                baseTx.to = '0x0000000000000000000000000000000000000000';
                pop.gasLimit = getBigInt(2 * Number(await this.estimateGas(baseTx)));
                baseTx.to = pop.to;
            }
        }

        if (pop.gasPrice == null || pop.minerTip == null) {
            const feeData = await provider.getFeeData(zone, true);

            if (pop.gasPrice == null) {
                pop.gasPrice = feeData.gasPrice;
            }
            if (pop.minerTip == null) {
                pop.minerTip = feeData.minerTip || 10n;
            }
        }
        if (pop.data) {
            if (tx.accessList) {
                pop.accessList = tx.accessList;
            } else {
                pop.accessList = await this.createAccessList(baseTx as QuaiTransactionRequest);
            }
        }
        //@TOOD: Don't await all over the place; save them up for
        // the end for better batching
        return await resolveProperties(pop);
    }

    async estimateGas(tx: TransactionRequest): Promise<bigint> {
        return checkProvider(this, 'estimateGas').estimateGas(await this.populateCall(tx));
    }

    async createAccessList(tx: QuaiTransactionRequest): Promise<AccessList> {
        return checkProvider(this, 'createAccessList').createAccessList(
            (await this.populateCall(tx)) as QuaiTransactionRequest,
        );
    }

    async call(tx: TransactionRequest): Promise<string> {
        return checkProvider(this, 'call').call(await this.populateCall(tx));
    }

    async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
        const provider = checkProvider(this, 'sendTransaction');
        const zone = await this.zoneFromAddress(addressFromTransactionRequest(tx));
        const pop = await this.populateQuaiTransaction(tx as QuaiTransactionRequest);
        const txObj = QuaiTransaction.from(pop);

        const sender = await this.getAddress();
        const signedTx = await this.signTransaction(txObj);
        return await provider.broadcastTransaction(zone, signedTx, sender);
    }

    abstract signTransaction(tx: TransactionRequest): Promise<string>;
    abstract signMessage(message: string | Uint8Array): Promise<string>;
    abstract signTypedData(
        domain: TypedDataDomain,
        types: Record<string, Array<TypedDataField>>,
        value: Record<string, any>,
    ): Promise<string>;
}

/**
 * A **VoidSigner** is a class deisgned to allow an address to be used in any API which accepts a Signer, but for which
 * there are no credentials available to perform any actual signing.
 *
 * This for example allow impersonating an account for the purpose of static calls or estimating gas, but does not allow
 * sending transactions.
 *
 * @category Signers
 */
export class VoidSigner extends AbstractSigner {
    /**
     * The signer address.
     */
    readonly address!: string;

    /**
     * Creates a new **VoidSigner** with `address` attached to `provider`.
     */
    constructor(address: string, provider?: null | Provider) {
        super(provider);
        defineProperties<VoidSigner>(this, { address });
    }

    async getAddress(): Promise<string> {
        return this.address;
    }

    connect(provider: null | Provider): VoidSigner {
        return new VoidSigner(this.address, provider);
    }

    #throwUnsupported(suffix: string, operation: string): never {
        assert(false, `VoidSigner cannot sign ${suffix}`, 'UNSUPPORTED_OPERATION', { operation });
    }

    // TODO: `domain`, `types` and `value` are not used, remove?
    // TODO: this function only throws, remove?
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async signTransaction(tx: TransactionRequest): Promise<string> {
        this.#throwUnsupported('transactions', 'signTransaction');
    }

    // TODO: `domain`, `types` and `value` are not used, remove?
    // TODO: this function only throws, remove?
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async signMessage(message: string | Uint8Array): Promise<string> {
        this.#throwUnsupported('messages', 'signMessage');
    }

    // TODO: `domain`, `types` and `value` are not used, remove?
    // TODO: this function only throws, remove?
    async signTypedData(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        domain: TypedDataDomain,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        types: Record<string, Array<TypedDataField>>,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        value: Record<string, any>,
    ): Promise<string> {
        this.#throwUnsupported('typed-data', 'signTypedData');
    }
}
