/**
 * Fetching content from the web is environment-specific, so quais provides an abstraction that each environment can
 * implement to provide this service.
 *
 * On [Node.js](https://nodejs.org/), the `http` and `https` libs are used to create a request object, register event
 * listeners and process data and populate the {@link FetchResponse | **FetchResponse**}.
 *
 * In a browser, the [DOM fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) is used, and the resulting
 * `Promise` is waited on to retrieve the payload.
 *
 * The {@link FetchRequest | **FetchRequest**} is responsible for handling many common situations, such as redirects,
 * server throttling, authentication, etc.
 *
 * It also handles common gateways, such as IPFS and data URIs.
 */
import { decodeBase64, encodeBase64 } from '../encoding/base64.js';
import { hexlify } from './data.js';
import { assert, assertArgument } from './errors.js';
import { defineProperties } from './properties.js';
import { toUtf8Bytes, toUtf8String } from '../encoding/index.js';

import { createGetUrl } from './geturl.js';

/**
 * An environment's implementation of `getUrl` must return this type.
 *
 * @category Utils
 */
export type GetUrlResponse = {
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
    body: null | Uint8Array;
};

/**
 * This can be used to control how throttling is handled in
 * {@link FetchRequest.setThrottleParams | **setThrottleParams**}.
 *
 * @category Utils
 */
export type FetchThrottleParams = {
    maxAttempts?: number;
    slotInterval?: number;
};

/**
 * Called before any network request, allowing updated headers (e.g. Bearer tokens), etc.
 *
 * @category Utils
 */
export type FetchPreflightFunc = (req: FetchRequest) => Promise<FetchRequest>;

/**
 * Called on the response, allowing client-based throttling logic or post-processing.
 *
 * @category Utils
 */
export type FetchProcessFunc = (req: FetchRequest, resp: FetchResponse) => Promise<FetchResponse>;

/**
 * Called prior to each retry; return true to retry, false to abort.
 *
 * @category Utils
 */
export type FetchRetryFunc = (req: FetchRequest, resp: FetchResponse, attempt: number) => Promise<boolean>;

/**
 * Called on Gateway URLs.
 *
 * @category Utils
 */
export type FetchGatewayFunc = (url: string, signal?: FetchCancelSignal) => Promise<FetchRequest | FetchResponse>;

/**
 * Used to perform a fetch; use this to override the underlying network fetch layer. In NodeJS, the default uses the
 * "http" and "https" libraries and in the browser `fetch` is used. If you wish to use Axios, this is how you would
 * register it.
 *
 * @category Utils
 */
export type FetchGetUrlFunc = (req: FetchRequest, signal?: FetchCancelSignal) => Promise<GetUrlResponse>;

const MAX_ATTEMPTS = 12;
const SLOT_INTERVAL = 250;

// The global FetchGetUrlFunc implementation.
let defaultGetUrlFunc: FetchGetUrlFunc = createGetUrl();

const reData = new RegExp('^data:([^;:]*)?(;base64)?,(.*)$', 'i');
const reIpfs = new RegExp('^ipfs://(ipfs/)?(.*)$', 'i');

// If locked, new Gateways cannot be added
let locked = false;

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URLs
// TODO: `signal` is not used; remove?
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function dataGatewayFunc(url: string, signal?: FetchCancelSignal): Promise<FetchResponse> {
    try {
        const match = url.match(reData);
        if (!match) {
            throw new Error('invalid data');
        }
        return new FetchResponse(
            200,
            'OK',
            {
                'content-type': match[1] || 'text/plain',
            },
            match[2] ? decodeBase64(match[3]) : unpercent(match[3]),
        );
    } catch (error) {
        return new FetchResponse(599, 'BAD REQUEST (invalid data: URI)', {}, null, new FetchRequest(url));
    }
}

/**
 * Returns a {@link FetchGatewayFunc | **FetchGatewayFunc**} for fetching content from a standard IPFS gateway hosted at
 * `baseUrl`.
 *
 * @category Utils
 * @param {string} baseUrl - The base URL of the IPFS gateway.
 * @returns {FetchGatewayFunc} The gateway function.
 */
function getIpfsGatewayFunc(baseUrl: string): FetchGatewayFunc {
    // TODO: `signal` is not used; remove?
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async function gatewayIpfs(url: string, signal?: FetchCancelSignal): Promise<FetchRequest | FetchResponse> {
        try {
            const match = url.match(reIpfs);
            if (!match) {
                throw new Error('invalid link');
            }
            return new FetchRequest(`${baseUrl}${match[2]}`);
        } catch (error) {
            return new FetchResponse(599, 'BAD REQUEST (invalid IPFS URI)', {}, null, new FetchRequest(url));
        }
    }

    return gatewayIpfs;
}

const Gateways: Record<string, FetchGatewayFunc> = {
    data: dataGatewayFunc,
    ipfs: getIpfsGatewayFunc('https://gateway.ipfs.io/ipfs/'),
};

const fetchSignals: WeakMap<FetchRequest, () => void> = new WeakMap();

/**
 * @ignore
 */
export class FetchCancelSignal {
    #listeners: Array<() => void>;
    #cancelled: boolean;

    constructor(request: FetchRequest) {
        this.#listeners = [];
        this.#cancelled = false;

        fetchSignals.set(request, () => {
            if (this.#cancelled) {
                return;
            }
            this.#cancelled = true;

            for (const listener of this.#listeners) {
                setTimeout(() => {
                    listener();
                }, 0);
            }
            this.#listeners = [];
        });
    }

    addListener(listener: () => void): void {
        assert(!this.#cancelled, 'singal already cancelled', 'UNSUPPORTED_OPERATION', {
            operation: 'fetchCancelSignal.addCancelListener',
        });
        this.#listeners.push(listener);
    }

    get cancelled(): boolean {
        return this.#cancelled;
    }

    checkSignal(): void {
        assert(!this.cancelled, 'cancelled', 'CANCELLED', {});
    }
}

// Check the signal, throwing if it is cancelled
function checkSignal(signal?: FetchCancelSignal): FetchCancelSignal {
    if (signal == null) {
        throw new Error('missing signal; should not happen');
    }
    signal.checkSignal();
    return signal;
}

/**
 * Represents a request for a resource using a URI.
 *
 * By default, the supported schemes are `HTTP`, `HTTPS`, `data:`, and `IPFS:`.
 *
 * Additional schemes can be added globally using {@link registerGateway | **registerGateway**}.
 *
 * @category Utils
 * @example
 *
 * ```ts
 * req = new FetchRequest('https://www.ricmoo.com');
 * resp = await req.send();
 * resp.body.length;
 * ```
 */
export class FetchRequest implements Iterable<[key: string, value: string]> {
    #allowInsecure: boolean;
    #gzip: boolean;
    #headers: Record<string, string>;
    #method: string;
    #timeout: number;
    #url: string;

    #body?: Uint8Array;
    #bodyType?: string;
    #creds?: string;

    // Hooks
    #preflight?: null | FetchPreflightFunc;
    #process?: null | FetchProcessFunc;
    #retry?: null | FetchRetryFunc;

    #signal?: FetchCancelSignal;

    #throttle: Required<FetchThrottleParams>;

    #getUrlFunc: null | FetchGetUrlFunc;

    /**
     * The fetch URL to request.
     */
    get url(): string {
        return this.#url;
    }
    set url(url: string) {
        this.#url = String(url);
    }

    /**
     * The fetch body, if any, to send as the request body. (default: null)
     *
     * When setting a body, the intrinsic `Content-Type` is automatically set and will be used if **not overridden** by
     * setting a custom header.
     *
     * If `body` is null, the body is cleared (along with the intrinsic `Content-Type`).
     *
     * If `body` is a string, the intrinsic `Content-Type` is set to `text/plain`.
     *
     * If `body` is a Uint8Array, the intrinsic `Content-Type` is set to `application/octet-stream`.
     *
     * If `body` is any other object, the intrinsic `Content-Type` is set to `application/json`.
     */
    get body(): null | Uint8Array {
        if (this.#body == null) {
            return null;
        }
        return new Uint8Array(this.#body);
    }
    set body(body: null | string | Readonly<object> | Readonly<Uint8Array>) {
        if (body == null) {
            this.#body = undefined;
            this.#bodyType = undefined;
        } else if (typeof body === 'string') {
            this.#body = toUtf8Bytes(body);
            this.#bodyType = 'text/plain';
        } else if (body instanceof Uint8Array) {
            this.#body = body;
            this.#bodyType = 'application/octet-stream';
        } else if (typeof body === 'object') {
            this.#body = toUtf8Bytes(JSON.stringify(body));
            this.#bodyType = 'application/json';
        } else {
            throw new Error('invalid body');
        }
    }

    /**
     * Returns true if the request has a body.
     */
    hasBody(): this is FetchRequest & { body: Uint8Array } {
        return this.#body != null;
    }

    /**
     * The HTTP method to use when requesting the URI. If no method has been explicitly set, then `GET` is used if the
     * body is null and `POST` otherwise.
     */
    get method(): string {
        if (this.#method) {
            return this.#method;
        }
        if (this.hasBody()) {
            return 'POST';
        }
        return 'GET';
    }
    set method(method: null | string) {
        if (method == null) {
            method = '';
        }
        this.#method = String(method).toUpperCase();
    }

    /**
     * The headers that will be used when requesting the URI. All keys are lower-case.
     *
     * This object is a copy, so any changes will **NOT** be reflected in the `FetchRequest`.
     *
     * To set a header entry, use the `setHeader` method.
     */
    get headers(): Record<string, string> {
        const headers = Object.assign({}, this.#headers);

        if (this.#creds) {
            headers['authorization'] = `Basic ${encodeBase64(toUtf8Bytes(this.#creds))}`;
        }

        if (this.allowGzip) {
            headers['accept-encoding'] = 'gzip';
        }

        if (headers['content-type'] == null && this.#bodyType) {
            headers['content-type'] = this.#bodyType;
        }
        if (this.body) {
            headers['content-length'] = String(this.body.length);
        }

        return headers;
    }

    /**
     * Get the header for `key`, ignoring case.
     *
     * @param {string} key - The header key to retrieve.
     * @returns {string} The header value.
     */
    getHeader(key: string): string {
        return this.headers[key.toLowerCase()];
    }

    /**
     * Set the header for `key` to `value`. All values are coerced to a string.
     *
     * @param {string} key - The header key to set.
     * @param {string | number} value - The header value to set.
     */
    setHeader(key: string, value: string | number): void {
        this.#headers[String(key).toLowerCase()] = String(value);
    }

    /**
     * Clear all headers, resetting all intrinsic headers.
     */
    clearHeaders(): void {
        this.#headers = {};
    }

    [Symbol.iterator](): Iterator<[key: string, value: string]> {
        const headers = this.headers;
        const keys = Object.keys(headers);
        let index = 0;
        return {
            next: () => {
                if (index < keys.length) {
                    const key = keys[index++];
                    return {
                        value: [key, headers[key]],
                        done: false,
                    };
                }
                return { value: undefined, done: true };
            },
        };
    }

    /**
     * The value that will be sent for the `Authorization` header.
     *
     * To set the credentials, use the `setCredentials` method.
     */
    get credentials(): null | string {
        return this.#creds || null;
    }

    /**
     * Sets an `Authorization` for `username` with `password`.
     *
     * @param {string} username - The username to use for basic authentication.
     * @param {string} password - The password to use for basic authentication.
     * @throws {Error} If the `username` contains a colon.
     */
    setCredentials(username: string, password: string): void {
        assertArgument(!username.match(/:/), 'invalid basic authentication username', 'username', '[REDACTED]');
        this.#creds = `${username}:${password}`;
    }

    /**
     * Enable and request gzip-encoded responses. The response will automatically be decompressed. (default: true)
     */
    get allowGzip(): boolean {
        return this.#gzip;
    }
    set allowGzip(value: boolean) {
        this.#gzip = !!value;
    }

    /**
     * Allow `Authentication` credentials to be sent over insecure channels. (default: false)
     */
    get allowInsecureAuthentication(): boolean {
        return !!this.#allowInsecure;
    }
    set allowInsecureAuthentication(value: boolean) {
        this.#allowInsecure = !!value;
    }

    /**
     * The timeout (in milliseconds) to wait for a complete response. (default: 5 minutes)
     */
    get timeout(): number {
        return this.#timeout;
    }
    set timeout(timeout: number) {
        assertArgument(timeout >= 0, 'timeout must be non-zero', 'timeout', timeout);
        this.#timeout = timeout;
    }

    /**
     * This function is called prior to each request, for example during a redirection or retry in case of server
     * throttling.
     *
     * This offers an opportunity to populate headers or update content before sending a request.
     */
    get preflightFunc(): null | FetchPreflightFunc {
        return this.#preflight || null;
    }
    set preflightFunc(preflight: null | FetchPreflightFunc) {
        this.#preflight = preflight;
    }

    /**
     * This function is called after each response, offering an opportunity to provide client-level throttling or
     * updating response data.
     *
     * Any error thrown in this causes the `send()` to throw.
     *
     * To schedule a retry attempt (assuming the maximum retry limit has not been reached), use
     * {@link FetchResponse.throwThrottleError | **FetchResponse.throwThrottleError**}.
     */
    get processFunc(): null | FetchProcessFunc {
        return this.#process || null;
    }
    set processFunc(process: null | FetchProcessFunc) {
        this.#process = process;
    }

    /**
     * This function is called on each retry attempt.
     */
    get retryFunc(): null | FetchRetryFunc {
        return this.#retry || null;
    }
    set retryFunc(retry: null | FetchRetryFunc) {
        this.#retry = retry;
    }

    /**
     * This function is called to fetch content from HTTP and HTTPS URLs and is platform specific (e.g. nodejs vs
     * browsers).
     *
     * This is by default the currently registered global getUrl function, which can be changed using
     * {@link registerGetUrl | **registerGetUrl**}. If this has been set, setting is to `null` will cause this
     * FetchRequest (and any future clones) to revert back to using the currently registered global getUrl function.
     *
     * Setting this is generally not necessary, but may be useful for developers that wish to intercept requests or to
     * configurege a proxy or other agent.
     */
    get getUrlFunc(): FetchGetUrlFunc {
        return this.#getUrlFunc || defaultGetUrlFunc;
    }
    set getUrlFunc(value: null | FetchGetUrlFunc) {
        this.#getUrlFunc = value;
    }

    /**
     * Create a new FetchRequest instance with default values.
     *
     * Once created, each property may be set before issuing a `.send()` to make the request.
     */
    constructor(url: string) {
        this.#url = String(url);

        this.#allowInsecure = false;
        this.#gzip = true;
        this.#headers = {};
        this.#method = '';
        this.#timeout = 30000;

        this.#throttle = {
            slotInterval: SLOT_INTERVAL,
            maxAttempts: MAX_ATTEMPTS,
        };

        this.#getUrlFunc = null;
    }

    toString(): string {
        return `<FetchRequest method=${JSON.stringify(this.method)} url=${JSON.stringify(this.url)} headers=${JSON.stringify(this.headers)} body=${this.#body ? hexlify(this.#body) : 'null'}>`;
    }

    /**
     * Update the throttle parameters used to determine maximum attempts and exponential-backoff properties.
     *
     * @param {FetchThrottleParams} params - The throttle parameters to set.
     * @throws {Error} If the `slotInterval` is not a positive integer.
     */
    setThrottleParams(params: FetchThrottleParams): void {
        if (params.slotInterval != null) {
            this.#throttle.slotInterval = params.slotInterval;
        }
        if (params.maxAttempts != null) {
            this.#throttle.maxAttempts = params.maxAttempts;
        }
    }

    async #send(
        attempt: number,
        expires: number,
        delay: number,
        _request: FetchRequest,
        _response: FetchResponse,
    ): Promise<FetchResponse> {
        if (attempt >= this.#throttle.maxAttempts) {
            return _response.makeServerError('exceeded maximum retry limit');
        }

        assert(getTime() <= expires, 'timeout', 'TIMEOUT', {
            operation: 'request.send',
            reason: 'timeout',
            request: _request,
        });

        if (delay > 0) {
            await wait(delay);
        }

        let req = this.clone();
        const scheme = (req.url.split(':')[0] || '').toLowerCase();

        // Process any Gateways
        if (scheme in Gateways) {
            const result = await Gateways[scheme](req.url, checkSignal(_request.#signal));
            if (result instanceof FetchResponse) {
                let response = result;

                if (this.processFunc) {
                    checkSignal(_request.#signal);
                    try {
                        response = await this.processFunc(req, response);
                    } catch (error: any) {
                        // Something went wrong during processing; throw a 5xx server error
                        if (error.throttle == null || typeof error.stall !== 'number') {
                            response.makeServerError('error in post-processing function', error).assertOk();
                        }

                        // Ignore throttling
                    }
                }

                return response;
            }
            req = result;
        }

        // We have a preflight function; update the request
        if (this.preflightFunc) {
            req = await this.preflightFunc(req);
        }

        const resp = await this.getUrlFunc(req, checkSignal(_request.#signal));
        let response = new FetchResponse(resp.statusCode, resp.statusMessage, resp.headers, resp.body, _request);

        if (response.statusCode === 301 || response.statusCode === 302) {
            // Redirect
            try {
                const location = response.headers.location || '';
                return req.redirect(location).#send(attempt + 1, expires, 0, _request, response);
                // eslint-disable-next-line no-empty
            } catch (error) {}

            // Things won't get any better on another attempt; abort
            return response;
        } else if (response.statusCode === 429) {
            // Throttle
            if (this.retryFunc == null || (await this.retryFunc(req, response, attempt))) {
                const retryAfter = response.headers['retry-after'];
                let delay = this.#throttle.slotInterval * Math.trunc(Math.random() * Math.pow(2, attempt));
                if (typeof retryAfter === 'string' && retryAfter.match(/^[1-9][0-9]*$/)) {
                    delay = parseInt(retryAfter);
                }
                return req.clone().#send(attempt + 1, expires, delay, _request, response);
            }
        }

        if (this.processFunc) {
            checkSignal(_request.#signal);
            try {
                response = await this.processFunc(req, response);
            } catch (error: any) {
                // Something went wrong during processing; throw a 5xx server error
                if (error.throttle == null || typeof error.stall !== 'number') {
                    response.makeServerError('error in post-processing function', error).assertOk();
                }

                // Throttle
                let delay = this.#throttle.slotInterval * Math.trunc(Math.random() * Math.pow(2, attempt));
                if (error.stall >= 0) {
                    delay = error.stall;
                }

                return req.clone().#send(attempt + 1, expires, delay, _request, response);
            }
        }

        return response;
    }

    /**
     * Resolves to the response by sending the request.
     */
    send(): Promise<FetchResponse> {
        assert(this.#signal == null, 'request already sent', 'UNSUPPORTED_OPERATION', {
            operation: 'fetchRequest.send',
        });
        this.#signal = new FetchCancelSignal(this);
        return this.#send(0, getTime() + this.timeout, 0, this, new FetchResponse(0, '', {}, null, this));
    }

    /**
     * Cancels the inflight response, causing a `CANCELLED` error to be rejected from the
     * {@link FetchRequest.send | **send**}.
     */
    cancel(): void {
        assert(this.#signal != null, 'request has not been sent', 'UNSUPPORTED_OPERATION', {
            operation: 'fetchRequest.cancel',
        });
        const signal = fetchSignals.get(this);
        if (!signal) {
            throw new Error('missing signal; should not happen');
        }
        signal();
    }

    /**
     * Returns a new {@link FetchRequest | **FetchRequest**} that represents the redirection to `location`.
     *
     * @param {string} location - The location to redirect to.
     * @returns {FetchRequest} The new request.
     */
    redirect(location: string): FetchRequest {
        // Redirection; for now we only support absolute locations
        const current = this.url.split(':')[0].toLowerCase();
        const target = location.split(':')[0].toLowerCase();

        // Don't allow redirecting:
        // - non-GET requests
        // - downgrading the security (e.g. https => http)
        // - to non-HTTP (or non-HTTPS) protocols [this could be relaxed?]
        assert(
            this.method === 'GET' && (current !== 'https' || target !== 'http') && location.match(/^https?:/),
            `unsupported redirect`,
            'UNSUPPORTED_OPERATION',
            {
                operation: `redirect(${this.method} ${JSON.stringify(this.url)} => ${JSON.stringify(location)})`,
            },
        );

        // Create a copy of this request, with a new URL
        const req = new FetchRequest(location);
        req.method = 'GET';
        req.allowGzip = this.allowGzip;
        req.timeout = this.timeout;
        req.#headers = Object.assign({}, this.#headers);
        if (this.#body) {
            req.#body = new Uint8Array(this.#body);
        }
        req.#bodyType = this.#bodyType;
        return req;
    }

    /**
     * Create a new copy of this request.
     *
     * @returns {FetchRequest} The new request.
     */
    clone(): FetchRequest {
        const clone = new FetchRequest(this.url);

        // Preserve "default method" (i.e. null)
        clone.#method = this.#method;

        // Preserve "default body" with type, copying the Uint8Array is present
        if (this.#body) {
            clone.#body = this.#body;
        }
        clone.#bodyType = this.#bodyType;

        // Preserve "default headers"
        clone.#headers = Object.assign({}, this.#headers);

        // Credentials is readonly, so we copy internally
        clone.#creds = this.#creds;

        if (this.allowGzip) {
            clone.allowGzip = true;
        }

        clone.timeout = this.timeout;
        if (this.allowInsecureAuthentication) {
            clone.allowInsecureAuthentication = true;
        }

        clone.#preflight = this.#preflight;
        clone.#process = this.#process;
        clone.#retry = this.#retry;

        clone.#getUrlFunc = this.#getUrlFunc;

        return clone;
    }

    /**
     * Locks all static configuration for gateways and FetchGetUrlFunc registration.
     */
    static lockConfig(): void {
        locked = true;
    }

    /**
     * Get the current Gateway function for `scheme`.
     *
     * @param {string} scheme - The scheme to get the gateway for.
     * @returns {FetchGatewayFunc | null} The gateway function, or null if not found.
     */
    static getGateway(scheme: string): null | FetchGatewayFunc {
        return Gateways[scheme.toLowerCase()] || null;
    }

    /**
     * Use the `func` when fetching URIs using `scheme`.
     *
     * This method affects all requests globally.
     *
     * If {@link FetchRequest.lockConfig | **lockConfig**} has been called, no change is made and this throws.
     *
     * @param {string} scheme - The scheme to register the gateway for.
     * @param {FetchGatewayFunc} func - The gateway function to use.
     * @throws {Error} If the scheme is `http` or `https`.
     */
    static registerGateway(scheme: string, func: FetchGatewayFunc): void {
        scheme = scheme.toLowerCase();
        if (scheme === 'http' || scheme === 'https') {
            throw new Error(`cannot intercept ${scheme}; use registerGetUrl`);
        }
        if (locked) {
            throw new Error('gateways locked');
        }
        Gateways[scheme] = func;
    }

    /**
     * Use `getUrl` when fetching URIs over HTTP and HTTPS requests.
     *
     * This method affects all requests globally.
     *
     * If {@link FetchRequest.lockConfig | **lockConfig**} has been called, no change is made and this throws.
     *
     * @param {FetchGetUrlFunc} getUrl - The function to use for fetching HTTP and HTTPS URIs.
     * @throws {Error} If the gateways are locked.
     */
    static registerGetUrl(getUrl: FetchGetUrlFunc): void {
        if (locked) {
            throw new Error('gateways locked');
        }
        defaultGetUrlFunc = getUrl;
    }

    /**
     * Creates a getUrl function that fetches content from HTTP and HTTPS URLs.
     *
     * The available `options` are dependent on the platform implementation of the default getUrl function.
     *
     * This is not generally something that is needed, but is useful when trying to customize simple behaviour when
     * fetching HTTP content.
     *
     * @param {Record<string, any>} [options] - The options to use when creating the getUrl function.
     * @returns {FetchGetUrlFunc} The getUrl function.
     * @throws {Error} If the gateways are locked.
     */
    static createGetUrlFunc(options?: Record<string, any>): FetchGetUrlFunc {
        return createGetUrl(options);
    }

    /**
     * Creates a function that can "fetch" data URIs.
     *
     * Note that this is automatically done internally to support data URIs, so it is not necessary to register it.
     *
     * This is not generally something that is needed, but may be useful in a wrapper to perfom custom data URI
     * functionality.
     *
     * @returns {FetchGatewayFunc} The gateway function.
     */
    static createDataGateway(): FetchGatewayFunc {
        return dataGatewayFunc;
    }

    /**
     * Creates a function that will fetch IPFS (unvalidated) from a custom gateway baseUrl.
     *
     * The default IPFS gateway used internally is `"https:/\/gateway.ipfs.io/ipfs/"`.
     *
     * @param {string} baseUrl - The base URL of the IPFS gateway.
     * @returns {FetchGatewayFunc} The gateway function.
     */
    static createIpfsGatewayFunc(baseUrl: string): FetchGatewayFunc {
        return getIpfsGatewayFunc(baseUrl);
    }
}

interface ThrottleError extends Error {
    stall: number;
    throttle: true;
}

/**
 * The response for a FetchRequest.
 *
 * @category Utils
 */
export class FetchResponse implements Iterable<[key: string, value: string]> {
    #statusCode: number;
    #statusMessage: string;
    #headers: Record<string, string>;
    #body: null | Readonly<Uint8Array>;
    #request: null | FetchRequest;

    #error: { error?: Error; message: string };

    toString(): string {
        return `<FetchResponse status=${this.statusCode} body=${this.#body ? hexlify(this.#body) : 'null'}>`;
    }

    /**
     * The response status code.
     */
    get statusCode(): number {
        return this.#statusCode;
    }

    /**
     * The response status message.
     */
    get statusMessage(): string {
        return this.#statusMessage;
    }

    /**
     * The response headers. All keys are lower-case.
     */
    get headers(): Record<string, string> {
        return Object.assign({}, this.#headers);
    }

    /**
     * The response body, or `null` if there was no body.
     */
    get body(): null | Readonly<Uint8Array> {
        return this.#body == null ? null : new Uint8Array(this.#body);
    }

    /**
     * The response body as a UTF-8 encoded string, or the empty string (i.e. `""`) if there was no body.
     *
     * An error is thrown if the body is invalid UTF-8 data.
     */
    get bodyText(): string {
        try {
            return this.#body == null ? '' : toUtf8String(this.#body);
        } catch (error) {
            assert(false, 'response body is not valid UTF-8 data', 'UNSUPPORTED_OPERATION', {
                operation: 'bodyText',
                info: { response: this },
            });
        }
    }

    /**
     * The response body, decoded as JSON.
     *
     * An error is thrown if the body is invalid JSON-encoded data or if there was no body.
     */
    get bodyJson(): any {
        try {
            return JSON.parse(this.bodyText);
        } catch (error) {
            assert(false, 'response body is not valid JSON', 'UNSUPPORTED_OPERATION', {
                operation: 'bodyJson',
                info: { response: this },
            });
        }
    }

    [Symbol.iterator](): Iterator<[key: string, value: string]> {
        const headers = this.headers;
        const keys = Object.keys(headers);
        let index = 0;
        return {
            next: () => {
                if (index < keys.length) {
                    const key = keys[index++];
                    return {
                        value: [key, headers[key]],
                        done: false,
                    };
                }
                return { value: undefined, done: true };
            },
        };
    }

    constructor(
        statusCode: number,
        statusMessage: string,
        headers: Readonly<Record<string, string>>,
        body: null | Uint8Array,
        request?: FetchRequest,
    ) {
        this.#statusCode = statusCode;
        this.#statusMessage = statusMessage;
        this.#headers = Object.keys(headers).reduce(
            (accum, k) => {
                accum[k.toLowerCase()] = String(headers[k]);
                return accum;
            },
            <Record<string, string>>{},
        );
        this.#body = body == null ? null : new Uint8Array(body);
        this.#request = request || null;

        this.#error = { message: '' };
    }

    /**
     * Return a Response with matching headers and body, but with an error status code (i.e. 599) and `message` with an
     * optional `error`.
     *
     * @param {string} [message] - The error message to use.
     * @param {Error} [error] - The error to use.
     * @returns {FetchResponse} The error response.
     */
    makeServerError(message?: string, error?: Error): FetchResponse {
        let statusMessage: string;
        if (!message) {
            message = `${this.statusCode} ${this.statusMessage}`;
            statusMessage = `CLIENT ESCALATED SERVER ERROR (${message})`;
        } else {
            statusMessage = `CLIENT ESCALATED SERVER ERROR (${this.statusCode} ${this.statusMessage}; ${message})`;
        }
        const response = new FetchResponse(599, statusMessage, this.headers, this.body, this.#request || undefined);
        response.#error = { message, error };
        return response;
    }

    /**
     * If called within a [request.processFunc](FetchRequest-processFunc) call, causes the request to retry as if
     * throttled for `stall` milliseconds.
     *
     * @param {string} [message] - The error message to use.
     * @param {number} [stall] - The number of milliseconds to stall before retrying.
     * @throws {Error} If `stall` is not a non-negative integer.
     */
    throwThrottleError(message?: string, stall?: number): never {
        if (stall == null) {
            stall = -1;
        } else {
            assertArgument(Number.isInteger(stall) && stall >= 0, 'invalid stall timeout', 'stall', stall);
        }

        const error = new Error(message || 'throttling requests');

        defineProperties(<ThrottleError>error, { stall, throttle: true });

        throw error;
    }

    /**
     * Get the header value for `key`, ignoring case.
     *
     * @param {string} key - The header key to retrieve.
     * @returns {string} The header value.
     */
    getHeader(key: string): string {
        return this.headers[key.toLowerCase()];
    }

    /**
     * Returns true if the response has a body.
     *
     * @returns {boolean} True if the response has a body.
     * @throws {Error} If the body is invalid UTF-8 data.
     */
    hasBody(): this is FetchResponse & { body: Uint8Array } {
        return this.#body != null;
    }

    /**
     * The request made for this response.
     */
    get request(): null | FetchRequest {
        return this.#request;
    }

    /**
     * Returns true if this response was a success statusCode.
     */
    ok(): boolean {
        return this.#error.message === '' && this.statusCode >= 200 && this.statusCode < 300;
    }

    /**
     * Throws a `SERVER_ERROR` if this response is not ok.
     *
     * @throws {Error} If the response is not ok.
     */
    assertOk(): void {
        if (this.ok()) {
            return;
        }
        // eslint-disable-next-line prefer-const
        let { message, error } = this.#error;
        if (message === '') {
            message = `server response ${this.statusCode} ${this.statusMessage}`;
        }
        assert(false, message, 'SERVER_ERROR', {
            request: this.request || 'unknown request',
            response: this,
            error,
        });
    }
}

function getTime(): number {
    return new Date().getTime();
}

function unpercent(value: string): Uint8Array {
    return toUtf8Bytes(
        value.replace(/%([0-9a-f][0-9a-f])/gi, (all, code) => {
            return String.fromCharCode(parseInt(code, 16));
        }),
    );
}

function wait(delay: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delay));
}
