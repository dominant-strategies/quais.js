/**
 * The available providers should suffice for most developers purposes, but the
 * {@link AbstractProvider | **AbstractProvider**} class has many features which enable sub-classing it for specific
 * purposes.
 *
 * @section api/providers/abstract-provider: Subclassing Provider  [abstract-provider]
 */

// @TODO
// Event coalescence
//   When we register an event with an async value (e.g. address is a Signer
//   or ENS name), we need to add it immeidately for the Event API, but also
//   need time to resolve the address. Upon resolving the address, we need to
//   migrate the listener to the static event. We also need to maintain a map
//   of Signer/ENS name to address so we can sync respond to listenerCount.

import { getAddress, resolveAddress } from '../address/index.js';
import { ShardData } from '../constants/index.js';
import { TxInput, TxOutput } from '../transaction/index.js';
import { Outpoint } from '../transaction/utxo.js';
import {
    hexlify,
    isHexString,
    getBigInt,
    getBytes,
    getNumber,
    makeError,
    assert,
    assertArgument,
    FetchRequest,
    toQuantity,
    defineProperties,
    EventPayload,
    resolveProperties,
    decodeProtoTransaction,
} from '../utils/index.js';

import { formatBlock, formatLog, formatTransactionReceipt, formatTransactionResponse } from './format.js';
import { Network } from './network.js';
import {
    copyRequest,
    Block,
    FeeData,
    Log,
    TransactionReceipt,
    TransactionResponse,
    addressFromTransactionRequest,
    QiPreparedTransactionRequest,
    QuaiPreparedTransactionRequest,
    QuaiTransactionResponse,
    QiTransactionResponse,
    QuaiTransactionRequest,
} from './provider.js';

import type { Addressable, AddressLike } from '../address/index.js';
import type { BigNumberish } from '../utils/index.js';
import type { Listener } from '../utils/index.js';

import type { Networkish } from './network.js';
import type { FetchUrlFeeDataNetworkPlugin } from './plugins-network.js';
import type {
    BlockParams,
    LogParams,
    QiTransactionResponseParams,
    TransactionReceiptParams,
    TransactionResponseParams,
} from './formatting.js';

import type {
    BlockTag,
    EventFilter,
    Filter,
    FilterByBlockHash,
    OrphanFilter,
    Provider,
    ProviderEvent,
    TransactionRequest,
} from "./provider.js";
import { WorkObjectLike } from "../transaction/work-object.js";
import {QiTransaction, QuaiTransaction} from "../transaction/index.js";
import {QuaiTransactionResponseParams} from "./formatting.js";
import {keccak256, SigningKey} from "../crypto/index.js";

type Timer = ReturnType<typeof setTimeout>;

// Constants
const BN_2 = BigInt(2);

function isPromise<T = any>(value: any): value is Promise<T> {
    return value && typeof value.then === 'function';
}

function getTag(prefix: string, value: any): string {
    return (
        prefix +
        ':' +
        JSON.stringify(value, (k, v) => {
            if (v == null) {
                return 'null';
            }
            if (typeof v === 'bigint') {
                return `bigint:${v.toString()}`;
            }
            if (typeof v === 'string') {
                return v.toLowerCase();
            }

            // Sort object keys
            if (typeof v === 'object' && !Array.isArray(v)) {
                const keys = Object.keys(v);
                keys.sort();
                return keys.reduce(
                    (accum, key) => {
                        accum[key] = v[key];
                        return accum;
                    },
                    <any>{},
                );
            }

            return v;
        })
    );
}

/**
 * The types of additional event values that can be emitted for the `"debug"` event.
 *
 * @category Providers
 */
export type DebugEventAbstractProvider =
    | {
          action: 'sendCcipReadFetchRequest';
          request: FetchRequest;
          index: number;
          urls: Array<string>;
      }
    | {
          action: 'receiveCcipReadFetchResult';
          request: FetchRequest;
          result: any;
      }
    | {
          action: 'receiveCcipReadFetchError';
          request: FetchRequest;
          result: any;
      }
    | {
          action: 'sendCcipReadCall';
          transaction: { to: string; data: string };
      }
    | {
          action: 'receiveCcipReadCallResult';
          transaction: { to: string; data: string };
          result: string;
      }
    | {
          action: 'receiveCcipReadCallError';
          transaction: { to: string; data: string };
          error: Error;
      };

/**
 * The value passed to the {@link AbstractProvider._getSubscriber | **AbstractProvider._getSubscriber} method.
 *
 * Only developers sub-classing {@link AbstractProvider | **AbstractProvider**} will care about this, if they are
 * modifying a low-level feature of how subscriptions operate.
 *
 * @category Providers
 */
export type Subscription =
    | {
          type: 'block' | 'close' | 'debug' | 'error' | 'finalized' | 'network' | 'pending' | 'safe';
          tag: string;
      }
    | {
          type: 'transaction';
          tag: string;
          hash: string;
      }
    | {
          type: 'event';
          tag: string;
          filter: EventFilter;
      }
    | {
          type: 'orphan';
          tag: string;
          filter: OrphanFilter;
      };

/**
 * A **Subscriber** manages a subscription.
 *
 * Only developers sub-classing {@link AbstractProvider | **AbstractProvider**} will care about this, if they are
 * modifying a low-level feature of how subscriptions operate.
 *
 * @category Providers
 */
export interface Subscriber {
    /**
     * Called initially when a subscriber is added the first time.
     */
    start(): void;

    /**
     * Called when there are no more subscribers to the event.
     */
    stop(): void;

    /**
     * Called when the subscription should pause.
     *
     * If `dropWhilePaused`, events that occur while paused should not be emitted
     * {@link Subscriber.resume | **Subscriber.resume**}.
     *
     * @param {boolean} [dropWhilePaused] - If `true`, events that occur while paused
     */
    pause(dropWhilePaused?: boolean): void;

    /**
     * Resume a paused subscriber.
     */
    resume(): void;

    /**
     * The frequency (in ms) to poll for events, if polling is used by the subscriber.
     *
     * For non-polling subscribers, this must return `undefined`.
     */
    pollingInterval?: number;
}

/**
 * An **UnmanagedSubscriber** is useful for events which do not require any additional management, such as `"debug"`
 * which only requires emit in synchronous event loop triggered calls.
 *
 * @category Providers
 */
export class UnmanagedSubscriber implements Subscriber {
    /**
     * The name fof the event.
     */
    name!: string;

    /**
     * Create a new UnmanagedSubscriber with `name`.
     */
    constructor(name: string) {
        defineProperties<UnmanagedSubscriber>(this, { name });
    }

    start(): void {}
    stop(): void {}

    // TODO: `dropWhilePaused` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    pause(dropWhilePaused?: boolean): void {}
    resume(): void {}
}

type Sub = {
    tag: string;
    nameMap: Map<string, string>;
    addressableMap: WeakMap<Addressable, string>;
    listeners: Array<{ listener: Listener; once: boolean }>;
    // @TODO: get rid of this, as it is (and has to be)
    // tracked in subscriber
    started: boolean;
    subscriber: Subscriber;
};

function copy<T = any>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function concisify(items: Array<string>): Array<string> {
    items = Array.from(new Set(items).values());
    items.sort();
    return items;
}

// TODO: `provider` is not used, remove or re-write
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getSubscription(_event: ProviderEvent, provider: AbstractProvider<any>): Promise<Subscription> {
    if (_event == null) {
        throw new Error('invalid event');
    }

    // Normalize topic array info an EventFilter
    if (Array.isArray(_event)) {
        _event = { topics: _event };
    }

    if (typeof _event === 'string') {
        switch (_event) {
            case 'block':
            case 'debug':
            case 'error':
            case 'finalized':
            case 'network':
            case 'pending':
            case 'safe': {
                return { type: _event, tag: _event };
            }
        }
    }

    if (isHexString(_event, 32)) {
        const hash = _event.toLowerCase();
        return { type: 'transaction', tag: getTag('tx', { hash }), hash };
    }

    if ((<any>_event).orphan) {
        const event = <OrphanFilter>_event;
        // @TODO: Should lowercase and whatnot things here instead of copy...
        return { type: 'orphan', tag: getTag('orphan', event), filter: copy(event) };
    }

    if ((<any>_event).address || (<any>_event).topics) {
        const event = <EventFilter>_event;

        const filter: any = {
            topics: (event.topics || []).map((t) => {
                if (t == null) {
                    return null;
                }
                if (Array.isArray(t)) {
                    return concisify(t.map((t) => t.toLowerCase()));
                }
                return t.toLowerCase();
            }),
        };

        if (event.address) {
            const addresses: Array<string> = [];
            const promises: Array<Promise<void>> = [];

            const addAddress = (addr: AddressLike) => {
                if (isHexString(addr)) {
                    addresses.push(addr);
                } else {
                    promises.push(
                        (async () => {
                            addresses.push(await resolveAddress(addr));
                        })(),
                    );
                }
            };

            if (Array.isArray(event.address)) {
                event.address.forEach(addAddress);
            } else {
                addAddress(event.address);
            }
            if (promises.length) {
                await Promise.all(promises);
            }
            filter.address = concisify(addresses.map((a) => a.toLowerCase()));
        }

        return { filter, tag: getTag('event', filter), type: 'event' };
    }

    assertArgument(false, 'unknown ProviderEvent', 'event', _event);
}

function getTime(): number {
    return new Date().getTime();
}

/**
 * An **AbstractPlugin** is used to provide additional internal services to an
 * {@link AbstractProvider | **AbstractProvider**} without adding backwards-incompatible changes to method signatures or
 * other internal and complex logic.
 *
 * @category Providers
 */
export interface AbstractProviderPlugin {
    /**
     * The reverse domain notation of the plugin.
     */
    readonly name: string;

    /**
     * Creates a new instance of the plugin, connected to `provider`.
     *
     * @param {AbstractProvider} provider - The provider to connect to.
     */
    connect(provider: AbstractProvider<any>): AbstractProviderPlugin;
}

/**
 * A normalized filter used for {@link PerformActionRequest | **PerformActionRequest**} objects.
 *
 * @category Providers
 */
export type PerformActionFilter =
    | {
          address?: string | Array<string>;
          topics?: Array<null | string | Array<string>>;
          fromBlock?: BlockTag;
          toBlock?: BlockTag;
          shard: string;
      }
    | {
          address?: string | Array<string>;
          topics?: Array<null | string | Array<string>>;
          blockHash?: string;
          shard: string;
      };

/**
 * A normalized transactions used for {@link PerformActionRequest | **PerformActionRequest**} objects.
 *
 * @category Providers
 */
export type PerformActionTransaction = QuaiPerformActionTransaction | QiPerformActionTransaction;

/**
 * @category Providers
 * @todo Write documentation for this interface
 */
export interface QuaiPerformActionTransaction extends QuaiPreparedTransactionRequest {
    /**
     * The `to` address of the transaction.
     */
    to?: string;

    /**
     * The sender of the transaction.
     */
    from: string;

    [key: string]: any;
}

/**
 * @category Providers
 * @todo Write documentation for this interface
 */
export interface QiPerformActionTransaction extends QiPreparedTransactionRequest {
    /**
     * The `inputs` of the UTXO transaction.
     */
    inputs?: Array<TxInput>;

    /**
     * The `outputs` of the UTXO transaction.
     */
    outputs?: Array<TxOutput>;

    [key: string]: any;
}

/**
 * The {@link AbstractProvider | **AbstractProvider**} methods will normalize all values and pass this type to
 * {@link AbstractProvider._perform | **AbstractProvider._perform**}.
 *
 * @category Providers
 */
export type PerformActionRequest =
    | {
          method: 'broadcastTransaction';
          signedTransaction: string;
          shard: string;
      }
    | {
          method: 'call';
          transaction: PerformActionTransaction;
          blockTag: BlockTag;
          shard?: string;
      }
    | {
          method: 'chainId';
          shard?: string;
      }
    | {
          method: 'estimateGas';
          transaction: PerformActionTransaction;
          shard?: string;
      }
    | {
          method: 'getBalance';
          address: string;
          blockTag: BlockTag;
          shard: string;
      }
    | {
          method: 'getOutpointsByAddress';
          address: string;
          shard: string;
      }
    | {
          method: 'getBlock';
          blockTag: BlockTag;
          includeTransactions: boolean;
          shard: string;
      }
    | {
          method: 'getBlock';
          blockHash: string;
          includeTransactions: boolean;
          shard: string;
      }
    | {
          method: 'getBlockNumber';
          shard?: string;
      }
    | {
          method: 'getCode';
          address: string;
          blockTag: BlockTag;
          shard: string;
      }
    | {
          method: 'getGasPrice';
          txType: boolean;
          shard?: string;
      }
    | {
          method: 'getLogs';
          filter: PerformActionFilter;
          shard: string;
      }
    | {
          method: 'getMaxPriorityFeePerGas';
          shard?: string;
      }
    | {
          method: 'getStorage';
          address: string;
          position: bigint;
          blockTag: BlockTag;
          shard: string;
      }
    | {
          method: 'getTransaction';
          hash: string;
          shard: string;
      }
    | {
          method: 'getTransactionCount';
          address: string;
          blockTag: BlockTag;
          shard: string;
      }
    | {
          method: 'getTransactionReceipt';
          hash: string;
          shard: string;
      }
    | {
          method: 'getTransactionResult';
          hash: string;
          shard: string;
      }
    | {
          method: 'getRunningLocations';
          shard?: string;
      }
    | {
          method: 'getProtocolTrieExpansionCount';
          shard: string;
      }
    | {
          method: 'getQiRateAtBlock';
          blockTag: BlockTag;
          amt: number;
          shard: string;
      }
    | {
          method: 'getQuaiRateAtBlock';
          blockTag: BlockTag;
          amt: number;
          shard: string;
      }
    | {
          method: 'getProtocolExpansionNumber';
      }
    | {
          method: 'getPendingHeader';
      };

type _PerformAccountRequest =
    | {
          method: 'getBalance' | 'getTransactionCount' | 'getCode' | 'getOutpointsByAddress';
      }
    | {
          method: 'getStorage';
          position: bigint;
      };

/**
 * Options for configuring some internal aspects of an {@link AbstractProvider | **AbstractProvider**}.
 *
 * **`cacheTimeout`** - how long to cache a low-level `_perform` for, based on input parameters. This reduces the number
 * of calls to getChainId and getBlockNumber, but may break test chains which can perform operations (internally)
 * synchronously. Use `-1` to disable, `0` will only buffer within the same event loop and any other value is in ms.
 * (default: `250`)
 *
 * @category Providers
 */
export type AbstractProviderOptions = {
    cacheTimeout?: number;
    pollingInterval?: number;
};

const defaultOptions = {
    cacheTimeout: 250,
    pollingInterval: 4000,
};

/**
 * An **AbstractProvider** provides a base class for other sub-classes to implement the {@link Provider | **Provider**}
 * API by normalizing input arguments and formatting output results as well as tracking events for consistent behaviour
 * on an eventually-consistent network.
 *
 * @category Providers
 */
export class AbstractProvider<C = FetchRequest> implements Provider {
    _urlMap: Map<string, C>;
    #connect: FetchRequest[];
    #subs: Map<string, Sub>;
    #plugins: Map<string, AbstractProviderPlugin>;

    // null=unpaused, true=paused+dropWhilePaused, false=paused
    #pausedState: null | boolean;

    #destroyed: boolean;

    #networkPromise: null | Promise<Network>;
    readonly #anyNetwork: boolean;

    #performCache: Map<string, Promise<any>>;

    // The most recent block number if running an event or -1 if no "block" event
    #lastBlockNumber: number;

    #nextTimer: number;
    #timers: Map<number, { timer: null | Timer; func: () => void; time: number }>;

    #disableCcipRead: boolean;

    #options: Required<AbstractProviderOptions>;

    /**
     * Create a new **AbstractProvider** connected to `network`, or use the various network detection capabilities to
     * discover the {@link Network | **Network**} if necessary.
     *
     * @param _network - The network to connect to, or `"any"` to
     * @param options - The options to configure the provider.
     */
    constructor(_network?: 'any' | Networkish, options?: AbstractProviderOptions) {
        this.#options = Object.assign({}, defaultOptions, options || {});

        if (_network === 'any') {
            this.#anyNetwork = true;
            this.#networkPromise = null;
        } else if (_network) {
            const network = Network.from(_network);
            this.#anyNetwork = false;
            this.#networkPromise = Promise.resolve(network);
            setTimeout(() => {
                this.emit('network', network, null);
            }, 0);
        } else {
            this.#anyNetwork = false;
            this.#networkPromise = null;
        }

        this.#lastBlockNumber = -1;

        this.#performCache = new Map();

        this.#subs = new Map();
        this.#plugins = new Map();
        this.#pausedState = null;

        this.#destroyed = false;

        this.#nextTimer = 1;
        this.#timers = new Map();

        this.#disableCcipRead = false;
        this.#connect = [];
        this._urlMap = new Map();
    }

    async initUrlMap<U = string[] | FetchRequest>(urls: U): Promise<void> {
        if (urls instanceof FetchRequest) {
            urls.url = urls.url.split(':')[0] + ':' + urls.url.split(':')[1] + ':9001';
            this._urlMap.set('0x', urls as C);
            this.#connect.push(urls);
            const shards = await this.getRunningLocations();
            shards.forEach((shard) => {
                const port = 9200 + 20 * shard[0] + shard[1];
                this._urlMap.set(
                    `0x${shard[0].toString(16)}${shard[1].toString(16)}`,
                    new FetchRequest(urls.url.split(':')[0] + ':' + urls.url.split(':')[1] + ':' + port) as C,
                );
            });
            return;
        }
        if (Array.isArray(urls)) {
            for (const url of urls) {
                const primeUrl = url.split(':')[0] + ':' + url.split(':')[1] + ':9001';
                const primeConnect = new FetchRequest(primeUrl);
                this._urlMap.set('0x', primeConnect as C);
                this.#connect.push(primeConnect);
                const shards = await this.getRunningLocations();
                shards.forEach((shard) => {
                    const port = 9200 + 20 * shard[0] + shard[1];
                    this._urlMap.set(
                        `0x${shard[0].toString(16)}${shard[1].toString(16)}`,
                        new FetchRequest(url.split(':')[0] + ':' + url.split(':')[1] + ':' + port) as C,
                    );
                });
            }
        }
    }

    shardBytes(shard: string): string {
        return (
            ShardData.find((it) => it.name == shard || it.byte == shard || it.nickname == shard || it.shard == shard)
                ?.byte || ''
        );
    }

    get connect(): FetchRequest[] {
        return this.#connect;
    }

    async shardFromAddress(_address: AddressLike): Promise<string> {
        const address: string | Promise<string> = this._getAddress(_address);
        return (await address).slice(0, 4);
    }

    shardFromHash(hash: string): string {
        return hash.slice(0, 4);
    }

    async getLatestQuaiRate(shard: string, amt: number = 1): Promise<bigint> {
        const blockNumber = await this.getBlockNumber(shard);
        return this.getQuaiRateAtBlock(shard, blockNumber, amt);
    }

    async getQuaiRateAtBlock(shard: string, blockTag: BlockTag, amt: number = 1): Promise<bigint> {
        let resolvedBlockTag = this._getBlockTag(shard, blockTag);
        if (typeof resolvedBlockTag !== 'string') {
            resolvedBlockTag = await resolvedBlockTag;
        }

        return await this.#perform({
            method: 'getQuaiRateAtBlock',
            blockTag: resolvedBlockTag,
            amt,
            shard: shard,
        });
    }

    async getProtocolExpansionNumber(): Promise<number> {
        return await this.#perform({
            method: 'getProtocolExpansionNumber',
        });
    }

    async getLatestQiRate(shard: string, amt: number = 1): Promise<bigint> {
        const blockNumber = await this.getBlockNumber(shard);
        return this.getQiRateAtBlock(shard, blockNumber, amt);
    }

    async getQiRateAtBlock(shard: string, blockTag: BlockTag, amt: number = 1): Promise<bigint> {
        let resolvedBlockTag = this._getBlockTag(shard, blockTag);
        if (typeof resolvedBlockTag !== 'string') {
            resolvedBlockTag = await resolvedBlockTag;
        }

        return await this.#perform({
            method: 'getQiRateAtBlock',
            blockTag: resolvedBlockTag,
            amt,
            shard: shard,
        });
    }

    get pollingInterval(): number {
        return this.#options.pollingInterval;
    }

    /**
     * Returns `this`, to allow an **AbstractProvider** to implement the [Contract Runner](../classes/ContractRunner)
     * interface.
     */
    get provider(): this {
        return this;
    }

    /**
     * Returns all the registered plug-ins.
     *
     * @returns {AbstractProviderPlugin[]} An array of all the registered plug-ins.
     */
    get plugins(): Array<AbstractProviderPlugin> {
        return Array.from(this.#plugins.values());
    }

    /**
     * Attach a new plug-in.
     *
     * @param {AbstractProviderPlugin} plugin - The plug-in to attach.
     */
    attachPlugin(plugin: AbstractProviderPlugin): this {
        if (this.#plugins.get(plugin.name)) {
            throw new Error(`cannot replace existing plugin: ${plugin.name} `);
        }
        this.#plugins.set(plugin.name, plugin.connect(this));
        return this;
    }

    /**
     * Get a plugin by name.
     *
     * @param {string} name - The name of the plugin to get.
     *
     * @returns {AbstractProviderPlugin | null} The plugin, or `null` if not found.
     */
    getPlugin<T extends AbstractProviderPlugin = AbstractProviderPlugin>(name: string): null | T {
        return <T>this.#plugins.get(name) || null;
    }

    /**
     * Prevent any CCIP-read operation, regardless of whether requested in a {@link AbstractProvider.call | **call**}
     * using `enableCcipRead`.
     */
    get disableCcipRead(): boolean {
        return this.#disableCcipRead;
    }
    set disableCcipRead(value: boolean) {
        this.#disableCcipRead = !!value;
    }

    // Shares multiple identical requests made during the same 250ms
    async #perform<T = any>(req: PerformActionRequest): Promise<T> {
        const timeout = this.#options.cacheTimeout;
        // Caching disabled
        if (timeout < 0) {
            return await this._perform(req);
        }

        // Create a tag
        const tag = getTag(req.method, req);

        let perform = this.#performCache.get(tag);
        if (!perform) {
            perform = this._perform(req);

            this.#performCache.set(tag, perform);

            setTimeout(() => {
                if (this.#performCache.get(tag) === perform) {
                    this.#performCache.delete(tag);
                }
            }, timeout);
        }

        return await perform;
    }

    /**
     * Provides the opportunity for a sub-class to wrap a block before returning it, to add additional properties or an
     * alternate sub-class of {@link Block | **Block**}.
     *
     * @param {BlockParams} value - The block to wrap.
     * @param {Network} network - The network the block was on.
     *
     * @returns {Block} The wrapped block.
     */
    // TODO: `newtork` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _wrapBlock(value: BlockParams, network: Network): Block {
        // Handle known node by -> remove null values from the number array
        value.number = Array.isArray(value.number) ? value.number.filter((n: any) => n != null) : value.number;
        return new Block(formatBlock(value), this);
    }

    /**
     * Provides the opportunity for a sub-class to wrap a log before returning it, to add additional properties or an
     * alternate sub-class of {@link Log | **Log**}.
     *
     * @param {LogParams} value - The log to wrap.
     * @param {Network} network - The network the log was on.
     *
     * @returns {Log} The wrapped log.
     */
    // TODO: `newtork` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _wrapLog(value: LogParams, network: Network): Log {
        return new Log(formatLog(value), this);
    }

    /**
     * Provides the opportunity for a sub-class to wrap a transaction receipt before returning it, to add additional
     * properties or an {@link TransactionReceipt | **TransactionReceipt**}.
     *
     * @param {TransactionReceiptParams} value - The transaction receipt to wrap.
     * @param {Network} network - The network the transaction was on.
     *
     * @returns {TransactionReceipt} The wrapped transaction receipt.
     */
    // TODO: `newtork` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _wrapTransactionReceipt(value: TransactionReceiptParams, network: Network): TransactionReceipt {
        return new TransactionReceipt(formatTransactionReceipt(value), this);
    }

    /**
     * Provides the opportunity for a sub-class to wrap a transaction response before returning it, to add additional
     * properties or an alternate sub-class of {@link TransactionResponse | **TransactionResponse**}.
     *
     * @param {TransactionResponseParams} tx - The transaction response to wrap.
     * @param {Network} network - The network the transaction was on.
     *
     * @returns {TransactionResponse} The wrapped transaction response.
     */
    // TODO: `newtork` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _wrapTransactionResponse(tx: TransactionResponseParams, network: Network): TransactionResponse {
        if ('from' in tx) {
            return new QuaiTransactionResponse(formatTransactionResponse(tx) as QuaiTransactionResponseParams, this);
        } else {
            return new QiTransactionResponse(formatTransactionResponse(tx) as QiTransactionResponseParams, this);
        }
    }

    /**
     * Resolves to the Network, forcing a network detection using whatever technique the sub-class requires.
     *
     * Sub-classes **must** override this.
     *
     * @param {string} [shard] - The shard to use for the network detection.
     *
     * @returns {Promise<Network>} A promise resolving to the network.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _detectNetwork(shard?: string): Promise<Network> {
        assert(false, 'sub-classes must implement this', 'UNSUPPORTED_OPERATION', {
            operation: '_detectNetwork',
        });
    }

    /**
     * Sub-classes should use this to perform all built-in operations. All methods sanitizes and normalizes the values
     * passed into this.
     *
     * Sub-classes **must** override this.
     *
     * @param {PerformActionRequest} req - The request to perform.
     *
     * @returns {Promise<T>} A promise resolving to the result of the operation.
     */
    async _perform<T = any>(req: PerformActionRequest): Promise<T> {
        assert(false, `unsupported method: ${req.method}`, 'UNSUPPORTED_OPERATION', {
            operation: req.method,
            info: req,
        });
    }

    // State

    async getBlockNumber(shard?: string): Promise<number> {
        const blockNumber = getNumber(await this.#perform({ method: 'getBlockNumber', shard: shard }), '%response');
        if (this.#lastBlockNumber >= 0) {
            this.#lastBlockNumber = blockNumber;
        }
        return blockNumber;
    }

    /**
     * Returns or resolves to the address for `address`, resolving ENS names and {@link Addressable | **Addressable**}
     * objects and returning if already an address.
     *
     * @param {AddressLike} address - The address to normalize.
     *
     * @returns {string | Promise<string>} The normalized address.
     */
    _getAddress(address: AddressLike): string | Promise<string> {
        return resolveAddress(address);
    }

    /**
     * Returns or resolves to a valid block tag for `blockTag`, resolving negative values and returning if already a
     * valid block tag.
     *
     * @param {string} [shard] - The shard to use for the block tag.
     * @param {BlockTag} [blockTag] - The block tag to normalize.
     *
     * @returns {string | Promise<string>} A promise that resolves to a valid block tag.
     */
    _getBlockTag(shard?: string, blockTag?: BlockTag): string | Promise<string> {
        if (blockTag == null) {
            return 'latest';
        }

        switch (blockTag) {
            case 'earliest':
                return '0x0';
            case 'finalized':
            case 'latest':
            case 'pending':
            case 'safe':
                return blockTag;
        }

        if (isHexString(blockTag)) {
            if (isHexString(blockTag, 32)) {
                return blockTag;
            }
            return toQuantity(blockTag);
        }

        if (typeof blockTag === 'bigint') {
            blockTag = getNumber(blockTag, 'blockTag');
        }

        if (typeof blockTag === 'number') {
            if (blockTag >= 0) {
                return toQuantity(blockTag);
            }
            if (this.#lastBlockNumber >= 0) {
                return toQuantity(this.#lastBlockNumber + blockTag);
            }
            return this.getBlockNumber(shard).then((b) => toQuantity(b + <number>blockTag));
        }

        assertArgument(false, 'invalid blockTag', 'blockTag', blockTag);
    }

    /**
     * Returns or resolves to a filter for `filter`, resolving any ENS names or {@link Addressable | **Addressable**}
     * object and returning if already a valid filter.
     *
     * @param {Filter | FilterByBlockHash} filter - The filter to normalize.
     *
     * @returns {PerformActionFilter | Promise<PerformActionFilter>} A promise that resolves to a valid filter.
     */
    _getFilter(filter: Filter | FilterByBlockHash): PerformActionFilter | Promise<PerformActionFilter> {
        // Create a canonical representation of the topics
        const topics = (filter.topics || []).map((t) => {
            if (t == null) {
                return null;
            }
            if (Array.isArray(t)) {
                return concisify(t.map((t) => t.toLowerCase()));
            }
            return t.toLowerCase();
        });

        const blockHash = 'blockHash' in filter ? filter.blockHash : undefined;

        const resolve = (_address: Array<string>, fromBlock?: string, toBlock?: string, shard?: string) => {
            let address: undefined | string | Array<string> = undefined;
            switch (_address.length) {
                case 0:
                    break;
                case 1:
                    address = _address[0];
                    break;
                default:
                    _address.sort();
                    address = _address;
            }

            if (blockHash) {
                if (fromBlock != null || toBlock != null) {
                    throw new Error('invalid filter');
                }
            }

            const filter = <any>{};
            if (address) {
                filter.address = address;
            }
            if (topics.length) {
                filter.topics = topics;
            }
            if (fromBlock) {
                filter.fromBlock = fromBlock;
            }
            if (toBlock) {
                filter.toBlock = toBlock;
            }
            if (blockHash) {
                filter.blockHash = blockHash;
            }
            if (shard) {
                filter.shard = shard;
            }

            return filter;
        };

        // Addresses could be async (ENS names or Addressables)
        const address: Array<string | Promise<string>> = [];
        if (filter.address) {
            if (Array.isArray(filter.address)) {
                for (const addr of filter.address) {
                    address.push(this._getAddress(addr));
                }
            } else {
                address.push(this._getAddress(filter.address));
            }
        }

        let fromBlock: undefined | string | Promise<string> = undefined;
        if ('fromBlock' in filter) {
            fromBlock = this._getBlockTag(filter.shard, filter.fromBlock);
        }

        let toBlock: undefined | string | Promise<string> = undefined;
        if ('toBlock' in filter) {
            toBlock = this._getBlockTag(filter.shard, filter.toBlock);
        }

        const shard = filter.shard;

        if (
            address.filter((a) => typeof a !== 'string').length ||
            (fromBlock != null && typeof fromBlock !== 'string') ||
            (toBlock != null && typeof toBlock !== 'string')
        ) {
            return Promise.all([Promise.all(address), fromBlock, toBlock, shard]).then((result) => {
                return resolve(result[0], result[1], result[2]);
            });
        }

        return resolve(<Array<string>>address, fromBlock, toBlock, shard);
    }

    /**
     * Returns or resovles to a transaction for `request`, resolving any ENS names or
     * {@link Addressable | **Addressable**} and returning if already a valid transaction.
     *
     * @param {PerformActionTransaction} _request - The transaction to normalize.
     *
     * @returns {PerformActionTransaction | Promise<PerformActionTransaction>} A promise that resolves to a valid
     *   transaction.
     */
    _getTransactionRequest(_request: TransactionRequest): PerformActionTransaction | Promise<PerformActionTransaction> {
        const request = <PerformActionTransaction>copyRequest(_request);

        const promises: Array<Promise<void>> = [];
        ['to', 'from', 'inputs', 'outputs'].forEach((key) => {
            if ((<any>request)[key] == null) {
                return;
            }

            const addr = Array.isArray((<any>request)[key])
                ? 'address' in <any>request[key][0]
                    ? (<TxOutput[]>(<any>request)[key]).map((it) => resolveAddress(hexlify(it.address)))
                    : (<TxInput[]>(<any>request)[key]).map((it) =>
                          resolveAddress(
                              getAddress(
                                  keccak256('0x' + SigningKey.computePublicKey(it.pub_key).substring(4)).substring(26),
                              ),
                          ),
                      )
                : resolveAddress((<any>request)[key]);
            if (isPromise(addr)) {
                if (Array.isArray(addr)) {
                    for (let i = 0; i < addr.length; i++) {
                        promises.push(
                            (async function () {
                                (<any>request)[key][i].address = await addr[i];
                            })(),
                        );
                    }
                } else {
                    promises.push(
                        (async function () {
                            (<any>request)[key] = await addr;
                        })(),
                    );
                }
            } else {
                (<any>request)[key] = addr;
            }
        });

        if (request.blockTag != null) {
            const blockTag = this._getBlockTag(request.chainId?.toString(), request.blockTag);
            if (isPromise(blockTag)) {
                promises.push(
                    (async function () {
                        request.blockTag = await blockTag;
                    })(),
                );
            } else {
                request.blockTag = blockTag;
            }
        }

        if (promises.length) {
            return (async function () {
                await Promise.all(promises);
                return request;
            })();
        }

        return request;
    }

    async getNetwork(shard: string = 'prime'): Promise<Network> {
        // No explicit network was set and this is our first time
        if (this.#networkPromise == null) {
            // Detect the current network (shared with all calls)
            const detectNetwork = (async () => {
                try {
                    const network = await this._detectNetwork(shard);
                    this.emit('network', network, null);
                    return network;
                } catch (error) {
                    if (this.#networkPromise === detectNetwork!) {
                        this.#networkPromise = null;
                    }
                    throw error;
                }
            })();

            this.#networkPromise = detectNetwork;
            return (await detectNetwork).clone();
        }

        const networkPromise = this.#networkPromise;

        const [expected, actual] = await Promise.all([
            networkPromise, // Possibly an explicit Network
            this._detectNetwork(shard), // The actual connected network
        ]);

        if (expected.chainId !== actual.chainId) {
            if (this.#anyNetwork) {
                // The "any" network can change, so notify listeners
                this.emit('network', actual, expected);

                // Update the network if something else hasn't already changed it
                if (this.#networkPromise === networkPromise) {
                    this.#networkPromise = Promise.resolve(actual);
                }
            } else {
                // Otherwise, we do not allow changes to the underlying network
                assert(false, `network changed: ${expected.chainId} => ${actual.chainId} `, 'NETWORK_ERROR', {
                    event: 'changed',
                });
            }
        }

        return expected.clone();
    }

    async getRunningLocations(shard?: string): Promise<number[][]> {
        return await this.#perform(
            shard ? { method: 'getRunningLocations', shard: shard } : { method: 'getRunningLocations' },
        );
    }

    async getProtocolTrieExpansionCount(shard: string): Promise<number> {
        return await this.#perform({ method: 'getProtocolTrieExpansionCount', shard: shard });
    }

    async getFeeData(shard?: string, txType: boolean = true): Promise<FeeData> {
        const network = await this.getNetwork();
        const getFeeDataFunc = async () => {
            const { gasPrice, priorityFee } = await resolveProperties({
                gasPrice: (async () => {
                    try {
                        const value = await this.#perform({ method: 'getGasPrice', txType, shard: shard });
                        return getBigInt(value, '%response');
                    } catch (error) {
                        console.log(error);
                    }
                    return null;
                })(),
                priorityFee: (async () => {
                    try {
                        const value = txType
                            ? await this.#perform({ method: 'getMaxPriorityFeePerGas', shard: shard })
                            : 0;
                        return getBigInt(value, '%response');
                        // eslint-disable-next-line no-empty
                    } catch (error) {}
                    return null;
                })(),
            });

            if (gasPrice == null) {
                throw new Error('could not determine gasPrice');
            }

            let maxFeePerGas: null | bigint = null;
            let maxPriorityFeePerGas: null | bigint = null;

            // These are the recommended EIP-1559 heuristics for fee data

            maxPriorityFeePerGas = priorityFee != null ? priorityFee : BigInt('1000000000');
            maxFeePerGas = gasPrice * BN_2 + maxPriorityFeePerGas;

            return new FeeData(gasPrice, maxFeePerGas, maxPriorityFeePerGas);
        };

        // Check for a FeeDataNetWorkPlugin
        const plugin = <FetchUrlFeeDataNetworkPlugin>(
            network.getPlugin('org.quais.plugins.network.FetchUrlFeeDataPlugin')
        );
        if (plugin) {
            const req = new FetchRequest(plugin.url);
            const feeData = await plugin.processFunc(getFeeDataFunc, this, req);
            return new FeeData(feeData.gasPrice, feeData.maxFeePerGas, feeData.maxPriorityFeePerGas);
        }

        return await getFeeDataFunc();
    }

    async estimateGas(_tx: TransactionRequest): Promise<bigint> {
        let tx = this._getTransactionRequest(_tx);
        if (isPromise(tx)) {
            tx = await tx;
        }
        const shard = await this.shardFromAddress(addressFromTransactionRequest(tx));
        return getBigInt(
            await this.#perform({
                method: 'estimateGas',
                transaction: tx,
                shard: shard,
            }),
            '%response',
        );
    }

    // TODO: `attempt` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async #call(tx: PerformActionTransaction, blockTag: string, attempt: number, shard?: string): Promise<string> {
        // This came in as a PerformActionTransaction, so to/from are safe; we can cast
        const transaction = <PerformActionTransaction>copyRequest(tx);
        return hexlify(await this._perform({ method: "call", transaction, blockTag, shard }));
    }

    // TODO: `shard` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async #checkNetwork<T>(promise: Promise<T>, shard?: string): Promise<T> {
        const { value } = await resolveProperties({
            network: this.getNetwork(),
            value: promise,
        });
        return value;
    }

    async call(_tx: QuaiTransactionRequest): Promise<string> {
        const shard = await this.shardFromAddress(addressFromTransactionRequest(_tx));
        const { tx, blockTag } = await resolveProperties({
            tx: this._getTransactionRequest(_tx),
            blockTag: this._getBlockTag(shard, _tx.blockTag),
        });

        return await this.#checkNetwork(this.#call(tx, blockTag, -1, shard), shard);
    }

    // Account
    async #getAccountValue(request: _PerformAccountRequest, _address: AddressLike, _blockTag?: BlockTag): Promise<any> {
        let address: string | Promise<string> = this._getAddress(_address);
        const shard = await this.shardFromAddress(_address);

        let blockTag: string | Promise<string> = this._getBlockTag(shard, _blockTag);

        if (typeof address !== 'string' || typeof blockTag !== 'string') {
            [address, blockTag] = await Promise.all([address, blockTag]);
        }

        return await this.#checkNetwork(
            this.#perform(Object.assign(request, { address, blockTag, shard: shard }) as PerformActionRequest),
            shard,
        );
    }

    async getBalance(address: AddressLike, blockTag?: BlockTag): Promise<bigint> {
        return getBigInt(await this.#getAccountValue({ method: 'getBalance' }, address, blockTag), '%response');
    }

    async getOutpointsByAddress(address: AddressLike): Promise<Outpoint[]> {
        return await this.#getAccountValue({ method: 'getOutpointsByAddress' }, address, 'latest');
    }

    async getTransactionCount(address: AddressLike, blockTag?: BlockTag): Promise<number> {
        return getNumber(
            await this.#getAccountValue({ method: 'getTransactionCount' }, address, blockTag),
            '%response',
        );
    }

    async getCode(address: AddressLike, blockTag?: BlockTag): Promise<string> {
        return hexlify(await this.#getAccountValue({ method: 'getCode' }, address, blockTag));
    }

    async getStorage(address: AddressLike, _position: BigNumberish, blockTag?: BlockTag): Promise<string> {
        const position = getBigInt(_position, 'position');
        return hexlify(await this.#getAccountValue({ method: 'getStorage', position }, address, blockTag));
    }

    async getPendingHeader(): Promise<WorkObjectLike> {
        return await this.#perform({ method: 'getPendingHeader' });
    }

    // Write
    async broadcastTransaction(shard: string, signedTx: string): Promise<TransactionResponse> {
        const type = decodeProtoTransaction(getBytes(signedTx)).type;
        const { blockNumber, hash, network } = await resolveProperties({
            blockNumber: this.getBlockNumber(shard),
            hash: this._perform({
                method: 'broadcastTransaction',
                signedTransaction: signedTx,
                shard: shard,
            }),
            network: this.getNetwork(),
        });

        const tx = type == 2 ? QiTransaction.from(signedTx) : QuaiTransaction.from(signedTx);

        this.#validateTransactionHash(tx.hash || '', hash);
        return this._wrapTransactionResponse(<any>tx, network).replaceableTransaction(blockNumber);
    }

    #validateTransactionHash(computedHash: string, nodehash: string) {
        if (computedHash !== nodehash) {
            throw new Error('Transaction hash mismatch');
        }
    }

    async #getBlock(shard: string, block: BlockTag | string, includeTransactions: boolean): Promise<any> {
        // @TODO: Add CustomBlockPlugin check
        if (isHexString(block, 32)) {
            return await this.#perform({
                method: 'getBlock',
                blockHash: block,
                includeTransactions,
                shard: shard,
            });
        }

        let blockTag = this._getBlockTag(shard, block);
        if (typeof blockTag !== 'string') {
            blockTag = await blockTag;
        }

        return await this.#perform({
            method: 'getBlock',
            blockTag,
            includeTransactions,
            shard: shard,
        });
    }

    // Queries
    async getBlock(shard: string, block: BlockTag | string, prefetchTxs?: boolean): Promise<null | Block> {
        const { network, params } = await resolveProperties({
            network: this.getNetwork(),
            params: this.#getBlock(shard, block, !!prefetchTxs),
        });
        if (params == null) {
            return null;
        }
        return this._wrapBlock(params, network);
    }

    async getTransaction(hash: string): Promise<null | TransactionResponse> {
        const shard = this.shardFromHash(hash);
        const { network, params } = await resolveProperties({
            network: this.getNetwork(),
            params: this.#perform({ method: 'getTransaction', hash, shard: shard }),
        });
        if (params == null) {
            return null;
        }

        return this._wrapTransactionResponse(params, network);
    }

    async getTransactionReceipt(hash: string): Promise<null | TransactionReceipt> {
        const shard = this.shardFromHash(hash);
        const { network, params } = await resolveProperties({
            network: this.getNetwork(),
            params: this.#perform({ method: 'getTransactionReceipt', hash, shard: shard }),
        });
        if (params == null) {
            return null;
        }
        // Some backends did not backfill the effectiveGasPrice in to old transactions
        // in the receipt, so we look it up manually and inject it.
        if (params.gasPrice == null && params.effectiveGasPrice == null) {
            const tx = await this.#perform({ method: 'getTransaction', hash, shard: shard });
            if (tx == null) {
                throw new Error('report this; could not find tx or effectiveGasPrice');
            }
            params.effectiveGasPrice = tx.gasPrice;
        }

        return this._wrapTransactionReceipt(params, network);
    }

    async getTransactionResult(hash: string): Promise<null | string> {
        const shard = this.shardFromHash(hash);
        const { result } = await resolveProperties({
            network: this.getNetwork(),
            result: this.#perform({ method: 'getTransactionResult', hash, shard: shard }),
        });
        if (result == null) {
            return null;
        }
        return hexlify(result);
    }

    // Bloom-filter Queries
    async getLogs(_filter: Filter | FilterByBlockHash): Promise<Array<Log>> {
        let filter = this._getFilter(_filter);
        if (isPromise(filter)) {
            filter = await filter;
        }
        const shard = filter.shard;

        const { network, params } = await resolveProperties({
            network: this.getNetwork(),
            params: this.#perform<Array<LogParams>>({ method: 'getLogs', filter, shard: shard }),
        });

        return params.map((p) => this._wrapLog(p, network));
    }

    // TODO: unsupported, remove?
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _getProvider(chainId: number): AbstractProvider {
        assert(false, 'provider cannot connect to target network', 'UNSUPPORTED_OPERATION', {
            operation: '_getProvider()',
        });
    }

    async waitForTransaction(
        hash: string,
        _confirms?: null | number,
        timeout?: null | number,
    ): Promise<null | TransactionReceipt> {
        const shard = this.shardFromHash(hash);
        const confirms = _confirms != null ? _confirms : 1;
        if (confirms === 0) {
            return this.getTransactionReceipt(hash);
        }

        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            let timer: null | Timer = null;

            const listener = async (blockNumber: number) => {
                try {
                    const receipt = await this.getTransactionReceipt(hash);
                    if (receipt != null) {
                        if (blockNumber - receipt.blockNumber + 1 >= confirms) {
                            resolve(receipt);
                            //this.off("block", listener);
                            if (timer) {
                                clearTimeout(timer);
                                timer = null;
                            }
                            return;
                        }
                    }
                } catch (error) {
                    console.log('Error occured while waiting for transaction:', error);
                }
                this.once('block', listener);
            };

            if (timeout != null) {
                timer = setTimeout(() => {
                    if (timer == null) {
                        return;
                    }
                    timer = null;
                    this.off('block', listener);
                    reject(makeError('timeout', 'TIMEOUT', { reason: 'timeout' }));
                }, timeout);
            }

            listener(await this.getBlockNumber(shard));
        });
    }

    // TODO: not implemented yet
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async waitForBlock(shard: string, blockTag?: BlockTag): Promise<Block> {
        assert(false, 'not implemented yet', 'NOT_IMPLEMENTED', {
            operation: 'waitForBlock',
        });
    }

    /**
     * Clear a timer created using the {@link AbstractProvider._setTimeout | **_setTimeout**} method.
     *
     * @param {number} timerId - The ID of the timer to clear.
     */
    _clearTimeout(timerId: number): void {
        const timer = this.#timers.get(timerId);
        if (!timer) {
            return;
        }
        if (timer.timer) {
            clearTimeout(timer.timer);
        }
        this.#timers.delete(timerId);
    }

    /**
     * Create a timer that will execute `func` after at least `timeout` (in ms). If `timeout` is unspecified, then
     * `func` will execute in the next event loop.
     *
     * {@link AbstractProvider.pause | **Pausing**} the provider will pause any associated timers.
     *
     * @param {() => void} _func - The function to execute.
     * @param {number} [timeout] - The time to wait before executing `func`.
     *
     * @returns {number} The ID of the timer.
     */
    _setTimeout(_func: () => void, timeout?: number): number {
        if (timeout == null) {
            timeout = 0;
        }
        const timerId = this.#nextTimer++;
        const func = () => {
            this.#timers.delete(timerId);
            _func();
        };

        if (this.paused) {
            this.#timers.set(timerId, { timer: null, func, time: timeout });
        } else {
            const timer = setTimeout(func, timeout);
            this.#timers.set(timerId, { timer, func, time: getTime() });
        }

        return timerId;
    }

    /**
     * Perform `func` on each subscriber.
     *
     * @param {(s: Subscriber) => void} func - The function to perform.
     */
    _forEachSubscriber(func: (s: Subscriber) => void): void {
        for (const sub of this.#subs.values()) {
            func(sub.subscriber);
        }
    }

    /**
     * Sub-classes may override this to customize subscription implementations.
     *
     * @param {Subscription} sub - The subscription to get the subscriber for.
     */
    _getSubscriber(sub: Subscription): Subscriber {
        switch (sub.type) {
            case 'debug':
            case 'error':
            case 'network':
                return new UnmanagedSubscriber(sub.type);
        }

        throw new Error('HTTP polling not supported. This method should be implemented by subclasses.');
    }

    /**
     * If a {@link Subscriber | **Subscriber**} fails and needs to replace itself, this method may be used.
     *
     * For example, this is used for providers when using the `quai_getFilterChanges` method, which can return null if
     * state filters are not supported by the backend, allowing the Subscriber to swap in a `PollingEventSubscriber`.
     *
     * @param {Subscriber} oldSub - The subscriber to replace.
     * @param {Subscriber} newSub - The new subscriber.
     * @todo PollingEventSubscriber is not longer exported, replace this link or
     */
    _recoverSubscriber(oldSub: Subscriber, newSub: Subscriber): void {
        for (const sub of this.#subs.values()) {
            if (sub.subscriber === oldSub) {
                if (sub.started) {
                    sub.subscriber.stop();
                }
                sub.subscriber = newSub;
                if (sub.started) {
                    newSub.start();
                }
                if (this.#pausedState != null) {
                    newSub.pause(this.#pausedState);
                }
                break;
            }
        }
    }

    async #hasSub(event: ProviderEvent, emitArgs?: Array<any>): Promise<null | Sub> {
        let sub = await getSubscription(event, this);
        // This is a log that is removing an existing log; we actually want
        // to emit an orphan event for the removed log
        if (sub.type === 'event' && emitArgs && emitArgs.length > 0 && emitArgs[0].removed === true) {
            sub = await getSubscription({ orphan: 'drop-log', log: emitArgs[0] }, this);
        }
        return this.#subs.get(sub.tag) || null;
    }

    async #getSub(event: ProviderEvent): Promise<Sub> {
        const subscription = await getSubscription(event, this);

        // Prevent tampering with our tag in any subclass' _getSubscriber
        const tag = subscription.tag;

        let sub = this.#subs.get(tag);
        if (!sub) {
            const subscriber = this._getSubscriber(subscription);

            const addressableMap = new WeakMap();
            const nameMap = new Map();
            sub = { subscriber, tag, addressableMap, nameMap, started: false, listeners: [] };
            this.#subs.set(tag, sub);
        }

        return sub;
    }

    async on(event: ProviderEvent, listener: Listener): Promise<this> {
        const sub = await this.#getSub(event);
        sub.listeners.push({ listener, once: false });
        if (!sub.started) {
            sub.subscriber.start();
            sub.started = true;
            if (this.#pausedState != null) {
                sub.subscriber.pause(this.#pausedState);
            }
        }
        return this;
    }

    async once(event: ProviderEvent, listener: Listener): Promise<this> {
        const sub = await this.#getSub(event);
        sub.listeners.push({ listener, once: true });
        if (!sub.started) {
            sub.subscriber.start();
            sub.started = true;
            if (this.#pausedState != null) {
                sub.subscriber.pause(this.#pausedState);
            }
        }
        return this;
    }

    async emit(event: ProviderEvent, ...args: Array<any>): Promise<boolean> {
        const sub = await this.#hasSub(event, args);
        // If there is not subscription or if a recent emit removed
        // the last of them (which also deleted the sub) do nothing
        if (!sub || sub.listeners.length === 0) {
            return false;
        }

        const count = sub.listeners.length;
        sub.listeners = sub.listeners.filter(({ listener, once }) => {
            const payload = new EventPayload(this, once ? null : listener, event);
            try {
                listener.call(this, ...args, payload);
                // eslint-disable-next-line no-empty
            } catch (error) {}
            return !once;
        });

        if (sub.listeners.length === 0) {
            if (sub.started) {
                sub.subscriber.stop();
            }
            this.#subs.delete(sub.tag);
        }

        return count > 0;
    }

    async listenerCount(event?: ProviderEvent): Promise<number> {
        if (event) {
            const sub = await this.#hasSub(event);
            if (!sub) {
                return 0;
            }
            return sub.listeners.length;
        }

        let total = 0;
        for (const { listeners } of this.#subs.values()) {
            total += listeners.length;
        }
        return total;
    }

    async listeners(event?: ProviderEvent): Promise<Array<Listener>> {
        if (event) {
            const sub = await this.#hasSub(event);
            if (!sub) {
                return [];
            }
            return sub.listeners.map(({ listener }) => listener);
        }
        let result: Array<Listener> = [];
        for (const { listeners } of this.#subs.values()) {
            result = result.concat(listeners.map(({ listener }) => listener));
        }
        return result;
    }

    async off(event: ProviderEvent, listener?: Listener): Promise<this> {
        const sub = await this.#hasSub(event);
        if (!sub) {
            return this;
        }

        if (listener) {
            const index = sub.listeners.map(({ listener }) => listener).indexOf(listener);
            if (index >= 0) {
                sub.listeners.splice(index, 1);
            }
        }

        if (!listener || sub.listeners.length === 0) {
            if (sub.started) {
                sub.subscriber.stop();
            }
            this.#subs.delete(sub.tag);
        }

        return this;
    }

    async removeAllListeners(event?: ProviderEvent): Promise<this> {
        if (event) {
            const { tag, started, subscriber } = await this.#getSub(event);
            if (started) {
                subscriber.stop();
            }
            this.#subs.delete(tag);
        } else {
            for (const [tag, { started, subscriber }] of this.#subs) {
                if (started) {
                    subscriber.stop();
                }
                this.#subs.delete(tag);
            }
        }
        return this;
    }

    // Alias for "on"
    async addListener(event: ProviderEvent, listener: Listener): Promise<this> {
        return await this.on(event, listener);
    }

    // Alias for "off"
    async removeListener(event: ProviderEvent, listener: Listener): Promise<this> {
        return this.off(event, listener);
    }

    /**
     * If this provider has been destroyed using the {@link AbstractProvider.destroy | **destroy**} method.
     *
     * Once destroyed, all resources are reclaimed, internal event loops and timers are cleaned up and no further
     * requests may be sent to the provider.
     */
    get destroyed(): boolean {
        return this.#destroyed;
    }

    /**
     * Sub-classes may use this to shutdown any sockets or release their resources and reject any pending requests.
     *
     * Sub-classes **must** call `super.destroy()`.
     */
    destroy(): void {
        // Stop all listeners
        this.removeAllListeners();

        // Shut down all tiemrs
        for (const timerId of this.#timers.keys()) {
            this._clearTimeout(timerId);
        }

        this.#destroyed = true;
    }

    /**
     * Whether the provider is currently paused.
     *
     * A paused provider will not emit any events, and generally should not make any requests to the network, but that
     * is up to sub-classes to manage.
     *
     * Setting `paused = true` is identical to calling `.pause(false)`, which will buffer any events that occur while
     * paused until the provider is unpaused.
     *
     * @returns {boolean} Whether the provider is paused.
     */
    get paused(): boolean {
        return this.#pausedState != null;
    }
    set paused(pause: boolean) {
        if (!!pause === this.paused) {
            return;
        }

        if (this.paused) {
            this.resume();
        } else {
            this.pause(false);
        }
    }

    /**
     * Pause the provider. If `dropWhilePaused`, any events that occur while paused are dropped, otherwise all events
     * will be emitted once the provider is unpaused.
     *
     * @param {boolean} [dropWhilePaused] - Whether to drop events while paused.
     */
    pause(dropWhilePaused?: boolean): void {
        this.#lastBlockNumber = -1;

        if (this.#pausedState != null) {
            if (this.#pausedState == !!dropWhilePaused) {
                return;
            }
            assert(false, 'cannot change pause type; resume first', 'UNSUPPORTED_OPERATION', {
                operation: 'pause',
            });
        }

        this._forEachSubscriber((s) => s.pause(dropWhilePaused));
        this.#pausedState = !!dropWhilePaused;

        for (const timer of this.#timers.values()) {
            // Clear the timer
            if (timer.timer) {
                clearTimeout(timer.timer);
            }

            // Remaining time needed for when we become unpaused
            timer.time = getTime() - timer.time;
        }
    }

    /**
     * Resume the provider.
     */
    resume(): void {
        if (this.#pausedState == null) {
            return;
        }

        this._forEachSubscriber((s) => s.resume());
        this.#pausedState = null;
        for (const timer of this.#timers.values()) {
            // Remaining time when we were paused
            let timeout = timer.time;
            if (timeout < 0) {
                timeout = 0;
            }

            // Start time (in cause paused, so we con compute remaininf time)
            timer.time = getTime();

            // Start the timer
            setTimeout(timer.func, timeout);
        }
    }
}
