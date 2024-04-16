
import { getAddress } from "../address/index.js";
import { keccak256, Signature, SigningKey } from "../crypto/index.js";
import {
    concat, decodeRlp, encodeRlp, getBytes, getBigInt, getNumber, hexlify,
    assert, assertArgument, toBeArray, zeroPadValue, toBigInt, getShardForAddress, isUTXOAddress
} from "../utils/index.js";

import { accessListify } from "./accesslist.js";
import { computeAddress, recoverAddress } from "./address.js";

import type { BigNumberish, BytesLike } from "../utils/index.js";
import type { SignatureLike } from "../crypto/index.js";
import type { AccessList, AccessListish } from "./index.js";
import { encodeProtoTransaction } from "../utils/proto-encode.js";
import { decodeProtoTransaction } from "../utils/proto-decode.js";
import { handleNumber, formatNumber } from "../providers/format.js";
import type { UTXOEntry, UTXOTransactionOutput } from "./utxo.js";

const BN_0 = BigInt(0);
// const BN_2 = BigInt(2);
// const BN_27 = BigInt(27)
// const BN_28 = BigInt(28)
// const BN_35 = BigInt(35);
const BN_MAX_UINT = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

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
    from: A;
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


    inputsUTXO?: null | Array<UTXOEntry>;

    outputsUTXO?: null | Array<UTXOTransactionOutput>;
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


function _parseSignature(tx: TransactionLike, fields: Array<string>): Signature {
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
    #hash: null | string;
    #inputsUTXO: null | UTXOEntry[];
    #outputsUTXO: null | UTXOTransactionOutput[];
    from: string;

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
            case 2: case "utxo":
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
            case 2: return "utxo";
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


    get inputsUTXO(): null | UTXOEntry[] { return this.#inputsUTXO; }
    set inputsUTXO(value: null | UTXOEntry[]) { this.#inputsUTXO = value; }

    get outputsUTXO(): null | UTXOTransactionOutput[] { return this.#outputsUTXO; }
    set outputsUTXO(value: null | UTXOTransactionOutput[]) { this.#outputsUTXO = value; }


    /**
     *  Creates a new Transaction with default values.
     */
    constructor(from: string) {
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
        this.#hash = null;
        this.#inputsUTXO = null;
        this.#outputsUTXO = null;
        this.from = from
    }

    /**
     *  The transaction hash, if signed. Otherwise, ``null``.
     */
    get hash(): null | string {
        if (this.signature == null) { return null; }
        if (this.#hash) { return this.#hash; }
        return keccak256(this.serialized);
    }
    set hash(value: null | string) {
        this.#hash = value;
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


        if (this.maxFeePerGas != null && this.maxPriorityFeePerGas != null) {
            assert(this.maxFeePerGas >= this.maxPriorityFeePerGas, "priorityFee cannot be more than maxFee", "BAD_DATA", { value: this });
        }

        //if (this.type === 2 && hasGasPrice) {
        //    throw new Error("eip-1559 transaction cannot have gasPrice");
        //}

        assert((this.type !== 0 && this.type !== 1), "transaction type cannot have externalGasLimit, externalGasTip, externalGasPrice, externalData, or externalAccessList", "BAD_DATA", { value: this });

        const types: Array<number> = [];

        // Explicit type
        if (this.type != null) {
            types.push(this.type);

        } else {
            types.push(0);

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

        // Adjusted function to specifically handle the conversion of 'denomination' fields in array items
        const processArrayWithBigInt = (arr: UTXOEntry[] | UTXOTransactionOutput[]) => {
            return arr.map(item => ({
                address: item.address,
                denomination: s(item.denomination) // Convert 'denomination' to string
            }));
        };

        return {
            type: this.type,
            to: this.to,
            //from: this.from,
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
            inputsUTXO: processArrayWithBigInt(this.inputsUTXO || []),
            outputsUTXO: processArrayWithBigInt(this.outputsUTXO || []),
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

        if (tx.type == 2) {
            protoTx.tx_ins = tx.inputsUTXO
            protoTx.tx_outs = tx.outputsUTXO
        }

        if (this.signature) {
            protoTx.v = formatNumber(this.signature.yParity, "yParity")
            protoTx.r = toBeArray(this.signature.r)
            protoTx.s = toBeArray(this.signature.s)
            protoTx.signature = getBytes(this.signature.serialized)
        }
        return protoTx;
    }

    /**
     *  Create a **Transaction** from a serialized transaction or a
     *  Transaction-like object.
     */
    static from(tx: string | TransactionLike<string>): Transaction {
        if (typeof (tx) === "string") {
            const decodedProtoTx: ProtoTransaction = decodeProtoTransaction(getBytes(tx));
            return Transaction.fromProto(decodedProtoTx);
        }

        const result = new Transaction(tx.from);
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
        if (tx.inputsUTXO != null) { result.inputsUTXO = tx.inputsUTXO; }
        if (tx.outputsUTXO != null) { result.outputsUTXO = tx.outputsUTXO; }


        if (tx.hash != null) {
            assertArgument(result.isSigned(), "unsigned transaction cannot define hash", "tx", tx);
            result.hash = tx.hash;
        }

        if (tx.from != null) {
            //             assertArgument(result.isSigned(), "unsigned transaction cannot define from", "tx", tx);
            assertArgument(result.from.toLowerCase() === (tx.from || "").toLowerCase(), "from mismatch", "tx", tx);
            result.from = tx.from;
        }
        return result;
    }

    /**
    * Create a **Transaction** from a ProtoTransaction object.
    */
    static fromProto(protoTx: ProtoTransaction): Transaction {

        //  TODO: Fix this because new tx instance requires a 'from' address
        const tx = new Transaction();

        tx.type = protoTx.type;
        tx.chainId = toBigInt(protoTx.chain_id);
        tx.nonce = protoTx.nonce;
        tx.maxPriorityFeePerGas = toBigInt(protoTx.gas_tip_cap);
        tx.maxFeePerGas = toBigInt(protoTx.gas_fee_cap);
        tx.gasLimit = toBigInt(protoTx.gas);
        tx.to = hexlify(protoTx.to);
        tx.value = toBigInt(protoTx.value);
        tx.data = hexlify(protoTx.data);
        tx.accessList = protoTx.access_list.access_tuples.map(tuple => ({
            address: hexlify(tuple.address),
            storageKeys: tuple.storage_key.map(key => hexlify(key))
        }));

        if (protoTx.type == 2) {
            tx.inputsUTXO = protoTx.tx_ins
            tx.outputsUTXO = protoTx.tx_outs
        }

        if (protoTx.signature) {
            const signatureFields = [
                hexlify(protoTx.v!),
                hexlify(protoTx.r!),
                hexlify(protoTx.s!),
            ];
            tx.signature = _parseSignature(tx, signatureFields);
        }

        return tx;
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

