import { WebSocket as _WebSocket } from './ws.js'; /*-browser*/

import { SocketProvider } from './provider-socket.js';

import type { JsonRpcApiProviderOptions } from './provider-jsonrpc.js';
import type { Networkish } from './network.js';
import { Shard, toShard, toZone } from '../constants/index.js';
import { fromShard } from '../constants/shards.js';
import { ShardNickname, ShardPaths, ShardPorts } from './abstract-provider.js';

/**
 * A generic interface to a Websocket-like object.
 *
 * @category Providers
 */
export interface WebSocketLike {
    onopen: null | ((...args: Array<any>) => any);
    onmessage: null | ((...args: Array<any>) => any);
    onerror: null | ((...args: Array<any>) => any);
    onclose: null | ((...args: Array<any>) => any);

    readyState: number;

    get url(): string;

    send(payload: any): void;
    close(code?: number, reason?: string): void;
}

export const DefaultWebsocketShardPorts = {
    prime: 8001,
    cyprus: 8002,
    cyprus1: 8200,
    cyprus2: 8201,
    cyprus3: 8202,
    paxos: 8003,
    paxos1: 8220,
    paxos2: 8221,
    paxos3: 8222,
    hydra: 8004,
    hydra1: 8240,
    hydra2: 8241,
    hydra3: 8242,
};
/**
 * A function which can be used to re-create a WebSocket connection on disconnect.
 *
 * @category Providers
 */
export type WebSocketCreator = () => WebSocketLike;

/**
 * A JSON-RPC provider which is backed by a WebSocket.
 *
 * WebSockets are often preferred because they retain a live connection to a server, which permits more instant access
 * to events.
 *
 * However, this incurs higher server infrastructure costs, so additional resources may be required to host your own
 * WebSocket nodes and many third-party services charge additional fees for WebSocket endpoints.
 *
 * @category Providers
 * @extends SocketProvider
 */
export class WebSocketProvider extends SocketProvider {
    #websockets: WebSocketLike[];

    /**
     * A map to track the readiness of each shard.
     *
     * @type {Map<Shard, boolean>}
     */
    readyMap: Map<Shard, boolean> = new Map();

    /**
     * Get the array of WebSocketLike objects.
     *
     * @returns {WebSocketLike[]} The array of WebSocketLike objects.
     * @throws {Error} If the websocket is closed.
     */
    get websocket(): WebSocketLike[] {
        if (this.#websockets == null) {
            throw new Error('websocket closed');
        }
        return this.#websockets;
    }

    /**
     * Create a new WebSocketProvider.
     *
     * @param {string | string[] | WebSocketLike | WebSocketCreator} url - The URL(s) or WebSocket object or creator.
     * @param {Networkish} [network] - The network to connect to.
     * @param {JsonRpcApiProviderOptions} [options] - The options for the JSON-RPC API provider.
     */
    constructor(
        url: string | string[] | WebSocketLike | WebSocketCreator,
        network?: Networkish,
        options?: JsonRpcApiProviderOptions,
    ) {
        super(network, options);
        this.#websockets = [];
        if (typeof url === 'string') {
            this.validateUrl(url);
        } else if (Array.isArray(url)) {
            url.forEach((it) => this.validateUrl(it));
        } else if (typeof url === 'function') {
            this.validateUrl(url().url);
        } else {
            this.validateUrl(url.url);
        }
        this.initialize(typeof url === 'string' ? [url] : url);
    }

    /**
     * Initialize a WebSocket connection for a shard.
     *
     * @ignore
     * @param {WebSocketLike} websocket - The WebSocket object.
     * @param {Shard} shard - The shard identifier.
     */
    initWebSocket(websocket: WebSocketLike, shard: Shard, port: number): void {
        websocket.onerror = (error: any) => {
            console.log('WebsocketProvider error', error);
            websocket.close();
        };
        websocket.onopen = async () => {
            try {
                await this._start();
                this.resume();
                this.readyMap.set(shard, true);
                try {
                    const zone = toZone(shard);
                    this.provider.startZoneSubscriptions(zone);
                } catch (error) {
                    // Intentionally left empty. Will catch if shard is prime or region, which isn't a zone
                }
            } catch (error) {
                console.log('failed to start WebsocketProvider', error);
                this.readyMap.set(shard, false);
                // @TODO: now what? Attempt reconnect?
            }
        };

        websocket.onclose = () => {
            setTimeout(() => {
                const baseUrl = websocket.url.split(':').slice(0, 2).join(':').split('/').slice(0, 3).join('/');
                const shardSuffix = this._getOption('usePathing') ? `/${fromShard(shard, 'nickname')}` : `:${port}`;
                const newWebSocket = this.createWebSocket(baseUrl, shardSuffix);
                this.initWebSocket(newWebSocket, shard, port);
                this.#websockets.push(newWebSocket);
                this._urlMap.set(shard, newWebSocket);
            }, 500); // Reconnect after .5 seconds
        };

        websocket.onmessage = (message: { data: string }) => {
            this._processMessage(message.data);
        };
    }

    /**
     * Wait until the shard is ready. Max wait time is ~8 seconds.
     *
     * @param {Shard} shard - The shard identifier.
     * @returns {Promise<void>} A promise that resolves when the shard is ready.
     * @throws {Error} If the shard is not ready within the timeout period.
     */
    async waitShardReady(shard: Shard): Promise<void> {
        let count = 0;
        while (!this.readyMap.get(shard)) {
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, count)));
            if (count > 11) {
                throw new Error('Timeout waiting for shard to be ready');
            }
            count++;
        }
    }

    createWebSocket = (baseUrl: string, suffix: string): WebSocketLike => {
        const tempWs = new _WebSocket(`${baseUrl}${suffix}`);
        return tempWs as WebSocketLike;
        // wait 2 minutes
    };

    /**
     * Initialize the URL map with WebSocket connections.
     *
     * @ignore
     * @param {U} urls - The URLs or WebSocket object or creator.
     * @returns {Promise<void>} A promise that resolves when the URL map is initialized.
     */
    async initialize<U = string[] | WebSocketLike | WebSocketCreator>(urls: U) {
        //clear websockets
        this.#websockets = [];
        this._urlMap.clear();
        try {
            const primeSuffix = this._getOption('usePathing') ? `/${fromShard(Shard.Prime, 'nickname')}` : ':8001';
            const shardPortsArray: ShardPorts[] | undefined = this._getOption('shardPorts')
                ? Array.isArray(this._getOption('shardPorts'))
                    ? (this._getOption('shardPorts') as ShardPorts[])
                    : ([this._getOption('shardPorts')] as ShardPorts[])
                : undefined;
            const shardPathsArray: ShardPaths[] | undefined = this._getOption('shardPaths')
                ? Array.isArray(this._getOption('shardPaths'))
                    ? (this._getOption('shardPaths') as ShardPaths[])
                    : ([this._getOption('shardPaths')] as ShardPaths[])
                : undefined;
            const shardsOption = this._getOption('shards');
            const shardsArray: Shard[][] | undefined = shardsOption
                ? Array.isArray(shardsOption[0])
                    ? (this._getOption('shards') as Shard[][] | undefined)
                    : ([this._getOption('shards')] as Shard[][] | undefined)
                : undefined;

            const initShardWebSockets = async (
                baseUrl: string,
                shardPorts?: ShardPorts | undefined,
                shardPaths?: ShardPaths | undefined,
                shards?: Shard[] | undefined,
            ) => {
                if (shards) {
                    await Promise.all(
                        shards.map(async (shard) => {
                            const shardNickname = fromShard(shard, 'nickname');
                            const port =
                                shardPorts && shardNickname in shardPorts
                                    ? shardPorts?.[shardNickname as ShardNickname]
                                    : DefaultWebsocketShardPorts[
                                          shardNickname as keyof typeof DefaultWebsocketShardPorts
                                      ];
                            const path =
                                shardPaths && shardNickname in shardPaths
                                    ? shardPaths?.[shardNickname as ShardNickname]
                                    : `/${shardNickname}`;
                            const shardSuffix = this._getOption('usePathing') ? `${path}` : `:${port}`;
                            const shardUrl = baseUrl.split(':').slice(0, 2).join(':');
                            const websocket = this.createWebSocket(shardUrl, shardSuffix);
                            this.initWebSocket(websocket, shard, port as number);
                            this.#websockets.push(websocket);
                            this._urlMap.set(shard, websocket);
                            try {
                                await this.waitShardReady(shard);
                            } catch (error) {
                                console.log('failed to waitShardReady', error);
                                this._initFailed = true;
                            }
                        }),
                    );
                } else {
                    const dynamicShards = await this._getRunningLocations(Shard.Prime, true);
                    await Promise.all(
                        dynamicShards.map(async (shard) => {
                            const shardEnum = toShard(`0x${shard[0].toString(16)}${shard[1].toString(16)}`);
                            const shardNickname = fromShard(shardEnum, 'nickname');
                            const port =
                                shardPorts && shardNickname in shardPorts
                                    ? shardPorts?.[shardNickname as ShardNickname]
                                    : DefaultWebsocketShardPorts[
                                          shardNickname as keyof typeof DefaultWebsocketShardPorts
                                      ];
                            const path =
                                shardPaths && shardNickname in shardPaths
                                    ? shardPaths?.[shardNickname as ShardNickname]
                                    : `/${shardNickname}`;
                            const shardSuffix = this._getOption('usePathing') ? `${path}` : `:${port}`;
                            const shardUrl = baseUrl.split(':').slice(0, 2).join(':');
                            const websocket = this.createWebSocket(shardUrl, shardSuffix);
                            this.initWebSocket(websocket, shardEnum, port as number);
                            this.#websockets.push(websocket);
                            this._urlMap.set(shardEnum, websocket);
                            try {
                                await this.waitShardReady(shardEnum);
                            } catch (error) {
                                console.log('failed to waitShardReady', error);
                                this._initFailed = true;
                            }
                        }),
                    );
                }
            };

            if (Array.isArray(urls)) {
                if (shardsArray && urls.length !== shardsArray.length) {
                    throw new Error('Shard array length does not match URL array length');
                }
                for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
                    const baseUrl = `${urls[urlIndex].split(':')[0]}:${urls[urlIndex].split(':')[1]}`;
                    if (!shardsArray) {
                        const primeWebsocket = this.createWebSocket(baseUrl, primeSuffix);
                        this.initWebSocket(primeWebsocket, Shard.Prime, 8001);
                        this.#websockets.push(primeWebsocket);
                        this._urlMap.set(Shard.Prime, primeWebsocket);
                        await this.waitShardReady(Shard.Prime);
                    }
                    const shardPorts: ShardPorts | undefined = shardPortsArray
                        ? urls.length > shardPortsArray.length
                            ? (shardPortsArray[0] as ShardPorts)
                            : (shardPortsArray[urlIndex] as ShardPorts)
                        : undefined;
                    const shardPaths: ShardPaths | undefined = shardPathsArray
                        ? urls.length > shardPathsArray.length
                            ? (shardPathsArray[0] as ShardPaths)
                            : (shardPathsArray[urlIndex] as ShardPaths)
                        : undefined;
                    const shards = shardsArray ? shardsArray[urlIndex] : undefined;
                    await initShardWebSockets(baseUrl, shardPorts, shardPaths, shards);
                }
            } else if (typeof urls === 'function') {
                const shardPorts: ShardPorts | undefined = shardPortsArray ? shardPortsArray[0] : undefined;
                const shardPaths: ShardPaths | undefined = shardPathsArray ? shardPathsArray[0] : undefined;
                const shards: Shard[] | undefined = shardsArray ? shardsArray[0] : undefined;
                if (!shardsArray) {
                    const primeWebsocket = urls();
                    this.initWebSocket(primeWebsocket, Shard.Prime, 8001);
                    this.#websockets.push(primeWebsocket);
                    this._urlMap.set(Shard.Prime, primeWebsocket);
                    await this.waitShardReady(Shard.Prime);
                } else {
                    if (!shards) {
                        throw new Error('Shards array is empty or undefined.');
                    }
                    const firstWebsocket = urls();
                    const shardNickname = fromShard(shards[0], 'nickname');
                    const firstPort =
                        shardPorts && shardNickname in shardPorts
                            ? shardPorts?.[shardNickname as ShardNickname]
                            : DefaultWebsocketShardPorts[shardNickname as keyof typeof DefaultWebsocketShardPorts];
                    this.initWebSocket(firstWebsocket, shards[0], firstPort as number);
                    this.#websockets.push(firstWebsocket);
                    this._urlMap.set(shards[0], firstWebsocket);
                    await this.waitShardReady(shards[0]);
                }
                const baseUrl = this.#websockets[0].url.split(':').slice(0, 2).join(':');
                await initShardWebSockets(baseUrl, shardPorts, shardPaths, shards?.slice(1));
            } else {
                const shardPorts: ShardPorts | undefined = shardPortsArray ? shardPortsArray[0] : undefined;
                const shardPaths: ShardPaths | undefined = shardPathsArray ? shardPathsArray[0] : undefined;
                const shards: Shard[] | undefined = shardsArray ? shardsArray[0] : undefined;
                if (!shardsArray) {
                    const primeWebsocket = urls as WebSocketLike;
                    this.initWebSocket(primeWebsocket, Shard.Prime, 8001);
                    this.#websockets.push(primeWebsocket);
                    this._urlMap.set(Shard.Prime, primeWebsocket);
                    await this.waitShardReady(Shard.Prime);
                } else {
                    if (!shards) {
                        throw new Error('Shards array is empty or undefined.');
                    }
                    const firstWebsocket = urls as WebSocketLike;
                    const shardNickname = fromShard(shards[0], 'nickname');
                    const firstPort =
                        shardPorts && shardNickname in shardPorts
                            ? shardPorts?.[shardNickname as ShardNickname]
                            : DefaultWebsocketShardPorts[shardNickname as keyof typeof DefaultWebsocketShardPorts];
                    this.initWebSocket(firstWebsocket, shards[0], firstPort as number);
                    this.#websockets.push(firstWebsocket);
                    this._urlMap.set(shards[0], firstWebsocket);
                    await this.waitShardReady(shards[0]);
                }
                const baseUrl = this.#websockets[0].url.split(':').slice(0, 2).join(':');
                await initShardWebSockets(baseUrl, shardPorts, shardPaths, shards?.slice(1));
            }
            if (this.initResolvePromise) this.initResolvePromise();
        } catch (error) {
            this._initFailed = true;
            console.log('failed to initialize', error);
            //clear websockets
            this.#websockets = [];
            if (this.initRejectPromise) this.initRejectPromise(error);
            return;
        }
    }

    /**
     * Write a message to the WebSocket.
     *
     * @ignore
     * @param {string} message - The message to send.
     * @param {Shard} [shard] - The shard identifier.
     * @returns {Promise<void>} A promise that resolves when the message is sent.
     * @throws {Error} If the WebSocket is closed or the shard is not found.
     */
    async _write(message: string, shard?: Shard): Promise<void> {
        if (this.websocket.length < 1) {
            throw new Error('Websocket closed');
        }
        if (shard && !this._urlMap.has(shard)) {
            throw new Error('Shard not found');
        }
        const websocket = shard ? this._urlMap.get(shard) : this.websocket[this.websocket.length - 1];
        if (!websocket) {
            throw new Error('Websocket is undefined');
        }
        if (shard) {
            await this.waitShardReady(shard);
        }
        websocket.send(message);
    }

    /**
     * Destroy the WebSocket connections and clean up resources.
     *
     * @returns {Promise<void>} A promise that resolves when the WebSocket connections are closed.
     */
    async destroy(): Promise<void> {
        this.#websockets.forEach((it) => it.close());
        this.#websockets = [];
        super.destroy();
    }
}
