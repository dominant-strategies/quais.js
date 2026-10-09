import { assertArgument, getBigInt, FetchRequest } from '../utils/index.js';
import { JsonRpcApiProvider, JsonRpcSigner } from './provider-jsonrpc.js';

import type { JsonRpcError, JsonRpcPayload, JsonRpcResult } from './provider-jsonrpc.js';
import type { Networkish } from './network.js';
import type { Eip1193Provider } from './provider-browser.js';
import { Shard } from '../constants/index.js';

/**
 * The `quai_*` methods that a wallet actually controls (accounts + signing). These are forwarded to the WalletConnect
 * wallet under their `eth_*` names; every other method is a read and is served by the Quai RPC.
 */
const WALLET_METHOD_MAP: Record<string, string> = {
    quai_accounts: 'eth_accounts',
    quai_requestAccounts: 'eth_requestAccounts',
    quai_sendTransaction: 'eth_sendTransaction',
    quai_signTransaction: 'eth_signTransaction',
    quai_sign: 'eth_sign',
    quai_signTypedData_v4: 'eth_signTypedData_v4',
};

/**
 * Options for a {@link WalletConnectProvider | **WalletConnectProvider**}.
 *
 * @category Providers
 */
export interface WalletConnectProviderOptions {
    /**
     * Multiply the `quai_estimateGas` result by this factor before the wallet signs (e.g. `1.5`). Nested contract calls
     * (a DEX swap) frequently need a hair more gas at execution than the raw estimate reports (EIP-150 63/64 rule), so
     * wallets normally pad it. Some WalletConnect wallets do not, so padding here gives the signed transaction
     * headroom. Defaults to `1` (no change). Only affects wallets that honor the gas limit the dApp provides.
     */
    gasMultiplier?: number;

    /**
     * If set, any transaction/typed-data request signed for a different account is rejected. Guards against a stale
     * WalletConnect session signing from an unexpected address.
     */
    account?: string;
}

/**
 * A **WalletConnectProvider** lets a WalletConnect wallet — which speaks the Ethereum `eth_*` JSON-RPC namespace — sign
 * Quai transactions, by translating Quai's wallet methods (`quai_sendTransaction`, `quai_signTypedData_v4`, …) to their
 * `eth_*` equivalents. A WalletConnect session only answers wallet-controlled methods, so every read (nonce, gas, chain
 * id, receipts) is routed to a separate Quai RPC instead of the wallet.
 *
 * This makes a WalletConnect wallet usable exactly like an injected Quai wallet (e.g. Pelagus via
 * {@link BrowserProvider | **BrowserProvider**}): call {@link WalletConnectProvider.getSigner | **getSigner**} and use
 * the signer with a {@link Contract | **Contract**} as usual.
 *
 * The wallet must expose the Quai account (chain id `9`, mapped through WalletConnect's `eip155` namespace) and run a
 * Quai-native serializer under `eth_sendTransaction`.
 *
 * ```ts
 * // `wcProvider` is an EIP-1193 provider from a WalletConnect session.
 * const provider = new WalletConnectProvider(wcProvider, 'https://rpc.quai.network/cyprus1');
 * const signer = await provider.getSigner();
 * const contract = new Contract(address, abi, signer);
 * await contract.transfer(to, amount);
 * ```
 *
 * @category Providers
 * @class
 * @extends JsonRpcApiProvider
 */
export class WalletConnectProvider extends JsonRpcApiProvider {
    #wallet: Eip1193Provider;
    #rpc: string | JsonRpcApiProvider;
    #readId: number;
    #account?: string;
    #gasMultiplier: number;

    /**
     * @param {Eip1193Provider} wallet - The WalletConnect EIP-1193 provider (signing side).
     * @param {string | JsonRpcApiProvider} rpc - A Quai RPC URL, or an existing read provider, used for every
     *   non-wallet method. Pass a {@link JsonRpcProvider | **JsonRpcProvider**} when you need multi-shard routing; a URL
     *   string is served by a single endpoint.
     * @param {Networkish} [network] - The network to connect to (e.g. chain id `9`).
     * @param {WalletConnectProviderOptions} [options] - Additional options.
     */
    constructor(
        wallet: Eip1193Provider,
        rpc: string | JsonRpcApiProvider,
        network?: Networkish,
        options?: WalletConnectProviderOptions,
    ) {
        // A wallet-backed provider does not bootstrap a URL map; mark ready and
        // keep batches to a single request like BrowserProvider does.
        super(network, network != null ? { batchMaxCount: 1, staticNetwork: true } : { batchMaxCount: 1 });

        assertArgument(rpc != null, 'a Quai RPC url or provider is required for reads', 'rpc', rpc);

        if (this.initResolvePromise) this.initResolvePromise();

        this.#wallet = wallet;
        this.#rpc = rpc;
        this.#readId = 1;
        this.#account = options?.account?.toLowerCase();
        this.#gasMultiplier = options?.gasMultiplier ?? 1;
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
     * Reject a transaction/typed-data request signed for an account other than the configured one.
     *
     * @ignore
     */
    #assertAccount(method: string, params: Array<any> | Record<string, any>): void {
        if (this.#account == null || !Array.isArray(params)) {
            return;
        }
        const first = params[0];
        let signer: string | undefined;
        if (typeof first === 'string' && first.startsWith('0x')) {
            // eth_signTypedData_v4 → params[0] is the signer address.
            signer = first;
        } else if (first != null && typeof first === 'object' && typeof first.from === 'string') {
            // eth_sendTransaction / eth_signTransaction → params[0].from.
            signer = first.from;
        }
        if (signer != null && signer.toLowerCase() !== this.#account) {
            assertArgument(
                false,
                `wallet is signing for ${signer} but ${this.#account} is connected`,
                'params',
                params,
            );
        }
    }

    /**
     * Route a non-wallet (read) method to the Quai RPC.
     *
     * @ignore
     */
    async #read(method: string, params: Array<any> | Record<string, any>, shard?: Shard): Promise<any> {
        if (typeof this.#rpc !== 'string') {
            return this.#rpc.send(method, params, shard);
        }
        const request = new FetchRequest(this.#rpc);
        request.body = JSON.stringify({ jsonrpc: '2.0', id: this.#readId++, method, params });
        request.setHeader('content-type', 'application/json');
        const response = await request.send();
        response.assertOk();
        const json = response.bodyJson;
        if (json.error) {
            const error: any = new Error(json.error.message || `Quai RPC ${method} error`);
            error.code = json.error.code;
            error.data = json.error.data;
            throw error;
        }
        return json.result;
    }

    /**
     * Apply the configured gas multiplier to a `quai_estimateGas` result.
     *
     * @ignore
     */
    #padGas(result: any): any {
        if (this.#gasMultiplier === 1 || typeof result !== 'string') {
            return result;
        }
        try {
            const scale = BigInt(Math.round(this.#gasMultiplier * 1000));
            const padded = (getBigInt(result) * scale) / 1000n;
            return '0x' + padded.toString(16);
        } catch {
            return result;
        }
    }

    /**
     * Sends a JSON-RPC payload. Wallet methods (`quai_*` signing/accounts) are translated to their `eth_*` names and
     * forwarded to the WalletConnect wallet; everything else is a read served by the configured Quai RPC.
     *
     * @ignore
     * @param {JsonRpcPayload | JsonRpcPayload[]} payload - The JSON-RPC payload.
     * @returns {Promise<(JsonRpcResult | JsonRpcError)[]>} The result of the request.
     */
    async _send(
        payload: JsonRpcPayload | Array<JsonRpcPayload>,
        shard?: Shard,
    ): Promise<Array<JsonRpcResult | JsonRpcError>> {
        assertArgument(!Array.isArray(payload), 'WalletConnect does not support batch request', 'payload', payload);

        const ethMethod = WALLET_METHOD_MAP[payload.method];
        try {
            if (ethMethod != null) {
                this.#assertAccount(payload.method, payload.params || []);
                // Only forward the standard `{ method, params }`; a WalletConnect
                // wallet rejects the non-standard `shard` hint.
                const result = await this.#wallet.request({ method: ethMethod, params: payload.params });
                return [{ id: payload.id, result }];
            }

            let result = await this.#read(payload.method, payload.params || [], shard);
            if (payload.method === 'quai_estimateGas') {
                result = this.#padGas(result);
            }
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
            // Prompt the wallet to expose its accounts (eth_requestAccounts).
            await this.send('quai_requestAccounts', []);
        }

        return await super.getSigner(address);
    }
}
