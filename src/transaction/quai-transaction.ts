import { keccak256, Signature } from '../crypto/index.js';
import { AccessList, accessListify, AccessListish, AbstractTransaction, TransactionLike } from './index.js';
import {
    assert,
    assertArgument,
    BigNumberish,
    BytesLike,
    getBigInt,
    getBytes,
    getNumber,
    getZoneForAddress,
    hexlify,
    toBeArray,
    toBigInt,
    zeroPadValue,
} from '../utils/index.js';
import { decodeProtoTransaction, encodeProtoTransaction } from '../encoding/index.js';
import {
    formatMixedCaseChecksumAddress,
    getAddress,
    recoverAddress,
    validateAddress,
    isQuaiAddress,
} from '../address/index.js';
import { formatNumber, handleNumber } from '../providers/format.js';
import { ProtoTransaction } from './abstract-transaction.js';
import { Zone } from '../constants/index.js';

/**
 * A **QuaiTransactionLike** is a JSON representation of a Quai transaction.
 *
 * @category Transaction
 */
export interface QuaiTransactionLike extends TransactionLike {
    /**
     * The recipient address or `null` for an `init` transaction.
     */
    to?: null | string;

    /**
     * The sender.
     */
    from?: string;

    /**
     * The nonce.
     */
    nonce?: null | number;

    /**
     * The maximum amount of gas that can be used.
     */
    gasLimit?: null | BigNumberish;

    /**
     * The maximum priority fee per gas for london transactions.
     */
    minerTip?: null | BigNumberish;

    /**
     * The maximum total fee per gas for london transactions.
     */
    gasPrice?: null | BigNumberish;

    /**
     * The data.
     */
    data?: null | string;

    /**
     * The value (in wei) to send.
     */
    value?: null | BigNumberish;

    /**
     * The access list for berlin and london transactions.
     */
    accessList?: null | AccessListish;
}

/**
 * Parses a signature from an array of fields.
 *
 * @ignore
 * @param {string[]} fields - The fields to parse.
 * @returns {Signature} The parsed signature.
 */
export function _parseSignature(fields: Array<string>): Signature {
    let yParity: number;
    try {
        yParity = handleNumber(fields[0], 'yParity');
        if (yParity !== 0 && yParity !== 1) {
            throw new Error('bad yParity');
        }
    } catch (error) {
        assertArgument(false, 'invalid yParity', 'yParity', fields[0]);
    }

    const r = zeroPadValue(fields[1], 32);
    const s = zeroPadValue(fields[2], 32);

    return Signature.from({ r, s, yParity });
}

/**
 * Represents a Quai transaction.
 *
 * @category Transaction
 */
export class QuaiTransaction extends AbstractTransaction<Signature> implements QuaiTransactionLike {
    #to: null | string;
    #data: string;
    #nonce: number;
    #gasLimit: bigint;
    #gasPrice: null | bigint;
    #minerTip: null | bigint;
    #value: bigint;
    #accessList: null | AccessList;
    from?: string;

    /**
     * The `to` address for the transaction or `null` if the transaction is an `init` transaction.
     *
     * @type {null | string}
     */
    get to(): null | string {
        return this.#to;
    }
    set to(value: null | string) {
        if (value !== null) validateAddress(value);
        this.#to = value;
    }

    /**
     * The permuted hash of the transaction as specified by
     * [QIP-0010](https://github.com/quai-network/qips/blob/master/qip-0010.md).
     *
     * @type {null | string}
     * @throws {Error} If the transaction is not signed.
     */
    get hash(): null | string {
        if (this.signature == null) return null;

        if (!this.originZone) {
            throw new Error('Invalid Zone for from address');
        }
        if (!this.from) {
            throw new Error('Missing from address');
        }

        const isSameLedger = !this.to || isQuaiAddress(this.from) === isQuaiAddress(this.to);
        if (this.isExternal && !isSameLedger) {
            throw new Error('Cross-zone & cross-ledger transactions are not supported');
        }

        const hexString = this.serialized.startsWith('0x') ? this.serialized.substring(2) : this.serialized;
        const dataBuffer = Buffer.from(hexString, 'hex');

        const hashHex = keccak256(dataBuffer);
        const hashBuffer = Buffer.from(hashHex.substring(2), 'hex');

        const origin = this.originZone ? parseInt(this.originZone.slice(2), 16) : 0;
        hashBuffer[0] = origin;
        hashBuffer[1] &= 0x7f;
        hashBuffer[2] = origin;
        hashBuffer[3] &= 0x7f;

        return '0x' + hashBuffer.toString('hex');
    }

    /**
     * The zone of the sender address
     *
     * @type {Zone | undefined}
     */
    get originZone(): Zone | undefined {
        const zone = this.from ? getZoneForAddress(this.from) : undefined;
        return zone ?? undefined;
    }

    /**
     * The zone of the recipient address
     *
     * @type {Zone | undefined}
     */
    get destZone(): Zone | undefined {
        const zone = this.to !== null ? getZoneForAddress(this.to || '') : undefined;
        return zone ?? undefined;
    }

    /**
     * The transaction nonce.
     *
     * @type {number}
     */
    get nonce(): number {
        return this.#nonce;
    }
    set nonce(value: BigNumberish) {
        this.#nonce = getNumber(value, 'value');
    }

    /**
     * The gas limit.
     *
     * @type {bigint}
     */
    get gasLimit(): bigint {
        return this.#gasLimit;
    }
    set gasLimit(value: BigNumberish) {
        this.#gasLimit = getBigInt(value);
    }

    /**
     * The maximum priority fee per unit of gas to pay. On legacy networks this should be `null`.
     *
     * @type {null | bigint}
     */
    get minerTip(): null | bigint {
        const value = this.#minerTip;
        if (value == null) {
            return null;
        }
        return value;
    }
    set minerTip(value: null | BigNumberish) {
        this.#minerTip = value == null ? null : getBigInt(value, 'minerTip');
    }

    /**
     * The maximum total fee per unit of gas to pay. On legacy networks this should be `null`.
     *
     * @type {null | bigint}
     */
    get gasPrice(): null | bigint {
        const value = this.#gasPrice;
        if (value == null) {
            return null;
        }
        return value;
    }
    set gasPrice(value: null | BigNumberish) {
        this.#gasPrice = value == null ? null : getBigInt(value, 'gasPrice');
    }

    /**
     * The transaction data. For `init` transactions this is the deployment code.
     *
     * @type {string}
     */
    get data(): string {
        return this.#data;
    }
    set data(value: BytesLike) {
        this.#data = hexlify(value);
    }

    /**
     * The amount of ether to send in this transactions.
     *
     * @type {bigint}
     */
    get value(): bigint {
        return this.#value;
    }
    set value(value: BigNumberish) {
        this.#value = getBigInt(value, 'value');
    }

    /**
     * The access list.
     *
     * An access list permits discounted (but pre-paid) access to bytecode and state variable access within contract
     * execution.
     *
     * @type {null | AccessList}
     */
    get accessList(): null | AccessList {
        const value = this.#accessList || null;
        if (value == null) {
            return null;
        }
        return value;
    }
    set accessList(value: null | AccessListish) {
        this.#accessList = value == null ? null : accessListify(value);
    }

    /**
     * Creates a new Transaction with default values.
     *
     * @param {string} [from] - The sender address.
     */
    constructor(from?: string) {
        super();
        this.#to = null;
        this.#nonce = 0;
        this.#gasLimit = BigInt(0);
        this.#gasPrice = null;
        this.#minerTip = null;
        this.#gasPrice = null;
        this.#data = '0x';
        this.#value = BigInt(0);
        this.#accessList = null;
        this.from = from;
    }

    /**
     * Validates the explicit properties and returns a list of compatible transaction types.
     *
     * @returns {number[]} The compatible transaction types.
     */
    inferTypes(): Array<number> {
        if (this.gasPrice != null && this.minerTip != null) {
            assert(this.gasPrice >= this.minerTip, 'priorityFee cannot be more than maxFee', 'BAD_DATA', {
                value: this,
            });
        }

        assert(
            this.type !== 0 && this.type !== 1,
            'transaction type cannot have externalGasLimit, externalGasTip, externalGasPrice, externalData, or externalAccessList',
            'BAD_DATA',
            { value: this },
        );

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
     * Create a copy of this transaction.
     *
     * @returns {QuaiTransaction} The cloned transaction.
     */
    clone(): QuaiTransaction {
        return QuaiTransaction.from(this);
    }

    /**
     * Return a JSON-friendly object.
     *
     * @returns {QuaiTransactionLike} The JSON-friendly object.
     */
    toJSON(): QuaiTransactionLike {
        const s = (v: null | bigint) => {
            if (v == null) {
                return null;
            }
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
            minerTip: s(this.minerTip),
            value: s(this.value),
            chainId: s(this.chainId),
            signature: this.signature ? this.signature.toJSON() : null,
            hash: this.hash,
            accessList: this.accessList,
        } as QuaiTransactionLike;
    }

    /**
     * Return a protobuf-friendly JSON object.
     *
     * @param {boolean} [includeSignature=true] - Whether to include the signature. Default is `true`
     * @returns {ProtoTransaction} The protobuf-friendly JSON object.
     */
    toProtobuf(includeSignature: boolean = true): ProtoTransaction {
        const protoTx: ProtoTransaction = {
            type: this.type || 0,
            chain_id: formatNumber(this.chainId || 0, 'chainId'),
            nonce: this.nonce || 0,
            miner_tip: formatNumber(this.minerTip || 0, 'minerTip'),
            gas_price: formatNumber(this.gasPrice || 0, 'gasPrice'),
            gas: Number(this.gasLimit || 0),
            to: this.to != null ? getBytes(this.to as string) : null,
            value: formatNumber(this.value || 0, 'value'),
            data: getBytes(this.data || '0x'),
            access_list: {
                access_tuples:
                    this.accessList?.map((it) => {
                        return {
                            address: getBytes(it.address),
                            storage_key: it.storageKeys.map((key) => {
                                return { value: getBytes(key) };
                            }),
                        };
                    }) || [],
            },
        };

        if (this.signature && includeSignature) {
            protoTx.v = formatNumber(this.signature.yParity, 'yParity');
            protoTx.r = toBeArray(this.signature.r);
            protoTx.s = toBeArray(this.signature.s);
        }

        return protoTx;
    }

    /**
     * Create a **Transaction** from a serialized transaction or a Transaction-like object.
     *
     * @param {string | QuaiTransactionLike} tx - The transaction to decode.
     * @returns {QuaiTransaction} The decoded transaction.
     */
    static from(tx: string | QuaiTransactionLike): QuaiTransaction {
        if (typeof tx === 'string') {
            const decodedProtoTx: ProtoTransaction = decodeProtoTransaction(getBytes(tx));
            return QuaiTransaction.fromProto(decodedProtoTx);
        }

        const result = new QuaiTransaction(tx.from);
        if (tx.type != null) {
            result.type = tx.type;
        }
        if (tx.to != null) {
            validateAddress(tx.to);
            result.to = tx.to;
        }
        if (tx.nonce != null) {
            result.nonce = tx.nonce;
        }
        if (tx.gasLimit != null) {
            result.gasLimit = tx.gasLimit;
        }
        if (tx.minerTip != null) {
            result.minerTip = tx.minerTip;
        }
        if (tx.gasPrice != null) {
            result.gasPrice = tx.gasPrice;
        }
        if (tx.data != null && tx.data !== '') {
            result.data = tx.data;
        }
        if (tx.value != null) {
            result.value = tx.value;
        }
        if (tx.chainId != null) {
            result.chainId = tx.chainId;
        }
        if (tx.signature != null) {
            result.signature = Signature.from(tx.signature);
        }
        if (tx.accessList != null) {
            result.accessList = tx.accessList;
        }

        if (tx.hash != null) {
            assertArgument(result.isSigned(), 'unsigned transaction cannot define hash', 'tx', tx);
        }

        if (tx.from != null) {
            assertArgument(isQuaiAddress(tx.from), 'from address must be a Quai address', 'tx.from', tx.from);
            assertArgument(
                (result.from || '').toLowerCase() === (tx.from || '').toLowerCase(),
                'from mismatch',
                'tx',
                tx,
            );
            result.from = tx.from;
        }
        return result;
    }

    /**
     * Create a **Transaction** from a ProtoTransaction object.
     *
     * @param {ProtoTransaction} protoTx - The transaction to decode.
     * @returns {QuaiTransaction} The decoded transaction.
     */
    static fromProto(protoTx: ProtoTransaction): QuaiTransaction {
        //  TODO: Fix this because new tx instance requires a 'from' address
        let signature: null | Signature = null;
        let address: string = '';
        delete protoTx.etx_sender;
        delete protoTx.etx_index;
        delete protoTx.work_nonce;
        delete protoTx.etx_type;
        const protoTxCopy = deepCopyProtoTransaction(protoTx);

        if (protoTx.v && protoTx.r && protoTx.s) {
            // check if protoTx.r is zero
            if (protoTx.r.reduce((acc, val) => (acc += val), 0) == 0) {
                throw new Error('Proto decoding only supported for signed transactions');
            }
            const signatureFields = [hexlify(protoTx.v!), hexlify(protoTx.r!), hexlify(protoTx.s!)];
            signature = _parseSignature(signatureFields);

            delete protoTxCopy.v;
            delete protoTxCopy.r;
            delete protoTxCopy.s;
            delete protoTxCopy.signature;

            address = recoverAddress(keccak256(encodeProtoTransaction(protoTxCopy)), signature);
        }
        const tx = new QuaiTransaction(address);

        if (signature) {
            tx.signature = signature;
        }

        if (protoTx.to !== null) {
            const toAddr = hexlify(protoTx.to!);
            tx.to = getAddress(toAddr);
        }

        tx.type = protoTx.type;
        tx.chainId = toBigInt(protoTx.chain_id);
        tx.nonce = Number(protoTx.nonce);
        tx.minerTip = toBigInt(protoTx.miner_tip!);
        tx.gasPrice = toBigInt(protoTx.gas_price!);
        tx.gasLimit = toBigInt(protoTx.gas!);
        tx.value = protoTx.value !== null ? toBigInt(protoTx.value!) : BigInt(0);
        tx.data = hexlify(protoTx.data!);
        tx.accessList = protoTx.access_list!.access_tuples.map((tuple) => ({
            address: formatMixedCaseChecksumAddress(hexlify(tuple.address)),
            storageKeys: tuple.storage_key.map((key) => hexlify(key.value)),
        }));
        return tx;
    }
}

/**
 * Deeply copies a ProtoTransaction object.
 *
 * @param {ProtoTransaction} proto - The ProtoTransaction object to copy.
 * @returns {ProtoTransaction} The copied ProtoTransaction object.
 */
function deepCopyProtoTransaction(proto: ProtoTransaction): ProtoTransaction {
    if (proto == null) return proto;

    const copy: ProtoTransaction = {
        type: proto.type,
        chain_id: new Uint8Array(proto.chain_id),
        nonce: proto.nonce,
    };

    // Handle optional Uint8Array fields
    if (proto.to) copy.to = new Uint8Array(proto.to);
    if (proto.value) copy.value = new Uint8Array(proto.value);
    if (proto.data) copy.data = new Uint8Array(proto.data);
    if (proto.gas_price) copy.gas_price = new Uint8Array(proto.gas_price);
    if (proto.miner_tip) copy.miner_tip = new Uint8Array(proto.miner_tip);
    if (proto.v) copy.v = new Uint8Array(proto.v);
    if (proto.r) copy.r = new Uint8Array(proto.r);
    if (proto.s) copy.s = new Uint8Array(proto.s);
    if (proto.signature) copy.signature = new Uint8Array(proto.signature);
    if (proto.etx_sender) copy.etx_sender = new Uint8Array(proto.etx_sender);

    // Handle numeric fields
    if (proto.gas !== undefined) copy.gas = proto.gas;
    if (proto.etx_index !== undefined) copy.etx_index = proto.etx_index;
    if (proto.work_nonce !== undefined) copy.work_nonce = proto.work_nonce;
    if (proto.etx_type !== undefined) copy.etx_type = proto.etx_type;

    // Handle access list
    if (proto.access_list) {
        copy.access_list = {
            access_tuples: proto.access_list.access_tuples.map((tuple) => ({
                address: new Uint8Array(tuple.address),
                storage_key: tuple.storage_key.map((key) => ({
                    value: new Uint8Array(key.value),
                })),
            })),
        };
    }

    return copy;
}
