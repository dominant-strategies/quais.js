
import { Signature, SigningKey } from "../crypto/index.js";
import {
    getBigInt,
    assert, assertArgument, zeroPadValue
} from "../utils/index.js";

import type { BigNumberish } from "../utils/index.js";
import type { SignatureLike } from "../crypto/index.js";
import { encodeProtoTransaction } from "../utils/proto-encode.js";
import { handleNumber } from "../providers/format.js";
import type {TxInput, TxOutput} from "./utxo.js";

export interface TransactionLike<A = string> {
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

export interface ProtoTransaction {
    type: number
    to?: Uint8Array
    nonce?: number
    value?: Uint8Array
    gas?: number
    data?: Uint8Array
    chain_id: Uint8Array
    gas_fee_cap?: Uint8Array
    gas_tip_cap?: Uint8Array
    access_list?: ProtoAccessList
    etx_gas_limit?: number
    etx_gas_price?: Uint8Array
    etx_gas_tip?: Uint8Array
    etx_data?: Uint8Array
    etx_access_list?: ProtoAccessList
    v?: Uint8Array
    r?: Uint8Array
    s?: Uint8Array
    originating_tx_hash?: string
    etx_index?: number
    etx_sender?: Uint8Array
    tx_ins?: Array<TxInput>
    tx_outs?: Array<TxOutput>
    signature?: Uint8Array
}

export interface ProtoAccessList {
    access_tuples: Array<ProtoAccessTuple>
}

export interface ProtoAccessTuple {
    address: Uint8Array
    storage_key: Array<Uint8Array>
}


export function _parseSignature(fields: Array<string>): Signature {
    let yParity: number;
    try {
        yParity = handleNumber(fields[0], "yParity");
        if (yParity !== 0 && yParity !== 1) { throw new Error("bad yParity"); }
    } catch (error) {
        assertArgument(false, "invalid yParity", "yParity", fields[0]);
    }

    const r = zeroPadValue(fields[1], 32);
    const s = zeroPadValue(fields[2], 32);

    return Signature.from({ r, s, yParity });
}

/**
 *  A **Transaction** describes an operation to be executed on
 *  Ethereum by an Externally Owned Account (EOA). It includes
 *  who (the [[to]] address), what (the [[data]]) and how much (the
 *  [[value]] in ether) the operation should entail.
 *
 *  @example:
 *    tx = new Transaction()
 *    //_result:
 *
 *    tx.data = "0x1234";
 *    //_result:
 */
type allowedSignatureTypes = Signature | string | null
export abstract class AbstractTransaction<S extends allowedSignatureTypes> implements TransactionLike<string> {
    protected _type: number | null;
    protected _hash: null | string;
    protected _signature: S;
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

        } else {
            this._signature = ((value == null) ? null : Signature.from(value)) as S;
        }
    }
    /**
     *  Creates a new Transaction with default values.
     */
    constructor() {
        this._type = null;
        this._hash = null;
        this._chainId = BigInt(0);
        this._signature = null as S;
    }

    /**
     *  The transaction hash, if signed. Otherwise, ``null``.
     */
    get hash(): null | string {
        throw new Error("Method not implemented.");
    }

    set hash(value: null | string) {
        this._hash = value;
    }

    /**
     *  The pre-image hash of this transaction.
     *
     *  This is the digest that a [[Signer]] must sign to authorize
     *  this transaction.
     */
    get unsignedHash(): string {
        throw new Error("Method not implemented.");
    }

    /**
     *  The public key of the sender, if signed. Otherwise, ``null``.
     */
    get fromPublicKey(): null | string {
        if (this.signature == null) { return null; }
        return SigningKey.recoverPublicKey(this.unsignedHash, this.signature);
    }

    /**
     *  Returns true if signed.
     *
     *  This provides a Type Guard that properties requiring a signed
     *  transaction are non-null.
     */
    isSigned(): this is (AbstractTransaction<S> & { type: number, typeName: string, from: string, signature: Signature }) {
        //isSigned(): this is SignedTransaction {
        return this.signature != null;
    }

    /**
     *  The serialized transaction.
     *
     *  This throws if the transaction is unsigned. For the pre-image,
     *  use [[unsignedSerialized]].
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
     */
    inferType(): number {
        return <number>(this.inferTypes().pop());
    }

    /**
     *  Validates the explicit properties and returns a list of compatible
     *  transaction types.
     */
    abstract inferTypes(): Array<number>

    /**
     *  Create a copy of this transaciton.
     */
    abstract clone(): AbstractTransaction<S>

    /**
     *  Return a JSON-friendly object.
     */
    abstract toJSON(): TransactionLike

    /**
     *  Return a protobuf-friendly JSON object.
     */
    abstract toProtobuf(): ProtoTransaction

    /**
     *  Serializes the WorkObject to a string.
     *  
     *  @returns The serialized string representation of the WorkObject.
     */
    #serialize(): string {
        return encodeProtoTransaction(this.toProtobuf());
    }
}

