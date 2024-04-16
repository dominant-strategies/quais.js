import assert from "assert";

// import {
//     checkProvider, getProvider, providerNames
// } from "./create-provider.js";
// import { retryIt } from "./utils.js";

//import type { Provider } from "../index.js";
import { getTxType, quais } from "../index.js";
import axios from 'axios';
import { stall } from "./utils.js";
// import {
//     networkFeatureAtBlock, networkNames,
//     testAddress, testBlock, testReceipt, testTransaction
// } from "./blockchain-data.js";

// import type { TestBlockchainNetwork } from "./blockchain-data.js";


//setupProviders();


const providerC1 = new quais.JsonRpcProvider(process.env.RPC_URL);
const wallet = new quais.Wallet(process.env.FAUCET_PRIVATEKEY || '', providerC1); 
const destinationC1 = '0x0047f9CEa7662C567188D58640ffC48901cde02a'
const destinationC2 = '0x011ae0a1Bd5B71b4F16F8FdD3AEF278C3D042449'

function equals(name: string, actual: any, expected: any): void {
    if (expected && expected.eq) {
        if (actual == null) { assert.ok(false, name + " - actual big number null"); }
        expected = BigInt(expected);
        actual = BigInt(actual);
        assert.ok(expected.eq(actual), name + " matches");

    } else if (Array.isArray(expected)) {
        if (actual == null) { assert.ok(false, name + " - actual array null"); }
        assert.equal(actual.length, expected.length, name + " array lengths match");
        for (let i = 0; i < expected.length; i++) {
            equals("(" + name + " - item " + i + ")", actual[i], expected[i]);
        }

    } else if (typeof(expected) === "object") {
        if (actual == null) {
           if (expected === actual) { return; }
           assert.ok(false, name + " - actual object null");
        }

        let keys: { [ key: string ]: boolean } = {};
        Object.keys(expected).forEach((key) => { keys[key] = true; });
        Object.keys(actual).forEach((key) => { keys[key] = true; });

        Object.keys(keys).forEach((key) => {
            if ( typeof actual[key] === "string" && actual[key].toLowerCase && key === "type") {
                actual[key] = actual[key].toLowerCase();
            }
            equals("(" + name + " - key + " + key + ")", actual[key], expected[key]);
        });

    } else {
        if (actual == null) { assert.ok(false, name + " - actual null"); }

        // Modify this part for case-insensitive comparison for string values
        if (typeof actual === 'string' && typeof expected === 'string') {
            assert.equal(actual.toLowerCase(), expected.toLowerCase(), name + " matches (case-insensitive)");
        } else {
            assert.equal(actual, expected, name + " matches");
        }
    }
}

async function getRPCGasPrice(url:string | undefined){
    try {
        let response;
        do{
        response = await axios.post(url || "http://localhost:8610", {
            jsonrpc: "2.0",
            method: "quai_gasPrice",
            params: [],
            id: 1
        });
    } while (response.data.result == null)
        return response.data.result;
    
    } catch (error: any ) {
        throw new Error(`Error fetching block: ${error.message}`);
    }
}

async function sendTransaction(to: string){
    let txResponse;
    let typeValue;
    try{
        console.log("Nonce: ", await providerC1.getTransactionCount(wallet.address, 'latest'),)
        do{
        typeValue = getTxType(wallet.address, to);
        const gas = await getRPCGasPrice(process.env.RPC_URL);
        let tx: {
            from: string;
            to: string;
            value: any;  
            gasPrice: any;
            maxFeePerGas: any;
            maxPriorityFeePerGas:any;
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
            value: quais.parseEther("0.1"),  // Sending 0.1 ether
            gasPrice: gas*2,
            maxFeePerGas: quais.parseUnits('20', 'gwei'),
            maxPriorityFeePerGas: quais.parseUnits('20', 'gwei'),
            nonce: await providerC1.getTransactionCount(wallet.address, 'latest'),
            data: '',
            type: typeValue,
            gasLimit: typeValue == 0 ? 21000 : 42000,
            chainId: Number(process.env.CHAIN_ID || 1337),
        };
        txResponse = await wallet.sendTransaction(tx);
        console.log(txResponse)
        await stall(15000);
    } while (txResponse.hash == null);

        console.log(`Transaction hash for type ${typeValue}: `, txResponse.hash);
        return txResponse;
    } catch(error: any){
        console.error('Failed to send Transaction: ', error);
        return null;
    }
}

async function fetchRPCBlock(blockNumber: string | null) {
    try {
        let response;
        do {
        response = await axios.post(process.env.RPC_URL || "http://localhost:8610", {
        jsonrpc: "2.0",
        method: "quai_getBlockByNumber",
        params: [
            blockNumber || '0xA',
            false
        ],
        id: 1
        });
    }while (response.data.result.hash == null)
        return response.data.result;
    
    } catch (error: any) {
        throw error;
    }
}

async function fetchRPCBalance(address: string, url: string){
    try {
        let response;
        do{
            response = await axios.post(url, {
        jsonrpc: "2.0",
        method: "quai_getBalance",
        params: [
            address,
            'latest'
        ],
        id: 1
        });
    } while (response.data.result == null)
        return response.data.result;
    
    } catch (error: any) {
        throw new Error(`Error fetching block: ${error.message}`);
    }
}

async function fetchRPCTxReceipt(hash: string ,url: string){
    try {
        let response;
        do{
        response = await axios.post(url, {
        jsonrpc: "2.0",
        method: "quai_getTransactionReceipt",
        params: [
            hash
        ],
        id: 1
        });
        await stall(5000);
    } while (response.data.result.blockHash == null)
    return response.data.result;
    } catch (error:any) {
        throw new Error(`Error fetching block: ${error.message}`);
    }
}

describe("Test Provider Block operations", function() {
    let block: quais.BlockParams;

    before( async() => {
        const rpcBlock = await fetchRPCBlock('0xA')
        block = {
            hash: rpcBlock.hash,
            number: rpcBlock.number.map((stringNumber: string) => Number(stringNumber)),
            transactions: rpcBlock.transactions,
            parentHash: rpcBlock.parentHash,
            parentEntropy: rpcBlock.parentEntropy.map((entropy: string) => BigInt(entropy)),
            extTransactions: rpcBlock.extTransactions,
            timestamp: Number(rpcBlock.timestamp),
            nonce: rpcBlock.nonce,
            difficulty: BigInt(rpcBlock.difficulty),
            gasLimit: BigInt(rpcBlock.gasLimit),
            gasUsed: BigInt(rpcBlock.gasUsed),
            miner: rpcBlock.miner,
            extraData: rpcBlock.extraData,
            transactionsRoot: rpcBlock.transactionsRoot,
            evmRoot: rpcBlock.stateRoot,
            utxoRoot: rpcBlock.utxoRoot,
            receiptsRoot: rpcBlock.receiptsRoot,
            baseFeePerGas: BigInt(rpcBlock.baseFeePerGas),
            extRollupRoot: rpcBlock.extRollupRoot,
            extTransactionsRoot: rpcBlock.extTransactionsRoot,
            location: rpcBlock.location,
            manifestHash: rpcBlock.manifestHash,
            mixHash: rpcBlock.mixHash,
            order: rpcBlock.order,
            parentDeltaS: rpcBlock.parentDeltaS.map((delta:string) => BigInt(delta)),
            sha3Uncles: rpcBlock.sha3Uncles,
            size: BigInt(rpcBlock.size),
            uncles: rpcBlock.uncles,
            subManifest: rpcBlock.subManifest,
            totalEntropy: BigInt(rpcBlock.totalEntropy),
        }
    })

    it('should fetch block by number', async function () {
        let responseBlock = await providerC1.getBlock('0,0', '0xA') as quais.Block;
        assert.ok(responseBlock != null, "block != null");
    
        let { provider, ...formatBlock } = {
            ...responseBlock,
            transactions: responseBlock.transactions,
            extTransactions: responseBlock.extTransactions
        };
        equals("Block by Number", formatBlock, block);
    });
    
    it('should fetch block by hash', async function() {
        assert.ok(block.hash != null, 'block.hash != null')
        let responseBlock = await providerC1.getBlock('0,0', block.hash) as quais.Block;
        assert.ok(responseBlock != null, "block != null");
    
        let { provider, ...formatBlock } = {
            ...responseBlock,
            transactions: responseBlock.transactions,
            extTransactions: responseBlock.extTransactions
        };
        equals("Block by Hash", formatBlock, block);
    })
})


describe("Test Transaction operations", function() {
    let internalTx: any;
    let internalToExternalTx: any;

    it('should fetch balance after internal tx', async function () {
        this.timeout(60000)
        const oldBal = await fetchRPCBalance(destinationC1, process.env.RPC_URL || "http://localhost:8610");
        internalTx = await sendTransaction(destinationC1);
        await stall(30000)
        const expectedBal = BigInt(internalTx.value);
        const balance = await providerC1.getBalance(destinationC1);
        const actualBal = Number(balance) - Number(oldBal)
        assert.equal(actualBal, Number(expectedBal));
    });

    it('should get transaction receipt for internal tx', async function () {
        this.timeout(60000)
        const receipt = await fetchRPCTxReceipt(internalTx.hash, process.env.RPC_URL || "http://localhost:8610");
        const expectedReceipt = {
            blockHash: receipt.blockHash,
            contractAddress: receipt.contractAddress || null,
            blockNumber: Number(receipt.blockNumber),
            cumulativeGasUsed: BigInt(receipt.cumulativeGasUsed),
            gasPrice: BigInt(receipt.effectiveGasPrice),
            etxs: receipt.etxs,
            gasUsed: BigInt(receipt.gasUsed),
            logs: receipt.logs,
            logsBloom: receipt.logsBloom,
            status: Number(receipt.status),
            to: receipt.to,
            from: receipt.from,
            hash: receipt.transactionHash,
            index: Number(receipt.transactionIndex),
            type: receipt.type,
        }
        const receiptResponse = await providerC1.getTransactionReceipt(internalTx.hash);
        let { provider, ...receiptResult } = {
            ...receiptResponse,
            logs: receiptResponse?.logs
        };
        equals("Internal Tx Receipt", receiptResult, expectedReceipt);
        
    })

    it("should fetch transaction receipt for internal to external tx", async function () {
        this.timeout(120000)
        internalToExternalTx = await sendTransaction(destinationC2);
        await stall(60000);
        const receipt = await fetchRPCTxReceipt(internalToExternalTx.hash, process.env.RPC_URL || "http://localhost:8610");
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
                }
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
        }
        const receiptResponse = await providerC1.getTransactionReceipt(internalToExternalTx.hash);
        let { provider, ...receiptResult } = {
            ...receiptResponse,
            logs: receiptResponse?.logs
        };
        console.log(receiptResult);
        console.log(expectedReceipt)
        equals("Internal to External Tx Receipt", receiptResult, expectedReceipt);
    });
})

