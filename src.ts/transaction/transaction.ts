
import {getAddress} from "../address/index.js";
import { keccak256, Signature, SigningKey } from "../crypto/index.js";
import {
    getBytes, getBigInt, getNumber, hexlify,
    assert, assertArgument, toBeArray, zeroPadValue, encodeProto, decodeProto, toBigInt, getShardForAddress, isUTXOAddress
} from "../utils/index.js";

import { accessListify } from "./accesslist.js";
import { computeAddress } from "./address.js";

import type { BigNumberish, BytesLike } from "../utils/index.js";
import type { SignatureLike } from "../crypto/index.js";
import type { AccessList, AccessListish } from "./index.js";
import type { UTXOTransactionInput, UTXOTransactionOutput } from "./utxo.js";

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


    inputsUTXO?: null | Array<UTXOTransactionInput>;

    outputsUTXO?: null | Array<UTXOTransactionOutput>;
}

function handleNumber(_value: string, param: string): number {
    if (_value === "0x") { return 0; }
    return getNumber(_value, param);
}

function formatNumber(_value: BigNumberish, name: string): Uint8Array {
    const value = getBigInt(_value, "value");
    const result = toBeArray(value);
    assertArgument(result.length <= 32, `value too large`, `tx.${ name }`, value);
    return result;
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
    const decodedTx: any = decodeProto(getBytes(data));
    const tx: TransactionLike = {
        type:                  decodedTx.type,
        from:                  decodedTx.from,
        chainId:               toBigInt(decodedTx.chain_id),
        nonce:                 decodedTx.nonce,
        maxPriorityFeePerGas:  toBigInt(decodedTx.gas_tip_cap),
        maxFeePerGas:          toBigInt(decodedTx.gas_fee_cap),
        gasLimit:              toBigInt(decodedTx.gas),
        to:                    hexlify(decodedTx.to),
        value:                 toBigInt(decodedTx.value),
        data:                  hexlify(decodedTx.data),
        accessList:            decodedTx.access_list.access_tuples ,
    };

    const signatureFields = [
        hexlify(decodedTx.v),
        hexlify(decodedTx.r),
        hexlify(decodedTx.s),
    ]

    _parseSignature(tx, signatureFields);

    tx.hash = getTransactionHash(tx, data);

    return tx;
}

function getTransactionHash (tx: TransactionLike, data: Uint8Array): string {
    const destShardbyte = getShardForAddress(tx.to || "")?.byte.slice(2);
    const destUtxo = isUTXOAddress(tx.to || "");

    const pubKey = Transaction.from(tx).fromPublicKey
    const senderAddr = computeAddress(pubKey || "")

    const originShardByte = getShardForAddress(senderAddr)?.byte.slice(2);
    const originUtxo = isUTXOAddress(senderAddr);

    if (!destShardbyte || !originShardByte) {
        throw new Error("Invalid Shard for from or to address");
    }
    if(destShardbyte !== originShardByte && destUtxo !== originUtxo) {
        throw new Error("Cross-shard & cross-ledger transactions are not supported");
    }

    let hash = keccak256(data)
    hash = '0x' + originShardByte + (originUtxo ? 'F' : '1') + hash.charAt(5) + originShardByte + (destUtxo ? 'F' : '1') + hash.slice(9)

    //TODO alter comparison
    return hash;
}


function _serialize(tx: TransactionLike, sig?: Signature): string {
    const formattedTx: any = {
        chain_id: formatNumber(tx.chainId || 0, "chainId"),
        nonce: (tx.nonce || 0),
        gas_tip_cap: formatNumber(tx.maxPriorityFeePerGas || 0, "maxPriorityFeePerGas"),
        gas_fee_cap: formatNumber(tx.maxFeePerGas || 0, "maxFeePerGas"),
        gas: Number(tx.gasLimit || 0),
        to: tx.to != null ? getBytes(tx.to) : "0x",
        value: formatNumber(tx.value || 0, "value"),
        data: getBytes(tx.data || "0x"),
        access_list: {access_tuples: tx.accessList || []},
        type: (tx.type || 0),
    }

    if (tx.type == 2){
        formattedTx.tx_ins = tx.inputsUTXO
        formattedTx.tx_outs = tx.outputsUTXO
    }

    if (sig) {
        formattedTx.v =  formatNumber(sig.yParity, "yParity"),
        formattedTx.r = toBeArray(sig.r),
        formattedTx.s = toBeArray(sig.s)
    }

    return encodeProto(formattedTx);
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
    #inputsUTXO: null | UTXOTransactionInput[];
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
        this.#to = (value == null) ? null: getAddress(value);
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
        this.#gasPrice = (value == null) ? null: getBigInt(value, "gasPrice");
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
        this.#maxPriorityFeePerGas = (value == null) ? null: getBigInt(value, "maxPriorityFeePerGas");
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
        this.#maxFeePerGas = (value == null) ? null: getBigInt(value, "maxFeePerGas");
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
        this.#sig = (value == null) ? null: Signature.from(value);
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
        this.#accessList = (value == null) ? null: accessListify(value);
    }


    get inputsUTXO(): null | UTXOTransactionInput[] { return this.#inputsUTXO; }
    set inputsUTXO(value: null | UTXOTransactionInput[]) { this.#inputsUTXO = value; }

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
        assert(this.signature != null, "cannot serialize unsigned transaction; maybe you meant .unsignedSerialized", "UNSUPPORTED_OPERATION", { operation: ".serialized"});

        return _serialize(this, this.signature);
    }

    /**
     *  The transaction pre-image.
     *
     *  The hash of this is the digest which needs to be signed to
     *  authorize this transaction.
     */
    get unsignedSerialized(): string {
        return _serialize(this);
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

        const types: Array<number> = [ ];

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
    toJSON(): any {
        const s = (v: null | bigint) => {
            if (v == null) { return null; }
            return v.toString();
        };

        return {
            type: this.type,
            to: this.to,
//            from: this.from,
            data: this.data,
            nonce: this.nonce,
            gasLimit: s(this.gasLimit),
            gasPrice: s(this.gasPrice),
            maxPriorityFeePerGas: s(this.maxPriorityFeePerGas),
            maxFeePerGas: s(this.maxFeePerGas),
            value: s(this.value),
            chainId: s(this.chainId),
            sig: this.signature ? this.signature.toJSON(): null,
            accessList: this.accessList,
        };
    }

    /**
     *  Create a **Transaction** from a serialized transaction or a
     *  Transaction-like object.
     */
    static from(tx: string | TransactionLike<string>): Transaction {
//        if (tx == null) { return new Transaction(); }

        if (typeof(tx) === "string") {
            const payload = getBytes(tx);
            return Transaction.from(_parse(payload));
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


        if (tx.hash != null) {
            assertArgument(result.isSigned(), "unsigned transaction cannot define hash", "tx", tx);
            result.hash = tx.hash;
        }

        if (tx.from != null) {
//             assertArgument(result.isSigned(), "unsigned transaction cannot define from", "tx", tx);
            assertArgument(result.from.toLowerCase() === (tx.from || "").toLowerCase(), "from mismatch", "tx", tx);
        }
        return result;
    }
}