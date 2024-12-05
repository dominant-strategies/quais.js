import { Mnemonic, QiHDWallet, Zone } from '../../index.js';
import assert from 'assert';

const ALICE_MNEMONIC =
    'empower cook violin million wool twelve involve nice donate author mammal salt royal shiver birth olympic embody hello beef suit isolate mixed text spot';
const BOB_MNEMONIC = 'innocent perfect bus miss prevent night oval position aspect nut angle usage expose grace juice';

describe('Test generation of payment codes and payment addresses', function () {
    this.timeout(10000);
    const aliceMnemonic = Mnemonic.fromPhrase(ALICE_MNEMONIC);
    const aliceQiWallet = QiHDWallet.fromMnemonic(aliceMnemonic);

    const bobMnemonic = Mnemonic.fromPhrase(BOB_MNEMONIC);
    const bobQiWallet = QiHDWallet.fromMnemonic(bobMnemonic);

    it('generates payment codes and payment addresses for Bob and Alice', function () {
        const alicePaymentCode = aliceQiWallet.getPaymentCode(0);
        assert.equal(
            alicePaymentCode,
            'PM8TJMwuDmEtpL9JNqRpre1RvimtqQvwzGHZr8S95HjKmabApLkSPyprsaUZAzWxAscgBbJo2XRqrkD649YZB9qU9HkNFVGoaN9UYv2DCGrcErz21Nfz',
        );

        const bobPaymentCode = bobQiWallet.getPaymentCode(0);
        assert.equal(
            bobPaymentCode,
            'PM8TJJYDFEugmzgwU9EoT3xEhiEy5tPLJCxcwa9HFEM2bs2zsGRdxpkJwsKXi2u3Tuu5AK3bUoethFD3oDB2r2vnUJv4W9sGWdvffNUriHS1D1szfbxn',
        );

        // Alice generates a payment address for sending funds to Bob
        const bobInfoAddress = aliceQiWallet.getNextSendAddress(bobPaymentCode, Zone.Cyprus1);
        assert.equal(bobInfoAddress.address, '0x00aFce8641EE61598B582ea02Df96623280E55d9');

        // Bob generates a payment address for receiving funds from Alice
        const receiveInfoAddress = bobQiWallet.getNextReceiveAddress(alicePaymentCode, Zone.Cyprus1);
        assert.equal(receiveInfoAddress.address, '0x00aFce8641EE61598B582ea02Df96623280E55d9');
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
