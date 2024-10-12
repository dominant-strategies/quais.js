import { Interface } from '../abi/index.js';
import { concat, defineProperties, getBytes, hexlify, assert, assertArgument } from '../utils/index.js';

import { BaseContract, copyOverrides, resolveArgs } from './contract.js';

import type { InterfaceAbi } from '../abi/index.js';
import { validateAddress } from '../address/index.js';
import type { Addressable } from '../address/index.js';
import type { BytesLike } from '../utils/index.js';
import { getZoneForAddress } from '../utils/index.js';
import type { ContractInterface, ContractMethodArgs, ContractDeployTransaction, ContractRunner } from './types.js';
import type { ContractTransactionResponse } from './wrappers.js';
import { Wallet } from '../wallet/index.js';
import { getContractAddress, isQiAddress } from '../address/index.js';
import { getStatic } from '../utils/properties.js';
import { QuaiTransactionRequest } from '../providers/provider.js';
import { JsonRpcSigner } from '../providers/provider-jsonrpc.js';

// A = Arguments to the constructor
// I = Interface of deployed contracts

/**
 * A **ContractFactory** is used to deploy a Contract to the blockchain.
 *
 * @category Contract
 */
export class ContractFactory<A extends Array<any> = Array<any>, I = BaseContract> {
    /**
     * The Contract Interface.
     */
    readonly interface!: Interface;

    /**
     * The Contract deployment bytecode. Often called the initcode.
     */
    readonly bytecode!: string;

    /**
     * The ContractRunner to deploy the Contract as.
     */
    readonly runner!: null | ContractRunner;

    /**
     * Create a new **ContractFactory** with `abi` and `bytecode`, optionally connected to `runner`.
     *
     * The `bytecode` may be the `bytecode` property within the standard Solidity JSON output.
     */
    constructor(
        abi: Interface | InterfaceAbi,
        bytecode: BytesLike | { object: string },
        runner?: null | ContractRunner,
    ) {
        const iface = Interface.from(abi);

        // Dereference Solidity bytecode objects and allow a missing `0x`-prefix
        if (bytecode instanceof Uint8Array) {
            bytecode = hexlify(getBytes(bytecode));
        } else {
            if (typeof bytecode === 'object') {
                bytecode = bytecode.object;
            }
            if (!bytecode.startsWith('0x')) {
                bytecode = '0x' + bytecode;
            }
            bytecode = hexlify(getBytes(bytecode));
        }

        defineProperties<ContractFactory>(this, {
            bytecode,
            interface: iface,
            runner: runner || null,
        });
    }

    attach(target: string | Addressable): BaseContract & Omit<I, keyof BaseContract> {
        return new (<any>BaseContract)(target, this.interface, this.runner);
    }

    /**
     * Resolves to the transaction to deploy the contract, passing `args` into the constructor.
     *
     * @param {ContractMethods<A>} args - The arguments to the constructor.
     * @returns {Promise<ContractDeployTransaction>} A promise resolving to the deployment transaction.
     */
    async getDeployTransaction(...args: ContractMethodArgs<A>): Promise<ContractDeployTransaction> {
        let overrides: Omit<ContractDeployTransaction, 'data'>;

        const fragment = this.interface.deploy;

        if (fragment.inputs.length + 1 === args.length) {
            overrides = await copyOverrides(args.pop());

            const resolvedArgs = await resolveArgs(this.runner, fragment.inputs, args);
            const data = concat([this.bytecode, this.interface.encodeDeploy(resolvedArgs)]);
            return Object.assign({}, overrides, { data });
        }

        if (fragment.inputs.length !== args.length) {
            throw new Error('incorrect number of arguments to constructor');
        }

        const resolvedArgs = await resolveArgs(this.runner, fragment.inputs, args);

        const data = concat([this.bytecode, this.interface.encodeDeploy(resolvedArgs)]);
        const from = args.pop()?.from || undefined;
        return Object.assign({}, from, { data });
    }

    /**
     * Resolves to the Contract deployed by passing `args` into the constructor.
     *
     * This will resovle to the Contract before it has been deployed to the network, so the
     * [baseContract.waitForDeployment](../classes/BaseContract#waitForDeployment) should be used before sending any
     * transactions to it.
     *
     * @param {ContractMethods<A>} args - The arguments to the constructor.
     * @returns {Promise<
     *     BaseContract & { deploymentTransaction(): ContractTransactionResponse } & Omit<I, keyof BaseContract>
     * >}
     *   A promise resolving to the Contract.
     */
    async deploy(
        ...args: ContractMethodArgs<A>
    ): Promise<BaseContract & { deploymentTransaction(): ContractTransactionResponse } & Omit<I, keyof BaseContract>> {
        const tx = await this.getDeployTransaction(...args);

        assert(
            this.runner && typeof this.runner.sendTransaction === 'function',
            'factory runner does not support sending transactions',
            'UNSUPPORTED_OPERATION',
            {
                operation: 'sendTransaction',
            },
        );

        if (this.runner instanceof Wallet || this.runner instanceof JsonRpcSigner) {
            validateAddress(this.runner.address);
            tx.from = this.runner.address;
        }
        const grindedTx = await this.grindContractAddress(tx);

        grindedTx.accessList = await this.runner.createAccessList?.(grindedTx);

        const sentTx = await this.runner.sendTransaction(grindedTx);
        const address = getStatic<(tx: ContractDeployTransaction) => string>(
            this.constructor,
            'getContractAddress',
        )?.(tx);

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
            transaction.data,
        );
    }

    async grindContractAddress(tx: QuaiTransactionRequest): Promise<QuaiTransactionRequest> {
        if (tx.nonce == null && tx.from) {
            tx.nonce = await this.runner?.provider?.getTransactionCount(tx.from);
        }

        const sender = String(tx.from);
        const toShard = getZoneForAddress(sender);
        let i = 0;
        const startingData = tx.data;
        const salt = new Uint8Array(4);
        // initialize salt with the lower 32 bits of the nonce
        new DataView(salt.buffer).setUint32(0, Number(tx.nonce) & 0xffffffff, false);

        while (i < 10000) {
            tx.data = hexlify(concat([String(startingData), salt]));
            const contractAddress = getContractAddress(sender, BigInt(tx.nonce || 0), tx.data || '');
            const contractShard = getZoneForAddress(contractAddress);
            const utxo = isQiAddress(contractAddress);
            if (contractShard === toShard && !utxo) {
                return tx;
            }
            // Increment the salt
            let saltValue = new DataView(salt.buffer).getUint32(0, false);
            saltValue++;
            new DataView(salt.buffer).setUint32(0, saltValue, false);
            i++;
        }
        return tx;
    }

    /**
     * Return a new **ContractFactory** with the same ABI and bytecode, but connected to `runner`.
     *
     * @param {ContractRunner} runner - The runner to connect to.
     * @returns {ContractFactory<A, I>} A new ContractFactory.
     */
    connect(runner: null | ContractRunner): ContractFactory<A, I> {
        return new ContractFactory(this.interface, this.bytecode, runner);
    }

    /**
     * Create a new **ContractFactory** from the standard Solidity JSON output.
     *
     * @param {any} output - The Solidity JSON output.
     * @param {ContractRunner} runner - The runner to connect to.
     * @returns {ContractFactory<A, I>} A new ContractFactory.
     */
    static fromSolidity<A extends Array<any> = Array<any>, I = ContractInterface>(
        output: any,
        runner?: ContractRunner,
    ): ContractFactory<A, I> {
        assertArgument(output != null, 'bad compiler output', 'output', output);

        if (typeof output === 'string') {
            output = JSON.parse(output);
        }

        const abi = output.abi;

        let bytecode = '';
        if (output.bytecode) {
            bytecode = output.bytecode;
        } else if (output.evm && output.evm.bytecode) {
            bytecode = output.evm.bytecode;
        }

        return new this(abi, bytecode, runner);
    }
}
