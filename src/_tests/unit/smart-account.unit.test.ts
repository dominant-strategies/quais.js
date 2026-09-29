import assert from 'assert';
import { randomUUID } from 'crypto';
import { SmartAccountClient } from '../../smart-account/index.js';
import { parseCalls, parseResult, trustedOrigin } from '../../smart-account/connector-protocol.js';
import type { WalletTransport } from '../../smart-account/index.js';

describe('smart-account client (no browser or signer required)', function () {
    const account = '0x00328DEb469eB9Ab102A7B0b725799ea10140a0D';
    it('accepts an interchangeable transport', async function () {
        const requests: string[] = [];
        const transport: WalletTransport = {
            prepare(options) {
                requests.push(`prepare:${options?.focus === false ? 'background' : 'focus'}`);
            },
            async request(method) {
                requests.push(method);
                return { address: account, chainId: '9' };
            },
            destroy() {
                requests.push('destroy');
            },
        };
        const client = new SmartAccountClient(transport);
        client.prepare({ focus: false });
        assert.deepEqual(await client.connect(), { address: account, chainId: '9' });
        await client.getCapabilities();
        const requestId = randomUUID();
        await client.getOperationByRequest(requestId);
        client.destroy();
        assert.deepEqual(requests, [
            'prepare:background',
            'connect',
            'getCapabilities',
            'getOperationByRequest',
            'destroy',
        ]);
    });
    it('rejects invalid quantities, extra privileges and insecure origins', function () {
        const input = { account, chainId: '9', calls: [{ to: account, value: '1', data: '0x' }] };
        assert.deepEqual(parseCalls(input), input);
        assert.throws(() => parseCalls({ ...input, sponsored: true }));
        assert.throws(() => parseCalls({ ...input, calls: [{ to: account, value: '-1', data: '0x' }] }));
        assert.throws(() => trustedOrigin('https://wallet.example/path'));
        assert.throws(() => trustedOrigin('http://wallet.example'));
        assert.equal(trustedOrigin('https://wallet.example'), 'https://wallet.example');
        assert.throws(() => parseResult('sendCalls', { id: 'made-up', state: 'confirmed' }));
        assert.deepEqual(parseCalls({ ...input, requestId: randomUUID() }).calls, input.calls);
        assert.throws(() => parseCalls({ ...input, requestId: 'not-a-uuid' }));
    });
    it('serializes concurrent calls through a single-flight transport', async function () {
        let active = 0;
        let maximum = 0;
        const transport: WalletTransport = {
            async request(method) {
                active += 1;
                maximum = Math.max(maximum, active);
                await new Promise((resolve) => setTimeout(resolve, 5));
                active -= 1;
                return method === 'getCapabilities'
                    ? {
                          protocolVersion: 1,
                          chainId: '9',
                          accountProtocol: 'safe/1.4.1',
                          actions: [],
                          payment: { mode: 'sponsored', quotes: false, guaranteed: false },
                      }
                    : { address: account, chainId: '9' };
            },
            destroy() {},
        };
        const client = new SmartAccountClient(transport);
        const [connected, capabilities] = await Promise.all([
            client.getAccount(),
            client.getCapabilities(),
        ]);
        assert.equal(connected.address, account);
        assert.equal(capabilities.accountProtocol, 'safe/1.4.1');
        assert.equal(maximum, 1);
        assert.equal(client.pendingRequests, 0);
    });
});
