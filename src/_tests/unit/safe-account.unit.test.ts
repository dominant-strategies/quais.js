import assert from 'assert';
import {
    safeRequest,
    safeDomain,
    findSafe,
    encodeSafeCreate,
    safeFactoryInterface,
    safePersonalSignature,
    safeSigner,
    encodeSafeExecute,
    decodeSponsoredSafe,
    safeMessageRequest,
    QUAI_SAFE_PROFILE,
} from '../../smart-account/index.js';
import { TypedDataEncoder, hashMessage } from '../../hash/index.js';
import { SigningKey, randomBytes } from '../../crypto/index.js';
import { computeAddress } from '../../address/index.js';
import { getBytes } from '../../utils/index.js';
const account = '0x0011000000000000000000000000000000000011' as const;
const recipient = '0x0022000000000000000000000000000000000022' as const;
const deployment = { singleton: account, fallbackHandler: recipient, multiSendCallOnly: recipient };
describe('upstream Safe adapter', function () {
    it('matches the EIP712 vector verified against the unchanged Safe contract', function () {
        const request = safeRequest(9n, account, [{ target: recipient, value: 1000000000000000000n, data: '0x' }], 7n);
        assert.equal(
            TypedDataEncoder.hash(request.domain, request.types, request.value),
            '0x3e57ae0c155f2f53117191df79e75b8f3af4cd49441e66c79e733c11e6112072',
        );
        assert.throws(() => safeDomain(0n, account));
        assert.equal(request.value.gasPrice, 0n);
        assert.equal(request.value.deadline, undefined);
    });
    it('encodes canonical primary setup and a deterministic Cyprus-1 address', function () {
        const predicted = findSafe(account, recipient, deployment);
        assert.equal(BigInt(predicted.account) >> 151n, 0n);
        assert.deepEqual(findSafe(account, recipient, deployment), predicted);
        const decoded = safeFactoryInterface.parseTransaction({
            data: encodeSafeCreate(recipient, account, deployment),
        })!;
        assert.equal(decoded.name, 'createProxyWithNonce');
        assert.equal(decoded.args[1], predicted.initializer);
        assert.equal(decoded.args[2], predicted.saltNonce);
    });
    it('binds the Quai receiving proxy profile into deterministic discovery', function () {
        const receiving = findSafe(account, recipient, {
            ...deployment,
            profile: QUAI_SAFE_PROFILE,
        });
        const upstream = findSafe(account, recipient, deployment);
        assert.equal(BigInt(receiving.account) >> 151n, 0n);
        assert.notEqual(receiving.account, upstream.account);
        assert.notEqual(receiving.saltNonce, upstream.saltNonce);
    });
    it('accepts standard typed and personal-sign signatures and binds account/chain', function () {
        const key = new SigningKey(randomBytes(32)),
            owner = computeAddress(key.publicKey);
        const request = safeRequest(9n, account, [{ target: recipient, value: 1n, data: '0x' }], 0n);
        const digest = TypedDataEncoder.hash(request.domain, request.types, request.value);
        const typed = key.sign(digest).serialized;
        const personal = safePersonalSignature(key.sign(hashMessage(getBytes(digest))).serialized);
        assert.equal(safeSigner(request, typed), owner);
        assert.equal(safeSigner(request, personal), owner);
        assert.notEqual(safeSigner({ ...request, domain: safeDomain(15000n, account) }, personal), owner);
        const message = safeMessageRequest(9n, account, digest as `0x${string}`);
        assert.equal(message.value.message, digest);
    });
    it('bounds canonical batches and rejects fees and arbitrary delegatecalls', function () {
        const calls = [
            { target: account, value: 1n, data: '0x' as const },
            { target: recipient, value: 0n, data: '0x1234' as const },
        ];
        const request = safeRequest(9n, recipient, calls, 0n, deployment.multiSendCallOnly);
        const encoded = encodeSafeExecute(request, '0x');
        assert.deepEqual(decodeSponsoredSafe(encoded, 0n, deployment.multiSendCallOnly).calls, calls);
        assert.throws(() => decodeSponsoredSafe((encoded + '00') as `0x${string}`, 0n, deployment.multiSendCallOnly));
        assert.throws(() => decodeSponsoredSafe(encoded, 0n, account));
        assert.throws(() =>
            decodeSponsoredSafe(
                encodeSafeExecute({ ...request, value: { ...request.value, gasPrice: 1n } }, '0x'),
                0n,
                deployment.multiSendCallOnly,
            ),
        );
    });
});
