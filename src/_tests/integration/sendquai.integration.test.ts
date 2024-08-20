import assert from 'assert';

import { JsonRpcProvider, Wallet } from '../../index.js';

import dotenv from 'dotenv';
import { QuaiTransactionResponse } from '../../providers/provider.js';
dotenv.config();

const testCases = [
    {
        description: 'Cyprus1 to Cyprus1',
        receiverAddressEnvVar: 'CYPRUS1_ADDR_2',
        skipReceiverBalanceCheck: false,
    },
    {
        description: 'Cyprus1 to Cyprus2',
        receiverAddressEnvVar: 'CYPRUS2_ADDR_1',
        skipReceiverBalanceCheck: true,
    },
    {
        description: 'Cyprus1 to Paxos1',
        receiverAddressEnvVar: 'PAXOS1_ADDR_1',
        skipReceiverBalanceCheck: true,
    },
];

describe('Test sending Quai', function () {
    this.timeout(120000);

    let provider: JsonRpcProvider;
    let wallet: Wallet;
    const quaiAmount = 42000000000n;

    before(async () => {
        provider = new JsonRpcProvider(process.env.RPC_URL);
        wallet = new Wallet(process.env.CYPRUS1_PRIVKEY_1!, provider);
        const senderBalance = await provider.getBalance(wallet.address);
        // ensure balance is greater than 0.1 QUAI
        assert(senderBalance > 100000000000000000n, 'Insufficient balance to run the tests');
    });

    testCases.forEach(({ description, receiverAddressEnvVar, skipReceiverBalanceCheck }) => {
        describe(`Test sending Quai from Cyprus1 to ${description}`, function () {
            let senderBalance: bigint;
            let receiverBalance: bigint;

            before(async () => {
                senderBalance = await provider.getBalance(wallet.address);
                const receiverAddress = process.env[receiverAddressEnvVar]!;
                receiverBalance = await provider.getBalance(receiverAddress);
            });

            it('should receive a tx receipt', async function () {
                const receiverAddress = process.env[receiverAddressEnvVar]!;
                const txObj = {
                    to: receiverAddress,
                    value: quaiAmount,
                    from: wallet.address,
                };
                console.log(`Sending quai to: ${receiverAddress}`);
                const tx = (await wallet.sendTransaction(txObj)) as QuaiTransactionResponse;
                assert(tx);
                console.log('Waiting for Quai Tx to be mined...');
                const receipt = await tx.wait();
                console.log('Quai Tx mined');
                assert(receipt);
            });

            it('should have decreased the sender balance', async function () {
                const updatedSenderBalance = await provider.getBalance(wallet.address);
                assert(updatedSenderBalance < senderBalance - quaiAmount, 'Sender balance not updated correctly');
            });

            (skipReceiverBalanceCheck ? it.skip : it)('should have increased the receiver balance', async function () {
                const receiverAddress = process.env[receiverAddressEnvVar]!;
                const updatedReceiverBalance = await provider.getBalance(receiverAddress);
                assert(
                    updatedReceiverBalance === receiverBalance + quaiAmount,
                    'Receiver balance not updated correctly',
                );
            });
        });
    });
});
