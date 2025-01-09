import {
    defineProperties,
    getBigInt,
    getNumber,
    hexlify,
    resolveProperties,
    assert,
    assertArgument,
    isError,
    makeError,
} from '../utils/index.js';
import { computeAddress } from '../address/index.js';
import { accessListify } from '../transaction/index.js';

import type { AddressLike } from '../address/index.js';
import type { BigNumberish, EventEmitterable } from '../utils/index.js';
import type { Signature } from '../crypto/index.js';
import type { AccessList, AccessListish } from '../transaction/index.js';

import type { ContractRunner } from '../contract/index.js';
import type { Network } from './network.js';
import type { Outpoint, OutpointDeltas, TxInputJson } from '../transaction/utxo.js';
import type { TxInput, TxOutput } from '../transaction/utxo.js';
import type { Zone, Shard } from '../constants/index.js';
import type { txpoolContentResponse, txpoolInspectResponse } from './txpool.js';
import { EtxParams, UncleParams } from './formatting.js';

const BN_0 = BigInt(0);

/**
 * A **BlockTag** specifies a specific block.
 *
 * **numeric value** - specifies the block height, where the genesis block is block 0; many operations accept a negative
 * value which indicates the block number should be deducted from the most recent block. A numeric value may be a
 * `number`, `bigint`, or a decimal of hex string.
 *
 * **blockhash** - specifies a specific block by its blockhash; this allows potentially orphaned blocks to be specifed,
 * without ambiguity, but many backends do not support this for some operations.
 *
 * @category Providers
 */
export type BlockTag = BigNumberish | string;

import {
    BlockHeaderParams,
    BlockParams,
    ExternalTransactionResponseParams,
    LogParams,
    QiTransactionResponseParams,
    QuaiTransactionResponseParams,
    TransactionReceiptParams,
    WoHeaderParams,
} from './formatting.js';
import { WorkObjectLike } from '../transaction/work-object.js';
import { QiTransactionLike } from '../transaction/qi-transaction.js';
import { QuaiTransactionLike } from '../transaction/quai-transaction.js';
import { toShard, toZone, ZeroAddress } from '../constants/index.js';
import { getZoneFromNodeLocation, getZoneForAddress } from '../utils/shards.js';
import { QiPerformActionTransaction } from './abstract-provider.js';

/**
 * Get the value if it is not null or undefined.
 *
 * @ignore
 * @param {undefined | null | T} value - The value to check.
 * @returns {null | T} The value if not null or undefined, otherwise null.
 */
function getValue<T>(value: undefined | null | T): null | T {
    if (value == null) {
        return null;
    }
    return value;
}

/**
 * Convert a value to a JSON-friendly string.
 *
 * @ignore
 * @param {null | bigint | string} value - The value to convert.
 * @returns {null | string} The JSON-friendly string or null.
 */
function toJson(value: null | bigint | string): null | string {
    if (value == null) {
        return null;
    }
    return value.toString();
}

/**
 * A **FeeData** wraps all the fee-related values associated with the network.
 *
 * @category Providers
 */
export class FeeData {
    /**
     * The gas price for legacy networks.
     */
    readonly gasPrice!: null | bigint;

    /**
     * The additional amount to pay per gas to encourage a validator to include the transaction.
     *
     * The purpose of this is to compensate the validator for the adjusted risk for including a given transaction.
     *
     * This will be `null` on legacy networks (i.e. [pre-EIP-1559](https://eips.ethereum.org/EIPS/eip-1559))
     */
    readonly minerTip!: null | bigint;

    /**
     * Creates a new FeeData for `gasPrice`, `gasPrice` and `minerTip`.
     *
     * @param {null | bigint} [gasPrice] - The gas price.
     * @param {null | bigint} [gasPrice] - The maximum fee per gas.
     * @param {null | bigint} [minerTip] - The maximum priority fee per gas.
     */
    constructor(gasPrice?: null | bigint, minerTip?: null | bigint) {
        defineProperties<FeeData>(this, {
            gasPrice: getValue(gasPrice),
            minerTip: getValue(minerTip),
        });
    }

    /**
     * Returns a JSON-friendly value.
     *
     * @returns {any} The JSON-friendly value.
     */
    toJSON(): any {
        const { gasPrice, minerTip } = this;
        return {
            _type: 'FeeData',
            gasPrice: toJson(gasPrice),
            minerTip: toJson(minerTip),
        };
    }
}

/**
 * Determines the address from a transaction request.
 *
 * @param {TransactionRequest} tx - The transaction request.
 * @returns {AddressLike} The address from the transaction request.
 * @throws {Error} If unable to determine the address.
 */
export function addressFromTransactionRequest(tx: TransactionRequest): AddressLike {
    if ('from' in tx && !!tx.from) {
        if (tx.from !== ZeroAddress) {
            return tx.from;
        }
    }
    if ('to' in tx && !!tx.to) {
        if (tx.to !== ZeroAddress) {
            return tx.to as AddressLike;
        }
    }

    if ('txInputs' in tx && !!tx.txInputs) {
        const inputs = tx.txInputs as TxInput[];
        return computeAddress(inputs[0].pubkey);
    }
    if ('txIn' in tx && !!tx.txIn) {
        const inputs = tx.txIn as TxInputJson[];
        return computeAddress(inputs[0].pubkey);
    }
    throw new Error('Unable to determine address from transaction inputs, from or to field');
}

/**
 * A **TransactionRequest** is a transactions with potentially various properties not defined, or with less strict types
 * for its values.
 *
 * This is used to pass to various operations, which will internally coerce any types and populate any necessary values.
 *
 * @category Providers
 */
export type TransactionRequest = QuaiTransactionRequest | QiTransactionRequest;

/**
 * A **QuaiTransactionRequest** is a Quai transaction with potentially various properties not defined, or with less
 * strict types for its values.
 *
 * @category Providers
 */
export interface QuaiTransactionRequest {
    /**
     * The transaction type. Quai transactions are always type 0.
     */
    type?: null | number;

    /**
     * The target of the transaction.
     */
    to?: null | AddressLike;

    /**
     * The sender of the transaction.
     */
    from: AddressLike;

    /**
     * The nonce of the transaction, used to prevent replay attacks.
     */
    nonce?: null | number;

    /**
     * The maximum amount of gas to allow this transaction to consume.
     */
    gasLimit?: null | BigNumberish;

    /**
     * The gas price to use for the transaction.
     */
    gasPrice?: null | BigNumberish;

    /**
     * The tip to paid directly to the miner of the transaction.
     */
    minerTip?: null | BigNumberish;

    /**
     * The transaction data.
     */
    data?: null | string;

    /**
     * The transaction value (in wei).
     */
    value?: null | BigNumberish;

    /**
     * The chain ID for the network this transaction is valid on.
     */
    chainId?: null | BigNumberish;

    /**
     * The [EIP-2930](https://eips.ethereum.org/EIPS/eip-2930) access list. Storage slots included in the access list
     * are warmed by pre-loading them, so their initial cost to fetch is guaranteed, but then each additional access is
     * cheaper.
     */
    accessList?: null | AccessListish;

    /**
     * A custom object, which can be passed along for network-specific values.
     */
    customData?: any;

    /**
     * When using `call` or `estimateGas`, this allows a specific block to be queried. Many backends do not support this
     * and when unsupported errors are silently squelched and `"latest"` is used.
     */
    blockTag?: BlockTag;
}

/**
 * A **QiTransactionRequest** is a Qi UTXO transaction with potentially various properties not defined, or with less
 * strict types for its values.
 *
 * @category Providers
 */
export interface QiTransactionRequest {
    /**
     * The transaction type.
     */
    type?: null | number;

    /**
     * The chain ID for the network this transaction is valid on.
     */
    chainId?: null | BigNumberish;

    /**
     * The inputs for the transaction.
     */
    txInputs?: null | Array<TxInput>;

    /**
     * The outputs for the transaction.
     */
    txOutputs?: null | Array<TxOutput>;
}

/**
 * A **PreparedTransactionRequest** is identical to a {@link TransactionRequest | **TransactionRequest**} except all the
 * property types are strictly enforced.
 *
 * @category Providers
 */
export type PreparedTransactionRequest = QuaiPreparedTransactionRequest | QiPreparedTransactionRequest;

/**
 * A **QuaiPreparedTransactionRequest** is a Quai transaction with potentially all properties strictly enforced.
 *
 * @category Providers
 */
export interface QuaiPreparedTransactionRequest {
    /**
     * The transaction type.
     */
    type?: number;

    /**
     * The target of the transaction.
     */
    to?: AddressLike;

    /**
     * The sender of the transaction.
     */
    from: AddressLike;

    /**
     * The nonce of the transaction, used to prevent replay attacks.
     */
    nonce?: number;

    /**
     * The maximum amount of gas to allow this transaction to consume.
     */
    gasLimit?: bigint;

    /**
     * The gas price to use for the transaction.
     */
    gasPrice?: bigint;

    /**
     * The fee paid directly to the miner of the transaction.
     */
    minerTip?: bigint;

    /**
     * The transaction data.
     */
    data?: string;

    /**
     * The transaction value (in wei).
     */
    value?: bigint;

    /**
     * The chain ID for the network this transaction is valid on.
     */
    chainId?: bigint;

    /**
     * The [EIP-2930](https://eips.ethereum.org/EIPS/eip-2930) access list. Storage slots included in the access list
     * are warmed by pre-loading them, so their initial cost to fetch is guaranteed, but then each additional access is
     * cheaper.
     */
    accessList?: AccessList;

    /**
     * A custom object, which can be passed along for network-specific values.
     */
    customData?: any;

    /**
     * When using `call` or `estimateGas`, this allows a specific block to be queried. Many backends do not support this
     * and when unsupported errors are silently squelched and `"latest"` is used.
     */
    blockTag?: BlockTag;
}

/**
 * A **QiPreparedTransactionRequest** is a Qi UTXO transaction with all properties strictly enforced.
 *
 * @category Providers
 */
export interface QiPreparedTransactionRequest {
    /**
     * The transaction type.
     */
    type?: number;

    /**
     * The chain ID for the network this transaction is valid on.
     */
    chainId?: bigint;

    /**
     * The inputs for the transaction.
     */
    txInputs?: null | Array<TxInput>;

    /**
     * The outputs for the transaction.
     */
    txOutputs?: null | Array<TxOutput>;
}

/**
 * Returns a copy of `req` with all properties coerced to their strict types.
 *
 * @category Providers
 * @param {TransactionRequest} req - The transaction request to copy.
 * @returns {PreparedTransactionRequest} The prepared transaction request.
 * @throws {Error} If the request is invalid.
 */
export function copyRequest(req: TransactionRequest): PreparedTransactionRequest {
    const result: any = {};

    // These could be addresses or Addressables
    if ('to' in req && req.to) {
        result.to = req.to;
    }
    if ('from' in req && req.from) {
        result.from = req.from;
    }

    if ('data' in req && req.data) {
        result.data = hexlify(req.data);
    }

    const bigIntKeys = 'chainId,gasLimit,gasPrice,minerTip,value'.split(/,/);
    for (const key of bigIntKeys) {
        if (!(key in req) || (<any>req)[key] == null) {
            continue;
        }
        result[key] = getBigInt((<any>req)[key], `request.${key}`);
    }

    const numberKeys = 'type,nonce'.split(/,/);
    for (const key of numberKeys) {
        if (!(key in req) || (<any>req)[key] == null) {
            continue;
        }
        result[key] = getNumber((<any>req)[key], `request.${key}`);
    }

    if ('accessList' in req && req.accessList) {
        result.accessList = accessListify(req.accessList);
    }

    if ('blockTag' in req) {
        result.blockTag = req.blockTag;
    }

    if ('customData' in req) {
        result.customData = req.customData;
    }

    if ('txInputs' in req && req.txInputs) {
        result.txInputs = req.txInputs.map((entry) => ({ ...entry }));
    }

    if ('txOutputs' in req && req.txOutputs) {
        result.txOutputs = req.txOutputs.map((entry) => ({ ...entry }));
    }

    return result;
}

/**
 * An Interface to indicate a {@link Block | **Block**} has been included in the blockchain. This asserts a Type Guard
 * that necessary properties are non-null.
 *
 * Before a block is included, it is a pending block.
 *
 * @category Providers
 */
export interface MinedBlock extends Block {}

/**
 * Represents the header of a block.
 *
 * @category Providers
 */
export class BlockHeader implements BlockHeaderParams {
    readonly baseFeePerGas!: null | bigint;
    readonly efficiencyScore: bigint;
    readonly etxEligibleSlices: string;
    readonly etxSetRoot: string;
    readonly evmRoot!: string;
    readonly expansionNumber: number;
    readonly etxRollupRoot!: string;
    readonly outboundEtxsRoot!: string;
    readonly extraData!: string;
    readonly gasLimit!: bigint;
    readonly gasUsed!: bigint;
    readonly interlinkRootHash: string;
    readonly manifestHash!: Array<string>;
    readonly number!: Array<number>;
    readonly parentDeltaEntropy!: Array<bigint>;
    readonly parentEntropy!: Array<bigint>;
    readonly parentHash!: Array<string>;
    readonly parentUncledDeltaEntropy: Array<bigint>;
    readonly primeTerminusHash: string;
    readonly quaiStateSize!: bigint;
    readonly receiptsRoot!: string;
    readonly uncleHash!: string;
    readonly size!: bigint;
    readonly stateLimit!: bigint;
    readonly stateUsed!: bigint;
    readonly thresholdCount: bigint;
    readonly transactionsRoot!: string;
    readonly uncledEntropy: bigint;
    readonly utxoRoot!: string;
    readonly exchangeRate!: bigint;
    readonly quaiToQi!: bigint;
    readonly qiToQuai!: bigint;
    readonly secondaryCoinbase!: string;

    constructor(params: BlockHeaderParams) {
        this.baseFeePerGas = params.baseFeePerGas;
        this.efficiencyScore = params.efficiencyScore;
        this.etxEligibleSlices = params.etxEligibleSlices;
        this.etxSetRoot = params.etxSetRoot;
        this.evmRoot = params.evmRoot;
        this.expansionNumber = params.expansionNumber;
        this.etxRollupRoot = params.etxRollupRoot;
        this.outboundEtxsRoot = params.outboundEtxsRoot;
        this.extraData = params.extraData;
        this.gasLimit = params.gasLimit;
        this.gasUsed = params.gasUsed;
        this.interlinkRootHash = params.interlinkRootHash;
        this.manifestHash = params.manifestHash;
        this.number = params.number;
        this.parentDeltaEntropy = params.parentDeltaEntropy;
        this.parentEntropy = params.parentEntropy;
        this.parentHash = params.parentHash;
        this.parentUncledDeltaEntropy = params.parentUncledDeltaEntropy;
        this.primeTerminusHash = params.primeTerminusHash;
        this.quaiStateSize = params.quaiStateSize;
        this.receiptsRoot = params.receiptsRoot;
        this.uncleHash = params.uncleHash;
        this.size = params.size;
        this.stateLimit = params.stateLimit;
        this.stateUsed = params.stateUsed;
        this.thresholdCount = params.thresholdCount;
        this.transactionsRoot = params.transactionsRoot;
        this.uncledEntropy = params.uncledEntropy;
        this.utxoRoot = params.utxoRoot;
        this.exchangeRate = params.exchangeRate;
        this.quaiToQi = params.quaiToQi;
        this.qiToQuai = params.qiToQuai;
        this.secondaryCoinbase = params.secondaryCoinbase;
    }

    toJSON(): BlockHeaderParams {
        return {
            ...this,
        };
    }
}

/**
 * Represents the header of a work object.
 *
 * @category Providers
 */
export class Uncle implements UncleParams {
    readonly primaryCoinbase: string;
    readonly difficulty!: string;
    readonly headerHash!: string;
    readonly location!: string;
    readonly mixHash!: string;
    readonly nonce!: string;
    readonly number!: number;
    readonly parentHash!: string;
    readonly timestamp!: string;
    readonly txHash!: string;
    readonly lock!: number;

    /**
     * Creates a new Uncle instance.
     *
     * @param {UncleParams} params - The parameters for the Uncle.
     */
    constructor(params: WoHeaderParams) {
        this.primaryCoinbase = params.primaryCoinbase;
        this.difficulty = params.difficulty;
        this.headerHash = params.headerHash;
        this.location = params.location;
        this.mixHash = params.mixHash;
        this.nonce = params.nonce;
        this.number = params.number;
        this.parentHash = params.parentHash;
        this.timestamp = params.timestamp;
        this.txHash = params.txHash;
        this.lock = params.lock;
    }

    toJSON(): WoHeaderParams {
        return {
            primaryCoinbase: this.primaryCoinbase,
            difficulty: this.difficulty,
            headerHash: this.headerHash,
            location: this.location,
            mixHash: this.mixHash,
            nonce: this.nonce,
            number: this.number,
            parentHash: this.parentHash,
            timestamp: this.timestamp,
            txHash: this.txHash,
            lock: this.lock,
        };
    }
}

/**
 * A **Block** represents the data associated with a full block on Ethereum.
 *
 * @category Providers
 */
export class Block implements BlockParams, Iterable<string> {
    readonly #outboundEtxs!: Array<string | ExternalTransactionResponse>;
    readonly hash: string;
    readonly header: BlockHeader;
    readonly interlinkHashes: Array<string>; // New parameter
    readonly size!: bigint;
    readonly subManifest!: Array<string>;
    readonly totalEntropy!: bigint;
    readonly #transactions!: Array<
        string | QuaiTransactionResponse | QiTransactionResponse | ExternalTransactionResponse
    >;
    readonly uncles!: Array<Uncle | string>;
    readonly woHeader: Uncle;
    readonly workShares!: Array<Uncle | string>;
    /**
     * The provider connected to the block used to fetch additional details if necessary.
     */
    readonly provider!: Provider;

    /**
     * Create a new **Block** object.
     *
     * This should generally not be necessary as the unless implementing a low-level library.
     *
     * @param {BlockParams} block - The block parameters.
     * @param {Provider} provider - The provider.
     */
    constructor(block: BlockParams, provider: Provider) {
        this.#transactions = block.transactions.map((tx) => {
            if (typeof tx === 'string') {
                return tx;
            }
            if ('originatingTxHash' in tx) {
                return new ExternalTransactionResponse(tx as ExternalTransactionResponseParams, provider);
            }
            if ('from' in tx) {
                return new QuaiTransactionResponse(tx, provider);
            }
            return new QiTransactionResponse(tx as QiTransactionResponseParams, provider);
        });

        this.#outboundEtxs = block.outboundEtxs.map((tx) => {
            if (typeof tx !== 'string') {
                return new ExternalTransactionResponse(tx, provider);
            }
            return tx;
        });

        this.hash = block.hash;
        this.header = new BlockHeader(block.header);
        this.interlinkHashes = block.interlinkHashes;
        this.size = block.size;
        this.subManifest = block.subManifest;
        this.totalEntropy = block.totalEntropy;
        this.uncles = block.uncles.map((uncle) => {
            if (typeof uncle === 'string') {
                return uncle;
            }
            return new Uncle(uncle);
        });
        this.woHeader = new Uncle(block.woHeader);
        this.workShares = block.workShares.map((workShare) => {
            if (typeof workShare === 'string') {
                return workShare;
            }
            return new Uncle(workShare);
        });
        this.provider = provider;
    }

    /**
     * Returns the list of transaction hashes, in the order they were executed within the block.
     *
     * @returns {ReadonlyArray<string>} The list of transaction hashes.
     */
    get transactions(): ReadonlyArray<string> {
        return this.#transactions.map((tx) => {
            if (typeof tx === 'string') {
                return tx;
            }
            return tx.hash;
        });
    }

    /**
     * Returns the list of extended transaction hashes, in the order they were executed within the block.
     *
     * @returns {ReadonlyArray<string>} The list of extended transaction hashes.
     */
    get outboundEtxs(): ReadonlyArray<string> {
        return this.#outboundEtxs.map((tx) => {
            if (typeof tx === 'string') {
                return tx;
            }
            return tx.hash;
        });
    }

    /**
     * Returns the complete transactions, in the order they were executed within the block.
     *
     * This is only available for blocks which prefetched transactions, by passing `true` to `prefetchTxs` into
     * {@link Provider.getBlock | **getBlock**}.
     *
     * @returns {TransactionResponse[]} The list of prefetched transactions.
     * @throws {Error} If the transactions were not prefetched.
     */
    get prefetchedTransactions(): Array<TransactionResponse> {
        const txs = this.#transactions.slice();

        // Doesn't matter...
        if (txs.length === 0) {
            return [];
        }

        // Make sure we prefetched the transactions
        assert(
            typeof txs[0] === 'object',
            'transactions were not prefetched with block request',
            'UNSUPPORTED_OPERATION',
            {
                operation: 'transactionResponses()',
            },
        );

        return <Array<TransactionResponse>>txs;
    }

    /**
     * Returns the complete extended transactions, in the order they were executed within the block.
     *
     * This is only available for blocks which prefetched transactions, by passing `true` to `prefetchTxs` into
     * {@link Provider.getBlock | **getBlock**}.
     *
     * @returns {TransactionResponse[]} The list of prefetched extended transactions.
     * @throws {Error} If the transactions were not prefetched.
     */
    get prefetchedExtTransactions(): Array<ExternalTransactionResponse> {
        const txs = this.#outboundEtxs.slice();

        // Doesn't matter...
        if (txs.length === 0) {
            return [];
        }

        // Make sure we prefetched the transactions
        assert(
            typeof txs[0] === 'object',
            'transactions were not prefetched with block request',
            'UNSUPPORTED_OPERATION',
            {
                operation: 'transactionResponses()',
            },
        );

        return <Array<ExternalTransactionResponse>>txs;
    }

    /**
     * Returns a JSON-friendly value.
     *
     * @returns {any} The JSON-friendly value.
     */
    toJSON(): BlockParams {
        const { hash, header, interlinkHashes, size, subManifest, totalEntropy, uncles, woHeader, workShares } = this;

        // Using getters to retrieve the transactions and extTransactions
        const transactions = this.transactions;
        const outboundEtxs = this.outboundEtxs;

        return {
            outboundEtxs, // Includes the extended transaction hashes or full transactions based on the prefetched data
            hash,
            header: header.toJSON(),
            interlinkHashes,
            transactions, // Includes the transaction hashes or full transactions based on the prefetched data
            size: size,
            subManifest,
            totalEntropy: totalEntropy,
            uncles: uncles.map((uncle) => {
                if (typeof uncle === 'string') {
                    return uncle;
                }
                return uncle.toJSON();
            }),
            woHeader: woHeader.toJSON(),
            workShares: workShares.map((workShare) => {
                if (typeof workShare === 'string') {
                    return workShare;
                }
                return workShare.toJSON();
            }),
        };
    }

    [Symbol.iterator](): Iterator<string> {
        let index = 0;
        const txs = this.transactions;
        return {
            next: () => {
                if (index < this.length) {
                    return {
                        value: txs[index++],
                        done: false,
                    };
                }
                return { value: undefined, done: true };
            },
        };
    }

    /**
     * The number of transactions in this block.
     *
     * @returns {number} The number of transactions.
     */
    get length(): number {
        return this.#transactions.length;
    }

    /**
     * The [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) this block was
     * included at.
     *
     * @returns {null | Date} The date this block was included at, or null if the timestamp is not available.
     */
    get date(): null | Date {
        const timestampHex = this.woHeader.timestamp;
        if (!timestampHex) {
            return null;
        }
        const timestamp = parseInt(timestampHex, 16);
        return new Date(timestamp * 1000);
    }

    /**
     * Get the transaction at `index` within this block.
     *
     * @param {number | string} indexOrHash - The index or hash of the transaction.
     * @returns {Promise<TransactionResponse>} A promise resolving to the transaction.
     * @throws {Error} If the transaction is not found.
     */
    async getTransaction(indexOrHash: number | string): Promise<TransactionResponse | ExternalTransactionResponse> {
        // Find the internal value by its index or hash
        let tx: string | TransactionResponse | ExternalTransactionResponse | undefined = undefined;
        if (typeof indexOrHash === 'number') {
            tx = this.#transactions[indexOrHash];
        } else {
            const hash = indexOrHash.toLowerCase();
            for (const v of this.#transactions) {
                if (typeof v === 'string') {
                    if (v !== hash) {
                        continue;
                    }
                    tx = v;
                    break;
                } else {
                    if (v.hash === hash) {
                        continue;
                    }
                    tx = v;
                    break;
                }
            }
        }
        if (tx == null) {
            throw new Error('no such tx');
        }

        if (typeof tx === 'string') {
            return <TransactionResponse>await this.provider.getTransaction(tx);
        } else {
            return tx;
        }
    }

    /**
     * Get the extended transaction at `index` within this block.
     *
     * @param {number | string} indexOrHash - The index or hash of the extended transaction.
     * @returns {Promise<TransactionResponse>} A promise resolving to the extended transaction.
     * @throws {Error} If the extended transaction is not found.
     */
    async getExtTransaction(indexOrHash: number | string): Promise<ExternalTransactionResponse> {
        // Find the internal value by its index or hash
        let tx: string | ExternalTransactionResponse | undefined = undefined;
        if (typeof indexOrHash === 'number') {
            tx = this.#outboundEtxs[indexOrHash];
        } else {
            const hash = indexOrHash.toLowerCase();
            for (const v of this.#outboundEtxs) {
                if (typeof v === 'string') {
                    if (v !== hash) {
                        continue;
                    }
                    tx = v;
                    break;
                } else {
                    if (v.hash === hash) {
                        continue;
                    }
                    tx = v;
                    break;
                }
            }
        }
        if (tx == null) {
            throw new Error('no such tx');
        }

        if (typeof tx === 'string') {
            throw new Error("External Transaction isn't prefetched");
        } else {
            return tx;
        }
    }

    /**
     * If a **Block** was fetched with a request to include the transactions this will allow synchronous access to those
     * transactions.
     *
     * If the transactions were not prefetched, this will throw.
     *
     * @param {number | string} indexOrHash - The index or hash of the transaction.
     * @returns {TransactionResponse} The transaction.
     * @throws {Error} If the transaction is not found.
     */
    getPrefetchedTransaction(indexOrHash: number | string): TransactionResponse {
        const txs = this.prefetchedTransactions;
        if (typeof indexOrHash === 'number') {
            return txs[indexOrHash];
        }

        indexOrHash = indexOrHash.toLowerCase();
        for (const tx of txs) {
            if (tx.hash === indexOrHash) {
                return tx;
            }
        }

        assertArgument(false, 'no matching transaction', 'indexOrHash', indexOrHash);
    }

    /**
     * Returns true if this block been mined. This provides a type guard for all properties on a
     * {@link MinedBlock | **MinedBlock**}.
     *
     * @returns {boolean} True if the block has been mined.
     */
    isMined(): this is MinedBlock {
        return !!this.hash;
    }

    /**
     * @ignore
     */
    orphanedEvent(): OrphanFilter {
        if (!this.isMined() || !this.woHeader.number) {
            throw new Error('');
        }
        return createOrphanedBlockFilter({
            hash: this.hash!,
            number: this.woHeader.number!,
        });
    }
}

//////////////////////
// Log

/**
 * A **Log** in Ethereum represents an event that has been included in a transaction using the `LOG*` opcodes, which are
 * most commonly used by Solidity's emit for announcing events.
 *
 * @category Providers
 */
export class Log implements LogParams {
    /**
     * The provider connected to the log used to fetch additional details if necessary.
     */
    readonly provider: Provider;

    /**
     * The transaction hash of the transaction this log occurred in. Use the
     * {@link Log.getTransaction | **Log.getTransaction**} to get the
     * {@link TransactionResponse | **TransactionResponse}.
     */
    readonly transactionHash!: string;

    /**
     * The block hash of the block this log occurred in. Use the {@link Log.getBlock | **Log.getBlock**} to get the
     * {@link Block | **Block**}.
     */
    readonly blockHash!: string;

    /**
     * The block number of the block this log occurred in. It is preferred to use the {@link Block.hash | **Block.hash**}
     * when fetching the related {@link Block | **Block**}, since in the case of an orphaned block, the block at that
     * height may have changed.
     */
    readonly blockNumber!: number;

    /**
     * If the **Log** represents a block that was removed due to an orphaned block, this will be true.
     *
     * This can only happen within an orphan event listener.
     */
    readonly removed!: boolean;

    /**
     * The address of the contract that emitted this log.
     */
    readonly address!: string;

    /**
     * The data included in this log when it was emitted.
     */
    readonly data!: string;

    /**
     * The indexed topics included in this log when it was emitted.
     *
     * All topics are included in the bloom filters, so they can be efficiently filtered using the
     * {@link Provider.getLogs | **Provider.getLogs**} method.
     */
    readonly topics!: ReadonlyArray<string>;

    /**
     * The index within the block this log occurred at. This is generally not useful to developers, but can be used with
     * the various roots to proof inclusion within a block.
     */
    readonly index!: number;

    /**
     * The index within the transaction of this log.
     */
    readonly transactionIndex!: number;

    /**
     * @ignore
     */
    constructor(log: LogParams, provider: Provider) {
        this.provider = provider;

        const topics = Object.freeze(log.topics.slice());
        defineProperties<Log>(this, {
            transactionHash: log.transactionHash,
            blockHash: log.blockHash,
            blockNumber: log.blockNumber,

            removed: log.removed,

            address: log.address,
            data: log.data,

            topics,

            index: log.index,
            transactionIndex: log.transactionIndex,
        });
    }

    /**
     * Returns a JSON-compatible object.
     */
    toJSON(): any {
        const { address, blockHash, blockNumber, data, index, removed, topics, transactionHash, transactionIndex } =
            this;

        return {
            _type: 'log',
            address,
            blockHash,
            blockNumber,
            data,
            index,
            removed,
            topics,
            transactionHash,
            transactionIndex,
        };
    }

    /**
     * Returns the block that this log occurred in.
     *
     * @param {Shard} shard - The shard to fetch the block from.
     * @returns {Promise<Block>} A promise resolving to the block.
     */
    async getBlock(shard: Shard): Promise<Block> {
        const block = await this.provider.getBlock(shard, this.blockHash);
        assert(!!block, 'failed to find transaction', 'UNKNOWN_ERROR', {});
        return block;
    }

    /**
     * Returns the transaction that this log occurred in.
     *
     * @returns {Promise<TransactionResponse>} A promise resolving to the transaction.
     */
    async getTransaction(): Promise<TransactionResponse> {
        const tx = await this.provider.getTransaction(this.transactionHash);
        assert(!!tx, 'failed to find transaction', 'UNKNOWN_ERROR', {});
        return tx as TransactionResponse;
    }

    /**
     * Returns the transaction receipt fot the transaction that this log occurred in.
     *
     * @returns {Promise<TransactionReceipt>} A promise resolving to the transaction receipt.
     */
    async getTransactionReceipt(): Promise<TransactionReceipt> {
        const receipt = await this.provider.getTransactionReceipt(this.transactionHash);
        assert(!!receipt, 'failed to find transaction receipt', 'UNKNOWN_ERROR', {});
        return receipt;
    }

    /**
     * @ignore
     */
    removedEvent(): OrphanFilter {
        return createRemovedLogFilter(this);
    }
}

//////////////////////
// Transaction Receipt

export function zoneFromHash(hash: string): Zone {
    return toZone(hash.slice(0, 4));
}

/**
 * A **TransactionReceipt** includes additional information about a transaction that is only available after it has been
 * mined.
 *
 * @category Providers
 */
export class TransactionReceipt implements TransactionReceiptParams, Iterable<Log> {
    /**
     * The provider connected to the log used to fetch additional details if necessary.
     */
    readonly provider!: Provider;

    /**
     * The address the transaction was sent to.
     */
    readonly to!: null | string;

    /**
     * The sender of the transaction.
     */
    readonly from!: string;

    /**
     * The address of the contract if the transaction was directly responsible for deploying one.
     *
     * This is non-null **only** if the `to` is empty and the `data` was successfully executed as initcode.
     */
    readonly contractAddress!: null | string;

    /**
     * The transaction hash.
     */
    readonly hash!: string;

    /**
     * The index of this transaction within the block transactions.
     */
    readonly index!: number;

    /**
     * The block hash of the {@link Block | **Block**} this transaction was included in.
     */
    readonly blockHash!: string;

    /**
     * The block number of the {@link Block | **Block**} this transaction was included in.
     */
    readonly blockNumber!: number;

    /**
     * The bloom filter bytes that represent all logs that occurred within this transaction. This is generally not
     * useful for most developers, but can be used to validate the included logs.
     */
    readonly logsBloom!: string;

    /**
     * The actual amount of gas used by this transaction.
     *
     * When creating a transaction, the amount of gas that will be used can only be approximated, but the sender must
     * pay the gas fee for the entire gas limit. After the transaction, the difference is refunded.
     */
    readonly gasUsed!: bigint;

    /**
     * The amount of gas used by all transactions within the block for this and all transactions with a lower `index`.
     *
     * This is generally not useful for developers but can be used to validate certain aspects of execution.
     */
    readonly cumulativeGasUsed!: bigint;

    /**
     * The actual gas price used during execution.
     *
     * Due to the complexity of [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) this value can only be caluclated
     * after the transaction has been mined, snce the base fee is protocol-enforced.
     */
    readonly gasPrice!: bigint;

    /**
     * The [EIP-2718](https://eips.ethereum.org/EIPS/eip-2718) transaction type.
     */
    readonly type!: number;
    //readonly byzantium!: boolean;

    /**
     * The status of this transaction, indicating success (i.e. `1`) or a revert (i.e. `0`).
     *
     * This is available in post-byzantium blocks, but some backends may backfill this value.
     */
    readonly status!: null | number;

    /**
     * The root hash of this transaction.
     *
     * This is no present and was only included in pre-byzantium blocks, but could be used to validate certain parts of
     * the receipt.
     */

    readonly #logs: ReadonlyArray<Log>;

    readonly outboundEtxs: ReadonlyArray<EtxParams> = [];

    readonly etxType?: null | number;

    readonly originatingTxHash?: null | string;

    /**
     * @ignore
     */
    constructor(tx: TransactionReceiptParams, provider: Provider) {
        this.#logs = Object.freeze(Array.isArray(tx.logs) ? tx.logs.map((log) => new Log(log, provider)) : []);

        let gasPrice = BN_0;
        if (tx.effectiveGasPrice != null) {
            gasPrice = tx.effectiveGasPrice;
        } else if (tx.gasPrice != null) {
            gasPrice = tx.gasPrice;
        }
        const outboundEtxs: EtxParams[] = tx.outboundEtxs
            ? tx.outboundEtxs.map((etx) => {
                  const safeConvert = (value: any, name: string) => {
                      try {
                          if (value != null) {
                              return BigInt(value);
                          }
                          return null;
                      } catch (error) {
                          console.error(`Conversion to BigInt failed for ${name}: ${value}, error: ${error}`);
                          return null;
                      }
                  };

                  return {
                      type: etx.type,
                      nonce: etx.nonce,
                      gasPrice: safeConvert(etx.gasPrice, 'gasPrice'),
                      minerTip: safeConvert(etx.minerTip, 'minerTip'),
                      gas: safeConvert(etx.gas, 'gas'),
                      value: safeConvert(etx.value, 'value'),
                      input: etx.input,
                      to: etx.to,
                      accessList: etx.accessList,
                      chainId: safeConvert(etx.chainId, 'chainId'),
                      from: etx.from,
                      hash: etx.hash,
                      originatingTxHash: etx.originatingTxHash,
                      etxIndex: etx.etxIndex,
                  };
              })
            : [];

        defineProperties<TransactionReceipt>(this, {
            provider,

            to: tx.to,
            from: tx.from,
            contractAddress: tx.contractAddress,

            hash: tx.hash,
            index: tx.index,

            blockHash: tx.blockHash,
            blockNumber: tx.blockNumber,

            logsBloom: tx.logsBloom,

            gasUsed: tx.gasUsed,
            cumulativeGasUsed: tx.cumulativeGasUsed,
            gasPrice,

            outboundEtxs: outboundEtxs,
            type: tx.type,
            status: tx.status,
            etxType: tx.etxType,
            originatingTxHash: tx.originatingTxHash,
        });
    }

    /**
     * The logs for this transaction.
     */
    get logs(): ReadonlyArray<Log> {
        return this.#logs;
    }

    /**
     * Returns a JSON-compatible representation.
     */
    toJSON(): any {
        const {
            to,
            from,
            contractAddress,
            hash,
            index,
            blockHash,
            blockNumber,
            logsBloom,
            logs, //byzantium,
            status,
            outboundEtxs,
        } = this;

        return {
            _type: 'TransactionReceipt',
            blockHash,
            blockNumber,
            contractAddress,
            cumulativeGasUsed: toJson(this.cumulativeGasUsed),
            from,
            gasPrice: toJson(this.gasPrice),
            gasUsed: toJson(this.gasUsed),
            hash,
            index,
            logs,
            logsBloom,
            status,
            to,
            outboundEtxs: outboundEtxs ?? [],
        };
    }

    /**
     * @ignore
     */
    get length(): number {
        return this.logs.length;
    }

    [Symbol.iterator](): Iterator<Log> {
        let index = 0;
        return {
            next: () => {
                if (index < this.length) {
                    return { value: this.logs[index++], done: false };
                }
                return { value: undefined, done: true };
            },
        };
    }

    /**
     * The total fee for this transaction, in wei.
     */
    get fee(): bigint {
        return this.gasUsed * this.gasPrice;
    }

    /**
     * Resolves to the block this transaction occurred in.
     *
     * @param {Shard} shard - The shard to fetch the block from.
     * @returns {Promise<Block>} A promise resolving to the block.
     * @throws {Error} If the block is not found.
     */
    async getBlock(shard: Shard): Promise<Block> {
        const block = await this.provider.getBlock(shard, this.blockHash);
        if (block == null) {
            throw new Error('TODO');
        }
        return block;
    }

    /**
     * Resolves to the transaction this transaction occurred in.
     *
     * @returns {Promise<TransactionResponse>} A promise resolving to the transaction.
     * @throws {Error} If the transaction is not found.
     */
    async getTransaction(): Promise<TransactionResponse | ExternalTransactionResponse> {
        const tx = await this.provider.getTransaction(this.hash);
        if (tx == null) {
            throw new Error('TODO');
        }
        return tx;
    }

    /**
     * Resolves to the return value of the execution of this transaction.
     *
     * Support for this feature is limited, as it requires an archive node with the `debug_` or `trace_` API enabled.
     *
     * @returns {Promise<string>} A promise resolving to the return value of the transaction.
     * @throws {Error} If the transaction is not found.
     */
    async getResult(): Promise<string> {
        return <string>await this.provider.getTransactionResult(this.hash);
    }

    /**
     * Resolves to the number of confirmations this transaction has.
     *
     * @returns {Promise<number>} A promise resolving to the number of confirmations.
     * @throws {Error} If the block is not found.
     */
    async confirmations(): Promise<number> {
        const zone = zoneFromHash(this.hash);
        return (await this.provider.getBlockNumber(toShard(zone))) - this.blockNumber + 1;
    }

    /**
     * @ignore
     */
    removedEvent(): OrphanFilter {
        return createRemovedTransactionFilter(this);
    }

    /**
     * @ignore
     */
    reorderedEvent(other?: TransactionResponse): OrphanFilter {
        assert(!other || other.isMined(), "unmined 'other' transction cannot be orphaned", 'UNSUPPORTED_OPERATION', {
            operation: 'reorderedEvent(other)',
        });
        return createReorderedTransactionFilter(this, other);
    }
}

//////////////////////
// Transaction Response

/**
 * A **MinedTransactionResponse** is an interface representing a transaction which has been mined and allows for a type
 * guard for its property values being defined.
 *
 * @category Providers
 */
export type MinedTransactionResponse = QuaiMinedTransactionResponse | QiMinedTransactionResponse;

/**
 * A **QuaiMinedTransactionResponse** is an interface representing Quai a transaction which has been mined.
 *
 * @category Providers
 */
export interface QuaiMinedTransactionResponse extends QuaiTransactionResponse {
    /**
     * The block number this transaction occurred in.
     */
    blockNumber: number;

    /**
     * The block hash this transaction occurred in.
     */
    blockHash: string;

    /**
     * The date this transaction occurred on.
     */
    date: Date;
}

/**
 * A **QiMinedTransactionResponse** is an interface representing Qi a transaction which has been mined.
 *
 * @category Providers
 */
export interface QiMinedTransactionResponse extends QiTransactionResponse {
    /**
     * The block number this transaction occurred in.
     */
    blockNumber: number;

    /**
     * The block hash this transaction occurred in.
     */
    blockHash: string;

    /**
     * The date this transaction occurred on.
     */
    date: Date;
}

export class ExternalTransactionResponse implements QuaiTransactionLike, ExternalTransactionResponseParams {
    /**
     * The provider this is connected to, which will influence how its methods will resolve its async inspection
     * methods.
     */
    readonly provider: Provider;

    /**
     * The block number of the block that this transaction was included in.
     *
     * This is `null` for pending transactions.
     */
    readonly blockNumber: null | number;

    /**
     * The blockHash of the block that this transaction was included in.
     *
     * This is `null` for pending transactions.
     */
    readonly blockHash: null | string;

    /**
     * The index within the block that this transaction resides at.
     */
    readonly index!: bigint;

    /**
     * The transaction hash.
     */
    readonly hash!: string;

    /**
     * The [EIP-2718](https://eips.ethereum.org/EIPS/eip-2718) transaction envelope type. This is `0` for legacy
     * transactions types.
     */
    readonly type!: number;

    /**
     * The receiver of this transaction.
     *
     * If `null`, then the transaction is an initcode transaction. This means the result of executing the
     * {@link ExternalTransactionResponse.data | **data** } will be deployed as a new contract on chain (assuming it does
     * not revert) and the address may be computed using [getCreateAddress](../functions/getCreateAddress).
     */
    readonly to!: null | string;

    /**
     * The sender of this transaction. It is implicitly computed from the transaction pre-image hash (as the digest) and
     * the {@link QuaiTransactionResponse.signature | **signature** } using ecrecover.
     */
    readonly from!: string;

    /**
     * The nonce, which is used to prevent replay attacks and offer a method to ensure transactions from a given sender
     * are explicitly ordered.
     *
     * When sending a transaction, this must be equal to the number of transactions ever sent by
     * {@link ExternalTransactionResponse.from | **from** }.
     */
    readonly nonce!: number;

    /**
     * The maximum units of gas this transaction can consume. If execution exceeds this, the entries transaction is
     * reverted and the sender is charged for the full amount, despite not state changes being made.
     */
    readonly gasLimit!: bigint;

    /**
     * The data.
     */
    readonly data!: string;

    /**
     * The value, in wei. Use [formatEther](../functions/formatEther) to format this value as ether.
     */
    readonly value!: bigint;

    /**
     * The chain ID.
     */
    readonly chainId!: bigint;

    /**
     * The signature.
     */
    readonly signature!: Signature;

    /**
     * The [EIP-2930](https://eips.ethereum.org/EIPS/eip-2930) access list for transaction types that support it,
     * otherwise `null`.
     */
    readonly accessList!: null | AccessList;

    readonly etxType!: null | number;

    readonly originatingTxHash!: null | string;

    readonly sender!: string;

    readonly etxIndex!: number;

    protected startBlock: number;

    /**
     * @ignore
     */
    constructor(tx: ExternalTransactionResponseParams, provider: Provider) {
        this.provider = provider;

        this.blockNumber = tx.blockNumber != null ? tx.blockNumber : null;
        this.blockHash = tx.blockHash != null ? tx.blockHash : null;

        this.hash = tx.hash;
        this.index = tx.index;

        this.type = tx.type;

        this.from = tx.from;
        this.to = tx.to || null;

        this.gasLimit = tx.gasLimit;
        this.nonce = tx.nonce;
        this.data = tx.data;
        this.value = tx.value;

        this.chainId = tx.chainId;
        this.signature = tx.signature;

        this.accessList = tx.accessList != null ? tx.accessList : null;
        this.startBlock = -1;
        this.originatingTxHash = tx.originatingTxHash != null ? tx.originatingTxHash : null;
        this.etxType = tx.etxType != null ? tx.etxType : null;
        this.etxIndex = tx.etxIndex;
    }

    /**
     * Returns a JSON-compatible representation of this transaction.
     */
    toJSON(): any {
        const {
            blockNumber,
            blockHash,
            index,
            hash,
            type,
            to,
            from,
            nonce,
            data,
            signature,
            accessList,
            etxType,
            originatingTxHash,
            etxIndex,
        } = this;
        const result = {
            _type: 'TransactionReceipt',
            accessList,
            blockNumber,
            blockHash,
            chainId: toJson(this.chainId),
            data,
            from,
            gasLimit: toJson(this.gasLimit),
            hash,
            nonce,
            signature,
            to,
            index,
            type,
            etxType,
            originatingTxHash,
            etxIndex,
            value: toJson(this.value),
        };

        return result;
    }

    replaceableTransaction(startBlock: number): ExternalTransactionResponse {
        assertArgument(Number.isInteger(startBlock) && startBlock >= 0, 'invalid startBlock', 'startBlock', startBlock);
        const tx = new ExternalTransactionResponse(this, this.provider);
        tx.startBlock = startBlock;
        return tx;
    }
}

/**
 * A **TransactionResponse** is an interface representing either a Quai or Qi transaction that has been mined into a
 * block.
 *
 * @category Providers
 */
export type TransactionResponse = QuaiTransactionResponse | QiTransactionResponse;

/**
 * A **QuaiTransactionResponse** includes all properties about a Quai transaction that was sent to the network, which
 * may or may not be included in a block.
 *
 * The {@link TransactionResponse.isMined | **TransactionResponse.isMined**} can be used to check if the transaction has
 * been mined as well as type guard that the otherwise possibly `null` properties are defined.
 *
 * @category Providers
 */
export class QuaiTransactionResponse implements QuaiTransactionLike, QuaiTransactionResponseParams {
    /**
     * The provider this is connected to, which will influence how its methods will resolve its async inspection
     * methods.
     */
    readonly provider: Provider;

    /**
     * The block number of the block that this transaction was included in.
     *
     * This is `null` for pending transactions.
     */
    readonly blockNumber: null | number;

    /**
     * The blockHash of the block that this transaction was included in.
     *
     * This is `null` for pending transactions.
     */
    readonly blockHash: null | string;

    /**
     * The index within the block that this transaction resides at.
     */
    readonly index!: bigint;

    /**
     * The transaction hash.
     */
    readonly hash!: string;

    /**
     * The [EIP-2718](https://eips.ethereum.org/EIPS/eip-2718) transaction envelope type. This is `0` for legacy
     * transactions types.
     */
    readonly type!: number;

    /**
     * The receiver of this transaction.
     *
     * If `null`, then the transaction is an initcode transaction. This means the result of executing the
     * {@link QuaiTransactionResponse.data | **data** } will be deployed as a new contract on chain (assuming it does not
     * revert) and the address may be computed using [getCreateAddress](../functions/getCreateAddress).
     */
    readonly to!: null | string;

    /**
     * The sender of this transaction. It is implicitly computed from the transaction pre-image hash (as the digest) and
     * the {@link QuaiTransactionResponse.signature | **signature** } using ecrecover.
     */
    readonly from!: string;

    /**
     * The nonce, which is used to prevent replay attacks and offer a method to ensure transactions from a given sender
     * are explicitly ordered.
     *
     * When sending a transaction, this must be equal to the number of transactions ever sent by
     * {@link QuaiTransactionResponse.from | **from** }.
     */
    readonly nonce!: number;

    /**
     * The maximum units of gas this transaction can consume. If execution exceeds this, the entries transaction is
     * reverted and the sender is charged for the full amount, despite not state changes being made.
     */
    readonly gasLimit!: bigint;

    /**
     * The maximum priority fee (per unit of gas) to allow a validator to charge the sender. This is inclusive of the
     * {@link QuaiTransactionResponse.gasPrice | **gasPrice** }.
     */
    readonly minerTip!: null | bigint;

    /**
     * The maximum fee (per unit of gas) to allow this transaction to charge the sender.
     */
    readonly gasPrice!: null | bigint;

    /**
     * The data.
     */
    readonly data!: string;

    /**
     * The value, in wei. Use [formatEther](../functions/formatEther) to format this value as ether.
     */
    readonly value!: bigint;

    /**
     * The chain ID.
     */
    readonly chainId!: bigint;

    /**
     * The signature.
     */
    readonly signature!: Signature;

    /**
     * The [EIP-2930](https://eips.ethereum.org/EIPS/eip-2930) access list for transaction types that support it,
     * otherwise `null`.
     */
    readonly accessList!: null | AccessList;

    readonly etxType!: null | number;

    readonly sender!: null | string;

    readonly originatingTxHash!: null | string;

    protected startBlock: number;

    /**
     * @ignore
     */
    constructor(tx: QuaiTransactionResponseParams, provider: Provider) {
        this.provider = provider;

        this.blockNumber = tx.blockNumber != null ? tx.blockNumber : null;
        this.blockHash = tx.blockHash != null ? tx.blockHash : null;

        this.hash = tx.hash;
        this.index = tx.index;

        this.type = tx.type;

        this.from = tx.from;
        this.to = tx.to || null;

        this.gasLimit = tx.gasLimit;
        this.nonce = tx.nonce;
        this.data = tx.data;
        this.value = tx.value;

        this.minerTip = tx.minerTip != null ? tx.minerTip : null;
        this.gasPrice = tx.gasPrice != null ? tx.gasPrice : null;

        this.chainId = tx.chainId;
        this.signature = tx.signature;

        this.accessList = tx.accessList != null ? tx.accessList : null;
        this.startBlock = -1;

        this.etxType = tx.etxType != null ? tx.etxType : null;
    }

    /**
     * Returns a JSON-compatible representation of this transaction.
     */
    toJSON(): any {
        const { blockNumber, blockHash, index, hash, type, to, from, nonce, data, signature, accessList } = this;
        const result = {
            _type: 'TransactionReceipt',
            accessList,
            blockNumber,
            blockHash,
            chainId: toJson(this.chainId),
            data,
            from,
            gasLimit: toJson(this.gasLimit),
            hash,
            gasPrice: toJson(this.gasPrice),
            minerTip: toJson(this.minerTip),
            nonce,
            signature,
            to,
            index,
            type,
            value: toJson(this.value),
        };

        return result;
    }

    /**
     * Resolves to the Block that this transaction was included in.
     *
     * This will return null if the transaction has not been included yet.
     *
     * @param {Shard} shard - The shard to fetch the block from.
     * @returns {null | Promise<Block>} A promise resolving to the block.
     */
    async getBlock(shard: Shard): Promise<null | Block> {
        let blockNumber = this.blockNumber;
        if (blockNumber == null) {
            const tx = await this.getTransaction();
            if (tx) {
                blockNumber = tx.blockNumber;
            }
        }
        if (blockNumber == null) {
            return null;
        }
        const block = this.provider.getBlock(shard, blockNumber);
        if (block == null) {
            throw new Error('TODO');
        }
        return block;
    }

    /**
     * Resolves to this transaction being re-requested from the provider. This can be used if you have an unmined
     * transaction and wish to get an up-to-date populated instance.
     *
     * @returns {null | Promise<TransactionResponse>} A promise resolving to the transaction, or null if not found.
     */
    async getTransaction(): Promise<null | QuaiTransactionResponse> {
        const transaction = this.provider.getTransaction(this.hash);
        if (transaction instanceof QuaiTransactionResponse) {
            return transaction as QuaiTransactionResponse;
        } else {
            return null;
        }
    }

    /**
     * Resolve to the number of confirmations this transaction has.
     *
     * @returns {Promise<number>} A promise resolving to the number of confirmations.
     * @throws {Error} If the block is not found.
     */
    async confirmations(): Promise<number> {
        const zone = zoneFromHash(this.hash);
        if (this.blockNumber == null) {
            const { tx, blockNumber } = await resolveProperties({
                tx: this.getTransaction(),
                blockNumber: this.provider.getBlockNumber(toShard(zone)),
            });

            // Not mined yet...
            if (tx == null || tx.blockNumber == null) {
                return 0;
            }

            return blockNumber - tx.blockNumber + 1;
        }

        const blockNumber = await this.provider.getBlockNumber(toShard(zone));
        return blockNumber - this.blockNumber + 1;
    }

    /**
     * Resolves once this transaction has been mined and has `confirms` blocks including it (default: `1`) with an
     * optional `timeout`.
     *
     * This can resolve to `null` only if `confirms` is `0` and the transaction has not been mined, otherwise this will
     * wait until enough confirmations have completed.
     *
     * @param {number} [_confirms] - The number of confirmations to wait for.
     * @param {number} [_timeout] - The number of milliseconds to wait before rejecting.
     * @returns {Promise<null | TransactionReceipt>} A promise resolving to the transaction receipt.
     * @throws {Error} If the transaction was replaced, repriced, or cancelled.
     */
    async wait(_confirms?: number, _timeout?: number): Promise<null | TransactionReceipt> {
        const confirms = _confirms == null ? 1 : _confirms;
        const timeout = _timeout == null ? 0 : _timeout;

        let startBlock = this.startBlock;
        let nextScan = -1;
        let stopScanning = startBlock === -1 ? true : false;
        const zone = zoneFromHash(this.hash);
        const checkReplacement = async () => {
            // Get the current transaction count for this sender
            if (stopScanning) {
                return null;
            }
            const { blockNumber, nonce } = await resolveProperties({
                blockNumber: this.provider.getBlockNumber(toShard(zone)),
                nonce: this.provider.getTransactionCount(this.from),
            });

            // No transaction or our nonce has not been mined yet; but we
            // can start scanning later when we do start
            if (nonce < this.nonce) {
                startBlock = blockNumber;
                return;
            }

            // We were mined; no replacement
            if (stopScanning) {
                return null;
            }
            const mined = await this.getTransaction();
            if (mined && mined.blockNumber != null) {
                return;
            }

            // We were replaced; start scanning for that transaction

            // Starting to scan; look back a few extra blocks for safety
            if (nextScan === -1) {
                nextScan = startBlock - 3;
                if (nextScan < this.startBlock) {
                    nextScan = this.startBlock;
                }
            }

            while (nextScan <= blockNumber) {
                // Get the next block to scan
                if (stopScanning) {
                    return null;
                }
                const block = await this.provider.getBlock(toShard(zone), nextScan, true);

                // This should not happen; but we'll try again shortly
                if (block == null) {
                    return;
                }

                // We were mined; no replacement
                for (const hash of block) {
                    if (hash === this.hash) {
                        return;
                    }
                }

                // Search for the transaction that replaced us
                for (let i = 0; i < block.length; i++) {
                    const tx: TransactionResponse | ExternalTransactionResponse = await block.getTransaction(i);

                    if ('from' in tx && tx.from === this.from && tx.nonce === this.nonce) {
                        // Get the receipt
                        if (stopScanning) {
                            return null;
                        }
                        const receipt = await this.provider.getTransactionReceipt(tx.hash);

                        // This should not happen; but we'll try again shortly
                        if (receipt == null) {
                            return;
                        }

                        // We will retry this on the next block (this case could be optimized)
                        if (blockNumber - receipt.blockNumber + 1 < confirms) {
                            return;
                        }

                        // The reason we were replaced
                        let reason: 'replaced' | 'repriced' | 'cancelled' = 'replaced';
                        if (tx.data === this.data && tx.to === this.to && tx.value === this.value) {
                            reason = 'repriced';
                        } else if (tx.data === '0x' && tx.from === tx.to && tx.value === BN_0) {
                            reason = 'cancelled';
                        }

                        assert(false, 'transaction was replaced', 'TRANSACTION_REPLACED', {
                            cancelled: reason === 'replaced' || reason === 'cancelled',
                            reason,
                            replacement: tx.replaceableTransaction(startBlock),
                            hash: (tx as QuaiTransactionResponse).hash,
                            receipt,
                        });
                    }
                }

                nextScan++;
            }
            return;
        };

        const checkReceipt = (receipt: null | TransactionReceipt) => {
            if (receipt == null || receipt.status !== 0) {
                return receipt;
            }
            assert(false, 'transaction execution reverted', 'CALL_EXCEPTION', {
                action: 'sendTransaction',
                data: null,
                reason: null,
                invocation: null,
                revert: null,
                transaction: {
                    to: receipt.to,
                    from: receipt.from,
                    data: '', // @TODO: in v7, split out sendTransaction properties
                },
                receipt,
            });
        };

        const receipt = await this.provider.getTransactionReceipt(this.hash);

        if (confirms === 0) {
            return checkReceipt(receipt);
        }

        if (receipt) {
            if ((await receipt.confirmations()) >= confirms) {
                return checkReceipt(receipt);
            }
        } else {
            // Check for a replacement; throws if a replacement was found
            await checkReplacement();

            // Allow null only when the confirms is 0
            if (confirms === 0) {
                return null;
            }
        }

        const waiter = new Promise((resolve, reject) => {
            // List of things to cancel when we have a result (one way or the other)
            const cancellers: Array<() => void> = [];
            const cancel = () => {
                cancellers.forEach((c) => c());
            };

            // On cancel, stop scanning for replacements
            cancellers.push(() => {
                stopScanning = true;
            });

            // Set up any timeout requested
            if (timeout > 0) {
                const timer = setTimeout(() => {
                    cancel();
                    reject(makeError('wait for transaction timeout', 'TIMEOUT'));
                }, timeout);
                cancellers.push(() => {
                    clearTimeout(timer);
                });
            }

            const txListener = async (receipt: TransactionReceipt) => {
                // Done; return it!
                if ((await receipt.confirmations()) >= confirms) {
                    cancel();
                    try {
                        resolve(checkReceipt(receipt));
                    } catch (error) {
                        reject(error);
                    }
                }
            };
            cancellers.push(() => {
                this.provider.off(this.hash, txListener);
            });
            this.provider.on(this.hash, txListener);
            // We support replacement detection; start checking
            if (startBlock >= 0) {
                const replaceListener = async () => {
                    try {
                        // Check for a replacement; this throws only if one is found
                        await checkReplacement();
                    } catch (error) {
                        // We were replaced (with enough confirms); re-throw the error
                        if (isError(error, 'TRANSACTION_REPLACED')) {
                            cancel();
                            reject(error);
                            return;
                        }
                    }

                    // Rescheudle a check on the next block
                    if (!stopScanning) {
                        this.provider.once('block', replaceListener, zone);
                    }
                };
                cancellers.push(() => {
                    this.provider.off('block', replaceListener, zone);
                });
                this.provider.once('block', replaceListener, zone);
            }
        });

        return await (<Promise<TransactionReceipt>>waiter);
    }

    /**
     * Returns `true` if this transaction has been included.
     *
     * This is effective only as of the time the TransactionResponse was instantiated. To get up-to-date information,
     * use {@link QuaiTransactionResponse.getTransaction | **getTransaction**}.
     *
     * This provides a Type Guard that this transaction will have non-null property values for properties that are null
     * for unmined transactions.
     *
     * @returns {QuaiMinedTransactionResponse} True if the transaction has been mined.
     * @throws {Error} If the transaction was replaced, repriced, or cancelled.
     */
    isMined(): this is QuaiMinedTransactionResponse {
        return this.blockHash != null;
    }

    /**
     * Returns a filter which can be used to listen for orphan events that evict this transaction.
     *
     * @returns {OrphanFilter} The orphan filter.
     */
    removedEvent(): OrphanFilter {
        assert(this.isMined(), 'unmined transaction canot be orphaned', 'UNSUPPORTED_OPERATION', {
            operation: 'removeEvent()',
        });
        return createRemovedTransactionFilter(this);
    }

    /**
     * Returns a filter which can be used to listen for orphan events that re-order this event against `other`.
     *
     * @param {TransactionResponse} [other] - The other transaction to compare against.
     * @returns {OrphanFilter} The orphan filter.
     */
    reorderedEvent(other?: TransactionResponse): OrphanFilter {
        assert(this.isMined(), 'unmined transaction canot be orphaned', 'UNSUPPORTED_OPERATION', {
            operation: 'removeEvent()',
        });

        assert(!other || other.isMined(), "unmined 'other' transaction canot be orphaned", 'UNSUPPORTED_OPERATION', {
            operation: 'removeEvent()',
        });

        return createReorderedTransactionFilter(this, other);
    }

    /**
     * Returns a new TransactionResponse instance which has the ability to detect (and throw an error) if the
     * transaction is replaced, which will begin scanning at `startBlock`.
     *
     * This should generally not be used by developers and is intended primarily for internal use. Setting an incorrect
     * `startBlock` can have devastating performance consequences if used incorrectly.
     *
     * @param {number} startBlock - The block number to start scanning for replacements.
     * @returns {QuaiTransactionResponse} The replaceable transaction.
     */
    replaceableTransaction(startBlock: number): QuaiTransactionResponse {
        assertArgument(Number.isInteger(startBlock) && startBlock >= 0, 'invalid startBlock', 'startBlock', startBlock);
        const tx = new QuaiTransactionResponse(this, this.provider);
        tx.startBlock = startBlock;
        return tx;
    }
}

/**
 * A **QiTransactionResponse** includes all properties about a Qi transaction that was sent to the network, which may or
 * may not be included in a block.
 *
 * The {@link TransactionResponse.isMined | **TransactionResponse.isMined**} can be used to check if the transaction has
 * been mined as well as type guard that the otherwise possibly `null` properties are defined.
 *
 * @category Providers
 */
export class QiTransactionResponse implements QiTransactionLike, QiTransactionResponseParams {
    /**
     * The provider this is connected to, which will influence how its methods will resolve its async inspection
     * methods.
     */
    readonly provider: Provider;

    /**
     * The block number of the block that this transaction was included in.
     *
     * This is `null` for pending transactions.
     */
    readonly blockNumber: null | number;

    /**
     * The blockHash of the block that this transaction was included in.
     *
     * This is `null` for pending transactions.
     */
    readonly blockHash: null | string;

    /**
     * The index within the block that this transaction resides at.
     */
    readonly index!: bigint;

    /**
     * The transaction hash.
     */
    readonly hash!: string;

    /**
     * The [EIP-2718](https://eips.ethereum.org/EIPS/eip-2718) transaction envelope type. This is `0` for legacy
     * transactions types.
     */
    readonly type!: number;

    /**
     * The chain ID.
     */
    readonly chainId!: bigint;

    /**
     * The signature.
     */
    readonly signature!: string;

    readonly txInputs?: Array<TxInput>;

    readonly txOutputs?: Array<TxOutput>;

    protected startBlock: number;
    /**
     * @ignore
     */
    constructor(tx: QiTransactionResponseParams, provider: Provider) {
        this.provider = provider;

        this.blockNumber = tx.blockNumber != null ? tx.blockNumber : null;
        this.blockHash = tx.blockHash != null ? tx.blockHash : null;

        this.hash = tx.hash;
        this.index = tx.index;

        this.type = tx.type;

        this.chainId = tx.chainId;
        this.signature = tx.signature;

        this.startBlock = -1;

        this.txInputs = tx.txInputs;
        this.txOutputs = tx.txOutputs;
    }

    /**
     * Returns a JSON-compatible representation of this transaction.
     */
    toJSON(): any {
        const { blockNumber, blockHash, index, hash, type, signature, txInputs, txOutputs } = this;
        const result = {
            _type: 'TransactionReceipt',
            blockNumber,
            blockHash,
            chainId: toJson(this.chainId),
            hash,
            signature,
            index,
            type,
            txInputs: JSON.parse(JSON.stringify(txInputs)),
            txOutputs: JSON.parse(JSON.stringify(txOutputs)),
        };

        return result;
    }

    /**
     * Resolves to the Block that this transaction was included in.
     *
     * This will return null if the transaction has not been included yet.
     *
     * @param {Shard} shard - The shard to fetch the block from.
     * @returns {null | Promise<Block>} A promise resolving to the block or null if not found.
     */
    async getBlock(shard: Shard): Promise<null | Block> {
        let blockNumber = this.blockNumber;
        if (blockNumber == null) {
            const tx = await this.getTransaction();
            if (tx) {
                blockNumber = tx.blockNumber;
            }
        }
        if (blockNumber == null) {
            return null;
        }
        const block = this.provider.getBlock(shard, blockNumber);
        if (block == null) {
            throw new Error('TODO');
        }
        return block;
    }

    /**
     * Resolves to this transaction being re-requested from the provider. This can be used if you have an unmined
     * transaction and wish to get an up-to-date populated instance.
     *
     * @returns {null | Promise<TransactionResponse>} A promise resolving to the transaction, or null if not found.
     * @throws {Error} If the transaction is not found.
     */
    async getTransaction(): Promise<null | QiTransactionResponse> {
        const transaction = this.provider.getTransaction(this.hash);
        if (transaction instanceof QiTransactionResponse) {
            return transaction as QiTransactionResponse;
        } else {
            return null;
        }
    }

    /**
     * Resolve to the number of confirmations this transaction has.
     *
     * @returns {Promise<number>} A promise resolving to the number of confirmations.
     */
    async confirmations(): Promise<number> {
        const zone = zoneFromHash(this.hash);
        if (this.blockNumber == null) {
            const { tx, blockNumber } = await resolveProperties({
                tx: this.getTransaction(),
                blockNumber: this.provider.getBlockNumber(toShard(zone)),
            });

            // Not mined yet...
            if (tx == null || tx.blockNumber == null || tx.blockHash == null) {
                return 0;
            }

            return blockNumber - tx.blockNumber + 1;
        }

        const blockNumber = await this.provider.getBlockNumber(toShard(zone));
        return blockNumber - this.blockNumber + 1;
    }

    async wait(_confirms?: number, _timeout?: number): Promise<null | QiTransactionResponse> {
        const confirms = _confirms == null ? 1 : _confirms;
        const timeout = _timeout == null ? 0 : _timeout;

        const tx = await this.provider.getTransaction(this.hash);

        if (confirms === 0 && tx?.blockHash != null) {
            return tx as QiTransactionResponse;
        }

        const waiter = new Promise((resolve, reject) => {
            // List of things to cancel when we have a result (one way or the other)
            const cancellers: Array<() => void> = [];
            const cancel = () => {
                cancellers.forEach((c) => c());
            };

            // Set up any timeout requested
            if (timeout > 0) {
                const timer = setTimeout(() => {
                    cancel();
                    reject(makeError('wait for transaction timeout', 'TIMEOUT'));
                }, timeout);
                cancellers.push(() => {
                    clearTimeout(timer);
                });
            }

            const txListener = async (tx: QiTransactionResponse) => {
                // Done; return it!
                if ((await tx.confirmations()) >= confirms) {
                    cancel();
                    try {
                        resolve(tx);
                    } catch (error) {
                        reject(error);
                    }
                }
            };
            cancellers.push(() => {
                this.provider.off(this.hash, txListener);
            });
            this.provider.on(this.hash, txListener);
        });

        return await (<Promise<QiTransactionResponse>>waiter);
    }

    /**
     * Returns `true` if this transaction has been included.
     *
     * This is effective only as of the time the TransactionResponse was instantiated. To get up-to-date information,
     * use {@link QiTransactionResponse.getTransaction | **getTransaction**}.
     *
     * This provides a Type Guard that this transaction will have non-null property values for properties that are null
     * for unmined transactions.
     *
     * @returns {QiMinedTransactionResponse} True if the transaction has been mined or false otherwise.
     */
    isMined(): this is QiMinedTransactionResponse {
        return this.blockHash != null;
    }

    /**
     * Returns a filter which can be used to listen for orphan events that evict this transaction.
     *
     * @returns {OrphanFilter} The orphan filter.
     */
    removedEvent(): OrphanFilter {
        assert(this.isMined(), 'unmined transaction canot be orphaned', 'UNSUPPORTED_OPERATION', {
            operation: 'removeEvent()',
        });
        return createRemovedTransactionFilter(this);
    }

    /**
     * Returns a filter which can be used to listen for orphan events that re-order this event against `other`.
     *
     * @param {TransactionResponse} [other] - The other transaction to compare against.
     * @returns {OrphanFilter} The orphan filter.
     */
    reorderedEvent(other?: TransactionResponse): OrphanFilter {
        assert(this.isMined(), 'unmined transaction canot be orphaned', 'UNSUPPORTED_OPERATION', {
            operation: 'removeEvent()',
        });

        assert(!other || other.isMined(), "unmined 'other' transaction canot be orphaned", 'UNSUPPORTED_OPERATION', {
            operation: 'removeEvent()',
        });

        return createReorderedTransactionFilter(this, other);
    }

    /**
     * Returns a new TransactionResponse instance which has the ability to detect (and throw an error) if the
     * transaction is replaced, which will begin scanning at `startBlock`.
     *
     * This should generally not be used by developers and is intended primarily for internal use. Setting an incorrect
     * `startBlock` can have devastating performance consequences if used incorrectly.
     *
     * @param {number} startBlock - The block number to start scanning for replacements.
     * @returns {QiTransactionResponse} The replaceable transaction.
     */
    replaceableTransaction(startBlock: number): QiTransactionResponse {
        assertArgument(Number.isInteger(startBlock) && startBlock >= 0, 'invalid startBlock', 'startBlock', startBlock);
        const tx = new QiTransactionResponse(this, this.provider);
        tx.startBlock = startBlock;
        return tx;
    }
}

//////////////////////
// OrphanFilter

/**
 * An Orphan Filter allows detecting when an orphan block has resulted in dropping a block or transaction or has
 * resulted in transactions changing order.
 *
 * Not currently fully supported.
 *
 * @category Providers
 */
export type OrphanFilter =
    | {
          orphan: 'drop-block';
          hash: string;
          number: number;
      }
    | {
          orphan: 'drop-transaction';
          tx: { hash: string; blockHash: string; blockNumber: number };
          other?: { hash: string; blockHash: string; blockNumber: number };
      }
    | {
          orphan: 'reorder-transaction';
          tx: { hash: string; blockHash: string; blockNumber: number };
          other?: { hash: string; blockHash: string; blockNumber: number };
      }
    | {
          orphan: 'drop-log';
          log: {
              transactionHash: string;
              blockHash: string;
              blockNumber: number;
              address: string;
              data: string;
              topics: ReadonlyArray<string>;
              index: number;
          };
      };

function createOrphanedBlockFilter(block: { hash: string; number: number }): OrphanFilter {
    return { orphan: 'drop-block', hash: block.hash, number: block.number };
}

function createReorderedTransactionFilter(
    tx: { hash: string; blockHash: string; blockNumber: number },
    other?: { hash: string; blockHash: string; blockNumber: number },
): OrphanFilter {
    return { orphan: 'reorder-transaction', tx, other };
}

function createRemovedTransactionFilter(tx: { hash: string; blockHash: string; blockNumber: number }): OrphanFilter {
    return { orphan: 'drop-transaction', tx };
}

function createRemovedLogFilter(log: {
    blockHash: string;
    transactionHash: string;
    blockNumber: number;
    address: string;
    data: string;
    topics: ReadonlyArray<string>;
    index: number;
}): OrphanFilter {
    return {
        orphan: 'drop-log',
        log: {
            transactionHash: log.transactionHash,
            blockHash: log.blockHash,
            blockNumber: log.blockNumber,
            address: log.address,
            data: log.data,
            topics: Object.freeze(log.topics.slice()),
            index: log.index,
        },
    };
}

//////////////////////
// EventFilter

export type NodeLocation = number[];

/**
 * A **TopicFilter** provides a struture to define bloom-filter queries.
 *
 * Each field that is `null` matches **any** value, a field that is a `string` must match exactly that value and and
 * `array` is effectively an `OR`-ed set, where any one of those values must match.
 *
 * @category Providers
 */
export type TopicFilter = Array<null | string | Array<string>>;

// @TODO:
//export type DeferableTopicFilter = Array<null | string | Promise<string> | Array<string | Promise<string>>>;

/**
 * An **EventFilter** allows efficiently filtering logs (also known as events) using bloom filters included within
 * blocks.
 *
 * @category Providers
 */
export interface EventFilter {
    address?: AddressLike | Array<AddressLike>;
    topics?: TopicFilter;
    nodeLocation?: NodeLocation;
}

export type AccessesType = 'block' | 'balance';

/**
 * An **AccessesFilter** allows efficiently filtering accesses (state uses) using address.
 *
 * @category Providers
 */
export interface AccessesFilter {
    type: AccessesType;
    address: AddressLike;
}

/**
 * A **Filter** allows searching a specific range of blocks for mathcing logs.
 *
 * @category Providers
 */
export interface Filter extends EventFilter {
    /**
     * The start block for the filter (inclusive).
     */
    fromBlock?: BlockTag;

    /**
     * The end block for the filter (inclusive).
     */
    toBlock?: BlockTag;
}

/**
 * A **FilterByBlockHash** allows searching a specific block for mathcing logs.
 *
 * @category Providers
 */
export interface FilterByBlockHash extends EventFilter {
    /**
     * The blockhash of the specific block for the filter.
     */
    blockHash?: string;
    zone: Zone;
}

export function getZoneFromEventFilter(filter: EventFilter): Zone | null {
    let zone: Zone | null = null;
    if (filter.nodeLocation) {
        zone = getZoneFromNodeLocation(filter.nodeLocation);
    } else if (filter.address) {
        let address: string;
        if (Array.isArray(filter.address)) {
            address = filter.address[0] as string;
        } else {
            address = filter.address as string;
        }
        const addressZone = getZoneForAddress(address);
        if (addressZone) {
            zone = toZone(addressZone);
        } else {
            return null;
        }
    }
    return zone;
}

//////////////////////
// ProviderEvent

/**
 * A **ProviderEvent** provides the types of events that can be subscribed to on a {@link Provider| **Provider**}.
 *
 * Each provider may include additional possible events it supports, but the most commonly supported are:
 *
 * **`"block"`** - calls the listener with the current block number on each new block.
 *
 * **`"error"`** - calls the listener on each async error that occurs during the event loop, with the error.
 *
 * **`"debug"`** - calls the listener on debug events, which can be used to troubleshoot network errors, provider
 * problems, etc.
 *
 * **`transaction hash`** - calls the listener on each block after the transaction has been mined; generally `.once` is
 * more appropriate for this event.
 *
 * **`Array`** - calls the listener on each log that matches the filter.
 *
 * {@link EventFilter | **EventFilter**} - calls the listener with each matching log
 *
 * @category Providers
 */
export type ProviderEvent = string | Array<string | Array<string>> | EventFilter | OrphanFilter | AccessesFilter;

//////////////////////
// Provider

/**
 * A **Provider** is the primary method to interact with the read-only content on Ethereum.
 *
 * It allows access to details about accounts, blocks and transactions and the ability to query event logs and simulate
 * contract execution.
 *
 * Account data includes the {@link Provider.getBalance | **balance**},
 * {@link Provider.getTransactionCount | **getTransactionCount**}, {@link Provider.getCode | **code**} and
 * {@link Provider.getStorage | **state trie storage**}.
 *
 * Simulating execution can be used to {@link Provider.call | **call**}, {@link Provider.estimateGas | **estimateGas**}
 * and {@link Provider.getTransactionResult | **get transaction result**}.
 *
 * The {@link Provider.broadcastTransaction | **broadcastTransaction**} is the only method which allows updating the
 * blockchain, but it is usually accessed by a [Signer](../interfaces/Signer), since a private key must be used to sign
 * the transaction before it can be broadcast.
 *
 * @category Providers
 */
export interface Provider extends ContractRunner, EventEmitterable<ProviderEvent> {
    /**
     * The provider iteself.
     *
     * This is part of the necessary API for executing a contract, as it provides a common property on any
     * {@link ContractRunner | **ContractRunner**} that can be used to access the read-only portion of the runner.
     */
    provider: this;

    /**
     * Shutdown any resources this provider is using. No additional calls should be made to this provider after calling
     * this.
     */
    destroy(): void;

    ////////////////////
    // State

    /**
     * Get the current block number.
     *
     * @param {Shard} shard - The shard to fetch the block number from.
     * @returns {Promise<number>} A promise resolving to the block number.
     */
    getBlockNumber(shard: Shard): Promise<number>;

    /**
     * Get the connected {@link Network | **Network**}.
     *
     * @param {Shard} shard - The shard to fetch the network from.
     * @returns {Promise<Network>} A promise resolving to the network.
     */
    getNetwork(): Promise<Network>;

    /**
     * Get the best guess at the recommended {@link FeeData | **FeeData**}.
     *
     * @param {Zone} zone - The shard to fetch the fee data from.
     * @param {boolean} txType - The transaction type to fetch the fee data for (true for Quai, false for Qi)
     * @returns {Promise<FeeData>} A promise resolving to the fee data.
     */
    getFeeData(zone: Zone, txType: boolean): Promise<FeeData>;

    /**
     * Get a work object to package a transaction in.
     *
     * @returns {Promise<WorkObjectLike>} A promise resolving to the work object.
     */
    getPendingHeader(): Promise<WorkObjectLike>;

    ////////////////////
    // Account

    /**
     * Get the account balance (in wei) of `address`. If `blockTag` is specified and the node supports archive access
     * for that `blockTag`, the balance is as of that {@link BlockTag | **BlockTag**}.
     *
     * @param {AddressLike} address - The address to fetch the balance for.
     * @param {BlockTag} [blockTag] - The block tag to fetch the balance from.
     * @returns {Promise<bigint>} A promise resolving to the balance.
     * @note On nodes without archive access enabled, the `blockTag` may be
     *  **silently ignored** by the node, which may cause issues if relied on.
     */
    getBalance(address: AddressLike, blockTag?: BlockTag): Promise<bigint>;

    /**
     * Get the locked balance for `address`.
     *
     * @param {AddressLike} address - The address to fetch the locked balance for.
     * @returns {Promise<bigint>} A promise resolving to the locked balance.
     */
    getLockedBalance(address: AddressLike): Promise<bigint>;

    /**
     * Get the UTXO entries for `address`.
     *
     * @param {AddressLike} address - The address to fetch the UTXO entries for.
     * @returns {Promise<Outpoint[]>} A promise resolving to the UTXO entries.
     * @note On nodes without archive access enabled, the `blockTag` may be
     *  **silently ignored** by the node, which may cause issues if relied on.
     */
    getOutpointsByAddress(address: AddressLike): Promise<Array<Outpoint>>;

    /**
     * Get the number of transactions ever sent for `address`, which is used as the `nonce` when sending a transaction.
     * If `blockTag` is specified and the node supports archive access for that `blockTag`, the transaction count is as
     * of that {@link BlockTag | **BlockTag**}.
     *
     * @param {AddressLike} address - The address to fetch the transaction count for.
     * @param {BlockTag} [blockTag] - The block tag to fetch the transaction count from.
     * @returns {Promise<number>} A promise resolving to the transaction count.
     * @note On nodes without archive access enabled, the `blockTag` may be
     *  **silently ignored** by the node, which may cause issues if relied on.
     */
    getTransactionCount(address: AddressLike, blockTag?: BlockTag): Promise<number>;

    /**
     * Get the bytecode for `address`.
     *
     * @param {AddressLike} address - The address to fetch the code for.
     * @param {BlockTag} [blockTag] - The block tag to fetch the code from.
     * @returns {Promise<string>} A promise resolving to the code stored at the address.
     * @note On nodes without archive access enabled, the `blockTag` may be
     *  **silently ignored** by the node, which may cause issues if relied on.
     */
    getCode(address: AddressLike, blockTag?: BlockTag): Promise<string>;

    /**
     * Get the storage slot value for `address` at slot `position`.
     *
     * @param {AddressLike} address - The address to fetch the storage from.
     * @param {BigNumberish} position - The position to fetch the storage from.
     * @param {BlockTag} [blockTag] - The block tag to fetch the storage from.
     * @returns {Promise<string>} A promise resolving to the storage value.
     * @note On nodes without archive access enabled, the `blockTag` may be
     *  **silently ignored** by the node, which may cause issues if relied on.
     */
    getStorage(address: AddressLike, position: BigNumberish, blockTag?: BlockTag): Promise<string>;

    ////////////////////
    // Execution

    /**
     * Estimates the amount of gas required to executre `tx`.
     *
     * @param {TransactionRequest} tx - The transaction to estimate the gas for.
     * @returns {Promise<bigint>} A promise resolving to the estimated gas.
     * @throws {Error} If the transaction execution reverts.
     */
    estimateGas(tx: TransactionRequest): Promise<bigint>;

    /**
     * Estimate the fee for a Qi transaction.
     *
     * @param {QiPerformActionTransaction} tx - The transaction to estimate the fee for.
     * @returns {Promise<bigint>} A promise resolving to the estimated fee.
     */
    estimateFeeForQi(tx: QiPerformActionTransaction): Promise<bigint>;

    /**
     * Required for populating access lists for state mutating calls
     *
     * @param tx
     * @returns {Promise<AccessList>}
     */
    createAccessList(tx: QuaiTransactionRequest): Promise<AccessList>;

    /**
     * Simulate the execution of `tx`. If the call reverts, it will throw a
     * [CallExceptionError](../interfaces/CallExceptionError) which includes the revert data.
     *
     * @param {TransactionRequest} tx - The transaction to simulate.
     * @returns {Promise<string>} A promise resolving to the result of the execution.
     * @throws {Error} If the transaction execution reverts.
     */
    call(tx: TransactionRequest): Promise<string>;

    /**
     * Broadcasts the `signedTx` to the network, adding it to the memory pool of any node for which the transaction
     * meets the rebroadcast requirements.
     *
     * @param {Zone} zone - The zone to broadcast the transaction to.
     * @param {string} signedTx - The signed transaction to broadcast.
     * @param {AddressLike} [from] - The address that signed the transaction.
     * @returns {Promise<TransactionResponse>} A promise resolving to the transaction response.
     * @throws {Error} If the transaction is invalid or the transaction is replaced.
     */
    broadcastTransaction(zone: Zone, signedTx: string, from?: AddressLike): Promise<TransactionResponse>;

    ////////////////////
    // Queries

    /**
     * Resolves to the block for `blockHashOrBlockTag`.
     *
     * If `prefetchTxs`, and the backend supports including transactions with block requests, all transactions will be
     * included and the {@link Block | **Block**} object will not need to make remote calls for getting transactions.
     *
     * @param {Shard} shard - The shard to fetch the block from.
     * @param {BlockTag | string} blockHashOrBlockTag - The block hash or block tag to fetch.
     * @param {boolean} [prefetchTxs] - If true, prefetch the transactions.
     * @returns {Promise<null | Block>} A promise resolving to the block or null if not found.
     * @throws {Error} If the block is not found.
     */
    getBlock(shard: Shard, blockHashOrBlockTag: BlockTag | string, prefetchTxs?: boolean): Promise<null | Block>;

    /**
     * Resolves to the transaction for `hash`.
     *
     * If the transaction is unknown or on pruning nodes which discard old transactions this resolves to `null`.
     *
     * @param {string} hash - The transaction hash to fetch.
     * @returns {Promise<null | TransactionResponse>} A promise resolving to the transaction or null if not found.
     */
    getTransaction(hash: string): Promise<null | TransactionResponse | ExternalTransactionResponse>;

    /**
     * Resolves to the transaction receipt for `hash`, if mined.
     *
     * If the transaction has not been mined, is unknown or on pruning nodes which discard old transactions this
     * resolves to `null`.
     *
     * @param {string} hash - The transaction hash to fetch the receipt for.
     * @returns {Promise<null | TransactionReceipt>} A promise resolving to the transaction receipt or null if not
     *   found.
     */
    getTransactionReceipt(hash: string): Promise<null | TransactionReceipt>;

    /**
     * Resolves to the result returned by the executions of `hash`.
     *
     * This is only supported on nodes with archive access and with the necessary debug APIs enabled.
     *
     * @param {string} hash - The transaction hash to fetch the result for.
     * @returns {Promise<null | string>} A promise resolving to the result or null if not found.
     */
    getTransactionResult(hash: string): Promise<null | string>;

    ////////////////////
    // Bloom-filter Queries

    /**
     * Resolves to the list of Logs that match `filter`
     *
     * @param {Filter} filter - The filter to apply.
     * @returns {Promise<Log[]>} A promise resolving to the logs.
     */
    getLogs(filter: Filter | FilterByBlockHash): Promise<Array<Log>>;

    /**
     * Waits until the transaction `hash` is mined and has `confirms` confirmations.
     *
     * @param {string} hash - The transaction hash to wait for.
     * @param {number} [confirms] - The number of confirmations to wait for.
     * @param {number} [timeout] - The number of milliseconds to wait before timing out.
     * @returns {Promise<null | TransactionReceipt>} A promise resolving to the transaction receipt or null if not
     *   found.
     */
    waitForTransaction(hash: string, confirms?: number, timeout?: number): Promise<null | TransactionReceipt>;

    /**
     * Resolves to the block at `blockTag` once it has been mined.
     *
     * This can be useful for waiting some number of blocks by using the `currentBlockNumber + N`.
     *
     * @param {Shard} shard - The shard to fetch the block from.
     * @param {BlockTag} [blockTag] - The block tag to fetch.
     * @returns {Promise<Block>} A promise resolving to the block.
     */
    waitForBlock(shard: Shard, blockTag?: BlockTag): Promise<Block>;

    /**
     * Resolves to the number indicating the size of the network
     *
     * @returns {Promise<number>} A promise resolving to the current network size.
     */
    getProtocolExpansionNumber(): Promise<number>;

    /**
     * Resolves to the current content of the transaction pool.
     *
     * @returns {Promise<txpoolContentResponse>} A promise resolving to the transaction pool content.
     */
    getTxPoolContent(zone: Zone): Promise<txpoolContentResponse>;

    /**
     * Resolves to the current content of the transaction pool.
     *
     * @returns {Promise<txpoolInspectResponse>} A promise resolving to the transaction pool inspect.
     */
    txPoolInspect(zone: Zone): Promise<txpoolInspectResponse>;

    /**
     * Resolves to the current Quai rate for the given amount.
     *
     * @param {bigint} amt - The amount in quais to get the rate for.
     * @returns {Promise<bigint>} A promise resolving to the latest Quai rate.
     */
    getQiRateAtBlock(zone: Zone, blockTag: BlockTag, amt: bigint): Promise<bigint>;

    /**
     * Resolves to the current Quai rate for the given amount.
     *
     * @param {bigint} amt - The amount in quais to get the rate for.
     * @returns {Promise<bigint>} A promise resolving to the latest Quai rate.
     */
    getLatestQiRate(zone: Zone, amt: bigint): Promise<bigint>;

    /**
     * Resolves to the current Quai rate for the given amount.
     *
     * @param {bigint} amt - The amount in quais to get the rate for.
     * @returns {Promise<bigint>} A promise resolving to the latest Quai rate.
     */
    getQuaiRateAtBlock(zone: Zone, blockTag: BlockTag, amt: bigint): Promise<bigint>;

    /**
     * Resolves to the current Quai rate for the given amount.
     *
     * @param {bigint} amt - The amount in quai to get the rate for.
     * @returns {Promise<bigint>} A promise resolving to the latest Quai->Qi rate.
     */
    getLatestQuaiRate(zone: Zone, amt: bigint): Promise<bigint>;

    getOutpointDeltas(addresses: string[], startHash: string, endHash?: string): Promise<OutpointDeltas>;
}
