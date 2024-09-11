import { assertArgument } from '../utils/index.js';
import { JsonRpcApiProvider, JsonRpcSigner } from './provider-jsonrpc.js';

import type { JsonRpcError, JsonRpcPayload, JsonRpcResult } from './provider-jsonrpc.js';
import type { Networkish } from './network.js';
import { Shard } from '../constants/index.js';

/**
 * The interface to an [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) provider, which is a standard used by most
 * injected providers, which the {@link BrowserProvider | **BrowserProvider**} accepts and exposes the API of.
 *
 * @category Providers
 * @interface
 */
export interface Eip1193Provider {
    /**
     * See [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) for details on this method.
     *
     * @param {Object} request - The request object.
     * @param {string} request.method - The method name.
     * @param {any[] | Record<string, any>} [request.params] - The parameters for the method.
     * @param {Shard} [request.shard] - The shard to send the request to.
     * @returns {Promise<any>} The result of the request.
     */
    request(request: { method: string; params?: Array<any> | Record<string, any>; shard?: Shard }): Promise<any>;
}

/**
 * The possible additional events dispatched when using the `"debug"` event on a
 * {@link BrowserProvider | **BrowserProvider**}.
 *
 * @category Providers
 * @property {string} action - The action type.
 * @property {Object} payload - The payload of the action.
 * @property {string} payload.method - The method name.
 * @property {any[]} payload.params - The parameters for the method.
 * @property {any} result - The result of the action.
 * @property {Error} error - The error object.
 */
export type DebugEventBrowserProvider =
    | {
          action: 'sendEip1193Payload';
          payload: { method: string; params: Array<any> };
      }
    | {
          action: 'receiveEip1193Result';
          result: any;
      }
    | {
          action: 'receiveEip1193Error';
          error: Error;
      };

/**
 * A **BrowserProvider** is intended to wrap an injected provider which adheres to the
 * [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) standard, which most (if not all) currently do.
 *
 * @category Providers
 * @class
 * @extends JsonRpcApiProvider
 */
export class BrowserProvider extends JsonRpcApiProvider {
    #request: (method: string, params: Array<any> | Record<string, any>, shard?: Shard) => Promise<any>;

    /**
     * Connect to the `ethereum` provider, optionally forcing the `network`.
     *
     * @class
     * @param {Eip1193Provider} ethereum - The EIP-1193 provider.
     * @param {Networkish} [network] - The network to connect to.
     */
    constructor(ethereum: Eip1193Provider, network?: Networkish) {
        super(network, { batchMaxCount: 1 });

        if (this.initResolvePromise) this.initResolvePromise();

        this.#request = async (method: string, params: Array<any> | Record<string, any>, shard?: Shard) => {
            const payload = { method, params, shard };
            this.emit('debug', undefined, { action: 'sendEip1193Request', payload });
            try {
                const result = await ethereum.request(payload);
                this.emit('debug', undefined, { action: 'receiveEip1193Result', result });
                return result;
            } catch (e: any) {
                const error = new Error(e.message);
                (<any>error).code = e.code;
                (<any>error).data = e.data;
                (<any>error).payload = payload;
                this.emit('debug', undefined, { action: 'receiveEip1193Error', error });
                throw error;
            }
        };
    }

    /**
     * Resolves to `true` if the provider manages the `address`.
     *
     * @param {number | string} address - The address to check.
     * @returns {Promise<boolean>} Resolves to `true` if the provider manages the `address`.
     */
    async hasSigner(address: number | string): Promise<boolean> {
        if (address == null) {
            address = 0;
        }

        const accounts = await this.send('quai_accounts', []);
        if (typeof address === 'number') {
            return accounts.length > address;
        }

        address = address.toLowerCase();
        return accounts.filter((a: string) => a.toLowerCase() === address).length !== 0;
    }

    /**
     * Sends a JSON-RPC request.
     *
     * @param {string} method - The method name.
     * @param {any[] | Record<string, any>} params - The parameters for the method.
     * @returns {Promise<any>} The result of the request.
     */
    async send(method: string, params: Array<any> | Record<string, any>, shard?: Shard): Promise<any> {
        await this._start();

        return await super.send(method, params, shard);
    }

    /**
     * Sends a JSON-RPC payload.
     *
     * @ignore
     * @ignore
     * @param {JsonRpcPayload | JsonRpcPayload[]} payload - The JSON-RPC payload.
     * @returns {Promise<(JsonRpcResult | JsonRpcError)[]>} The result of the request.
     */
    async _send(
        payload: JsonRpcPayload | Array<JsonRpcPayload>,
        shard?: Shard,
    ): Promise<Array<JsonRpcResult | JsonRpcError>> {
        assertArgument(!Array.isArray(payload), 'EIP-1193 does not support batch request', 'payload', payload);

        try {
            const result = await this.#request(payload.method, payload.params || [], shard);
            return [{ id: payload.id, result }];
        } catch (e: any) {
            return [
                {
                    id: payload.id,
                    error: { code: e.code, data: e.data, message: e.message, shard: shard || undefined },
                },
            ];
        }
    }

    /**
     * Gets the RPC error.
     *
     * @param {JsonRpcPayload} payload - The JSON-RPC payload.
     * @param {JsonRpcError} error - The JSON-RPC error.
     * @returns {Error} The RPC error.
     */
    getRpcError(payload: JsonRpcPayload, error: JsonRpcError): Error {
        error = JSON.parse(JSON.stringify(error));

        // EIP-1193 gives us some machine-readable error codes, so rewrite
        // them into
        switch (error.error.code || -1) {
            case 4001:
                error.error.message = `quais-user-denied: ${error.error.message}`;
                break;
            case 4200:
                error.error.message = `quais-unsupported: ${error.error.message}`;
                break;
        }

        return super.getRpcError(payload, error);
    }

    /**
     * Gets the signer for the given address.
     *
     * @param {number | string} [address] - The address to get the signer for.
     * @returns {Promise<JsonRpcSigner>} The signer for the address.
     */
    async getSigner(address?: number | string): Promise<JsonRpcSigner> {
        if (address == null) {
            address = 0;
        }

        if (!(await this.hasSigner(address))) {
            try {
                await this.#request('quai_requestAccounts', []);
            } catch (error: any) {
                const payload = error.payload;
                throw this.getRpcError(payload, { id: payload.id, error });
            }
        }

        return await super.getSigner(address);
    }
}
