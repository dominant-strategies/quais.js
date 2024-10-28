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
                        `External address mismatch for zone ${zone}, expected: ${JSON.stringify(expectedAddressInfo)}, derived: ${JSON.stringify(derivedAddressInfo)}`,
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
                        `Change address mismatch for zone ${zone}, expected: ${JSON.stringify(expectedAddressInfo)}, derived: ${JSON.stringify(derivedAddressInfo)}`,
                    );
                }
            }
        });

        it('derives payment code send addresses correctly', function () {
            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const qiWallet = QiHDWallet.fromMnemonic(mnemonic);

            const bobMnemonic = Mnemonic.fromPhrase(test.paymentCodeAddresses.bobMnemonic);
            const bobQiWallet = QiHDWallet.fromMnemonic(bobMnemonic);
            const bobPaymentCode = bobQiWallet.getPaymentCode(0);

            qiWallet.openChannel(bobPaymentCode);

            for (const sendAddressesInfo of test.paymentCodeAddresses.sendAddresses) {
                const zone = sendAddressesInfo.zone as Zone;
                for (const expectedAddressInfo of sendAddressesInfo.addresses) {
                    const derivedAddressInfo = qiWallet.getNextSendAddress(bobPaymentCode, zone);
                    assert.deepEqual(
                        derivedAddressInfo,
                        expectedAddressInfo,
                        `Payment code send address mismatch, expected: ${JSON.stringify(expectedAddressInfo)}, derived: ${JSON.stringify(derivedAddressInfo)}`,
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
                        `Payment code receive address mismatch, expected: ${JSON.stringify(expectedAddressInfo)}, derived: ${JSON.stringify(derivedAddressInfo)}`,
                    );
                }
            }
        });
    }
});
