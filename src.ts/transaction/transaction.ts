
import { getAddress } from "../address/index.js";
import { keccak256, Signature, SigningKey } from "../crypto/index.js";
import {
    getBytes, getBigInt, getNumber, hexlify,
    assert, assertArgument, toBeArray, zeroPadValue, toBigInt
} from "../utils/index.js";

import { accessListify } from "./accesslist.js";
import { recoverAddress } from "./address.js";

import type { BigNumberish, BytesLike } from "../utils/index.js";
import type { SignatureLike } from "../crypto/index.js";
import type { AccessList, AccessListish } from "./index.js";
import { encodeProtoTransaction } from "../utils/proto-encode.js";
import { decodeProtoTransaction } from "../utils/proto-decode.js";
import { handleNumber, formatNumber } from "../providers/format.js";


export interface TransactionLike<A = string> {
    /**
     *  The type.
     */
    type?: null | number;

    /**
     *  The recipient address or ``null`` for an ``init`` transaction.
     */
    to?: null | A;

    /**
     *  The sender.
     */
    from?: null | A;

    /**
     *  The nonce.
     */
    nonce?: null | number;

    /**
     *  The maximum amount of gas that can be used.
     */
    gasLimit?: null | BigNumberish;

    /**
     *  The gas price for legacy and berlin transactions.
     */
    gasPrice?: null | BigNumberish;

    /**
     *  The maximum priority fee per gas for london transactions.
     */
    maxPriorityFeePerGas?: null | BigNumberish;

    /**
     *  The maximum total fee per gas for london transactions.
     */
    maxFeePerGas?: null | BigNumberish;

    /**
     *  The data.
     */
    data?: null | string;

    /**
     *  The value (in wei) to send.
     */
    value?: null | BigNumberish;

    /**
     *  The chain ID the transaction is valid on.
     */
    chainId?: null | BigNumberish;

    /**
     *  The transaction hash.
     */
    hash?: null | string;

    /**
     *  The signature provided by the sender.
     */
    signature?: null | SignatureLike;

    /**
     *  The access list for berlin and london transactions.
     */
    accessList?: null | AccessListish;

    /**
     * The external gas price.
     */
    externalGasPrice?: null | BigNumberish;

    /**
     * The external gas tip.
     */
    externalGasTip?: null | BigNumberish;

    /**
     * The external gas limit.
     */
    externalGasLimit?: null | BigNumberish;


    /**
     *  The external data.
     */
    externalData?: null | string;

    /**
     *  The access list for berlin and london transactions.
     */
    externalAccessList?: null | AccessListish;
}

export interface ProtoTransaction {
    type: number
    to: Uint8Array
    nonce: number
    value: Uint8Array
    gas: number
    data: Uint8Array
    chain_id: Uint8Array
    gas_fee_cap: Uint8Array
    gas_tip_cap: Uint8Array
    access_list: ProtoAccessList
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
    signature?: Uint8Array
}

export interface ProtoAccessList {
    access_tuples: Array<ProtoAccessTuple>
}

export interface ProtoAccessTuple {
    address: Uint8Array
    storage_key: Array<Uint8Array>
}

function _parseSignature(tx: TransactionLike, fields: Array<string>): void {
    let yParity: number;
    try {
        yParity = handleNumber(fields[0], "yParity");
        if (yParity !== 0 && yParity !== 1) { throw new Error("bad yParity"); }
    } catch (error) {
        assertArgument(false, "invalid yParity", "yParity", fields[0]);
    }

    const r = zeroPadValue(fields[1], 32);
    const s = zeroPadValue(fields[2], 32);

    const signature = Signature.from({ r, s, yParity });
    tx.signature = signature;
}

function _parse(data: Uint8Array): TransactionLike {
    const decodedTx: any = decodeProtoTransaction(getBytes(data));

    const tx: TransactionLike = {
        type: decodedTx.type,
        chainId: toBigInt(decodedTx.chain_id),
        nonce: decodedTx.nonce,
        maxPriorityFeePerGas: toBigInt(decodedTx.gas_tip_cap),
        maxFeePerGas: toBigInt(decodedTx.gas_fee_cap),
        gasLimit: toBigInt(decodedTx.gas),
        to: hexlify(decodedTx.to),
        value: toBigInt(decodedTx.value),
        data: hexlify(decodedTx.data),
        accessList: decodedTx.access_list.access_tuples,
    };

    if (decodedTx.type == 2) {
        tx.externalGasLimit = toBigInt(decodedTx.etx_gas_limit)
        tx.externalGasPrice = toBigInt(decodedTx.etx_gas_price)
        tx.externalGasTip = toBigInt(decodedTx.etx_gas_tip)
        tx.externalData = hexlify(decodedTx.etx_data)
        tx.externalAccessList = decodedTx.etx_access_list.access_tuples
    }

    tx.hash = keccak256(data);

    const signatureFields = [
        hexlify(decodedTx.v),
        hexlify(decodedTx.r),
        hexlify(decodedTx.s),
    ]

    _parseSignature(tx, signatureFields);

    return tx;
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
export class Transaction implements TransactionLike<string> {
    #type: null | number;
    #to: null | string;
    #data: string;
    #nonce: number;
    #gasLimit: bigint;
    #gasPrice: null | bigint;
    #maxPriorityFeePerGas: null | bigint;
    #maxFeePerGas: null | bigint;
    #value: bigint;
    #chainId: bigint;
    #sig: null | Signature;
    #accessList: null | AccessList;
    #externalGasLimit: bigint;
    #externalGasTip: null | bigint;
    #externalGasPrice: null | bigint;
    #externalAccessList: null | AccessList;
    #externalData: string;

    /**
     *  The transaction type.
     *
     *  If null, the type will be automatically inferred based on
     *  explicit properties.
     */
    get type(): null | number { return this.#type; }
    set type(value: null | number | string) {
        switch (value) {
            case null:
                this.#type = null;
                break;
            case 0: case "standard":
                this.#type = 0;
                break;
            // case 1: case "external":
            //     this.#type = 1;
            //     break;
            case 2: case "internalToExternal":
                this.#type = 2;
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
            case 2: return "internalToExternal";
        }

        return null;
    }

    /**
     *  The ``to`` address for the transaction or ``null`` if the
     *  transaction is an ``init`` transaction.
     */
    get to(): null | string { return this.#to; }
    set to(value: null | string) {
        this.#to = (value == null) ? null : getAddress(value);
    }

    /**
     *  The transaction nonce.
     */
    get nonce(): number { return this.#nonce; }
    set nonce(value: BigNumberish) { this.#nonce = getNumber(value, "value"); }

    /**
     *  The gas limit.
     */
    get gasLimit(): bigint { return this.#gasLimit; }
    set gasLimit(value: BigNumberish) { this.#gasLimit = getBigInt(value); }

    /**
     *  The gas price.
     *
     *  On legacy networks this defines the fee that will be paid. On
     *  EIP-1559 networks, this should be ``null``.
     */
    get gasPrice(): null | bigint {
        const value = this.#gasPrice;
        return value;
    }
    set gasPrice(value: null | BigNumberish) {
        this.#gasPrice = (value == null) ? null : getBigInt(value, "gasPrice");
    }

    /**
     *  The maximum priority fee per unit of gas to pay. On legacy
     *  networks this should be ``null``.
     */
    get maxPriorityFeePerGas(): null | bigint {
        const value = this.#maxPriorityFeePerGas;
        if (value == null) {
            return null;
        }
        return value;
    }
    set maxPriorityFeePerGas(value: null | BigNumberish) {
        this.#maxPriorityFeePerGas = (value == null) ? null : getBigInt(value, "maxPriorityFeePerGas");
    }

    /**
     *  The maximum total fee per unit of gas to pay. On legacy
     *  networks this should be ``null``.
     */
    get maxFeePerGas(): null | bigint {
        const value = this.#maxFeePerGas;
        if (value == null) {
            return null;
        }
        return value;
    }
    set maxFeePerGas(value: null | BigNumberish) {
        this.#maxFeePerGas = (value == null) ? null : getBigInt(value, "maxFeePerGas");
    }

    /**
     *  The transaction data. For ``init`` transactions this is the
     *  deployment code.
     */
    get data(): string { return this.#data; }
    set data(value: BytesLike) { this.#data = hexlify(value); }

    /**
     *  The amount of ether to send in this transactions.
     */
    get value(): bigint { return this.#value; }
    set value(value: BigNumberish) {
        this.#value = getBigInt(value, "value");
    }

    /**
     *  The chain ID this transaction is valid on.
     */
    get chainId(): bigint { return this.#chainId; }
    set chainId(value: BigNumberish) { this.#chainId = getBigInt(value); }

    /**
     *  If signed, the signature for this transaction.
     */
    get signature(): null | Signature { return this.#sig || null; }
    set signature(value: null | SignatureLike) {
        this.#sig = (value == null) ? null : Signature.from(value);
    }

    /**
     *  The access list.
     *
     *  An access list permits discounted (but pre-paid) access to
     *  bytecode and state variable access within contract execution.
     */
    get accessList(): null | AccessList {
        const value = this.#accessList || null;
        if (value == null) {
            return null;
        }
        return value;
    }
    set accessList(value: null | AccessListish) {
        this.#accessList = (value == null) ? null : accessListify(value);
    }

    /**
     *  The gas limit.
     */
    get externalGasLimit(): bigint { return this.#externalGasLimit; }
    set externalGasLimit(value: BigNumberish) { this.#externalGasLimit = getBigInt(value); }

    /**
     *  The maximum priority fee per unit of gas to pay. On legacy
     *  networks this should be ``null``.
     */
    get externalGasTip(): null | bigint {
        const value = this.#externalGasTip;
        if (value == null) {
            return null;
        }
        return value;
    }
    set externalGasTip(value: null | BigNumberish) {
        this.#externalGasTip = (value == null) ? null : getBigInt(value, "externalGasTip");
    }

    /**
     *  The maximum total fee per unit of gas to pay. On legacy
     *  networks this should be ``null``.
     */
    get externalGasPrice(): null | bigint {
        const value = this.#externalGasPrice;
        if (value == null) {
            return null;
        }
        return value;
    }
    set externalGasPrice(value: null | BigNumberish) {
        this.#externalGasPrice = (value == null) ? null : getBigInt(value, "externalGasPrice");
    }

    /**
     *  The transaction externalData. For ``init`` transactions this is the
     *  deployment code.
     */
    get externalData(): string { return this.#externalData; }
    set externalData(value: BytesLike) { this.#externalData = hexlify(value); }

    /**
     *  The external access list.
     *
     *  An access list permits discounted (but pre-paid) access to
     *  bytecode and state variable access within contract execution.
     */
    get externalAccessList(): null | AccessList {
        const value = this.#externalAccessList || null;
        if (value == null) {
            return null;
        }
        return value;
    }
    set externalAccessList(value: null | AccessListish) {
        this.#externalAccessList = (value == null) ? null : accessListify(value);
    }

    /**
     *  Creates a new Transaction with default values.
     */
    constructor() {
        this.#type = null;
        this.#to = null;
        this.#nonce = 0;
        this.#gasLimit = BigInt(0);
        this.#gasPrice = null;
        this.#maxPriorityFeePerGas = null;
        this.#maxFeePerGas = null;
        this.#data = "0x";
        this.#value = BigInt(0);
        this.#chainId = BigInt(0);
        this.#sig = null;
        this.#accessList = null;
        this.#externalGasLimit = BigInt(0);
        this.#externalGasTip = null;
        this.#externalGasPrice = null;
        this.#externalData = "0x";
        this.#externalAccessList = null;
    }

    /**
     *  The transaction hash, if signed. Otherwise, ``null``.
     */
    get hash(): null | string {
        if (this.signature == null) { return null; }
        return keccak256(this.serialized);
    }

    /**
     *  The pre-image hash of this transaction.
     *
     *  This is the digest that a [[Signer]] must sign to authorize
     *  this transaction.
     */
    get unsignedHash(): string {
        return keccak256(this.unsignedSerialized);
    }

    /**
     *  The sending address, if signed. Otherwise, ``null``.
     */
    get from(): null | string {
        if (this.signature == null) { return null; }
        return recoverAddress(this.unsignedHash, this.signature);
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
    isSigned(): this is (Transaction & { type: number, typeName: string, from: string, signature: Signature }) {
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
    inferTypes(): Array<number> {

        // Checks that there are no conflicting properties set
        // const hasGasPrice = this.gasPrice != null;
        // const hasFee = (this.maxFeePerGas != null || this.maxPriorityFeePerGas != null);
        const hasExternal = (this.externalGasLimit != null || this.externalGasTip != null || this.externalGasPrice != null || this.externalData != null || this.externalAccessList != null);
        // const hasAccessList = (this.accessList != null);

        //if (hasGasPrice && hasFee) {
        //    throw new Error("transaction cannot have gasPrice and maxFeePerGas");
        //}

        if (this.maxFeePerGas != null && this.maxPriorityFeePerGas != null) {
            assert(this.maxFeePerGas >= this.maxPriorityFeePerGas, "priorityFee cannot be more than maxFee", "BAD_DATA", { value: this });
        }

        //if (this.type === 2 && hasGasPrice) {
        //    throw new Error("eip-1559 transaction cannot have gasPrice");
        //}

        assert(hasExternal || (this.type !== 0 && this.type !== 1), "transaction type cannot have externalGasLimit, externalGasTip, externalGasPrice, externalData, or externalAccessList", "BAD_DATA", { value: this });

        const types: Array<number> = [];

        // Explicit type
        if (this.type != null) {
            types.push(this.type);

        } else {
            if (hasExternal) {
                types.push(2);
            } else {
                types.push(0);
            }
        }

        types.sort();

        return types;
    }

    /**
     *  Create a copy of this transaciton.
     */
    clone(): Transaction {
        return Transaction.from(this);
    }

    /**
     *  Return a JSON-friendly object.
     */
    toJSON(): TransactionLike {
        const s = (v: null | bigint) => {
            if (v == null) { return null; }
            return v.toString();
        };

        return {
            type: this.type,
            to: this.to,
            // from: this.from,
            data: this.data,
            nonce: this.nonce,
            gasLimit: s(this.gasLimit),
            gasPrice: s(this.gasPrice),
            maxPriorityFeePerGas: s(this.maxPriorityFeePerGas),
            maxFeePerGas: s(this.maxFeePerGas),
            value: s(this.value),
            chainId: s(this.chainId),
            signature: this.signature ? this.signature.toJSON() : null,
            hash: this.hash,
            accessList: this.accessList,
            externalGasLimit: s(this.externalGasLimit),
            externalGasTip: s(this.externalGasTip),
            externalGasPrice: s(this.externalGasPrice),
            externalData: this.externalData,
            externalAccessList: this.externalAccessList,
        };
    }

    /**
     *  Return a protobuf-friendly JSON object.
     */
    toProtobuf(): ProtoTransaction {
        const protoTx: ProtoTransaction = {
            type: (this.type || 0),
            chain_id: formatNumber(this.chainId || 0, "chainId"),
            nonce: (this.nonce || 0),
            gas_tip_cap: formatNumber(this.maxPriorityFeePerGas || 0, "maxPriorityFeePerGas"),
            gas_fee_cap: formatNumber(this.maxFeePerGas || 0, "maxFeePerGas"),
            gas: Number(this.gasLimit || 0),
            to: this.to != null ? getBytes(this.to as string) : new Uint8Array(0),
            value: formatNumber(this.value || 0, "value"),
            data: getBytes(this.data || "0x"),
            access_list: { access_tuples: [] },
        }

        if (this.type == 2) {
            protoTx.etx_gas_limit = Number(this.externalGasLimit || 0)
            protoTx.etx_gas_price = formatNumber(this.externalGasPrice || 0, "externalGasPrice")
            protoTx.etx_gas_tip = formatNumber(this.externalGasTip || 0, "externalGasTip")
            protoTx.etx_data = getBytes(this.externalData || "0x")
            protoTx.etx_access_list = { access_tuples: [] }
        }

        if (this.signature) {
            protoTx.v = formatNumber(this.signature.yParity, "yParity"),
                protoTx.r = toBeArray(this.signature.r),
                protoTx.s = toBeArray(this.signature.s)
            protoTx.signature = getBytes(this.signature.serialized)
        }
        console.log("formatted tx ", protoTx);
        return protoTx;
    }

    /**
     *  Create a **Transaction** from a serialized transaction or a
     *  Transaction-like object.
     */
    static from(tx?: string | TransactionLike<string>): Transaction {
        if (tx == null) { return new Transaction(); }

        if (typeof (tx) === "string") {
            const payload = getBytes(tx);
            return Transaction.from(_parse(payload));
        }
        const result = new Transaction();
        if (tx.type != null) { result.type = tx.type; }
        if (tx.to != null) { result.to = tx.to; }
        if (tx.nonce != null) { result.nonce = tx.nonce; }
        if (tx.gasLimit != null) { result.gasLimit = tx.gasLimit; }
        if (tx.maxPriorityFeePerGas != null) { result.maxPriorityFeePerGas = tx.maxPriorityFeePerGas; }
        if (tx.maxFeePerGas != null) { result.maxFeePerGas = tx.maxFeePerGas; }
        if (tx.data != null) { result.data = tx.data; }
        if (tx.value != null) { result.value = tx.value; }
        if (tx.chainId != null) { result.chainId = tx.chainId; }
        if (tx.signature != null) { result.signature = Signature.from(tx.signature); }
        if (tx.accessList != null) { result.accessList = tx.accessList; }
        if (tx.externalGasLimit != null) { result.externalGasLimit = tx.externalGasLimit; }
        if (tx.externalGasPrice != null) { result.externalGasPrice = tx.externalGasPrice; }
        if (tx.externalGasTip != null) { result.externalGasTip = tx.externalGasTip; }
        if (tx.externalData != null) { result.externalData = tx.externalData; }
        if (tx.externalAccessList != null) { result.externalAccessList = tx.externalAccessList; }


        if (tx.hash != null) {
            assertArgument(result.isSigned(), "unsigned transaction cannot define hash", "tx", tx);
            assertArgument(result.hash === tx.hash, "hash mismatch", "tx", tx);
        }

        if (tx.from != null) {
            assertArgument(result.isSigned(), "unsigned transaction cannot define from", "tx", tx);
            assertArgument(result.from.toLowerCase() === (tx.from || "").toLowerCase(), "from mismatch", "tx", tx);
        }

        return result;
    }

    /**
     *  Serializes the WorkObject to a string.
     *  
     *  @returns The serialized string representation of the WorkObject.
     */
    #serialize(): string {
        return encodeProtoTransaction(this.toProtobuf());
    }
}

