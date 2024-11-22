/**
 * One of the most common ways to interact with the blockchain is by a node running a JSON-RPC interface which can be
 * connected to, based on the transport, using:
 *
 * - HTTP or HTTPS - {@link JsonRpcProvider | **JsonRpcProvider**}
 * - WebSocket - {@link WebSocketProvider | **WebSocketProvider**}
 * - IPC - {@link IpcSocketProvider | **IpcSocketProvider**}
 */

// @TODO:
// - Add the batching API

// https://playground.open-rpc.org/?schemaUrl=https://raw.githubusercontent.com/ethereum/eth1.0-apis/assembled-spec/openrpc.json&uiSchema%5BappBar%5D%5Bui:splitView%5D=true&uiSchema%5BappBar%5D%5Bui:input%5D=false&uiSchema%5BappBar%5D%5Bui:examplesDropdown%5D=false

import { AbiCoder } from '../abi/index.js';
import { getAddress, resolveAddress } from '../address/index.js';
import { accessListify, QuaiTransactionLike } from '../transaction/index.js';
import {
    getBigInt,
    hexlify,
    isHexString,
    toQuantity,
    makeError,
    assert,
    assertArgument,
    isError,
    FetchRequest,
    defineProperties,
    resolveProperties,
} from '../utils/index.js';

import { AbstractProvider, UnmanagedSubscriber } from './abstract-provider.js';
import { Network } from './network.js';
import { FilterIdEventSubscriber, FilterIdPendingSubscriber } from './subscriber-filterid.js';

import type { TransactionLike, TxInput, TxOutput } from '../transaction/index.js';

import type { PerformActionRequest, Subscriber, Subscription } from './abstract-provider.js';
import type { Networkish } from './network.js';
import type { Provider, QuaiTransactionRequest, TransactionRequest, TransactionResponse } from './provider.js';
import { Shard, toShard, toZone, Zone } from '../constants/index.js';
import { TypedDataDomain, TypedDataEncoder, TypedDataField } from '../hash/index.js';
import { AbstractSigner, Signer } from '../signers/index.js';
import { toUtf8Bytes } from '../encoding/index.js';
import { addressFromTransactionRequest, zoneFromHash } from './provider.js';

type Timer = ReturnType<typeof setTimeout>;

const Primitive = 'bigint,boolean,function,number,string,symbol'.split(/,/g);

/**
 * Deeply copies a value.
 *
 * @ignore
 * @param {T} value - The value to copy.
 * @returns {T} The copied value.
 */
function deepCopy<T = any>(value: T): T {
    if (value == null || Primitive.indexOf(typeof value) >= 0) {
        return value;
    }

    // Keep any Addressable
    if (typeof (<any>value).getAddress === 'function') {
        return value;
    }

    if (Array.isArray(value)) {
        return <any>value.map(deepCopy);
    }

    if (typeof value === 'object') {
        return Object.keys(value).reduce(
            (accum, key) => {
                accum[key] = (<any>value)[key];
                return accum;
            },
            <any>{},
        );
    }

    throw new Error(`should not happen: ${value} (${typeof value})`);
}

/**
 * Stalls execution for a specified duration.
 *
 * @ignore
 * @param {number} duration - The duration to stall in milliseconds.
 * @returns {Promise<void>} A promise that resolves after the duration.
 */
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
        shard?: Shard;
    };
};

/**
 * When subscribing to the `"debug"` event, the Listener will receive this object as the first parameter.
 *
 * @category Providers
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
 * Options for configuring a {@link JsonRpcApiProvider | **JsonRpcApiProvider**}. Much of this is targeted towards
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
 * **`cacheTimeout`** - passed as {@link AbstractProviderOptions | **AbstractProviderOptions**}.
 *
 * @category Providers
 */
export type JsonRpcApiProviderOptions = {
    staticNetwork?: null | Network | boolean;
    batchStallTime?: number;
    batchMaxSize?: number;
    batchMaxCount?: number;

    cacheTimeout?: number;
    usePathing?: boolean;
};

const defaultOptions = {
    staticNetwork: null,

    batchStallTime: 10, // 10ms
    batchMaxSize: 1 << 20, // 1Mb
    batchMaxCount: 100, // 100 requests

    cacheTimeout: 250,
    usePathing: true,
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
    txInputs?: Array<TxInput>;

    txOutputs?: Array<TxOutput>;
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
     * The maximum fee per gas for [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) transactions.
     */
    gasPrice?: string;

    /**
     * The maximum priority fee per gas for [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) transactions.
     */
    minerTip?: string;

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

// @TODO: Unchecked Signers

/**
 * A signer that uses JSON-RPC to sign transactions and messages.
 *
 * @category Providers
 */
export class JsonRpcSigner extends AbstractSigner<JsonRpcApiProvider> {
    address!: string;

    /**
     * Creates a new JsonRpcSigner instance.
     *
     * @param {JsonRpcApiProvider<any>} provider - The JSON-RPC provider.
     * @param {string} address - The address of the signer.
     */
    constructor(provider: JsonRpcApiProvider<any>, address: string) {
        super(provider);
        address = getAddress(address);
        defineProperties<JsonRpcSigner>(this, { address });
    }

    /**
     * Connects the signer to a provider.
     *
     * @param {null | Provider} provider - The provider to connect to.
     * @returns {Signer} The connected signer.
     * @throws {Error} If the signer cannot be reconnected.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    connect(provider: null | Provider): Signer {
        assert(false, 'cannot reconnect JsonRpcSigner', 'UNSUPPORTED_OPERATION', {
            operation: 'signer.connect',
        });
    }

    /**
     * Gets the address of the signer.
     *
     * @returns {Promise<string>} The address of the signer.
     */
    async getAddress(): Promise<string> {
        return this.address;
    }

    /**
     * Populates a Quai transaction.
     *
     * @ignore
     * @param {QuaiTransactionRequest} tx - The transaction request.
     * @returns {Promise<QuaiTransactionLike>} The populated transaction.
     */
    async populateQuaiTransaction(tx: QuaiTransactionRequest): Promise<QuaiTransactionLike> {
        return (await this.populateCall(tx)) as QuaiTransactionLike;
    }

    /**
     * Sends an unchecked transaction.
     *
     * @ignore
     * @param {TransactionRequest} _tx - The transaction request.
     * @returns {Promise<string>} The transaction hash.
     */
    async sendUncheckedTransaction(_tx: TransactionRequest): Promise<string> {
        const tx = deepCopy(_tx);

        const promises: Array<Promise<void>> = [];

        if ('from' in tx) {
            // Make sure the from matches the sender
            if (tx.from) {
                const _from = tx.from;
                promises.push(
                    (async () => {
                        const from = await resolveAddress(_from);
                        assertArgument(
                            from != null && from.toLowerCase() === this.address.toLowerCase(),
                            'from address mismatch',
                            'transaction',
                            _tx,
                        );
                        tx.from = from;
                    })(),
                );
            } else {
                tx.from = this.address;
            }

            // The JSON-RPC for quai_sendTransaction uses 90000 gas; if the user
            // wishes to use this, it is easy to specify explicitly, otherwise
            // we look it up for them.
            if (tx.gasLimit == null) {
                promises.push(
                    (async () => {
                        tx.gasLimit = await this.provider.estimateGas({ ...tx, from: this.address });
                    })(),
                );
            }

            // The address may be an ENS name or Addressable
            if (tx.to != null) {
                const _to = tx.to;
                promises.push(
                    (async () => {
                        tx.to = await resolveAddress(_to);
                    })(),
                );
            }
        }

        // Wait until all of our properties are filled in
        if (promises.length) {
            await Promise.all(promises);
        }
        const hexTx = this.provider.getRpcTransaction(tx);

        return this.provider.send('quai_sendTransaction', [hexTx]);
    }

    /**
     * Sends a transaction.
     *
     * @param {TransactionRequest} tx - The transaction request.
     * @returns {Promise<TransactionResponse>} The transaction response.
     * @throws {Error} If the transaction cannot be sent.
     */
    async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
        const zone = await this.zoneFromAddress(addressFromTransactionRequest(tx));
        // This cannot be mined any earlier than any recent block
        const blockNumber = await this.provider.getBlockNumber(toShard(zone));
        // Send the transaction
        const hash = await this.sendUncheckedTransaction(tx);

        // Unfortunately, JSON-RPC only provides and opaque transaction hash
        // for a response, and we need the actual transaction, so we poll
        // for it; it should show up very quickly
        return await new Promise((resolve, reject) => {
            const timeouts = [1000, 100];
            let invalids = 0;

            const checkTx = async () => {
                try {
                    // Try getting the transaction
                    const tx = await this.provider.getTransaction(hash);

                    if (tx != null) {
                        resolve(tx.replaceableTransaction(blockNumber) as TransactionResponse);
                        return;
                    }
                } catch (error) {
                    // If we were cancelled: stop polling.
                    // If the data is bad: the node returns bad transactions
                    // If the network changed: calling again will also fail
                    // If unsupported: likely destroyed
                    if (
                        isError(error, 'CANCELLED') ||
                        isError(error, 'BAD_DATA') ||
                        isError(error, 'NETWORK_ERROR') ||
                        isError(error, 'UNSUPPORTED_OPERATION')
                    ) {
                        if (error.info == null) {
                            error.info = {};
                        }
                        error.info.sendTransactionHash = hash;

                        reject(error);
                        return;
                    }

                    // Stop-gap for misbehaving backends; see #4513
                    if (isError(error, 'INVALID_ARGUMENT')) {
                        invalids++;
                        if (error.info == null) {
                            error.info = {};
                        }
                        error.info.sendTransactionHash = hash;
                        if (invalids > 10) {
                            reject(error);
                            return;
                        }
                    }

                    // Notify anyone that cares; but we will try again, since
                    // it is likely an intermittent service error
                    this.provider.emit(
                        'error',
                        zoneFromHash(hash),
                        makeError('failed to fetch transation after sending (will try again)', 'UNKNOWN_ERROR', {
                            error,
                        }),
                    );
                }

                // Wait another 4 seconds
                this.provider._setTimeout(() => {
                    checkTx();
                }, timeouts.pop() || 4000);
            };
            checkTx();
        });
    }

    /**
     * Signs a transaction.
     *
     * @param {TransactionRequest} _tx - The transaction request.
     * @returns {Promise<string>} The signed transaction.
     * @throws {Error} If the transaction cannot be signed.
     */
    async signTransaction(_tx: TransactionRequest): Promise<string> {
        const tx = deepCopy(_tx);

        // QuaiTransactionRequest
        if ('from' in tx) {
            if (tx.from) {
                const from = await resolveAddress(tx.from);
                assertArgument(
                    from != null && from.toLowerCase() === this.address.toLowerCase(),
                    'from address mismatch',
                    'transaction',
                    _tx,
                );
                tx.from = from;
            } else {
                tx.from = this.address;
            }
        } else {
            throw new Error('No QI signing implementation in provider-jsonrpc');
        }
        const hexTx = this.provider.getRpcTransaction(tx);
        return await this.provider.send('quai_signTransaction', [hexTx]);
    }

    /**
     * Signs a message.
     *
     * @param {string | Uint8Array} _message - The message to sign.
     * @returns {Promise<string>} The signed message.
     */
    async signMessage(_message: string | Uint8Array): Promise<string> {
        const message = typeof _message === 'string' ? toUtf8Bytes(_message) : _message;
        return await this.provider.send('personal_sign', [hexlify(message), this.address.toLowerCase()]);
    }

    /**
     * Signs typed data.
     *
     * @param {TypedDataDomain} domain - The domain of the typed data.
     * @param {Record<string, TypedDataField[]>} types - The types of the typed data.
     * @param {Record<string, any>} _value - The value of the typed data.
     * @returns {Promise<string>} The signed typed data.
     */
    async signTypedData(
        domain: TypedDataDomain,
        types: Record<string, Array<TypedDataField>>,
        _value: Record<string, any>,
    ): Promise<string> {
        const value = deepCopy(_value);

        return await this.provider.send('quai_signTypedData_v4', [
            this.address.toLowerCase(),
            JSON.stringify(TypedDataEncoder.getPayload(domain, types, value)),
        ]);
    }

    /**
     * Unlocks the account.
     *
     * @param {string} password - The password to unlock the account.
     * @returns {Promise<boolean>} True if the account is unlocked, false otherwise.
     */
    async unlock(password: string): Promise<boolean> {
        return this.provider.send('personal_unlockAccount', [this.address.toLowerCase(), password, null]);
    }

    /**
     * Signs a message using the legacy method.
     *
     * @ignore
     * @param {string | Uint8Array} _message - The message to sign.
     * @returns {Promise<string>} The signed message.
     */
    async _legacySignMessage(_message: string | Uint8Array): Promise<string> {
        const message = typeof _message === 'string' ? toUtf8Bytes(_message) : _message;
        return await this.provider.send('quai_sign', [this.address.toLowerCase(), hexlify(message)]);
    }
}

type ResolveFunc = (result: JsonRpcResult) => void;
type RejectFunc = (error: Error) => void;

type Payload = { payload: JsonRpcPayload; resolve: ResolveFunc; reject: RejectFunc; shard?: Shard; now?: boolean };

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

    /**
     * Schedules the draining of the payload queue.
     *
     * @ignore
     */
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
                    const nowPayloadMap: Map<string | undefined, Array<JsonRpcPayload>> = new Map();
                    for (let i = 0; i < batch.length; i++) {
                        if (batch[i].now) {
                            if (!nowPayloadMap.has(batch[i].shard)) {
                                if (batch[i].payload != null) {
                                    nowPayloadMap.set(batch[i].shard, [batch[i].payload]);
                                }
                            } else {
                                nowPayloadMap.get(batch[i].shard)?.push(batch[i].payload);
                            }
                        } else {
                            if (!payloadMap.has(batch[i].shard)) {
                                if (batch[i].payload != null) {
                                    payloadMap.set(batch[i].shard, [batch[i].payload]);
                                }
                            } else {
                                payloadMap.get(batch[i].shard)?.push(batch[i].payload);
                            }
                        }
                    }

                    const rawResult: Array<Array<JsonRpcResult | JsonRpcError>> = [];
                    const processPayloads = async (key: string | undefined, value: JsonRpcPayload[], now?: boolean) => {
                        const payload = value.length === 1 ? value[0] : value;
                        const shard = key ? toShard(key) : Shard.Prime;
                        const zone = shard.length < 4 ? undefined : toZone(shard);

                        this.emit('debug', zone, { action: 'sendRpcPayload', payload });

                        rawResult.push(await this._send(payload, shard, now));

                        this.emit('debug', zone, { action: 'receiveRpcResult', payload });
                    };
                    await Promise.all(
                        Array.from(nowPayloadMap)
                            .map(async ([key, value]) => {
                                await processPayloads(key, value, true);
                            })
                            .concat(
                                Array.from(payloadMap).map(async ([key, value]) => {
                                    await processPayloads(key, value);
                                }),
                            ),
                    );

                    const result: Array<JsonRpcResult | JsonRpcError> = rawResult.flat();

                    let lastZone: Zone | undefined;
                    try {
                        // Process results in batch order
                        for (const { resolve, reject, payload, shard } of batch) {
                            if (this.destroyed) {
                                reject(
                                    makeError('provider destroyed; cancelled request', 'UNSUPPORTED_OPERATION', {
                                        operation: payload.method,
                                    }),
                                );
                                continue;
                            }

                            if (shard) {
                                lastZone = shard.length < 4 ? undefined : toZone(shard);
                            } else {
                                lastZone = undefined;
                            }

                            // Find the matching result
                            const resp = result.filter((r) => r.id === payload.id)[0];
                            // No result; the node failed us in unexpected ways
                            if (resp == null) {
                                const error = makeError('missing response for request', 'BAD_DATA', {
                                    value: result,
                                    info: { payload },
                                });
                                this.emit('error', lastZone, error);
                                reject(error);
                                continue;
                            }

                            // The response is an error
                            if ('error' in resp) {
                                reject(this.getRpcError(payload, resp, shard));
                                continue;
                            }

                            // All good; send the result
                            resolve(resp.result);
                        }
                    } catch (error: any) {
                        this.emit('debug', lastZone, { action: 'receiveRpcError', error });

                        for (const { reject } of batch) {
                            // @TODO: augment the error with the payload
                            reject(error);
                        }
                    }
                })();
            }
        }, stallTime);
    }

    /**
     * Creates a new JsonRpcApiProvider instance.
     *
     * @param {Networkish} [network] - The network to connect to.
     * @param {JsonRpcApiProviderOptions} [options] - The options for the provider.
     */
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
     *
     * @ignore
     * @param {keyof JsonRpcApiProviderOptions} key - The option key.
     * @returns {JsonRpcApiProviderOptions[key]} The option value.
     */
    _getOption<K extends keyof JsonRpcApiProviderOptions>(key: K): JsonRpcApiProviderOptions[K] {
        return this.#options[key];
    }

    /**
     * Gets the {@link Network | **Network**} this provider has committed to. On each call, the network is detected, and
     * if it has changed, the call will reject.
     *
     * @ignore
     * @returns {Network} The network.
     * @throws {Error} If the network is not available yet.
     */
    get _network(): Network {
        assert(this.#network, 'network is not available yet', 'NETWORK_ERROR');
        return this.#network;
    }

    /**
     * Sends a JSON-RPC `payload` (or a batch) to the underlying channel.
     *
     * Sub-classes **MUST** override this.
     *
     * @ignore
     * @param {JsonRpcPayload | JsonRpcPayload[]} payload - The JSON-RPC payload.
     * @param {Shard} [shard] - The shard to send the request to.
     * @param {boolean} [now] - Whether to send the request immediately.
     * @returns {Promise<(JsonRpcResult | JsonRpcError)[]>} The JSON-RPC result.
     * @throws {Error} If the request fails.
     */
    abstract _send(
        payload: JsonRpcPayload | Array<JsonRpcPayload>,
        shard?: Shard,
        now?: boolean,
    ): Promise<Array<JsonRpcResult | JsonRpcError>>;

    /**
     * Resolves to the non-normalized value by performing `req`.
     *
     * Sub-classes may override this to modify behavior of actions, and should generally call `super._perform` as a
     * fallback.
     *
     * @ignore
     * @param {PerformActionRequest} req - The request to perform.
     * @returns {Promise<any>} The result of the request.
     * @throws {Error} If the request fails.
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
                if (tx.gasPrice == null && tx.minerTip == null) {
                    const feeData = await this.getFeeData(req.zone, tx.type === 1);
                    if (feeData.gasPrice == null && feeData.minerTip == null) {
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
            if (req.method === 'getRunningLocations') {
                return await this.send(request.method, request.args, shard, req.now);
            } else {
                return await this.send(request.method, request.args, shard);
            }
        }

        return super._perform(req);
    }

    /**
     * Sub-classes may override this; it detects the _actual_ network that we are **currently** connected to.
     *
     * Keep in mind that {@link JsonRpcApiProvider.send | **send**} may only be used once
     * {@link JsonRpcApiProvider.ready | **ready**}, otherwise the _send primitive must be used instead.
     *
     * @ignore
     * @returns {Promise<Network>} The detected network.
     * @throws {Error} If network detection fails.
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

            this.emit('debug', undefined, { action: 'sendRpcPayload', payload });

            let result: JsonRpcResult | JsonRpcError;
            try {
                result = (await this._send(payload))[0];
                this.#pendingDetectNetwork = null;
            } catch (error) {
                this.#pendingDetectNetwork = null;
                this.emit('debug', undefined, { action: 'receiveRpcError', error });
                throw error;
            }

            this.emit('debug', undefined, { action: 'receiveRpcResult', result });

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
     *
     * @ignore
     */
    _start() {
        this.attemptConnect = true;
        if (this.#notReady == null || this.#notReady.resolve == null) {
            return;
        }

        this.#notReady.resolve();
        this.#notReady = null;

        (async () => {
            let retries = 0;
            const maxRetries = 5;
            while (this.#network == null && !this.destroyed && retries < maxRetries) {
                try {
                    this.#network = await this._detectNetwork();
                } catch (error) {
                    if (this.destroyed) {
                        break;
                    }
                    console.log(
                        'JsonRpcProvider failed to detect network and cannot start up; retrying (perhaps the URL is wrong or the node is not started)',
                    );
                    this.emit(
                        'error',
                        undefined,
                        makeError('failed to bootstrap network detection', 'NETWORK_ERROR', {
                            event: 'initial-network-discovery',
                            info: { error },
                        }),
                    );
                    await stall(1000 * Math.pow(2, retries));
                    retries++;
                }
            }
            if (retries >= maxRetries) {
                console.log('JsonRpcProvider failed to detect network and cannot start up; retry limit reached');
                makeError('failed to bootstrap network detection', 'NETWORK_ERROR', {
                    event: 'initial-network-discovery',
                    info: { retries },
                });
            }

            // Start dispatching requests
            this.#scheduleDrain();
        })();
    }

    /**
     * Resolves once the {@link JsonRpcApiProvider._start | **_start**} has been called. This can be used in sub-classes
     * to defer sending data until the connection has been established.
     *
     * @ignore
     * @returns {Promise<void>} A promise that resolves once the provider is ready.
     */
    async _waitUntilReady(): Promise<void> {
        if (this._initFailed) {
            console.log('init failed');
            throw new Error('Provider failed to initialize on creation. Run initialize or create a new provider.');
        }

        // Flag to control the loop in setAttemptConnect
        let keepAttempting = true;

        // Function to set attemptConnect every 2 seconds
        const setAttemptConnect = async () => {
            while (keepAttempting) {
                this.attemptConnect = true;
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        };

        // Start setting attemptConnect in the background
        setAttemptConnect();

        try {
            // Wait until initPromise resolves
            await this.initPromise;
        } finally {
            // Stop setting attemptConnect once initPromise resolves
            keepAttempting = false;
        }
    }

    /**
     * Return a Subscriber that will manage the `sub`.
     *
     * Sub-classes may override this to modify the behavior of subscription management.
     *
     * @ignore
     * @param {Subscription} sub - The subscription to manage.
     * @returns {Subscriber} The subscriber that will manage the subscription.
     */
    _getSubscriber(sub: Subscription): Subscriber {
        // Pending Filters aren't availble via polling
        if (sub.type === 'pending') {
            return new FilterIdPendingSubscriber(this, sub.zone!);
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
     *
     * @returns {boolean} True if the provider is ready.
     */
    get ready(): boolean {
        return this.#notReady == null;
    }

    /**
     * Returns `tx` as a normalized JSON-RPC transaction request, which has all values hexlified and any numeric values
     * converted to Quantity values.
     *
     * @ignore
     * @param {TransactionRequest} tx - The transaction to normalize.
     * @returns {JsonRpcTransactionRequest} The normalized transaction.
     * @throws {Error} If the transaction is invalid.
     */
    getRpcTransaction(tx: TransactionRequest): JsonRpcTransactionRequest {
        const result: JsonRpcTransactionRequest = {};

        if ('from' in tx || ('to' in tx && 'data' in tx)) {
            // JSON-RPC now requires numeric values to be "quantity" values
            ['chainId', 'gasLimit', 'gasPrice', 'type', 'gasPrice', 'minerTip', 'nonce', 'value'].forEach((key) => {
                if ((<any>tx)[key] == null) {
                    return;
                }
                let dstKey = key;
                if (key === 'gasLimit') {
                    dstKey = 'gas';
                }
                (<any>result)[dstKey] = toQuantity(getBigInt((<any>tx)[key], `tx.${key}`));
            });

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
            if ((<any>tx).txInputs != null) {
                (result as QiJsonRpcTransactionRequest)['txInputs'] = (<any>tx).txInputs.map((input: TxInput) => ({
                    txhash: hexlify(input.txhash),
                    index: toQuantity(getBigInt(input.index, `tx.txInputs.${input.index}`)),
                    pubkey: hexlify(input.pubkey),
                }));
            }

            if ((<any>tx).txOutputs != null) {
                (result as QiJsonRpcTransactionRequest)['txOutputs'] = (<any>tx).txOutputs.map((output: TxOutput) => ({
                    address: hexlify(output.address),
                    denomination: toQuantity(getBigInt(output.denomination, `tx.txOutputs.${output.denomination}`)),
                }));
            }
        }

        return result;
    }

    /**
     * Returns the request method and arguments required to perform `req`.
     *
     * @ignore
     * @param {PerformActionRequest} req - The request to perform.
     * @returns {null | { method: string; args: any[] }} The method and arguments to use.
     * @throws {Error} If the request is not supported or invalid.
     */
    getRpcRequest(req: PerformActionRequest): null | { method: string; args: Array<any> } {
        switch (req.method) {
            case 'chainId':
                return { method: 'quai_chainId', args: [] };

            case 'getBlockNumber':
                return { method: 'quai_blockNumber', args: [] };

            case 'getGasPrice':
                return {
                    method: 'quai_gasPrice',
                    args: [],
                };

            case 'getMinerTip':
                return { method: 'quai_minerTip', args: [] };

            case 'getPendingHeader':
                return { method: 'quai_getPendingHeader', args: [] };

            case 'getBalance':
                return {
                    method: 'quai_getBalance',
                    args: [req.address, req.blockTag],
                };

            case 'getLockedBalance':
                return {
                    method: 'quai_getLockedBalance',
                    args: [req.address],
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

            case 'estimateFeeForQi': {
                return {
                    method: 'quai_estimateFeeForQi',
                    args: [req.transaction],
                };
            }

            case 'createAccessList': {
                return {
                    method: 'quai_createAccessList',
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

            case 'getTxPoolContent':
                return { method: 'txpool_content', args: [] };

            case 'txPoolInspect':
                return { method: 'txpool_inspect', args: [] };

            case 'getOutpointDeltasForAddressesInRange':
                return {
                    method: 'quai_getOutpointDeltasForAddressesInRange',
                    args: [req.addresses, req.startHash, req.endHash],
                };
        }

        return null;
    }

    /**
     * Returns an quais-style Error for the given JSON-RPC error `payload`, coalescing the various strings and error
     * shapes that different nodes return, coercing them into a machine-readable standardized error.
     *
     * @ignore
     * @param {JsonRpcPayload} payload - The payload that was sent.
     * @param {JsonRpcError} _error - The error that was received.
     * @returns {Error} The coalesced error.
     */
    getRpcError(payload: JsonRpcPayload, _error: JsonRpcError, shard?: Shard): Error {
        const { method } = payload;
        const { error } = _error;

        if (method === 'quai_estimateGas' && error.message) {
            const msg = error.message;
            if (!msg.match(/revert/i) && msg.match(/insufficient funds/i)) {
                return makeError('insufficient funds', 'INSUFFICIENT_FUNDS', {
                    transaction: (<any>payload).params[0],
                    info: { payload, error, shard },
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
            e.info = { error, payload, shard };
            return e;
        }

        // Only estimateGas and call can return arbitrary contract-defined text, so now we
        // we can process text safely.

        const message = JSON.stringify(spelunkMessage(error));

        if (method === 'quai_getTransactionByHash' && error.message && error.message.match(/transaction not found/i)) {
            return makeError('transaction not found', 'TRANSACTION_NOT_FOUND', { info: { payload, error, shard } });
        }

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
                info: { payload, error, shard },
            });
        }

        if (method === 'quai_sendRawTransaction' || method === 'quai_sendTransaction') {
            const transaction = <TransactionLike>(<any>payload).params[0];

            if (message.match(/insufficient funds|base fee exceeds gas limit/i)) {
                return makeError('insufficient funds for intrinsic transaction cost', 'INSUFFICIENT_FUNDS', {
                    transaction,
                    info: { error, shard },
                });
            }

            if (message.match(/nonce/i) && message.match(/too low/i)) {
                return makeError('nonce has already been used', 'NONCE_EXPIRED', {
                    transaction,
                    info: { error, shard },
                });
            }

            // "replacement transaction underpriced"
            if (message.match(/replacement transaction/i) && message.match(/underpriced/i)) {
                return makeError('replacement fee too low', 'REPLACEMENT_UNDERPRICED', {
                    transaction,
                    info: { error, shard },
                });
            }

            if (message.match(/only replay-protected/i)) {
                return makeError('legacy pre-eip-155 transactions not supported', 'UNSUPPORTED_OPERATION', {
                    operation: method,
                    info: { transaction, info: { error, shard } },
                });
            }

            if (message.match(/already known/i)) {
                return makeError('transaction already known', 'TRANSACTION_ALREADY_KNOWN', { info: { error, shard } });
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
                info: { error, payload, shard },
            });
        }

        if (message.match('Provider failed to initialize on creation. Run initialize or create a new provider.')) {
            return makeError(
                'Provider failed to initialize on creation. Run initUrlMap or create a new provider.',
                'PROVIDER_FAILED_TO_INITIALIZE',
                {
                    info: { payload, error, shard },
                },
            );
        }

        return makeError('could not coalesce error', 'UNKNOWN_ERROR', { error, payload, shard });
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
     * @param {boolean} now - If true, the request will be sent immediately.
     * @returns {Promise<any>} A promise that resolves to the result of the method call.
     */
    send(method: string, params: Array<any> | Record<string, any>, shard?: Shard, now?: boolean): Promise<any> {
        const continueSend = (): Promise<any> => {
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
                    now: now,
                });
            });

            // If there is not a pending drainTimer, set one
            this.#scheduleDrain();

            return <Promise<JsonRpcResult>>promise;
        };
        // @TODO: cache chainId?? purge on switch_networks

        // We have been destroyed; no operations are supported anymore
        if (method !== 'quai_listRunningChains') {
            return this.initPromise.then(() => {
                return continueSend();
            });
        } else {
            return continueSend();
        }
    }

    /**
     * Returns a JsonRpcSigner for the given address.
     *
     * @param {number | string} [address] - The address or index of the account.
     * @returns {Promise<JsonRpcSigner>} A promise that resolves to the JsonRpcSigner.
     * @throws {Error} If the account is invalid.
     */
    async getSigner(address?: number | string): Promise<JsonRpcSigner> {
        if (address == null) {
            address = 0;
        }

        const accountsPromise = this.send('quai_accounts', []);

        // Account index
        if (typeof address === 'number') {
            const accounts = <Array<string>>await accountsPromise;
            if (address >= accounts.length) {
                throw new Error('no such account');
            }
            return new JsonRpcSigner(this, accounts[address]);
        }

        const { accounts } = await resolveProperties({
            network: this.getNetwork(),
            accounts: accountsPromise,
        });

        // Account address
        address = getAddress(address);
        for (const account of accounts) {
            if (getAddress(account) === address) {
                return new JsonRpcSigner(this, address);
            }
        }

        throw new Error('invalid account');
    }

    /**
     * Returns a list of JsonRpcSigners for all accounts.
     *
     * @returns {Promise<JsonRpcSigner[]>} A promise that resolves to an array of JsonRpcSigners.
     */
    async listAccounts(): Promise<Array<JsonRpcSigner>> {
        const accounts: Array<string> = await this.send('quai_accounts', []);
        return accounts.map((a) => new JsonRpcSigner(this, a));
    }

    /**
     * Destroys the provider, stopping all processing and canceling all pending requests.
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
            urls.forEach((url) => {
                this.validateUrl(url);
            });
            this.initialize(urls);
        } else if (typeof urls === 'string') {
            this.validateUrl(urls);
            this.initialize([urls]);
        } else {
            this.validateUrl(urls.url);
            this.initialize(urls.clone());
        }
    }

    _getSubscriber(sub: Subscription): Subscriber {
        const subscriber = super._getSubscriber(sub);
        return subscriber;
    }

    _getConnection(shard?: Shard): FetchRequest {
        if (this._initFailed) {
            throw new Error('Provider failed to initialize on creation. Run initUrlMap or create a new provider.');
        }
        let connection;
        if (shard !== undefined) {
            connection = this._urlMap.get(shard) ?? this.connect[this.connect.length - 1]!.clone();
        } else {
            connection = this.connect[this.connect.length - 1]!.clone();
        }
        return new FetchRequest(connection.url);
    }

    async send(method: string, params: Array<any> | Record<string, any>, shard?: Shard, now?: boolean): Promise<any> {
        try {
            this._start();

            return await super.send(method, params, shard, now);
        } catch (error) {
            return Promise.reject(error);
        }
        // All requests are over HTTP, so we can just start handling requests
        // We do this here rather than the constructor so that we don't send any
        // requests to the network (i.e. quai_chainId) until we absolutely have to.
    }

    async _send(
        payload: JsonRpcPayload | Array<JsonRpcPayload>,
        shard?: Shard,
        now?: boolean,
    ): Promise<Array<JsonRpcResult | JsonRpcError>> {
        if (this._initFailed) {
            return [
                {
                    id: Array.isArray(payload) ? payload[0].id : payload.id,
                    error: {
                        code: -32000,
                        message: 'Provider failed to initialize on creation. Run initialize or create a new provider.',
                    },
                },
            ];
        }

        try {
            if (!now) {
                await this._waitUntilReady();
            }
        } catch (error) {
            return [
                {
                    id: Array.isArray(payload) ? payload[0].id : payload.id,
                    error: {
                        code: -32000,
                        message: 'Provider failed to initialize on creation. Run initialize or create a new provider.',
                    },
                },
            ];
        }
        // Configure a POST connection for the requested method
        try {
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
        } catch (error) {
            return [
                {
                    id: Array.isArray(payload) ? payload[0].id : payload.id,
                    error: {
                        code: -32000,
                        message: error instanceof Error ? error.message : String(error),
                    },
                },
            ];
        }
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
