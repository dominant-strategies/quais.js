/**
 * The available providers should suffice for most developers purposes, but the
 * {@link AbstractProvider | **AbstractProvider**} class has many features which enable sub-classing it for specific
 * purposes.
 */

/**
 * Event coalescence When we register an event with an async value (e.g. address is a Signer), we need to add it
 * immediately for the Event API, but also need time to resolve the address. Upon resolving the address, we need to
 * migrate the listener to the static event. We also need to maintain a map of Signer to address so we can sync respond
 * to listenerCount.
 */

import { computeAddress, resolveAddress, formatMixedCaseChecksumAddress, isQiAddress } from '../address/index.js';
import { Shard, toShard, toZone, Zone } from '../constants/index.js';
import { TxInput, TxOutput } from '../transaction/index.js';
import { Outpoint, OutpointDeltas, TxInputJson, TxOutputJson } from '../transaction/utxo.js';
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
} from '../utils/index.js';
import { decodeProtoTransaction } from '../encoding/index.js';
import type { txpoolContentResponse, txpoolInspectResponse } from './txpool.js';

import {
    formatBlock,
    formatLog,
    formatOutpointDeltas,
    formatOutpoints,
    formatTransactionReceipt,
    formatTransactionResponse,
} from './format.js';
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
    AccessesFilter,
    ExternalTransactionResponse,
} from './provider.js';

import type { Addressable, AddressLike } from '../address/index.js';
import type { BigNumberish } from '../utils/index.js';
import type { Listener } from '../utils/index.js';

import type { Networkish } from './network.js';
import type {
    BlockParams,
    ExternalTransactionResponseParams,
    LogParams,
    OutpointDeltaResponseParams,
    QiTransactionResponseParams,
    TransactionReceiptParams,
} from './formatting.js';

import type {
    BlockTag,
    EventFilter,
    Filter,
    FilterByBlockHash,
    NodeLocation,
    OrphanFilter,
    Provider,
    ProviderEvent,
    TransactionRequest,
} from './provider.js';
import { WorkObjectLike } from '../transaction/work-object.js';
import { QiTransaction, QuaiTransaction } from '../transaction/index.js';
import { QuaiTransactionResponseParams } from './formatting.js';

import {
    PollingBlockSubscriber,
    PollingEventSubscriber,
    PollingOrphanSubscriber,
    PollingTransactionSubscriber,
    PollingQiTransactionSubscriber,
} from './subscriber-polling.js';
import { getNodeLocationFromZone, getZoneFromNodeLocation } from '../utils/shards.js';
import { fromShard } from '../constants/shards.js';
import { AccessList } from '../transaction/index.js';

type Timer = ReturnType<typeof setTimeout>;

/**
 * Check if a value is a Promise.
 *
 * @param {any} value - The value to check.
 * @returns {boolean} True if the value is a Promise, false otherwise.
 */
function isPromise<T = any>(value: any): value is Promise<T> {
    return value && typeof value.then === 'function';
}

/**
 * Get a tag string based on a prefix and value.
 *
 * @param {string} prefix - The prefix for the tag.
 * @param {any} value - The value to include in the tag.
 * @returns {string} The generated tag.
 */
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
 * The value passed to the {@link AbstractProvider._getSubscriber | **AbstractProvider._getSubscriber**} method.
 *
 * Only developers sub-classing {@link AbstractProvider | **AbstractProvider**} will care about this, if they are
 * modifying a low-level feature of how subscriptions operate.
 *
 * @category Providers
 */
export type Subscription =
    | {
          type: 'close' | 'debug' | 'error' | 'finalized' | 'network' | 'safe';
          tag: string;
          zone?: Zone;
      }
    | {
          type: 'block' | 'pending';
          tag: string;
          zone: Zone;
      }
    | {
          type: 'transaction';
          tag: string;
          hash: string;
          zone: Zone;
      }
    | {
          type: 'accesses';
          tag: string;
          filter: AccessesFilter;
          zone: Zone;
      }
    | {
          type: 'qiTransaction';
          tag: string;
          hash: string;
          zone: Zone;
      }
    | {
          type: 'event';
          tag: string;
          filter: EventFilter;
          zone: Zone;
      }
    | {
          type: 'orphan';
          tag: string;
          filter: OrphanFilter;
          zone: Zone;
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
     * The name of the event.
     */
    name!: string;

    /**
     * Create a new UnmanagedSubscriber with `name`.
     *
     * @param {string} name - The name of the event.
     */
    constructor(name: string) {
        defineProperties<UnmanagedSubscriber>(this, { name });
    }

    start(): void {}
    stop(): void {}

    // todo `dropWhilePaused` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    pause(dropWhilePaused?: boolean): void {}
    resume(): void {}
}

type Sub = {
    tag: string;
    nameMap: Map<string, string>;
    addressableMap: WeakMap<Addressable, string>;
    listeners: Array<{ listener: Listener; once: boolean }>;
    // @todo get rid of this, as it is (and has to be)
    // tracked in subscriber
    started: boolean;
    subscriber: Subscriber;
    zone: Zone;
};

/**
 * Create a deep copy of a value.
 *
 * @param {T} value - The value to copy.
 * @returns {T} The copied value.
 */
function copy<T = any>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

/**
 * Remove duplicates and sort an array of strings.
 *
 * @param {string[]} items - The array of strings.
 * @returns {string[]} The concisified array.
 */
function concisify(items: Array<string>): Array<string> {
    items = Array.from(new Set(items).values());
    items.sort();
    return items;
}

// todo `provider` is not used, remove or re-write
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getSubscription(_event: ProviderEvent, zone?: Zone): Promise<Subscription> {
    if (_event == null) {
        throw new Error('invalid event');
    }

    // Normalize topic array info an EventFilter
    if (Array.isArray(_event)) {
        _event = { topics: _event };
    }

    if (typeof _event === 'string') {
        if (_event === 'debug') {
            return { type: _event, tag: _event };
        }
        switch (_event) {
            case 'block':
            case 'pending':
                if (!zone) {
                    throw new Error('zone is required for block and pending events');
                }
                return { type: 'block', tag: _event, zone };
            case 'error':
            case 'finalized':
            case 'network':
            case 'safe': {
                return { type: _event, tag: _event };
            }
        }
    }

    if (isHexString(_event, 32)) {
        const eventBytes = getBytes(_event);
        const ninthBit = (eventBytes[1] & 0x80) === 0x80;

        const hash = _event.toLowerCase();
        zone = toZone(hash.slice(0, 4));
        if (ninthBit) {
            return { type: 'qiTransaction', tag: getTag('Tx', { hash }), hash, zone };
        } else {
            return { type: 'transaction', tag: getTag('tx', { hash }), hash, zone };
        }
    }

    if ((<any>_event).orphan) {
        const event = <OrphanFilter>_event;
        if (!zone) {
            const hash =
                (<{ hash: string }>event).hash ||
                (<{ tx: { hash: string } }>event).tx.hash ||
                (<{ other: { hash: string } }>event).other?.hash ||
                (<{ log: { transactionHash: string } }>event).log.transactionHash ||
                null;
            if (hash == null) {
                throw new Error('orphan event must specify a hash');
            }
            zone = toZone(hash.slice(0, 4));
        }

        // @todo Should lowercase and whatnot things here instead of copy...
        return { type: 'orphan', tag: getTag('orphan', event), filter: copy(event), zone };
    }

    if ((<any>_event).type && (<any>_event).address) {
        const address = formatMixedCaseChecksumAddress(
            isHexString((<any>_event).address) ? (<any>_event).address : await resolveAddress((<any>_event).address),
        );
        const filter = <AccessesFilter>{
            type: (<any>_event).type,
            address: address,
        };
        if (!zone) {
            zone = toZone(address.slice(0, 4));
        }
        return { filter, tag: getTag('accesses', filter), type: 'accesses', zone };
    } else if ((<any>_event).topics || (<any>_event).address) {
        const event = <EventFilter>_event;

        const filter: EventFilter = {
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
        if (event.nodeLocation) {
            filter.nodeLocation = event.nodeLocation;
        }
        if (event.address) {
            const addresses: Array<string> = [];
            const promises: Array<Promise<void>> = [];

            const addAddress = (addr: AddressLike) => {
                if (isHexString(addr)) {
                    addresses.push(formatMixedCaseChecksumAddress(addr));
                } else {
                    promises.push(
                        (async () => {
                            addresses.push(formatMixedCaseChecksumAddress(await resolveAddress(addr)));
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
            if (!zone) {
                zone = toZone(addresses[0].slice(0, 4));
            }
            filter.address = concisify(addresses.map((a) => a.toLowerCase()));

            if (!filter.nodeLocation) {
                filter.nodeLocation = getNodeLocationFromZone(zone);
            }
        } else {
            if (!zone) {
                throw new Error('zone is required for event');
            }
        }

        return { filter, tag: getTag('event', filter), type: 'event', zone };
    }

    assertArgument(false, 'unknown ProviderEvent', 'event', _event);
}

/**
 * Get the current time in milliseconds.
 *
 * @returns {number} The current time in milliseconds.
 */
function getTime(): number {
    return new Date().getTime();
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
          nodeLocation: NodeLocation;
      }
    | {
          address?: string | Array<string>;
          topics?: Array<null | string | Array<string>>;
          blockHash?: string;
          nodeLocation: NodeLocation;
      };

/**
 * A normalized transactions used for {@link PerformActionRequest | **PerformActionRequest**} objects.
 *
 * @category Providers
 */
export type PerformActionTransaction = QuaiPerformActionTransaction | QiPerformActionTransaction;

/**
 * @category Providers
 */
// todo: write docs for this
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
 */
// todo: write docs for this
export interface QiPerformActionTransaction extends QiPreparedTransactionRequest {
    /**
     * The transaction type. Always 2 for UTXO transactions.
     */
    txType: number;

    /**
     * The `inputs` of the UTXO transaction.
     */
    txIn: Array<TxInputJson>;

    /**
     * The `outputs` of the UTXO transaction.
     */
    txOut: Array<TxOutputJson>;

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
          zone: Zone;
      }
    | {
          method: 'call';
          transaction: PerformActionTransaction;
          blockTag: BlockTag;
          zone?: Zone;
      }
    | {
          method: 'chainId';
          zone?: Zone;
      }
    | {
          method: 'estimateGas';
          transaction: PerformActionTransaction;
          zone?: Zone;
      }
    | {
          method: 'estimateFeeForQi';
          transaction: QiPerformActionTransaction;
          zone?: Zone;
      }
    | {
          method: 'createAccessList';
          transaction: PerformActionTransaction;
          zone?: Zone;
      }
    | {
          method: 'getBalance';
          address: string;
          blockTag: BlockTag;
          zone: Zone;
      }
    | {
          method: 'getLockedBalance';
          address: string;
          zone: Zone;
      }
    | {
          method: 'getOutpointsByAddress';
          address: string;
          zone: Zone;
      }
    | {
          method: 'getBlock';
          blockTag: BlockTag;
          includeTransactions: boolean;
          shard: Shard;
      }
    | {
          method: 'getBlock';
          blockHash: string;
          includeTransactions: boolean;
          shard: Shard;
      }
    | {
          method: 'getBlockNumber';
          shard?: Shard;
      }
    | {
          method: 'getCode';
          address: string;
          blockTag: BlockTag;
          zone: Zone;
      }
    | {
          method: 'getGasPrice';
          txType: boolean;
          zone?: Zone;
      }
    | {
          method: 'getLogs';
          filter: PerformActionFilter;
          zone: Zone;
      }
    | {
          method: 'getMinerTip';
          zone?: Zone;
      }
    | {
          method: 'getStorage';
          address: string;
          position: bigint;
          blockTag: BlockTag;
          zone: Zone;
      }
    | {
          method: 'getTransaction';
          hash: string;
          zone: Zone;
      }
    | {
          method: 'getTransactionCount';
          address: string;
          blockTag: BlockTag;
          zone: Zone;
      }
    | {
          method: 'getTransactionReceipt';
          hash: string;
          zone: Zone;
      }
    | {
          method: 'getTransactionResult';
          hash: string;
          zone: Zone;
      }
    | {
          method: 'getRunningLocations';
          shard?: Shard;
          now: boolean;
      }
    | {
          method: 'getProtocolTrieExpansionCount';
          shard: Shard;
      }
    | {
          method: 'getQiRateAtBlock';
          blockTag: BlockTag;
          amt: string;
          zone: Zone;
      }
    | {
          method: 'getQuaiRateAtBlock';
          blockTag: BlockTag;
          amt: string;
          zone: Zone;
      }
    | {
          method: 'getProtocolExpansionNumber';
      }
    | {
          method: 'getPendingHeader';
      }
    | {
          method: 'getTxPoolContent';
          zone: Zone;
      }
    | {
          method: 'txPoolInspect';
          zone: Zone;
      }
    | {
          method: 'getOutpointDeltasForAddressesInRange';
          addresses: string[];
          startHash: string;
          endHash: string;
          zone: Zone;
      };

type _PerformAccountRequest =
    | {
          method: 'getBalance' | 'getLockedBalance' | 'getTransactionCount' | 'getCode' | 'getOutpointsByAddress';
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
    usePathing?: boolean;
};

const defaultOptions = {
    cacheTimeout: 250,
    pollingInterval: 4000,
    usePathing: true,
};

/**
 * An **AbstractProvider** provides a base class for other sub-classes to implement the {@link Provider | **Provider**}
 * API by normalizing input arguments and formatting output results as well as tracking events for consistent behaviour
 * on an eventually-consistent network.
 *
 * @category Providers
 */
export class AbstractProvider<C = FetchRequest> implements Provider {
    /**
     * @ignore
     */
    _urlMap: Map<Shard, C>;

    #connect: FetchRequest[];
    #subs: Map<string, Sub>;

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

    #options: Required<AbstractProviderOptions>;

    _initFailed: boolean;

    initResolvePromise: null | ((value: void) => void);
    initRejectPromise: null | ((reason?: any) => void);
    initPromise: Promise<void>;
    attemptConnect: boolean;

    /**
     * Create a new **AbstractProvider** connected to `network`, or use the various network detection capabilities to
     * discover the {@link Network | **Network**} if necessary.
     *
     * @param _network - The network to connect to, or `"any"` to
     * @param options - The options to configure the provider.
     */
    constructor(_network?: 'any' | Networkish, options?: AbstractProviderOptions) {
        this._initFailed = false;
        this.attemptConnect = true;
        this.#options = Object.assign({}, defaultOptions, options || {});

        if (_network === 'any') {
            this.#anyNetwork = true;
            this.#networkPromise = null;
        } else if (_network) {
            const network = Network.from(_network);
            this.#anyNetwork = false;
            this.#networkPromise = Promise.resolve(network);
            setTimeout(() => {
                this.emit('network', undefined, network, null);
            }, 0);
        } else {
            this.#anyNetwork = false;
            this.#networkPromise = null;
        }

        this.#lastBlockNumber = -1;

        this.#performCache = new Map();

        this.#subs = new Map();
        this.#pausedState = null;

        this.#destroyed = false;

        this.#nextTimer = 1;
        this.#timers = new Map();

        this.#connect = [];
        this._urlMap = new Map();
        this.initResolvePromise = null;
        this.initRejectPromise = null;
        this.initPromise = new Promise((resolve, reject) => {
            this.initResolvePromise = resolve;
            this.initRejectPromise = reject;
        });
    }

    /**
     * Initialize the URL map with the provided URLs.
     *
     * @param {U} urls - The URLs to initialize the map with.
     * @returns {Promise<void>} A promise that resolves when the map is initialized.
     */
    async initialize<U = string[] | FetchRequest>(urls: U): Promise<void> {
        this.initPromise = new Promise((resolve, reject) => {
            this.initResolvePromise = resolve;
            this.initRejectPromise = reject;
        });
        try {
            const primeSuffix = this.#options.usePathing ? `/${fromShard(Shard.Prime, 'nickname')}` : ':9001';
            if (urls instanceof FetchRequest) {
                urls.url = urls.url.split(':')[0] + ':' + urls.url.split(':')[1] + primeSuffix;
                this._urlMap.set(Shard.Prime, urls as C);
                this.#connect.push(urls);
                const shards = await this._waitGetRunningLocations(Shard.Prime, true);
                shards.forEach((shard) => {
                    const port = 9200 + 20 * shard[0] + shard[1];
                    const shardEnum = toShard(`0x${shard[0].toString(16)}${shard[1].toString(16)}`);
                    const shardSuffix = this.#options.usePathing ? `/${fromShard(shardEnum, 'nickname')}` : `:${port}`;
                    this._urlMap.set(
                        shardEnum,
                        new FetchRequest(urls.url.split(':')[0] + ':' + urls.url.split(':')[1] + shardSuffix) as C,
                    );
                });
                return;
            }
            if (Array.isArray(urls)) {
                for (const url of urls) {
                    const primeUrl = url.split(':')[0] + ':' + url.split(':')[1] + primeSuffix;
                    const primeConnect = new FetchRequest(primeUrl);
                    this._urlMap.set(Shard.Prime, primeConnect as C);
                    this.#connect.push(primeConnect);
                    const shards = await this._waitGetRunningLocations(Shard.Prime, true);
                    shards.forEach((shard) => {
                        const port = 9200 + 20 * shard[0] + shard[1];
                        const shardEnum = toShard(`0x${shard[0].toString(16)}${shard[1].toString(16)}`);
                        const shardSuffix = this.#options.usePathing
                            ? `/${fromShard(shardEnum, 'nickname')}`
                            : `:${port}`;
                        this._urlMap.set(
                            toShard(`0x${shard[0].toString(16)}${shard[1].toString(16)}`),
                            new FetchRequest(url.split(':')[0] + ':' + url.split(':')[1] + shardSuffix) as C,
                        );
                    });
                }
            }
            if (this.initResolvePromise) this.initResolvePromise();
        } catch (error) {
            this._initFailed = true;
            console.log('Error initializing URL map:', error);
            if (this.initRejectPromise) this.initRejectPromise(error);
        }
    }

    /**
     * Get the list of connected FetchRequests.
     *
     * @returns {FetchRequest[]} The list of connected FetchRequests.
     */
    get connect(): FetchRequest[] {
        return this.#connect;
    }

    /**
     * Get the zone from an address.
     *
     * @param {AddressLike} _address - The address to get the zone from.
     * @returns {Promise<Zone>} A promise that resolves to the zone.
     */
    async zoneFromAddress(_address: AddressLike): Promise<Zone> {
        const address: string | Promise<string> = this._getAddress(_address);
        return toZone((await address).slice(0, 4));
    }

    /**
     * Get the shard from a hash.
     *
     * @param {string} hash - The hash to get the shard from.
     * @returns {Shard} The shard.
     */
    shardFromHash(hash: string): Shard {
        return toShard(hash.slice(0, 4));
    }

    /**
     * Get the zone from a hash.
     *
     * @param {string} hash - The hash to get the zone from.
     * @returns {Zone} The zone.
     */
    zoneFromHash(hash: string): Zone {
        return toZone(hash.slice(0, 4));
    }

    /**
     * Get the latest Quai rate for a zone.
     *
     * @param {Zone} zone - The zone to get the rate for.
     * @param {number} [amt=1] - The amount in quais to get the rate for. Default is `1`
     * @returns {Promise<bigint>} A promise that resolves to the latest Quai -> Qi rate for the given amount.
     */
    async getLatestQuaiRate(zone: Zone, amt: bigint): Promise<bigint> {
        const blockNumber = await this.getBlockNumber(toShard(zone));
        return this.getQuaiRateAtBlock(zone, blockNumber, amt);
    }

    /**
     * Get the Quai rate at a specific block.
     *
     * @param {Zone} zone - The zone to get the rate for.
     * @param {BlockTag} blockTag - The block tag to get the rate at.
     * @param {number} [amt=1] - The amount to get the rate for. Default is `1`
     * @returns {Promise<bigint>} A promise that resolves to the Quai rate at the specified block.
     */
    async getQuaiRateAtBlock(zone: Zone, blockTag: BlockTag, amt: bigint): Promise<bigint> {
        let resolvedBlockTag = this._getBlockTag(toShard(zone), blockTag);
        if (typeof resolvedBlockTag !== 'string') {
            resolvedBlockTag = await resolvedBlockTag;
        }
        return getBigInt(
            await this.#perform({
                method: 'getQuaiRateAtBlock',
                blockTag: resolvedBlockTag,
                amt: toQuantity(String(amt)),
                zone: zone,
            }),
        );
    }

    /**
     * Get the protocol expansion number.
     *
     * @returns {Promise<number>} A promise that resolves to the protocol expansion number.
     */
    async getProtocolExpansionNumber(): Promise<number> {
        return getNumber(await this.#perform({ method: 'getProtocolExpansionNumber' }));
    }

    /**
     * Get the active region shards based on the protocol expansion number.
     *
     * @returns {Promise<Shard[]>} A promise that resolves to the active shards.
     */
    async getActiveRegions(): Promise<Shard[]> {
        const protocolExpansionNumber = await this.getProtocolExpansionNumber();
        const shards = [Shard.Cyprus];
        if (protocolExpansionNumber >= 1) {
            shards.push(Shard.Paxos);
        }
        if (protocolExpansionNumber >= 3) {
            shards.push(Shard.Hydra);
        }
        return shards.sort((a: Shard, b: Shard) => a.localeCompare(b));
    }

    /**
     * Get the active zones for a shard based on the protocol expansion number.
     *
     * @returns {Promise<Zone[]>} A promise that resolves to the active zones.
     */
    async getActiveZones(): Promise<Zone[]> {
        const protocolExpansionNumber = await this.getProtocolExpansionNumber();
        const zones = [Zone.Cyprus1];
        if (protocolExpansionNumber >= 1) {
            zones.push(Zone.Cyprus2);
        }
        if (protocolExpansionNumber >= 2) {
            zones.push(Zone.Paxos1, Zone.Paxos2);
        }
        if (protocolExpansionNumber >= 3) {
            zones.push(Zone.Cyprus3, Zone.Paxos3, Zone.Hydra1, Zone.Hydra2, Zone.Hydra3);
        }
        return zones.sort((a: Zone, b: Zone) => a.localeCompare(b));
    }

    /**
     * Get the latest Qi rate for a zone.
     *
     * @param {Zone} zone - The zone to get the rate for.
     * @param {number} [amt=1] - The amount to get the rate for. Default is `1`
     * @returns {Promise<bigint>} A promise that resolves to the latest Qi rate.
     */
    async getLatestQiRate(zone: Zone, amt: bigint): Promise<bigint> {
        const blockNumber = await this.getBlockNumber(toShard(zone));
        return this.getQiRateAtBlock(zone, blockNumber, amt);
    }

    /**
     * Get the Qi rate at a specific block.
     *
     * @param {Zone} zone - The zone to get the rate for.
     * @param {BlockTag} blockTag - The block tag to get the rate at.
     * @param {number} [amt=1] - The amount to get the rate for. Default is `1`
     * @returns {Promise<bigint>} A promise that resolves to the Qi rate at the specified block.
     */
    async getQiRateAtBlock(zone: Zone, blockTag: BlockTag, amt: bigint): Promise<bigint> {
        let resolvedBlockTag = this._getBlockTag(toShard(zone), blockTag);
        if (typeof resolvedBlockTag !== 'string') {
            resolvedBlockTag = await resolvedBlockTag;
        }

        return getBigInt(
            await this.#perform({
                method: 'getQiRateAtBlock',
                blockTag: resolvedBlockTag,
                amt: toQuantity(String(amt)),
                zone: zone,
            }),
        );
    }

    /**
     * Get the polling interval.
     *
     * @returns {number} The polling interval.
     */
    get pollingInterval(): number {
        return this.#options.pollingInterval;
    }

    /**
     * Returns `this`, to allow an **AbstractProvider** to implement the [Contract Runner](../classes/ContractRunner)
     * interface.
     *
     * @returns {this} The provider instance.
     */
    get provider(): this {
        return this;
    }

    /**
     * Shares multiple identical requests made during the same 250ms.
     *
     * @ignore
     * @param {PerformActionRequest} req - The request to perform.
     * @returns {Promise<T>} A promise that resolves to the result of the operation.
     */
    async #perform<T = any>(req: PerformActionRequest): Promise<T> {
        this.attemptConnect = true;
        const timeout = this.#options.cacheTimeout;
        // Caching disabled
        if (timeout < 0) {
            return await this._perform(req);
        }

        // Create a tag
        const tag = getTag(req.method, req);

        let perform = this.#performCache.get(tag);
        if (!perform || tag.includes('pending') || tag.includes('latest')) {
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
     * @ignore
     * @param {BlockParams} value - The block to wrap.
     * @param {Network} network - The network the block was on.
     * @returns {Block} The wrapped block.
     */
    // @todo `network` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _wrapBlock(value: BlockParams, network: Network): Block {
        return new Block(formatBlock(value), this);
    }

    /**
     * Provides the opportunity for a sub-class to wrap a log before returning it, to add additional properties or an
     * alternate sub-class of {@link Log | **Log**}.
     *
     * @ignore
     * @param {LogParams} value - The log to wrap.
     * @param {Network} network - The network the log was on.
     * @returns {Log} The wrapped log.
     */
    // @todo `network` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _wrapLog(value: LogParams, network: Network): Log {
        return new Log(formatLog(value), this);
    }

    /**
     * Provides the opportunity for a sub-class to wrap a transaction receipt before returning it, to add additional
     * properties or an {@link TransactionReceipt | **TransactionReceipt**}.
     *
     * @ignore
     * @param {TransactionReceiptParams} value - The transaction receipt to wrap.
     * @param {Network} network - The network the transaction was on.
     * @returns {TransactionReceipt} The wrapped transaction receipt.
     */
    // @todo `network` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _wrapTransactionReceipt(value: TransactionReceiptParams, network: Network): TransactionReceipt {
        const formattedReceipt = formatTransactionReceipt(value);
        return new TransactionReceipt(formattedReceipt, this);
    }

    /**
     * Provides the opportunity for a sub-class to wrap a transaction response before returning it, to add additional
     * properties or an alternate sub-class of {@link TransactionResponse | **TransactionResponse**}.
     *
     * @ignore
     * @param {TransactionResponseParams} tx - The transaction response to wrap.
     * @param {Network} network - The network the transaction was on.
     * @returns {TransactionResponse} The wrapped transaction response.
     */
    // TODO: `newtork` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _wrapTransactionResponse(tx: any, network: Network): TransactionResponse | ExternalTransactionResponse {
        try {
            const formattedTx = formatTransactionResponse(tx);
            if (tx.type === '0x0' || tx.type === 0) {
                return new QuaiTransactionResponse(formattedTx as QuaiTransactionResponseParams, this);
            } else if (tx.type === '0x1' || tx.type === 1) {
                return new ExternalTransactionResponse(formattedTx as ExternalTransactionResponseParams, this);
            } else if (tx.type === '0x2' || tx.type === 2) {
                return new QiTransactionResponse(formattedTx as QiTransactionResponseParams, this);
            } else {
                throw new Error(`Unknown transaction type: ${tx.type}`);
            }
        } catch (error) {
            console.error('Error in _wrapTransactionResponse:', error);
            throw error;
        }
    }

    /**
     * Resolves to the Network, forcing a network detection using whatever technique the sub-class requires.
     *
     * Sub-classes **must** override this.
     *
     * @ignore
     * @param {Shard} [shard] - The shard to use for the network detection.
     * @returns {Promise<Network>} A promise resolving to the network.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _detectNetwork(): Promise<Network> {
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
     * @ignore
     * @param {PerformActionRequest} req - The request to perform.
     * @returns {Promise<T>} A promise resolving to the result of the operation.
     */
    async _perform<T = any>(req: PerformActionRequest): Promise<T> {
        assert(false, `unsupported method: ${req.method}`, 'UNSUPPORTED_OPERATION', {
            operation: req.method,
            info: req,
        });
    }

    // State

    async getBlockNumber(shard: Shard): Promise<number> {
        const blockNumber = getNumber(await this.#perform({ method: 'getBlockNumber', shard: shard }), '%response');
        if (this.#lastBlockNumber >= 0) {
            this.#lastBlockNumber = blockNumber;
        }
        return blockNumber;
    }

    /**
     * Returns or resolves to the address for `address`, resolving {@link Addressable | **Addressable**} objects and
     * returning if already an address.
     *
     * @ignore
     * @param {AddressLike} address - The address to normalize.
     * @returns {string | Promise<string>} The normalized address.
     */
    _getAddress(address: AddressLike): string | Promise<string> {
        return resolveAddress(address);
    }

    /**
     * Returns or resolves to a valid block tag for `blockTag`, resolving negative values and returning if already a
     * valid block tag.
     *
     * @ignore
     * @param {Shard} [shard] - The shard to use for the block tag.
     * @param {BlockTag} [blockTag] - The block tag to normalize.
     * @returns {string | Promise<string>} A promise that resolves to a valid block tag.
     */
    _getBlockTag(shard: Shard, blockTag?: BlockTag): string | Promise<string> {
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
     * Returns or resolves to a filter for `filter`, resolving any {@link Addressable | **Addressable**} object and
     * returning if already a valid filter.
     *
     * @ignore
     * @param {Filter | FilterByBlockHash} filter - The filter to normalize.
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

        const resolve = (
            _address: Array<string>,
            fromBlock?: string,
            toBlock?: string,
            nodeLocation?: NodeLocation,
        ) => {
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
            if (nodeLocation) {
                filter.nodeLocation = nodeLocation;
            }

            return filter;
        };

        // Addresses could be async (Addressables)
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

        const zone = getZoneFromNodeLocation(filter.nodeLocation!);

        let fromBlock: undefined | string | Promise<string> = undefined;
        if ('fromBlock' in filter) {
            fromBlock = this._getBlockTag(toShard(zone), filter.fromBlock);
        }

        let toBlock: undefined | string | Promise<string> = undefined;
        if ('toBlock' in filter) {
            toBlock = this._getBlockTag(toShard(zone), filter.toBlock);
        }

        let nodeLocation: NodeLocation | undefined = undefined;
        if (filter.nodeLocation) {
            nodeLocation = filter.nodeLocation;
        }

        if (
            address.filter((a) => typeof a !== 'string').length ||
            (fromBlock != null && typeof fromBlock !== 'string') ||
            (toBlock != null && typeof toBlock !== 'string')
        ) {
            return Promise.all([Promise.all(address), fromBlock, toBlock, nodeLocation]).then((result) => {
                return resolve(result[0], result[1], result[2], result[3]);
            });
        }

        return resolve(<Array<string>>address, fromBlock, toBlock, nodeLocation);
    }

    /**
     * Returns or resovles to a transaction for `request`, resolving any {@link Addressable | **Addressable**} and
     * returning if already a valid transaction.
     *
     * @ignore
     * @param {PerformActionTransaction} _request - The transaction to normalize.
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
                    ? (<TxOutput[]>(<any>request)[key]).map((it) => it.address)
                    : (<TxInput[]>(<any>request)[key]).map((it) => computeAddress(it.pubkey))
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
            const getBlockTag = async () => {
                const zone = await this.zoneFromAddress(addressFromTransactionRequest(_request));
                const shard = toShard(zone);
                const blockTag = this._getBlockTag(shard, request.blockTag);
                if (isPromise(blockTag)) {
                    return await blockTag;
                }
                return blockTag;
            };
            promises.push(
                (async function () {
                    request.blockTag = await getBlockTag();
                })(),
            );
        }

        if (promises.length) {
            return (async function () {
                await Promise.all(promises);
                return request;
            })();
        }

        return request;
    }

    async getNetwork(): Promise<Network> {
        // No explicit network was set and this is our first time
        if (this.#networkPromise == null) {
            // Detect the current network (shared with all calls)
            const detectNetwork = (async () => {
                try {
                    const network = await this._detectNetwork();
                    this.emit('network', undefined, network, null);
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
            this._detectNetwork(), // The actual connected network
        ]);

        if (expected.chainId !== actual.chainId) {
            if (this.#anyNetwork) {
                // The "any" network can change, so notify listeners
                this.emit('network', undefined, actual, expected);

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

    protected async _waitGetRunningLocations(shard: Shard, now: boolean): Promise<number[][]> {
        let retries = 0;
        let locations: number[][] = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                if (this.attemptConnect) {
                    if (retries > 5) {
                        retries = 0;
                    }
                    locations = await this._getRunningLocations(shard, now);
                    break;
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            } catch (error) {
                retries++;
                if (retries > 5) {
                    this.attemptConnect = false;
                }
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
        if (locations.length === 0) {
            throw new Error('could not get running locations');
        }
        return locations;
    }

    protected async _getRunningLocations(shard?: Shard, now?: boolean): Promise<number[][]> {
        now = now ? now : false;
        return await this.#perform(
            shard
                ? { method: 'getRunningLocations', shard: shard, now: now }
                : { method: 'getRunningLocations', now: now },
        );
    }

    async getRunningLocations(shard?: Shard): Promise<number[][]> {
        return await this._getRunningLocations(shard);
    }

    async getProtocolTrieExpansionCount(shard: Shard): Promise<number> {
        return await this.#perform({ method: 'getProtocolTrieExpansionCount', shard: shard });
    }

    async getFeeData(zone?: Zone, txType: boolean = true): Promise<FeeData> {
        const getFeeDataFunc = async () => {
            const { gasPrice, minerTip } = await resolveProperties({
                gasPrice: (async () => {
                    try {
                        const value = await this.#perform({ method: 'getGasPrice', txType, zone: zone });
                        return getBigInt(value, '%response');
                    } catch (error) {
                        console.log(error);
                    }
                    return null;
                })(),
                minerTip: (async () => {
                    try {
                        const value = txType ? await this.#perform({ method: 'getMinerTip', zone: zone }) : 0;
                        return getBigInt(value, '%response');
                        // eslint-disable-next-line no-empty
                    } catch (error) {}
                    return null;
                })(),
            });

            if (gasPrice == null) {
                throw new Error('could not determine gasPrice');
            }

            let baseMinerTip: null | bigint = null;

            // These are the recommended EIP-1559 heuristics for fee data

            baseMinerTip = minerTip != null ? minerTip : BigInt('1000000000');

            return new FeeData(gasPrice, baseMinerTip);
        };

        return await getFeeDataFunc();
    }

    async estimateGas(_tx: TransactionRequest): Promise<bigint> {
        let tx = this._getTransactionRequest(_tx);
        if (isPromise(tx)) {
            tx = await tx;
        }
        const zone = await this.zoneFromAddress(addressFromTransactionRequest(tx));
        return (
            getBigInt(
                await this.#perform({
                    method: 'estimateGas',
                    transaction: tx,
                    zone: zone,
                }),
                '%response',
            ) * BigInt(2)
        );
    }

    async estimateFeeForQi(_tx: QiPerformActionTransaction): Promise<bigint> {
        const zone = await this.zoneFromAddress(addressFromTransactionRequest(_tx));
        return getBigInt(
            await this.#perform({
                method: 'estimateFeeForQi',
                transaction: _tx,
                zone: zone,
            }),
            '%response',
        );
    }

    async createAccessList(_tx: TransactionRequest): Promise<AccessList> {
        let tx = this._getTransactionRequest(_tx);
        if (isPromise(tx)) {
            tx = await tx;
        }
        const zone = await this.zoneFromAddress(addressFromTransactionRequest(tx));
        return (
            await this.#perform({
                method: 'createAccessList',
                transaction: tx,
                zone: zone,
            })
        ).accessList;
    }

    // TODO: `attempt` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async #call(tx: PerformActionTransaction, blockTag: string, attempt: number, zone?: Zone): Promise<string> {
        // This came in as a PerformActionTransaction, so to/from are safe; we can cast
        const transaction = <PerformActionTransaction>copyRequest(tx);
        return hexlify(await this._perform({ method: 'call', transaction, blockTag, zone }));
    }

    // TODO: `shard` is not used, remove or re-write
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async #checkNetwork<T>(promise: Promise<T>, shard?: Shard): Promise<T> {
        const { value } = await resolveProperties({
            network: this.getNetwork(),
            value: promise,
        });
        return value;
    }

    async call(_tx: QuaiTransactionRequest): Promise<string> {
        const zone = await this.zoneFromAddress(addressFromTransactionRequest(_tx));
        const shard = toShard(zone);

        const { tx, blockTag } = await resolveProperties({
            tx: this._getTransactionRequest(_tx),
            blockTag: this._getBlockTag(shard, _tx.blockTag),
        });

        return await this.#checkNetwork(this.#call(tx, blockTag, -1, zone), shard);
    }

    // Account
    async #getAccountValue(request: _PerformAccountRequest, _address: AddressLike, _blockTag?: BlockTag): Promise<any> {
        let address: string | Promise<string> = this._getAddress(_address);
        const zone = await this.zoneFromAddress(_address);
        const shard = toShard(zone);

        let blockTag: string | Promise<string> = this._getBlockTag(shard, _blockTag);

        if (typeof address !== 'string' || typeof blockTag !== 'string') {
            [address, blockTag] = await Promise.all([address, blockTag]);
        }

        return await this.#checkNetwork(
            this.#perform(Object.assign(request, { address, blockTag, zone: zone }) as PerformActionRequest),
            shard,
        );
    }

    async getBalance(address: AddressLike, blockTag?: BlockTag): Promise<bigint> {
        return getBigInt(await this.#getAccountValue({ method: 'getBalance' }, address, blockTag), '%response');
    }

    async getLockedBalance(address: AddressLike): Promise<bigint> {
        return getBigInt(await this.#getAccountValue({ method: 'getLockedBalance' }, address), '%response');
    }

    async getOutpointsByAddress(address: AddressLike): Promise<Outpoint[]> {
        return formatOutpoints(await this.#getAccountValue({ method: 'getOutpointsByAddress' }, address, 'latest'));
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

    async getTxPoolContent(zone: Zone): Promise<txpoolContentResponse> {
        return await this.#perform({ method: 'getTxPoolContent', zone: zone });
    }

    async txPoolInspect(zone: Zone): Promise<txpoolInspectResponse> {
        return await this.#perform({ method: 'txPoolInspect', zone: zone });
    }

    // Write
    async broadcastTransaction(zone: Zone, signedTx: string): Promise<TransactionResponse> {
        const type = decodeProtoTransaction(getBytes(signedTx)).type;
        try {
            const { blockNumber, hash, network } = await resolveProperties({
                blockNumber: this.getBlockNumber(toShard(zone)),
                hash: this._perform({
                    method: 'broadcastTransaction',
                    signedTransaction: signedTx,
                    zone: zone,
                }),
                network: this.getNetwork(),
            });

            const tx = type == 2 ? QiTransaction.from(signedTx) : QuaiTransaction.from(signedTx);
            const txObj = tx.toJSON();

            this.#validateTransactionHash(tx.hash || '', hash);

            if (type == 2) {
                return new QiTransactionResponse(txObj as QiTransactionResponseParams, this);
            }

            const wrappedTx = this._wrapTransactionResponse(<any>txObj, network);
            return wrappedTx.replaceableTransaction(blockNumber) as TransactionResponse;
        } catch (error) {
            console.error('Error in broadcastTransaction:', error);
            throw error;
        }
    }

    #validateTransactionHash(computedHash: string, nodehash: string) {
        if (computedHash !== nodehash) {
            throw new Error(`Transaction hash mismatch: ${computedHash} !== ${nodehash}`);
        }
    }

    validateUrl(url: string): void {
        const urlPattern = /^(https?):\/\/[a-zA-Z0-9.-]+(:\d+)?$/;

        if (!urlPattern.test(url)) {
            let errorMessage = 'Invalid URL: ';

            if (!/^https?:\/\//.test(url)) {
                errorMessage += 'URL must start with http:// or https://. ';
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

    async #getBlock(shard: Shard, block: BlockTag | string, includeTransactions: boolean): Promise<any> {
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
    async getBlock(shard: Shard, block: BlockTag | string, prefetchTxs?: boolean): Promise<null | Block> {
        const { network, params } = await resolveProperties({
            network: this.getNetwork(),
            params: this.#getBlock(shard, block, !!prefetchTxs),
        });
        if (params == null) {
            return null;
        }
        return this._wrapBlock(params, network);
    }

    async getTransaction(hash: string): Promise<null | TransactionResponse | ExternalTransactionResponse> {
        const zone = toZone(this.shardFromHash(hash));
        const { network, params } = await resolveProperties({
            network: this.getNetwork(),
            params: this.#perform({ method: 'getTransaction', hash, zone: zone }),
        });
        if (params == null) {
            return null;
        }

        return this._wrapTransactionResponse(params, network);
    }

    async getTransactionReceipt(hash: string): Promise<null | TransactionReceipt> {
        const zone = toZone(this.shardFromHash(hash));
        const { network, params } = await resolveProperties({
            network: this.getNetwork(),
            params: this.#perform({ method: 'getTransactionReceipt', hash, zone: zone }),
        });
        if (params == null) {
            return null;
        }
        // Some backends did not backfill the effectiveGasPrice in to old transactions
        // in the receipt, so we look it up manually and inject it.
        if (params.gasPrice == null && params.effectiveGasPrice == null) {
            const tx = await this.#perform({ method: 'getTransaction', hash, zone: zone });
            if (tx == null) {
                throw new Error('report this; could not find tx or effectiveGasPrice');
            }
            params.effectiveGasPrice = tx.gasPrice;
        }

        return this._wrapTransactionReceipt(params, network);
    }

    async getTransactionResult(hash: string): Promise<null | string> {
        const zone = toZone(this.shardFromHash(hash));
        const { result } = await resolveProperties({
            network: this.getNetwork(),
            result: this.#perform({ method: 'getTransactionResult', hash, zone: zone }),
        });
        if (result == null) {
            return null;
        }
        return hexlify(result);
    }

    async getOutpointDeltas(addresses: string[], startHash: string, endHash?: string): Promise<OutpointDeltas> {
        // Validate addresses are Qi addresses
        for (const addr of addresses) {
            assertArgument(isQiAddress(addr), `Invalid Qi address: ${addr}`, 'addresses', addresses);
        }

        // Validate block hashes
        assertArgument(isHexString(startHash, 32), 'invalid startHash', 'startHash', startHash);
        if (endHash) {
            assertArgument(isHexString(endHash, 32), 'invalid endHash', 'endHash', endHash);
        } else {
            endHash = 'latest';
        }

        // Get the zone from the first address
        const zone = await this.zoneFromAddress(addresses[0]);
        const shard = toShard(zone);

        // Fetch the block numbers for startHash and endHash in parallel
        const [startBlock, endBlock] = await Promise.all([
            this.getBlock(shard, startHash),
            this.getBlock(shard, endHash),
        ]);

        if (startBlock == null) {
            throw new Error('Could not find start block');
        }

        if (endBlock == null) {
            throw new Error('Could not find end block');
        }

        const startBlockNumber = getNumber(startBlock.woHeader.number, 'startBlockNumber');
        const endBlockNumber = getNumber(endBlock.woHeader.number, 'endBlockNumber');

        assertArgument(
            startBlockNumber <= endBlockNumber,
            'startBlockNumber must be less than or equal to endBlockNumber',
            'startBlockNumber',
            startBlockNumber,
        );

        // Precompute the ranges and collect end block numbers
        const ranges: Array<{ startHash: string; endHash: string }> = [];
        const endBlockNumbers: number[] = [];

        let currentStartBlockNumber = startBlockNumber;
        let currentStartHash: string = startHash;

        while (currentStartBlockNumber <= endBlockNumber) {
            // Calculate end of this segment
            const currentEndBlockNumber = Math.min(currentStartBlockNumber + 999, endBlockNumber);
            endBlockNumbers.push(currentEndBlockNumber);

            // Update for next segment
            currentStartBlockNumber = currentEndBlockNumber + 1;
        }

        // Fetch all the end block hashes in parallel
        const endBlocksPromises = endBlockNumbers.map((blockNumber) => this.getBlock(shard, blockNumber));
        const endBlocks = await Promise.all(endBlocksPromises);

        // Build the ranges using the fetched block hashes
        currentStartBlockNumber = startBlockNumber;
        currentStartHash = startHash;

        for (let i = 0; i < endBlocks.length; i++) {
            const currentEndBlock = endBlocks[i];
            if (!currentEndBlock) {
                throw new Error(`Could not find block for block number ${endBlockNumbers[i]}`);
            }
            const currentEndHash = currentEndBlock.hash;

            ranges.push({ startHash: currentStartHash, endHash: currentEndHash });

            // Update for next segment
            currentStartBlockNumber = endBlockNumbers[i] + 1;
            currentStartHash = currentEndHash;
        }

        // Issue all RPC calls in parallel
        const promises = ranges.map((range) => {
            return this.#perform<OutpointDeltaResponseParams>({
                method: 'getOutpointDeltasForAddressesInRange',
                addresses: addresses,
                startHash: range.startHash,
                endHash: range.endHash,
                zone: zone,
            }).then(formatOutpointDeltas);
        });

        // Wait for all promises to resolve
        const deltasArray = await Promise.all(promises);

        // Merge all the results
        const deltas: OutpointDeltas = {};

        for (const delta of deltasArray) {
            for (const [address, data] of Object.entries(delta)) {
                if (!deltas[address]) {
                    deltas[address] = { created: [], deleted: [] };
                }
                deltas[address].created.push(...data.created);
                deltas[address].deleted.push(...data.deleted);
            }
        }

        return deltas;
    }

    // Bloom-filter Queries
    async getLogs(_filter: Filter | FilterByBlockHash): Promise<Array<Log>> {
        let filter = this._getFilter(_filter);
        if (isPromise(filter)) {
            filter = await filter;
        }

        const { network, params } = await resolveProperties({
            network: this.getNetwork(),
            params: this.#perform<Array<LogParams>>({
                method: 'getLogs',
                filter,
                zone: getZoneFromNodeLocation(filter.nodeLocation),
            }),
        });

        return params.map((p) => this._wrapLog(p, network));
    }

    /**
     * @ignore
     */
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
        const zone = this.zoneFromHash(hash);
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
                this.once('block', listener, zone);
            };

            if (timeout != null) {
                timer = setTimeout(() => {
                    if (timer == null) {
                        return;
                    }
                    timer = null;
                    this.off('block', listener, zone);
                    reject(makeError('timeout', 'TIMEOUT', { reason: 'timeout' }));
                }, timeout);
            }

            listener(await this.getBlockNumber(toShard(zone)));
        });
    }

    // TODO: not implemented yet
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async waitForBlock(shard: Shard, blockTag?: BlockTag): Promise<Block> {
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
     * @ignore
     * @ignore
     * @param {() => void} _func - The function to execute.
     * @param {number} [timeout] - The time to wait before executing `func`.
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
     * @ignore
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
     * @ignore
     * @param {Subscription} sub - The subscription to get the subscriber for.
     */
    _getSubscriber(sub: Subscription): Subscriber {
        switch (sub.type) {
            case 'debug':
            case 'error':
            case 'network':
                return new UnmanagedSubscriber(sub.type);
            case 'block': {
                const subscriber = new PollingBlockSubscriber(this as AbstractProvider, sub.zone);
                subscriber.pollingInterval = this.pollingInterval;
                return subscriber;
            }
            //! TODO: implement this for quais
            // case "safe": case "finalized":
            //     return new PollingBlockTagSubscriber(this, sub.type);
            case 'event':
                return new PollingEventSubscriber(this as AbstractProvider, sub.filter);
            case 'transaction':
                return new PollingTransactionSubscriber(this as AbstractProvider, sub.hash, sub.zone);
            case 'qiTransaction':
                return new PollingQiTransactionSubscriber(this as AbstractProvider, sub.hash, sub.zone);
            case 'orphan':
                return new PollingOrphanSubscriber(this as AbstractProvider, sub.filter, sub.zone);
        }

        throw new Error(`unsupported event: ${sub.type}`);
    }

    /**
     * If a {@link Subscriber | **Subscriber**} fails and needs to replace itself, this method may be used.
     *
     * For example, this is used for providers when using the `quai_getFilterChanges` method, which can return null if
     * state filters are not supported by the backend, allowing the Subscriber to swap in a `PollingEventSubscriber`.
     *
     * @ignore
     * @param {Subscriber} oldSub - The subscriber to replace.
     * @param {Subscriber} newSub - The new subscriber.
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

    async #hasSub(event: ProviderEvent, emitArgs?: Array<any>, zone?: Zone): Promise<null | Sub> {
        let sub = await getSubscription(event, zone);
        // This is a log that is removing an existing log; we actually want
        // to emit an orphan event for the removed log
        if (sub.type === 'event' && emitArgs && emitArgs.length > 0 && emitArgs[0].removed === true) {
            sub = await getSubscription({ orphan: 'drop-log', log: emitArgs[0] }, zone);
        }
        return this.#subs.get(sub.tag) || null;
    }

    async #getSub(event: ProviderEvent, zone?: Zone): Promise<Sub> {
        const subscription = await getSubscription(event, zone);

        // Prevent tampering with our tag in any subclass' _getSubscriber
        const tag = subscription.tag;

        let sub = this.#subs.get(tag);
        if (!sub) {
            const subscriber = this._getSubscriber(subscription);

            const addressableMap = new WeakMap();
            const nameMap = new Map();
            sub = { subscriber, tag, addressableMap, nameMap, started: false, listeners: [], zone: subscription.zone! };
            this.#subs.set(tag, sub);
        }

        return sub;
    }

    async startZoneSubscriptions(zone: Zone): Promise<void> {
        for (const sub of Array.from(this.#subs.values())) {
            if (sub.zone === zone) {
                if (sub.started) {
                    await sub.subscriber.start();
                }
            }
        }
    }

    async on(event: ProviderEvent, listener: Listener, zone?: Zone): Promise<this> {
        const sub = await this.#getSub(event, zone);
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

    async once(event: ProviderEvent, listener: Listener, zone?: Zone): Promise<this> {
        const sub = await this.#getSub(event, zone);
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

    async emit(event: ProviderEvent, zone?: Zone, ...args: Array<any>): Promise<boolean> {
        const sub = await this.#hasSub(event, args, zone);
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

    async off(event: ProviderEvent, listener?: Listener, zone?: Zone): Promise<this> {
        const sub = await this.#hasSub(event, [], zone);
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
    async addListener(event: ProviderEvent, listener: Listener, zone?: Zone): Promise<this> {
        return await this.on(event, listener, zone);
    }

    // Alias for "off"
    async removeListener(event: ProviderEvent, listener: Listener, zone?: Zone): Promise<this> {
        return this.off(event, listener, zone);
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
