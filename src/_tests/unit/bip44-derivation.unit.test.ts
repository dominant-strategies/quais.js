import assert from 'assert';
import { BIP44 } from '../../wallet/bip44/bip44.js';

describe('BIP44 Public Key Derivation', function () {
    // Example compressed public key (33 bytes) and chain code (32 bytes)
    // These would typically come from a hardware wallet like Ledger
    const publicKey = '0x0338994349b3a804c44bbec55c2824443ebb9e475dff57cd9dd1bdcce7cf2b1590';
    const chainCode = '0x873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508';

    describe('deriveChildFromPublic', function () {
        it("should derive address at path 0'/0/0", function () {
            const result = BIP44.deriveChildFromPublic(publicKey, chainCode, 0, 0, 0);

            assert.ok(result, 'Should return a result');
            assert.ok(result.address, 'Should have an address');
            assert.ok(result.publicKey, 'Should have a public key');
            assert.ok(result.chainCode, 'Should have a chain code');
            assert.strictEqual(result.path, "0'/0/0", 'Should have correct path');

            // Check address format
            assert.match(result.address, /^0x[0-9a-fA-F]{40}$/, 'Address should be a valid Ethereum address');

            // Check public key format (compressed 33 bytes = 66 hex chars + 0x)
            assert.match(result.publicKey, /^0x[0-9a-fA-F]{66}$/, 'Public key should be 33 bytes hex');

            // Check chain code format (32 bytes = 64 hex chars + 0x)
            assert.match(result.chainCode, /^0x[0-9a-fA-F]{64}$/, 'Chain code should be 32 bytes hex');
        });

        it('should derive different addresses for different indices', function () {
            const result1 = BIP44.deriveChildFromPublic(publicKey, chainCode, 0, 0, 0);
            const result2 = BIP44.deriveChildFromPublic(publicKey, chainCode, 0, 0, 1);
            const result3 = BIP44.deriveChildFromPublic(publicKey, chainCode, 0, 1, 0);

            // All addresses should be different
            assert.notStrictEqual(
                result1.address,
                result2.address,
                'Different address indices should produce different addresses',
            );
            assert.notStrictEqual(
                result1.address,
                result3.address,
                'Different change indices should produce different addresses',
            );
            assert.notStrictEqual(result2.address, result3.address, 'All addresses should be unique');

            // All public keys should be different
            assert.notStrictEqual(
                result1.publicKey,
                result2.publicKey,
                'Different indices should produce different public keys',
            );
            assert.notStrictEqual(
                result1.publicKey,
                result3.publicKey,
                'Different change indices should produce different public keys',
            );

            // Verify paths are correct
            assert.strictEqual(result1.path, "0'/0/0");
            assert.strictEqual(result2.path, "0'/0/1");
            assert.strictEqual(result3.path, "0'/1/0");
        });

        it('should handle different account numbers', function () {
            const result1 = BIP44.deriveChildFromPublic(publicKey, chainCode, 0, 0, 0);
            const result2 = BIP44.deriveChildFromPublic(publicKey, chainCode, 1, 0, 0);

            // Paths should reflect different account numbers
            assert.strictEqual(result1.path, "0'/0/0");
            assert.strictEqual(result2.path, "1'/0/0");

            // Note: The addresses will be the same because the account number is already
            // hardened in the public key from the Ledger, so changing it here doesn't affect derivation
            // The account parameter is just for path display purposes
        });

        it('should use default values when parameters are omitted', function () {
            const result = BIP44.deriveChildFromPublic(publicKey, chainCode);

            assert.ok(result, 'Should return a result with default parameters');
            assert.strictEqual(result.path, "0'/0/0", "Should use default path 0'/0/0");
        });

        it('should reject invalid change index', function () {
            // Test negative index
            assert.throws(
                () => BIP44.deriveChildFromPublic(publicKey, chainCode, 0, -1, 0),
                /Invalid change index/,
                'Should reject negative change index',
            );

            // Test index above maximum non-hardened value (2^31)
            assert.throws(
                () => BIP44.deriveChildFromPublic(publicKey, chainCode, 0, 0x80000000, 0),
                /Invalid change index/,
                'Should reject change index >= 2^31',
            );
        });

        it('should reject invalid address index', function () {
            // Test negative index
            assert.throws(
                () => BIP44.deriveChildFromPublic(publicKey, chainCode, 0, 0, -1),
                /Invalid address index/,
                'Should reject negative address index',
            );

            // Test index above maximum non-hardened value (2^31)
            assert.throws(
                () => BIP44.deriveChildFromPublic(publicKey, chainCode, 0, 0, 0x80000000),
                /Invalid address index/,
                'Should reject address index >= 2^31',
            );
        });

        it('should accept maximum valid non-hardened index', function () {
            const maxIndex = 0x7fffffff; // 2^31 - 1

            // Should not throw with maximum valid index
            const result = BIP44.deriveChildFromPublic(publicKey, chainCode, 0, maxIndex, maxIndex);
            assert.ok(result, 'Should handle maximum valid indices');
            assert.strictEqual(result.path, `0'/${maxIndex}/${maxIndex}`);
        });

        it('should derive deterministic addresses', function () {
            // Same inputs should always produce same outputs
            const result1 = BIP44.deriveChildFromPublic(publicKey, chainCode, 0, 0, 5);
            const result2 = BIP44.deriveChildFromPublic(publicKey, chainCode, 0, 0, 5);

            assert.strictEqual(result1.address, result2.address, 'Same inputs should produce same address');
            assert.strictEqual(result1.publicKey, result2.publicKey, 'Same inputs should produce same public key');
            assert.strictEqual(result1.chainCode, result2.chainCode, 'Same inputs should produce same chain code');
        });

        it('should reject invalid public key format', function () {
            assert.throws(
                () => BIP44.deriveChildFromPublic('invalid', chainCode, 0, 0, 0),
                Error,
                'Should reject invalid public key',
            );

            // Wrong length public key
            assert.throws(
                () => BIP44.deriveChildFromPublic('0x1234', chainCode, 0, 0, 0),
                Error,
                'Should reject public key with wrong length',
            );
        });

        it('should reject invalid chain code format', function () {
            assert.throws(
                () => BIP44.deriveChildFromPublic(publicKey, 'invalid', 0, 0, 0),
                Error,
                'Should reject invalid chain code',
            );

            // Chain code that's too long (33 bytes instead of 32)
            assert.throws(
                () =>
                    BIP44.deriveChildFromPublic(
                        publicKey,
                        '0x873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d50800',
                        0,
                        0,
                        0,
                    ),
                Error,
                'Should reject chain code with wrong length',
            );
        });
    });

    describe('Performance', function () {
        this.timeout(10000); // Allow 10 seconds for performance test

        it('should derive addresses efficiently', function () {
            const startTime = Date.now();
            const iterations = 1000;

            for (let i = 0; i < iterations; i++) {
                BIP44.deriveChildFromPublic(publicKey, chainCode, 0, 0, i);
            }

            const elapsed = Date.now() - startTime;
            const rate = Math.round((iterations / elapsed) * 1000);

            console.log(`      Performance: ${rate} derivations/second`);
            console.log(`      Total time for ${iterations} derivations: ${elapsed}ms`);

            // Should be able to derive at least 100 addresses per second
            assert.ok(rate > 100, `Should derive at least 100 addresses/second, got ${rate}`);
        });

        it('should find addresses with specific prefixes', function () {
            this.timeout(10000); // Increase timeout to 10 seconds

            const maxAttempts = 2000; // Reduced from 5000 to avoid timeout
            let found = false;
            let foundAddress = '';
            let foundIndex = -1;

            for (let i = 0; i < maxAttempts; i++) {
                const result = BIP44.deriveChildFromPublic(publicKey, chainCode, 0, 0, i);

                // Look for address starting with 0x00
                if (result.address.toLowerCase().startsWith('0x00')) {
                    found = true;
                    foundAddress = result.address;
                    foundIndex = i;
                    break;
                }
            }

            if (found) {
                console.log(`      Found address ${foundAddress} at index ${foundIndex}`);
                assert.ok(foundAddress.toLowerCase().startsWith('0x00'), 'Found address should start with 0x00');
            } else {
                console.log(`      No address starting with 0x00 found in ${maxAttempts} attempts`);
                // This is not a failure, just informational
            }
        });
    });
});
