import { Interface, Typed } from '../abi/index.js';
import { isAddressable, resolveAddress, validateAddress } from '../address/index.js';
// import from provider.ts instead of index.ts to prevent circular dep
// from quaiscanProvider
import {
    copyRequest,
    Log,
    QuaiTransactionRequest,
    QuaiTransactionResponse,
    TransactionResponse,
} from '../providers/provider.js';
import {
    defineProperties,
    getBigInt,
    isCallException,
    isHexString,
    resolveProperties,
    isError,
    assert,
    assertArgument,
    getZoneForAddress,
} from '../utils/index.js';

import {
    ContractEventPayload,
    ContractUnknownEventPayload,
    ContractTransactionResponse,
    EventLog,
    UndecodedEventLog,
} from './wrappers.js';

import type { EventFragment, FunctionFragment, InterfaceAbi, ParamType, Result } from '../abi/index.js';
import type { Addressable } from '../address/index.js';
import type { EventEmitterable, Listener } from '../utils/index.js';
import type { BlockTag, Provider, TransactionRequest, TopicFilter, Filter } from '../providers/index.js';

import type {
    BaseContractMethod,
    ContractEventName,
    ContractInterface,
    ContractMethodArgs,
    ContractMethod,
    ContractEventArgs,
    ContractEvent,
    ContractTransaction,
    ContractRunner,
    DeferredTopicFilter,
    WrappedFallback,
} from './types.js';
import { getNodeLocationFromZone } from '../utils/shards.js';

const BN_0 = BigInt(0);

/**
 * Interface for a contract runner that can call transactions.
 *
 * @interface
 */
interface ContractRunnerCaller extends ContractRunner {
    call: (tx: TransactionRequest) => Promise<string>;
}

/**
 * Interface for a contract runner that can estimate gas.
 *
 * @interface
 */
interface ContractRunnerEstimater extends ContractRunner {
    estimateGas: (tx: TransactionRequest) => Promise<bigint>;
}

/**
 * Interface for a contract runner that can send transactions.
 *
 * @interface
 */
interface ContractRunnerSender extends ContractRunner {
    sendTransaction: (tx: TransactionRequest) => Promise<TransactionResponse>;
}

/**
 * Check if the value can call transactions.
 *
 * @param {any} value - The value to check.
 * @returns {value is ContractRunnerCaller} True if the value can call transactions.
 */
function canCall(value: any): value is ContractRunnerCaller {
    return value && typeof value.call === 'function';
}

/**
 * Check if the value can estimate gas.
 *
 * @param {any} value - The value to check.
 * @returns {value is ContractRunnerEstimater} True if the value can estimate gas.
 */
function canEstimate(value: any): value is ContractRunnerEstimater {
    return value && typeof value.estimateGas === 'function';
}

/**
 * Check if the value can send transactions.
 *
 * @param {any} value - The value to check.
 * @returns {value is ContractRunnerSender} True if the value can send transactions.
 */
function canSend(value: any): value is ContractRunnerSender {
    return value && typeof value.sendTransaction === 'function';
}

/**
 * Class representing a prepared topic filter.
 *
 * @implements {DeferredTopicFilter}
 */
class PreparedTopicFilter implements DeferredTopicFilter {
    #filter: Promise<TopicFilter>;
    readonly fragment!: EventFragment;

    /**
     * @ignore
     */
    constructor(contract: BaseContract, fragment: EventFragment, args: Array<any>) {
        defineProperties<PreparedTopicFilter>(this, { fragment });
        if (fragment.inputs.length < args.length) {
            throw new Error('too many arguments');
        }

        this.#filter = (async function () {
            const resolvedArgs = await Promise.all(
                fragment.inputs.map((param, index) => {
                    const arg = args[index];
                    if (arg == null) {
                        return null;
                    }

                    return param.walkAsync(args[index], (type, value) => {
                        if (type === 'address') {
                            if (Array.isArray(value)) {
                                return Promise.all(value.map((v) => resolveAddress(v)));
                            }
                            return resolveAddress(value);
                        }
                        return value;
                    });
                }),
            );

            return contract.interface.encodeFilterTopics(fragment, resolvedArgs);
        })();
    }

    /**
     * Get the topic filter.
     *
     * @returns {Promise<TopicFilter>} The topic filter.
     */
    getTopicFilter(): Promise<TopicFilter> {
        return this.#filter;
    }
}

/**
 * Get the runner for a specific feature.
 *
 * @param {any} value - The value to check.
 * @param {keyof ContractRunner} feature - The feature to check for.
 * @returns {null | T} The runner if available, otherwise null.
 */
function getRunner<T extends ContractRunner>(value: any, feature: keyof ContractRunner): null | T {
    if (value == null) {
        return null;
    }
    if (typeof value[feature] === 'function') {
        return value;
    }
    if (value.provider && typeof value.provider[feature] === 'function') {
        return value.provider;
    }
    return null;
}

/**
 * Get the provider from a contract runner.
 *
 * @param {null | ContractRunner} value - The contract runner.
 * @returns {null | Provider} The provider if available, otherwise null.
 */
function getProvider(value: null | ContractRunner): null | Provider {
    if (value == null) {
        return null;
    }
    return value.provider || null;
}

/**
 * @ignore Copy Overrides and validate them.
 * @param {any} arg - The argument containing overrides.
 * @param {string[]} [allowed] - The allowed override keys.
 * @returns {Promise<Omit<ContractTransaction, O>>} The copied and validated overrides.
 * @throws {Error} If the overrides are invalid.
 */
export async function copyOverrides<O extends string = 'data' | 'to'>(
    arg: any,
    allowed?: Array<string>,
): Promise<Omit<ContractTransaction, O>> {
    // Make sure the overrides passed in are a valid overrides object
    const _overrides = Typed.dereference(arg, 'overrides');
    assertArgument(typeof _overrides === 'object', 'invalid overrides parameter', 'overrides', arg);

    // Create a shallow copy (we'll deep-ify anything needed during normalizing)
    const overrides = copyRequest(_overrides);

    assertArgument(
        !('to' in overrides) || overrides.to == null || (allowed || []).indexOf('to') >= 0,
        'cannot override to',
        'overrides.to',
        overrides,
    );
    assertArgument(
        !('data' in overrides) || overrides.data == null || (allowed || []).indexOf('data') >= 0,
        'cannot override data',
        'overrides.data',
        overrides,
    );

    // Resolve any from
    if ('from' in overrides && overrides.from) {
        overrides.from = await overrides.from;
    }

    return <Omit<ContractTransaction, O>>overrides;
}

/**
 * @ignore Resolve Arguments for a contract runner.
 * @param {null | ContractRunner} _runner - The contract runner.
 * @param {ReadonlyArray<ParamType>} inputs - The input parameter types.
 * @param {any[]} args - The arguments to resolve.
 * @returns {Promise<any[]>} The resolved arguments.
 */
export async function resolveArgs(
    _runner: null | ContractRunner,
    inputs: ReadonlyArray<ParamType>,
    args: Array<any>,
): Promise<Array<any>> {
    // Recursively descend into args and resolve any addresses
    return await Promise.all(
        inputs.map((param, index) => {
            return param.walkAsync(args[index], (type, value) => {
                value = Typed.dereference(value, type);
                if (type === 'address') {
                    return resolveAddress(value);
                }
                return value;
            });
        }),
    );
}

/**
 * Build a wrapped fallback method for a contract.
 *
 * @param {BaseContract} contract - The contract instance.
 * @returns {WrappedFallback} The wrapped fallback method.
 */
function buildWrappedFallback(contract: BaseContract): WrappedFallback {
    /**
     * Populate a transaction with overrides.
     *
     * @param {Omit<QuaiTransactionRequest, 'to'>} [overrides] - The transaction overrides.
     * @returns {Promise<ContractTransaction>} The populated transaction.
     * @throws {Error} If the overrides are invalid.
     */
    const populateTransaction = async function (
        overrides?: Omit<QuaiTransactionRequest, 'to'>,
    ): Promise<ContractTransaction> {
        // If an overrides was passed in, copy it and normalize the values

        const tx: ContractTransaction = <any>await copyOverrides<'data'>(overrides, ['data']);
        tx.to = await contract.getAddress();
        validateAddress(tx.to);

        if (tx.from) {
            tx.from = await resolveAddress(tx.from);
            validateAddress(tx.from);
        }

        const iface = contract.interface;

        const noValue = getBigInt(tx.value || BN_0, 'overrides.value') === BN_0;
        const noData = (tx.data || '0x') === '0x';

        if (iface.fallback && !iface.fallback.payable && iface.receive && !noData && !noValue) {
            assertArgument(
                false,
                'cannot send data to receive or send value to non-payable fallback',
                'overrides',
                overrides,
            );
        }

        assertArgument(
            iface.fallback || noData,
            'cannot send data to receive-only contract',
            'overrides.data',
            tx.data,
        );

        // Only allow payable contracts to set non-zero value
        const payable = iface.receive || (iface.fallback && iface.fallback.payable);
        assertArgument(payable || noValue, 'cannot send value to non-payable fallback', 'overrides.value', tx.value);

        // Only allow fallback contracts to set non-empty data
        assertArgument(
            iface.fallback || noData,
            'cannot send data to receive-only contract',
            'overrides.data',
            tx.data,
        );

        return tx;
    };

    /**
     * Perform a static call with the given overrides.
     *
     * @param {Omit<QuaiTransactionRequest, 'to'>} [overrides] - The transaction overrides.
     * @returns {Promise<string>} The result of the static call.
     * @throws {Error} If the call fails.
     */
    const staticCall = async function (overrides?: Omit<QuaiTransactionRequest, 'to'>): Promise<string> {
        const runner = getRunner(contract.runner, 'call');
        assert(canCall(runner), 'contract runner does not support calling', 'UNSUPPORTED_OPERATION', {
            operation: 'call',
        });

        const tx = await populateTransaction(overrides);

        try {
            return await runner.call(tx);
        } catch (error: any) {
            if (isCallException(error) && error.data) {
                throw contract.interface.makeError(error.data, tx);
            }
            throw error;
        }
    };

    /**
     * Send a transaction with the given overrides.
     *
     * @param {Omit<QuaiTransactionRequest, 'to'>} [overrides] - The transaction overrides.
     * @returns {Promise<ContractTransactionResponse>} The transaction response.
     * @throws {Error} If the transaction fails.
     */
    const send = async function (overrides?: Omit<QuaiTransactionRequest, 'to'>): Promise<ContractTransactionResponse> {
        const runner = contract.runner;
        assert(canSend(runner), 'contract runner does not support sending transactions', 'UNSUPPORTED_OPERATION', {
            operation: 'sendTransaction',
        });

        const tx = (await runner.sendTransaction(await populateTransaction(overrides))) as QuaiTransactionResponse;
        const provider = getProvider(contract.runner);
        // @TODO: the provider can be null; make a custom dummy provider that will throw a
        // meaningful error
        return new ContractTransactionResponse(contract.interface, <Provider>provider, tx);
    };

    /**
     * Estimate the gas required for a transaction with the given overrides.
     *
     * @param {Omit<QuaiTransactionRequest, 'to'>} [overrides] - The transaction overrides.
     * @returns {Promise<bigint>} The estimated gas.
     * @throws {Error} If the gas estimation fails.
     */
    const estimateGas = async function (overrides?: Omit<QuaiTransactionRequest, 'to'>): Promise<bigint> {
        const runner = getRunner(contract.runner, 'estimateGas');
        assert(canEstimate(runner), 'contract runner does not support gas estimation', 'UNSUPPORTED_OPERATION', {
            operation: 'estimateGas',
        });

        return await runner.estimateGas(await populateTransaction(overrides));
    };

    /**
     * Send a transaction with the given overrides.
     *
     * @param {Omit<QuaiTransactionRequest, 'to'>} [overrides] - The transaction overrides.
     * @returns {Promise<ContractTransactionResponse>} The transaction response.
     * @throws {Error} If the transaction fails.
     */
    const method = async (overrides?: Omit<QuaiTransactionRequest, 'to'>) => {
        return await send(overrides);
    };

    defineProperties<any>(method, {
        _contract: contract,

        estimateGas,
        populateTransaction,
        send,
        staticCall,
    });

    return <WrappedFallback>method;
}

/**
 * Build a wrapped method for a contract.
 *
 * @param {BaseContract} contract - The contract instance.
 * @param {string} key - The method key.
 * @returns {BaseContractMethod<A, R, D>} The wrapped method.
 */
function buildWrappedMethod<
    A extends Array<any> = Array<any>,
    R = any,
    D extends R | ContractTransactionResponse = ContractTransactionResponse,
>(contract: BaseContract, key: string): BaseContractMethod<A, R, D> {
    /**
     * Get the function fragment for the given arguments.
     *
     * @param {...ContractMethodArgs<A>} args - The method arguments.
     * @returns {FunctionFragment} The function fragment.
     * @throws {Error} If no matching fragment is found.
     */
    const getFragment = function (...args: ContractMethodArgs<A>): FunctionFragment {
        const fragment = contract.interface.getFunction(key, args);
        assert(fragment, 'no matching fragment', 'UNSUPPORTED_OPERATION', {
            operation: 'fragment',
            info: { key, args },
        });
        return fragment;
    };

    /**
     * Populate a transaction with the given arguments.
     *
     * @param {...ContractMethodArgs<A>} args - The method arguments.
     * @returns {Promise<ContractTransaction>} The populated transaction.
     * @throws {Error} If the arguments are invalid.
     */
    const populateTransaction = async function (...args: ContractMethodArgs<A>): Promise<ContractTransaction> {
        const fragment = getFragment(...args);

        // If an overrides was passed in, copy it and normalize the values
        let overrides: Omit<ContractTransaction, 'data' | 'to'>;
        if (fragment.inputs.length + 1 === args.length) {
            overrides = await copyOverrides(args.pop());

            const resolvedArgs = await resolveArgs(contract.runner, fragment.inputs, args);

            return Object.assign(
                {},
                overrides,
                await resolveProperties({
                    to: contract.getAddress(),
                    data: contract.interface.encodeFunctionData(fragment, resolvedArgs),
                }),
            );
        }

        if (fragment.inputs.length !== args.length) {
            throw new Error("internal error: fragment inputs doesn't match arguments; should not happen");
        }

        const resolvedArgs = await resolveArgs(contract.runner, fragment.inputs, args);

        return await resolveProperties({
            to: contract.getAddress(),
            from: args.pop()?.from,
            data: contract.interface.encodeFunctionData(fragment, resolvedArgs),
        });
    };

    /**
     * Perform a static call with the given arguments.
     *
     * @param {...ContractMethodArgs<A>} args - The method arguments.
     * @returns {Promise<R>} The result of the static call.
     * @throws {Error} If the call fails.
     */
    const staticCall = async function (...args: ContractMethodArgs<A>): Promise<R> {
        const result = await staticCallResult(...args);
        if (result.length === 1) {
            return result[0];
        }
        return <R>(<unknown>result);
    };

    /**
     * Send a transaction with the given arguments.
     *
     * @param {...ContractMethodArgs<A>} args - The method arguments.
     * @returns {Promise<ContractTransactionResponse>} The transaction response.
     * @throws {Error} If the transaction fails.
     */
    const send = async function (...args: ContractMethodArgs<A>): Promise<ContractTransactionResponse> {
        const runner = contract.runner;
        assert(canSend(runner), 'contract runner does not support sending transactions', 'UNSUPPORTED_OPERATION', {
            operation: 'sendTransaction',
        });
        const pop = await populateTransaction(...args);
        if (!pop.from && 'address' in runner && typeof runner.address === 'string') {
            pop.from = await resolveAddress(runner.address);
        }

        const tx = (await runner.sendTransaction(await pop)) as QuaiTransactionResponse;
        const provider = getProvider(contract.runner);
        // @TODO: the provider can be null; make a custom dummy provider that will throw a
        // meaningful error
        return new ContractTransactionResponse(contract.interface, <Provider>provider, tx);
    };

    /**
     * Estimate the gas required for a transaction with the given arguments.
     *
     * @param {...ContractMethodArgs<A>} args - The method arguments.
     * @returns {Promise<bigint>} The estimated gas.
     * @throws {Error} If the gas estimation fails.
     */
    const estimateGas = async function (...args: ContractMethodArgs<A>): Promise<bigint> {
        const runner = getRunner(contract.runner, 'estimateGas');
        assert(canEstimate(runner), 'contract runner does not support gas estimation', 'UNSUPPORTED_OPERATION', {
            operation: 'estimateGas',
        });

        return await runner.estimateGas(await populateTransaction(...args));
    };

    /**
     * Perform a static call and return the result with the given arguments.
     *
     * @param {...ContractMethodArgs<A>} args - The method arguments.
     * @returns {Promise<Result>} The result of the static call.
     * @throws {Error} If the call fails.
     */
    const staticCallResult = async function (...args: ContractMethodArgs<A>): Promise<Result> {
        const runner = getRunner(contract.runner, 'call');
        assert(canCall(runner), 'contract runner does not support calling', 'UNSUPPORTED_OPERATION', {
            operation: 'call',
        });
        const tx = await populateTransaction(...args);
        if (!tx.from && 'address' in runner && typeof runner.address === 'string') {
            tx.from = await resolveAddress(runner.address);
        }

        let result = '0x';
        try {
            result = await runner.call(tx);
        } catch (error: any) {
            if (isCallException(error) && error.data) {
                throw contract.interface.makeError(error.data, tx);
            }
            throw error;
        }

        const fragment = getFragment(...args);
        return contract.interface.decodeFunctionResult(fragment, result);
    };

    /**
     * Send a transaction or perform a static call based on the method arguments.
     *
     * @param {...ContractMethodArgs<A>} args - The method arguments.
     * @returns {Promise<R | ContractTransactionResponse>} The result of the method call.
     * @throws {Error} If the method call fails.
     */
    const method = async (...args: ContractMethodArgs<A>) => {
        const fragment = getFragment(...args);
        if (fragment.constant) {
            return await staticCall(...args);
        }
        return await send(...args);
    };

    defineProperties<any>(method, {
        name: contract.interface.getFunctionName(key),
        _contract: contract,
        _key: key,

        getFragment,

        estimateGas,
        populateTransaction,
        send,
        staticCall,
        staticCallResult,
    });

    // Only works on non-ambiguous keys (refined fragment is always non-ambiguous)
    Object.defineProperty(method, 'fragment', {
        configurable: false,
        enumerable: true,
        get: () => {
            const fragment = contract.interface.getFunction(key);
            assert(fragment, 'no matching fragment', 'UNSUPPORTED_OPERATION', {
                operation: 'fragment',
                info: { key },
            });
            return fragment;
        },
    });

    return <BaseContractMethod<A, R, D>>method;
}

/**
 * Build a wrapped event for a contract.
 *
 * @param {BaseContract} contract - The contract instance.
 * @param {string} key - The event key.
 * @returns {ContractEvent<A>} The wrapped event.
 */
function buildWrappedEvent<A extends Array<any> = Array<any>>(contract: BaseContract, key: string): ContractEvent<A> {
    /**
     * Get the event fragment for the given arguments.
     *
     * @param {...ContractEventArgs<A>} args - The event arguments.
     * @returns {EventFragment} The event fragment.
     * @throws {Error} If no matching fragment is found.
     */
    const getFragment = function (...args: ContractEventArgs<A>): EventFragment {
        const fragment = contract.interface.getEvent(key, args);

        assert(fragment, 'no matching fragment', 'UNSUPPORTED_OPERATION', {
            operation: 'fragment',
            info: { key, args },
        });

        return fragment;
    };

    /**
     * Create a prepared topic filter for the event.
     *
     * @param {...ContractMethodArgs<A>} args - The event arguments.
     * @returns {PreparedTopicFilter} The prepared topic filter.
     */
    const method = function (...args: ContractMethodArgs<A>): PreparedTopicFilter {
        return new PreparedTopicFilter(contract, getFragment(...args), args);
    };

    defineProperties<any>(method, {
        name: contract.interface.getEventName(key),
        _contract: contract,
        _key: key,

        getFragment,
    });

    // Only works on non-ambiguous keys (refined fragment is always non-ambiguous)
    Object.defineProperty(method, 'fragment', {
        configurable: false,
        enumerable: true,
        get: () => {
            const fragment = contract.interface.getEvent(key);

            assert(fragment, 'no matching fragment', 'UNSUPPORTED_OPERATION', {
                operation: 'fragment',
                info: { key },
            });

            return fragment;
        },
    });

    return <ContractEvent<A>>(<unknown>method);
}

type Sub = {
    tag: string;
    listeners: Array<{ listener: Listener; once: boolean }>;
    start: () => void;
    stop: () => void;
};

// The combination of TypeScrype, Private Fields and Proxies makes
// the world go boom; so we hide variables with some trickery keeping
// a symbol attached to each BaseContract which its sub-class (even
// via a Proxy) can reach and use to look up its internal values.

const internal = Symbol.for('_quaisInternal_contract');
type Internal = {
    addrPromise: Promise<string>;
    addr: null | string;

    deployTx: null | ContractTransactionResponse;

    subs: Map<string, Sub>;
};

const internalValues: WeakMap<BaseContract, Internal> = new WeakMap();

/**
 * Set internal values for a contract.
 *
 * @param {BaseContract} contract - The contract instance.
 * @param {Internal} values - The internal values.
 */
function setInternal(contract: BaseContract, values: Internal): void {
    internalValues.set(contract[internal], values);
}

/**
 * Get internal values for a contract.
 *
 * @param {BaseContract} contract - The contract instance.
 * @returns {Internal} The internal values.
 */
function getInternal(contract: BaseContract): Internal {
    return internalValues.get(contract[internal]) as Internal;
}

/**
 * Check if a value is a deferred topic filter.
 *
 * @param {any} value - The value to check.
 * @returns {value is DeferredTopicFilter} True if the value is a deferred topic filter.
 */
function isDeferred(value: any): value is DeferredTopicFilter {
    return (
        value &&
        typeof value === 'object' &&
        'getTopicFilter' in value &&
        typeof value.getTopicFilter === 'function' &&
        value.fragment
    );
}

/**
 * Get subscription information for an event.
 *
 * @param {BaseContract} contract - The contract instance.
 * @param {ContractEventName} event - The event name.
 * @returns {Promise<{ fragment: null | EventFragment; tag: string; topics: TopicFilter }>} The subscription
 *   information.
 * @throws {Error} If the event name is unknown.
 */
async function getSubInfo(
    contract: BaseContract,
    event: ContractEventName,
): Promise<{ fragment: null | EventFragment; tag: string; topics: TopicFilter }> {
    let topics: Array<null | string | Array<string>>;
    let fragment: null | EventFragment = null;

    // Convert named events to topicHash and get the fragment for
    // events which need deconstructing.

    if (Array.isArray(event)) {
        const topicHashify = function (name: string): string {
            if (isHexString(name, 32)) {
                return name;
            }
            const fragment = contract.interface.getEvent(name);
            assertArgument(fragment, 'unknown fragment', 'name', name);
            return fragment.topicHash;
        };

        // Array of Topics and Names; e.g. `[ "0x1234...89ab", "Transfer(address)" ]`
        topics = event.map((e) => {
            if (e == null) {
                return null;
            }
            if (Array.isArray(e)) {
                return e.map(topicHashify);
            }
            return topicHashify(e);
        });
    } else if (event === '*') {
        topics = [null];
    } else if (typeof event === 'string') {
        if (isHexString(event, 32)) {
            // Topic Hash
            topics = [event];
        } else {
            // Name or Signature; e.g. `"Transfer", `"Transfer(address)"`
            fragment = contract.interface.getEvent(event);
            assertArgument(fragment, 'unknown fragment', 'event', event);
            topics = [fragment.topicHash];
        }
    } else if (isDeferred(event)) {
        // Deferred Topic Filter; e.g. `contract.filter.Transfer(from)`
        topics = await event.getTopicFilter();
    } else if (event && 'fragment' in event) {
        // ContractEvent; e.g. `contract.filter.Transfer`
        fragment = event.fragment;
        topics = [fragment.topicHash];
    } else {
        assertArgument(false, 'unknown event name', 'event', event);
    }

    // Normalize topics and sort TopicSets
    topics = topics.map((t) => {
        if (t == null) {
            return null;
        }
        if (Array.isArray(t)) {
            const items = Array.from(new Set(t.map((t) => t.toLowerCase())).values());
            if (items.length === 1) {
                return items[0];
            }
            items.sort();
            return items;
        }
        return t.toLowerCase();
    });

    const tag = topics
        .map((t) => {
            if (t == null) {
                return 'null';
            }
            if (Array.isArray(t)) {
                return t.join('|');
            }
            return t;
        })
        .join('&');

    return { fragment, tag, topics };
}

/**
 * Check if a contract has a subscription for an event.
 *
 * @param {BaseContract} contract - The contract instance.
 * @param {ContractEventName} event - The event name.
 * @returns {Promise<null | Sub>} The subscription if available, otherwise null.
 */
async function hasSub(contract: BaseContract, event: ContractEventName): Promise<null | Sub> {
    const { subs } = getInternal(contract);
    return subs.get((await getSubInfo(contract, event)).tag) || null;
}

/**
 * Get a subscription for an event.
 *
 * @param {BaseContract} contract - The contract instance.
 * @param {string} operation - The operation name.
 * @param {ContractEventName} event - The event name.
 * @returns {Promise<Sub>} The subscription.
 * @throws {Error} If the contract runner does not support subscribing.
 */
async function getSub(contract: BaseContract, operation: string, event: ContractEventName): Promise<Sub> {
    // Make sure our runner can actually subscribe to events
    const provider = getProvider(contract.runner);
    assert(provider, 'contract runner does not support subscribing', 'UNSUPPORTED_OPERATION', { operation });

    const { fragment, tag, topics } = await getSubInfo(contract, event);

    const { addr, subs } = getInternal(contract);

    let sub = subs.get(tag);
    if (!sub) {
        const address: string | Addressable = addr ? addr : contract;
        const filter = { address, topics };
        const listener = (log: Log) => {
            let foundFragment = fragment;
            if (foundFragment == null) {
                try {
                    foundFragment = contract.interface.getEvent(log.topics[0]);
                    // eslint-disable-next-line no-empty
                } catch (error) {}
            }

            // If fragment is null, we do not deconstruct the args to emit

            if (foundFragment) {
                const _foundFragment = foundFragment;
                const args = fragment ? contract.interface.decodeEventLog(fragment, log.data, log.topics) : [];
                emit(contract, event, args, (listener: null | Listener) => {
                    return new ContractEventPayload(contract, listener, event, _foundFragment, log);
                });
            } else {
                emit(contract, event, [], (listener: null | Listener) => {
                    return new ContractUnknownEventPayload(contract, listener, event, log);
                });
            }
        };

        const zone = getZoneForAddress(await resolveAddress(address));
        let starting: Array<Promise<any>> = [];
        const start = () => {
            if (starting.length) {
                return;
            }
            starting.push(provider.on(filter, listener, zone!));
        };

        const stop = async () => {
            if (starting.length == 0) {
                return;
            }

            const started = starting;
            starting = [];
            await Promise.all(started);
            provider.off(filter, listener, zone!);
        };

        sub = { tag, listeners: [], start, stop };
        subs.set(tag, sub);
    }
    return sub;
}
/**
 * We use this to ensure one emit resolves before firing the next to ensure correct ordering (note this cannot throw and
 * just adds the notice to the event queue using setTimeout).
 */
let lastEmit: Promise<any> = Promise.resolve();

type PayloadFunc = (listener: null | Listener) => ContractUnknownEventPayload;

/**
 * Emit an event with the given arguments and payload function.
 *
 * @ignore
 * @param {BaseContract} contract - The contract instance.
 * @param {ContractEventName} event - The event name.
 * @param {any[]} args - The arguments to pass to the listeners.
 * @param {null | PayloadFunc} payloadFunc - The payload function.
 * @returns {Promise<boolean>} Resolves to true if any listeners were called.
 */
async function _emit(
    contract: BaseContract,
    event: ContractEventName,
    args: Array<any>,
    payloadFunc: null | PayloadFunc,
): Promise<boolean> {
    await lastEmit;

    const sub = await hasSub(contract, event);
    if (!sub) {
        return false;
    }

    const count = sub.listeners.length;
    sub.listeners = sub.listeners.filter(({ listener, once }) => {
        const passArgs = Array.from(args);
        if (payloadFunc) {
            passArgs.push(payloadFunc(once ? null : listener));
        }
        try {
            listener.call(contract, ...passArgs);
            // eslint-disable-next-line no-empty
        } catch (error) {}
        return !once;
    });

    if (sub.listeners.length === 0) {
        sub.stop();
        getInternal(contract).subs.delete(sub.tag);
    }

    return count > 0;
}

/**
 * Emit an event with the given arguments and payload function.
 *
 * @param {BaseContract} contract - The contract instance.
 * @param {ContractEventName} event - The event name.
 * @param {any[]} args - The arguments to pass to the listeners.
 * @param {null | PayloadFunc} payloadFunc - The payload function.
 * @returns {Promise<boolean>} Resolves to true if any listeners were called.
 */
async function emit(
    contract: BaseContract,
    event: ContractEventName,
    args: Array<any>,
    payloadFunc: null | PayloadFunc,
): Promise<boolean> {
    try {
        await lastEmit;
        // eslint-disable-next-line no-empty
    } catch (error) {}

    const resultPromise = _emit(contract, event, args, payloadFunc);
    lastEmit = resultPromise;
    return await resultPromise;
}

const passProperties = ['then'];
/**
 * Creates a new contract connected to target with the abi and optionally connected to a runner to perform operations on
 * behalf of.
 *
 * @category Contract
 */
export class BaseContract implements Addressable, EventEmitterable<ContractEventName> {
    /**
     * The target to connect to.
     *
     * This can be an address or any [Addressable](../interfaces/Addressable), such as another contract. To get the
     * resolved address, use the `getAddress` method.
     */
    readonly target!: string | Addressable;

    /**
     * The contract Interface.
     */
    readonly interface!: Interface;

    /**
     * The connected runner. This is generally a [**Provider**](../interfaces/Provider) or a
     * [**Signer**](../interfaces/Signer), which dictates what operations are supported.
     *
     * For example, a **Contract** connected to a [**Provider**](../interfaces/Provider) may only execute read-only
     * operations.
     */
    readonly runner!: null | ContractRunner;

    /**
     * All the Events available on this contract.
     */
    readonly filters!: Record<string, ContractEvent>;

    /**
     * @ignore
     */
    readonly [internal]: any;

    /**
     * The fallback or receive function if any.
     */
    readonly fallback!: null | WrappedFallback;

    /**
     * Creates a new contract connected to `target` with the `abi` and optionally connected to a `runner` to perform
     * operations on behalf of.
     *
     * @ignore
     */
    constructor(
        target: string | Addressable,
        abi: Interface | InterfaceAbi,
        runner?: null | ContractRunner,
        _deployTx?: null | QuaiTransactionResponse,
    ) {
        assertArgument(
            typeof target === 'string' || isAddressable(target),
            'invalid value for Contract target',
            'target',
            target,
        );

        if (runner == null) {
            runner = null;
        }
        const iface = Interface.from(abi);
        defineProperties<BaseContract>(this, { target, runner, interface: iface });

        Object.defineProperty(this, internal, { value: {} });

        let addrPromise;
        let addr: null | string = null;

        let deployTx: null | ContractTransactionResponse = null;
        if (_deployTx) {
            const provider = getProvider(runner);
            // @TODO: the provider can be null; make a custom dummy provider that will throw a
            // meaningful error
            deployTx = new ContractTransactionResponse(this.interface, <Provider>provider, _deployTx);
        }

        const subs = new Map();

        // Resolve the target as the address
        if (typeof target === 'string') {
            addr = target;
            addrPromise = Promise.resolve(target);
        } else {
            addrPromise = target.getAddress().then((addr) => {
                if (addr == null) {
                    throw new Error('TODO');
                }
                getInternal(this).addr = addr;
                return addr;
            });
        }

        // Set our private values
        setInternal(this, { addrPromise, addr, deployTx, subs });

        // Add the event filters
        const filters = new Proxy(
            {},
            {
                get: (target, prop, receiver) => {
                    // Pass important checks (like `then` for Promise) through
                    if (typeof prop === 'symbol' || passProperties.indexOf(prop) >= 0) {
                        return Reflect.get(target, prop, receiver);
                    }

                    try {
                        return this.getEvent(prop);
                    } catch (error) {
                        if (!isError(error, 'INVALID_ARGUMENT') || error.argument !== 'key') {
                            throw error;
                        }
                    }

                    return undefined;
                },
                has: (target, prop) => {
                    // Pass important checks (like `then` for Promise) through
                    if (passProperties.indexOf(<string>prop) >= 0) {
                        return Reflect.has(target, prop);
                    }

                    return Reflect.has(target, prop) || this.interface.hasEvent(String(prop));
                },
            },
        );
        defineProperties<BaseContract>(this, { filters });

        defineProperties<BaseContract>(this, {
            fallback: iface.receive || iface.fallback ? buildWrappedFallback(this) : null,
        });

        // Return a Proxy that will respond to functions
        return new Proxy(this, {
            get: (target, prop, receiver) => {
                if (typeof prop === 'symbol' || prop in target || passProperties.indexOf(prop) >= 0) {
                    return Reflect.get(target, prop, receiver);
                }

                // Undefined properties should return undefined
                try {
                    return target.getFunction(prop);
                } catch (error) {
                    if (!isError(error, 'INVALID_ARGUMENT') || error.argument !== 'key') {
                        throw error;
                    }
                }

                return undefined;
            },
            has: (target, prop) => {
                if (typeof prop === 'symbol' || prop in target || passProperties.indexOf(prop) >= 0) {
                    return Reflect.has(target, prop);
                }

                return target.interface.hasFunction(prop);
            },
        });
    }

    /**
     * Return a new Contract instance with the same target and ABI, but a different `runner`.
     *
     * @param {null | ContractRunner} runner - The runner to use.
     * @returns {BaseContract} The new contract instance.
     */
    connect(runner: null | ContractRunner): BaseContract {
        return new BaseContract(this.target, this.interface, runner);
    }

    /**
     * Return a new Contract instance with the same ABI and runner, but a different `target`.
     *
     * @param {string | Addressable} target - The target to connect to.
     * @returns {BaseContract} The new contract instance.
     */
    attach(target: string | Addressable): BaseContract {
        return new BaseContract(target, this.interface, this.runner);
    }

    /**
     * Return the resolved address of this Contract.
     *
     * @returns {Promise<string>} The resolved address.
     */
    async getAddress(): Promise<string> {
        return await getInternal(this).addrPromise;
    }

    /**
     * Return the deployed bytecode or null if no bytecode is found.
     *
     * @returns {Promise<null | string>} The deployed bytecode or null.
     * @throws {Error} If the runner does not support .provider.
     */
    async getDeployedCode(): Promise<null | string> {
        const provider = getProvider(this.runner);
        assert(provider, 'runner does not support .provider', 'UNSUPPORTED_OPERATION', {
            operation: 'getDeployedCode',
        });

        const code = await provider.getCode(await this.getAddress());
        if (code === '0x') {
            return null;
        }
        return code;
    }

    /**
     * Resolve to this Contract once the bytecode has been deployed, or resolve immediately if already deployed.
     *
     * @returns {Promise<this>} The contract instance.
     * @throws {Error} If the contract runner does not support .provider.
     */
    async waitForDeployment(): Promise<this> {
        // We have the deployment transaction; just use that (throws if deployment fails)
        const deployTx = this.deploymentTransaction();
        if (deployTx) {
            await deployTx.wait();
            return this;
        }

        // Check for code
        const code = await this.getDeployedCode();
        if (code != null) {
            return this;
        }

        // Make sure we can subscribe to a provider event
        const provider = getProvider(this.runner);
        assert(provider != null, 'contract runner does not support .provider', 'UNSUPPORTED_OPERATION', {
            operation: 'waitForDeployment',
        });

        return new Promise((resolve, reject) => {
            const checkCode = async () => {
                try {
                    const code = await this.getDeployedCode();
                    if (code != null) {
                        return resolve(this);
                    }
                    provider.once('block', checkCode);
                } catch (error) {
                    reject(error);
                }
            };
            checkCode();
        });
    }

    /**
     * Return the transaction used to deploy this contract.
     *
     * This is only available if this instance was returned from a [**ContractFactor**](../classes/ContractFactory).
     *
     * @returns The transaction used to deploy this contract or `null`.
     */
    deploymentTransaction(): null | ContractTransactionResponse {
        return getInternal(this).deployTx;
    }

    /**
     * Return the function for a given name. This is useful when a contract method name conflicts with a JavaScript name
     * such as `prototype` or when using a Contract programatically.
     *
     * @param {string | FunctionFragment} key - The name of the function to return.
     * @returns The function for the given name.
     */
    getFunction<T extends ContractMethod = ContractMethod>(key: string | FunctionFragment): T {
        if (typeof key !== 'string') {
            key = key.format();
        }
        const func = buildWrappedMethod(this, key);
        return <T>func;
    }

    /**
     * Return the event for a given name. This is useful when a contract event name conflicts with a JavaScript name
     * such as `prototype` or when using a Contract programatically.
     *
     * @param {string | EventFragment} key - The name of the event to return.
     * @returns The event for the given name.
     */
    getEvent(key: string | EventFragment): ContractEvent {
        if (typeof key !== 'string') {
            key = key.format();
        }
        return buildWrappedEvent(this, key);
    }

    /**
     * @ignore
     */
    // TODO: implement
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async queryTransaction(hash: string): Promise<Array<EventLog>> {
        throw new Error('@TODO');
    }

    /**
     * Provide historic access to event data for `event` in the range `fromBlock` (default: `0`) to `toBlock` (default:
     * `"latest"`) inclusive.
     *
     * @param {Zone} zone - The zone to query.
     * @param {ContractEventName} event - The event to query.
     * @param {BlockTag} fromBlock - The block to start querying from.
     * @param {BlockTag} toBlock - The block to stop querying at.
     * @returns An array of event logs.
     */
    async queryFilter(
        event: ContractEventName,
        fromBlock?: BlockTag,
        toBlock?: BlockTag,
    ): Promise<Array<EventLog | Log>> {
        if (fromBlock == null) {
            fromBlock = 0;
        }
        if (toBlock == null) {
            toBlock = 'latest';
        }
        const { addr, addrPromise } = getInternal(this);
        const address = addr ? addr : await addrPromise;
        const { fragment, topics } = await getSubInfo(this, event);
        const zone = getZoneForAddress(address)!;
        const filter: Filter = { address, topics, fromBlock, toBlock, nodeLocation: getNodeLocationFromZone(zone) };

        const provider = getProvider(this.runner);
        assert(provider, 'contract runner does not have a provider', 'UNSUPPORTED_OPERATION', {
            operation: 'queryFilter',
        });

        return (await provider.getLogs(filter)).map((log) => {
            let foundFragment = fragment;
            if (foundFragment == null) {
                try {
                    foundFragment = this.interface.getEvent(log.topics[0]);
                    // eslint-disable-next-line no-empty
                } catch (error) {}
            }

            if (foundFragment) {
                try {
                    return new EventLog(log, this.interface, foundFragment);
                } catch (error: any) {
                    return new UndecodedEventLog(log, error);
                }
            }

            return new Log(log, provider);
        });
    }

    /**
     * Add an event `listener` for the `event`.
     *
     * @param {ContractEventName} event - The event to listen for.
     * @param {Listener} listener - The listener to call when the event is emitted.
     * @returns This contract instance.
     */
    async on(event: ContractEventName, listener: Listener): Promise<this> {
        const sub = await getSub(this, 'on', event);
        sub.listeners.push({ listener, once: false });
        sub.start();
        return this;
    }

    /**
     * Add an event `listener` for the `event`, but remove the listener after it is fired once.
     *
     * @param {ContractEventName} event - The event to listen for.
     * @param {Listener} listener - The listener to call when the event is emitted.
     */
    async once(event: ContractEventName, listener: Listener): Promise<this> {
        const sub = await getSub(this, 'once', event);
        sub.listeners.push({ listener, once: true });
        sub.start();
        return this;
    }

    /**
     * Emit an `event` calling all listeners with `args`.
     *
     * Resolves to `true` if any listeners were called.
     *
     * @param {ContractEventName} event - The event to emit.
     * @param {any[]} args - The arguments to pass to the listeners.
     * @returns `true` if any listeners were called.
     */
    async emit(event: ContractEventName, ...args: Array<any>): Promise<boolean> {
        return await emit(this, event, args, null);
    }

    /**
     * Resolves to the number of listeners of `event` or the total number of listeners if unspecified.
     *
     * @param {ContractEventName} event - The event to count listeners for.
     * @returns {number} The number of listeners.
     */
    async listenerCount(event?: ContractEventName): Promise<number> {
        if (event) {
            const sub = await hasSub(this, event);
            if (!sub) {
                return 0;
            }
            return sub.listeners.length;
        }

        const { subs } = getInternal(this);

        let total = 0;
        for (const { listeners } of subs.values()) {
            total += listeners.length;
        }
        return total;
    }

    /**
     * Resolves to the listeners subscribed to `event` or all listeners if unspecified.
     *
     * @param {ContractEventName} event - The event to get listeners for.
     * @returns {Listener[]} The listeners.
     */
    async listeners(event?: ContractEventName): Promise<Array<Listener>> {
        if (event) {
            const sub = await hasSub(this, event);
            if (!sub) {
                return [];
            }
            return sub.listeners.map(({ listener }) => listener);
        }

        const { subs } = getInternal(this);

        let result: Array<Listener> = [];
        for (const { listeners } of subs.values()) {
            result = result.concat(listeners.map(({ listener }) => listener));
        }
        return result;
    }

    /**
     * Remove the `listener` from the listeners for `event` or remove all listeners if unspecified.
     *
     * @param {ContractEventName} event - The event to remove the listener from.
     * @param {Listener} listener - The listener to remove.
     * @returns This contract instance.
     */
    async off(event: ContractEventName, listener?: Listener): Promise<this> {
        const sub = await hasSub(this, event);
        if (!sub) {
            return this;
        }

        if (listener) {
            const index = sub.listeners.map(({ listener }) => listener).indexOf(listener);
            if (index >= 0) {
                sub.listeners.splice(index, 1);
            }
        }

        if (listener == null || sub.listeners.length === 0) {
            sub.stop();
            getInternal(this).subs.delete(sub.tag);
        }

        return this;
    }

    /**
     * Remove all the listeners for `event` or remove all listeners if unspecified.
     *
     * @param {ContractEventName} event - The event to remove the listeners from.
     * @returns This contract instance.
     */
    async removeAllListeners(event?: ContractEventName): Promise<this> {
        if (event) {
            const sub = await hasSub(this, event);
            if (!sub) {
                return this;
            }
            sub.stop();
            getInternal(this).subs.delete(sub.tag);
        } else {
            const { subs } = getInternal(this);
            for (const { tag, stop } of subs.values()) {
                stop();
                subs.delete(tag);
            }
        }

        return this;
    }

    /**
     * Alias for {@link BaseContract.on | **on**}.
     *
     * @param {ContractEventName} event - The event to listen for.
     * @param {Listener} listener - The listener to call when the event is emitted.
     */
    async addListener(event: ContractEventName, listener: Listener): Promise<this> {
        return await this.on(event, listener);
    }

    /**
     * Alias for {@link BaseContract.off | **off**}.
     *
     * @param {ContractEventName} event - The event to remove the listener from.
     * @param {Listener} listener - The listener to remove.
     */
    async removeListener(event: ContractEventName, listener: Listener): Promise<this> {
        return await this.off(event, listener);
    }

    /**
     * Create a new Class for the `abi`.
     *
     * @param {Interface | InterfaceAbi} abi - The ABI to create the class from.
     * @returns The new Class for the ABI.
     */
    static buildClass<T = ContractInterface>(
        abi: Interface | InterfaceAbi,
    ): new (target: string, runner?: null | ContractRunner) => BaseContract & Omit<T, keyof BaseContract> {
        class CustomContract extends BaseContract {
            constructor(address: string, runner: null | ContractRunner = null) {
                super(address, abi, runner);
            }
        }
        return CustomContract as any;
    }

    /**
     * Create a new BaseContract with a specified Interface.
     *
     * @param {string} target - The target to connect to.
     * @param {Interface | InterfaceAbi} abi - The ABI to use.
     * @param {null | ContractRunner} runner - The runner to use.
     * @returns The new BaseContract.
     */
    static from<T = ContractInterface>(
        target: string,
        abi: Interface | InterfaceAbi,
        runner?: null | ContractRunner,
    ): BaseContract & Omit<T, keyof BaseContract> {
        if (runner == null) {
            runner = null;
        }
        const contract = new this(target, abi, runner);
        return contract as any;
    }
}

function _ContractBase(): new (
    target: string,
    abi: Interface | InterfaceAbi,
    runner?: null | ContractRunner,
) => BaseContract & Omit<ContractInterface, keyof BaseContract> {
    return BaseContract as any;
}

/**
 * A {@link BaseContract | **BaseContract**} with no type guards on its methods or events.
 *
 * @category Contract
 */
export class Contract extends _ContractBase() {}
