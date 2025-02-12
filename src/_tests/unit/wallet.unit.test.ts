import assert from 'assert';

import { loadTests } from '../utils.js';

import type { TestCaseAccount, TestCaseTypedData, TestCaseTransaction } from '../types.js';

import { Wallet } from '../../index.js';

describe('Test Private Key Wallet', function () {
    const tests = loadTests<TestCaseAccount>('accounts');

    tests.forEach(({ name, privateKey, address }) => {
        it(`creates wallet: ${name}`, function () {
            const wallet = new Wallet(privateKey);
            assert.equal(wallet.privateKey, privateKey);
            assert.equal(wallet.address, address);
        });
    });
});

describe('Test Transaction Signing', function () {
    const tests = loadTests<TestCaseTransaction>('transactions');

    for (const test of tests) {
        if (!test.signed) {
            continue;
        }
        it(`tests signing an EIP-155 transaction: ${test.name}`, async function () {
            const wallet = new Wallet(test.privateKey);
            const txData = Object.assign({}, test.transaction, {
                type: 0,
                accessList: [],
                gasLimit: 0,
            });
            const signed = await wallet.signTransaction(txData);
            assert.equal(signed, test.signed, 'signed');
        });
    }
});

describe('Test Message Signing (EIP-191)', function () {});

describe('Test Typed-Data Signing (EIP-712)', function () {
    const tests = loadTests<TestCaseTypedData>('typed-data');
    for (const test of tests) {
        const { privateKey, signature } = test;
        if (privateKey == null || signature == null) {
            continue;
        }
        it(`tests signing typed-data: ${test.name}`, async function () {
            const wallet = new Wallet(privateKey);
            const sig = await wallet.signTypedData(test.domain, test.types, test.data);
            assert.equal(sig, signature, 'signature');
        });
    }
});

// describe("Test Wallet Encryption", function() {
//     const password = "foobar";

//     // Loop:
//     //  1 : random wallet (uses QuaiHDWallet under the hood)
//     //  2 : Wallet using private key (uses Wallet explicitly)

//     for (let i = 0; i < 2; i++) {
//         let wallet: Wallet | QuaiHDWallet = Wallet.createRandom("m/44'/994'/0'/0");

//         it("encrypts a random wallet: sync", function() {
//             this.timeout(30000);
//             const json = wallet.encryptSync(password);
//             const decrypted = Wallet.fromEncryptedJsonSync(json, password);
//             assert.equal(decrypted.address, wallet.address, "address");
//         });

//         it("encrypts a random wallet: async", async function() {
//             this.timeout(30000);
//             const json = await wallet.encrypt(password);
//             const decrypted = await Wallet.fromEncryptedJson(json, password);
//             assert.equal(decrypted.address, wallet.address, "address");
//         });

//         wallet = new Wallet(hexlify(randomBytes(32)));
//     }
// });
