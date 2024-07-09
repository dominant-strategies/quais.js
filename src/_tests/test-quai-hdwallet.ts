import assert from 'assert';

import { loadTests, convertToZone } from './utils.js';

import {
    TestCaseQuaiTransaction,
    TestCaseQuaiSerialization,
    TestCaseQuaiAddresses,
    TestCaseQuaiTypedData,
    AddressInfo,
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
        it(`tests addresses generation and retrieval: ${test.name}`, function () {
            const generatedAddresses: AddressInfo[] = [];
            for (const { params, expectedAddress } of test.addresses) {
                const addrInfo = quaiWallet.getNextAddressSync(params.account, params.zone);
                assert.deepEqual(addrInfo, expectedAddress);
                generatedAddresses.push(addrInfo);

                const retrievedAddrInfo = quaiWallet.getAddressInfo(expectedAddress.address);
                assert.deepEqual(retrievedAddrInfo, expectedAddress);

                const accountMap = new Map<number, AddressInfo[]>();
                for (const addrInfo of generatedAddresses) {
                    if (!accountMap.has(addrInfo.account)) {
                        accountMap.set(addrInfo.account, []);
                    }
                    accountMap.get(addrInfo.account)!.push(addrInfo);
                }
                for (const [account, expectedAddresses] of accountMap) {
                    const retrievedAddresses = quaiWallet.getAddressesForAccount(account);
                    assert.deepEqual(retrievedAddresses, expectedAddresses);
                }

                const zoneMap = new Map<string, AddressInfo[]>();
                for (const addrInfo of generatedAddresses) {
                    if (!zoneMap.has(addrInfo.zone)) {
                        zoneMap.set(addrInfo.zone, []);
                    }
                    zoneMap.get(addrInfo.zone)!.push(addrInfo);
                }
                for (const [zone, expectedAddresses] of zoneMap) {
                    const zoneEnum = convertToZone(zone);
                    const retrievedAddresses = quaiWallet.getAddressesForZone(zoneEnum);
                    assert.deepEqual(retrievedAddresses, expectedAddresses);
                }
            }
        });
    }
});

describe('Test transaction signing', function () {
    const tests = loadTests<TestCaseQuaiTransaction>('quai-transaction');
    for (const test of tests) {
        it(`tests signing an EIP-155 transaction: ${test.name}`, async function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);
            quaiWallet.getNextAddressSync(test.params.account, test.params.zone);
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
            for (const param of test.params) {
                quaiWallet.getNextAddressSync(param.account, param.zone);
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
