import assert from 'assert';

// import {
//     checkProvider, getProvider, providerNames
// } from "./create-provider.js";
// import { retryIt } from "./utils.js";

//import type { Provider } from "../index.js";
import { getTxType, quais } from '../index.js';
import axios from 'axios';
import { stall } from './utils.js';
import dotenv from 'dotenv';
import { Shard } from '../constants/index.js';
dotenv.config();
// import {
//     networkFeatureAtBlock, networkNames,
//     testAddress, testBlock, testReceipt, testTransaction
// } from "./blockchain-data.js";

// import type { TestBlockchainNetwork } from "./blockchain-data.js";

//setupProviders();

const providerC1 = new quais.JsonRpcProvider(process.env.CYPRUS1URL);
const privateKey = process.env.CYPRUS1PK;
console.log(privateKey);
const wallet = new quais.Wallet(process.env.CYPRUS1PK || '', providerC1);
const destinationC1 = '0x0047f9CEa7662C567188D58640ffC48901cde02a';
const destinationC2 = '0x011ae0a1Bd5B71b4F16F8FdD3AEF278C3D042449';

function equals(name: string, actual: any, expected: any): void {
    if (expected && expected.eq) {
        if (actual == null) {
            assert.ok(false, name + ' - actual big number null');
        }
        expected = BigInt(expected);
        actual = BigInt(actual);
        assert.ok(expected.eq(actual), name + ' matches');
    } else if (Array.isArray(expected)) {
        if (actual == null) {
            assert.ok(false, name + ' - actual array null');
        }
        assert.equal(actual.length, expected.length, name + ' array lengths match');
        for (let i = 0; i < expected.length; i++) {
            equals('(' + name + ' - item ' + i + ')', actual[i], expected[i]);
        }
    } else if (typeof expected === 'object') {
        if (actual == null) {
            if (expected === actual) {
                return;
            }
            assert.ok(false, name + ' - actual object null');
        }

        const keys: { [key: string]: boolean } = {};
        Object.keys(expected).forEach((key) => {
            keys[key] = true;
        });
        Object.keys(actual).forEach((key) => {
            keys[key] = true;
        });

        Object.keys(keys).forEach((key) => {
            if (typeof actual[key] === 'string' && actual[key].toLowerCase && key === 'type') {
                actual[key] = actual[key].toLowerCase();
            }
            equals('(' + name + ' - key + ' + key + ')', actual[key], expected[key]);
        });
    } else {
        if (actual == null) {
            assert.ok(false, name + ' - actual null');
        }

        // Modify this part for case-insensitive comparison for string values
        if (typeof actual === 'string' && typeof expected === 'string') {
            assert.equal(actual.toLowerCase(), expected.toLowerCase(), name + ' matches (case-insensitive)');
        } else {
            assert.equal(actual, expected, name + ' matches');
        }
    }
}

async function getRPCGasPrice(url: string | undefined) {
    try {
        let response;
        do {
            response = await axios.post(url || 'http://localhost:8610', {
                jsonrpc: '2.0',
                method: 'quai_gasPrice',
                params: [],
                id: 1,
            });
        } while (response.data.result == null);
        return response.data.result;
    } catch (error: any) {
        throw new Error(`Error fetching block: ${error.message}`);
    }
}

async function sendTransaction(to: string) {
    let txResponse;
    let typeValue;
    try {
        console.log('Nonce: ', await providerC1.getTransactionCount(wallet.address, 'latest'));
        do {
            typeValue = getTxType(wallet.address, to);
            const gas = await getRPCGasPrice(process.env.CYPRUS1URL);
            const tx: {
                from: string;
                to: string;
                value: any;
                gasPrice: any;
                maxFeePerGas: any;
                maxPriorityFeePerGas: any;
                nonce: number;
                data: string;
                type: number;
                gasLimit: number;
                chainId: number;
                etxGasLimit?: any;
                etxGasTip?: any;
                etxGasPrice?: any;
            } = {
                from: wallet.address,
                to,
                value: quais.parseQuai('0.1'), // Sending 0.1 ether
                gasPrice: gas * 2,
                maxFeePerGas: quais.parseUnits('20', 'gwei'),
                maxPriorityFeePerGas: quais.parseUnits('20', 'gwei'),
                nonce: await providerC1.getTransactionCount(wallet.address, 'latest'),
                data: '',
                type: typeValue,
                gasLimit: typeValue == 0 ? 21000 : 42000,
                chainId: Number(process.env.CHAIN_ID || 1337),
            };
            txResponse = await wallet.sendTransaction(tx);
            console.log(txResponse);
            await stall(15000);
        } while (txResponse.hash == null);

        console.log(`Transaction hash for type ${typeValue}: `, txResponse.hash);
        return txResponse;
    } catch (error: any) {
        console.error('Failed to send Transaction: ', error);
        return null;
    }
}

async function fetchRPCBlock(blockNumber: string | null) {
    // TODO: this is supposedly an un-needed try-catch, consider revising
    // eslint-disable-next-line no-useless-catch
    try {
        let response;
        do {
            response = await axios.post(process.env.CYPRUS1URL || 'http://localhost:8610', {
                jsonrpc: '2.0',
                method: 'quai_getBlockByNumber',
                params: [blockNumber || '0xA', false],
                id: 1,
            });
        } while (response?.data?.result?.woHeader?.headerHash == null);
        return response.data.result;
    } catch (error: any) {
        throw error;
    }
}

async function fetchRPCBalance(address: string, url: string) {
    try {
        let response;
        do {
            response = await axios.post(url, {
                jsonrpc: '2.0',
                method: 'quai_getBalance',
                params: [address, 'latest'],
                id: 1,
            });
        } while (response.data.result == null);
        return response.data.result;
    } catch (error: any) {
        throw new Error(`Error fetching block: ${error.message}`);
    }
}

async function fetchRPCTxReceipt(hash: string, url: string) {
    try {
        let response;
        do {
            response = await axios.post(url, {
                jsonrpc: '2.0',
                method: 'quai_getTransactionReceipt',
                params: [hash],
                id: 1,
            });
            await stall(5000);
        } while (response.data.result.blockHash == null);
        return response.data.result;
    } catch (error: any) {
        throw new Error(`Error fetching block: ${error.message}`);
    }
}

describe('Test Provider Block operations', function () {
    let block: quais.BlockParams;

    before(async () => {
        const rpcBlock = await fetchRPCBlock('0xA');
        block = {
            extTransactions: rpcBlock.extTransactions,
            interlinkHashes: rpcBlock.interlinkHashes,
            order: rpcBlock.order,
            size: BigInt(rpcBlock.size),
            subManifest: rpcBlock.subManifest,
            totalEntropy: BigInt(rpcBlock.totalEntropy),
            transactions: rpcBlock.transactions,
            uncles: rpcBlock.uncles,
            woBody: {
                extTransactions: rpcBlock.woBody.extTransactions,
                header: {
                    baseFeePerGas: BigInt(rpcBlock.woBody.header.baseFeePerGas),
                    efficiencyScore: BigInt(rpcBlock.woBody.header.efficiencyScore),
                    etxEligibleSlices: rpcBlock.woBody.header.etxEligibleSlices,
                    etxSetRoot: rpcBlock.woBody.header.etxSetRoot,
                    evmRoot: rpcBlock.woBody.header.evmRoot,
                    expansionNumber: Number(rpcBlock.woBody.header.expansionNumber),
                    extRollupRoot: rpcBlock.woBody.header.extRollupRoot,
                    extTransactionsRoot: rpcBlock.woBody.header.extTransactionsRoot,
                    extraData: rpcBlock.woBody.header.extraData,
                    gasLimit: BigInt(rpcBlock.woBody.header.gasLimit),
                    gasUsed: BigInt(rpcBlock.woBody.header.gasUsed),
                    hash: rpcBlock.woBody.header.hash,
                    interlinkRootHash: rpcBlock.woBody.header.interlinkRootHash,
                    manifestHash: rpcBlock.woBody.header.manifestHash,
                    miner: rpcBlock.woBody.header.miner,
                    mixHash: rpcBlock.woBody.header.mixHash,
                    nonce: rpcBlock.woBody.header.nonce,
                    number: rpcBlock.woBody.header.number.map((stringNumber: string) => Number(stringNumber)),
                    parentDeltaS: rpcBlock.woBody.header.parentDeltaS.map((delta: string) => BigInt(delta)),
                    parentEntropy: rpcBlock.woBody.header.parentEntropy.map((entropy: string) => BigInt(entropy)),
                    parentHash: rpcBlock.woBody.header.parentHash,
                    parentUncledS: rpcBlock.woBody.header.parentUncledS.map((uncled: string | null) =>
                        uncled ? BigInt(uncled) : null,
                    ),
                    parentUncledSubDeltaS: rpcBlock.woBody.header.parentUncledSubDeltaS.map((delta: string) =>
                        BigInt(delta),
                    ),
                    primeTerminus: rpcBlock.woBody.header.primeTerminus,
                    receiptsRoot: rpcBlock.woBody.header.receiptsRoot,
                    sha3Uncles: rpcBlock.woBody.header.sha3Uncles,
                    size: BigInt(rpcBlock.woBody.header.size),
                    thresholdCount: BigInt(rpcBlock.woBody.header.thresholdCount),
                    transactionsRoot: rpcBlock.woBody.header.transactionsRoot,
                    uncledS: BigInt(rpcBlock.woBody.header.uncledS),
                    utxoRoot: rpcBlock.woBody.header.utxoRoot,
                },
                interlinkHashes: rpcBlock.woBody.interlinkHashes,
                manifest: rpcBlock.woBody.manifest,
                transactions: rpcBlock.woBody.transactions,
                uncles: rpcBlock.woBody.uncles,
            },
            woHeader: {
                difficulty: rpcBlock.woHeader.difficulty,
                headerHash: rpcBlock.woHeader.headerHash,
                location: rpcBlock.woHeader.location,
                mixHash: rpcBlock.woHeader.mixHash,
                nonce: rpcBlock.woHeader.nonce,
                number: rpcBlock.woHeader.number,
                parentHash: rpcBlock.woHeader.parentHash,
                time: rpcBlock.woHeader.time,
                txHash: rpcBlock.woHeader.txHash,
            },
        };
    });

    it('should fetch block by number', async function () {
        const responseBlock = (await providerC1.getBlock(Shard.Cyprus1, '0xA')) as quais.Block;
        assert.ok(responseBlock != null, 'block != null');
        // TODO: `provider` is not used, remove?
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { provider, ...formatBlock } = {
            ...responseBlock,
            transactions: responseBlock.transactions,
            extTransactions: responseBlock.extTransactions,
        };
        equals('Block by Number', formatBlock, block);
    });

    it('should fetch block by hash', async function () {
        assert.ok(block.woBody.header.hash != null, 'block.hash != null');
        const responseBlock = (await providerC1.getBlock(Shard.Paxos2, block.woBody.header.hash)) as quais.Block;
        assert.ok(responseBlock != null, 'block != null');
        // TODO: `provider` is not used, remove?
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { provider, ...formatBlock } = {
            ...responseBlock,
            transactions: responseBlock.transactions,
            extTransactions: responseBlock.extTransactions,
        };
        equals('Block by Hash', formatBlock, block);
    });
});

describe('Test Transaction operations', function () {
    let internalTx: any;
    let internalToExternalTx: any;

    it('should fetch balance after internal tx', async function () {
        this.timeout(60000);
        const oldBal = await fetchRPCBalance(destinationC1, process.env.CYPRUS1URL || 'http://localhost:8610');
        internalTx = await sendTransaction(destinationC1);
        await stall(30000);
        const expectedBal = BigInt(internalTx.value);
        const balance = await providerC1.getBalance(destinationC1);
        const actualBal = Number(balance) - Number(oldBal);
        const tolerance = 1e-6; // Define a small tolerance level

        const withinTolerance = Math.abs(((actualBal - Number(expectedBal)) * 100) / Number(expectedBal)) <= tolerance;
        assert(
            withinTolerance,
            `Actual balance ${actualBal} is not within the acceptable range of expected balance ${Number(expectedBal)}`,
        );

        const receipt = await fetchRPCTxReceipt(internalTx.hash, process.env.CYPRUS1URL || 'http://localhost:8610');
        const expectedReceipt = {
            blockHash: receipt.blockHash,
            contractAddress: receipt.contractAddress || null,
            blockNumber: Number(receipt.blockNumber),
            cumulativeGasUsed: BigInt(receipt.cumulativeGasUsed),
            gasPrice: BigInt(receipt.effectiveGasPrice),
            etxs: receipt.etxs ?? [],
            gasUsed: BigInt(receipt.gasUsed),
            logs: receipt.logs,
            logsBloom: receipt.logsBloom,
            status: Number(receipt.status),
            to: receipt.to,
            from: receipt.from,
            hash: receipt.transactionHash,
            index: Number(receipt.transactionIndex),
            type: receipt.type,
        };
        const receiptResponse = await providerC1.getTransactionReceipt(internalTx.hash);
        // TODO: `provider` is not used, remove?
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { provider, ...receiptResult } = {
            ...receiptResponse,
            logs: receiptResponse?.logs,
        };
        console.log(receiptResult.blockHash);
        equals('Internal Tx Receipt', receiptResult, expectedReceipt);
    });

    it('should fetch transaction receipt for internal to external tx', async function () {
        this.timeout(120000);
        internalToExternalTx = await sendTransaction(destinationC2);
        await stall(60000);
        const receipt = await fetchRPCTxReceipt(
            internalToExternalTx.hash,
            process.env.CYPRUS1URL || 'http://localhost:8610',
        );
        await stall(30000);
        const etx = receipt.etxs[0];
        const expectedReceipt = {
            blockHash: receipt.blockHash,
            blockNumber: Number(receipt.blockNumber),
            contractAddress: receipt.contractAddress || null,
            cumulativeGasUsed: BigInt(receipt.cumulativeGasUsed),
            gasPrice: BigInt(receipt.effectiveGasPrice),
            etxs: [
                {
                    type: Number(etx.type),
                    nonce: Number(etx.nonce),
                    maxPriorityFeePerGas: BigInt(etx.maxPriorityFeePerGas),
                    maxFeePerGas: BigInt(etx.maxFeePerGas),
                    gas: BigInt(etx.gas),
                    value: BigInt(etx.value),
                    input: etx.input,
                    to: etx.to,
                    from: etx.sender,
                    hash: etx.hash,
                    chainId: Number(etx.chainId),
                    accessList: etx.accessList,
                },
            ],
            gasUsed: BigInt(receipt.gasUsed),
            logs: receipt.logs,
            logsBloom: receipt.logsBloom,
            status: Number(receipt.status),
            to: receipt.to,
            from: receipt.from,
            hash: receipt.transactionHash,
            index: Number(receipt.transactionIndex),
            type: Number(receipt.type),
        };
        const receiptResponse = await providerC1.getTransactionReceipt(internalToExternalTx.hash);
        // TODO: `provider` is not used, remove?
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { provider, ...receiptResult } = {
            ...receiptResponse,
            logs: receiptResponse?.logs,
        };
        console.log(receiptResult);
        console.log(expectedReceipt);
        equals('Internal to External Tx Receipt', receiptResult, expectedReceipt);
    });
});
