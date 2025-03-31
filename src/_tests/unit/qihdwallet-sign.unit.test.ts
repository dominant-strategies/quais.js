import assert from 'assert';

import { loadTests } from '../utils.js';
import { schnorr } from '@noble/curves/secp256k1';
import { MuSigFactory } from '@brandonblack/musig';
import { TestCaseQiTransaction, TxInput, TxOutput, Zone } from '../types.js';

import {
    Mnemonic,
    QiHDWallet,
    QiTransaction,
    getBytes,
    hexlify,
    musigCrypto,
    keccak256,
    toUtf8Bytes,
} from '../../index.js';

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
            const digest = getBytes(keccak256(qiTx.unsignedSerialized));
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

interface signMessageTestCase {
    mnemonic: string;
    data: Array<{
        name: string;
        message: string;
    }>;
}

describe('QiHDWallet: Test sign personal menssage', function () {
    const tests = loadTests<signMessageTestCase>('qi-sign-message');
    for (const test of tests) {
        const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
        const qiWallet = QiHDWallet.fromMnemonic(mnemonic);
        const addrInfo = qiWallet.getNextAddressSync(0, Zone.Cyprus1);
        for (const data of test.data) {
            it(`tests signing personal message: ${data.name}`, async function () {
                const signature = await qiWallet.signMessage(addrInfo.address, data.message);
                const messageBytes =
                    typeof data.message === 'string'
                        ? getBytes(toUtf8Bytes(data.message)) // Add UTF-8 encoding for strings
                        : data.message;
                const digest = getBytes(keccak256(messageBytes));
                const verified = verifySchnorrSignature(signature, digest, addrInfo.pubKey);
                assert.equal(verified, true);
            });
        }
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
