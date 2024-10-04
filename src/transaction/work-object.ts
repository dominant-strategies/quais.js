import { formatNumber } from '../providers/format.js';
import { assert, getBytes, getNumber, hexlify } from '../utils/index.js';
import { decodeProtoWorkObject, encodeProtoWorkObject } from '../encoding/index.js';
import { ProtoTransaction } from './abstract-transaction.js';
import { QuaiTransaction, QuaiTransactionLike } from './quai-transaction.js';

/**
 * Interface representing a WorkObject, which includes header, body, and transaction information.
 *
 * @ignore
 * @category Transaction
 */
export interface WorkObjectLike {
    /**
     * Header information of the WorkObject.
     */
    woHeader: WorkObjectHeaderLike;

    /**
     * Body information of the WorkObject.
     */
    woBody: WorkObjectBodyLike;

    /**
     * Transaction information associated with the WorkObject.
     */
    tx: QuaiTransactionLike;
}

/**
 * Interface representing the header information of a WorkObject.
 *
 * @ignore
 * @category Transaction
 */
export interface WorkObjectHeaderLike {
    /**
     * The difficulty of the WorkObject.
     */
    difficulty: string;

    /**
     * Hash of the WorkObject header.
     */
    headerHash: string;

    /**
     * Location information of the WorkObject.
     */
    location: number[];

    /**
     * Hash of the parent WorkObject.
     */
    parentHash: string;

    /**
     * Nonce of the WorkObject.
     */
    nonce: string;

    /**
     * Number of the WorkObject.
     */
    number: string;

    /**
     * Transaction hash associated with the WorkObject.
     */
    txHash: string;
}

/**
 * Interface representing the body information of a WorkObject.
 *
 * @ignore
 * @category Transaction
 */
export interface WorkObjectBodyLike {
    /**
     * External transactions included in the WorkObject.
     */
    extTransactions: WorkObjectLike[];

    /**
     * Header information of the WorkObject.
     */
    header: HeaderLike;

    /**
     * Manifest of the block.
     */
    manifest: BlockManifest;

    /**
     * Transactions included in the WorkObject.
     */
    transactions: WorkObjectLike[];

    /**
     * Uncles (or ommer blocks) of the WorkObject.
     */
    uncles: WorkObjectLike[];
}

/**
 * Interface representing the header information within the body of a WorkObject.
 *
 * @ignore
 * @category Transaction
 */
export interface HeaderLike {
    /**
     * Base fee per gas.
     */
    baseFeePerGas: string;

    /**
     * EVM root hash.
     */
    evmRoot: string;

    /**
     * External rollup root hash.
     */
    extRollupRoot: string;

    /**
     * Root hash of external transactions.
     */
    extTransactionsRoot: string;

    /**
     * Hash of the external transaction set.
     */
    etxSetHash: string;

    /**
     * Extra data included in the block.
     */
    extraData: string;

    /**
     * Gas limit for the block.
     */
    gasLimit: string;

    /**
     * Gas used by the block.
     */
    gasUsed: string;

    /**
     * Hashes of the block manifest.
     */
    manifestHash: string[];

    /**
     * Miner address.
     */
    miner: string;

    /**
     * Block number.
     */
    number: string[];

    /**
     * Parent delta S values.
     */
    parentDeltaS: string[];

    /**
     * Parent entropy values.
     */
    parentEntropy: string[];

    /**
     * Parent hash values.
     */
    parentHash: string[];

    /**
     * Receipts root hash.
     */
    receiptsRoot: string;

    /**
     * SHA3 uncles hash.
     */
    sha3Uncles: string;

    /**
     * Transactions root hash.
     */
    transactionsRoot: string;

    /**
     * UTXO root hash.
     */
    utxoRoot: string;

    /**
     * Hash of the block.
     */
    hash?: string;

    /**
     * Seal hash of the block.
     */
    sealHash?: string;

    /**
     * Proof-of-Work hash.
     */
    PowHash?: string;

    /**
     * Proof-of-Work digest.
     */
    PowDigest?: string;
}

/**
 * Type representing a block manifest as an array of strings.
 *
 * @category Transaction
 */
export type BlockManifest = string[];

/**
 * Interface representing the header within the body of a WorkObject in protobuf format.
 *
 * @category Transaction
 */
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

/**
 * Interface representing the header of a WorkObject in protobuf format.
 *
 * @category Transaction
 */
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

/**
 * Interface representing the body of a WorkObject in protobuf format.
 *
 * @category Transaction
 */
export interface ProtoWorkObjectBody {
    ext_transactions?: ProtoWorkObjects | null;
    header?: ProtoHeader | null;
    manifest?: ProtoManifest | null;
    transactions?: ProtoWorkObjects | null;
    uncles?: ProtoWorkObjects | null;
}

/**
 * Interface representing the protobuf format of a WorkObject.
 *
 * @category Transaction
 */
export interface ProtoWorkObject {
    wo_body?: ProtoWorkObjectBody | null;
    wo_header?: ProtoWorkObjectHeader | null;
    tx?: ProtoTransaction | null;
}

/**
 * Interface representing an array of ProtoWorkObject.
 */
interface ProtoWorkObjects {
    work_objects: ProtoWorkObject[];
}

/**
 * Interface representing an array of ProtoTransaction.
 */
// interface ProtoTransactions { transactions: ProtoTransaction[]; }

/**
 * Interface representing a single hash value in a protobuf format.
 */
export interface ProtoHash {
    value: Uint8Array;
}

/**
 * Interface representing multiple hash values in a protobuf format.
 */
export interface ProtoHashes {
    hashes: ProtoHash[];
}

/**
 * Interface representing a location value in a protobuf format.
 */
export interface ProtoLocation {
    value: Uint8Array;
}

/**
 * Interface representing a manifest in a protobuf format.
 */
export interface ProtoManifest {
    manifest: ProtoHash[];
}

/**
 * Represents a WorkObject, which includes header, body, and transaction information.
 *
 * @category Transaction
 */
export class WorkObject {
    #woHeader: WorkObjectHeaderLike;
    #woBody: WorkObjectBodyLike;
    #tx: QuaiTransaction;

    /**
     * Constructs a WorkObject instance.
     *
     * @param {WorkObjectHeaderLike} woHeader The header information of the WorkObject.
     * @param {WorkObjectBodyLike} woBody The body information of the WorkObject.
     * @param {QuaiTransactionLike} tx The transaction associated with the WorkObject.
     */
    constructor(woHeader: WorkObjectHeaderLike, woBody: WorkObjectBodyLike, tx: QuaiTransactionLike) {
        this.#woHeader = woHeader;
        this.#woBody = woBody;
        this.#tx = QuaiTransaction.from(tx);

        this.#woHeader.txHash = this.#tx.hash!;
        this.#validate();
    }

    /**
     * Gets the header information of the WorkObject.
     */
    get woHeader(): WorkObjectHeaderLike {
        return this.#woHeader;
    }
    set woHeader(value: WorkObjectHeaderLike) {
        this.#woHeader = value;
    }

    /**
     * Gets the body information of the WorkObject.
     */
    get woBody(): WorkObjectBodyLike {
        return this.#woBody;
    }
    set woBody(value: WorkObjectBodyLike) {
        this.#woBody = value;
    }

    /**
     * Gets the transaction associated with the WorkObject.
     */
    get tx(): QuaiTransaction {
        return this.#tx;
    }
    set tx(value: QuaiTransactionLike) {
        this.#tx = QuaiTransaction.from(value);
    }

    /**
     * Gets the serialized representation of the WorkObject. Throws an error if the WorkObject transaction is unsigned.
     */
    get serialized(): string {
        assert(
            this.#tx.signature != null,
            'cannot serialize unsigned work object; maybe you meant .unsignedSerialized',
            'UNSUPPORTED_OPERATION',
            { operation: '.serialized' },
        );
        return this.#serialize();
    }

    /**
     * Gets the pre-image of the WorkObject. The hash of this is the digest which needs to be signed to authorize this
     * WorkObject.
     */
    get unsignedSerialized(): string {
        return this.#serialize();
    }

    /**
     * Creates a clone of the current WorkObject.
     *
     * @returns {WorkObject} A new WorkObject instance that is a clone of the current instance.
     */
    clone(): WorkObject {
        return WorkObject.from(this);
    }

    /**
     * Converts the WorkObject to a JSON-like object.
     *
     * @returns {WorkObjectLike} The WorkObject as a WorkObjectLike object.
     */
    toJSON(): WorkObjectLike {
        return {
            woHeader: this.woHeader,
            woBody: this.woBody,
            tx: this.tx.toJSON(),
        };
    }

    /**
     * Converts the WorkObject to its protobuf representation.
     *
     * @returns {ProtoWorkObject} }he WorkObject as a ProtoWorkObject.
     */
    toProtobuf(): ProtoWorkObject {
        return {
            wo_header: {
                difficulty: getBytes(this.woHeader.difficulty, 'difficulty'),
                header_hash: { value: getBytes(this.woHeader.headerHash, 'header_hash') },
                location: { value: new Uint8Array(this.woHeader.location) },
                nonce: getNumber(this.woHeader.nonce, 'nonce'),
                number: formatNumber(this.woHeader.number, 'number'),
                parent_hash: { value: getBytes(this.woHeader.parentHash, 'parent_hash') },
                tx_hash: { value: getBytes(this.woHeader.txHash, 'tx_hash') },
            },
            wo_body: null,
            tx: this.tx.toProtobuf(),
        };
    }

    /**
     * Creates a WorkObject instance from a WorkObjectLike object.
     *
     * @param {string | WorkObjectLike} wo The WorkObjectLike object to create the WorkObject from.
     * @returns {WorkObject} A new WorkObject instance.
     */
    static from(wo: string | WorkObjectLike): WorkObject {
        if (typeof wo === 'string') {
            const decodedProtoWo: ProtoWorkObject = decodeProtoWorkObject(getBytes(wo));
            return WorkObject.fromProto(decodedProtoWo);
        }

        return new WorkObject(wo.woHeader, wo.woBody, wo.tx);
    }

    /**
     * Creates a WorkObject instance from a ProtoWorkObject object.
     *
     * @param {ProtoWorkObject} protoWo The ProtoWorkObject object to create the WorkObject from.
     * @returns {WorkObject} A new WorkObject instance.
     */
    static fromProto(protoWo: ProtoWorkObject): WorkObject {
        // Assuming methods to convert ProtoHeader and ProtoWorkObjects to their respective interfaces
        const woHeader: WorkObjectHeaderLike = {
            difficulty: hexlify(protoWo.wo_header?.difficulty || new Uint8Array()),
            headerHash: hexlify(protoWo.wo_header?.header_hash?.value || new Uint8Array()),
            location: protoWo.wo_header?.location?.value ? Array.from(protoWo.wo_header.location.value) : [],
            nonce: protoWo.wo_header?.nonce?.toString() || '0',
            number: hexlify(protoWo.wo_header?.number || new Uint8Array()),
            parentHash: hexlify(protoWo.wo_header?.parent_hash?.value || new Uint8Array()),
            txHash: hexlify(protoWo.wo_header?.tx_hash?.value || new Uint8Array()),
        };

        const woBody: WorkObjectBodyLike = {
            extTransactions: protoWo.wo_body?.ext_transactions?.work_objects.map(WorkObject.fromProto) || [],
            header: {
                baseFeePerGas: hexlify(protoWo.wo_body?.header?.base_fee || new Uint8Array()),
                evmRoot: hexlify(protoWo.wo_body?.header?.evm_root?.value || new Uint8Array()),
                extRollupRoot: hexlify(protoWo.wo_body?.header?.etx_rollup_hash?.value || new Uint8Array()),
                extTransactionsRoot: hexlify(protoWo.wo_body?.header?.etx_hash?.value || new Uint8Array()),
                etxSetHash: hexlify(protoWo.wo_body?.header?.etx_set_hash?.value || new Uint8Array()),
                extraData: hexlify(protoWo.wo_body?.header?.extra || new Uint8Array()),
                gasLimit: protoWo.wo_body?.header?.gas_limit?.toString() || '0',
                gasUsed: protoWo.wo_body?.header?.gas_used?.toString() || '0',
                manifestHash: protoWo.wo_body?.header?.manifest_hash?.map((hash) => hexlify(hash.value)) || [],
                miner: hexlify(protoWo.wo_body?.header?.coinbase || new Uint8Array()),
                number: protoWo.wo_body?.header?.number?.map((n) => hexlify(n)) || [],
                parentDeltaS: protoWo.wo_body?.header?.parent_delta_s?.map((h) => hexlify(h)) || [],
                parentEntropy: protoWo.wo_body?.header?.parent_entropy?.map((h) => hexlify(h)) || [],
                parentHash: protoWo.wo_body?.header?.parent_hash?.map((hash) => hexlify(hash.value)) || [],
                receiptsRoot: hexlify(protoWo.wo_body?.header?.receipt_hash?.value || new Uint8Array()),
                sha3Uncles: hexlify(protoWo.wo_body?.header?.uncle_hash?.value || new Uint8Array()),
                transactionsRoot: hexlify(protoWo.wo_body?.header?.tx_hash?.value || new Uint8Array()),
                utxoRoot: hexlify(protoWo.wo_body?.header?.utxo_root?.value || new Uint8Array()),
            },
            manifest: protoWo.wo_body?.manifest?.manifest.map((hash) => hexlify(hash.value)) || [],
            transactions: protoWo.wo_body?.transactions?.work_objects.map(WorkObject.fromProto) || [],
            uncles: protoWo.wo_body?.uncles?.work_objects.map(WorkObject.fromProto) || [],
        };

        // Convert ProtoTransaction to TransactionLike using Transaction.fromProto

        if (protoWo.tx) {
            const tx: QuaiTransactionLike = QuaiTransaction.fromProto(protoWo.tx).toJSON();
            return new WorkObject(woHeader, woBody, tx);
        } else {
            throw new Error('Invalid ProtoWorkObject: missing transaction');
        }
    }

    /**
     * Serializes the WorkObject to a string.
     *
     * @returns {string} The serialized WorkObject.
     */
    #serialize(): string {
        return encodeProtoWorkObject(this.toProtobuf());
    }

    /**
     * Validates the WorkObject. Ensures that the body header number and parent hashes are of the correct length.
     *
     * TODO: This method should validate the entire WorkObject.
     */
    #validate(): void {
        this.#woBody.header.number = this.#woBody.header.number.slice(0, 2);
        this.#woBody.header.parentHash = this.#woBody.header.parentHash.slice(0, 2);
    }
}
