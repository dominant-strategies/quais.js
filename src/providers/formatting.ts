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
    outboundEtxs: ReadonlyArray<string | ExternalTransactionResponseParams>;
    hash: string;
    header: BlockHeaderParams;
    interlinkHashes: Array<string>;
    size: bigint;
    subManifest: Array<string>;
    totalEntropy: bigint;
    transactions: ReadonlyArray<string | TransactionResponseParams | ExternalTransactionResponseParams>;
    uncles: Array<string | UncleParams>;
    woHeader: WoHeaderParams;
    workShares: Array<string | WorkShareParams>;
}

export interface BlockHeaderParams {
    baseFeePerGas: null | bigint;
    efficiencyScore: bigint;
    etxEligibleSlices: string;
    etxSetRoot: string;
    evmRoot: string;
    expansionNumber: number;
    etxRollupRoot: string;
    outboundEtxsRoot: string;
    extraData: string;
    gasLimit: bigint;
    gasUsed: bigint;
    interlinkRootHash: string;
    manifestHash: Array<string>;
    number: Array<number>;
    parentDeltaEntropy: Array<bigint>;
    parentEntropy: Array<bigint>;
    parentHash: Array<string>;
    parentUncledDeltaEntropy: Array<bigint>;
    primeTerminusHash: string;
    quaiStateSize: bigint;
    receiptsRoot: string;
    uncleHash: string;
    size: bigint;
    stateLimit: bigint;
    stateUsed: bigint;
    thresholdCount: bigint;
    transactionsRoot: string;
    uncledEntropy: bigint;
    utxoRoot: string;
    exchangeRate: bigint;
    quaiToQi: bigint;
    qiToQuai: bigint;
    secondaryCoinbase: string;
}

export interface UncleParams {
    primaryCoinbase: string;
    lock: number;
    difficulty: string;
    headerHash: string;
    location: string;
    mixHash: string;
    nonce: string;
    number: number;
    parentHash: string;
    timestamp: string;
    txHash: string;
}

// Create named params for the work share and wo header despite them being the same as the uncle params
export interface WorkShareParams extends UncleParams {}
export interface WoHeaderParams extends UncleParams {}

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
 *
 *   **EtxParams** encodes the minimal required properties for a formatted etx.
 */
export interface EtxParams {
    /**
     * The transaction type for this etx. Etxs are always type 1.
     */
    type: number;

    /**
     * The nonce of the etx, used for replay protection.
     */
    nonce: number;

    /**
     * The actual gas price per gas charged for this etx.
     */
    gasPrice: null | bigint;

    /**
     * The maximum priority fee to allow a producer to claim.
     */
    minerTip: null | bigint;

    /**
     * The gas supplied for this etx.
     */
    gas: null | bigint;

    /**
     * The etx value (in wei).
     */
    value: null | bigint;

    /**
     * The input data for this etx.
     */
    input: string;

    /**
     * The target of the transaction. If `null`, the `data` is initcode and this transaction is a deployment
     * transaction.
     */
    to: null | string;

    /**
     * The etx access list.
     */
    accessList: null | AccessList;

    /**
     * The chain ID this etx is valid on.
     */
    chainId: null | bigint;

    /**
     * The hash of the transaction.
     */
    hash: string;

    /**
     * The hash of the originating transaction.
     */
    originatingTxHash: string;

    /**
     * The index of this etx.
     */
    etxIndex: number;

    /**
     * The sender of the etx.
     */
    from: string;
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

    etxType?: null | number;

    originatingTxHash?: null | string;

    outboundEtxs: ReadonlyArray<EtxParams>;
}

export interface ExternalTransactionResponseParams {
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
     * The transaction type. Quai transactions are always type 0.
     */
    type: number;

    /**
     * The target of the transaction. If `null`, the `data` is initcode and this transaction is a deployment
     * transaction.
     */
    to: null | string;

    etxIndex: number;

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

    originatingTxHash: null | string;

    etxType: null | number;
}

/**
 * A **TransactionResponseParams** encodes the minimal required properties for a formatted transaction response for
 * either a Qi or Quai transaction.
 *
 * @category Providers
 */
export type TransactionResponseParams = QuaiTransactionResponseParams | QiTransactionResponseParams;

//////////////////////
// Transaction Response

/**
 * A **TransactionResponseParams** encodes the minimal required properties for a formatted Quai transaction response.
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

    /**
     * The transaction type. Quai transactions are always type 0.
     */
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
    minerTip: null | bigint;

    /**
     * For [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) transactions, this is the maximum fee that will be paid.
     */
    gasPrice: null | bigint;

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

    etxType: null | number;
}

/**
 * A **TransactionResponseParams** encodes the minimal required properties for a formatted Qi transaction response.
 *
 * @category Providers
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
     * The transaction type. Qi transactions are always type 2.
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
    txHash: string;
    index: string;
    denomination: string;
    lock: string;
}

// Add this interface near the other response type definitions
export interface OutpointDeltaResponseParams {
    [address: string]: {
        created: {
            [txHash: string]: Array<{
                denomination: string;
                index: string;
                lock: string;
            }>;
        };
        deleted: {
            [txHash: string]: Array<{
                denomination: string;
                index: string;
                lock: string;
            }>;
        };
    };
}
