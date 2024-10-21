import { UnmanagedSubscriber } from './abstract-provider.js';
import { assert, assertArgument, makeError } from '../utils/index.js';
import { JsonRpcApiProvider } from './provider-jsonrpc.js';

import type { Subscriber, Subscription } from './abstract-provider.js';
import type { AccessesFilter, EventFilter } from './provider.js';
import type { JsonRpcApiProviderOptions, JsonRpcError, JsonRpcPayload, JsonRpcResult } from './provider-jsonrpc.js';
import type { Networkish } from './network.js';
import type { WebSocketLike } from './provider-websocket.js';
import { Shard, Zone, toShard } from '../constants/index.js';

/**
 * @property {string} method - The method name.
 * @property {Object} params - The parameters.
 * @property {any} params.result - The result.
 * @property {string} params.subscription - The subscription ID.
 */
type JsonRpcSubscription = {
    method: string;
    params: {
        result: any;
        subscription: string;
    };
};

/**
 * A **SocketSubscriber** uses a socket transport to handle events and should use
 * {@link SocketSubscriber._emit | **_emit**} to manage the events.
 *
 * - A sub-class MUST call the `_start()` method once connected
 * - A sub-class MUST override the `_write(string)` method
 * - A sub-class MUST call `_processMessage(string)` for each message
 *
 * @category Providers
 */
export class SocketSubscriber implements Subscriber {
    #provider: SocketProvider;

    #filter: string;

    /**
     * The filter.
     *
     * @type {any[]}
     */
    get filter(): Array<any> {
        return JSON.parse(this.#filter);
    }

    #filterId: null | Promise<string | number>;
    #paused: null | boolean;

    #emitPromise: null | Promise<void>;
    protected zone: Zone;
    protected shard: Shard;

    /**
     * Creates a new **SocketSubscriber** attached to `provider` listening to `filter`.
     *
     * @param {SocketProvider} provider - The socket provider.
     * @param {any[]} filter - The filter.
     */
    constructor(provider: SocketProvider, filter: Array<any>, zone: Zone) {
        this.#provider = provider;
        this.#filter = JSON.stringify(filter);
        this.#filterId = null;
        this.#paused = null;
        this.#emitPromise = null;
        this.zone = zone;
        this.shard = toShard(zone);
    }

    /**
     * Start the subscriber.
     */
    start(): void {
        this.#filterId = this.#provider.send('quai_subscribe', this.filter, this.shard).then((filterId) => {
            this.#provider._register(filterId, this);
            return filterId;
        });
    }

    /**
     * Stop the subscriber.
     */
    stop(): void {
        (<Promise<number>>this.#filterId).then((filterId) => {
            this.#provider.send('quai_unsubscribe', [filterId], this.shard);
        });
        this.#filterId = null;
    }

    /**
     * Pause the subscriber.
     *
     * @param {boolean} [dropWhilePaused] - Whether to drop logs while paused.
     */
    pause(dropWhilePaused?: boolean): void {
        assert(
            dropWhilePaused,
            'preserve logs while paused not supported by SocketSubscriber yet',
            'UNSUPPORTED_OPERATION',
            { operation: 'pause(false)' },
        );
        this.#paused = !!dropWhilePaused;
    }

    /**
     * Resume the subscriber.
     */
    resume(): void {
        this.#paused = null;
    }

    /**
     * Handle incoming messages.
     *
     * @ignore
     * @param {any} message - The message to handle.
     */
    _handleMessage(message: any): void {
        if (this.#filterId == null) {
            return;
        }
        if (this.#paused === null) {
            let emitPromise: null | Promise<void> = this.#emitPromise;
            if (emitPromise == null) {
                emitPromise = this._emit(this.#provider, message);
            } else {
                emitPromise = emitPromise.then(async () => {
                    await this._emit(this.#provider, message);
                });
            }
            this.#emitPromise = emitPromise.then(() => {
                if (this.#emitPromise === emitPromise) {
                    this.#emitPromise = null;
                }
            });
        }
    }

    /**
     * Sub-classes **must** override this to emit the events on the provider.
     *
     * @abstract
     * @param {SocketProvider} provider - The socket provider.
     * @param {any} message - The message to emit.
     * @returns {Promise<void>}
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async _emit(provider: SocketProvider, message: any): Promise<void> {
        throw new Error('sub-classes must implement this; _emit');
    }
}

/**
 * A **SocketBlockSubscriber** listens for `newHeads` events and emits `"block"` events.
 *
 * @category Providers
 */
export class SocketBlockSubscriber extends SocketSubscriber {
    /**
     * Creates a new **SocketBlockSubscriber**.
     *
     * @ignore
     * @param {SocketProvider} provider - The socket provider.
     */
    constructor(provider: SocketProvider, zone: Zone) {
        super(provider, ['newHeads'], zone);
    }

    /**
     * Emit the block event.
     *
     * @ignore
     * @param {SocketProvider} provider - The socket provider.
     * @param {any} message - The message to emit.
     * @returns {Promise<void>}
     */
    async _emit(provider: SocketProvider, message: any): Promise<void> {
        provider.emit('block', this.zone, parseInt(message.woHeader.number));
    }
}

/**
 * A **SocketAccessesSubscriber** listens for `acceses` events and emits `accesses` events.
 *
 * @category Providers
 */
export class SocketAccessesSubscriber extends SocketSubscriber {
    #accessesFilter: string;

    get accessesFilter(): AccessesFilter {
        return JSON.parse(this.#accessesFilter);
    }
    /**
     * Creates a new **SocketBlockSubscriber**.
     *
     * @ignore
     * @param {SocketProvider} provider - The socket provider.
     * @param filter
     * @param zone
     */
    constructor(provider: SocketProvider, filter: AccessesFilter, zone: Zone) {
        super(provider, ['accesses', filter.address], zone);
        this.#accessesFilter = JSON.stringify(filter);
    }

    /**
     * Emit the block event.
     *
     * @ignore
     * @param {SocketProvider} provider - The socket provider.
     * @param {any} message - The message to emit.
     * @returns {Promise<void>}
     */
    async _emit(provider: SocketProvider, message: any): Promise<void> {
        if (this.accessesFilter.type === 'balance') {
            message = await provider.getBalance(this.accessesFilter.address);
        }
        provider.emit(this.accessesFilter, this.zone, message);
    }
}

/**
 * A **SocketPendingSubscriber** listens for pending transactions and emits `"pending"` events.
 *
 * @category Providers
 */
export class SocketPendingSubscriber extends SocketSubscriber {
    /**
     * Creates a new **SocketPendingSubscriber**.
     *
     * @ignore
     * @param {SocketProvider} provider - The socket provider.
     */
    constructor(provider: SocketProvider, zone: Zone) {
        super(provider, ['newPendingTransactions'], zone);
    }

    /**
     * Emit the pending event.
     *
     * @ignore
     * @param {SocketProvider} provider - The socket provider.
     * @param {any} message - The message to emit.
     * @returns {Promise<void>}
     */
    async _emit(provider: SocketProvider, message: any): Promise<void> {
        provider.emit('pending', message);
    }
}

/**
 * A **SocketEventSubscriber** listens for event logs.
 *
 * @category Providers
 */
export class SocketEventSubscriber extends SocketSubscriber {
    #logFilter: string;

    /**
     * The filter.
     *
     * @type {EventFilter}
     */
    get logFilter(): EventFilter {
        return JSON.parse(this.#logFilter);
    }

    /**
     * Creates a new **SocketEventSubscriber**.
     *
     * @ignore
     * @param {SocketProvider} provider - The socket provider.
     * @param {EventFilter} filter - The event filter.
     */
    constructor(provider: SocketProvider, filter: EventFilter, zone: Zone) {
        super(provider, ['logs', filter], zone);
        this.#logFilter = JSON.stringify(filter);
    }

    /**
     * Emit the event log.
     *
     * @ignore
     * @param {SocketProvider} provider - The socket provider.
     * @param {any} message - The message to emit.
     * @returns {Promise<void>}
     */
    async _emit(provider: SocketProvider, message: any): Promise<void> {
        provider.emit(this.logFilter, this.zone, provider._wrapLog(message, provider._network));
    }
}

/**
 * A **SocketProvider** is backed by a long-lived connection over a socket, which can subscribe and receive real-time
 * messages over its communication channel.
 *
 * @category Providers
 */
export class SocketProvider extends JsonRpcApiProvider<WebSocketLike> {
    #callbacks: Map<number, { payload: JsonRpcPayload; resolve: (r: any) => void; reject: (e: Error) => void }>;

    // Maps each filterId to its subscriber
    #subs: Map<number | string, SocketSubscriber>;

    // If any events come in before a subscriber has finished
    // registering, queue them
    #pending: Map<number | string, Array<any>>;

    /**
     * Creates a new **SocketProvider** connected to `network`.
     *
     * If unspecified, the network will be discovered.
     *
     * @param {Networkish} [network] - The network to connect to.
     * @param {JsonRpcApiProviderOptions} [_options] - The options for the provider.
     */
    constructor(network?: Networkish, _options?: JsonRpcApiProviderOptions) {
        // Copy the options
        const options = Object.assign({}, _options != null ? _options : {});

        // Support for batches is generally not supported for
        // connection-base providers; if this changes in the future
        // the _send should be updated to reflect this
        assertArgument(
            options.batchMaxCount == null || options.batchMaxCount === 1,
            'sockets-based providers do not support batches',
            'options.batchMaxCount',
            _options,
        );
        options.batchMaxCount = 1;

        // Socket-based Providers (generally) cannot change their network,
        // since they have a long-lived connection; but let people override
        // this if they have just cause.
        if (options.staticNetwork == null) {
            options.staticNetwork = true;
        }

        super(network, options);
        this.#callbacks = new Map();
        this.#subs = new Map();
        this.#pending = new Map();
    }

    /**
     * Get the subscriber for a given subscription.
     *
     * @ignore
     * @param {Subscription} sub - The subscription.
     * @returns {Subscriber} The subscriber.
     */
    _getSubscriber(sub: Subscription): Subscriber {
        switch (sub.type) {
            case 'close':
                return new UnmanagedSubscriber('close');
            case 'block':
                return new SocketBlockSubscriber(this, sub.zone);
            case 'accesses':
                return new SocketAccessesSubscriber(this, sub.filter, sub.zone);
            case 'pending':
                return new SocketPendingSubscriber(this, sub.zone);
            case 'event':
                return new SocketEventSubscriber(this, sub.filter, sub.zone);
            case 'orphan':
                // Handled auto-matically within AbstractProvider
                // when the log.removed = true
                if (sub.filter.orphan === 'drop-log') {
                    return new UnmanagedSubscriber('drop-log');
                }
        }
        return super._getSubscriber(sub);
    }

    /**
     * Register a new subscriber. This is used internally by Subscribers and generally is unnecessary unless extending
     * capabilities.
     *
     * @ignore
     * @param {number | string} filterId - The filter ID.
     * @param {SocketSubscriber} subscriber - The subscriber.
     */
    _register(filterId: number | string, subscriber: SocketSubscriber): void {
        this.#subs.set(filterId, subscriber);
        const pending = this.#pending.get(filterId);
        if (pending) {
            for (const message of pending) {
                subscriber._handleMessage(message);
            }
            this.#pending.delete(filterId);
        }
    }

    /**
     * Send a JSON-RPC payload.
     *
     * @ignore
     * @param {JsonRpcPayload | JsonRpcPayload[]} payload - The payload to send.
     * @param {Shard} [shard] - The shard.
     * @param {boolean} [now] - Whether to send immediately.
     * @returns {Promise<(JsonRpcResult | JsonRpcError)[]>} The result or error.
     */
    async _send(
        payload: JsonRpcPayload | Array<JsonRpcPayload>,
        shard?: Shard,
        now?: boolean,
    ): Promise<Array<JsonRpcResult | JsonRpcError>> {
        if (this._initFailed) {
            console.log('Provider failed to initialize on creation. Run initialize or create a new provider.');
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
        // WebSocket provider doesn't accept batches
        assertArgument(!Array.isArray(payload), 'WebSocket does not support batch send', 'payload', payload);

        // @TODO: stringify payloads here and store to prevent mutations

        // Prepare a promise to respond to
        const promise = new Promise((resolve, reject) => {
            this.#callbacks.set(payload.id, { payload, resolve, reject });
        });

        // Wait until the socket is connected before writing to it
        try {
            if (!now) {
                await this._waitUntilReady();
            }
        } catch (error) {
            this.#callbacks.delete(payload.id);
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

        // Write the request to the socket
        await this._write(JSON.stringify(payload), shard);

        return <Array<JsonRpcResult | JsonRpcError>>[await promise];
    }

    /**
     * Sub-classes **must** call this with messages received over their transport to be processed and dispatched.
     *
     * @ignore
     * @param {string} message - The message to process.
     */
    async _processMessage(message: string): Promise<void> {
        const result = <JsonRpcResult | JsonRpcError | JsonRpcSubscription>JSON.parse(message);

        if (result && typeof result === 'object' && 'id' in result) {
            const callback = this.#callbacks.get(result.id);
            if (callback == null) {
                this.emit(
                    'error',
                    undefined,
                    makeError('received result for unknown id', 'UNKNOWN_ERROR', {
                        reasonCode: 'UNKNOWN_ID',
                        result,
                    }),
                );
                return;
            }
            this.#callbacks.delete(result.id);

            callback.resolve(result);
        } else if (result && result.method === 'quai_subscription') {
            const filterId = result.params.subscription;
            const subscriber = this.#subs.get(filterId);
            if (subscriber) {
                subscriber._handleMessage(result.params.result);
            } else {
                let pending = this.#pending.get(filterId);
                if (pending == null) {
                    pending = [];
                    this.#pending.set(filterId, pending);
                }
                pending.push(result.params.result);
            }
        } else {
            this.emit(
                'error',
                undefined,
                makeError('received unexpected message', 'UNKNOWN_ERROR', {
                    reasonCode: 'UNEXPECTED_MESSAGE',
                    result,
                }),
            );
            return;
        }
    }

    /**
     * Sub-classes **must** override this to send `message` over their transport.
     *
     * @ignore
     * @param {string} message - The message to send.
     * @param {Shard} [shard] - The shard.
     * @returns {Promise<void>}
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async _write(message: string, shard?: Shard): Promise<void> {
        throw new Error('sub-classes must override this');
    }

    validateUrl(url: string): void {
        const urlPattern = /^(wss?):\/\/[a-zA-Z0-9.-]+(:\d+)?$/;

        if (!urlPattern.test(url)) {
            let errorMessage = 'Invalid URL: ';

            if (!/^wss?:\/\//.test(url)) {
                errorMessage += 'URL must start with ws:// or wss://. ';
            }

            if (url.endsWith('/')) {
                errorMessage += 'URL should not end with a /. ';
            }

            if (/\/[^/]+/.test(url)) {
                errorMessage += 'URL should not contain a path, query string, or fragment. ';
            }
            throw new Error(errorMessage.trim());
        }
    }
}
