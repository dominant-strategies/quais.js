import assert from 'assert';
import { loadTests } from '../utils.js';
import { QiHDWallet, Mnemonic, Zone } from '../../index.js';

interface TestCaseImportPrivKey {
    shouldSucceed: boolean;
    privateKey: string;
    error?: string;
    pubKey?: string;
    address?: string;
    zone?: string;
}

describe('QiHDWallet Import Private Key', function () {
    const tests = loadTests<TestCaseImportPrivKey>('qi-wallet-import-privkey');

    let wallet: QiHDWallet;

    beforeEach(function () {
        const mnemonic = Mnemonic.fromPhrase('test test test test test test test test test test test junk');
        wallet = QiHDWallet.fromMnemonic(mnemonic);
    });

    for (const test of tests) {
        if (test.shouldSucceed) {
            it(`should successfully import private key ${test.privateKey}`, async function () {
                const addressInfo = await wallet.importPrivateKey(test.privateKey);

                assert.strictEqual(
                    addressInfo.pubKey,
                    test.pubKey,
                    `Public key mismatch, expected: ${test.pubKey}, got: ${addressInfo.pubKey}`,
                );

                assert.strictEqual(
                    addressInfo.address,
                    test.address,
                    `Address mismatch, expected: ${test.address}, got: ${addressInfo.address}`,
                );

                assert.strictEqual(
                    addressInfo.zone,
                    test.zone,
                    `Zone mismatch, expected: ${test.zone}, got: ${addressInfo.zone}`,
                );

                assert.strictEqual(
                    addressInfo.derivationPath,
                    test.privateKey,
                    'Private key should be stored in derivationPath',
                );
            });
        } else {
            it(`should fail to import invalid private key ${test.privateKey}`, async function () {
                await assert.rejects(
                    async () => {
                        await wallet.importPrivateKey(test.privateKey);
                    },
                    (error: Error) => {
                        assert.ok(
                            error.message.includes(test.error!),
                            `Expected error message to include "${test.error}", got "${error.message}"`,
                        );
                        return true;
                    },
                );
            });
        }
    }

    it('should prevent duplicate imports of the same private key', async function () {
        const validPrivateKey = tests.find((t) => t.shouldSucceed)!.privateKey;

        // First import should succeed
        await wallet.importPrivateKey(validPrivateKey);

        // Second import should fail
        await assert.rejects(
            async () => {
                await wallet.importPrivateKey(validPrivateKey);
            },
            (error: Error) => {
                assert.ok(
                    error.message.includes('already exists in wallet'),
                    'Expected error message to indicate duplicate address',
                );
                return true;
            },
        );
    });

    it('should return all imported addresses when no zone specified', async function () {
        const validTests = tests.filter((t) => t.shouldSucceed);
        for (const test of validTests) {
            await wallet.importPrivateKey(test.privateKey);
        }

        const importedAddresses = wallet.getImportedAddresses();

        assert.strictEqual(importedAddresses.length, validTests.length, 'Should return all imported addresses');

        for (let i = 0; i < validTests.length; i++) {
            assert.strictEqual(
                importedAddresses[i].address,
                validTests[i].address,
                'Imported address should match test data',
            );
        }
    });

    it('should return only addresses for specified zone', async function () {
        const validTests = tests.filter((t) => t.shouldSucceed);
        for (const test of validTests) {
            await wallet.importPrivateKey(test.privateKey);
        }

        const testZone = validTests[0].zone;
        const zoneAddresses = wallet.getImportedAddresses(testZone as Zone);

        const expectedAddresses = validTests.filter((t) => t.zone === testZone);

        assert.strictEqual(
            zoneAddresses.length,
            expectedAddresses.length,
            `Should return only addresses for zone ${testZone}`,
        );

        for (let i = 0; i < expectedAddresses.length; i++) {
            assert.strictEqual(
                zoneAddresses[i].address,
                expectedAddresses[i].address,
                'Zone-filtered address should match test data',
            );
        }
    });

    it('should return empty array when no addresses imported', function () {
        const addresses = wallet.getImportedAddresses();
        assert.deepStrictEqual(addresses, [], 'Should return empty array when no addresses imported');
    });

    it('should return empty array when no addresses in specified zone', async function () {
        const validTest = tests.find((t) => t.shouldSucceed)!;
        await wallet.importPrivateKey(validTest.privateKey);

        const differentZone = '0x22';
        const addresses = wallet.getImportedAddresses(differentZone as Zone);

        assert.deepStrictEqual(addresses, [], 'Should return empty array when no addresses in specified zone');
    });
});
