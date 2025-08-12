import assert from 'assert';
import { JsonRpcProvider, WebSocketProvider, Shard } from '../../index.js';

describe('Provider URL Path Handling', function () {
    // Increase timeout for network operations
    this.timeout(30000);

    describe('URL validation with paths', function () {
        it('should accept URLs with paths when usePathing is false for JsonRpcProvider', function () {
            // Test that no error is thrown when creating provider with path in URL
            let provider: JsonRpcProvider | null = null;
            try {
                provider = new JsonRpcProvider('https://rpc.quai.network/cyprus1', undefined, { usePathing: false });
                assert.ok(provider, 'Provider should be created successfully');
                assert.ok(provider._urlMap, 'Provider should have URL map');
            } finally {
                if (provider) {
                    provider.destroy();
                }
            }
        });

        it('should accept URLs without paths when usePathing is true for JsonRpcProvider', function () {
            let provider: JsonRpcProvider | null = null;
            try {
                provider = new JsonRpcProvider('https://rpc.quai.network', undefined, { usePathing: true });
                assert.ok(provider, 'Provider should be created successfully');
                assert.ok(provider._urlMap, 'Provider should have URL map');
            } finally {
                if (provider) {
                    provider.destroy();
                }
            }
        });

        it('should reject invalid URLs for JsonRpcProvider', function () {
            assert.throws(
                () => {
                    new JsonRpcProvider('not-a-valid-url', undefined, { usePathing: false });
                },
                /Invalid URL/,
                'Should throw error for invalid URL',
            );
        });
    });

    describe('URL map configuration', function () {
        it('should map to Cyprus1 shard when usePathing is false for JsonRpcProvider', function () {
            const provider = new JsonRpcProvider('https://rpc.quai.network/cyprus1', undefined, { usePathing: false });
            try {
                // Check that Cyprus1 shard is in the URL map
                const hasCyprus1 = Array.from(provider._urlMap.keys()).some((key) => key === Shard.Cyprus1);
                assert.ok(hasCyprus1, 'URL map should contain Cyprus1 shard');
            } finally {
                provider.destroy();
            }
        });

        it('should create multiple shard URLs when usePathing is true for JsonRpcProvider', function () {
            const provider = new JsonRpcProvider('https://rpc.quai.network', undefined, { usePathing: true });
            try {
                // Should have multiple shards in URL map
                const mapSize = provider._urlMap.size;
                assert.ok(mapSize > 0, 'URL map should have at least one entry');
            } finally {
                provider.destroy();
            }
        });
    });

    describe('Real endpoint tests with getBlock', function () {
        it('JsonRpcProvider with usePathing=true (rpc.quai.network)', async function () {
            this.timeout(15000);
            const provider = new JsonRpcProvider('https://rpc.quai.network', undefined, { usePathing: true });

            try {
                const block = await provider.getBlock(Shard.Cyprus1, 'latest', false);
                assert.ok(block, 'Should successfully fetch block');
                assert.ok(block.header, 'Block should have header');
                assert.ok(block.header.number, 'Block should have number');
                assert.ok(block.hash, 'Block should have hash');
                console.log(`      ✓ Got block ${block.header.number} with hash ${block.hash.substring(0, 10)}...`);
            } catch (error: any) {
                // Network errors might occur, but should not be provider logic errors
                if (
                    error.code === 'ECONNREFUSED' ||
                    error.code === 'ETIMEDOUT' ||
                    error.message.includes('connect') ||
                    error.message.includes('network')
                ) {
                    this.skip();
                } else {
                    throw error;
                }
            } finally {
                provider.destroy();
            }
        });

        it('JsonRpcProvider with usePathing=false (quai.fi/cyprus1)', async function () {
            this.timeout(15000);
            const provider = new JsonRpcProvider('https://quai.fi/cyprus1', undefined, { usePathing: false });

            try {
                const block = await provider.getBlock(Shard.Cyprus1, 'latest', false);
                assert.ok(block, 'Should successfully fetch block');
                assert.ok(block.header, 'Block should have header');
                assert.ok(block.header.number, 'Block should have number');
                assert.ok(block.hash, 'Block should have hash');
                console.log(`      ✓ Got block ${block.header.number} with hash ${block.hash.substring(0, 10)}...`);
            } catch (error: any) {
                // Network errors might occur, but should not be provider logic errors
                if (
                    error.code === 'ECONNREFUSED' ||
                    error.code === 'ETIMEDOUT' ||
                    error.message.includes('connect') ||
                    error.message.includes('network')
                ) {
                    this.skip();
                } else {
                    throw error;
                }
            } finally {
                provider.destroy();
            }
        });

        it('WebSocketProvider with usePathing=true (wss://rpc.quai.network)', async function () {
            this.timeout(15000);
            let provider: WebSocketProvider | null = null;

            try {
                provider = new WebSocketProvider('wss://rpc.quai.network', undefined, { usePathing: true });

                // Give WebSocket time to connect
                await new Promise((resolve) => setTimeout(resolve, 2000));

                const block = await provider.getBlock(Shard.Cyprus1, 'latest', false);
                assert.ok(block, 'Should successfully fetch block');
                assert.ok(block.header, 'Block should have header');
                assert.ok(block.header.number, 'Block should have number');
                assert.ok(block.hash, 'Block should have hash');
                console.log(`      ✓ Got block ${block.header.number} with hash ${block.hash.substring(0, 10)}...`);
            } catch (error: any) {
                // Network errors might occur, but should not be provider logic errors
                if (
                    error.code === 'ECONNREFUSED' ||
                    error.code === 'ETIMEDOUT' ||
                    error.message.includes('connect') ||
                    error.message.includes('network') ||
                    error.message.includes('WebSocket')
                ) {
                    this.skip();
                } else {
                    throw error;
                }
            } finally {
                if (provider) {
                    await provider.destroy();
                }
            }
        });

        it('WebSocketProvider with usePathing=false (wss://quai.fi/ws/cyprus1)', async function () {
            this.timeout(15000);
            let provider: WebSocketProvider | null = null;

            try {
                provider = new WebSocketProvider('wss://quai.fi/ws/cyprus1', undefined, { usePathing: false });

                // Give WebSocket time to connect
                await new Promise((resolve) => setTimeout(resolve, 2000));

                const block = await provider.getBlock(Shard.Cyprus1, 'latest', false);
                assert.ok(block, 'Should successfully fetch block');
                assert.ok(block.header, 'Block should have header');
                assert.ok(block.header.number, 'Block should have number');
                assert.ok(block.hash, 'Block should have hash');
                console.log(`      ✓ Got block ${block.header.number} with hash ${block.hash.substring(0, 10)}...`);
            } catch (error: any) {
                // Network errors might occur, but should not be provider logic errors
                if (
                    error.code === 'ECONNREFUSED' ||
                    error.code === 'ETIMEDOUT' ||
                    error.message.includes('connect') ||
                    error.message.includes('network') ||
                    error.message.includes('WebSocket')
                ) {
                    this.skip();
                } else {
                    throw error;
                }
            } finally {
                if (provider) {
                    await provider.destroy();
                }
            }
        });
    });

    describe('Multiple provider instances', function () {
        it('should support multiple JsonRpcProvider instances with different configurations', async function () {
            this.timeout(15000);
            const providers: JsonRpcProvider[] = [];

            try {
                // Create providers with different configurations
                providers.push(new JsonRpcProvider('https://rpc.quai.network', undefined, { usePathing: true }));
                providers.push(new JsonRpcProvider('https://quai.fi/cyprus1', undefined, { usePathing: false }));

                // Both should be able to make requests
                const promises = providers.map(async (provider, index) => {
                    try {
                        const block = await provider.getBlock(Shard.Cyprus1, 'latest', false);
                        console.log(`      Provider ${index + 1}: Got block ${block?.header?.number || 'null'}`);
                        return block !== null;
                    } catch (error: any) {
                        if (
                            error.code === 'ECONNREFUSED' ||
                            error.code === 'ETIMEDOUT' ||
                            error.message.includes('connect') ||
                            error.message.includes('network')
                        ) {
                            return true; // Skip network errors
                        }
                        throw error;
                    }
                });

                const results = await Promise.all(promises);
                assert.ok(
                    results.every((r) => r),
                    'All providers should succeed or skip',
                );
            } catch (error: any) {
                if (
                    error.code === 'ECONNREFUSED' ||
                    error.code === 'ETIMEDOUT' ||
                    error.message.includes('connect') ||
                    error.message.includes('network')
                ) {
                    this.skip();
                } else {
                    throw error;
                }
            } finally {
                providers.forEach((p) => p.destroy());
            }
        });

        it('should support multiple WebSocketProvider instances with different configurations', async function () {
            this.timeout(15000);
            const providers: WebSocketProvider[] = [];

            try {
                // Create providers with different configurations
                providers.push(new WebSocketProvider('wss://rpc.quai.network', undefined, { usePathing: true }));
                providers.push(new WebSocketProvider('wss://quai.fi/ws/cyprus1', undefined, { usePathing: false }));

                // Give WebSocket providers time to connect
                await new Promise((resolve) => setTimeout(resolve, 2000));

                // Both should be able to make requests
                const promises = providers.map(async (provider, index) => {
                    try {
                        const block = await provider.getBlock(Shard.Cyprus1, 'latest', false);
                        console.log(`      Provider ${index + 1}: Got block ${block?.header?.number || 'null'}`);
                        return block !== null;
                    } catch (error: any) {
                        if (
                            error.code === 'ECONNREFUSED' ||
                            error.code === 'ETIMEDOUT' ||
                            error.message.includes('connect') ||
                            error.message.includes('network') ||
                            error.message.includes('WebSocket')
                        ) {
                            return true; // Skip network errors
                        }
                        throw error;
                    }
                });

                const results = await Promise.all(promises);
                assert.ok(
                    results.every((r) => r),
                    'All providers should succeed or skip',
                );
            } catch (error: any) {
                if (
                    error.code === 'ECONNREFUSED' ||
                    error.code === 'ETIMEDOUT' ||
                    error.message.includes('connect') ||
                    error.message.includes('network') ||
                    error.message.includes('WebSocket')
                ) {
                    this.skip();
                } else {
                    throw error;
                }
            } finally {
                await Promise.all(providers.map((p) => p.destroy()));
            }
        });
    });

    describe('Type checking', function () {
        it('should compile with correct types for JsonRpcProvider', function () {
            const provider: JsonRpcProvider = new JsonRpcProvider('https://rpc.quai.network/cyprus1', undefined, {
                usePathing: false,
            });

            // Test that provider has expected properties
            assert.ok(typeof provider.destroy === 'function', 'Provider should have destroy method');
            assert.ok(typeof provider.getBlock === 'function', 'Provider should have getBlock method');

            provider.destroy();
        });

        it('should compile with correct types for WebSocketProvider', async function () {
            const provider: WebSocketProvider = new WebSocketProvider('wss://rpc.quai.network/cyprus1', undefined, {
                usePathing: false,
            });

            // Test that provider has expected properties
            assert.ok(typeof provider.destroy === 'function', 'Provider should have destroy method');
            assert.ok(typeof provider.getBlock === 'function', 'Provider should have getBlock method');

            await provider.destroy();
        });
    });
});
