import { assert } from './errors.js';

import type { FetchGetUrlFunc, FetchRequest, FetchCancelSignal, GetUrlResponse } from './fetch.js';

declare global {
    class Headers {
        constructor(values: Array<[string, string]>);
        forEach(func: (v: string, k: string) => void): void;
    }

    class Response {
        status: number;
        statusText: string;
        headers: Headers;
        arrayBuffer(): Promise<ArrayBuffer>;
        json(): Promise<any>;
    }

    type FetchInit = {
        method?: string;
        headers?: Headers;
        body?: Uint8Array;
    };

    function fetch(url: string, init: FetchInit): Promise<Response>;
}

// @TODO: timeout is completely ignored; start a Promise.any with a reject?
// TODO: `options` is not used; remove?
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createGetUrl(options?: Record<string, any>): FetchGetUrlFunc {
    async function getUrl(req: FetchRequest, _signal?: FetchCancelSignal): Promise<GetUrlResponse> {
        const protocol = req.url.split(':')[0].toLowerCase();

        assert(
            protocol === 'http' || protocol === 'https',
            `unsupported protocol ${protocol}`,
            'UNSUPPORTED_OPERATION',
            {
                info: { protocol },
                operation: 'request',
            },
        );

        assert(
            protocol === 'https' || !req.credentials || req.allowInsecureAuthentication,
            'insecure authorized connections unsupported',
            'UNSUPPORTED_OPERATION',
            {
                operation: 'request',
            },
        );

        let signal: undefined | AbortSignal = undefined;
        if (_signal) {
            const controller = new AbortController();
            signal = controller.signal;
            _signal.addListener(() => {
                controller.abort();
            });
        }

        const init = {
            method: req.method,
            headers: new Headers(Array.from(req)),
            body: req.body || undefined,
            signal,
        };

        const resp = await fetch(req.url, init);

        const headers: Record<string, string> = {};
        resp.headers.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
        });

        const respBody = await resp.arrayBuffer();
        const body = respBody == null ? null : new Uint8Array(respBody);

        return {
            statusCode: resp.status,
            statusMessage: resp.statusText,
            headers,
            body,
        };
    }

    return getUrl;
}

// @TODO: remove in v7; provided for backwards compat
const defaultGetUrl: FetchGetUrlFunc = createGetUrl({});

export async function getUrl(req: FetchRequest, _signal?: FetchCancelSignal): Promise<GetUrlResponse> {
    return defaultGetUrl(req, _signal);
}
