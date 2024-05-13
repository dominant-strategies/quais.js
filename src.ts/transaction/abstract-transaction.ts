
import { Signature } from "../crypto/index.js";
import {
    getBigInt,
    assert, assertArgument
} from "../utils/index.js";

import type { BigNumberish } from "../utils/index.js";
import type { SignatureLike } from "../crypto/index.js";
import { encodeProtoTransaction } from "../utils/proto-encode.js";
import type {TxInput, TxOutput} from "./utxo.js";

/**
 * A **TransactionLike** is a JSON representation of a transaction.
 *
 * @category Transaction
 */
export interface TransactionLike {
    /**
     *  The type.
     */
    type: null | number;

    /**
     *  The chain ID the transaction is valid on.
     */
    chainId?: null | BigNumberish;

    /**
     *   The signature for the transaction
     */

    signature?: null | SignatureLike;

    hash?: null | string;
}

/**
 * @TODO write documentation for this interface.
 *
 * @category Transaction
 */
export interface ProtoTransaction {
    /**
     *  @TODO write documentation for this property.
     */
    type: number

    /**
     *  @TODO write documentation for this property.
     */
    to?: Uint8Array | null

    /**
     *  @TODO write documentation for this property.
     */
    nonce?: number

    /**
     *  @TODO write documentation for this property.
     */
    value?: Uint8Array

    /**
     *  @TODO write documentation for this property.
     */
    gas?: number

    /**
     *  @TODO write documentation for this property.
     */
    data?: Uint8Array

    /**
     *  @TODO write documentation for this property.
     */
    chain_id: Uint8Array

    /**
     *  @TODO write documentation for this property.
     */
    gas_fee_cap?: Uint8Array

    /**
     *  @TODO write documentation for this property.
     */
    gas_tip_cap?: Uint8Array

    /**
     *  @TODO write documentation for this property.
     */
    access_list?: ProtoAccessList

    /**
     *  @TODO write documentation for this property.
     */
    etx_gas_limit?: number

    /**
     *  @TODO write documentation for this property.
     */
    etx_gas_price?: Uint8Array

    /**
     *  @TODO write documentation for this property.
     */
    etx_gas_tip?: Uint8Array

    /**
     *  @TODO write documentation for this property.
     */
    etx_data?: Uint8Array

    /**
     *  @TODO write documentation for this property.
     */
    etx_access_list?: ProtoAccessList

    /**
     *  @TODO write documentation for this property.
     */
    v?: Uint8Array

    /**
     *  @TODO write documentation for this property.
     */
    r?: Uint8Array

    /**
     *  @TODO write documentation for this property.
     */
    s?: Uint8Array

    /**
     *  @TODO write documentation for this property.
     */
    originating_tx_hash?: string

    /**
     *  @TODO write documentation for this property.
     */
    etx_index?: number

    /**
     *  @TODO write documentation for this property.
     */
    etx_sender?: Uint8Array

    /**
     *  @TODO write documentation for this property.
     */
    tx_ins?: { tx_ins : Array<TxInput>}

    /**
     *  @TODO write documentation for this property.
     */
    tx_outs?: { tx_outs: Array<TxOutput> }

    /**
     *  @TODO write documentation for this property.
     */
    signature?: Uint8Array
}

/**
 * @TODO write documentation for this interface.
 *
 * @category Transaction
 */
export interface ProtoAccessList {
    access_tuples: Array<ProtoAccessTuple>
}

/**
 * @TODO write documentation for this interface.
 *
 * @category Transaction
 */
export interface ProtoAccessTuple {
    address: Uint8Array
    storage_key: Array<Uint8Array>
}



type allowedSignatureTypes = Signature | string

/**
 *  A **Transaction** describes an operation to be executed on
 *  Ethereum by an Externally Owned Account (EOA). It includes
 *  who (the {@link ProtoTransaction.to | **to** } address), what (the {@link ProtoTransaction.data | **data** }) and how much (the
 *  {@link ProtoTransaction.value | **value** } in ether) the operation should entail.
 *
 *  @example
 *  ```ts
 *    tx = new Transaction()
 *    //_result:
 *
 *    tx.data = "0x1234";
 *    //_result:
 *  ```
 *
 *  @category Transaction
 */
export abstract class AbstractTransaction<S extends allowedSignatureTypes> implements TransactionLike {
    protected _type: number | null;
    protected _signature: null | S;
    protected _chainId: bigint;

    /**
     *  The transaction type.
     *
     *  If null, the type will be automatically inferred based on
     *  explicit properties.
     */
    get type(): null | number { return this._type; }
    set type(value: null | number | string) {
        switch (value) {
            case null:
                this._type = null;
                break;
            case 0: case "standard":
                this._type = 0;
                break;
            // case 1: case "external":
            //     this.#type = 1;
            //     break;
            case 2: case "utxo":
                this._type = 2;
                break;
            default:
                assertArgument(false, "unsupported transaction type", "type", value);
        }
    }

    /**
     *  The name of the transaction type.
     */
    get typeName(): null | string {
        switch (this.type) {
            case 0: return "standard";
            case 1: return "external";
            case 2: return "utxo";
        }

        return null;
    }


    /**
     *  The chain ID this transaction is valid on.
     */
    get chainId(): bigint { return this._chainId; }
    set chainId(value: BigNumberish) { this._chainId = getBigInt(value); }

    /**
     *  If signed, the signature for this transaction.
     */
    get signature(): S { return (this._signature || null) as S; }
    set signature(value: S) {
        if (typeof value === 'string') {
            this._signature = value as S
        } else {
            this._signature = ((value == null) ? null : Signature.from(value)) as S;
        }
    }
    /**
     *  Creates a new Transaction with default values.
     */
    constructor() {
        this._type = null;
        this._chainId = BigInt(0);
        this._signature = null;
    }

    /**
     *  The pre-image hash of this transaction.
     *
     *  This is the digest that a [Signer](../interfaces/Signer) must sign to authorize
     *  this transaction.
     */
    get unsignedHash(): string {
        throw new Error("Method not implemented.");
    }

    /**
     *  Returns true if signed.
     *
     *  This provides a Type Guard that properties requiring a signed
     *  transaction are non-null.
     *
     *  @returns {boolean} Indicates if the transaction is signed.
     */
    isSigned(): this is (AbstractTransaction<S> & { type: number, typeName: string, from: string, signature: Signature }) {
        //isSigned(): this is SignedTransaction {
        return this.signature != null;
    }

    /**
     *  The serialized transaction.
     *
     *  This throws if the transaction is unsigned. For the pre-image,
     *  use {@link AbstractTransaction.unsignedSerialized | **unsignedSerialized** }.
     */
    get serialized(): string {
        assert(this.signature != null, "cannot serialize unsigned transaction; maybe you meant .unsignedSerialized", "UNSUPPORTED_OPERATION", { operation: ".serialized" });
        return this.#serialize();
    }

    /**
     *  The transaction pre-image.
     *
     *  The hash of this is the digest which needs to be signed to
     *  authorize this transaction.
     */
    get unsignedSerialized(): string {
        return this.#serialize();
    }

    /**
     *  Return the most "likely" type; currently the highest
     *  supported transaction type.
     *
     *  @returns {number} The inferred transaction type.
     */
    inferType(): number {
        return <number>(this.inferTypes().pop());
    }

    /**
     *  Validates the explicit properties and returns a list of compatible
     *  transaction types.
     *
     *  @returns {Array<number>} The compatible transaction types.
     */
    abstract inferTypes(): Array<number>

    /**
     *  Create a copy of this transaciton.
     *
     *  @returns {AbstractTransaction} The cloned transaction.
     */
    abstract clone(): AbstractTransaction<S>

    /**
     *  Return a JSON-friendly object.
     *
     *  @returns {TransactionLike} The JSON-friendly object.
     */
    abstract toJSON(): TransactionLike

    /**
     *  Return a protobuf-friendly JSON object.
     *
     *  @returns {ProtoTransaction} The protobuf-friendly JSON object.
     */
    abstract toProtobuf(): ProtoTransaction

    abstract get originShard(): string | undefined

    abstract get destShard(): string | undefined

    get isExternal(): boolean {
        return this.destShard !== undefined && this.originShard !== this.destShard
    }

    /**
     *  Serializes the WorkObject to a string.
     *  
     *  @returns {string} The serialized WorkObject.
     */
    #serialize(): string {
        return encodeProtoTransaction(this.toProtobuf());
    }
}

