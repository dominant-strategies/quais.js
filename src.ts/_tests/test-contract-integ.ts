import assert from 'assert';
import { quais, Contract } from '../index.js';
import dotenv from 'dotenv';
import QRC20 from './contracts/QRC20.js';
import { stall } from './utils.js';

dotenv.config();

interface ContractAbi {
    mint: quais.BaseContractMethod<[quais.AddressLike], [boolean], quais.ContractTransactionResponse>;
    totalSupply: quais.BaseContractMethod<[], [bigint], [bigint]>;
    balanceOf: quais.BaseContractMethod<[quais.AddressLike], [bigint], [bigint]>;
    transfer: quais.BaseContractMethod<[quais.AddressLike, bigint], [boolean], quais.ContractTransactionResponse>;
}

describe('Tests contract integration', function () {
    const provider = new quais.JsonRpcProvider(process.env.CYPRUS1URL);
    const wallet = new quais.Wallet(process.env.CYPRUS1PK || '', provider);
    const abi = QRC20.abi;
    const bytecode = QRC20.bytecode;
    const constructorArgs = {
        name: 'Testing',
        symbol: 'Test',
        totalSupply: Math.pow(10, 3),
    };
    let contract: Contract;
    let address: string;

    before(async function () {
        this.timeout(100000);

        const factory = new quais.ContractFactory(abi, bytecode, wallet as quais.ContractRunner);
        contract = (await factory.deploy(constructorArgs.name, constructorArgs.symbol, constructorArgs.totalSupply, {
            gasLimit: 5000000,
        })) as Contract;
        address = await contract.getAddress();
        console.log('Contract deployed to:', address);

        let tries = 0;
        const POLLING_TRIES = 10; // define POLLING_TRIES if not defined elsewhere
        let deployed = false;
        let code = await provider.getCode(address);
        while (tries < POLLING_TRIES && !deployed) {
            code = await provider.getCode(address);
            if (code != '0x') {
                deployed = true;
            }
            tries += 1;
            await stall(10000); // Ensure stall is defined or use a different delay mechanism
        }

        if (!deployed) {
            throw new Error('Contract deployment failed');
        }
    });

    it('confirms the contract deployment', function () {
        assert.ok(address, 'Contract address should be available');
        assert.ok(contract, 'Contract instance should be available');
    });

    it('runs contract operations', async function () {
        this.timeout(120000);

        assert.ok(address != null);

        const CustomContract = quais.BaseContract.buildClass<ContractAbi>(abi);

        const contract = new CustomContract(address, wallet as quais.ContractRunner); //quais.Contract.from<ContractAbi>(address, abi, signer);
        await stall(30000);
        // Test implicit staticCall (i.e. view/pure)
        {
            const supply0 = await contract.totalSupply();
            assert.equal(supply0, BigInt(1000), 'initial supply 0; default');
        }

        // Test explicit staticCall
        {
            const supply0 = await contract.totalSupply.staticCall();
            assert.equal(supply0, BigInt(1000), 'initial supply 0; staticCall');
        }

        // Test staticCallResult (positional and named)
        {
            const supply0 = await contract.totalSupply.staticCallResult();
            assert.equal(supply0[0], BigInt(1000), 'initial supply 0; staticCallResult');
        }

        const reciever = '0x0047f9CEa7662C567188D58640ffC48901cde02a';
        // Test transfer (default)
        const tx = await contract.transfer(reciever, BigInt(1));
        await stall(60000);

        const receipt = await provider.getTransactionReceipt(tx.hash);
        console.log('Receipt:  ', receipt);
        await stall(10000);
        assert.ok(receipt, 'receipt not null');

        const contractAddr = await contract.getAddress();
        // Check the receipt has parsed the events

        assert.equal(receipt.logs.length, 1, 'logs.length');
        assert.ok(receipt instanceof quais.TransactionReceipt, 'receipt typeof');
        assert.ok(receipt.logs[0] instanceof quais.Log, 'receipt.log typeof');
        assert.equal(receipt.logs[0].address, contractAddr, 'Proper target address');

        // Check the state has been adjusted
        assert.equal(await contract.balanceOf(reciever), BigInt(1), 'balanceOf(signer)');
    });
});
