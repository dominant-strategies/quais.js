/**
 * One of the most common ways to interact with the blockchain is by a node running a JSON-RPC interface which can be
 * connected to, based on the transport, using:
 *
 * - HTTP or HTTPS - [JsonRpcProvider](../classes/JsonRpcProvider)
 * - WebSocket - [WebSocketProvider](../classes/WebSocketProvider)
 * - IPC - [IpcSocketProvider](../classes/IpcSocketProvider)
 *
 * @_section: api/providers/jsonrpc:JSON-RPC Provider  [about-jsonrpcProvider]
 */

// @TODO:
// - Add the batching API

// https://playground.open-rpc.org/?schemaUrl=https://raw.githubusercontent.com/ethereum/eth1.0-apis/assembled-spec/openrpc.json&uiSchema%5BappBar%5D%5Bui:splitView%5D=true&uiSchema%5BappBar%5D%5Bui:input%5D=false&uiSchema%5BappBar%5D%5Bui:examplesDropdown%5D=false

import { AbiCoder } from '../abi/index.js';
import { accessListify } from '../transaction/index.js';
import {
    getBigInt,
    hexlify,
    isHexString,
    toQuantity,
    makeError,
    assert,
    assertArgument,
    FetchRequest,
} from '../utils/index.js';

import { AbstractProvider, UnmanagedSubscriber } from './abstract-provider.js';
import { Network } from './network.js';
import { FilterIdEventSubscriber, FilterIdPendingSubscriber } from './subscriber-filterid.js';

import type { TransactionLike } from '../transaction/index.js';

import type { PerformActionRequest, Subscriber, Subscription } from './abstract-provider.js';
import type { Networkish } from './network.js';
import type { TransactionRequest } from './provider.js';
import { UTXOEntry, UTXOTransactionOutput } from '../transaction/utxo.js';
import { Shard, toShard } from '../constants/index.js';

type Timer = ReturnType<typeof setTimeout>;

function stall(duration: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, duration);
    });
}

/**
 * A JSON-RPC payload, which are sent to a JSON-RPC server.
 *
 * @category Providers
 */
export type JsonRpcPayload = {
    /**
     * The JSON-RPC request ID.
     */
    id: number;

    /**
     * The JSON-RPC request method.
     */
    method: string;

    /**
     * The JSON-RPC request parameters.
     */
    params: Array<any> | Record<string, any>;

    /**
     * A required constant in the JSON-RPC specification.
     */
    jsonrpc: '2.0';
};

/**
 * A JSON-RPC result, which are returned on success from a JSON-RPC server.
 *
 * @category Providers
 */
export type JsonRpcResult = {
    /**
     * The response ID to match it to the relevant request.
     */
    id: number;

    /**
     * The response result.
     */
    result: any;
};

/**
 * A JSON-RPC error, which are returned on failure from a JSON-RPC server.
 *
 * @category Providers
 */
export type JsonRpcError = {
    /**
     * The response ID to match it to the relevant request.
     */
    id: number;

    /**
     * The response error.
     */
    error: {
        code: number;
        message?: string;
        data?: any;
    };
};

/**
 * When subscribing to the `"debug"` event, the [[Listener]] will receive this object as the first parameter.
 *
 * @category Providers
 * @todo Listener is no longer exported, either remove the link or rework the comment
 */
export type DebugEventJsonRpcApiProvider =
    | {
          action: 'sendRpcPayload';
          payload: JsonRpcPayload | Array<JsonRpcPayload>;
      }
    | {
          action: 'receiveRpcResult';
          result: Array<JsonRpcResult | JsonRpcError>;
      }
    | {
          action: 'receiveRpcError';
          error: Error;
      };

/**
 * Options for configuring a {@link JsonRpcApiProvider | **JsonRpcApiProvider**}. Much of this is targetted towards
 * sub-classes, which often will not expose any of these options to their consumers.
 *
 * **`polling`** - use the polling strategy is used immediately for events; otherwise, attempt to use filters and fall
 * back onto polling (default: `false`)
 *
 * **`staticNetwork`** - do not request chain ID on requests to validate the underlying chain has not changed (default:
 * `null`)
 *
 * This should **ONLY** be used if it is **certain** that the network cannot change, such as when using INFURA (since
 * the URL dictates the network). If the network is assumed static and it does change, this can have tragic
 * consequences. For example, this **CANNOT** be used with MetaMask, since the used can select a new network from the
 * drop-down at any time.
 *
 * **`batchStallTime`** - how long (ms) to aggregate requests into a single batch. `0` indicates batching will only
 * encompass the current event loop. If `batchMaxCount = 1`, this is ignored. (default: `10`)
 *
 * **`batchMaxSize`** - target maximum size (bytes) to allow per batch request (default: 1Mb)
 *
 * **`batchMaxCount`** - maximum number of requests to allow in a batch. If `batchMaxCount = 1`, then batching is
 * disabled. (default: `100`)
 *
 * **`cacheTimeout`** - passed as [AbstractProviderOptions](../types-aliases/AbstractProviderOptions).
 *
 * @category Providers
 */
export type JsonRpcApiProviderOptions = {
    staticNetwork?: null | Network | boolean;
    batchStallTime?: number;
    batchMaxSize?: number;
    batchMaxCount?: number;

    cacheTimeout?: number;
};

const defaultOptions = {
    staticNetwork: null,

    batchStallTime: 10, // 10ms
    batchMaxSize: 1 << 20, // 1Mb
    batchMaxCount: 100, // 100 requests

    cacheTimeout: 250,
};

export interface AbstractJsonRpcTransactionRequest {
    /**
     * The chain ID the transaction is valid on.
     */
    chainId?: string;

    /**
     * The [EIP-2718](https://eips.ethereum.org/EIPS/eip-2718) transaction type.
     */
    type?: string;
}

export type JsonRpcTransactionRequest = QiJsonRpcTransactionRequest | QuaiJsonRpcTransactionRequest;

export interface QiJsonRpcTransactionRequest extends AbstractJsonRpcTransactionRequest {
    txInputs?: Array<UTXOEntry>;

    txOutputs?: Array<UTXOTransactionOutput>;
}

/**
 * A **JsonRpcTransactionRequest** is formatted as needed by the JSON-RPC Ethereum API specification.
 *
 * @category Providers
 */
export interface QuaiJsonRpcTransactionRequest extends AbstractJsonRpcTransactionRequest {
    /**
     * The sender address to use when signing.
     */
    from?: string;

    /**
     * The target address.
     */
    to?: string;

    /**
     * The transaction data.
     */
    data?: string;

    /**
     * The maximum amount of gas to allow a transaction to consume.
     *
     * In most other places in quais, this is called `gasLimit` which differs from the JSON-RPC Ethereum API
     * specification.
     */
    gas?: string;

    /**
     * The gas price per wei for transactions prior to [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559).
     */
    gasPrice?: string;

    /**
     * The maximum fee per gas for [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) transactions.
     */
    maxFeePerGas?: string;

    /**
     * The maximum priority fee per gas for [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) transactions.
     */
    maxPriorityFeePerGas?: string;

    /**
     * The nonce for the transaction.
     */
    nonce?: string;

    /**
     * The transaction value (in wei).
     */
    value?: string;

    /**
     * The transaction access list.
     */
    accessList?: Array<{ address: string; storageKeys: Array<string> }>;
}

type ResolveFunc = (result: JsonRpcResult) => void;
type RejectFunc = (error: Error) => void;

type Payload = { payload: JsonRpcPayload; resolve: ResolveFunc; reject: RejectFunc; shard?: Shard };

/**
 * The JsonRpcApiProvider is an abstract class and **MUST** be sub-classed.
 *
 * It provides the base for all JSON-RPC-based Provider interaction.
 *
 * Sub-classing Notes:
 *
 * - A sub-class MUST override _send
 * - A sub-class MUST call the `_start()` method once connected
 *
 * @category Providers
 */
export abstract class JsonRpcApiProvider<C = FetchRequest> extends AbstractProvider<C> {
    #options: Required<JsonRpcApiProviderOptions>;

    // The next ID to use for the JSON-RPC ID field
    #nextId: number;

    // Payloads are queued and triggered in batches using the drainTimer
    #payloads: Array<Payload>;
    #drainTimer: null | Timer;

    #notReady: null | {
        promise: Promise<void>;
        resolve: null | ((v: void) => void);
    };

    #network: null | Network;
    #pendingDetectNetwork: null | Promise<Network>;

    initPromise?: Promise<void>;

    #scheduleDrain(): void {
        if (this.#drainTimer) {
            return;
        }

        // If we aren't using batching, no harm in sending it immediately
        const stallTime = this._getOption('batchMaxCount') === 1 ? 0 : this._getOption('batchStallTime');

        this.#drainTimer = setTimeout(() => {
            this.#drainTimer = null;

            const payloads = this.#payloads;
            this.#payloads = [];

            while (payloads.length) {
                // Create payload batches that satisfy our batch constraints
                const batch = [<Payload>payloads.shift()];
                while (payloads.length) {
                    if (batch.length === this.#options.batchMaxCount) {
                        break;
                    }
                    batch.push(<Payload>payloads.shift());
                    const bytes = JSON.stringify(batch.map((p) => p.payload));
                    if (bytes.length > this.#options.batchMaxSize) {
                        payloads.unshift(<Payload>batch.pop());
                        break;
                    }
                }

                // Process the result to each payload
                (async () => {
                    const payloadMap: Map<string | undefined, Array<JsonRpcPayload>> = new Map();
                    for (let i = 0; i < batch.length; i++) {
                        if (!payloadMap.has(batch[i].shard)) {
                            if (batch[i].payload != null) {
                                payloadMap.set(batch[i].shard, [batch[i].payload]);
                            }
                        } else {
                            payloadMap.get(batch[i].shard)?.push(batch[i].payload);
                        }
                    }

                    const rawResult: Array<Array<JsonRpcResult | JsonRpcError>> = [];
                    await Promise.all(
                        Array.from(payloadMap).map(async ([key, value]) => {
                            const payload = value.length === 1 ? value[0] : value;
                            const shard = key ? toShard(key) : undefined;

                            this.emit('debug', { action: 'sendRpcPayload', payload });

                            rawResult.push(await this._send(payload, shard));

                            this.emit('debug', { action: 'receiveRpcResult', payload });
                        }),
                    );

                    const result: Array<JsonRpcResult | JsonRpcError> = rawResult.flat();

                    try {
                        // Process results in batch order
                        for (const { resolve, reject, payload } of batch) {
                            if (this.destroyed) {
                                reject(
                                    makeError('provider destroyed; cancelled request', 'UNSUPPORTED_OPERATION', {
                                        operation: payload.method,
                                    }),
                                );
                                continue;
                            }

                            // Find the matching result
                            const resp = result.filter((r) => r.id === payload.id)[0];
                            // No result; the node failed us in unexpected ways
                            if (resp == null) {
                                const error = makeError('missing response for request', 'BAD_DATA', {
                                    value: result,
                                    info: { payload },
                                });
                                this.emit('error', error);
                                reject(error);
                                continue;
                            }

                            // The response is an error
                            if ('error' in resp) {
                                reject(this.getRpcError(payload, resp));
                                continue;
                            }

                            // All good; send the result
                            resolve(resp.result);
                        }
                    } catch (error: any) {
                        this.emit('debug', { action: 'receiveRpcError', error });

                        for (const { reject } of batch) {
                            // @TODO: augment the error with the payload
                            reject(error);
                        }
                    }
                })();
            }
        }, stallTime);
    }

    constructor(network?: Networkish, options?: JsonRpcApiProviderOptions) {
        super(network, options);

        this.#nextId = 1;
        this.#options = Object.assign({}, defaultOptions, options || {});

        this.#payloads = [];
        this.#drainTimer = null;

        this.#network = null;
        this.#pendingDetectNetwork = null;

        {
            let resolve: null | ((value: void) => void) = null;
            const promise = new Promise((_resolve: (value: void) => void) => {
                resolve = _resolve;
            });
            this.#notReady = { promise, resolve };
        }

        const staticNetwork = this._getOption('staticNetwork');
        if (typeof staticNetwork === 'boolean') {
            assertArgument(
                !staticNetwork || network !== 'any',
                "staticNetwork cannot be used on special network 'any'",
                'options',
                options,
            );
            if (staticNetwork && network != null) {
                this.#network = Network.from(network);
            }
        } else if (staticNetwork) {
            // Make sure any static network is compatbile with the provided netwrok
            assertArgument(
                network == null || staticNetwork.matches(network),
                'staticNetwork MUST match network object',
                'options',
                options,
            );
            this.#network = staticNetwork;
        }
    }

    /**
     * Returns the value associated with the option `key`.
     *
     * Sub-classes can use this to inquire about configuration options.
     */
    _getOption<K extends keyof JsonRpcApiProviderOptions>(key: K): JsonRpcApiProviderOptions[K] {
        return this.#options[key];
    }

    /**
     * Gets the {@link Network | **Network**} this provider has committed to. On each call, the network is detected, and
     * if it has changed, the call will reject.
     */
    get _network(): Network {
        assert(this.#network, 'network is not available yet', 'NETWORK_ERROR');
        return this.#network;
    }

    /**
     * Sends a JSON-RPC `payload` (or a batch) to the underlying channel.
     *
     * Sub-classes **MUST** override this.
     */
    abstract _send(
        payload: JsonRpcPayload | Array<JsonRpcPayload>,
        shard?: Shard,
    ): Promise<Array<JsonRpcResult | JsonRpcError>>;

    /**
     * Resolves to the non-normalized value by performing `req`.
     *
     * Sub-classes may override this to modify behavior of actions, and should generally call `super._perform` as a
     * fallback.
     */
    async _perform(req: PerformActionRequest): Promise<any> {
        // Legacy networks do not like the type field being passed along (which
        // is fair), so we delete type if it is 0 and a non-EIP-1559 network
        if (req.method !== 'getRunningLocations') {
            await this.initPromise;
        }
        if (req.method === 'call' || req.method === 'estimateGas') {
            const tx = req.transaction;
            if (tx && tx.type != null && getBigInt(tx.type)) {
                // If there are no EIP-1559 properties, it might be non-EIP-a559
                if (tx.maxFeePerGas == null && tx.maxPriorityFeePerGas == null) {
                    const feeData = await this.getFeeData(req.zone);
                    if (feeData.maxFeePerGas == null && feeData.maxPriorityFeePerGas == null) {
                        // Network doesn't know about EIP-1559 (and hence type)
                        req = Object.assign({}, req, {
                            transaction: Object.assign({}, tx, { type: undefined }),
                        });
                    }
                }
            }
        }

        const request = this.getRpcRequest(req);

        if (request != null) {
            const shard = 'shard' in req ? req.shard : 'zone' in req ? toShard(req.zone!) : undefined;
            return await this.send(request.method, request.args, shard);
        }

        return super._perform(req);
    }

    /**
     * Sub-classes may override this; it detects the _actual_ network that we are **currently** connected to.
     *
     * Keep in mind that {@link JsonRpcApiProvider.send | **send**} may only be used once
     * {@link JsonRpcApiProvider.ready | **ready**}, otherwise the _send primitive must be used instead.
     */
    async _detectNetwork(): Promise<Network> {
        const network = this._getOption('staticNetwork');
        if (network) {
            if (network === true) {
                if (this.#network) {
                    return this.#network;
                }
            } else {
                return network;
            }
        }

        if (this.#pendingDetectNetwork) {
            return await this.#pendingDetectNetwork;
        }

        // If we are ready, use `send`, which enabled requests to be batched
        if (this.ready) {
            this.#pendingDetectNetwork = (async () => {
                try {
                    const result = Network.from(getBigInt(await this.send('quai_chainId', [])));
                    this.#pendingDetectNetwork = null;
                    return result;
                } catch (error) {
                    this.#pendingDetectNetwork = null;
                    throw error;
                }
            })();
            return await this.#pendingDetectNetwork;
        }

        // We are not ready yet; use the primitive _send
        this.#pendingDetectNetwork = (async () => {
            const payload: JsonRpcPayload = {
                id: this.#nextId++,
                method: 'quai_chainId',
                params: [],
                jsonrpc: '2.0',
            };

            this.emit('debug', { action: 'sendRpcPayload', payload });

            let result: JsonRpcResult | JsonRpcError;
            try {
                result = (await this._send(payload))[0];
                this.#pendingDetectNetwork = null;
            } catch (error) {
                this.#pendingDetectNetwork = null;
                this.emit('debug', { action: 'receiveRpcError', error });
                throw error;
            }

            this.emit('debug', { action: 'receiveRpcResult', result });

            if ('result' in result) {
                return Network.from(getBigInt(result.result));
            }

            throw this.getRpcError(payload, result);
        })();

        return await this.#pendingDetectNetwork;
    }

    /**
     * Sub-classes **MUST** call this. Until {@link JsonRpcApiProvider._start | **_start**} has been called, no calls
     * will be passed to {@link JsonRpcApiProvider._send | **_send**} from {@link JsonRpcApiProvider.send | **send**} . If
     * it is overridden, then `super._start()` **MUST** be called.
     *
     * Calling it multiple times is safe and has no effect.
     */
    _start(): void {
        if (this.#notReady == null || this.#notReady.resolve == null) {
            return;
        }

        this.#notReady.resolve();
        this.#notReady = null;

        (async () => {
            // Bootstrap the network
            while (this.#network == null && !this.destroyed) {
                try {
                    this.#network = await this._detectNetwork();
                } catch (error) {
                    if (this.destroyed) {
                        break;
                    }
                    console.log(
                        'JsonRpcProvider failed to detect network and cannot start up; retry in 1s (perhaps the URL is wrong or the node is not started)',
                    );
                    this.emit(
                        'error',
                        makeError('failed to bootstrap network detection', 'NETWORK_ERROR', {
                            event: 'initial-network-discovery',
                            info: { error },
                        }),
                    );
                    await stall(1000);
                }
            }

            // Start dispatching requests
            this.#scheduleDrain();
        })();
    }

    /**
     * Resolves once the {@link JsonRpcApiProvider._start | **_start**} has been called. This can be used in sub-classes
     * to defer sending data until the connection has been established.
     */
    async _waitUntilReady(): Promise<void> {
        if (this.#notReady == null) {
            return;
        }
        return await this.#notReady.promise;
    }

    /**
     * Return a Subscriber that will manage the `sub`.
     *
     * Sub-classes may override this to modify the behavior of subscription management.
     *
     * @param {Subscription} sub - The subscription to manage.
     *
     * @returns {Subscriber} The subscriber that will manage the subscription.
     */
    _getSubscriber(sub: Subscription): Subscriber {
        // Pending Filters aren't availble via polling
        if (sub.type === 'pending') {
            return new FilterIdPendingSubscriber(this);
        }

        if (sub.type === 'event') {
            return new FilterIdEventSubscriber(this, sub.filter);
        }

        // Orphaned Logs are handled automatically, by the filter, since
        // logs with removed are emitted by it
        if (sub.type === 'orphan' && sub.filter.orphan === 'drop-log') {
            return new UnmanagedSubscriber('orphan');
        }

        return super._getSubscriber(sub);
    }

    /**
     * Returns true only if the {@link JsonRpcApiProvider._start | **_start**} has been called.
     */
    get ready(): boolean {
        return this.#notReady == null;
    }

    /**
     * Returns `tx` as a normalized JSON-RPC transaction request, which has all values hexlified and any numeric values
     * converted to Quantity values.
     *
     * @param {TransactionRequest} tx - The transaction to normalize.
     *
     * @returns {JsonRpcTransactionRequest} The normalized transaction.
     */
    getRpcTransaction(tx: TransactionRequest): JsonRpcTransactionRequest {
        const result: JsonRpcTransactionRequest = {};

        if ('from' in tx) {
            // JSON-RPC now requires numeric values to be "quantity" values
            [
                'chainId',
                'gasLimit',
                'gasPrice',
                'type',
                'maxFeePerGas',
                'maxPriorityFeePerGas',
                'nonce',
                'value',
            ].forEach((key) => {
                if ((<any>tx)[key] == null) {
                    return;
                }
                let dstKey = key;
                if (key === 'gasLimit') {
                    dstKey = 'gas';
                }
                (<any>result)[dstKey] = toQuantity(getBigInt((<any>tx)[key], `tx.${key}`));
            });

            // Make sure addresses and data are lowercase
            ['from', 'to', 'data'].forEach((key) => {
                if ((<any>tx)[key] == null) {
                    return;
                }
                (<any>result)[key] = hexlify((<any>tx)[key]);
            });

            // Normalize the access list object
            if ('accessList' in tx && tx.accessList) {
                (result as QuaiJsonRpcTransactionRequest)['accessList'] = accessListify(tx.accessList);
            }
        } else {
            throw new Error('No Qi getRPCTransaction implementation yet');
        }
        return result;
    }

    /**
     * Returns the request method and arguments required to perform `req`.
     *
     * @param {PerformActionRequest} req - The request to perform.
     *
     * @returns {null | { method: string; args: any[] }} The method and arguments to use.
     * @throws {Error} If the request is not supported.
     * @throws {Error} If the request is invalid.
     */
    getRpcRequest(req: PerformActionRequest): null | { method: string; args: Array<any> } {
        switch (req.method) {
            case 'chainId':
                return { method: 'quai_chainId', args: [] };

            case 'getBlockNumber':
                return { method: 'quai_blockNumber', args: [] };

            case 'getGasPrice':
                return {
                    method: 'quai_baseFee',
                    args: [req.txType],
                };

            case 'getMaxPriorityFeePerGas':
                return { method: 'quai_maxPriorityFeePerGas', args: [] };

            case 'getPendingHeader':
                return { method: 'quai_getPendingHeader', args: [] };

            case 'getBalance':
                return {
                    method: 'quai_getBalance',
                    args: [req.address, req.blockTag],
                };

            case 'getOutpointsByAddress':
                return {
                    method: 'quai_getOutpointsByAddress',
                    args: [req.address],
                };
            case 'getTransactionCount':
                return {
                    method: 'quai_getTransactionCount',
                    args: [req.address, req.blockTag],
                };

            case 'getCode':
                return {
                    method: 'quai_getCode',
                    args: [req.address, req.blockTag],
                };

            case 'getStorage':
                return {
                    method: 'quai_getStorageAt',
                    args: [req.address, '0x' + req.position.toString(16), req.blockTag],
                };

            case 'broadcastTransaction':
                return {
                    method: 'quai_sendRawTransaction',
                    args: [req.signedTransaction],
                };

            case 'getBlock':
                if ('blockTag' in req) {
                    return {
                        method: 'quai_getBlockByNumber',
                        args: [req.blockTag, !!req.includeTransactions],
                    };
                } else if ('blockHash' in req) {
                    return {
                        method: 'quai_getBlockByHash',
                        args: [req.blockHash, !!req.includeTransactions],
                    };
                }
                break;

            case 'getTransaction':
                return {
                    method: 'quai_getTransactionByHash',
                    args: [req.hash],
                };

            case 'getTransactionReceipt':
                return {
                    method: 'quai_getTransactionReceipt',
                    args: [req.hash],
                };

            case 'call':
                return {
                    method: 'quai_call',
                    args: [this.getRpcTransaction(req.transaction), req.blockTag],
                };

            case 'estimateGas': {
                return {
                    method: 'quai_estimateGas',
                    args: [this.getRpcTransaction(req.transaction)],
                };
            }

            case 'getRunningLocations': {
                return {
                    method: 'quai_listRunningChains',
                    args: [],
                };
            }

            case 'getProtocolTrieExpansionCount': {
                return {
                    method: 'quai_getProtocolExpansionNumber',
                    args: [],
                };
            }

            case 'getProtocolExpansionNumber': {
                return {
                    method: 'quai_getProtocolExpansionNumber',
                    args: [],
                };
            }

            case 'getQiRateAtBlock': {
                return {
                    method: 'quai_qiRateAtBlock',
                    args: [req.blockTag, req.amt],
                };
            }

            case 'getQuaiRateAtBlock': {
                return {
                    method: 'quai_quaiRateAtBlock',
                    args: [req.blockTag, req.amt],
                };
            }

            case 'getLogs':
                return { method: 'quai_getLogs', args: [req.filter] };
        }

        return null;
    }

    /**
     * Returns an quais-style Error for the given JSON-RPC error `payload`, coalescing the various strings and error
     * shapes that different nodes return, coercing them into a machine-readable standardized error.
     *
     * @param {JsonRpcPayload} payload - The payload that was sent.
     * @param {JsonRpcError} _error - The error that was received.
     *
     * @returns {Error} The coalesced error.
     */
    getRpcError(payload: JsonRpcPayload, _error: JsonRpcError): Error {
        const { method } = payload;
        const { error } = _error;

        if (method === 'quai_estimateGas' && error.message) {
            const msg = error.message;
            if (!msg.match(/revert/i) && msg.match(/insufficient funds/i)) {
                return makeError('insufficient funds', 'INSUFFICIENT_FUNDS', {
                    transaction: (<any>payload).params[0],
                    info: { payload, error },
                });
            }
        }

        if (method === 'quai_call' || method === 'quai_estimateGas') {
            const result = spelunkData(error);

            const e = AbiCoder.getBuiltinCallException(
                method === 'quai_call' ? 'call' : 'estimateGas',
                (<any>payload).params[0],
                result ? result.data : null,
            );
            e.info = { error, payload };
            return e;
        }

        // Only estimateGas and call can return arbitrary contract-defined text, so now we
        // we can process text safely.

        const message = JSON.stringify(spelunkMessage(error));

        if (typeof error.message === 'string' && error.message.match(/user denied|quais-user-denied/i)) {
            const actionMap: Record<
                string,
                'requestAccess' | 'sendTransaction' | 'signMessage' | 'signTransaction' | 'signTypedData'
            > = {
                quai_sign: 'signMessage',
                personal_sign: 'signMessage',
                quai_signTypedData_v4: 'signTypedData',
                quai_signTransaction: 'signTransaction',
                quai_sendTransaction: 'sendTransaction',
                quai_requestAccounts: 'requestAccess',
                wallet_requestAccounts: 'requestAccess',
            };

            return makeError(`user rejected action`, 'ACTION_REJECTED', {
                action: actionMap[method] || 'unknown',
                reason: 'rejected',
                info: { payload, error },
            });
        }

        if (method === 'quai_sendRawTransaction' || method === 'quai_sendTransaction') {
            const transaction = <TransactionLike>(<any>payload).params[0];

            if (message.match(/insufficient funds|base fee exceeds gas limit/i)) {
                return makeError('insufficient funds for intrinsic transaction cost', 'INSUFFICIENT_FUNDS', {
                    transaction,
                    info: { error },
                });
            }

            if (message.match(/nonce/i) && message.match(/too low/i)) {
                return makeError('nonce has already been used', 'NONCE_EXPIRED', { transaction, info: { error } });
            }

            // "replacement transaction underpriced"
            if (message.match(/replacement transaction/i) && message.match(/underpriced/i)) {
                return makeError('replacement fee too low', 'REPLACEMENT_UNDERPRICED', {
                    transaction,
                    info: { error },
                });
            }

            if (message.match(/only replay-protected/i)) {
                return makeError('legacy pre-eip-155 transactions not supported', 'UNSUPPORTED_OPERATION', {
                    operation: method,
                    info: { transaction, info: { error } },
                });
            }
        }

        let unsupported = !!message.match(/the method .* does not exist/i);
        if (!unsupported) {
            if (error && (<any>error).details && (<any>error).details.startsWith('Unauthorized method:')) {
                unsupported = true;
            }
        }

        if (unsupported) {
            return makeError('unsupported operation', 'UNSUPPORTED_OPERATION', {
                operation: payload.method,
                info: { error, payload },
            });
        }

        return makeError('could not coalesce error', 'UNKNOWN_ERROR', { error, payload });
    }

    /**
     * Requests the `method` with `params` via the JSON-RPC protocol over the underlying channel. This can be used to
     * call methods on the backend that do not have a high-level API within the Provider API.
     *
     * This method queues requests according to the batch constraints in the options, assigns the request a unique ID.
     *
     * **Do NOT override** this method in sub-classes; instead override {@link JsonRpcApiProvider._send | **_send**} or
     * force the options values in the call to the constructor to modify this method's behavior.
     *
     * @param {string} method - The method to call.
     * @param {any[] | Record<string, any>} params - The parameters to pass to the method.
     * @param {Shard} shard - The shard to send the request to.
     *
     * @returns {Promise<any>} A promise that resolves to the result of the method call.
     */
    send(method: string, params: Array<any> | Record<string, any>, shard?: Shard): Promise<any> {
        // @TODO: cache chainId?? purge on switch_networks

        // We have been destroyed; no operations are supported anymore
        if (this.destroyed) {
            return Promise.reject(
                makeError('provider destroyed; cancelled request', 'UNSUPPORTED_OPERATION', { operation: method }),
            );
        }
        const id = this.#nextId++;
        const promise = new Promise((resolve, reject) => {
            this.#payloads.push({
                resolve,
                reject,
                payload: { method, params, id, jsonrpc: '2.0' },
                shard: shard,
            });
        });

        // If there is not a pending drainTimer, set one
        this.#scheduleDrain();

        return <Promise<JsonRpcResult>>promise;
    }

    /**
     * Resolves to the {@link Signer | **Signer**} account for\
     * `address` managed by the client.
     *
     * If the `address` is a number, it is used as an index in the the accounts from
     * {@link JsonRpcApiProvider.listAccounts | **listAccount**}.
     *
     * This can only be used on clients which manage accounts (such as Geth with imported account or MetaMask). go-quai
     * clients do not support internal key management, so this method will always throw.
     *
     * @param {number | string} address - The address or index of the account to get.
     *
     * @returns {Promise<JsonRpcSigner>} The signer for the account.
     * @throws {Error} If the account doesn't exist.
     */

    destroy(): void {
        // Stop processing requests
        if (this.#drainTimer) {
            clearTimeout(this.#drainTimer);
            this.#drainTimer = null;
        }

        // Cancel all pending requests
        for (const { payload, reject } of this.#payloads) {
            reject(
                makeError('provider destroyed; cancelled request', 'UNSUPPORTED_OPERATION', {
                    operation: payload.method,
                }),
            );
        }

        this.#payloads = [];

        // Parent clean-up
        super.destroy();
    }
}

/**
 * The JsonRpcProvider is one of the most common Providers, which performs all operations over HTTP (or HTTPS) requests.
 *
 * Events are processed by polling the backend for the current block number; when it advances, all block-base events are
 * then checked for updates.
 *
 * @category Providers
 */
export class JsonRpcProvider extends JsonRpcApiProvider {
    constructor(urls?: string | string[] | FetchRequest, network?: Networkish, options?: JsonRpcApiProviderOptions) {
        if (urls == null) {
            urls = ['http://localhost:8545'];
        }
        super(network, options);

        if (Array.isArray(urls)) {
            this.initPromise = this.initUrlMap(urls);
        } else if (typeof urls === 'string') {
            this.initPromise = this.initUrlMap([urls]);
        } else {
            this.initPromise = this.initUrlMap(urls.clone());
        }
    }

    _getSubscriber(sub: Subscription): Subscriber {
        const subscriber = super._getSubscriber(sub);
        return subscriber;
    }

    _getConnection(shard?: Shard): FetchRequest {
        let connection;
        if (shard !== undefined) {
            connection = this._urlMap.get(shard) ?? this.connect[this.connect.length - 1]!.clone();
        } else {
            connection = this.connect[this.connect.length - 1]!.clone();
        }
        return new FetchRequest(connection.url);
    }

    async send(method: string, params: Array<any> | Record<string, any>, shard?: Shard): Promise<any> {
        // All requests are over HTTP, so we can just start handling requests
        // We do this here rather than the constructor so that we don't send any
        // requests to the network (i.e. quai_chainId) until we absolutely have to.
        await this._start();

        return await super.send(method, params, shard);
    }

    async _send(payload: JsonRpcPayload | Array<JsonRpcPayload>, shard?: Shard): Promise<Array<JsonRpcResult>> {
        // Configure a POST connection for the requested method
        const request = this._getConnection(shard);
        request.body = JSON.stringify(payload);
        request.setHeader('content-type', 'application/json');
        const response = await request.send();
        response.assertOk();

        let resp = response.bodyJson;
        if (!Array.isArray(resp)) {
            resp = [resp];
        }

        return resp;
    }
}

function spelunkData(value: any): null | { message: string; data: string } {
    if (value == null) {
        return null;
    }

    // These *are* the droids we're looking for.
    if (typeof value.message === 'string' && value.message.match(/revert/i) && isHexString(value.data)) {
        return { message: value.message, data: value.data };
    }

    // Spelunk further...
    if (typeof value === 'object') {
        for (const key in value) {
            const result = spelunkData(value[key]);
            if (result) {
                return result;
            }
        }
        return null;
    }

    // Might be a JSON string we can further descend...
    if (typeof value === 'string') {
        try {
            return spelunkData(JSON.parse(value));
            // eslint-disable-next-line no-empty
        } catch (error) {}
    }

    return null;
}

function _spelunkMessage(value: any, result: Array<string>): void {
    if (value == null) {
        return;
    }

    // These *are* the droids we're looking for.
    if (typeof value.message === 'string') {
        result.push(value.message);
    }

    // Spelunk further...
    if (typeof value === 'object') {
        for (const key in value) {
            _spelunkMessage(value[key], result);
        }
    }

    // Might be a JSON string we can further descend...
    if (typeof value === 'string') {
        try {
            return _spelunkMessage(JSON.parse(value), result);
            // eslint-disable-next-line no-empty
        } catch (error) {}
    }
}

function spelunkMessage(value: any): Array<string> {
    const result: Array<string> = [];
    _spelunkMessage(value, result);
    return result;
}
