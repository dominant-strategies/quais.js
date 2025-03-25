import { Mnemonic, QiHDWallet, Zone } from '../../index.js';
import assert from 'assert';

// Data taken from the test vectors in
// https://gist.github.com/SamouraiDev/6aad669604c5930864bd

const ALICE_MNEMONIC = 'response seminar brave tip suit recall often sound stick owner lottery motion';
const BOB_MNEMONIC = 'reward upper indicate eight swift arch injury crystal super wrestle already dentist';

describe('Test generation of payment codes and payment addresses', function () {
    this.timeout(10000);
    const aliceMnemonic = Mnemonic.fromPhrase(ALICE_MNEMONIC);
    const aliceQiWallet = QiHDWallet.fromMnemonic(aliceMnemonic);

    const bobMnemonic = Mnemonic.fromPhrase(BOB_MNEMONIC);
    const bobQiWallet = QiHDWallet.fromMnemonic(bobMnemonic);

    let alicePaymentCode: string;
    let bobPaymentCode: string;

    it('generates payment codes correctly', function () {
        alicePaymentCode = aliceQiWallet.getPaymentCode(0);
        assert.equal(
            alicePaymentCode,
            'PM8TJNrUrAMCZen7rKygy8kk6q2wR4a8iXXk23WNZKoSqoZGFpcYBKtmknSgYREK6q95S6Zn61YVnUEutCfMc2oVyxNJw95bdXHPdUDAw2h3QETitdY5',
        );

        bobPaymentCode = bobQiWallet.getPaymentCode(0);
        assert.equal(
            bobPaymentCode,
            'PM8TJa1iesVFYQTARdp4H278QXooMMXkhsMXakjicvpLJnHSTbUdXhrKsAJmeV89LzZx5uTKGcVM98FwPMEcza4sfDXtQDiLY3HfoJLegdXiEZ7F8B2s',
        );
    });
    it('generates addresses when Alice sends funds to Bob', function () {
        // Alice generates a payment address for sending funds to Bob
        aliceQiWallet.openChannel(bobPaymentCode);
        const bobAddressInfo = aliceQiWallet.getNextSendAddress(bobPaymentCode, Zone.Cyprus1);
        assert.equal(bobAddressInfo.index, 68);
        assert.equal(bobAddressInfo.address, '0x00bF928076eF7a4230B94d93aece96aEd0898E96');

        // Bob generates a payment address for receiving funds from Alice
        bobQiWallet.openChannel(alicePaymentCode);
        const aliceAddressInfo = bobQiWallet.getNextReceiveAddress(alicePaymentCode, Zone.Cyprus1);
        assert.equal(aliceAddressInfo.index, 68);
        assert.equal(aliceAddressInfo.address, '0x00bF928076eF7a4230B94d93aece96aEd0898E96');
    });
    it('generates addresses when Bob sends funds to Alice', function () {
        // Bob generates a payment address for sending funds to Alice
        bobQiWallet.openChannel(alicePaymentCode);
        const aliceInfoAddress = bobQiWallet.getNextSendAddress(alicePaymentCode, Zone.Cyprus1);
        assert.equal(aliceInfoAddress.index, 129);
        assert.equal(aliceInfoAddress.address, '0x0086458162879D446F94eB3156cAAA4E9d49d417');

        // Alice generates a payment address for receiving funds from Bob
        aliceQiWallet.openChannel(bobPaymentCode);
        const bobAddressInfo = aliceQiWallet.getNextReceiveAddress(bobPaymentCode, Zone.Cyprus1);
        assert.equal(bobAddressInfo.index, 129);
        assert.equal(bobAddressInfo.address, '0x0086458162879D446F94eB3156cAAA4E9d49d417');
    });
});

describe('Test opening channels', function () {
    const bobMnemonic = Mnemonic.fromPhrase(BOB_MNEMONIC);
    const bobQiWallet = QiHDWallet.fromMnemonic(bobMnemonic);
    it('opens a channel correctly', async function () {
        const paymentCode =
            'PM8TJTzqM3pqdQxBA52AX9M5JBCdkyJYWpNfJZpNX9H7FY2XitYFd99LSfCCQamCN5LubK1YNQMoz33g1WgVNX2keWoDtfDG9H1AfGcupRzHsPn6Rc2z';
        bobQiWallet.openChannel(paymentCode);
        assert.equal(bobQiWallet.channelIsOpen(paymentCode), true);
    });

    it('does nothing if the channel is already open', async function () {
        const paymentCode =
            'PM8TJTzqM3pqdQxBA52AX9M5JBCdkyJYWpNfJZpNX9H7FY2XitYFd99LSfCCQamCN5LubK1YNQMoz33g1WgVNX2keWoDtfDG9H1AfGcupRzHsPn6Rc2z';
        bobQiWallet.openChannel(paymentCode);
        assert.equal(bobQiWallet.channelIsOpen(paymentCode), true);
    });

    it('returns an error if the payment code is not valid', async function () {
        const invalidPaymentCode = 'InvalidPaymentCode';
        assert.throws(() => bobQiWallet.openChannel(invalidPaymentCode), /Invalid payment code/);
    });
});
