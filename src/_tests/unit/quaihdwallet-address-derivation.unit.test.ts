/* eslint-disable @typescript-eslint/no-unused-vars */
import assert from 'assert';
import { loadTests } from '../utils.js';
import { Mnemonic, QuaiHDWallet, Zone, NeuteredAddressInfo } from '../../index.js';

interface TestCaseQuaiAddressDerivation {
    mnemonic: string;
    addresses: Array<{
        zone: string;
        account: number;
        addresses: Array<NeuteredAddressInfo>;
    }>;
}

describe('QuaiHDWallet Address Derivation', function () {
    this.timeout(2 * 60 * 1000);
    const tests = loadTests<TestCaseQuaiAddressDerivation>('quai-address-derivation');

    for (const test of tests) {
        it('derives addresses correctly', function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);

            for (const addressesInfo of test.addresses) {
                const zone = addressesInfo.zone as Zone;
                const account = addressesInfo.account;

                for (const expectedAddressInfo of addressesInfo.addresses) {
                    const derivedAddressInfo = quaiWallet.getNextAddressSync(account, zone);
                    assert.deepEqual(
                        derivedAddressInfo,
                        expectedAddressInfo,
                        `Address mismatch for zone ${zone}, account ${account}, expected: ${JSON.stringify(expectedAddressInfo)}, derived: ${JSON.stringify(derivedAddressInfo)}`,
                    );
                }
            }
        });
    }
});

describe('QuaiHDWallet Address Getters', function () {
    this.timeout(2 * 60 * 1000);
    const tests = loadTests<TestCaseQuaiAddressDerivation>('quai-address-derivation');

    for (const test of tests) {
        const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
        const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);

        // Generate all addresses first
        for (const addressesInfo of test.addresses) {
            const zone = addressesInfo.zone as Zone;
            const account = addressesInfo.account;
            for (const _ of addressesInfo.addresses) {
                quaiWallet.getNextAddressSync(account, zone);
            }
        }

        it('getAddressInfo returns correct address info', function () {
            for (const addressesInfo of test.addresses) {
                for (const expectedAddressInfo of addressesInfo.addresses) {
                    const addressInfo = quaiWallet.getAddressInfo(expectedAddressInfo.address);
                    assert.deepEqual(
                        addressInfo,
                        expectedAddressInfo,
                        `Address info mismatch for address ${expectedAddressInfo.address}`,
                    );
                }
            }
        });

        it('getAddressesForZone returns all addresses for specified zone', function () {
            for (const addressesInfo of test.addresses) {
                const zone = addressesInfo.zone as Zone;
                const addresses = quaiWallet.getAddressesForZone(zone);
                const expectedAddresses = test.addresses
                    .filter((info) => info.zone === zone)
                    .flatMap((info) => info.addresses);

                assert.deepEqual(addresses, expectedAddresses, `Addresses mismatch for zone ${zone}`);
            }
        });

        it('getAddressesForAccount returns all addresses for specified account', function () {
            const accountMap = new Map<number, NeuteredAddressInfo[]>();

            // Group expected addresses by account
            for (const addressesInfo of test.addresses) {
                const account = addressesInfo.account;
                if (!accountMap.has(account)) {
                    accountMap.set(account, []);
                }
                accountMap.get(account)!.push(...addressesInfo.addresses);
            }

            // Test each account
            for (const [account, expectedAddresses] of accountMap) {
                const addresses = quaiWallet.getAddressesForAccount(account);
                assert.deepEqual(addresses, expectedAddresses, `Addresses mismatch for account ${account}`);
            }
        });

        it('returns empty arrays for non-existent zones and accounts', function () {
            const nonExistentZone = '0x22' as Zone;
            const nonExistentAccount = 999;

            assert.deepEqual(quaiWallet.getAddressesForZone(nonExistentZone), []);
            assert.deepEqual(quaiWallet.getAddressesForAccount(nonExistentAccount), []);
        });
    }
});

describe('Basic Address Management', function () {
    const tests = loadTests<TestCaseQuaiAddressDerivation>('quai-address-derivation');

    for (const test of tests) {
        const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
        const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);

        it('should add addresses correctly', function () {
            // Test with addresses from the first zone/account in test data
            const firstZoneAddresses = test.addresses[0].addresses;
            const firstAddress = firstZoneAddresses[0];

            // Add address using the same account and index from test data
            const addedAddress = quaiWallet.addAddress(firstAddress.account, firstAddress.index);

            assert.deepEqual(
                addedAddress,
                firstAddress,
                `Added address does not match expected address for index ${firstAddress.index}`,
            );

            // Verify the address was added correctly by retrieving it
            const retrievedAddress = quaiWallet.getAddressInfo(firstAddress.address);
            assert.deepEqual(retrievedAddress, firstAddress, 'Retrieved address does not match added address');

            // Test adding same address index again should throw error
            assert.throws(
                () => quaiWallet.addAddress(firstAddress.account, firstAddress.index),
                Error,
                `Address for index ${firstAddress.index} already exists`,
            );
        });

        it('should handle invalid indices correctly', function () {
            // Test with negative index
            assert.throws(() => quaiWallet.addAddress(0, -1), Error, 'Negative index should throw error');
        });

        it('should handle invalid accounts correctly', function () {
            // Test with negative account
            assert.throws(() => quaiWallet.addAddress(-1, 0), Error, 'Negative account should throw error');
        });

        it('should reject indices that derive invalid addresses', function () {
            // For Cyprus1 (0x00) and account 0:
            // Index 518 derives an invalid address (wrong zone or ledger)
            // Index 519 derives the first valid address

            // Test invalid address index
            assert.throws(
                () => quaiWallet.addAddress(0, 518),
                Error,
                'Failed to derive a valid address zone for the index 518',
            );
        });

        it('should reject indices that derive duplicate addresses', function () {
            // Test that adding an existing address index throws error
            assert.throws(() => quaiWallet.addAddress(0, 519), Error, 'Address for index 519 already exists');
        });
    }
});
