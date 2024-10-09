// import { expect } from 'chai';
import assert from 'assert';
import { formatTransactionReceipt } from '../../providers/format.js';

// Mock objects similar to what would be returned by your JSON RPC response
const inZoneTxReceipt = {
    blockHash: '0x00001255e0040da82056914942ca2c1c3acc1fac7ab8b929d5ab6623c57a2895',
    blockNumber: '0x218f',
    contractAddress: null,
    cumulativeGasUsed: '0x5208',
    effectiveGasPrice: '0x3b9aca0a',
    outboundEtxs: null,
    from: '0x000001273B55E9e5998328216dB1b130c231221C',
    gasUsed: '0x5208',
    logs: [],
    logsBloom:
        '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    status: '0x1',
    to: '0x002a8cf994379232561556Da89C148eeec9539cd',
    transactionHash: '0x00200000dd95212762850c1859a6427fd292665f6c268f9a64213b07d0d4ec56',
    transactionIndex: '0x0',
    type: '0x0',
};

const crossZoneTxReceipt = {
    blockHash: '0x00000b7a410aef874c17779325f28aedde867fe7cfebba623897876850a45e3b',
    blockNumber: '0x219d',
    contractAddress: null,
    cumulativeGasUsed: '0xf618',
    effectiveGasPrice: '0x3b9aca0a',
    outboundEtxs: [
        {
            type: '0x1',
            nonce: null,
            gasPrice: null,
            minerTip: null,
            gasLimit: null,
            gas: '0x5208',
            value: '0x280de80',
            input: '0x',
            to: '0x010001D025371794a6eDb5feE8aC2F384EdD7463',
            accessList: [],
            isCoinbase: '0x0',
            from: '0x000001273B55E9e5998328216dB1b130c231221C',
            originatingTxHash: '0x0045007859423351f24f9dde0084b43817958aed81b5473fa04832b16f130131',
            etxIndex: '0x0',
            hash: '0x006401504cf1c7a8c6636dc0a007eaf9325a447cc617b1919b09f3341b4a4624',
            etxType: '0x0',
        },
    ],
    from: '0x000001273B55E9e5998328216dB1b130c231221C',
    gasUsed: '0xf618',
    logs: [],
    logsBloom:
        '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    status: '0x1',
    to: '0x010001D025371794a6eDb5feE8aC2F384EdD7463',
    transactionHash: '0x0045007859423351f24f9dde0084b43817958aed81b5473fa04832b16f130131',
    transactionIndex: '0x0',
    type: '0x0',
};

describe('Transaction Receipt Formatter', () => {
    it('should correctly format an in-zone transaction receipt', () => {
        const formattedReceipt = formatTransactionReceipt(inZoneTxReceipt);
        assert.equal(formattedReceipt.from, inZoneTxReceipt.from);
        assert.equal(formattedReceipt.to, inZoneTxReceipt.to);
        assert.equal(formattedReceipt.blockHash, inZoneTxReceipt.blockHash);
        assert.equal(formattedReceipt.hash, inZoneTxReceipt.transactionHash);
        assert.strictEqual(formattedReceipt.outboundEtxs, null);
    });

    it('should correctly format a cross-zone transaction receipt', () => {
        const formattedReceipt = formatTransactionReceipt(crossZoneTxReceipt);
        assert.equal(formattedReceipt.from, crossZoneTxReceipt.from);
        assert.equal(formattedReceipt.to, crossZoneTxReceipt.to);
        assert.equal(formattedReceipt.blockHash, crossZoneTxReceipt.blockHash);
        assert.equal(formattedReceipt.hash, crossZoneTxReceipt.transactionHash);
        assert.ok(formattedReceipt.outboundEtxs);
        assert.equal(formattedReceipt.outboundEtxs[0].from, crossZoneTxReceipt.outboundEtxs[0].from);
        assert.equal(formattedReceipt.outboundEtxs[0].hash, crossZoneTxReceipt.outboundEtxs[0].hash);
        assert.equal(formattedReceipt.outboundEtxs[0].nonce, crossZoneTxReceipt.outboundEtxs[0].nonce);
        assert.equal(formattedReceipt.outboundEtxs[0].gas, crossZoneTxReceipt.outboundEtxs[0].gas);
        assert.equal(formattedReceipt.outboundEtxs[0].gasPrice, crossZoneTxReceipt.outboundEtxs[0].gasPrice);
        assert.equal(formattedReceipt.outboundEtxs[0].minerTip, crossZoneTxReceipt.outboundEtxs[0].minerTip);
        assert.equal(formattedReceipt.outboundEtxs[0].value, crossZoneTxReceipt.outboundEtxs[0].value);
        assert.equal(formattedReceipt.outboundEtxs[0].input, crossZoneTxReceipt.outboundEtxs[0].input);
        assert.equal(formattedReceipt.outboundEtxs[0].to, crossZoneTxReceipt.outboundEtxs[0].to);
        assert.equal(
            formattedReceipt.outboundEtxs[0].originatingTxHash,
            crossZoneTxReceipt.outboundEtxs[0].originatingTxHash,
        );
        assert.equal(formattedReceipt.outboundEtxs[0].etxIndex, crossZoneTxReceipt.outboundEtxs[0].etxIndex);
    });
});
