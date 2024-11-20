/**
 * @ignore
 */
import { getAddress } from '../address/index.js';
import { Signature } from '../crypto/index.js';
import { accessListify } from '../transaction/index.js';
import { Outpoint, OutpointDeltas } from '../transaction/utxo.js';
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
    OutpointResponseParams,
    OutpointDeltaResponseParams,
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
    outboundEtxsRoot: formatHash,
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
    secondaryCoinbase: allowNull(getAddress),
    exchangeRate: getBigInt,
    quaiToQi: getBigInt,
    qiToQuai: getBigInt,
});

const _formatUncle = object({
    primaryCoinbase: allowNull(getAddress),
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
    lock: getNumber,
});

const _formatBlock = object({
    outboundEtxs: arrayOf((tx: any) => {
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
    result.outboundEtxs = value.outboundEtxs.map((tx: string | ExternalTransactionResponseParams) => {
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
        from: getAddress,
        originatingTxHash: formatHash,
        etxIndex: getNumber,
        chainId: allowNull(getBigInt, null),
        etxType: getNumber,
        hash: formatHash,
    },
    {
        from: ['from'],
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
        outboundEtxs: (value) => (value ? arrayOf(formatEtx)(value) : value),
        originatingTxHash: allowNull(formatHash),
        etxType: allowNull(getNumber),
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

export function formatTransactionResponse(value: any): TransactionResponseParams | ExternalTransactionResponseParams {
    // Determine if it is a Quai or Qi transaction based on the type
    const transactionType = parseInt(value.type, 16);

    switch (transactionType) {
        case 0x0:
            return formatQuaiTransactionResponse(value);
        case 0x1:
            return formatExternalTransactionResponse(value);
        case 0x2:
            return formatQiTransactionResponse(value);
        default:
            throw new Error('Unknown transaction type');
    }
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
            minerTip: allowNull((value: any) => (value ? BigInt(value) : null)),
            gasPrice: allowNull((value: any) => (value ? BigInt(value) : null)),
            gasLimit: allowNull((value: any) => (value ? BigInt(value) : null), null),
            to: allowNull(getAddress, null),
            value: allowNull((value: any) => (value ? BigInt(value) : null), null),
            nonce: allowNull((value: any) => (value ? parseInt(value, 10) : null), null),
            creates: allowNull(getAddress, null),
            chainId: allowNull((value: any) => (value ? BigInt(value) : null), null),
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

function formatQuaiTransactionResponse(value: any): QuaiTransactionResponseParams {
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
            minerTip: allowNull((value: any) => (value ? BigInt(value) : null)),
            gasPrice: allowNull((value: any) => (value ? BigInt(value) : null)),
            gasLimit: allowNull((value: any) => (value ? BigInt(value) : null), null),
            to: allowNull(getAddress, null),
            value: allowNull((value: any) => (value ? BigInt(value) : null), null),
            nonce: allowNull((value: any) => (value ? parseInt(value, 10) : null), null),
            creates: allowNull(getAddress, null),
            chainId: allowNull((value: any) => (value ? BigInt(value) : null), null),
            etxType: allowNull((value: any) => parseInt(value, 16), null),
            data: (value: any) => value,
        },
        {
            data: ['input'],
            gasLimit: ['gas'],
            index: ['transactionIndex'],
        },
    )(value) as QuaiTransactionResponseParams;

    // Add an access list if missing
    if (value.accessList == null) {
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

    return result;
}

function formatQiTransactionResponse(value: any): QiTransactionResponseParams {
    return object(
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
            chainId: allowNull((value: any) => (value ? BigInt(value) : null), null),
            signature: (value: any) => value,
            txInputs: allowNull(formatTxInputs, []),
            txOutputs: allowNull(formatTxOutputs, []),
        },
        {
            index: ['transactionIndex'],
            signature: ['utxoSignature'],
            txInputs: ['inputs'],
            txOutputs: ['outputs'],
        },
    )(value) as QiTransactionResponseParams;
}

const formatTxInputs = (value: any) => {
    return value?.map(_formatTxInput);
};

const _formatTxInput = (value: any) => {
    return {
        txhash: formatHash(value.previousOutPoint.txHash),
        index: getNumber(value.previousOutPoint.index),
        pubkey: hexlify(value.pubKey),
    };
};

const formatTxOutputs = (value: any) => {
    return value?.map(_formatTxOutput);
};

const _formatTxOutput = (value: any) => {
    return {
        denomination: getNumber(value.denomination),
        lock: getNumber(value.lock),
        address: getAddress(value.address),
    };
};

const _formatOutpoint = object(
    {
        denomination: (value: string) => getNumber(value),
        index: (value: string) => getNumber(value),
        lock: (value: string) => getNumber(value),
        txhash: formatHash,
    },
    {
        txhash: ['txHash'],
    },
);

export function formatOutpoints(outpoints: OutpointResponseParams[]): Outpoint[] {
    return outpoints.map(_formatOutpoint);
}

export function formatOutpointDeltas(deltas: OutpointDeltaResponseParams): OutpointDeltas {
    const result: OutpointDeltas = {};

    for (const [address, delta] of Object.entries(deltas)) {
        const created: OutpointResponseParams[] = [];
        const deleted: OutpointResponseParams[] = [];

        // Process created outpoints
        for (const [txHash, outputs] of Object.entries(delta.created)) {
            outputs.forEach((output) => {
                created.push({
                    txHash,
                    index: output.index,
                    denomination: output.denomination,
                    lock: output.lock,
                });
            });
        }

        // Process deleted outpoints
        for (const [txHash, outputs] of Object.entries(delta.deleted)) {
            outputs.forEach((output) => {
                deleted.push({
                    txHash,
                    index: output.index,
                    denomination: output.denomination,
                    lock: output.lock,
                });
            });
        }

        result[address] = {
            created: formatOutpoints(created),
            deleted: formatOutpoints(deleted),
        };
    }

    return result;
}
