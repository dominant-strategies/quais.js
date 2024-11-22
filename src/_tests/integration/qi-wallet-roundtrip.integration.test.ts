import assert from 'assert';
import { loadTests } from '../utils.js';
import {
    Mnemonic,
    QiHDWallet,
    Zone,
    QiAddressInfo,
    QiTransactionResponse,
    OutpointInfo,
    JsonRpcProvider,
} from '../../index.js';

import dotenv from 'dotenv';
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });
dotenv.config({ path: `.env`, override: false });

interface QiRoundtripTestCase {
    alice: {
        mnemonic: string;
        initialState: {
            balance: bigint;
            outpoints: Array<{
                account: number;
                address: string;
                outpoint: OutpointInfo;
                zone: string;
            }>;
            addresses: {
                external: Array<QiAddressInfo>;
                change: Array<QiAddressInfo>;
                payment: Array<QiAddressInfo>;
            };
        };
        sendAmount: bigint;
    };
    bob: {
        mnemonic: string;
        initialState: {
            balance: bigint;
            outpoints: Array<OutpointInfo>;
            addresses: {
                external: Array<QiAddressInfo>;
                change: Array<QiAddressInfo>;
                payment: Array<QiAddressInfo>;
            };
        };
        sendAmount: bigint;
    };
}

describe('QiHDWallet Roundtrip Transaction', function () {
    const tests = loadTests<QiRoundtripTestCase>('qi-wallet-roundtrip');
    let aliceWallet: QiHDWallet;
    let bobWallet: QiHDWallet;
    let alicePaymentCode: string;
    let bobPaymentCode: string;
    const provider = new JsonRpcProvider(process.env.RPC_URL);

    for (const test of tests) {
        this.timeout(1200000);
        const aliceMnemonic = Mnemonic.fromPhrase(test.alice.mnemonic);
        aliceWallet = QiHDWallet.fromMnemonic(aliceMnemonic);
        aliceWallet.connect(provider);

        const bobMnemonic = Mnemonic.fromPhrase(test.bob.mnemonic);
        bobWallet = QiHDWallet.fromMnemonic(bobMnemonic);
        bobWallet.connect(provider);

        alicePaymentCode = aliceWallet.getPaymentCode(0);
        bobPaymentCode = bobWallet.getPaymentCode(0);

        aliceWallet.openChannel(bobPaymentCode);
        bobWallet.openChannel(alicePaymentCode);

        it('validates Alice wallet initial state', async function () {
            await aliceWallet.scan(Zone.Cyprus1);

            assert.equal(aliceWallet.getBalanceForZone(Zone.Cyprus1).toString(), test.alice.initialState.balance);
            assert.deepEqual(aliceWallet.getOutpoints(Zone.Cyprus1), test.alice.initialState.outpoints);
            assert.deepEqual(aliceWallet.getAddressesForZone(Zone.Cyprus1), test.alice.initialState.addresses.external);
            assert.deepEqual(
                aliceWallet.getChangeAddressesForZone(Zone.Cyprus1),
                test.alice.initialState.addresses.change,
            );
            assert.deepEqual(
                aliceWallet.getPaymentChannelAddressesForZone(bobPaymentCode, Zone.Cyprus1),
                test.alice.initialState.addresses.payment,
            );
        });

        it('validates Bob wallet initial state', async function () {
            await bobWallet.scan(Zone.Cyprus1);

            assert.equal(bobWallet.getBalanceForZone(Zone.Cyprus1).toString(), test.bob.initialState.balance);
            assert.deepEqual(bobWallet.getOutpoints(Zone.Cyprus1), test.bob.initialState.outpoints);
            assert.deepEqual(bobWallet.getAddressesForZone(Zone.Cyprus1), test.bob.initialState.addresses.external);
            assert.deepEqual(bobWallet.getChangeAddressesForZone(Zone.Cyprus1), test.bob.initialState.addresses.change);
            assert.deepEqual(
                bobWallet.getPaymentChannelAddressesForZone(alicePaymentCode, Zone.Cyprus1),
                test.bob.initialState.addresses.payment,
            );
        });

        it('validates first transaction is sent and confirmed', async function () {
            const tx = (await aliceWallet.sendTransaction(
                bobPaymentCode,
                test.alice.sendAmount,
                Zone.Cyprus1,
                Zone.Cyprus1,
            )) as QiTransactionResponse;

            await assert.doesNotReject(async () => {
                await tx.wait();
            });
            console.log(`... succesfully sent ${test.alice.sendAmount} to Bob`);
        });

        let aliceFee: bigint;
        it('validates Alice and Bob wallet balance after first transaction', async function () {
            await aliceWallet.sync(Zone.Cyprus1);
            await bobWallet.sync(Zone.Cyprus1);

            const bobBalance = bobWallet.getBalanceForZone(Zone.Cyprus1);
            assert.equal(
                bobBalance.toString(),
                test.alice.sendAmount.toString(),
                `Expected Bob's balance to be ${test.alice.sendAmount.toString()} but got ${bobBalance.toString()}`,
            );

            // Alice's balance should be lower than the initial balance minus the amount sent (because of the tx fee)
            const aliceBalance = await aliceWallet.getBalanceForZone(Zone.Cyprus1);
            const aliceBalanceWithoutFee = BigInt(test.alice.initialState.balance) - BigInt(test.alice.sendAmount);
            aliceFee = BigInt(aliceBalanceWithoutFee) - BigInt(aliceBalance);
            assert.ok(
                aliceBalance < aliceBalanceWithoutFee,
                `Expected Alice's balance to be less than ${aliceBalanceWithoutFee.toString()} but got ${aliceBalance.toString()}`,
            );
        });

        it('validates second transaction is sent and confirmed', async function () {
            const tx = (await bobWallet.sendTransaction(
                alicePaymentCode,
                test.bob.sendAmount,
                Zone.Cyprus1,
                Zone.Cyprus1,
            )) as QiTransactionResponse;

            await assert.doesNotReject(async () => {
                await tx.wait();
            });
            console.log(`... succesfully sent ${test.bob.sendAmount} to Alice`);
        });

        it('validates Alice and Bob wallet balance after second transaction', async function () {
            await aliceWallet.sync(Zone.Cyprus1);
            await bobWallet.sync(Zone.Cyprus1);

            const aliceBalance = await aliceWallet.getBalanceForZone(Zone.Cyprus1);
            const bobBalance = await bobWallet.getBalanceForZone(Zone.Cyprus1);

            const bobBalanceWithoutFee =
                BigInt(test.bob.initialState.balance) + BigInt(test.alice.sendAmount) - BigInt(test.bob.sendAmount);
            const aliceExpectedBalance =
                BigInt(test.alice.initialState.balance) -
                BigInt(test.alice.sendAmount) +
                BigInt(test.bob.sendAmount) -
                aliceFee;
            assert.equal(
                aliceBalance.toString(),
                aliceExpectedBalance.toString(),
                `Expected Alice's balance to be ${aliceExpectedBalance.toString()} but got ${aliceBalance.toString()}`,
            );

            assert.ok(
                bobBalance < bobBalanceWithoutFee,
                `Expected Bob's balance to be less than ${bobBalanceWithoutFee.toString()} but got ${bobBalance.toString()}`,
            );
        });
    }
});
