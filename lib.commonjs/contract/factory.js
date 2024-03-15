"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContractFactory = void 0;
const index_js_1 = require("../abi/index.js");
const index_js_2 = require("../utils/index.js");
const contract_js_1 = require("./contract.js");
const index_js_3 = require("../utils/index.js");
const quais_js_1 = require("../quais.js");
const address_js_1 = require("../address/address.js");
const properties_js_1 = require("../utils/properties.js");
// A = Arguments to the constructor
// I = Interface of deployed contracts
/**
 *  A **ContractFactory** is used to deploy a Contract to the blockchain.
 */
class ContractFactory {
    /**
     *  The Contract Interface.
     */
    interface;
    /**
     *  The Contract deployment bytecode. Often called the initcode.
     */
    bytecode;
    /**
     *  The ContractRunner to deploy the Contract as.
     */
    runner;
    /**
     *  Create a new **ContractFactory** with %%abi%% and %%bytecode%%,
     *  optionally connected to %%runner%%.
     *
     *  The %%bytecode%% may be the ``bytecode`` property within the
     *  standard Solidity JSON output.
     */
    constructor(abi, bytecode, runner) {
        const iface = index_js_1.Interface.from(abi);
        // Dereference Solidity bytecode objects and allow a missing `0x`-prefix
        if (bytecode instanceof Uint8Array) {
            bytecode = (0, index_js_2.hexlify)((0, index_js_2.getBytes)(bytecode));
        }
        else {
            if (typeof (bytecode) === "object") {
                bytecode = bytecode.object;
            }
            if (!bytecode.startsWith("0x")) {
                bytecode = "0x" + bytecode;
            }
            bytecode = (0, index_js_2.hexlify)((0, index_js_2.getBytes)(bytecode));
        }
        (0, index_js_2.defineProperties)(this, {
            bytecode, interface: iface, runner: (runner || null)
        });
    }
    attach(target) {
        return new contract_js_1.BaseContract(target, this.interface, this.runner);
    }
    /**
     *  Resolves to the transaction to deploy the contract, passing %%args%%
     *  into the constructor.
     */
    async getDeployTransaction(...args) {
        let overrides;
        const fragment = this.interface.deploy;
        if (fragment.inputs.length + 1 === args.length) {
            overrides = await (0, contract_js_1.copyOverrides)(args.pop());
            const resolvedArgs = await (0, contract_js_1.resolveArgs)(this.runner, fragment.inputs, args);
            const data = (0, index_js_2.concat)([this.bytecode, this.interface.encodeDeploy(resolvedArgs)]);
            return Object.assign({}, overrides, { data });
        }
        if (fragment.inputs.length !== args.length) {
            throw new Error("incorrect number of arguments to constructor");
        }
        const resolvedArgs = await (0, contract_js_1.resolveArgs)(this.runner, fragment.inputs, args);
        const data = (0, index_js_2.concat)([this.bytecode, this.interface.encodeDeploy(resolvedArgs)]);
        return Object.assign({}, args.pop().from, { data });
    }
    // getDeployTransaction3(...args: Array<any>): TransactionRequest {
    //     let tx: TransactionRequest = {};
    //     // If we have 1 additional argument, we allow transaction overrides
    //     if (
    //       args.length === this.interface.deploy.inputs.length + 1 &&
    //       typeof args[args.length - 1] === "object"
    //     ) {
    //       //tx = shallowCopy(args.pop());
    //         tx = copyOverrides(args.pop());
    //       for (const key in tx) {
    //         if (!allowedTransactionKeys[key]) {
    //           throw new Error("unknown transaction override " + key);
    //         }
    //       }
    //     }
    //     // Do not allow these to be overridden in a deployment transaction
    //     ["data", "from", "to"].forEach((key) => {
    //       if ((<any>tx)[key] == null) {
    //         return;
    //       }
    //       assertArgument(false, "cannot override " + key, key, (<any>tx)[key]);
    //     });
    //     if (tx.value) {
    //         const value = Number(tx.value)
    //         if ( value != 0 && !this.interface.deploy.payable) {
    //             assertArgument(
    //                 false,
    //                 "non-zero value provided to non-payable (or constructor) function",
    //                     "value", value
    //             );
    //         }
    //     }
    //     // // Make sure the call matches the constructor signature
    //     // logger.checkArgumentCount(
    //     //   args.length,
    //     //   this.interface.deploy.inputs.length,
    //     //   " in Contract constructor"
    //     // );
    //     // Set the data to the bytecode + the encoded constructor arguments
    //     tx.data = hexlify(
    //       concat([this.bytecode, this.interface.encodeDeploy(args)])
    //     );
    //     return tx;
    //   }
    /**
     *  Resolves to the Contract deployed by passing %%args%% into the
     *  constructor.
     *
     *  This will resovle to the Contract before it has been deployed to the
     *  network, so the [[BaseContract-waitForDeployment]] should be used before
     *  sending any transactions to it.
     */
    async deploy(...args) {
        const tx = await this.getDeployTransaction(...args);
        (0, index_js_2.assert)(this.runner && typeof (this.runner.sendTransaction) === "function", "factory runner does not support sending transactions", "UNSUPPORTED_OPERATION", {
            operation: "sendTransaction"
        });
        if (this.runner instanceof quais_js_1.Wallet) {
            tx.from = this.runner.address;
        }
        const grindedTx = await this.grindContractAddress(tx);
        console.log("grindedTx", grindedTx);
        const sentTx = await this.runner.sendTransaction(grindedTx);
        const address = (0, properties_js_1.getStatic)(this.constructor, "getContractAddress")?.(tx);
        //const address = getCreateAddress(sentTx);
        return new contract_js_1.BaseContract(address, this.interface, this.runner, sentTx);
    }
    static getContractAddress(transaction) {
        return (0, address_js_1.getContractAddress)(transaction.from, BigInt(transaction.nonce), // Fix: Convert BigInt to bigint
        transaction.data);
    }
    async grindContractAddress(tx) {
        if (tx.nonce == null && tx.from) {
            tx.nonce = await this.runner?.provider?.getTransactionCount(tx.from);
        }
        const sender = String(tx.from);
        const toShard = (0, index_js_3.getShardForAddress)(sender);
        var i = 0;
        var startingData = tx.data;
        while (i < 10000) {
            var contractAddress = (0, address_js_1.getContractAddress)(sender, BigInt(tx.nonce || 0), tx.data || '');
            var contractShard = (0, index_js_3.getShardForAddress)(contractAddress);
            console.log("contractAddress ", contractAddress);
            var utxo = (0, index_js_3.isUTXOAddress)(contractAddress);
            if (contractShard === toShard && !utxo) {
                return tx;
            }
            var salt = (0, quais_js_1.randomBytes)(32);
            tx.data = (0, index_js_2.hexlify)((0, index_js_2.concat)([String(startingData), salt]));
            i++;
        }
        return tx;
    }
    /**
     *  Return a new **ContractFactory** with the same ABI and bytecode,
     *  but connected to %%runner%%.
     */
    connect(runner) {
        return new ContractFactory(this.interface, this.bytecode, runner);
    }
    /**
     *  Create a new **ContractFactory** from the standard Solidity JSON output.
     */
    static fromSolidity(output, runner) {
        (0, index_js_2.assertArgument)(output != null, "bad compiler output", "output", output);
        if (typeof (output) === "string") {
            output = JSON.parse(output);
        }
        const abi = output.abi;
        let bytecode = "";
        if (output.bytecode) {
            bytecode = output.bytecode;
        }
        else if (output.evm && output.evm.bytecode) {
            bytecode = output.evm.bytecode;
        }
        return new this(abi, bytecode, runner);
    }
}
exports.ContractFactory = ContractFactory;
//# sourceMappingURL=factory.js.map