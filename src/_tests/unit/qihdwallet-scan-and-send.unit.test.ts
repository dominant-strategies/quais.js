import assert from 'assert';
import { loadTests } from '../utils.js';
import {
    Mnemonic,
    QiHDWallet,
    Zone,
    OutpointInfo,
    Block,
    QiAddressInfo,
    Network,
    QiTransaction,
    getBytes,
    musigCrypto,
    hexlify,
} from '../../index.js';
import { Outpoint } from '../../transaction/utxo.js';
import { QiPerformActionTransaction } from '../../providers/abstract-provider.js';
import { MockProvider } from './mockProvider.js';
import { schnorr } from '@noble/curves/secp256k1';
import { MuSigFactory } from '@brandonblack/musig';

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

import dotenv from 'dotenv';
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });
dotenv.config({ path: `.env`, override: false });

interface ScanTestCase {
    name: string;
    mnemonic: string;
    bob_mnemonic: string;
    amount_to_send_to_bob: number;
    provider_outpoints: Array<{
        address: string;
        outpoints: Array<Outpoint>;
    }>;
    provider_locked_balance: Array<{
        address: string;
        balance: number;
    }>;
    provider_balance: Array<{
        address: string;
        balance: number;
    }>;
    provider_blocks: Array<{
        key: string;
        block: Block;
    }>;
    expected_external_addresses: Array<QiAddressInfo>;
    expected_change_addresses: Array<QiAddressInfo>;
    expected_outpoints_info: Array<OutpointInfo>;
    expected_balance: number;
    provider_estimate_fee_for_qi: Array<{
        input: QiPerformActionTransaction;
        output: number;
    }>;
    provider_network: Network;
    provider_broadcast_transaction_receipt: string;
    expected_signed_tx: string;
}

describe('QiHDWallet scan and send transaction', async function () {
    const tests = loadTests<ScanTestCase>('qi-wallet-scan-and-send');

    for (const test of tests) {
        describe(test.name, async function () {
            this.timeout(1200000);

            const mockProvider = new MockProvider();

            // set the provider outpoints
            for (const outpoint of test.provider_outpoints) {
                mockProvider.setOutpoints(outpoint.address, outpoint.outpoints);
            }

            // set the provider blocks
            for (const block of test.provider_blocks) {
                mockProvider.setBlock(block.key, block.block);
            }

            // set the provider locked balace
            for (const lockedBalance of test.provider_locked_balance) {
                mockProvider.setLockedBalance(lockedBalance.address, BigInt(lockedBalance.balance));
            }

            // set the provider balance
            for (const balance of test.provider_balance) {
                mockProvider.setBalance(balance.address, BigInt(balance.balance));
            }

            // set the provider estimate fee for Qi
            for (const estimateFeeForQi of test.provider_estimate_fee_for_qi) {
                mockProvider.setEstimateFeeForQi(estimateFeeForQi.input, estimateFeeForQi.output);
            }

            // set the provider network
            mockProvider.setNetwork(test.provider_network);

            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const aliceWallet = QiHDWallet.fromMnemonic(mnemonic);
            aliceWallet.connect(mockProvider);

            const bobMnemonic = Mnemonic.fromPhrase(test.bob_mnemonic);
            const bobWallet = QiHDWallet.fromMnemonic(bobMnemonic);

            const alicePaymentCode = aliceWallet.getPaymentCode(0);
            const bobPaymentCode = bobWallet.getPaymentCode(0);
            aliceWallet.openChannel(bobPaymentCode);
            bobWallet.openChannel(alicePaymentCode);

            it('it scans Alice wallet with no errors', async function () {
                try {
                    await aliceWallet.scan(Zone.Cyprus1);
                    assert.ok(true, '====> TESTING: scan completed');
                } catch (error) {
                    console.error('====> TESTING: error: ', error);
                    assert.fail('====> TESTING: error: ', error);
                }
            });

            it('validates expected Alice external addresses', async function () {
                const externalAddresses = aliceWallet.getAddressesForZone(Zone.Cyprus1);
                const sortedExternalAddresses = externalAddresses.sort((a, b) => a.address.localeCompare(b.address));
                const sortedExpectedExternalAddresses = test.expected_external_addresses.sort((a, b) =>
                    a.address.localeCompare(b.address),
                );
                assert.deepEqual(sortedExternalAddresses, sortedExpectedExternalAddresses);
            });

            it('validates expected Alice change addresses', async function () {
                const changeAddresses = aliceWallet.getChangeAddressesForZone(Zone.Cyprus1);
                const sortedChangeAddresses = changeAddresses.sort((a, b) => a.address.localeCompare(b.address));
                const sortedExpectedChangeAddresses = test.expected_change_addresses.sort((a, b) =>
                    a.address.localeCompare(b.address),
                );
                assert.deepEqual(sortedChangeAddresses, sortedExpectedChangeAddresses);
            });

            it('validates wallet balance', async function () {
                const balance = await aliceWallet.getBalanceForZone(Zone.Cyprus1);
                assert.equal(balance.toString(), test.expected_balance.toString());
            });

            it('validates expected outpoints info', async function () {
                assert.deepEqual(aliceWallet.getOutpoints(Zone.Cyprus1), test.expected_outpoints_info);
            });

            it('sends transaction', async function () {
                const aliceToBobTx = await aliceWallet.sendTransaction(
                    bobPaymentCode,
                    BigInt(test.amount_to_send_to_bob),
                    Zone.Cyprus1,
                    Zone.Cyprus1,
                );
                assert.ok(aliceToBobTx);
            });

            it('validate signed transaction', function () {
                const signedTransaction = mockProvider.getSignedTransaction();
                const expectedSignedTx = test.expected_signed_tx;

                const tx = QiTransaction.from(signedTransaction);
                const expectedTx = QiTransaction.from(expectedSignedTx);

                // compare everyhing but the hash and signature
                assert.deepEqual(tx.txInputs, expectedTx.txInputs);
                assert.deepEqual(tx.txOutputs, expectedTx.txOutputs);
                assert.deepEqual(tx.type, expectedTx.type);
                assert.deepEqual(tx.chainId, expectedTx.chainId);

                console.log(`\n      ℹ️  Transaction has ${tx.txInputs.length} input(s)`);
                let valid: boolean;
                if (tx.txInputs.length === 1) {
                    console.log('      🔑 Validating Single-Key Schnorr Signature');
                    valid = validateSchnorrSignature(tx);
                } else {
                    console.log('      🔑 Validating Multi-Key 👥 MuSig Signature');
                    console.log(`         Number of inputs: ${tx.txInputs.length}`);
                    valid = validateMuSigSignature(tx);
                }
                assert.ok(valid);
            });
        });
    }
});

function validateSchnorrSignature(tx: QiTransaction): boolean {
    const digest = tx.digest;
    const signature = tx.signature;
    const pubkey = tx.txInputs[0].pubkey;

    const pubkeyBytes = getBytes('0x' + pubkey.slice(4));
    const signatureBytes = getBytes(signature);
    const hashBytes = getBytes(digest);

    return schnorr.verify(signatureBytes, hashBytes, pubkeyBytes);
}

function validateMuSigSignature(tx: QiTransaction): boolean {
    const musig = MuSigFactory(musigCrypto);
    const pubkeys = tx.txInputs.map((input) => getBytes(input.pubkey));
    const aggPublicKeyObj = musig.keyAgg(pubkeys);

    const aggPublicKey = hexlify(aggPublicKeyObj.aggPublicKey);
    const compressedPubKey = aggPublicKey.slice(0, -64);
    const pubkey = '0x' + compressedPubKey.slice(4);

    const signatureBytes = getBytes(tx.signature);
    const hashBytes = getBytes(tx.digest);
    const pubkeyBytes = getBytes(pubkey);

    return schnorr.verify(signatureBytes, hashBytes, pubkeyBytes);
}
