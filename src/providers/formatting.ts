import type { Signature } from '../crypto/index.js';
import type { AccessList, TxInput, TxOutput } from '../transaction/index.js';

//////////////////////
// Block

/**
 * A **BlockParams** encodes the minimal required properties for a formatted block.
 *
 * @category Providers
 */
export interface BlockParams {
    extTransactions: ReadonlyArray<string | QuaiTransactionResponseParams>;
    interlinkHashes: Array<string>; // New parameter
    order: number;
    size: bigint;
    subManifest: Array<string> | null;
    totalEntropy: bigint;
    transactions: ReadonlyArray<string | QuaiTransactionResponseParams>;
    uncles: Array<string> | null;
    woBody: WoBodyParams; // New nested parameter structure
    woHeader: WoHeaderParams; // New nested parameter structure
}

export interface WoBodyParams {
    extTransactions: Array<string | QuaiTransactionResponseParams>;
    header: WoBodyHeaderParams;
    interlinkHashes: Array<string>;
    manifest: Array<string>;
    transactions: Array<string | QuaiTransactionResponseParams>;
    uncles: Array<string>;
}

export interface WoBodyHeaderParams {
    baseFeePerGas: null | bigint;
    efficiencyScore: bigint;
    etxEligibleSlices: string;
    etxSetRoot: string;
    evmRoot: string;
    expansionNumber: number;
    extRollupRoot: string;
    extTransactionsRoot: string;
    extraData: string;
    gasLimit: bigint;
    gasUsed: bigint;
    hash: null | string;
    interlinkRootHash: string;
    manifestHash: Array<string>;
    miner: string;
    mixHash: string;
    nonce: string;
    number: Array<string>;
    parentDeltaS: Array<bigint>;
    parentEntropy: Array<bigint>;
    parentHash: Array<string>;
    parentUncledS: Array<bigint | null>;
    parentUncledSubDeltaS: Array<bigint>;
    primeTerminus: string;
    receiptsRoot: string;
    sha3Uncles: string;
    size: bigint;
    thresholdCount: bigint;
    transactionsRoot: string;
    uncledS: bigint;
    utxoRoot: string;
}

export interface WoHeaderParams {
    difficulty: string;
    headerHash: string;
    location: string;
    mixHash: string;
    nonce: string;
    number: string;
    parentHash: string;
    time: string;
    txHash: string;
}

//////////////////////
// Log

/**
 * A **LogParams** encodes the minimal required properties for a formatted log.
 *
 * @category Providers
 */
export interface LogParams {
    /**
     * The transaction hash for the transaxction the log occurred in.
     */
    transactionHash: string;

    /**
     * The block hash of the block that included the transaction for this log.
     */
    blockHash: string;

    /**
     * The block number of the block that included the transaction for this log.
     */
    blockNumber: number;

    /**
     * Whether this log was removed due to the transaction it was included in being removed dur to an orphaned block.
     */
    removed: boolean;

    /**
     * The address of the contract that emitted this log.
     */
    address: string;

    /**
     * The data emitted with this log.
     */
    data: string;

    /**
     * The topics emitted with this log.
     */
    topics: ReadonlyArray<string>;

    /**
     * The index of this log.
     */
    index: number;

    /**
     * The transaction index of this log.
     */
    transactionIndex: number;
}

//////////////////////
//Etx within a transaction receipt for and internal to external transaction

/**
 * @category Providers
 * @todo Write documentation for this interface.
 */
export interface EtxParams {
    /**
     * @todo Write documentation for this property.
     */
    type: number;

    /**
     * @todo Write documentation for this property.
     */
    nonce: number;

    /**
     * @todo Write documentation for this property.
     */
    gasPrice: null | bigint;

    /**
     * @todo Write documentation for this property.
     */
    maxPriorityFeePerGas: bigint;

    /**
     * @todo Write documentation for this property.
     */
    maxFeePerGas: bigint;

    /**
     * @todo Write documentation for this property.
     */
    gas: bigint;

    /**
     * @todo Write documentation for this property.
     */
    value: bigint;

    /**
     * @todo Write documentation for this property.
     */
    input: string;

    /**
     * @todo Write documentation for this property.
     */
    to: null | string;

    /**
     * @todo Write documentation for this property.
     */
    accessList: null | AccessList;

    /**
     * @todo Write documentation for this property.
     */
    chainId: null | bigint;

    /**
     * @todo Write documentation for this property.
     */
    from: null | string;

    /**
     * @todo Write documentation for this property.
     */
    hash: string;
}

// Transaction Receipt
/**
 * A **TransactionReceiptParams** encodes the minimal required properties for a formatted transaction receipt.
 *
 * @category Providers
 */
export interface TransactionReceiptParams {
    /**
     * The target of the transaction. If null, the transaction was trying to deploy a transaction with the `data` as the
     * initi=code.
     */
    to: null | string;

    /**
     * The sender of the transaction.
     */
    from: string;

    /**
     * If the transaction was directly deploying a contract, the {@link TransactionReceiptParams.to | **to**} will be
     * null, the `data` will be initcode and if successful, this will be the address of the contract deployed.
     */
    contractAddress: null | string;

    /**
     * The transaction hash.
     */
    hash: string;

    /**
     * The transaction index.
     */
    index: number;

    /**
     * The block hash of the block that included this transaction.
     */
    blockHash: string;

    /**
     * The block number of the block that included this transaction.
     */
    blockNumber: number;

    /**
     * The bloom filter for the logs emitted during execution of this transaction.
     */
    logsBloom: string;

    /**
     * The logs emitted during the execution of this transaction.
     */
    logs: ReadonlyArray<LogParams>;

    /**
     * The amount of gas consumed executing this transaciton.
     */
    gasUsed: bigint;

    /**
     * The total amount of gas consumed during the entire block up to and including this transaction.
     */
    cumulativeGasUsed: bigint;

    /**
     * The actual gas price per gas charged for this transaction.
     */
    gasPrice?: null | bigint;

    /**
     * The actual gas price per gas charged for this transaction.
     */
    effectiveGasPrice?: null | bigint;

    /**
     * The [EIP-2718](https://eips.ethereum.org/EIPS/eip-2718) envelope type.
     */
    type: number;
    //byzantium: boolean;

    /**
     * The status of the transaction execution. If `1` then the the transaction returned success, if `0` then the
     * transaction was reverted. For pre-byzantium blocks, this is usually null, but some nodes may have backfilled this
     * data.
     */
    status: null | number;

    etxs: ReadonlyArray<string>;
}

/**
 * @category Providers
 * @todo Write documentation for this type.
 */
export type TransactionResponseParams = QuaiTransactionResponseParams | QiTransactionResponseParams;

//////////////////////
// Transaction Response

/**
 * A **TransactionResponseParams** encodes the minimal required properties for a formatted transaction response.
 *
 * @category Providers
 */
export interface QuaiTransactionResponseParams {
    /**
     * The block number of the block that included this transaction.
     */
    blockNumber: null | number;

    /**
     * The block hash of the block that included this transaction.
     */
    blockHash: null | string;

    /**
     * The transaction hash.
     */
    hash: string;

    /**
     * The transaction index.
     */
    index: bigint;

    type: number;

    /**
     * The target of the transaction. If `null`, the `data` is initcode and this transaction is a deployment
     * transaction.
     */
    to: null | string;

    /**
     * The sender of the transaction.
     */
    from: string;

    /**
     * The nonce of the transaction, used for replay protection.
     */
    nonce: number;

    /**
     * The maximum amount of gas this transaction is authorized to consume.
     */
    gasLimit: bigint;

    /**
     * For [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) transactions, this is the maximum priority fee to allow a
     * producer to claim.
     */
    maxPriorityFeePerGas: null | bigint;

    /**
     * For [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) transactions, this is the maximum fee that will be paid.
     */
    maxFeePerGas: null | bigint;

    /**
     * The transaction data.
     */
    data: string;

    /**
     * The transaction value (in wei).
     */
    value: bigint;

    /**
     * The chain ID this transaction is valid on.
     */
    chainId: bigint;

    /**
     * The signature of the transaction.
     */
    signature: Signature;

    /**
     * The transaction access list.
     */
    accessList: null | AccessList;
}

/**
 * @category Providers
 * @todo Write documentation for this interface.
 */
export interface QiTransactionResponseParams {
    /**
     * The block number of the block that included this transaction.
     */
    blockNumber: null | number;

    /**
     * The block hash of the block that included this transaction.
     */
    blockHash: null | string;

    /**
     * The transaction hash.
     */
    hash: string;

    /**
     * The transaction index.
     */
    index: bigint;

    /**
     * @todo Write documentation for this property.
     */
    type: number;

    /**
     * The chain ID this transaction is valid on.
     */
    chainId: bigint;

    /**
     * The signature of the transaction.
     */
    signature: string;

    txOutputs?: TxOutput[];

    txInputs?: TxInput[];
}

export interface OutpointResponseParams {
    Txhash: string;
    Index: number;
    Denomination: number;
}
