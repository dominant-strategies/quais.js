import { formatNumber } from "../providers/format"
import { Signature, SignatureLike, assert, getBytes, getNumber } from "../quais"
import { encodeProtoWorkObject } from "../utils/proto-encode"
import { TransactionLike, ProtoTransaction, Transaction } from "./transaction"

/**
 *  Interface representing a WorkObject, which includes
 *  header, body, and transaction information.
 */
export interface WorkObjectLike {
    /** Header information of the WorkObject. */
    woHeader: WorkObjectHeaderLike

    /** Body information of the WorkObject. */
    woBody: WorkObjectBodyLike

    /** Transaction information associated with the WorkObject. */
    tx: TransactionLike
}

/**
 *  Interface representing the header information of a WorkObject.
 */
export interface WorkObjectHeaderLike {
    /** The difficulty of the WorkObject. */
    wodifficulty: string

    /** Hash of the WorkObject header. */
    woheaderHash: string

    /** Location information of the WorkObject. */
    wolocation: number[]

    /** Hash of the parent WorkObject. */
    woparentHash: string

    /** Nonce of the WorkObject. */
    wononce: string

    /** Number of the WorkObject. */
    wonumber: string

    /** Transaction hash associated with the WorkObject. */
    wotxHash: string
}

/**
 *  Interface representing the body information of a WorkObject.
 */
export interface WorkObjectBodyLike {
    /** External transactions included in the WorkObject. */
    extTransactions: TransactionLike[]

    /** Header information of the WorkObject. */
    header: HeaderLike

    /** Manifest of the block. */
    manifest: BlockManifest

    /** Transactions included in the WorkObject. */
    transactions: TransactionLike[]

    /** Uncles (or ommer blocks) of the WorkObject. */
    uncles: WorkObjectLike[]
}

/**
 *  Interface representing the header information within the body of a WorkObject.
 */
export interface HeaderLike {
    /** Base fee per gas. */
    baseFeePerGas: string

    /** Difficulty of the block. */
    difficulty: string

    /** EVM root hash. */
    evmRoot: string

    /** External rollup root hash. */
    extRollupRoot: string

    /** Root hash of external transactions. */
    extTransactionsRoot: string

    /** Extra data included in the block. */
    extraData: string

    /** Gas limit for the block. */
    gasLimit: string

    /** Gas used by the block. */
    gasUsed: string

    /** Hash of the block. */
    hash: string

    /** Location information of the block. */
    location: string

    /** Hashes of the block manifest. */
    manifestHash: string[]

    /** Miner address. */
    miner: string

    /** Mix hash of the block. */
    mixHash: string

    /** Nonce of the block. */
    nonce: string

    /** Block number. */
    number: string[]

    /** Parent delta S values. */
    parentDeltaS: string[]

    /** Parent entropy values. */
    parentEntropy: string[]

    /** Parent hash values. */
    parentHash: string[]

    /** Receipts root hash. */
    receiptsRoot: string

    /** SHA3 uncles hash. */
    sha3Uncles: string

    /** Size of the block. */
    size: string

    /** Timestamp of the block. */
    timestamp: string

    /** Transactions root hash. */
    transactionsRoot: string

    /** UTXO root hash. */
    utxoRoot: string

    /** Seal hash of the block. */
    sealHash: string

    /** Proof-of-Work hash. */
    PowHash: string

    /** Proof-of-Work digest. */
    PowDigest: string
}

/** Type representing a block manifest as an array of strings. */
export type BlockManifest = string[]



/** Interface representing the protobuf format of a WorkObject. */
export interface ProtoWorkObject {
    wo_body?: ProtoWorkObjectBody | null;
    wo_header?: ProtoWorkObjectHeader | null;
    tx?: ProtoTransaction | null;
}

/** Interface representing the header of a WorkObject in protobuf format. */
export interface ProtoWorkObjectHeader {
    difficulty?: Uint8Array | null;
    header_hash?: ProtoHash | null;
    location?: ProtoLocation | null;
    nonce?: number | null;
    number?: Uint8Array | null;
    parent_hash?: ProtoHash | null;
    tx_hash?: ProtoHash | null;
}

/** Interface representing the body of a WorkObject in protobuf format. */
export interface ProtoWorkObjectBody {
    ext_transactions?: ProtoTransactions | null;
    header?: ProtoHeader | null;
    manifest?: ProtoManifest | null;
    transactions?: ProtoTransactions | null;
    uncles?: ProtoWorkObjects | null;
}

/** Interface representing the header within the body of a WorkObject in protobuf format. */
export interface ProtoHeader {
    base_fee?: Uint8Array | null;
    coinbase?: Uint8Array | null;
    difficulty?: Uint8Array | null;
    evm_root?: ProtoHash | null;
    etx_hash?: ProtoHash | null;
    etx_rollup_hash?: ProtoHash | null;
    extra?: Uint8Array | null;
    gas_limit?: number | null;
    gas_used?: number | null;
    location?: ProtoLocation | null;
    manifest_hash: ProtoHash[] | null;
    mix_hash?: ProtoHash | null;
    nonce?: number | null;
    number: Uint8Array[] | null;
    parent_delta_s: Uint8Array[] | null;
    parent_entropy: Uint8Array[] | null;
    parent_hash: ProtoHash[] | null;
    receipt_hash?: ProtoHash | null;
    time?: bigint | null;
    tx_hash?: ProtoHash | null;
    uncle_hash?: ProtoHash | null;
    utxo_root?: ProtoHash | null;
}

/** Interface representing an array of ProtoWorkObject. */
interface ProtoWorkObjects { work_objects: ProtoWorkObject[]; }

/** Interface representing an array of ProtoTransaction. */
interface ProtoTransactions { transactions: ProtoTransaction[]; }

/** Interface representing a single hash value in a protobuf format. */
export interface ProtoHash { value: Uint8Array }

/** Interface representing multiple hash values in a protobuf format. */
export interface ProtoHashes { hashes: ProtoHash[] }

/** Interface representing a location value in a protobuf format. */
export interface ProtoLocation { value: Uint8Array }

/** Interface representing a manifest in a protobuf format. */
export interface ProtoManifest { manifest: ProtoHash[] }


/**
 *  Represents a WorkObject, which includes header, body, and transaction information.
 */
export class WorkObject {
    #woHeader: WorkObjectHeaderLike;
    #woBody: WorkObjectBodyLike;
    #tx: Transaction;

    /**
     *  Constructs a WorkObject instance.
     *  
     *  @param woHeader The header information of the WorkObject.
     *  @param woBody The body information of the WorkObject.
     *  @param tx The transaction associated with the WorkObject.
     *  @param signature The signature of the transaction (optional).
     */
    constructor(woHeader: WorkObjectHeaderLike, woBody: WorkObjectBodyLike, tx: TransactionLike, signature?: SignatureLike | null) {
        this.#woHeader = woHeader;
        this.#woBody = woBody;
        this.#tx = Transaction.from(tx);

        // Set the signature on the transaction
        this.#tx.signature = (signature == null) ? null : Signature.from(signature);
    }

    /** Gets the header information of the WorkObject. */
    get woHeader(): WorkObjectHeaderLike { return this.#woHeader; }
    set woHeader(value: WorkObjectHeaderLike) { this.#woHeader = value; }

    /** Gets the body information of the WorkObject. */
    get woBody(): WorkObjectBodyLike { return this.#woBody; }
    set woBody(value: WorkObjectBodyLike) { this.#woBody = value; }

    /** Gets the transaction associated with the WorkObject. */
    get tx(): Transaction { return this.#tx; }
    set tx(value: TransactionLike) { this.#tx = Transaction.from(value); }

    /**
     *  Gets the serialized representation of the WorkObject.
     *  Throws an error if the WorkObject transaction is unsigned.
     */
    get serialized(): string {
        assert(this.#tx.signature != null, "cannot serialize unsigned work object; maybe you meant .unsignedSerialized", "UNSUPPORTED_OPERATION", { operation: ".serialized" });
        return this.#serialize();
    }

    /**
     *  Gets the pre-image of the WorkObject.
     *  The hash of this is the digest which needs to be signed to authorize this WorkObject.
     */
    get unsignedSerialized(): string {
        return this.#serialize();
    }

    /**
     *  Creates a WorkObject instance from a WorkObjectLike object.
     *  
     *  @param data The WorkObjectLike object to create the WorkObject from.
     *  @returns A new WorkObject instance.
     */
    static from(data: WorkObjectLike): WorkObject {
        return new WorkObject(data.woHeader, data.woBody, data.tx);
    }

    /**
     *  Converts the WorkObject to a JSON-like object.
     *  
     *  @returns The WorkObject as a WorkObjectLike object.
     */
    toJson(): WorkObjectLike {
        return {
            woHeader: this.woHeader,
            woBody: this.woBody,
            tx: this.tx.toJSON(),
        };
    }

    /**
     *  Converts the WorkObject to its protobuf representation.
     *  
     *  @returns The WorkObject as a ProtoWorkObject.
     */
    toProtobuf(): ProtoWorkObject {
        return {
            wo_header: {
                difficulty: getBytes(this.woHeader.wodifficulty),
                header_hash: { value: getBytes(this.woHeader.woheaderHash) },
                location: { value: new Uint8Array(this.woHeader.wolocation) },
                nonce: getNumber(this.woHeader.wononce),
                number: formatNumber(this.woHeader.wonumber, "number"),
                parent_hash: { value: getBytes(this.woHeader.woparentHash) },
                tx_hash: { value: getBytes(this.woHeader.wotxHash) },
            },
            wo_body: {
                ext_transactions: { transactions: this.woBody.extTransactions.map(tx => Transaction.from(tx).toProtobuf()) },
                header: {
                    base_fee: getBytes(this.woBody.header.baseFeePerGas),
                    coinbase: getBytes(this.woBody.header.miner),
                    difficulty: getBytes(this.woBody.header.difficulty),
                    evm_root: { value: getBytes(this.woBody.header.evmRoot) },
                    etx_hash: { value: getBytes(this.woBody.header.extTransactionsRoot) },
                    etx_rollup_hash: { value: getBytes(this.woBody.header.extRollupRoot) },
                    extra: getBytes(this.woBody.header.extraData),
                    gas_limit: getNumber(this.woBody.header.gasLimit),
                    gas_used: getNumber(this.woBody.header.gasUsed),
                    location: { value: getBytes(this.woBody.header.location) },
                    manifest_hash: this.woBody.header.manifestHash.map(h => ({ value: getBytes(h) })),
                    mix_hash: { value: getBytes(this.woBody.header.mixHash) },
                    nonce: getNumber(this.woBody.header.nonce),
                    number: this.woBody.header.number.map(n => formatNumber(n, "number")),
                    parent_delta_s: this.woBody.header.parentDeltaS.map(h => formatNumber(h, "parent_delta_s")),
                    parent_entropy: this.woBody.header.parentEntropy.map(h => formatNumber(h, "parent_entropy")),
                    parent_hash: this.woBody.header.parentHash.map(h => ({ value: getBytes(h) })),
                    receipt_hash: { value: getBytes(this.woBody.header.receiptsRoot) },
                    tx_hash: { value: getBytes(this.woBody.header.transactionsRoot) },
                    uncle_hash: { value: getBytes(this.woBody.header.sha3Uncles) },
                    utxo_root: { value: getBytes(this.woBody.header.utxoRoot) },
                },
                transactions: { transactions: this.woBody.transactions.map(tx => Transaction.from(tx).toProtobuf()) },
                uncles: { work_objects: this.woBody.uncles.map(uncle => WorkObject.from(uncle).toProtobuf()) },
                manifest: { manifest: this.woBody.manifest.map(m => ({ value: getBytes(m) })) },
            },
            tx: this.tx.toProtobuf(),
        };
    }

    /**
     *  Creates a clone of the current WorkObject.
     *  
     *  @returns A new WorkObject instance that is a clone of the current instance.
     */
    clone(): WorkObject {
        return WorkObject.from(this);
    }

    /**
     *  Serializes the WorkObject to a string.
     *  
     *  @returns The serialized string representation of the WorkObject.
     */
    #serialize(): string {
        return encodeProtoWorkObject(this.toProtobuf());
    }
}