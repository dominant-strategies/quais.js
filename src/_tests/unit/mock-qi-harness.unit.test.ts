import assert from 'assert';
import { Mnemonic, QiHDWallet, Zone, JsonRpcProvider, Shard } from '../../index.js';
import { MockQiChainState, MockQiRpcServer } from './mockQiHarness.js';

describe('Mock Qi harness', function () {
    this.timeout(120000);

    it('scans random seeded outpoints with the in-memory provider', async function () {
        const state = new MockQiChainState();
        const provider = state.createProvider();

        const wallet = QiHDWallet.fromMnemonic(
            Mnemonic.fromPhrase('test test test test test test test test test test test junk'),
        );
        const firstAddress = await wallet.getNextAddress(0, Zone.Cyprus1);
        state.seedRandomOutpoints(firstAddress.address, { count: 4, seed: 7 });
        state.mineBlock();

        wallet.connect(provider);
        await wallet.scan(Zone.Cyprus1);

        assert.equal(wallet.getOutpoints(Zone.Cyprus1).length, 4);
    });

    it('serves the same state over JSON-RPC for browser-style tests', async function () {
        const state = new MockQiChainState();
        const wallet = QiHDWallet.fromMnemonic(
            Mnemonic.fromPhrase('test test test test test test test test test test test junk'),
        );
        const firstAddress = await wallet.getNextAddress(0, Zone.Cyprus1);
        state.seedRandomOutpoints(firstAddress.address, { count: 3, seed: 42 });
        state.mineBlock();

        const server = new MockQiRpcServer(state);
        try {
            await server.listen();
        } catch (error: any) {
            if (error?.code === 'EPERM' || error?.code === 'EACCES') {
                this.skip();
                return;
            }
            throw error;
        }

        try {
            const provider = new JsonRpcProvider(server.url, state.network, {
                usePathing: false,
                cacheTimeout: -1,
            });

            const latestBlock = await provider.getBlock(Shard.Cyprus1, 'latest');
            const outpoints = await provider.getOutpointsByAddress(firstAddress.address);

            assert.ok(latestBlock);
            assert.equal(outpoints.length, 3);

            wallet.connect(provider);
            await wallet.scan(Zone.Cyprus1);
            assert.equal(wallet.getOutpoints(Zone.Cyprus1).length, 3);
        } finally {
            await server.close();
        }
    });
});
