/**
 * @ignore
 */
import { getAddress } from '../address/index.js';
import { Signature } from '../crypto/index.js';
import { accessListify } from '../transaction/index.js';
import { hexlify } from '../utils/data.js';
import {
    getBigInt,
    getNumber,
    isHexString,
    zeroPadValue,
    assert,
    assertArgument,
    BigNumberish,
    toBeArray,
} from '../utils/index.js';

import type {
    BlockParams,
    LogParams,
    TransactionReceiptParams,
    TransactionResponseParams,
    EtxParams,
    QiTransactionResponseParams,
    QuaiTransactionResponseParams,
    ExternalTransactionResponseParams,
} from './formatting.js';

const BN_0 = BigInt(0);

export type FormatFunc = (value: any) => any;

export function allowNull(format: FormatFunc, nullValue?: any): FormatFunc {
    return function (value: any) {
        if (value == null) {
            return nullValue;
        }
        return format(value);
    };
}

export function arrayOf(format: FormatFunc): FormatFunc {
    return (array: any) => {
        if (!Array.isArray(array)) {
            throw new Error('not an array');
        }
        return array.map((i) => format(i));
    };
}

// Requires an object which matches a fleet of other formatters
// Any FormatFunc may return `undefined` to have the value omitted
// from the result object. Calls preserve `this`.
export function object(format: Record<string, FormatFunc>, altNames?: Record<string, Array<string>>): FormatFunc {
    return (value: any) => {
        const result: any = {};
        for (const key in format) {
            let srcKey = key;
            if (altNames && key in altNames && !(srcKey in value)) {
                for (const altKey of altNames[key]) {
                    if (altKey in value) {
                        srcKey = altKey;
                        break;
                    }
                }
            }

            try {
                const nv = format[key](value[srcKey]);
                if (nv !== undefined) {
                    result[key] = nv;
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'not-an-error';
                assert(false, `invalid value for value.${key} (${message})`, 'BAD_DATA', { value });
            }
        }
        return result;
    };
}

export function formatBoolean(value: any): boolean {
    switch (value) {
        case true:
        case 'true':
            return true;
        case false:
        case 'false':
            return false;
    }
    assertArgument(false, `invalid boolean; ${JSON.stringify(value)}`, 'value', value);
}

export function formatData(value: string): string {
    assertArgument(isHexString(value), 'invalid data', 'value', value);
    return value;
}

export function formatHash(value: any): string {
    assertArgument(isHexString(value, 32), 'invalid hash', 'value', value);
    return value;
}

export function formatUint256(value: any): string {
    if (!isHexString(value)) {
        throw new Error('invalid uint256');
    }
    return zeroPadValue(value, 32);
}

export function handleNumber(_value: string, param: string): number {
    if (_value === '0x') {
        return 0;
    }
    return getNumber(_value, param);
}

export function formatNumber(_value: BigNumberish, name: string): Uint8Array {
    const value = getBigInt(_value, 'value');
    const result = toBeArray(value);
    assertArgument(result.length <= 32, `value too large`, `tx.${name}`, value);
    return result;
}

const _formatLog = object(
    {
        address: getAddress,
        blockHash: formatHash,
        blockNumber: getNumber,
        data: formatData,
        index: getNumber,
        removed: allowNull(formatBoolean, false),
        topics: arrayOf(formatHash),
        transactionHash: formatHash,
        transactionIndex: getNumber,
    },
    {
        index: ['logIndex'],
    },
);

export function formatLog(value: any): LogParams {
    return _formatLog(value);
}

const _formatHeader = object({
    baseFeePerGas: getBigInt,
    efficiencyScore: getBigInt,
    etxEligibleSlices: formatHash,
    etxSetRoot: formatHash,
    evmRoot: formatHash,
    expansionNumber: getNumber,
    etxRollupRoot: formatHash,
    etxsRoot: formatHash,
    extraData: formatData,
    gasLimit: getBigInt,
    gasUsed: getBigInt,
    interlinkRootHash: formatHash,
    manifestHash: arrayOf(formatHash),
    number: arrayOf(getNumber),
    parentDeltaEntropy: arrayOf(getBigInt),
    parentEntropy: arrayOf(getBigInt),
    parentHash: arrayOf(formatHash),
    parentUncledDeltaEntropy: arrayOf(getBigInt),
    primeTerminusHash: formatHash,
    quaiStateSize: getBigInt,
    receiptsRoot: formatHash,
    uncleHash: formatHash,
    size: getBigInt,
    stateLimit: getBigInt,
    stateUsed: getBigInt,
    thresholdCount: getBigInt,
    transactionsRoot: formatHash,
    uncledEntropy: getBigInt,
    utxoRoot: formatHash,
});

const _formatUncle = object({
    coinbase: allowNull(getAddress),
    difficulty: getNumber,
    headerHash: formatHash,
    location: formatData,
    mixHash: formatHash,
    nonce: formatData,
    number: getNumber,
    parentHash: formatHash,
    primeTerminusNumber: getNumber,
    timestamp: getNumber,
    txHash: formatHash,
});

const _formatBlock = object({
    etxs: arrayOf((tx: any) => {
        if (typeof tx === 'string') {
            return formatHash(tx);
        }
        return formatExternalTransactionResponse(tx);
    }),
    hash: formatHash,
    header: _formatHeader,
    interlinkHashes: arrayOf(formatHash),
    size: getBigInt,
    subManifest: arrayOf(formatData),
    totalEntropy: getBigInt,
    transactions: arrayOf((tx: any) => {
        if (typeof tx === 'string') {
            return formatHash(tx);
        }
        return formatTransactionResponse(tx);
    }),
    uncles: arrayOf(_formatUncle),
    woHeader: _formatUncle,
    workShares: allowNull(arrayOf(_formatUncle), []),
});

export function formatBlock(value: any): BlockParams {
    const result = _formatBlock(value);
    result.transactions = value.transactions.map(
        (tx: string | TransactionResponseParams | ExternalTransactionResponseParams) => {
            if (typeof tx === 'string') {
                return tx;
            }
            if ('originatingTxHash' in tx) {
                return formatExternalTransactionResponse(tx);
            }
            return formatTransactionResponse(tx);
        },
    );
    result.etxs = value.etxs.map((tx: string | ExternalTransactionResponseParams) => {
        if (typeof tx === 'string') {
            return tx;
        }
        return formatExternalTransactionResponse(tx);
    });
    return result;
}

const _formatReceiptLog = object(
    {
        transactionIndex: getNumber,
        blockNumber: getNumber,
        transactionHash: formatHash,
        address: getAddress,
        topics: arrayOf(formatHash),
        data: formatData,
        index: getNumber,
        blockHash: formatHash,
    },
    {
        index: ['logIndex'],
    },
);

export function formatReceiptLog(value: any): LogParams {
    return _formatReceiptLog(value);
}

const _formatEtx = object(
    {
        type: allowNull(getNumber, 0),
        nonce: allowNull(getNumber),
        gasPrice: allowNull(getBigInt),
        minerTip: allowNull(getBigInt),
        gas: allowNull(getBigInt),
        value: allowNull(getBigInt, BN_0),
        input: allowNull(formatData),
        to: allowNull(getAddress, null),
        accessList: allowNull(accessListify, null),
        isCoinbase: allowNull(getNumber, 0),
        sender: getAddress,
        originatingTxHash: formatHash,
        etxIndex: getNumber,
        chainId: allowNull(getBigInt, null),
        hash: formatHash,
    },
    {
        from: ['sender'],
    },
);

export function formatEtx(value: any): EtxParams {
    return _formatEtx(value);
}

const _formatTransactionReceipt = object(
    {
        to: allowNull(getAddress, null),
        from: allowNull(getAddress, null),
        contractAddress: allowNull(getAddress, null),
        index: getNumber,
        gasUsed: getBigInt,
        logsBloom: allowNull(formatData),
        blockHash: formatHash,
        hash: formatHash,
        logs: arrayOf(formatReceiptLog),
        blockNumber: getNumber,
        cumulativeGasUsed: getBigInt,
        effectiveGasPrice: allowNull(getBigInt),
        status: allowNull(getNumber),
        type: allowNull(getNumber, 0),
        etxs: (value) => (value === null ? [] : arrayOf(formatEtx)(value)),
    },
    {
        hash: ['transactionHash'],
        index: ['transactionIndex'],
    },
);

export function formatTransactionReceipt(value: any): TransactionReceiptParams {
    const result = _formatTransactionReceipt(value);
    return result;
}

export function formatExternalTransactionResponse(value: any): ExternalTransactionResponseParams {
    const result = object(
        {
            hash: formatHash,
            type: (value: any) => {
                if (value === '0x' || value == null) {
                    return 0;
                }
                return parseInt(value, 16);
            },
            accessList: allowNull(accessListify, null),
            blockHash: allowNull(formatHash, null),
            blockNumber: allowNull((value: any) => (value ? parseInt(value, 16) : null), null),
            index: allowNull((value: any) => (value ? BigInt(value) : null), null),
            from: allowNull(getAddress, null),
            sender: allowNull(getAddress, null),
            minerTip: allowNull((value: any) => (value ? BigInt(value) : null)),
            gasPrice: allowNull((value: any) => (value ? BigInt(value) : null)),
            gasLimit: allowNull((value: any) => (value ? BigInt(value) : null), null),
            to: allowNull(getAddress, null),
            value: allowNull((value: any) => (value ? BigInt(value) : null), null),
            nonce: allowNull((value: any) => (value ? parseInt(value, 10) : null), null),
            creates: allowNull(getAddress, null),
            chainId: allowNull((value: any) => (value ? BigInt(value) : null), null),
            isCoinbase: allowNull((value: any) => (value ? parseInt(value, 10) : null), null),
            originatingTxHash: allowNull(formatHash, null),
            etxIndex: allowNull((value: any) => (value ? parseInt(value, 10) : null), null),
            etxType: allowNull((value: any) => value, null),
            data: (value: any) => value,
        },
        {
            data: ['input'],
            gasLimit: ['gas'],
            index: ['transactionIndex'],
        },
    )(value) as ExternalTransactionResponseParams;

    // 0x0000... should actually be null
    if (result.blockHash && getBigInt(result.blockHash) === BN_0) {
        result.blockHash = null;
    }

    return result;
}

export function formatTransactionResponse(value: any): TransactionResponseParams {
    // Determine if it is a Quai or Qi transaction based on the type
    const transactionType = parseInt(value.type, 16);

    let result: TransactionResponseParams;

    if (transactionType === 0x0 || transactionType === 0x1) {
        // QuaiTransactionResponseParams
        result = object(
            {
                hash: formatHash,
                type: (value: any) => {
                    if (value === '0x' || value == null) {
                        return 0;
                    }
                    return parseInt(value, 16);
                },
                accessList: allowNull(accessListify, null),
                blockHash: allowNull(formatHash, null),
                blockNumber: allowNull((value: any) => (value ? parseInt(value, 16) : null), null),
                index: allowNull((value: any) => (value ? BigInt(value) : null), null),
                from: allowNull(getAddress, null),
                sender: allowNull(getAddress, null),
                minerTip: allowNull((value: any) => (value ? BigInt(value) : null)),
                gasPrice: allowNull((value: any) => (value ? BigInt(value) : null)),
                gasLimit: allowNull((value: any) => (value ? BigInt(value) : null), null),
                to: allowNull(getAddress, null),
                value: allowNull((value: any) => (value ? BigInt(value) : null), null),
                nonce: allowNull((value: any) => (value ? parseInt(value, 10) : null), null),
                creates: allowNull(getAddress, null),
                chainId: allowNull((value: any) => (value ? BigInt(value) : null), null),
                etxType: allowNull((value: any) => value, null),
                data: (value: any) => value,
            },
            {
                data: ['input'],
                gasLimit: ['gas'],
                index: ['transactionIndex'],
            },
        )(value) as QuaiTransactionResponseParams;

        // Add an access list to supported transaction types
        if ((value.type === 0 || value.type === 2) && value.accessList == null) {
            result.accessList = [];
        }

        // Compute the signature
        if (value.signature) {
            result.signature = Signature.from(value.signature);
            // Some backends omit ChainId on legacy transactions, but we can compute it
            if (result.chainId == null) {
                const chainId = result.signature.legacyChainId;
                if (chainId != null) {
                    result.chainId = chainId;
                }
            }
        }

        // 0x0000... should actually be null
        if (result.blockHash && getBigInt(result.blockHash) === BN_0) {
            result.blockHash = null;
        }
    } else if (transactionType === 0x2) {
        // QiTransactionResponseParams
        result = object(
            {
                hash: formatHash,
                type: (value: any) => {
                    if (value === '0x' || value == null) {
                        return 0;
                    }
                    return parseInt(value, 16);
                },
                blockHash: allowNull(formatHash, null),
                blockNumber: allowNull((value: any) => (value ? parseInt(value, 16) : null), null),
                index: allowNull((value: any) => (value ? BigInt(value) : null), null),
                chainId: allowNull((value: any) => (value ? BigInt(value) : null), null),
                signature: (value: any) => value,
                txInputs: allowNull((value: any) => value.map(_formatTxInput), null),
                txOutputs: allowNull((value: any) => value.map(_formatTxOutput), null),
            },
            {
                index: ['transactionIndex'],
                signature: ['utxoSignature'],
                txInputs: ['inputs'],
                txOutputs: ['outputs'],
            },
        )(value) as QiTransactionResponseParams;
    } else {
        throw new Error('Unknown transaction type');
    }

    return result;
}

const _formatTxInput = object(
    {
        txhash: formatTxHash,
        index: formatIndex,
        pubkey: hexlify,
    },
    {
        txhash: ['PreviousOutPoint', 'TxHash'],
        index: ['PreviousOutPoint', 'Index'],
        pubkey: ['PubKey'],
    },
);

function extractTxHash(value: any): string {
    if (value && value.TxHash) {
        return value.TxHash;
    }
    throw new Error('Invalid PreviousOutPoint');
}

function formatTxHash(value: any): string {
    return formatHash(extractTxHash(value));
}

function extractIndex(value: any): number {
    if (value && value.Index !== undefined) {
        return value.Index;
    }
    throw new Error('Invalid PreviousOutPoint');
}

function formatIndex(value: any): number {
    return getNumber(extractIndex(value));
}

const _formatTxOutput = object({
    address: (addr: string) => hexlify(getAddress(addr)),
    denomination: getNumber,
});
