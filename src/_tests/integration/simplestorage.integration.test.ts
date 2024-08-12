import assert from 'assert';

import { JsonRpcProvider, Wallet, ContractFactory, Contract, ContractRunner } from '../../index.js';

import SimpleStorageContract from './contracts/SimpleStorageContract.js';

import dotenv from 'dotenv';
dotenv.config();

describe('Test Contract SimpleStorage', function () {
    this.timeout(60000);
    let provider: JsonRpcProvider;
    let wallet: Wallet;
    let contract: Contract;
    before(async () => {
        provider = new JsonRpcProvider(process.env.RPC_URL);
        wallet = new Wallet(process.env.CYPRUS1_PRIVKEY_1!, provider);
        const balance = await provider.getBalance(wallet.address);
        // ensure balance is greater than 0.1 QUAI
        assert(balance > 100000000000000000n, 'Insufficient balance to run the test');
    });

    it('should deploy contract', async function () {
        const factory = new ContractFactory(
            SimpleStorageContract.abi,
            SimpleStorageContract.bytecode,
            wallet as ContractRunner,
        );
        const nonce = await provider.getTransactionCount(wallet.address, 'latest');
        const deployParams = {
            nonce,
            maxPriorityFeePerGas: 1000000000n,
            maxFeePerGas: 3000000000000n,
            from: wallet.address,
        };
        console.log('Deploying contract...');
        contract = (await factory.deploy(deployParams)) as Contract;
        assert.ok(await contract.getAddress());
        console.log('Waiting for contract deployment...');
        await contract.waitForDeployment();
        assert(contract);
    });

    it('should call "set()" and set value', async function () {
        const tx = await contract.set(42);
        const receipt = await tx.wait();
        assert(receipt);
    });

    it('should call "get()" and get value', async function () {
        const value = await contract.get();
        assert.equal(value, 42);
    });
});
