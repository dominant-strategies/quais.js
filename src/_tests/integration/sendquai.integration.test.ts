import assert from 'assert';

import { JsonRpcProvider, Wallet } from '../../index.js';

import dotenv from 'dotenv';
import { QuaiTransactionResponse } from '../../providers/provider.js';
dotenv.config();

describe('Test sending quai', function () {
    this.timeout(120000);
    let provider: JsonRpcProvider;
    let wallet: Wallet;
    const quaiAmount = 42000000n;
    before(async () => {
        provider = new JsonRpcProvider(process.env.RPC_URL);
        wallet = new Wallet(process.env.CYPRUS1_PRIVKEY_1!, provider);
        const balance = await provider.getBalance(wallet.address);
        // ensure balance is greater than 0.1 QUAI
        assert(balance > 100000000000000000n, 'Insufficient balance to run the test');
    });

    it.only('should send quai to another address within Cyprus1', async function () {
        const addrTo = process.env.CYPRUS1_ADDR_2!;
        const originalBalance = await provider.getBalance(addrTo);
        const txObj = {
            to: addrTo,
            value: quaiAmount,
            from: wallet.address,
        };
        console.log('Sending quai to: ', addrTo);
        const tx = (await wallet.sendTransaction(txObj)) as QuaiTransactionResponse;
        assert(tx);
        console.log('Waiting for Quai Tx to be mined...');
        const receipt = await tx.wait();
        console.log('Quai Tx mined');
        assert(receipt);
        const newBalance = await provider.getBalance(addrTo);
        assert.equal(newBalance - originalBalance, quaiAmount, 'Balance not updated correctly');
    });
    // ! Sending quai to an address from Cyprus2 is not working
    it('should send quai to an address from Cyprus2', async () => {
        const addrTo = process.env.CYPRUS2_ADDR_1!;
        const originalBalance = await provider.getBalance(addrTo);
        const txObj = {
            to: addrTo,
            value: quaiAmount,
            from: wallet.address,
        };
        console.log('Sending quai to: ', addrTo);
        const tx = (await wallet.sendTransaction(txObj)) as QuaiTransactionResponse;
        assert(tx);
        console.log('Waiting for Quai Tx to be mined...');
        const receipt = await tx.wait();
        assert(receipt);
        const newBalance = await provider.getBalance(addrTo);
        assert.equal(newBalance - originalBalance, quaiAmount);
    });
});
