import { assertArgument } from '../utils/index.js';

import { JsonRpcApiProvider } from './provider-jsonrpc.js';

import type {
    JsonRpcError, JsonRpcPayload, JsonRpcResult
} from "./provider-jsonrpc.js";
import type { Networkish } from "./network.js";

/**
 * The interface to an [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) provider, which is a standard used by most
 * injected providers, which the {@link BrowserProvider | **BrowserProvider**} accepts and exposes the API of.
 *
 * @category Providers
 */
export interface Eip1193Provider {
    /**
     * See [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) for details on this method.
     */
    request(request: { method: string; params?: Array<any> | Record<string, any> }): Promise<any>;
}

/**
 * The possible additional events dispatched when using the `"debug"` event on a
 * {@link BrowserProvider | **BrowserProvider**}.
 *
 * @category Providers
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
 */
export class BrowserProvider extends JsonRpcApiProvider {
    #request: (method: string, params: Array<any> | Record<string, any>) => Promise<any>;

    /**
     * Connnect to the `ethereum` provider, optionally forcing the `network`.
     */
    constructor(ethereum: Eip1193Provider, network?: Networkish) {
        super(network, { batchMaxCount: 1 });

        this.#request = async (method: string, params: Array<any> | Record<string, any>) => {
            const payload = { method, params };
            this.emit('debug', { action: 'sendEip1193Request', payload });
            try {
                const result = await ethereum.request(payload);
                this.emit('debug', { action: 'receiveEip1193Result', result });
                return result;
            } catch (e: any) {
                const error = new Error(e.message);
                (<any>error).code = e.code;
                (<any>error).data = e.data;
                (<any>error).payload = payload;
                this.emit('debug', { action: 'receiveEip1193Error', error });
                throw error;
            }
        };
    }

    async send(method: string, params: Array<any> | Record<string, any>): Promise<any> {
        await this._start();

        return await super.send(method, params);
    }

    async _send(payload: JsonRpcPayload | Array<JsonRpcPayload>): Promise<Array<JsonRpcResult | JsonRpcError>> {
        assertArgument(!Array.isArray(payload), 'EIP-1193 does not support batch request', 'payload', payload);

        try {
            const result = await this.#request(payload.method, payload.params || []);
            return [{ id: payload.id, result }];
        } catch (e: any) {
            return [
                {
                    id: payload.id,
                    error: { code: e.code, data: e.data, message: e.message },
                },
            ];
        }
    }

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
     * Resolves to `true` if the provider manages the `address`.
     *
     * @param {number | string} address - The address to check.
     *
     * @returns {Promise<boolean>} Resolves to `true` if the provider manages the `address`.
     */
}
