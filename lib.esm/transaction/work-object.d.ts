import { TransactionLike, ProtoTransaction, Transaction } from "./transaction";
/**
 *  Interface representing a WorkObject, which includes
 *  header, body, and transaction information.
 */
export interface WorkObjectLike {
    /** Header information of the WorkObject. */
    woHeader: WorkObjectHeaderLike;
    /** Body information of the WorkObject. */
    woBody: WorkObjectBodyLike;
    /** Transaction information associated with the WorkObject. */
    tx: TransactionLike;
}
/**
 *  Interface representing the header information of a WorkObject.
 */
export interface WorkObjectHeaderLike {
    /** The difficulty of the WorkObject. */
    difficulty: string;
    /** Hash of the WorkObject header. */
    headerHash: string;
    /** Location information of the WorkObject. */
    location: number[];
    /** Hash of the parent WorkObject. */
    parentHash: string;
    /** Nonce of the WorkObject. */
    nonce: string;
    /** Number of the WorkObject. */
    number: string;
    /** Transaction hash associated with the WorkObject. */
    txHash: string;
}
/**
 *  Interface representing the body information of a WorkObject.
 */
export interface WorkObjectBodyLike {
    /** External transactions included in the WorkObject. */
    extTransactions: WorkObjectLike[];
    /** Header information of the WorkObject. */
    header: HeaderLike;
    /** Manifest of the block. */
    manifest: BlockManifest;
    /** Transactions included in the WorkObject. */
    transactions: WorkObjectLike[];
    /** Uncles (or ommer blocks) of the WorkObject. */
    uncles: WorkObjectLike[];
}
/**
 *  Interface representing the header information within the body of a WorkObject.
 */
export interface HeaderLike {
    /** Base fee per gas. */
    baseFeePerGas: string;
    /** EVM root hash. */
    evmRoot: string;
    /** External rollup root hash. */
    extRollupRoot: string;
    /** Root hash of external transactions. */
    extTransactionsRoot: string;
    /** Hash of the external transaction set. */
    etxSetHash: string;
    /** Extra data included in the block. */
    extraData: string;
    /** Gas limit for the block. */
    gasLimit: string;
    /** Gas used by the block. */
    gasUsed: string;
    /** Hashes of the block manifest. */
    manifestHash: string[];
    /** Miner address. */
    miner: string;
    /** Block number. */
    number: string[];
    /** Parent delta S values. */
    parentDeltaS: string[];
    /** Parent entropy values. */
    parentEntropy: string[];
    /** Parent hash values. */
    parentHash: string[];
    /** Receipts root hash. */
    receiptsRoot: string;
    /** SHA3 uncles hash. */
    sha3Uncles: string;
    /** Transactions root hash. */
    transactionsRoot: string;
    /** UTXO root hash. */
    utxoRoot: string;
    /** Hash of the block. */
    hash?: string;
    /** Seal hash of the block. */
    sealHash?: string;
    /** Proof-of-Work hash. */
    PowHash?: string;
    /** Proof-of-Work digest. */
    PowDigest?: string;
}
/** Type representing a block manifest as an array of strings. */
export type BlockManifest = string[];
/** Interface representing the header within the body of a WorkObject in protobuf format. */
export interface ProtoHeader {
    base_fee?: Uint8Array | null;
    coinbase?: Uint8Array | null;
    evm_root?: ProtoHash | null;
    etx_hash?: ProtoHash | null;
    etx_rollup_hash?: ProtoHash | null;
    etx_set_hash?: ProtoHash | null;
    extra?: Uint8Array | null;
    gas_limit?: number | null;
    gas_used?: number | null;
    manifest_hash: ProtoHash[] | null;
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
/** Interface representing the header of a WorkObject in protobuf format. */
export interface ProtoWorkObjectHeader {
    difficulty?: Uint8Array | null;
    header_hash?: ProtoHash | null;
    location?: ProtoLocation | null;
    nonce?: number | null;
    number?: Uint8Array | null;
    parent_hash?: ProtoHash | null;
    tx_hash?: ProtoHash | null;
    mix_hash?: ProtoHash | null;
}
/** Interface representing the body of a WorkObject in protobuf format. */
export interface ProtoWorkObjectBody {
    ext_transactions?: ProtoWorkObjects | null;
    header?: ProtoHeader | null;
    manifest?: ProtoManifest | null;
    transactions?: ProtoWorkObjects | null;
    uncles?: ProtoWorkObjects | null;
}
/** Interface representing the protobuf format of a WorkObject. */
export interface ProtoWorkObject {
    wo_body?: ProtoWorkObjectBody | null;
    wo_header?: ProtoWorkObjectHeader | null;
    tx?: ProtoTransaction | null;
}
/** Interface representing an array of ProtoWorkObject. */
interface ProtoWorkObjects {
    work_objects: ProtoWorkObject[];
}
/** Interface representing an array of ProtoTransaction. */
/** Interface representing a single hash value in a protobuf format. */
export interface ProtoHash {
    value: Uint8Array;
}
/** Interface representing multiple hash values in a protobuf format. */
export interface ProtoHashes {
    hashes: ProtoHash[];
}
/** Interface representing a location value in a protobuf format. */
export interface ProtoLocation {
    value: Uint8Array;
}
/** Interface representing a manifest in a protobuf format. */
export interface ProtoManifest {
    manifest: ProtoHash[];
}
/**
 *  Represents a WorkObject, which includes header, body, and transaction information.
 */
export declare class WorkObject {
    #private;
    /**
     *  Constructs a WorkObject instance.
     *
     *  @param woHeader The header information of the WorkObject.
     *  @param woBody The body information of the WorkObject.
     *  @param tx The transaction associated with the WorkObject.
     *  @param signature The signature of the transaction (optional).
     */
    constructor(woHeader: WorkObjectHeaderLike, woBody: WorkObjectBodyLike, tx: TransactionLike);
    /** Gets the header information of the WorkObject. */
    get woHeader(): WorkObjectHeaderLike;
    set woHeader(value: WorkObjectHeaderLike);
    /** Gets the body information of the WorkObject. */
    get woBody(): WorkObjectBodyLike;
    set woBody(value: WorkObjectBodyLike);
    /** Gets the transaction associated with the WorkObject. */
    get tx(): Transaction;
    set tx(value: TransactionLike);
    /**
     *  Gets the serialized representation of the WorkObject.
     *  Throws an error if the WorkObject transaction is unsigned.
     */
    get serialized(): string;
    /**
     *  Gets the pre-image of the WorkObject.
     *  The hash of this is the digest which needs to be signed to authorize this WorkObject.
     */
    get unsignedSerialized(): string;
    /**
    *  Creates a clone of the current WorkObject.
    *
    *  @returns A new WorkObject instance that is a clone of the current instance.
    */
    clone(): WorkObject;
    /**
     *  Converts the WorkObject to a JSON-like object.
     *
     *  @returns The WorkObject as a WorkObjectLike object.
     */
    toJSON(): WorkObjectLike;
    /**
     *  Converts the WorkObject to its protobuf representation.
     *
     *  @returns The WorkObject as a ProtoWorkObject.
     */
    toProtobuf(): ProtoWorkObject;
    /**
     *  Creates a WorkObject instance from a WorkObjectLike object.
     *
     *  @param data The WorkObjectLike object to create the WorkObject from.
     *  @returns A new WorkObject instance.
     */
    static from(wo: string | WorkObjectLike): WorkObject;
    /**
     * Creates a WorkObject instance from a ProtoWorkObject object.
     *
     * @param protoWo The ProtoWorkObject object to create the WorkObject from.
     * @returns A new WorkObject instance.
     */
    static fromProto(protoWo: ProtoWorkObject): WorkObject;
}
export {};
//# sourceMappingURL=work-object.d.ts.map