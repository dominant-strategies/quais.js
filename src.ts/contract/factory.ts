
import { Interface } from "../abi/index.js";
import {
    concat, defineProperties, getBytes, hexlify,
    assert, assertArgument
} from "../utils/index.js";

import { BaseContract, copyOverrides, resolveArgs } from "./contract.js";

import type { InterfaceAbi } from "../abi/index.js";
import type { Addressable } from "../address/index.js";
import type { ContractRunner, TransactionRequest } from "../providers/index.js";
import type { BytesLike } from "../utils/index.js";
import { getShardForAddress } from "../utils/index.js";
import type {
    ContractInterface, ContractMethodArgs, ContractDeployTransaction,
} from "./types.js";
import type { ContractTransactionResponse } from "./wrappers.js";
import { Wallet, randomBytes } from "../quais.js";
import { getContractAddress } from "../address/address.js";
import { getStatic } from "../utils/properties.js";


// A = Arguments to the constructor
// I = Interface of deployed contracts

/**
 *  A **ContractFactory** is used to deploy a Contract to the blockchain.
 */
export class ContractFactory<A extends Array<any> = Array<any>, I = BaseContract> {

    /**
     *  The Contract Interface.
     */
    readonly interface!: Interface;

    /**
     *  The Contract deployment bytecode. Often called the initcode.
     */
    readonly bytecode!: string;

    /**
     *  The ContractRunner to deploy the Contract as.
     */
    readonly runner!: null | ContractRunner;

    /**
     *  Create a new **ContractFactory** with %%abi%% and %%bytecode%%,
     *  optionally connected to %%runner%%.
     *
     *  The %%bytecode%% may be the ``bytecode`` property within the
     *  standard Solidity JSON output.
     */
    constructor(abi: Interface | InterfaceAbi, bytecode: BytesLike | { object: string }, runner?: null | ContractRunner) {
        const iface = Interface.from(abi);

        
        // Dereference Solidity bytecode objects and allow a missing `0x`-prefix
        if (bytecode instanceof Uint8Array) {
            bytecode = hexlify(getBytes(bytecode));
        } else {
            if (typeof(bytecode) === "object") { bytecode = bytecode.object; }
            if (!bytecode.startsWith("0x")) { bytecode = "0x" + bytecode; }
            bytecode = hexlify(getBytes(bytecode));
        }

        defineProperties<ContractFactory>(this, {
            bytecode, interface: iface, runner: (runner || null)
        });
    }

    attach(target: string | Addressable): BaseContract & Omit<I, keyof BaseContract> {
        return new (<any>BaseContract)(target, this.interface, this.runner);
    }

    /**
     *  Resolves to the transaction to deploy the contract, passing %%args%%
     *  into the constructor.
     */
    async getDeployTransaction(...args: ContractMethodArgs<A>): Promise<ContractDeployTransaction> {
        let overrides: Omit<ContractDeployTransaction, "data"> = { };

        const fragment = this.interface.deploy;

        if (fragment.inputs.length + 1 === args.length) {
            overrides = await copyOverrides(args.pop());
        }

        if (fragment.inputs.length !== args.length) {
            throw new Error("incorrect number of arguments to constructor");
        }

        const resolvedArgs = await resolveArgs(this.runner, fragment.inputs, args);

        const data = concat([ this.bytecode, this.interface.encodeDeploy(resolvedArgs) ]);
        return Object.assign({ }, overrides, { data });
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
    async deploy(...args: ContractMethodArgs<A>): Promise<BaseContract & { deploymentTransaction(): ContractTransactionResponse } & Omit<I, keyof BaseContract>> {
        const tx = await this.getDeployTransaction(...args);

        assert(this.runner && typeof(this.runner.sendTransaction) === "function" ,
            "factory runner does not support sending transactions", "UNSUPPORTED_OPERATION", {
            operation: "sendTransaction" });
        
        if (this.runner instanceof Wallet) {  
           tx.from = this.runner.address;
        }
        const grindedTx = await this.grindContractAddress(tx); 
        
        const sentTx = await this.runner.sendTransaction(grindedTx);
        const address = getStatic<(tx: ContractDeployTransaction) => string>(
            this.constructor,
            "getContractAddress"
          )?.(tx);

        //const address = getCreateAddress(sentTx);
        return new (<any>BaseContract)(address, this.interface, this.runner, sentTx);
    }

static getContractAddress(transaction: {
    from: string;
    nonce: bigint; // Fix: Convert BigInt to bigint
    data: BytesLike;
}): string {
    return getContractAddress(
        transaction.from,
        BigInt(transaction.nonce), // Fix: Convert BigInt to bigint
        transaction.data
    );
}

    async grindContractAddress(
        tx: TransactionRequest
      ): Promise<TransactionRequest> {
        if (tx.nonce == null && tx.from) {
          tx.nonce = await this.runner?.provider?.getTransactionCount(tx.from);
        }

        const sender = String(tx.from);
        const toShard = getShardForAddress(sender);
        var i = 0;
        var startingData = tx.data;
        while (i < 10000) {
            var contractAddress = getContractAddress(sender, BigInt(tx.nonce || 0), tx.data || '');
            var contractShard = getShardForAddress(contractAddress);
            if (contractShard === toShard) {
                return tx;
            }
            var salt = randomBytes(32);
            tx.data = hexlify(concat([String(startingData), salt]));
            i++;
        }
        return tx;
      }

    /**
     *  Return a new **ContractFactory** with the same ABI and bytecode,
     *  but connected to %%runner%%.
     */
    connect(runner: null | ContractRunner): ContractFactory<A, I> {
        return new ContractFactory(this.interface, this.bytecode, runner);
    }

    /**
     *  Create a new **ContractFactory** from the standard Solidity JSON output.
     */
    static fromSolidity<A extends Array<any> = Array<any>, I = ContractInterface>(output: any, runner?: ContractRunner): ContractFactory<A, I> {
        assertArgument(output != null, "bad compiler output", "output", output);

        if (typeof(output) === "string") { output = JSON.parse(output); }

        const abi = output.abi;

        let bytecode = "";
        if (output.bytecode) {
            bytecode = output.bytecode;
        } else if (output.evm && output.evm.bytecode) {
            bytecode = output.evm.bytecode;
        }

        return new this(abi, bytecode, runner);
    }
}
