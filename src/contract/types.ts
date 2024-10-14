import type { EventFragment, FunctionFragment, Result, Typed } from '../abi/index.js';
import type { ContractTransactionResponse } from './wrappers.js';
import type {
    Provider,
    TopicFilter,
    QuaiTransactionRequest,
    QuaiPreparedTransactionRequest,
    TransactionResponse,
    TransactionRequest,
} from '../providers/index.js';
import { AccessList } from '../transaction/index.js';

/**
 * The name for an event used for subscribing to Contract events.
 *
 * **`string`** - An event by name. The event must be non-ambiguous. The parameters will be dereferenced when passed
 * into the listener.
 *
 * {@link ContractEvent | **ContractEvent**} - A filter from the `contract.filters`, which will pass only the
 * EventPayload as a single parameter, which includes a `.signature` property that can be used to further filter the
 * event.
 *
 * {@link TopicFilter | **TopicFilter**} - A filter defined using the standard Ethereum API which provides the specific
 * topic hash or topic hashes to watch for along with any additional values to filter by. This will only pass a single
 * parameter to the listener, the EventPayload which will include additional details to refine by, such as the event
 * name and signature.
 *
 * {@link DeferredTopicFilter | **DeferredTopicFilter**} - A filter created by calling a
 * {@link ContractEvent | **ContractEvent**} with parameters, which will create a filter for a specific event signautre
 * and dereference each parameter when calling the listener.
 *
 * @category Contract
 */
export type ContractEventName = string | ContractEvent | TopicFilter | DeferredTopicFilter;

/**
 * A Contract with no method constraints.
 *
 * @category Contract
 */
export interface ContractInterface {
    [name: string]: BaseContractMethod;
}

/**
 * When creating a filter using the `contract.filters`, this is returned.
 *
 * @category Contract
 */
export interface DeferredTopicFilter {
    /**
     * Get the topic filter.
     *
     * @returns {Promise<TopicFilter>} A promise resolving to the topic filter.
     */
    getTopicFilter(): Promise<TopicFilter>;

    /**
     * The fragment of the event.
     */
    fragment: EventFragment;
}

/**
 * When populating a transaction this type is returned.
 *
 * @category Contract
 */
export interface ContractTransaction extends QuaiPreparedTransactionRequest {
    /**
     * The target address.
     */
    to: string;

    /**
     * The transaction data.
     */
    data: string;

    /**
     * The from address, if any.
     */
    from: string;
}

/**
 * A deployment transaction for a contract.
 *
 * @category Contract
 */
export interface ContractDeployTransaction extends Omit<ContractTransaction, 'to'> {}

/**
 * The overrides for a contract transaction.
 *
 * @category Contract
 */
export interface Overrides extends Omit<TransactionRequest, 'to' | 'data'> {}

/**
 * Arguments to a Contract method can always include an additional and optional overrides parameter.
 *
 * @ignore
 */
export type PostfixOverrides<A extends Array<any>> = A | [...A, Overrides];

/**
 * Arguments to a Contract method can always include an additional and optional overrides parameter, and each parameter
 * can optionally be [**Typed**](../classes/Typed).
 *
 * @ignore
 */
export type ContractMethodArgs<A extends Array<any>> = PostfixOverrides<{ [I in keyof A]-?: A[I] | Typed }>;

// A = Arguments passed in as a tuple
// R = The result type of the call (i.e. if only one return type,
//     the qualified type, otherwise Result)
// D = The type the default call will return (i.e. R for view/pure,
//     TransactionResponse otherwise)

/**
 * A Contract method can be called directly, or used in various ways.
 *
 * @category Contract
 */
export interface BaseContractMethod<
    A extends Array<any> = Array<any>,
    R = any,
    D extends R | ContractTransactionResponse = R | ContractTransactionResponse,
> {
    /**
     * Call the contract method with arguments.
     *
     * @param {...ContractMethodArgs<A>} args - The arguments to call the method with.
     * @returns {Promise<D>} A promise resolving to the result of the call.
     */
    (...args: ContractMethodArgs<A>): Promise<D>;

    /**
     * The name of the Contract method.
     */
    name: string;

    /**
     * The fragment of the Contract method. This will throw on ambiguous method names.
     */
    fragment: FunctionFragment;

    /**
     * Returns the fragment constrained by `args`. This can be used to resolve ambiguous method names.
     *
     * @param {ContractMethodArgs<A>} args - The arguments to constrain the fragment by.
     * @returns {FunctionFragment} The constrained fragment.
     */
    getFragment(...args: ContractMethodArgs<A>): FunctionFragment;

    /**
     * Returns a populated transaction that can be used to perform the contract method with `args`.
     *
     * @param {ContractMethodArgs<A>} args - The arguments to populate the transaction with.
     * @returns {Promise<ContractTransaction>} A promise resolving to the populated transaction.
     */
    populateTransaction(...args: ContractMethodArgs<A>): Promise<ContractTransaction>;

    /**
     * Call the contract method with `args` and return the value.
     *
     * If the return value is a single type, it will be dereferenced and returned directly, otherwise the full Result
     * will be returned.
     *
     * @param {ContractMethodArgs<A>} args - The arguments to call the method with.
     * @returns {Promise<R>} A promise resolving to the result of the static call.
     */
    staticCall(...args: ContractMethodArgs<A>): Promise<R>;

    /**
     * Send a transaction for the contract method with `args`.
     *
     * @param {ContractMethodArgs<A>} args - The arguments to call the method with.
     * @returns {Promise<ContractTransactionResponse>} A promise resolving to the transaction response.
     */
    send(...args: ContractMethodArgs<A>): Promise<ContractTransactionResponse>;

    /**
     * Estimate the gas to send the contract method with `args`.
     *
     * @param {ContractMethodArgs<A>} args - The arguments to call the method with.
     * @returns {Promise<bigint>} A promise resolving to the estimated gas.
     */
    estimateGas(...args: ContractMethodArgs<A>): Promise<bigint>;

    /**
     * Call the contract method with `args` and return the Result without any dereferencing.
     *
     * @param {ContractMethodArgs<A>} args - The arguments to call the method with.
     * @returns {Promise<Result>} A promise resolving to the Result of the static call.
     */
    staticCallResult(...args: ContractMethodArgs<A>): Promise<Result>;
}

/**
 * A contract method on a Contract.
 *
 * @category Contract
 */
export interface ContractMethod<
    A extends Array<any> = Array<any>,
    R = any,
    D extends R | ContractTransactionResponse = R | ContractTransactionResponse,
> extends BaseContractMethod<A, R, D> {}

/**
 * A pure or view method on a Contract.
 *
 * @category Contract
 */
export interface ConstantContractMethod<A extends Array<any>, R = any> extends ContractMethod<A, R, R> {}

/**
 * Each argument of an event is nullable (to indicate matching //any//.
 *
 * @ignore
 */
export type ContractEventArgs<A extends Array<any>> = { [I in keyof A]?: A[I] | Typed | null };

/**
 * A Contract event on a Contract.
 *
 * @category Contract
 */
export interface ContractEvent<A extends Array<any> = Array<any>> {
    /**
     * Create a deferred topic filter for the event.
     *
     * @param {...ContractEventArgs<A>} args - The arguments to create the filter with.
     * @returns {DeferredTopicFilter} The deferred topic filter.
     */
    (...args: ContractEventArgs<A>): DeferredTopicFilter;

    /**
     * The name of the Contract event.
     */
    name: string;

    /**
     * The fragment of the Contract event. This will throw on ambiguous method names.
     */
    fragment: EventFragment;

    /**
     * Returns the fragment constrained by `args`. This can be used to resolve ambiguous event names.
     *
     * @param {ContractEventArgs<A>} args - The arguments to constrain the fragment by.
     * @returns {EventFragment} The constrained fragment.
     */
    getFragment(...args: ContractEventArgs<A>): EventFragment;
}

/**
 * A Fallback or Receive function on a Contract.
 *
 * @category Contract
 */
export interface WrappedFallback {
    /**
     * Call the fallback method.
     *
     * @param {Omit<TransactionRequest, 'to'>} [overrides] - The transaction overrides.
     * @returns {Promise<ContractTransactionResponse>} A promise resolving to the transaction response.
     */
    (overrides?: Omit<TransactionRequest, 'to'>): Promise<ContractTransactionResponse>;

    /**
     * Returns a populated transaction that can be used to perform the fallback method.
     *
     * For non-receive fallback, `data` may be overridden.
     *
     * @param {Omit<TransactionRequest, 'to'>} [overrides] - The transaction overrides.
     * @returns {Promise<ContractTransaction>} A promise resolving to the populated transaction.
     */
    populateTransaction(overrides?: Omit<TransactionRequest, 'to'>): Promise<ContractTransaction>;

    /**
     * Call the contract fallback and return the result.
     *
     * For non-receive fallback, `data` may be overridden.
     *
     * @param {Omit<TransactionRequest, 'to'>} [overrides] - The transaction overrides.
     * @returns {Promise<string>} A promise resolving to the result of the call.
     */
    staticCall(overrides?: Omit<TransactionRequest, 'to'>): Promise<string>;

    /**
     * Send a transaction to the contract fallback.
     *
     * For non-receive fallback, `data` may be overridden.
     *
     * @param {Omit<TransactionRequest, 'to'>} [overrides] - The transaction overrides.
     * @returns {Promise<ContractTransactionResponse>} A promise resolving to the transaction response.
     */
    send(overrides?: Omit<TransactionRequest, 'to'>): Promise<ContractTransactionResponse>;

    /**
     * Estimate the gas to send a transaction to the contract fallback.
     *
     * For non-receive fallback, `data` may be overridden.
     *
     * @param {Omit<TransactionRequest, 'to'>} [overrides] - The transaction overrides.
     * @returns {Promise<bigint>} A promise resolving to the estimated gas.
     */
    estimateGas(overrides?: Omit<TransactionRequest, 'to'>): Promise<bigint>;
}

/**
 * A **ContractRunner** is a generic interface which defines an object capable of interacting with a Contract on the
 * network.
 *
 * The more operations supported, the more utility it is capable of.
 *
 * The most common ContractRunners are [Providers](../classes/Provider) which enable read-only access and
 * [Signers](../classes/Signer) which enable write-access.
 *
 * @category Contract
 */
export interface ContractRunner {
    /**
     * The provider used for necessary state querying operations.
     *
     * This can also point to the **ContractRunner** itself, in the case of an
     * [AbstractProvider](../classes/AbstractProvider).
     */
    provider: null | Provider;

    /**
     * Required to estimate gas.
     *
     * @param {TransactionRequest} tx - The transaction object.
     * @returns {Promise<bigint>} A promise resolving to the estimated gas.
     */
    estimateGas?: (tx: TransactionRequest) => Promise<bigint>;

    /**
     * Required for pure, view or static calls to contracts.
     *
     * @param {QuaiTransactionRequest} tx - The transaction object.
     * @returns {Promise<string>} A promise resolving to the result of the call.
     */
    call?: (tx: QuaiTransactionRequest) => Promise<string>;

    /**
     * Required for state mutating calls
     *
     * @param {TransactionRequest} tx - The transaction object.
     * @returns {Promise<TransactionResponse>} A promise resolving to the transaction response.
     */
    sendTransaction?: (tx: TransactionRequest) => Promise<TransactionResponse>;

    /**
     * Required for populating access lists for state mutating calls
     *
     * @param tx
     * @returns {Promise<AccessList>}
     */
    createAccessList?: (tx: QuaiTransactionRequest) => Promise<AccessList>;
}
