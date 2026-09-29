import assert from 'assert';

import { JsonRpcError, JsonRpcPayload, JsonRpcProvider, JsonRpcResult, VoidSigner } from '../../index.js';

class RecordingProvider extends JsonRpcProvider {
    sentPayloads: Array<JsonRpcPayload | Array<JsonRpcPayload>> = [];

    constructor(readonly generatedAccessList: Array<{ address: string; storageKeys: string[] }> = []) {
        super('http://localhost:8082/', 9n, {
            cacheTimeout: -1,
            staticNetwork: true,
            usePathing: false,
        });
    }

    override async _send(
        payload: JsonRpcPayload | Array<JsonRpcPayload>,
    ): Promise<Array<JsonRpcResult | JsonRpcError>> {
        this.sentPayloads.push(payload);

        const respond = (rpcRequest: JsonRpcPayload): JsonRpcResult => {
            let result: unknown;
            switch (rpcRequest.method) {
                case 'quai_getTransactionCount':
                    result = '0x1';
                    break;
                case 'quai_estimateGas':
                    result = '0x5208';
                    break;
                case 'quai_gasPrice':
                    result = '0x3b9aca00';
                    break;
                case 'quai_createAccessList':
                    result = { accessList: this.generatedAccessList };
                    break;
                default:
                    throw new Error(`Unexpected RPC method: ${rpcRequest.method}`);
            }

            return {
                id: rpcRequest.id,
                result,
            };
        };

        return Array.isArray(payload) ? payload.map(respond) : [respond(payload)];
    }
}

describe('Signer transaction preparation batching', function () {
    it('batches independent requests, then estimates with the generated access list', async function () {
        const provider = new RecordingProvider();
        const signer = new VoidSigner('0x0010000000000000000000000000000000000000', provider);

        const transaction = await signer.populateQuaiTransaction({
            data: '0x1234',
            from: '0x0010000000000000000000000000000000000000',
            to: '0x0011000000000000000000000000000000000000',
            value: 1n,
        });

        assert.equal(provider.sentPayloads.length, 2);
        assert.ok(Array.isArray(provider.sentPayloads[0]));
        assert.deepEqual(
            (provider.sentPayloads[0] as Array<JsonRpcPayload>).map(({ method }) => method).sort(),
            ['quai_createAccessList', 'quai_gasPrice', 'quai_getTransactionCount'].sort(),
        );
        const estimation = provider.sentPayloads[1] as JsonRpcPayload;
        assert.equal(estimation.method, 'quai_estimateGas');
        assert.deepEqual((estimation.params as any[])[0].accessList, []);
        assert.equal(transaction.nonce, 1);
        assert.equal(transaction.gasLimit, 21000n);
        assert.equal(transaction.gasPrice, 1000000000n);
        assert.deepEqual(transaction.accessList, []);

        provider.destroy();
    });
});

// Regression: a plain 20 QUAI transfer to a deployed Safe was sent with accessList: []
// because data was "0x". The proxy's DELEGATECALL then fails Quai access enforcement.
describe('Native transfers to contract receivers', function () {
    const from = '0x004F7f5038beF235ce570D6145a04B7a4Ab7a08f';
    const to = '0x0007477B7A0A5Bb4947c07c5feFFa77664427D6C';
    const required = [
        { address: to, storageKeys: ['0x' + '00'.repeat(32)] },
        { address: '0x005c67Bc7603d8e2BC203eC9e61Eb8d9E2Cb4a44', storageKeys: [] },
    ];
    const requests = (provider: RecordingProvider) => provider.sentPayloads.flat();

    for (const data of [undefined, '0x']) {
        it(`includes receiver accesses with ${data === undefined ? 'omitted' : 'empty'} data`, async function () {
            const provider = new RecordingProvider(required);
            try {
                const tx = await new VoidSigner(from, provider).populateQuaiTransaction({ from, to, data, value: 20n });
                assert.deepEqual(tx.accessList, required);
                const estimate = requests(provider).find((p) => p.method === 'quai_estimateGas')!;
                assert.deepEqual((estimate.params as any[])[0].accessList, required);
                assert.equal((estimate.params as any[])[0].to.toLowerCase(), to.toLowerCase());
                assert.equal((estimate.params as any[])[0].value, '0x14');
            } finally {
                provider.destroy();
            }
        });
    }

    it('still generates an access list when the caller supplied gas', async function () {
        const provider = new RecordingProvider(required);
        try {
            const tx = await new VoidSigner(from, provider).populateQuaiTransaction({
                from,
                to,
                value: 1n,
                gasLimit: 50000n,
            });
            assert.deepEqual(tx.accessList, required);
            assert.equal(tx.gasLimit, 50000n);
            assert.ok(!requests(provider).some((p) => p.method === 'quai_estimateGas'));
        } finally {
            provider.destroy();
        }
    });

    for (const accessList of [required, []]) {
        it(`preserves an explicit ${accessList.length ? 'nonempty' : 'empty'} access list and estimates with it`, async function () {
            const provider = new RecordingProvider(required);
            try {
                const tx = await new VoidSigner(from, provider).populateQuaiTransaction({
                    from,
                    to,
                    value: 1n,
                    accessList,
                });
                assert.deepEqual(tx.accessList, accessList);
                assert.ok(!requests(provider).some((p) => p.method === 'quai_createAccessList'));
                const estimate = requests(provider).find((p) => p.method === 'quai_estimateGas')!;
                assert.deepEqual((estimate.params as any[])[0].accessList, accessList);
            } finally {
                provider.destroy();
            }
        });
    }

    for (const gasLimit of [undefined, 50000n]) {
        it(`rejects access-list generation failure ${gasLimit ? 'with' : 'without'} supplied gas`, async function () {
            const provider = new RecordingProvider();
            class FailingSigner extends VoidSigner {
                override async createAccessList(): Promise<never> {
                    throw Error('Access list unavailable');
                }
            }
            try {
                await assert.rejects(
                    new FailingSigner(from, provider).populateQuaiTransaction({
                        from,
                        to,
                        value: 1n,
                        gasLimit,
                        nonce: 1,
                        gasPrice: 1n,
                    }),
                    /Access list unavailable/,
                );
                assert.ok(!requests(provider).some((p) => p.method === 'quai_estimateGas'));
            } finally {
                provider.destroy();
            }
        });
    }

    it('keeps the access list empty for an ordinary EOA transfer', async function () {
        const provider = new RecordingProvider();
        try {
            const tx = await new VoidSigner(from, provider).populateQuaiTransaction({ from, to, value: 1n });
            assert.deepEqual(tx.accessList, []);
        } finally {
            provider.destroy();
        }
    });
});
