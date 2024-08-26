import assert from 'assert';
import { quais, Contract } from '../../index.js';
import dotenv from 'dotenv';
import QRC20 from './contracts/QRC20.js';

const env = process.env.NODE_ENV || 'development';

dotenv.config({ path: `.env.${env}` });

// Or fallback to .env if NODE_ENV specific file doesn't exist
dotenv.config({ path: `.env`, override: false });

describe('Tests ERC20 contract deployment and integration', function () {
    this.timeout(120000);
    const provider = new quais.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new quais.Wallet(process.env.CYPRUS1_PRIVKEY_1!, provider);
    const abi = QRC20.abi;
    const bytecode = QRC20.bytecode;
    const constructorArgs = {
        name: 'ERC20Testing',
        symbol: 'Test',
        totalSupply: BigInt(1000),
    };
    let contract: Contract;

    before(async function () {
        const factory = new quais.ContractFactory(abi, bytecode, wallet as quais.ContractRunner);
        contract = (await factory.deploy(
            constructorArgs.name,
            constructorArgs.symbol,
            constructorArgs.totalSupply,
            {},
        )) as Contract;
        console.log('...waiting for contract deployment');
        await contract.waitForDeployment();
        console.log('Contract deployed');
    });

    it('should return the correct token name', async function () {
        const name = await contract.name();
        assert.strictEqual(name, constructorArgs.name, 'Token name should match the expected value');
    });

    it('should return the correct token symbol', async function () {
        const symbol = await contract.symbol();
        assert.strictEqual(symbol, constructorArgs.symbol, 'Token symbol should match the expected value');
    });

    it('should return the correct total supply', async function () {
        const totalSupply = await contract.totalSupply();
        assert.strictEqual(
            totalSupply.toString(),
            constructorArgs.totalSupply.toString(),
            'Total supply should match the expected value',
        );
    });

    it('should return the correct balance for the deployer', async function () {
        const balance = await contract.balanceOf(wallet.address);
        assert.strictEqual(
            balance.toString(),
            constructorArgs.totalSupply.toString(),
            'Deployer balance should match the total supply',
        );
    });

    it('should transfer tokens correctly', async function () {
        const recipientAddress = process.env.CYPRUS1_ADDR_2;
        const transferAmount = BigInt(10);
        const initialBalanceDeployer = await contract.balanceOf(wallet.address);
        const initialBalanceRecipient = await contract.balanceOf(recipientAddress);

        const tx = await contract.transfer(recipientAddress, transferAmount);
        console.log('... waiting for transfer transaction to be mined');
        await tx.wait();

        const finalBalanceDeployer = await contract.balanceOf(wallet.address);
        const finalBalanceRecipient = await contract.balanceOf(recipientAddress);

        assert.strictEqual(
            finalBalanceDeployer.toString(),
            (initialBalanceDeployer - transferAmount).toString(),
            'Deployer balance should decrease by transfer amount',
        );
        assert.strictEqual(
            finalBalanceRecipient.toString(),
            (initialBalanceRecipient + transferAmount).toString(),
            'Recipient balance should increase by transfer amount',
        );
    });

    it('should approve and transfer tokens on behalf of another account', async function () {
        const spenderWallet = new quais.Wallet(process.env.CYPRUS1_PRIVKEY_2!, provider);
        const approveAmount = BigInt(10);
        const initialBalanceSpender = await contract.balanceOf(spenderWallet.address);

        const txApprove = await contract.approve(spenderWallet.address, approveAmount);
        console.log('... waiting for approval transaction to be mined');
        await txApprove.wait();

        const allowance = await contract.allowance(wallet.address, spenderWallet.address);
        console.log(`Allowance: ${allowance.toString()}, Approved Amount: ${approveAmount.toString()}`);
        assert.strictEqual(
            allowance.toString(),
            approveAmount.toString(),
            'Allowance should match the approved amount',
        );

        const spenderContract = new Contract(await contract.getAddress(), abi, spenderWallet as quais.ContractRunner);

        const transferFromTx = await spenderContract.transferFrom(wallet.address, spenderWallet.address, approveAmount);
        console.log('... waiting for transfer transaction to be mined');
        await transferFromTx.wait();

        const finalAllowance = await contract.allowance(wallet.address, spenderWallet.address);
        assert.strictEqual(finalAllowance.toString(), '0', 'Allowance should be reduced to zero after transfer');

        const finalBalanceSpender = await contract.balanceOf(spenderWallet.address);
        assert.strictEqual(
            (finalBalanceSpender - initialBalanceSpender).toString(),
            approveAmount.toString(),
            'Spender balance should increase by the transfer amount',
        );
    });
});
