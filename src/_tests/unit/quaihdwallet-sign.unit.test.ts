import assert from 'assert';

import { loadTests } from '../utils.js';

import { TestCaseQuaiTransaction, TestCaseQuaiTypedData, Zone, TestCaseQuaiMessageSign } from '../types.js';

import { QuaiTransaction, recoverAddress, Signature } from '../../index.js';

import { Mnemonic, QuaiHDWallet } from '../../index.js';

describe('Test transaction signing', function () {
    const tests = loadTests<TestCaseQuaiTransaction>('quai-transaction');
    for (const test of tests) {
        let txHash: string;
        let signature: Signature;
        it(`tests signing an EIP-155 transaction: ${test.name}`, async function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);
            quaiWallet.getNextAddressSync(test.params.account, test.params.zone);
            const txData = test.transaction;
            const signedTxSerialized = await quaiWallet.signTransaction(txData);
            assert.equal(signedTxSerialized, test.signed, 'signed');

            const signedTxObj = QuaiTransaction.from(signedTxSerialized);
            txHash = signedTxObj.digest;
            signature = signedTxObj.signature;
        });

        it(`tests verifying the signature: ${test.name}`, function () {
            const signerAddress = recoverAddress(txHash, signature);
            assert.equal(
                signerAddress,
                test.transaction.from,
                `Signer address expected to be ${test.transaction.from} but got ${signerAddress}`,
            );
        });
    }
});

describe('Test Typed-Data Signing (EIP-712)', function () {
    const tests = loadTests<TestCaseQuaiTypedData>('sign-typed-data');
    for (const test of tests) {
        it(`tests signing typed-data: ${test.name}`, async function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);
            const addrInfo = quaiWallet.getNextAddressSync(0, Zone.Cyprus1);
            const sig = await quaiWallet.signTypedData(addrInfo.address, test.domain, test.types, test.data);
            assert.equal(sig, test.signature, 'signature');
            const signerAddress = recoverAddress(test.digest, sig);
            assert.equal(signerAddress, addrInfo.address, 'signerAddress');
        });
    }
});

describe('Test sign message', function () {
    const tests = loadTests<TestCaseQuaiMessageSign>('quai-sign-message');
    for (const test of tests) {
        it(`tests signing personal message: ${test.name}`, async function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);
            const addrInfo = quaiWallet.getNextAddressSync(0, Zone.Cyprus1);
            const sig = await quaiWallet.signMessage(addrInfo.address, test.message);
            assert.equal(sig, test.signature, 'signature');
            const signerAddress = recoverAddress(test.digest, sig);
            assert.equal(signerAddress, addrInfo.address, 'signerAddress');
        });
    }
});
