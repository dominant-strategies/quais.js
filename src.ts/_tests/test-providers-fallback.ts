import assert from 'assert';

import { isError, makeError, AbstractProvider, FallbackProvider, Network } from '../index.js';

import type { PerformActionRequest } from '../index.js';

const network = Network.from('mainnet');

function stall(duration: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, duration);
    });
}

export type Performer = (req: PerformActionRequest) => Promise<any>;

export class MockProvider extends AbstractProvider {
    readonly _perform: Performer;

    constructor(perform: Performer) {
        super(network, { cacheTimeout: -1 });
        this._perform = perform;
    }

    async _detectNetwork(): Promise<Network> {
        return network;
    }

    async perform(req: PerformActionRequest): Promise<any> {
        return await this._perform(req);
    }
}

describe('Test Fallback broadcast', function () {
    const txHash = '0xe9fb92945282cf04f7bb3027d690fdaab6d601c99a7cdd0a5eb41d1a5c0893d5';

    async function test(actions: Array<{ timeout: number; error?: Error }>): Promise<any> {
        const tx =
            '0x00f8788223288202898504a817c8008504a817c800825208940aff86a125b29b25a9e418c2fb64f1753532c0ca88016345785d8a000080c001a0711d47f0f6828721f336430ca87277534d0134de5f04ce3629085f8d5371c129a061c4838dec40c296cfad6fe771d502c26e209089124e6f702c64353b3ca195c1';

        const providers: Array<MockProvider> = actions.map(({ timeout, error }) => {
            return new MockProvider(async (r) => {
                if (r.method === 'getBlockNumber') {
                    return 1;
                }
                if (r.method === 'broadcastTransaction') {
                    await stall(timeout);
                    if (error) {
                        throw error;
                    }
                    return txHash;
                }
                throw new Error(`unhandled method: ${r.method}`);
            });
        });

        const provider = new FallbackProvider(providers);
        return await provider.broadcastTransaction('0,1', tx);
    }

    it('picks late non-failed broadcasts', async function () {
        const result = await test([
            { timeout: 200, error: makeError('already seen', 'UNKNOWN_ERROR') },
            { timeout: 4000, error: makeError('already seen', 'UNKNOWN_ERROR') },
            { timeout: 400 },
        ]);
        assert(result.hash === txHash, 'result.hash === txHash');
    });

    it('insufficient funds short-circuit broadcast', async function () {
        await assert.rejects(
            async function () {
                const result = await test([
                    { timeout: 200, error: makeError('is broke', 'INSUFFICIENT_FUNDS') },
                    { timeout: 400, error: makeError('is broke', 'INSUFFICIENT_FUNDS') },
                    { timeout: 800 },
                    { timeout: 1000 },
                ]);
                console.log(result);
            },
            function (error: unknown) {
                assert(isError(error, 'INSUFFICIENT_FUNDS'));
                return true;
            },
        );
    });
});
