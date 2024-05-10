import {keccak256, Signature,} from "../crypto";
import {AccessList, accessListify, AccessListish, AbstractTransaction, TransactionLike, recoverAddress} from "./index";
import {
    assert,
    assertArgument,
    BigNumberish,
    BytesLike, decodeProtoTransaction,
    encodeProtoTransaction,
    getBigInt,
    getBytes,
    getNumber,
    getShardForAddress,
    hexlify, isUTXOAddress,
    toBeArray, toBigInt, zeroPadValue
} from "../utils";
import {getAddress} from "../address";
import {formatNumber, handleNumber} from "../providers/format";
import { ProtoTransaction} from "./abstract-transaction";

export interface QuaiTransactionLike extends TransactionLike{

    /**
     *  The recipient address or ``null`` for an ``init`` transaction.
     */
    to?: null | string;

    /**
     *  The sender.
     */
    from: string;
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
     *  The access list for berlin and london transactions.
     */
    accessList?: null | AccessListish;

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

export class QuaiTransaction extends AbstractTransaction<Signature> implements QuaiTransactionLike {
    #to: null | string;
    #data: string;
    #nonce: number;
    #gasLimit: bigint;
    #gasPrice: null | bigint;
    #maxPriorityFeePerGas: null | bigint;
    #maxFeePerGas: null | bigint;
    #value: bigint;
    #accessList: null | AccessList;
    #hash: null | string;
    from: string;

    /**
     *  The ``to`` address for the transaction or ``null`` if the
     *  transaction is an ``init`` transaction.
     */
    get to(): null | string { return this.#to; }
    set to(value: null | string) {
        this.#to = (value == null) ? null : getAddress(value);
    }

    get hash(): null | string {
        if (this.signature == null) { return null; }
        if (this.#hash) { return this.#hash; }
        return this.unsignedHash
    }
    set hash(value: null | string) {
        this.#hash = value;
    }

    get unsignedHash(): string {
        const destUtxo = isUTXOAddress(this.to || "");

        const originUtxo = isUTXOAddress(this.from);

        if (!this.destShard|| !this.originShard) {
            throw new Error("Invalid Shard for from or to address");
        }
        if(this.isExternal && destUtxo !== originUtxo) {
            throw new Error("Cross-shard & cross-ledger transactions are not supported");
        }

        let hash = keccak256(this.serialized)
        hash = '0x' + this.originShard+ (originUtxo ? 'F' : '1') + hash.charAt(5) + this.originShard+ (destUtxo ? 'F' : '1') + hash.slice(9)

        //TODO alter comparison
        return hash;
    }

    get originShard(): string | undefined {
        const senderAddr = this.from

        return getShardForAddress(senderAddr)?.byte.slice(2);
    }

    get destShard(): string | undefined {
        return getShardForAddress(this.to || "")?.byte.slice(2);
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
     *  Creates a new Transaction with default values.
     */
    constructor(from: string) {
        super();
        this.#to = null;
        this.#nonce = 0;
        this.#gasLimit = BigInt(0);
        this.#gasPrice = null;
        this.#maxPriorityFeePerGas = null;
        this.#maxFeePerGas = null;
        this.#data = "0x";
        this.#value = BigInt(0);
        this.#accessList = null;
        this.#hash = null;
        this.from = from
    }

    /**
     *  Validates the explicit properties and returns a list of compatible
     *  transaction types.
     */
    inferTypes(): Array<number> {


        if (this.maxFeePerGas != null && this.maxPriorityFeePerGas != null) {
            assert(this.maxFeePerGas >= this.maxPriorityFeePerGas, "priorityFee cannot be more than maxFee", "BAD_DATA", { value: this });
        }

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
    clone(): QuaiTransaction {
        return QuaiTransaction.from(this);
    }

    /**
     *  Return a JSON-friendly object.
     */
    toJSON(): QuaiTransactionLike {
        const s = (v: null | bigint) => {
            if (v == null) { return null; }
            return v.toString();
        };


        return {
            type: this.type,
            to: this.to,
            from: this.from,
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
        } as QuaiTransactionLike;
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

        if (this.signature) {
            protoTx.v = formatNumber(this.signature.yParity, "yParity")
            protoTx.r = toBeArray(this.signature.r)
            protoTx.s = toBeArray(this.signature.s)
        }
        return protoTx;
    }

    /**
     *  Create a **Transaction** from a serialized transaction or a
     *  Transaction-like object.
     */
    static from(tx: string | QuaiTransactionLike): QuaiTransaction {
        if (typeof (tx) === "string") {
            const decodedProtoTx: ProtoTransaction = decodeProtoTransaction(getBytes(tx));
            return QuaiTransaction.fromProto(decodedProtoTx);
        }

        const result = new QuaiTransaction(tx.from);
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
            assertArgument(result.from.toLowerCase() === (tx.from || "").toLowerCase(), "from mismatch", "tx", tx);
            result.from = tx.from;
        }
        return result;
    }

    /**
     * Create a **Transaction** from a ProtoTransaction object.
     */
    static fromProto(protoTx: ProtoTransaction): QuaiTransaction {

        //  TODO: Fix this because new tx instance requires a 'from' address
        let signature: null | Signature = null
        let address
        if (protoTx.v && protoTx.r && protoTx.s) {
            const signatureFields = [
                hexlify(protoTx.v!),
                hexlify(protoTx.r!),
                hexlify(protoTx.s!),
            ];
            signature = _parseSignature(signatureFields);

            const protoTxCopy = structuredClone(protoTx)

            delete protoTxCopy.v
            delete protoTxCopy.r
            delete protoTxCopy.s
            delete protoTxCopy.signature
            delete protoTxCopy.etx_sender
            delete protoTxCopy.etx_index

            address =  recoverAddress(keccak256(encodeProtoTransaction(protoTxCopy)), signature);
        } else {
            address = ""
        }

        const tx = new QuaiTransaction(address);

        if (signature) {
            tx.signature = signature;
        }
        tx.type = protoTx.type;
        tx.chainId = toBigInt(protoTx.chain_id);
        tx.nonce = Number(protoTx.nonce);
        tx.maxPriorityFeePerGas = toBigInt(protoTx.gas_tip_cap!);
        tx.maxFeePerGas = toBigInt(protoTx.gas_fee_cap!);
        tx.gasLimit = toBigInt(protoTx.gas!);
        tx.to = hexlify(protoTx.to!);
        tx.value = toBigInt(protoTx.value!);
        tx.data = hexlify(protoTx.data!);
        tx.accessList = protoTx.access_list!.access_tuples.map(tuple => ({
            address: hexlify(tuple.address),
            storageKeys: tuple.storage_key.map(key => hexlify(key))
        }));
        return tx;
    }
}
