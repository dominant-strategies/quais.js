import assert from 'assert';
import { loadTests } from '../utils.js';
import { QiHDWallet, SerializedQiHDWallet, Zone, AddressStatus } from '../../index.js';

describe('QiHDWallet Serialization/Deserialization', function () {
    this.timeout(10000);
    const tests = loadTests<SerializedQiHDWallet>('qi-wallet-serialization');

    for (const test of tests) {
        it('should correctly deserialize and reserialize wallet state', async function () {
            // First deserialize the wallet from test data
            const deserializedWallet = await QiHDWallet.deserialize(test);

            // Now serialize it back
            const serializedWallet = deserializedWallet.serialize();

            // Verify all properties match the original test data
            assert.strictEqual(serializedWallet.version, test.version, 'Version mismatch');
            assert.strictEqual(serializedWallet.phrase, test.phrase, 'Phrase mismatch');
            assert.strictEqual(serializedWallet.coinType, test.coinType, 'Coin type mismatch');

            // Compare addresses
            assert.deepStrictEqual(
                serializedWallet.addresses.sort((a, b) => a.index - b.index),
                test.addresses.sort((a, b) => a.index - b.index),
                'Addresses mismatch',
            );

            // Compare sender payment code info
            assert.deepStrictEqual(
                serializedWallet.senderPaymentCodeInfo,
                test.senderPaymentCodeInfo,
                'Sender payment code info mismatch',
            );

            // Finally compare the entire serialized object
            assert.deepStrictEqual(
                serializedWallet,
                test,
                'Complete serialized wallet does not match original test data',
            );
        });

        it('should maintain wallet functionality after deserialization', async function () {
            const deserializedWallet = await QiHDWallet.deserialize(test);
            const zone = Zone.Cyprus1;

            // Verify the wallet has the correct number of addresses
            const externalAddresses = deserializedWallet.getAddressesForZone(zone);
            assert.strictEqual(
                externalAddresses.length,
                test.addresses.filter((addr) => addr.derivationPath === 'BIP44:external' && addr.zone === zone).length,
                'External addresses count mismatch',
            );

            // Verify the wallet has the correct number of change addresses
            const changeAddresses = deserializedWallet.getChangeAddressesForZone(zone);
            assert.strictEqual(
                changeAddresses.length,
                test.addresses.filter((addr) => addr.derivationPath === 'BIP44:change' && addr.zone === zone).length,
                'Change addresses count mismatch',
            );

            // Verify gap addresses
            const gapAddresses = deserializedWallet.getGapAddressesForZone(zone);
            assert.strictEqual(
                gapAddresses.length,
                test.addresses.filter(
                    (addr) =>
                        addr.derivationPath === 'BIP44:external' &&
                        addr.zone === zone &&
                        addr.status === AddressStatus.UNUSED,
                ).length,
                'Gap addresses count mismatch',
            );

            // Verify payment channels were correctly restored
            const paymentCodes = Object.keys(test.senderPaymentCodeInfo);
            for (const paymentCode of paymentCodes) {
                // Verify channel is open
                assert.strictEqual(
                    deserializedWallet.channelIsOpen(paymentCode),
                    true,
                    `Payment channel ${paymentCode} not restored`,
                );

                // Verify payment channel addresses for zone
                const paymentChannelAddresses = deserializedWallet.getPaymentChannelAddressesForZone(paymentCode, zone);
                assert.strictEqual(
                    paymentChannelAddresses.length,
                    test.addresses.filter((addr) => addr.derivationPath === paymentCode && addr.zone === zone).length,
                    'Payment channel addresses count mismatch',
                );

                // Verify gap payment channel addresses
                const gapPaymentChannelAddresses = deserializedWallet.getGapPaymentChannelAddressesForZone(
                    paymentCode,
                    zone,
                );
                assert.strictEqual(
                    gapPaymentChannelAddresses.length,
                    test.addresses.filter(
                        (addr) => addr.derivationPath === paymentCode && addr.status === AddressStatus.UNUSED,
                    ).length,
                    'Gap payment channel addresses count mismatch',
                );

                // Verify the addresses match the expected ones
                const expectedPaymentChannelAddresses = test.addresses
                    .filter((addr) => addr.derivationPath === paymentCode && addr.zone === zone)
                    .sort((a, b) => a.index - b.index);

                assert.deepStrictEqual(
                    paymentChannelAddresses.sort((a, b) => a.index - b.index),
                    expectedPaymentChannelAddresses,
                    'Payment channel addresses do not match expected addresses',
                );
            }
        });

        it('should correctly handle gap addresses and payment channel addresses', async function () {
            const deserializedWallet = await QiHDWallet.deserialize(test);
            const zone = '0x00' as Zone;

            // Test gap addresses functionality
            const gapAddresses = deserializedWallet.getGapAddressesForZone(zone);
            for (const addr of gapAddresses) {
                assert.strictEqual(addr.status, AddressStatus.UNUSED, 'Gap address should be unused');
                assert.strictEqual(addr.derivationPath, 'BIP44:external', 'Gap address should be external');
                assert.strictEqual(addr.zone, zone, 'Gap address should be in correct zone');
            }

            // Test payment channel functionality for each payment code
            const paymentCodes = Object.keys(test.senderPaymentCodeInfo);
            for (const paymentCode of paymentCodes) {
                // Test gap payment channel addresses
                const gapPaymentAddresses = deserializedWallet.getGapPaymentChannelAddressesForZone(paymentCode, zone);
                for (const addr of gapPaymentAddresses) {
                    assert.strictEqual(addr.status, AddressStatus.UNUSED, 'Gap payment address should be unused');
                    assert.strictEqual(
                        addr.derivationPath,
                        paymentCode,
                        'Gap payment address should have correct payment code',
                    );
                }

                // Test zone-specific payment channel addresses
                const zonePaymentAddresses = deserializedWallet.getPaymentChannelAddressesForZone(paymentCode, zone);
                for (const addr of zonePaymentAddresses) {
                    assert.strictEqual(
                        addr.derivationPath,
                        paymentCode,
                        'Payment address should have correct payment code',
                    );
                    assert.strictEqual(addr.zone, zone, 'Payment address should be in correct zone');
                }

                // Verify all payment addresses are in the original test data
                const allTestAddresses = test.addresses
                    .filter((addr) => addr.derivationPath === paymentCode)
                    .map((addr) => addr.address);

                for (const addr of zonePaymentAddresses) {
                    assert.ok(
                        allTestAddresses.includes(addr.address),
                        'Payment address should exist in original test data',
                    );
                }
            }
        });
    }
});
