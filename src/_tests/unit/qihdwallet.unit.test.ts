import assert from 'assert';

import { loadTests, convertToZone } from '../utils.js';
import { schnorr } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { MuSigFactory } from '@brandonblack/musig';
import {
    TestCaseQiAddresses,
    TestCaseQiSignMessage,
    TestCaseQiTransaction,
    TestCaseQiSerialization,
    AddressInfo,
    TxInput,
    TxOutput,
    Zone,
} from '../types.js';

import { Mnemonic, QiHDWallet, QiTransaction, getBytes, hexlify, musigCrypto } from '../../index.js';

describe('QiHDWallet: Test address generation and retrieval', function () {
    const tests = loadTests<TestCaseQiAddresses>('qi-addresses');
    for (const test of tests) {
        const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
        const qiWallet = QiHDWallet.fromMnemonic(mnemonic);
        it(`tests addresses generation and retrieval: ${test.name}`, function () {
            const generatedAddresses: AddressInfo[] = [];
            for (const { params, expectedAddress } of test.addresses) {
                const addrInfo = qiWallet.getNextAddressSync(params.account, params.zone);
                assert.deepEqual(addrInfo, expectedAddress);
                generatedAddresses.push(addrInfo);

                const retrievedAddrInfo = qiWallet.getAddressInfo(expectedAddress.address);
                assert.deepEqual(retrievedAddrInfo, expectedAddress);

                const accountMap = new Map<number, AddressInfo[]>();
                for (const addrInfo of generatedAddresses) {
                    if (!accountMap.has(addrInfo.account)) {
                        accountMap.set(addrInfo.account, []);
                    }
                    accountMap.get(addrInfo.account)!.push(addrInfo);
                }
                for (const [account, expectedAddresses] of accountMap) {
                    const retrievedAddresses = qiWallet.getAddressesForAccount(account);
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
                    const retrievedAddresses = qiWallet.getAddressesForZone(zoneEnum);
                    assert.deepEqual(retrievedAddresses, expectedAddresses);
                }
            }
        });
        it(`tests change addresses generation and retrieval: ${test.name}`, function () {
            for (const { params, expectedAddress } of test.changeAddresses) {
                const addrInfo = qiWallet.getNextChangeAddressSync(params.account, params.zone);
                assert.deepEqual(addrInfo, expectedAddress);
            }
        });
    }
});

describe('QiHDWallet: Test serialization and deserialization of QiHDWallet', function () {
    this.timeout(10000);
    const tests = loadTests<TestCaseQiSerialization>('qi-serialization');
    for (const test of tests) {
        const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
        const qiWallet = QiHDWallet.fromMnemonic(mnemonic);
        let serialized: any;
        it(`tests serialization QuaiHDWallet: ${test.name}`, async function () {
            for (const param of test.params) {
                qiWallet.getNextAddressSync(param.account, param.zone);
                qiWallet.getNextChangeAddressSync(param.account, param.zone);
            }
            qiWallet.importOutpoints(test.outpoints);
            serialized = qiWallet.serialize();
            assert.deepEqual(serialized, test.serialized);
        });

        it(`tests deserialization QiHDWallet: ${test.name}`, async function () {
            const deserialized = await QiHDWallet.deserialize(serialized);
            assert.deepEqual(deserialized.serialize(), serialized);
        });
    }
});

describe('QiHDWallet: Test transaction signing', function () {
    const tests = loadTests<TestCaseQiTransaction>('qi-transaction');
    for (const test of tests) {
        it(`tests signing a Qi transaction: ${test.name}`, async function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const qiWallet = QiHDWallet.fromMnemonic(mnemonic);
            for (const param of test.params) {
                qiWallet.getNextAddressSync(param.account, param.zone);
            }
            qiWallet.importOutpoints(test.outpoints);
            const qiTx = createQiTransaction(
                test.transaction.chainId,
                test.transaction.txInputs,
                test.transaction.txOutputs,
            );
            const digest = keccak_256(qiTx.unsignedSerialized);
            const signedSerialized = await qiWallet.signTransaction(qiTx);

            const signedTx = QiTransaction.from(signedSerialized);
            const signature = signedTx.signature;
            let verified = false;
            if (signedTx.txInputs.length > 1) {
                const publicKeysArray = signedTx.txInputs.map((txInput) => txInput.pubkey);
                verified = verifyMusigSignature(signature, digest, publicKeysArray);
            } else {
                const pubkey = signedTx.txInputs[0].pubkey;
                verified = verifySchnorrSignature(signature, digest, pubkey);
            }
            assert.equal(verified, true);
        });
    }
});

describe('QiHDWallet: Test sign personal menssage', function () {
    const tests = loadTests<TestCaseQiSignMessage>('qi-sign-message');
    for (const test of tests) {
        it(`tests signing personal message: ${test.name}`, async function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const qiWallet = QiHDWallet.fromMnemonic(mnemonic);
            const addrInfo = qiWallet.getNextAddressSync(0, Zone.Cyprus1);
            const signature = await qiWallet.signMessage(addrInfo.address, test.message);
            const digest = keccak_256(test.message);
            const verified = verifySchnorrSignature(signature, digest, addrInfo.pubKey);
            assert.equal(verified, true);
        });
    }
});

function createQiTransaction(chainId: number, inputs: TxInput[], outputs: TxOutput[]): QiTransaction {
    const tx = new QiTransaction();
    tx.chainId = chainId;
    tx.txInputs = inputs;
    tx.txOutputs = outputs;
    return tx;
}

function verifySchnorrSignature(signature: string, digest: Uint8Array, pubkey: string): boolean {
    pubkey = '0x' + pubkey.slice(4);
    return schnorr.verify(getBytes(signature), digest, getBytes(pubkey));
}

function verifyMusigSignature(signature: string, digest: Uint8Array, publicKeysArray: string[]) {
    const musig = MuSigFactory(musigCrypto);

    const pubkeysUintArray = publicKeysArray.map((pubkey) => getBytes(pubkey));

    const aggPublicKeyObj = musig.keyAgg(pubkeysUintArray);

    const aggPublicKey = hexlify(aggPublicKeyObj.aggPublicKey);

    // remove the last 32 bytes (64 hex) from the aggPublicKey
    const compressedPubKey = aggPublicKey.slice(0, -64);

    return verifySchnorrSignature(signature, digest, compressedPubKey);
}
