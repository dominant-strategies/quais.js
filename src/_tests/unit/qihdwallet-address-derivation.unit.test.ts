/* eslint-disable @typescript-eslint/no-unused-vars */
import assert from 'assert';
import { loadTests } from '../utils.js';
import { Mnemonic, QiHDWallet, Zone, QiAddressInfo } from '../../index.js';

interface TestCaseQiAddressDerivation {
    mnemonic: string;
    externalAddresses: Array<{
        zone: string;
        addresses: Array<QiAddressInfo>;
    }>;
    changeAddresses: Array<{
        zone: string;
        addresses: Array<QiAddressInfo>;
    }>;
    paymentCodeAddresses: {
        bobMnemonic: string;
        sendAddresses: Array<{
            zone: string;
            addresses: Array<QiAddressInfo>;
        }>;
        receiveAddresses: Array<{
            zone: string;
            addresses: Array<QiAddressInfo>;
        }>;
    };
}

describe('QiHDWallet Address Derivation', function () {
    this.timeout(2 * 60 * 1000);
    const tests = loadTests<TestCaseQiAddressDerivation>('qi-address-derivation');

    for (const test of tests) {
        it('derives external addresses correctly', function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const qiWallet = QiHDWallet.fromMnemonic(mnemonic);

            for (const externalAddressesInfo of test.externalAddresses) {
                const zone = externalAddressesInfo.zone as Zone;
                for (const expectedAddressInfo of externalAddressesInfo.addresses) {
                    const derivedAddressInfo = qiWallet.getNextAddressSync(0, zone);
                    assert.deepEqual(
                        derivedAddressInfo,
                        expectedAddressInfo,
                        `External address mismatch for zone ${zone}, expected: ${JSON.stringify(expectedAddressInfo, null, 2)}\nderived: ${JSON.stringify(derivedAddressInfo, null, 2)}`,
                    );
                }
            }
        });

        it('derives change addresses correctly', function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const qiWallet = QiHDWallet.fromMnemonic(mnemonic);

            for (const changeAddressesInfo of test.changeAddresses) {
                const zone = changeAddressesInfo.zone as Zone;
                for (const expectedAddressInfo of changeAddressesInfo.addresses) {
                    const derivedAddressInfo = qiWallet.getNextChangeAddressSync(0, zone);
                    assert.deepEqual(
                        derivedAddressInfo,
                        expectedAddressInfo,
                        `Change address mismatch for zone ${zone}, expected: ${JSON.stringify(expectedAddressInfo, null, 2)}, derived: ${JSON.stringify(derivedAddressInfo, null, 2)}`,
                    );
                }
            }
        });

        it('derives payment code send addresses correctly', function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const qiWallet = QiHDWallet.fromMnemonic(mnemonic);

            const bobMnemonic = Mnemonic.fromPhrase(test.paymentCodeAddresses.bobMnemonic);
            const bobQiWallet = QiHDWallet.fromMnemonic(bobMnemonic);
            console.log('getting payment code for Bob...');
            const bobPaymentCode = bobQiWallet.getPaymentCode(0);
            console.log('payment code for Bob: ', bobPaymentCode);
            qiWallet.openChannel(bobPaymentCode);
            console.log('opened channel for Bob...');
            for (const sendAddressesInfo of test.paymentCodeAddresses.sendAddresses) {
                const zone = sendAddressesInfo.zone as Zone;
                for (const expectedAddressInfo of sendAddressesInfo.addresses) {
                    const derivedAddressInfo = qiWallet.getNextSendAddress(bobPaymentCode, zone);
                    assert.deepEqual(
                        derivedAddressInfo,
                        expectedAddressInfo,
                        `Payment code send address mismatch, expected: ${JSON.stringify(expectedAddressInfo, null, 2)}, derived: ${JSON.stringify(derivedAddressInfo, null, 2)}`,
                    );
                }
            }
        });

        it('derives payment code receive addresses correctly', function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const qiWallet = QiHDWallet.fromMnemonic(mnemonic);

            const bobMnemonic = Mnemonic.fromPhrase(test.paymentCodeAddresses.bobMnemonic);
            const bobQiWallet = QiHDWallet.fromMnemonic(bobMnemonic);
            const bobPaymentCode = bobQiWallet.getPaymentCode(0);

            qiWallet.openChannel(bobPaymentCode);

            for (const receiveAddressesInfo of test.paymentCodeAddresses.receiveAddresses) {
                const zone = receiveAddressesInfo.zone as Zone;
                for (const expectedAddressInfo of receiveAddressesInfo.addresses) {
                    const derivedAddressInfo = qiWallet.getNextReceiveAddress(bobPaymentCode, zone);
                    assert.deepEqual(
                        derivedAddressInfo,
                        expectedAddressInfo,
                        `Payment code receive address mismatch, expected: ${JSON.stringify(expectedAddressInfo, null, 2)}, derived: ${JSON.stringify(derivedAddressInfo, null, 2)}`,
                    );
                }
            }
        });
    }
});

describe('QiHDWallet Address Getters', function () {
    this.timeout(2 * 60 * 1000);
    const tests = loadTests<TestCaseQiAddressDerivation>('qi-address-derivation');

    for (const test of tests) {
        const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
        const qiWallet = QiHDWallet.fromMnemonic(mnemonic);

        for (const externalAddressesInfo of test.externalAddresses) {
            const zone = externalAddressesInfo.zone as Zone;
            for (const _ of externalAddressesInfo.addresses) {
                qiWallet.getNextAddressSync(0, zone);
            }
        }

        for (const changeAddressesInfo of test.changeAddresses) {
            const zone = changeAddressesInfo.zone as Zone;
            for (const _ of changeAddressesInfo.addresses) {
                qiWallet.getNextChangeAddressSync(0, zone);
            }
        }

        const bobMnemonic = Mnemonic.fromPhrase(test.paymentCodeAddresses.bobMnemonic);
        const bobQiWallet = QiHDWallet.fromMnemonic(bobMnemonic);
        const bobPaymentCode = bobQiWallet.getPaymentCode(0);
        qiWallet.openChannel(bobPaymentCode);

        for (const receiveAddressesInfo of test.paymentCodeAddresses.receiveAddresses) {
            const zone = receiveAddressesInfo.zone as Zone;
            for (const _ of receiveAddressesInfo.addresses) {
                qiWallet.getNextReceiveAddress(bobPaymentCode, zone);
            }
        }

        it('getAddressInfo returns correct address info', function () {
            for (const externalAddressesInfo of test.externalAddresses) {
                for (const expectedAddressInfo of externalAddressesInfo.addresses) {
                    const addressInfo = qiWallet.getAddressInfo(expectedAddressInfo.address);
                    assert.deepEqual(
                        addressInfo,
                        expectedAddressInfo,
                        `External address info mismatch for address ${expectedAddressInfo.address} (got ${JSON.stringify(addressInfo)}, expected ${JSON.stringify(expectedAddressInfo)})`,
                    );
                }
            }
        });

        it('getChangeAddressInfo returns correct address info', function () {
            for (const changeAddressesInfo of test.changeAddresses) {
                for (const expectedAddressInfo of changeAddressesInfo.addresses) {
                    const addressInfo = qiWallet.getAddressInfo(expectedAddressInfo.address);
                    assert.deepEqual(
                        addressInfo,
                        expectedAddressInfo,
                        `Change address info mismatch for address ${expectedAddressInfo.address} (got ${JSON.stringify(addressInfo)}, expected ${JSON.stringify(expectedAddressInfo)})`,
                    );
                }
            }
        });

        it('getAddressesForZone returns all addresses for specified zone', function () {
            for (const externalAddressesInfo of test.externalAddresses) {
                const zone = externalAddressesInfo.zone as Zone;
                const addresses = qiWallet.getAddressesForZone(zone);
                assert.deepEqual(
                    addresses,
                    externalAddressesInfo.addresses,
                    `External addresses mismatch for zone ${zone} (got ${JSON.stringify(addresses)}, expected ${JSON.stringify(externalAddressesInfo.addresses)})`,
                );
            }
        });

        it('getChangeAddressesForZone returns all change addresses for specified zone', function () {
            for (const changeAddressesInfo of test.changeAddresses) {
                const zone = changeAddressesInfo.zone as Zone;
                const addresses = qiWallet.getChangeAddressesForZone(zone);
                assert.deepEqual(
                    addresses,
                    changeAddressesInfo.addresses,
                    `Change addresses mismatch for zone ${zone} (got ${JSON.stringify(addresses)}, expected ${JSON.stringify(changeAddressesInfo.addresses)})`,
                );
            }
        });

        it.skip('getPaymentChannelAddressesForZone returns correct addresses', function () {
            for (const receiveAddressesInfo of test.paymentCodeAddresses.receiveAddresses) {
                const zone = receiveAddressesInfo.zone as Zone;
                const addresses = qiWallet.getPaymentChannelAddressesForZone(bobPaymentCode, zone);
                assert.deepEqual(
                    addresses,
                    receiveAddressesInfo.addresses,
                    `Payment channel addresses mismatch for zone ${zone} (got: ${JSON.stringify(addresses, null, 2)}\nexpected: ${JSON.stringify(receiveAddressesInfo.addresses, null, 2)})`,
                );
            }
        });

        it('getAddressesForAccount returns all addresses for specified account', function () {
            // Test for account 0 (the one used in test data)
            const allAddresses = [
                ...test.externalAddresses.flatMap((info) => info.addresses),
                ...test.changeAddresses.flatMap((info) => info.addresses),
                ...test.paymentCodeAddresses.receiveAddresses.flatMap((info) => info.addresses),
            ].filter((addr) => addr.account === 0);

            const addresses = qiWallet.getAddressesForAccount(0);
            assert.deepEqual(
                addresses,
                allAddresses,
                `Addresses mismatch for account 0. Got: ${JSON.stringify(addresses, null, 2)}\nExpected: ${JSON.stringify(allAddresses, null, 2)})`,
            );
        });

        it('returns empty arrays for non-existent zones and accounts', function () {
            const nonExistentZone = '0x22' as Zone;
            const nonExistentAccount = 999;

            assert.deepEqual(qiWallet.getAddressesForZone(nonExistentZone), []);
            assert.deepEqual(qiWallet.getChangeAddressesForZone(nonExistentZone), []);
            assert.deepEqual(qiWallet.getPaymentChannelAddressesForZone(bobPaymentCode, nonExistentZone), []);
            assert.deepEqual(qiWallet.getAddressesForAccount(nonExistentAccount), []);
        });
    }
});

describe('Basic Address Management', function () {
    const tests = loadTests<TestCaseQiAddressDerivation>('qi-address-derivation');

    for (const test of tests) {
        const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
        const qiWallet = QiHDWallet.fromMnemonic(mnemonic);

        it('should add external addresses correctly', function () {
            // Test with addresses from the first zone in test data
            const zoneAddresses = test.externalAddresses[0].addresses;
            const firstAddress = zoneAddresses[0];

            // Add address using the same account and index from test data
            const addedAddress = qiWallet.addAddress(firstAddress.account, firstAddress.index);

            assert.deepEqual(
                addedAddress,
                firstAddress,
                `Added address does not match expected address for index ${firstAddress.index}`,
            );

            // Verify the address was added correctly by retrieving it
            const retrievedAddress = qiWallet.getAddressInfo(firstAddress.address);
            assert.deepEqual(retrievedAddress, firstAddress, 'Retrieved address does not match added address');

            // Test adding same address index again should throw error
            assert.throws(
                () => qiWallet.addAddress(firstAddress.account, firstAddress.index),
                Error,
                `Address index ${firstAddress.index} already exists in wallet under path BIP44:external`,
            );
        });

        it('should add change addresses correctly', function () {
            // Test with change addresses from the first zone in test data
            const zoneChangeAddresses = test.changeAddresses[0].addresses;
            const firstChangeAddress = zoneChangeAddresses[0];

            // Add change address using the same account and index from test data
            const addedChangeAddress = qiWallet.addChangeAddress(firstChangeAddress.account, firstChangeAddress.index);

            assert.deepEqual(
                addedChangeAddress,
                firstChangeAddress,
                `Added change address does not match expected address for index ${firstChangeAddress.index}`,
            );

            // Verify the change address was added correctly by retrieving it
            const retrievedChangeAddress = qiWallet.getAddressInfo(firstChangeAddress.address);
            assert.deepEqual(
                retrievedChangeAddress,
                firstChangeAddress,
                'Retrieved change address does not match added change address',
            );

            // Test adding same change address index again should throw error
            assert.throws(
                () => qiWallet.addChangeAddress(firstChangeAddress.account, firstChangeAddress.index),
                Error,
                `Address index ${firstChangeAddress.index} already exists in wallet under path BIP44:change`,
            );
        });

        it('should handle invalid indices correctly', function () {
            // Test with negative index
            assert.throws(() => qiWallet.addAddress(0, -1), Error, 'Negative index should throw error');

            assert.throws(() => qiWallet.addChangeAddress(0, -1), Error, 'Negative index should throw error');
        });

        it('should handle invalid accounts correctly', function () {
            // Test with negative account
            assert.throws(() => qiWallet.addAddress(-1, 0), Error, 'Negative account should throw error');

            assert.throws(() => qiWallet.addChangeAddress(-1, 0), Error, 'Negative account should throw error');
        });

        it('should reject indices that derive invalid addresses', function () {
            // For Cyprus1 (0x00) and account 0:
            // - Index 384 derives an invalid address (wrong zone or ledger)
            // - Index 385 derives the first valid external address
            // - Index 4 derives an invalid change address
            // - Index 5 derives the first valid change address

            // Test invalid external address index
            assert.throws(
                () => qiWallet.addAddress(0, 384),
                Error,
                'Failed to derive a Qi valid address for the zone 0x00',
            );

            // Test invalid change address index
            assert.throws(
                () => qiWallet.addChangeAddress(0, 4),
                Error,
                'Failed to derive a Qi valid address for the zone 0x00',
            );
        });

        it('should reject indices that derive duplicate addresses', function () {
            // Test that adding an existing address index throws error
            assert.throws(
                () => qiWallet.addAddress(0, 385),
                Error,
                'Address index 385 already exists in wallet under path BIP44:external',
            );

            // Test that adding an existing change address index throws error
            assert.throws(
                () => qiWallet.addChangeAddress(0, 5),
                Error,
                'Address index 5 already exists in wallet under path BIP44:change',
            );
        });
    }
});
