import assert from 'node:assert/strict';
import {
    findSafe,
    QUAI_SAFE_MAINNET_V5,
    QUAI_SAFE_PROXY_CREATION_CODE,
    QUAI_SAFE_RUNTIME_HASHES,
} from '../../smart-account/index.js';
import { keccak256 } from '../../crypto/index.js';

describe('confirmed Quai Safe mainnet reference', function () {
    it('matches the source-pinned factory and the wallet SDK discovery vector', function () {
        const deployment = QUAI_SAFE_MAINNET_V5;
        assert.equal(deployment.chainId, '9');
        assert.equal(deployment.factoryCodeHash, QUAI_SAFE_RUNTIME_HASHES.QuaiSafeProxyFactory);
        assert.equal(
            keccak256(QUAI_SAFE_PROXY_CREATION_CODE),
            '0x1b4a723eb3daf1684384e2eee0dbf4409ae5ebc4c7f3322405a368c86d465ccd',
        );
        const predicted = findSafe(deployment.factory, '0x000C890Ba0aaE9B69EBFf8fAd1303391a9954917', deployment.safe);
        assert.equal(predicted.account, '0x002CDe4e0e147B2826EdB3168fDE870D352Ef164');
        assert.equal(predicted.saltNonce, 281n);
    });
});
