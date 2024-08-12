import assert from 'assert';
import dotenv from 'dotenv';
dotenv.config();

import { JsonRpcProvider, Shard } from '../../index.js';

describe('JSON RPC endpoints', function () {
    this.timeout(5000);
    let provider: JsonRpcProvider;

    before(() => {
        provider = new JsonRpcProvider(process.env.RPC_URL);
    });

    it('should return the block', async () => {
        const block = await provider.getBlock(Shard.Cyprus1, 'latest', true);
        assert(block);
    });
});
