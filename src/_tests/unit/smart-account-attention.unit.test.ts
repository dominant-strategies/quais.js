import assert from 'assert';
import {
    SmartAccountClient,
    WalletConnectorError,
    createPopupTransport,
    isUserRejection,
    serveWalletRequests,
} from '../../smart-account/index.js';
import type { ConnectorRequest, HostContext } from '../../smart-account/index.js';
import { parseResult } from '../../smart-account/connector-protocol.js';
import type { ConnectorMessageEvent } from '../../smart-account/connector-protocol.js';

const account = '0x00328DEb469eB9Ab102A7B0b725799ea10140a0D';
const appOrigin = 'https://dapp.example';
const walletOrigin = 'https://wallet.example';

function replaceGlobal(name: string, value: unknown): () => void {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    return () => {
        if (previous) Object.defineProperty(globalThis, name, previous);
        else delete (globalThis as Record<string, unknown>)[name];
    };
}

/**
 * A structural popup harness that exercises the real client and host transports.
 */
function walletPopupHarness(handle: (request: ConnectorRequest, context: HostContext) => Promise<unknown>) {
    const listeners = new Set<(event: ConnectorMessageEvent) => void>();
    const dispatch = (event: ConnectorMessageEvent) => {
        for (const listener of [...listeners]) listener(event);
    };
    const state = { focuses: 0, stop: undefined as (() => void) | undefined };
    const appWindow = {
        postMessage(value: unknown) {
            const data = structuredClone(value);
            queueMicrotask(() => dispatch({ origin: walletOrigin, source: popup, data }));
        },
    };
    const popup = {
        opener: appWindow as unknown,
        closed: false,
        location: {
            replace(destination: string) {
                const channel = new URLSearchParams(new URL(destination).hash.slice(1)).get('channel');
                assert.ok(channel);
                state.stop = serveWalletRequests({ origin: appOrigin, channel, handle });
            },
        },
        focus() {
            state.focuses += 1;
        },
        postMessage(value: unknown) {
            const data = structuredClone(value);
            queueMicrotask(() => dispatch({ origin: appOrigin, source: appWindow, data }));
        },
        close() {
            popup.closed = true;
            state.stop?.();
        },
    };
    const restore = [
        replaceGlobal('location', { origin: appOrigin }),
        replaceGlobal('window', { open: () => popup }),
        replaceGlobal('addEventListener', (_type: string, listener: (event: ConnectorMessageEvent) => void) => {
            listeners.add(listener);
        }),
        replaceGlobal('removeEventListener', (_type: string, listener: (event: ConnectorMessageEvent) => void) => {
            listeners.delete(listener);
        }),
    ];
    return {
        state,
        cleanup() {
            state.stop?.();
            for (const restoreGlobal of restore.reverse()) restoreGlobal();
        },
    };
}

describe('smart-account wallet attention', function () {
    it('recognizes standard signer rejection errors without matching text', function () {
        assert.equal(isUserRejection({ code: 4001 }), true);
        assert.equal(isUserRejection({ code: 'ACTION_REJECTED' }), true);
        assert.equal(isUserRejection({ info: { error: { code: 4001 } } }), true);
        assert.equal(isUserRejection(Object.assign(new Error('wrapped'), { cause: { code: 4001 } })), true);
        assert.equal(isUserRejection({ code: 4100 }), false);
        assert.equal(isUserRejection(new Error('User rejected')), false);
        const cycle: Record<string, unknown> = {};
        cycle.cause = cycle;
        assert.equal(isUserRejection(cycle), false);
    });

    it('validates the optional background-swaps capability', function () {
        const capabilities = {
            protocolVersion: 1,
            chainId: '9',
            accountProtocol: 'safe/1.4.1',
            actions: [],
            payment: { mode: 'sponsored', quotes: false, guaranteed: false },
        };
        assert.equal(
            (parseResult('getCapabilities', { ...capabilities, backgroundSwaps: true }) as { backgroundSwaps: boolean })
                .backgroundSwaps,
            true,
        );
        for (const backgroundSwaps of ['true', 1, null])
            assert.throws(() => parseResult('getCapabilities', { ...capabilities, backgroundSwaps }));
    });

    it('keeps a background request open and tells the app when the wallet needs attention', async function () {
        let requestContext: HostContext | undefined;
        const harness = walletPopupHarness(async (_request, context) => {
            requestContext = context;
            context.attention();
            context.attention();
            await new Promise((resolve) => setTimeout(resolve, 5));
            return { id: `0x${'ab'.repeat(32)}`, state: 'submitted' };
        });
        const attention: boolean[] = [];
        const client = new SmartAccountClient(
            createPopupTransport({
                walletUrl: walletOrigin,
                backgroundMethods: ['sendCalls'],
                onAttention: (waiting) => attention.push(waiting),
            }),
        );
        try {
            client.prepare({ focus: false });
            const operation = await client.sendCalls({
                chainId: '9',
                account,
                calls: [{ to: account, value: '0', data: '0x' }],
            });
            assert.equal(operation.state, 'submitted');
            assert.equal(harness.state.focuses, 1);
            assert.deepEqual(attention, [true, false]);
            requestContext?.attention();
            await new Promise((resolve) => setTimeout(resolve, 0));
            assert.deepEqual(attention, [true, false]);
        } finally {
            client.destroy();
            harness.cleanup();
        }
    });

    it('returns a sanitized USER_REJECTED error for a declined signer prompt', async function () {
        const harness = walletPopupHarness(async () => {
            throw Object.assign(new Error('MetaMask: User denied message signature.'), { code: 4001 });
        });
        const client = new SmartAccountClient(createPopupTransport({ walletUrl: walletOrigin }));
        try {
            await assert.rejects(client.connect(), (error: unknown) => {
                assert.ok(error instanceof WalletConnectorError);
                assert.equal(error.code, 'USER_REJECTED');
                assert.equal(error.message, 'User declined the request.');
                assert.equal(error.message.includes('MetaMask'), false);
                return true;
            });
        } finally {
            client.destroy();
            harness.cleanup();
        }
    });
});
