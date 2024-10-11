import { keccak256, Signature } from '../crypto/index.js';
import { getBigInt, assert, assertArgument } from '../utils/index.js';

import type { BigNumberish } from '../utils/index.js';
import type { SignatureLike } from '../crypto/index.js';
import { encodeProtoTransaction } from '../encoding/proto-encode.js';
import { Zone } from '../constants/index.js';

/**
 * A **TransactionLike** is a JSON representation of a transaction.
 *
 * @category Transaction
 */
export interface TransactionLike {
    /**
     * The type.
     */
    type: null | number;

    /**
     * The chain ID the transaction is valid on.
     */
    chainId?: null | BigNumberish;

    /**
     * The signature for the transaction
     */
    signature?: null | SignatureLike;

    /**
     * The hash of the transaction.
     */
    hash?: null | string;
}

/**
 * A **ProtoTransaction** is a JSON representation of a either a Quai or Qi transaction.
 *
 * @category Transaction
 */
export interface ProtoTransaction {
    /**
     * The type of the transaction.
     */
    type: number;

    /**
     * The recipient address.
     */
    to?: Uint8Array | null;

    /**
     * The nonce of the transaction.
     */
    nonce?: number;

    /**
     * The value of the transaction.
     */
    value?: Uint8Array;

    /**
     * The gas limit for the transaction.
     */
    gas?: number;

    /**
     * The data of the transaction.
     */
    data?: Uint8Array;

    /**
     * The chain ID of the transaction.
     */
    chain_id: Uint8Array;

    /**
     * The gas price for the transaction.
     */
    gas_price?: Uint8Array;

    /**
     * The gas tip cap for the transaction.
     */
    miner_tip?: Uint8Array;

    /**
     * The access list for the transaction.
     */
    access_list?: ProtoAccessList;

    /**
     * The V component of the signature.
     */
    v?: Uint8Array;

    /**
     * The R component of the signature.
     */
    r?: Uint8Array;

    /**
     * The S component of the signature.
     */
    s?: Uint8Array;

    /**
     * The originating transaction hash.
     */
    originating_tx_hash?: string;

    /**
     * The external transaction index.
     */
    etx_index?: number | null;

    /**
     * The external transaction sender.
     */
    etx_sender?: Uint8Array | null;

    work_nonce?: number | null;

    etx_type?: number | null;

    /**
     * The transaction inputs.
     */
    tx_ins?: { tx_ins: Array<ProtoTxInput> };

    /**
     * The transaction outputs.
     */
    tx_outs?: { tx_outs: Array<ProtoTxOutput> };

    /**
     * The signature of the transaction.
     */
    signature?: Uint8Array;
}

/**
 * A **ProtoTxOutput** is a JSON representation of a Qi UTXO transaction output.
 *
 * @category Transaction
 */
export type ProtoTxOutput = {
    /**
     * The address of the output.
     */
    address: Uint8Array;

    /**
     * The denomination of the output.
     */
    denomination: number;

    /**
     * The lock of the output.
     */
    lock?: Uint8Array;
};

/**
 * A **ProtoTxInput** is a JSON representation of a Qi UTXO transaction input.
 *
 * @category Transaction
 */
export type ProtoTxInput = {
    /**
     * The previous out point.
     */
    previous_out_point: {
        /**
         * The hash of the previous out point.
         */
        hash: {
            value: Uint8Array;
        };
        /**
         * The index of the previous out point.
         */
        index: number;
    };
    /**
     * The public key.
     */
    pub_key: Uint8Array;
};

/**
 * A **ProtoAccessList** is a JSON representation of an access list.
 *
 * @category Transaction
 */
export interface ProtoAccessList {
    /**
     * The access tuples.
     */
    access_tuples: Array<ProtoAccessTuple>;
}

/**
 * A **ProtoAccessTuple** is a JSON representation of an access tuple.
 *
 * @category Transaction
 */
export interface ProtoAccessTuple {
    /**
     * The address of the access tuple.
     */
    address: Uint8Array;

    /**
     * The storage keys of the access tuple.
     */
    storage_key: Array<ProtoStorageKey>;
}

export interface ProtoStorageKey {
    value: Uint8Array;
}

type allowedSignatureTypes = Signature | string;

/**
 * An **AbstractTransaction** describes the common operations to be executed on Quai and Qi ledgers by an Externally
 * Owned Account (EOA). This class must be subclassed by concrete implementations of transactions on each ledger.
 */
export abstract class AbstractTransaction<S extends allowedSignatureTypes> implements TransactionLike {
    protected _type: number | null;
    protected _signature: null | S;
    protected _chainId: bigint;

    /**
     * The transaction type.
     *
     * If null, the type will be automatically inferred based on explicit properties.
     */
    get type(): null | number {
        return this._type;
    }
    set type(value: null | number | string) {
        switch (value) {
            case null:
                this._type = null;
                break;
            case 0:
            case 'standard':
                this._type = 0;
                break;
            case 2:
            case 'utxo':
                this._type = 2;
                break;
            default:
                assertArgument(false, 'unsupported transaction type', 'type', value);
        }
    }

    /**
     * The name of the transaction type.
     */
    get typeName(): null | string {
        switch (this.type) {
            case 0:
                return 'standard';
            case 1:
                return 'external';
            case 2:
                return 'utxo';
        }

        return null;
    }

    /**
     * The chain ID this transaction is valid on.
     */
    get chainId(): bigint {
        return this._chainId;
    }
    set chainId(value: BigNumberish) {
        this._chainId = getBigInt(value);
    }

    /**
     * If signed, the signature for this transaction.
     */
    get signature(): S {
        return (this._signature || null) as S;
    }
    set signature(value: S) {
        if (typeof value === 'string') {
            this._signature = value as S;
        } else {
            this._signature = (value == null ? null : Signature.from(value)) as S;
        }
    }

    /**
     * Creates a new Transaction with default values.
     */
    constructor() {
        this._type = null;
        this._chainId = BigInt(0);
        this._signature = null;
    }

    /**
     * The pre-image hash of this transaction.
     *
     * This is the digest that a [Signer](../interfaces/Signer) must sign to authorize this transaction.
     */
    get digest(): string {
        return keccak256(this.unsignedSerialized);
    }

    /**
     * Returns true if signed.
     *
     * This provides a Type Guard that properties requiring a signed transaction are non-null.
     *
     * @returns {boolean} Indicates if the transaction is signed.
     */
    isSigned(): this is AbstractTransaction<S> & {
        type: number;
        typeName: string;
        from: string;
        signature: Signature;
    } {
        return this.signature != null;
    }

    /**
     * The serialized transaction.
     *
     * This throws if the transaction is unsigned. For the pre-image, use
     * {@link AbstractTransaction.unsignedSerialized | **unsignedSerialized** }.
     */
    get serialized(): string {
        assert(
            this.signature != null,
            'cannot serialize unsigned transaction; maybe you meant .unsignedSerialized',
            'UNSUPPORTED_OPERATION',
            { operation: '.serialized' },
        );
        return encodeProtoTransaction(this.toProtobuf(true));
    }

    /**
     * The transaction pre-image.
     *
     * The hash of this is the digest which needs to be signed to authorize this transaction.
     */
    get unsignedSerialized(): string {
        return encodeProtoTransaction(this.toProtobuf(false));
    }

    /**
     * Return the most "likely" type; currently the highest supported transaction type.
     *
     * @returns {number} The inferred transaction type.
     */
    inferType(): number {
        return <number>this.inferTypes().pop();
    }

    /**
     * Validates the explicit properties and returns a list of compatible transaction types.
     *
     * @returns {number[]} The compatible transaction types.
     */
    abstract inferTypes(): Array<number>;

    /**
     * Create a copy of this transaction.
     *
     * @returns {AbstractTransaction} The cloned transaction.
     */
    abstract clone(): AbstractTransaction<S>;

    /**
     * Return a JSON-friendly object.
     *
     * @returns {TransactionLike} The JSON-friendly object.
     */
    abstract toJSON(): TransactionLike;

    /**
     * Return a protobuf-friendly JSON object.
     *
     * @param {boolean} includeSignature - Whether to include the signature in the protobuf.
     * @returns {ProtoTransaction} The protobuf-friendly JSON object.
     */
    abstract toProtobuf(includeSignature: boolean): ProtoTransaction;

    /**
     * Get the origin zone of the transaction.
     *
     * @returns {Zone | undefined} The origin zone.
     */
    abstract get originZone(): Zone | undefined;

    /**
     * Get the destination zone of the transaction.
     *
     * @returns {Zone | undefined} The destination zone.
     */
    abstract get destZone(): Zone | undefined;

    /**
     * Check if the transaction is external.
     *
     * @returns {boolean} True if the transaction is external.
     */
    get isExternal(): boolean {
        return this.destZone !== undefined && this.originZone !== this.destZone;
    }
}
