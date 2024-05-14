

import { WebSocket as _WebSocket } from "./ws.js"; /*-browser*/

import { SocketProvider } from "./provider-socket.js";

import type { JsonRpcApiProviderOptions} from "./provider-jsonrpc.js";
import type { Networkish } from "./network.js";

/**
 *  A generic interface to a Websocket-like object.
 */
export interface WebSocketLike {
    onopen: null | ((...args: Array<any>) => any);
    onmessage: null | ((...args: Array<any>) => any);
    onerror: null | ((...args: Array<any>) => any);

    readyState: number;

    get url(): string;

    send(payload: any): void;
    close(code?: number, reason?: string): void;
}

/**
 *  A function which can be used to re-create a WebSocket connection
 *  on disconnect.
 */
export type WebSocketCreator = () => WebSocketLike;

/**
 *  A JSON-RPC provider which is backed by a WebSocket.
 *
 *  WebSockets are often preferred because they retain a live connection
 *  to a server, which permits more instant access to events.
 *
 *  However, this incurs higher server infrasturture costs, so additional
 *  resources may be required to host your own WebSocket nodes and many
 *  third-party services charge additional fees for WebSocket endpoints.
 */
export class WebSocketProvider extends SocketProvider {
    #websockets: WebSocketLike[];

    readyMap: Map<string, boolean> = new Map();

    get websocket(): WebSocketLike[] {
        if (this.#websockets == null) { throw new Error("websocket closed"); }
        return this.#websockets;
    }

    constructor(url: string | string[] | WebSocketLike | WebSocketCreator, network?: Networkish, options?: JsonRpcApiProviderOptions) {
        super(network, options);
        this.#websockets = [];
        this.initPromise = this.initUrlMap(typeof url === 'string' ? [url] : url)
    }

    initWebSocket(websocket: WebSocketLike, shard: string): void {
        websocket.onopen = async () => {
            try {
                await this._start()
                this.resume();
                this.readyMap.set(shard, true);
            } catch (error) {
                console.log("failed to start WebsocketProvider", error);
                this.readyMap.set(shard, false);
                // @TODO: now what? Attempt reconnect?
            }
        };
        websocket.onmessage = (message: { data: string }) => {
            this._processMessage(message.data);
        };
    }


    async waitShardReady(shard: string): Promise<void> {
        let count = 0
        while(!this.readyMap.get(shard)) {
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, count)));
            if(count > 7) {
                throw new Error("Timeout waiting for shard to be ready");
            }
            count++
        }
    }

    async initUrlMap<U = (string[] | WebSocketLike | WebSocketCreator)>(urls: U) {
        const createWebSocket = (baseUrl: string, port: number): WebSocketLike => {
            return new _WebSocket(`${baseUrl}:${port}`) as WebSocketLike;
        };

        const initShardWebSockets = async (baseUrl: string) => {
            const shards = await this.getRunningLocations();
            await Promise.all(shards.map(async shard => {
                const port = 8200 + 20 * shard[0] + shard[1];
                const shardUrl = baseUrl.split(":").slice(0, 2).join(":");
                const websocket = createWebSocket(shardUrl, port);
                this.initWebSocket(websocket, `0x${shard[0].toString(16)}${shard[1].toString(16)}`);
                this.#websockets.push(websocket);
                this._urlMap.set(`0x${shard[0].toString(16)}${shard[1].toString(16)}`, websocket);
                await this.waitShardReady(`0x${shard[0].toString(16)}${shard[1].toString(16)}`);
            }));
        };

        if (Array.isArray(urls)) {
            for (const url of urls) {
                const baseUrl = `${url.split(":")[0]}:${url.split(":")[1]}`;
                const primeWebsocket = createWebSocket(baseUrl, 8001);
                this.initWebSocket(primeWebsocket, '0x');
                this.#websockets.push(primeWebsocket);
                this._urlMap.set('0x', primeWebsocket);
                await this.waitShardReady('0x');
                await initShardWebSockets(baseUrl);
            }
        } else if (typeof urls === 'function') {
            const primeWebsocket = urls();
            this.initWebSocket(primeWebsocket, '0x');
            this.#websockets.push(primeWebsocket);
            this._urlMap.set('0x', primeWebsocket);
            await this.waitShardReady('0x');
            const baseUrl = this.#websockets[0].url.split(":").slice(0, 2).join(":");
            await initShardWebSockets(baseUrl);
        } else {
            const primeWebsocket = urls as WebSocketLike;
            this.initWebSocket(primeWebsocket, '0x');
            this.#websockets.push(primeWebsocket);
            this._urlMap.set('0x', primeWebsocket);
            await this.waitShardReady('0x');
            const baseUrl = primeWebsocket.url.split(":").slice(0, 2).join(":");
            await initShardWebSockets(baseUrl);
        }
    }

    async _write(message: string, shard?: string): Promise<void> {
        const shardKey = shard ? this.shardBytes(shard) : undefined;
        if (this.websocket.length < 1) {
            throw new Error("Websocket closed");
        }
        if (shardKey && !this._urlMap.has(shardKey)) {
            throw new Error("Shard not found");
        }
        const websocket = shardKey ? this._urlMap.get(shardKey) : this.websocket[this.websocket.length - 1];
        if (!websocket) {
            throw new Error("Websocket is undefined");
        }
        if (shardKey) {
            await this.waitShardReady(shardKey);
        }
        websocket.send(message);
    }



    async destroy(): Promise<void> {
        this.#websockets.forEach((it) => it.close());
        this.#websockets = [];
        super.destroy();
    }
}
