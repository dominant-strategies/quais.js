import { keccak256 } from '../crypto/index.js';
import { AbstractTransaction, TransactionLike, TxInput, TxOutput } from './index.js';
import { assertArgument, getBytes, getZoneForAddress, hexlify, isQiAddress, toBigInt } from '../utils/index.js';
import { decodeProtoTransaction } from '../encoding/index.js';
import { formatNumber } from '../providers/format.js';
import { computeAddress } from '../address/index.js';
import { ProtoTransaction } from './abstract-transaction.js';
import { Zone } from '../constants/index.js';

/**
 * @category Transaction
 * @todo Write documentation for this interface.
 */
export interface QiTransactionLike extends TransactionLike {
    /**
     * @todo Write documentation for this property.
     */
    txInputs?: null | TxInput[];

    /**
     * @todo Write documentation for this property.
     */
    txOutputs?: null | TxOutput[];
}

/**
 * @category Transaction
 * @todo Write documentation for this class.
 *
 * @todo Write documentation for the properties of this class.
 */
export class QiTransaction extends AbstractTransaction<string> implements QiTransactionLike {
    #txInputs?: null | TxInput[];
    #txOutputs?: null | TxOutput[];

    get txInputs(): TxInput[] {
        return (this.#txInputs ?? []).map((entry) => ({ ...entry }));
    }
    set txInputs(value: TxInput[] | null) {
        if (!Array.isArray(value)) {
            throw new Error('txInputs must be an array');
        }
        this.#txInputs = value.map((entry) => ({ ...entry }));
    }
    get txOutputs(): TxOutput[] {
        return (this.#txOutputs ?? []).map((output) => ({ ...output }));
    }
    set txOutputs(value: TxOutput[] | null) {
        if (!Array.isArray(value)) {
            throw new Error('txOutputs must be an array');
        }
        this.#txOutputs = value.map((output) => ({ ...output }));
    }

    /**
     * The permuted hash of the transaction as specified by
     * [QIP-0010](https://github.com/quai-network/qips/blob/master/qip-0010.md).
     */
    get hash(): null | string {
        if (this.signature == null) {
            return null;
        }

        if (this.txInputs.length < 1 || this.txOutputs.length < 1) {
            throw new Error('Transaction must have at least one input and one output');
        }

        const pubKey = hexlify(this.txInputs[0].pubkey);
        const senderAddr = computeAddress(pubKey || '');

        if (!this.destZone || !this.originZone) {
            throw new Error(
                `Invalid zones: origin ${this.originZone} ->  destination ${this.destZone} (address: ${senderAddr})`,
            );
        }

        const isSameLedger = isQiAddress(senderAddr) === isQiAddress(hexlify(this.txOutputs[0].address) || '');
        if (this.isExternal && !isSameLedger) {
            throw new Error('Cross-zone & cross-ledger transactions are not supported');
        }

        const hexString = this.serialized.startsWith('0x') ? this.serialized.substring(2) : this.serialized;
        const dataBuffer = Buffer.from(hexString, 'hex');

        const hashHex = keccak256(dataBuffer);
        const hashBuffer = Buffer.from(hashHex.substring(2), 'hex');

        const origin = this.originZone ? parseInt(this.originZone.slice(2), 16) : 0;
        hashBuffer[0] = origin;
        hashBuffer[1] |= 0x80;
        hashBuffer[2] = origin;
        hashBuffer[3] |= 0x80;

        return '0x' + hashBuffer.toString('hex');
    }

    /**
     * The zone of the sender address
     */
    get originZone(): Zone | undefined {
        const pubKey = hexlify(this.txInputs[0].pubkey);
        const senderAddr = computeAddress(pubKey || '');

        const zone = getZoneForAddress(senderAddr);
        return zone ?? undefined;
    }

    /**
     * The zone of the recipient address
     */
    get destZone(): Zone | undefined {
        const zone = getZoneForAddress(this.txOutputs[0].address);
        return zone ?? undefined;
    }

    /**
     * Creates a new Transaction with default values.
     */
    constructor() {
        super();
        this.#txInputs = [];
        this.#txOutputs = [];
    }

    /**
     * Validates the explicit properties and returns a list of compatible transaction types.
     *
     * @returns {number[]} The compatible transaction types.
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
     * Create a copy of this transaciton.
     *
     * @returns {QiTransaction} The cloned transaction.
     */
    clone(): QiTransaction {
        return QiTransaction.from(this);
    }

    /**
     * Return a JSON-friendly object.
     *
     * @returns {QiTransactionLike} The JSON-friendly object.
     */
    toJSON(): TransactionLike {
        const s = (v: null | bigint) => {
            if (v == null) {
                return null;
            }
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
     * Return a protobuf-friendly JSON object.
     *
     * @returns {ProtoTransaction} The protobuf-friendly JSON object.
     */
    toProtobuf(includeSignature: boolean = true): ProtoTransaction {
        const protoTx: ProtoTransaction = {
            type: this.type || 2,
            chain_id: formatNumber(this.chainId || 0, 'chainId'),
            tx_ins: {
                tx_ins: this.txInputs.map((input) => ({
                    previous_out_point: {
                        hash: { value: getBytes(input.txhash) },
                        index: input.index,
                    },
                    pub_key: getBytes(input.pubkey),
                })),
            },
            tx_outs: {
                tx_outs: this.txOutputs.map((output) => ({
                    address: getBytes(output.address),
                    denomination: output.denomination,
                })),
            },
        };

        if (this.signature && includeSignature) {
            protoTx.signature = getBytes(this.signature);
        }

        return protoTx;
    }

    /**
     * Create a **Transaction** from a serialized transaction or a Transaction-like object.
     *
     * @param {string | QiTransactionLike} tx - The transaction to decode.
     *
     * @returns {QiTransaction} The decoded transaction.
     */
    static from(tx: string | QiTransactionLike): QiTransaction {
        if (typeof tx === 'string') {
            const decodedProtoTx: ProtoTransaction = decodeProtoTransaction(getBytes(tx));
            return QiTransaction.fromProto(decodedProtoTx);
        }

        const result = new QiTransaction();
        if (tx.type != null) {
            result.type = tx.type;
        }
        if (tx.chainId != null) {
            result.chainId = tx.chainId;
        }
        if (tx.signature != null) {
            result.signature = tx.signature as string;
        }
        if (tx.txInputs != null) {
            result.txInputs = tx.txInputs as TxInput[];
        }
        if (tx.txOutputs != null) {
            result.txOutputs = tx.txOutputs as TxOutput[];
        }

        if (tx.hash != null) {
            assertArgument(result.isSigned(), 'unsigned transaction cannot define hash', 'tx', tx);
        }

        return result;
    }

    /**
     * Create a **Transaction** from a ProtoTransaction object.
     *
     * @param {ProtoTransaction} protoTx - The transaction to decode.
     * @param {Uint8Array} [payload] - The serialized transaction.
     *
     * @returns {QiTransaction} The decoded transaction.
     */
    static fromProto(protoTx: ProtoTransaction): QiTransaction {
        const tx = new QiTransaction();

        tx.type = protoTx.type;
        tx.chainId = toBigInt(protoTx.chain_id);

        if (protoTx.type == 2) {
            tx.txInputs =
                protoTx.tx_ins?.tx_ins.map((input) => ({
                    txhash: hexlify(input.previous_out_point.hash.value),
                    index: input.previous_out_point.index,
                    pubkey: hexlify(input.pub_key),
                })) ?? [];
            tx.txOutputs =
                protoTx.tx_outs?.tx_outs.map((output) => ({
                    address: hexlify(output.address),
                    denomination: output.denomination,
                })) ?? [];
        }

        if (protoTx.signature) {
            tx.signature = hexlify(protoTx.signature);
        }

        return tx;
    }
}
