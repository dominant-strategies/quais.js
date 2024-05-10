

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
    #websocket: WebSocketLike[];

    readyMap: Map<string, boolean> = new Map();

    get websocket(): WebSocketLike[] {
        if (this.#websocket == null) { throw new Error("websocket closed"); }
        return this.#websocket;
    }

    constructor(url: string | string[] | WebSocketLike | WebSocketCreator, network?: Networkish, options?: JsonRpcApiProviderOptions) {
        super(network, options);
        this.#websocket = [];
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
        if (Array.isArray(urls)) {
            // if string[]
            for (const url of urls) {
                const primeUrl = url.split(":")[0] + ":" + url.split(":")[1] + ":8001";
                const primeConnect = () => { return new _WebSocket(primeUrl) as WebSocketLike; };
                const primeWebsocket = primeConnect();
                this._urlMap.set('0x', primeWebsocket);
                this.#websocket.push(primeWebsocket);
                this.initWebSocket(primeWebsocket, '0x');
                await this.waitShardReady('0x');
                const shards = await this.getRunningLocations();
                shards.forEach((shard) => {
                    const port = 8200 + 20 * shard[0] + shard[1];
                    const websocket = new _WebSocket(url.split(":")[0] + ":" + url.split(":")[1] + ":" + port) as WebSocketLike;
                    this.initWebSocket(websocket, `0x${shard[0].toString(16)}${shard[1].toString(16)}`);
                    this.#websocket.push(websocket);
                    this._urlMap.set(`0x${shard[0].toString(16)}${shard[1].toString(16)}`, websocket );
                });
                // create array of all shards using flatMap
                await Promise.all(shards.map((shard) => {
                    this.waitShardReady(`0x${shard[0].toString(16)}${shard[1].toString(16)}`);
                }))
            }
            return
        } else if(typeof urls === 'function') {
            // if WebSocketCreator
            this._urlMap.set('0x', urls());
            const primeWebsocket = urls();
            this.#websocket.push(primeWebsocket);
            this.initWebSocket(primeWebsocket, '0x')
            await this.waitShardReady('0x');
            const shards = await this.getRunningLocations();
            shards.forEach((shard) => {
                const port = 8200 + 20 * shard[0] + shard[1];
                const websocket = new _WebSocket(this.#websocket[0].url.split(":")[0] + ":" + this.#websocket[0].url.split(":")[1] + ":" + port) as WebSocketLike
                this.initWebSocket(websocket, `0x${shard[0].toString(16)}${shard[1].toString(16)}`)
                this.#websocket.push(websocket);
                this._urlMap.set(`0x${shard[0].toString(16)}${shard[1].toString(16)}`, websocket );
            });
            return;
        } else {
            // if WebSocketLike
            const primeConnect = () => { return urls; };
            this.initWebSocket(urls as WebSocketLike, '0x');
            await this.waitShardReady('0x');
            const primeWebSocket = primeConnect()
            this._urlMap.set('0x', primeWebSocket as WebSocketLike);
            this.#websocket.push(primeWebSocket as WebSocketLike);
            const shards = await this.getRunningLocations();
            shards.forEach((shard) => {
                const port = 8200 + 20 * shard[0] + shard[1];
                const websocket = new _WebSocket((urls as WebSocketLike).url.split(":")[0] + ":" + (urls as WebSocketLike).url.split(":")[1] + ":" + port) as WebSocketLike;
                this.initWebSocket(websocket, `0x${shard[0].toString(16)}${shard[1].toString(16)}`);
                this.#websocket.push(websocket);
                this._urlMap.set(`0x${shard[0].toString(16)}${shard[1].toString(16)}`, websocket );
            });
            return;
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
        this.#websocket.forEach((it) => it.close());
        this.#websocket = [];
        super.destroy();
    }
}
