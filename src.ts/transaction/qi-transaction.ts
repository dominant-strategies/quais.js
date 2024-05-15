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

export interface QiTransactionLike extends TransactionLike{

    txInputs?: null | TxInput[];
    txOutputs?: null | TxOutput[];

}

export class QiTransaction extends AbstractTransaction<string> implements QiTransactionLike {

    #txInputs?: null | TxInput[];
    #txOutputs?: null | TxOutput[];

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
        return this.unsignedHash
    }
    get unsignedHash(): string {
        if (this.txInputs.length < 1 || this.txOutputs.length < 1) {
            throw new Error("Transaction must have at least one input and one output");
        }

        const destUtxo = isUTXOAddress(hexlify(this.txOutputs[0].address) || "");
        const pubKey = hexlify(this.txInputs[0].pub_key);
        const senderAddr = computeAddress(pubKey || "");
        const originUtxo = isUTXOAddress(senderAddr);

        if (!this.destShard || !this.originShard) {
            throw new Error(`Invalid shards: origin ${this.originShard} ->  destination ${this.destShard} (address: ${senderAddr})`);
        }
        if (this.isExternal && destUtxo !== originUtxo) {
            throw new Error("Cross-shard & cross-ledger transactions are not supported");
        }

        const hexString = this.serialized.startsWith('0x') ? this.serialized.substring(2) : this.serialized;
        const dataBuffer = Buffer.from(hexString, 'hex');

        const hashHex = keccak256(dataBuffer);
        const hashBuffer = Buffer.from(hashHex.substring(2), 'hex');

        let origin = this.originShard ? parseInt(this.originShard, 16) : 0;
        hashBuffer[0] = origin;
        hashBuffer[1] |= 0x80;
        hashBuffer[2] = origin;
        hashBuffer[3] |= 0x80;

        return '0x' + hashBuffer.toString('hex');
    }


    get originShard(): string | undefined {
        const pubKey = hexlify(this.txInputs[0].pub_key);
        const senderAddr = computeAddress(pubKey || "")

        return getShardForAddress(senderAddr)?.byte.slice(2);
    }

    get destShard(): string | undefined { 
        return getShardForAddress(hexlify(this.txOutputs[0].address) || "")?.byte.slice(2);
    }

    /**
     *  Creates a new Transaction with default values.
     */
    constructor() {
        super();
        this.#txInputs = [];
        this.#txOutputs = [];
    }


    /**
     *  Validates the explicit properties and returns a list of compatible
     *  transaction types.
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
     */
    clone(): QiTransaction {
        return QiTransaction.from(this);
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
            chainId: s(this.chainId),
            signature: this.signature ? this.signature : null,
            hash: this.hash,
            txInputs: this.txInputs,
            txOutputs: this.txOutputs,
        } as QiTransactionLike;
    }

    /**
     *  Return a protobuf-friendly JSON object.
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
     */
    static from(tx: string | QiTransactionLike): QiTransaction {
        if (typeof (tx) === "string") {
            const decodedProtoTx: ProtoTransaction = decodeProtoTransaction(getBytes(tx));
            return QiTransaction.fromProto(decodedProtoTx);
        }

        const result = new QiTransaction();
        if (tx.type != null) { result.type = tx.type; }
        if (tx.chainId != null) { result.chainId = tx.chainId; }
        if (tx.signature != null) { result.signature = tx.signature as string; }
        if (tx.txInputs != null) { result.txInputs = tx.txInputs as TxInput[]; }
        if (tx.txOutputs != null) { result.txOutputs = tx.txOutputs as TxOutput[]; }

        if (tx.hash != null) {
            assertArgument(result.isSigned(), "unsigned transaction cannot define hash", "tx", tx);
        }

        return result;
    }

    /**
     * Create a **Transaction** from a ProtoTransaction object.
     */
    static fromProto(protoTx: ProtoTransaction): QiTransaction {

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

        return tx;
    }
}
