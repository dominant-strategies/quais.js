import {keccak256} from "../crypto";
import {AbstractTransaction, computeAddress, TransactionLike, TxInput, TxOutput} from "./index";
import {
    assertArgument,
    decodeProtoTransaction,
    getBytes, getShardForAddress,
    hexlify, isUTXOAddress,
    toBigInt
} from "../utils";
import {formatNumber} from "../providers/format";
import { ProtoTransaction} from "./abstract-transaction";

/**
 * @TODO write documentation for this interface.
 *
 * @category Transaction
 */
export interface QiTransactionLike extends TransactionLike {
    /**
     * @TODO write documentation for this property.
     */
    txInputs?: null | TxInput[];

    /**
     * @TODO write documentation for this property.
     */
    txOutputs?: null | TxOutput[];
}

/**
 *  @TODO write documentation for this class.
 *  @TODO write documentation for the properties of this class.
 *
 *  @category Transaction
 */
export class QiTransaction extends AbstractTransaction<string> implements QiTransactionLike {
    #txInputs?: null | TxInput[];
    #txOutputs?: null | TxOutput[];
    #hash: null | string;

    get txInputs(): TxInput[] {
        return (this.#txInputs ?? []).map(entry => ({...entry}));
    }
    set txInputs(value: TxInput[] | null) {
        if (!Array.isArray(value)) {
            throw new Error("txInputs must be an array");
        }
        this.#txInputs = value.map(entry => ({...entry}));
    }
    get txOutputs(): TxOutput[] {
        return (this.#txOutputs ?? []).map(output => ({...output}));
    }
    set txOutputs(value: TxOutput[] | null) {
        if (!Array.isArray(value)) {
            throw new Error("txOutputs must be an array");
        }
        this.#txOutputs = value.map(output => ({...output}));
    }

    get hash(): null | string {
        if (this.signature == null) { return null; }
        if (this.#hash) { return this.#hash; }
        return keccak256(this.serialized);
    }
    set hash(value: null | string) {
        this.#hash = value;
    }

    get unsignedHash(): string {
        return keccak256(this.unsignedSerialized);
    }

    get originShard(): string | undefined {
        const pubKey = hexlify(this.txInputs[0].pub_key);
        const senderAddr = computeAddress(pubKey || "")

        return getShardForAddress(senderAddr)?.byte.slice(2);
    }

    get destShard(): string | undefined { 
        return getShardForAddress(hexlify(this.txOutputs[0].address) || "")?.byte.slice(2);
    }

    getTransactionHash (data: Uint8Array): string {
        if (this.txInputs.length < 1 || this.txOutputs.length < 1) {
            throw new Error("Transaction must have at least one input and one output");
        }
        const destUtxo = isUTXOAddress(hexlify(this.txOutputs[0].address) || "");

        const pubKey = hexlify(this.txInputs[0].pub_key);
        const senderAddr = computeAddress(pubKey || "")

        const originUtxo = isUTXOAddress(senderAddr);

        if (!this.destShard|| !this.originShard) {
            throw new Error(`Invalid shards: origin ${this.originShard} ->  destination ${this.destShard} (address: ${senderAddr})`);
        }
        if(this.isExternal && destUtxo !== originUtxo) {
            throw new Error("Cross-shard & cross-ledger transactions are not supported");
        }

        let hash = keccak256(data)
        hash = '0x' + this.originShard+ (originUtxo ? 'F' : '1') + hash.charAt(5) + this.originShard+ (destUtxo ? 'F' : '1') + hash.slice(9)

        //TODO alter comparison
        return hash;

    }


    /**
     *  Creates a new Transaction with default values.
     */
    constructor() {
        super();
        this.#txInputs = [];
        this.#txOutputs = [];
        this.#hash = null;
    }


    /**
     *  Validates the explicit properties and returns a list of compatible
     *  transaction types.
     * 
     *  @returns {Array<number>} The compatible transaction types.
     */
    inferTypes(): Array<number> {

        const types: Array<number> = [];

        // Explicit type
        if (this.type != null) {
            types.push(this.type);

        } else {
            types.push(2);

        }

        types.sort();

        return types;
    }

    /**
     *  Create a copy of this transaciton.
     * 
     *  @returns {QiTransaction} The cloned transaction.
     */
    clone(): QiTransaction {
        return QiTransaction.from(this);
    }

    /**
     *  Return a JSON-friendly object.
     * 
     *  @returns {QiTransactionLike} The JSON-friendly object.
     */
    toJSON(): TransactionLike {
        const s = (v: null | bigint) => {
            if (v == null) { return null; }
            return v.toString();
        };

        return {
            type: this.type,
            chainId: s(this.chainId),
            signature: this.signature ? this.signature : null,
            hash: this.hash,
            txInputs: this.txInputs,
            txOutputs: this.txOutputs,
        } as QiTransactionLike;
    }

    /**
     *  Return a protobuf-friendly JSON object.
     * 
     *  @returns {ProtoTransaction} The protobuf-friendly JSON object.
     */
    toProtobuf(): ProtoTransaction {
        // console.log(`--> (toProtobuf) txInputs: ${JSON.stringify(this.txInputs)}`);
        const protoTx: ProtoTransaction = {
            type: (this.type || 2),
            chain_id: formatNumber(this.chainId || 0, "chainId"),
            tx_ins: { tx_ins : this.txInputs },
            tx_outs: { tx_outs: this.txOutputs },
        }

        if (this.signature) {
            protoTx.signature = getBytes(this.signature)
        }

        return protoTx;
    }

    /**
     *  Create a **Transaction** from a serialized transaction or a
     *  Transaction-like object.
     * 
     *  @param {string | QiTransactionLike} tx - The transaction to decode.
     *  @returns {QiTransaction} The decoded transaction.
     */
    static from(tx: string | QiTransactionLike): QiTransaction {
        if (typeof (tx) === "string") {
            const decodedProtoTx: ProtoTransaction = decodeProtoTransaction(getBytes(tx));
            const payload = getBytes(tx);
            return QiTransaction.fromProto(decodedProtoTx, payload);
        }

        const result = new QiTransaction();
        if (tx.type != null) { result.type = tx.type; }
        if (tx.chainId != null) { result.chainId = tx.chainId; }
        if (tx.signature != null) { result.signature = tx.signature as string; }
        if (tx.txInputs != null) { result.txInputs = tx.txInputs as TxInput[]; }
        if (tx.txOutputs != null) { result.txOutputs = tx.txOutputs as TxOutput[]; }

        if (tx.hash != null) {
            assertArgument(result.isSigned(), "unsigned transaction cannot define hash", "tx", tx);
            result.hash = tx.hash;
        }

        return result;
    }

    /**
     * Create a **Transaction** from a ProtoTransaction object.
     * 
     *  @param {ProtoTransaction} protoTx - The transaction to decode.
     *  @param {Uint8Array} [payload] - The serialized transaction.
     *  @returns {QiTransaction} The decoded transaction.
     */
    static fromProto(protoTx: ProtoTransaction, payload?: Uint8Array): QiTransaction {

        //  TODO: Fix this because new tx instance requires a 'from' address
        // if (this.signature == null) { return null; }
        const tx = new QiTransaction();

        tx.type = protoTx.type;
        tx.chainId = toBigInt(protoTx.chain_id);

        
        if (protoTx.type == 2) {
            tx.txInputs = protoTx.tx_ins?.tx_ins ?? []
            tx.txOutputs = protoTx.tx_outs?.tx_outs ?? []
        }
        
        if (protoTx.signature) {
            tx.signature = hexlify(protoTx.signature);
        }
        
        if (payload) {
            tx.hash = tx.getTransactionHash(payload);
        }
        
        return tx;
    }
}
