import assert from 'assert';

import { loadTests, convertToZone } from './utils.js';

import {
    TestCaseQuaiTransaction,
    TestCaseQuaiSerialization,
    TestCaseQuaiAddresses,
    TestCaseQuaiTypedData,
    addressInfo,
    Zone,
    TestCaseQuaiMessageSign,
} from './types.js';

import { recoverAddress } from '../index.js';

import { Mnemonic, QuaiHDWallet } from '../index.js';

describe('Test address generation and retrieval', function () {
    const tests = loadTests<TestCaseQuaiAddresses>('quai-addresses');
    for (const test of tests) {
        const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
        const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);
        it(`tests method 'getNextAddress()': ${test.name}`, function () {
            const newAddresses: addressInfo[] = [];
            for (const param of test.params) {
                const addrInfo = quaiWallet.getNextAddress(param.account, param.zone);
                newAddresses.push(addrInfo);
            }
            assert.deepEqual(newAddresses, test.expectedAddresses);
        });
        it(`tests method 'getAddressInfo()': ${test.name}`, function () {
            for (const addrInfo of test.expectedAddresses) {
                const retrievedAddrInfo = quaiWallet.getAddressInfo(addrInfo.address);
                assert.deepEqual(retrievedAddrInfo, addrInfo);
            }
        });
        it(`tests method 'getAddressesForAccount()': ${test.name}`, function () {
            const expectedAddressesMap = new Map<number, addressInfo[]>();
            for (const addrInfo of test.expectedAddresses) {
                if (!expectedAddressesMap.has(addrInfo.account)) {
                    expectedAddressesMap.set(addrInfo.account, []);
                }
                expectedAddressesMap.get(addrInfo.account)!.push(addrInfo);
            }
            for (const [account, expectedAddresses] of expectedAddressesMap) {
                const retrievedAddresses = quaiWallet.getAddressesForAccount(account);
                assert.deepEqual(retrievedAddresses, expectedAddresses);
            }
        });
        it(`tests method 'getAddressesForZone()': ${test.name}`, function () {
            const expectedAddressesMap = new Map<string, addressInfo[]>();
            for (const addrInfo of test.expectedAddresses) {
                if (!expectedAddressesMap.has(addrInfo.zone)) {
                    expectedAddressesMap.set(addrInfo.zone, []);
                }
                expectedAddressesMap.get(addrInfo.zone)!.push(addrInfo);
            }
            for (const [zone, expectedAddresses] of expectedAddressesMap) {
                const zoneEnum = convertToZone(zone);
                const retrievedAddresses = quaiWallet.getAddressesForZone(zoneEnum);
                assert.deepEqual(retrievedAddresses, expectedAddresses);
            }
        });
    }
});

describe('Test transaction signing', function () {
    const tests = loadTests<TestCaseQuaiTransaction>('quai-transaction');
    for (const test of tests) {
        if (!test.signed) {
            continue;
        }
        it(`tests signing an EIP-155 transaction: ${test.name}`, async function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);
            quaiWallet.getNextAddress(test.account, test.zone);
            const txData = test.transaction;
            const signed = await quaiWallet.signTransaction(txData);
            assert.equal(signed, test.signed, 'signed');
        });
    }
});

describe('Test serialization and deserialization of QuaiHDWallet', function () {
    const tests = loadTests<TestCaseQuaiSerialization>('quai-serialization');
    for (const test of tests) {
        const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
        const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);
        let serialized: any;
        it(`tests serialization QuaiHDWallet: ${test.name}`, async function () {
            for (let i = 0; i < test.totalAddresses; i++) {
                quaiWallet.getNextAddress(test.account, test.zone);
            }
            serialized = quaiWallet.serialize();
            assert.deepEqual(serialized, test.serialized);
        });

        it(`tests deserialization QuaiHDWallet: ${test.name}`, async function () {
            const deserialized = await QuaiHDWallet.deserialize(serialized);
            assert.deepEqual(deserialized.serialize(), serialized);
        });
    }
});

describe('Test Typed-Data Signing (EIP-712)', function () {
    const tests = loadTests<TestCaseQuaiTypedData>('typed-data');
    for (const test of tests) {
        it(`tests signing typed-data: ${test.name}`, async function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);
            const addrInfo = quaiWallet.getNextAddress(0, Zone.Cyprus1);
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
            const addrInfo = quaiWallet.getNextAddress(0, Zone.Cyprus1);
            const sig = await quaiWallet.signMessage(addrInfo.address, test.message);
            assert.equal(sig, test.signature, 'signature');
            const signerAddress = recoverAddress(test.digest, sig);
            assert.equal(signerAddress, addrInfo.address, 'signerAddress');
        });
    }
});
