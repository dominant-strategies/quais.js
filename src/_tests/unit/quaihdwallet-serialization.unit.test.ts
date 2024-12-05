import assert from 'assert';
import { loadTests } from '../utils.js';
import { QuaiHDWallet, SerializedQiHDWallet, Zone } from '../../index.js';

describe('QiHDWallet Serialization/Deserialization', function () {
    this.timeout(10000);
    const tests = loadTests<SerializedQiHDWallet>('quai-wallet-serialization');

    for (const testWallet of tests) {
        it('should correctly deserialize and reserialize wallet state', async function () {
            // First deserialize the wallet from test data
            const deserializedWallet = await QuaiHDWallet.deserialize(testWallet);

            // Now serialize it back
            const serializedWallet = deserializedWallet.serialize();

            // Verify all properties match the original test data
            assert.strictEqual(serializedWallet.version, testWallet.version, 'Version mismatch');
            assert.strictEqual(serializedWallet.phrase, testWallet.phrase, 'Phrase mismatch');
            assert.strictEqual(serializedWallet.coinType, testWallet.coinType, 'Coin type mismatch');

            // Compare addresses
            assert.deepStrictEqual(
                serializedWallet.addresses.sort((a, b) => a.index - b.index),
                testWallet.addresses.sort((a, b) => a.index - b.index),
                'Addresses mismatch',
            );
        });

        it('should maintain wallet functionality after deserialization', async function () {
            const deserializedWallet = await QuaiHDWallet.deserialize(testWallet);
            const zone = Zone.Cyprus1;

            // Verify the wallet has the correct number of addresses
            const addresses = deserializedWallet.getAddressesForZone(zone);
            assert.strictEqual(
                addresses.length,
                testWallet.addresses.filter((addr) => addr.zone === zone).length,
                'Addresses count mismatch',
            );
        });

        it('should handle duplicated addresses during deserialization', async function () {
            const duplicatedWallet = {
                ...testWallet,
                addresses: [...testWallet.addresses, testWallet.addresses[0]],
            };

            const deserializedWallet = await QuaiHDWallet.deserialize(duplicatedWallet);
            const addresses = deserializedWallet.getAddressesForAccount(0);
            // verify no duplicates
            const uniqueAddresses = new Set(addresses.map((addr) => addr.address));
            assert.strictEqual(addresses.length, uniqueAddresses.size, 'Duplicated addresses should be filtered out');
        });
    }
});
