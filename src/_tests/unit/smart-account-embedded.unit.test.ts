import assert from 'node:assert/strict';
import { SmartAccountClient, createEmbeddedTransport } from '../../smart-account/index.js';
import { CONNECTOR_PROTOCOL, type ConnectorMessageEvent } from '../../smart-account/connector-protocol.js';

describe('embedded smart-account transport', function () {
    it('uses the wallet parent and rejects messages from another origin', async function () {
        const origin = 'https://wallet.qu.ai';
        const channel = '00000000-0000-4000-8000-000000000001';
        const address = '0x00328DEb469eB9Ab102A7B0b725799ea10140a0D';
        const listeners = new Set<(event: ConnectorMessageEvent) => void>();
        const saved = (['addEventListener', 'removeEventListener', 'window'] as const).map(
            (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
        );
        const dispatch = (eventOrigin: string, data: unknown) => {
            for (const listener of listeners) listener({ origin: eventOrigin, source: parent, data });
        };
        const parent = {
            postMessage(value: any, targetOrigin: string) {
                assert.equal(targetOrigin, origin);
                if (value.type === 'hello') {
                    queueMicrotask(() =>
                        dispatch(origin, {
                            protocol: CONNECTOR_PROTOCOL,
                            version: 1,
                            channel,
                            type: 'ready',
                        }),
                    );
                } else if (value.method === 'getAccount') {
                    const response = {
                        protocol: CONNECTOR_PROTOCOL,
                        version: 1,
                        channel,
                        id: value.id,
                        type: 'response',
                        result: { address, chainId: '9' },
                    };
                    queueMicrotask(() => {
                        dispatch('https://other.example', response);
                        dispatch(origin, response);
                    });
                }
            },
        };
        Object.defineProperty(globalThis, 'addEventListener', {
            configurable: true,
            value: (_type: string, listener: (event: ConnectorMessageEvent) => void) => listeners.add(listener),
        });
        Object.defineProperty(globalThis, 'removeEventListener', {
            configurable: true,
            value: (_type: string, listener: (event: ConnectorMessageEvent) => void) => listeners.delete(listener),
        });
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { open: () => assert.fail('Embedded transport must not open a popup') },
        });
        const client = new SmartAccountClient(createEmbeddedTransport({ walletOrigin: origin, channel, parent }));
        try {
            client.prepare();
            assert.deepEqual(await client.getAccount(), { address, chainId: '9' });
        } finally {
            client.destroy();
            for (const [key, descriptor] of saved) {
                if (descriptor) Object.defineProperty(globalThis, key, descriptor);
                else Reflect.deleteProperty(globalThis, key);
            }
        }
    });
});
