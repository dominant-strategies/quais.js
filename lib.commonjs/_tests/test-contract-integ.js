"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const assert_1 = tslib_1.__importDefault(require("assert"));
const index_js_1 = require("../index.js");
const dotenv_1 = tslib_1.__importDefault(require("dotenv"));
const QRC20_js_1 = tslib_1.__importDefault(require("./contracts/QRC20.js"));
const utils_js_1 = require("./utils.js");
dotenv_1.default.config();
describe("Tests contract integration", function () {
    const provider = new index_js_1.quais.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new index_js_1.quais.Wallet(process.env.FAUCET_PRIVATEKEY || '', provider);
    const abi = QRC20_js_1.default.abi;
    const bytecode = QRC20_js_1.default.bytecode;
    const constructorArgs = {
        name: 'Testing',
        symbol: 'Test',
        totalSupply: Math.pow(10, 3),
    };
    let contract;
    let address;
    before(async function () {
        this.timeout(100000);
        const factory = new index_js_1.quais.ContractFactory(abi, bytecode, wallet);
        contract = await factory.deploy(constructorArgs.name, constructorArgs.symbol, constructorArgs.totalSupply, {
            gasLimit: 5000000
        });
        address = await contract.getAddress();
        console.log('Contract deployed to:', address);
        let tries = 0;
        const POLLING_TRIES = 10; // define POLLING_TRIES if not defined elsewhere
        let deployed = false;
        let code = await provider.getCode(address);
        while (tries < POLLING_TRIES && !deployed) {
            code = await provider.getCode(address);
            if (code != "0x") {
                deployed = true;
            }
            tries += 1;
            await (0, utils_js_1.stall)(10000); // Ensure stall is defined or use a different delay mechanism
        }
        if (!deployed) {
            throw new Error("Contract deployment failed");
        }
    });
    it("confirms the contract deployment", function () {
        assert_1.default.ok(address, "Contract address should be available");
        assert_1.default.ok(contract, "Contract instance should be available");
    });
    it("runs contract operations", async function () {
        this.timeout(100000);
        assert_1.default.ok(address != null);
        const CustomContract = index_js_1.quais.BaseContract.buildClass(abi);
        const contract = new CustomContract(address, wallet); //quais.Contract.from<ContractAbi>(address, abi, signer);
        // Test implicit staticCall (i.e. view/pure)
        {
            const supply0 = await contract.totalSupply();
            assert_1.default.equal(supply0, BigInt(1000), "initial supply 0; default");
        }
        // Test explicit staticCall
        {
            const supply0 = await contract.totalSupply.staticCall();
            assert_1.default.equal(supply0, BigInt(1000), "initial supply 0; staticCall");
        }
        // Test staticCallResult (positional and named)
        {
            const supply0 = await contract.totalSupply.staticCallResult();
            assert_1.default.equal(supply0[0], BigInt(1000), "initial supply 0; staticCallResult");
        }
        const reciever = '0x0aff86a125b29b25a9e418c2fb64f1753532c0ca';
        // Test transfer (default)
        const tx = await contract.transfer(reciever, BigInt(1));
        await (0, utils_js_1.stall)(60000);
        const receipt = await provider.getTransactionReceipt(tx.hash);
        await (0, utils_js_1.stall)(10000);
        assert_1.default.ok(receipt, "receipt not null");
        const contractAddr = await contract.getAddress();
        // Check the receipt has parsed the events
        assert_1.default.equal(receipt.logs.length, 1, "logs.length");
        assert_1.default.ok(receipt instanceof index_js_1.quais.TransactionReceipt, "receipt typeof");
        assert_1.default.ok(receipt.logs[0] instanceof index_js_1.quais.Log, "receipt.log typeof");
        assert_1.default.equal(receipt.logs[0].address, contractAddr, "Proper target address");
        // Check the state has been adjusted
        assert_1.default.equal(await contract.balanceOf(reciever), BigInt(1), "balanceOf(signer)");
    });
});
//# sourceMappingURL=test-contract-integ.js.map