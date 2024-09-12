import { Mnemonic, QiHDWallet } from '../../index.js';
import assert from 'assert';

describe('Test generation of payment codes and payment addresses', function () {
    const ALICE_MNEMONIC =
        'empower cook violin million wool twelve involve nice donate author mammal salt royal shiver birth olympic embody hello beef suit isolate mixed text spot';
    const aliceMnemonic = Mnemonic.fromPhrase(ALICE_MNEMONIC);
    const aliceQiWallet = QiHDWallet.fromMnemonic(aliceMnemonic);

    const BOB_MNEMONIC =
        'innocent perfect bus miss prevent night oval position aspect nut angle usage expose grace juice';
    const bobMnemonic = Mnemonic.fromPhrase(BOB_MNEMONIC);
    const bobQiWallet = QiHDWallet.fromMnemonic(bobMnemonic);

    it('generates payment codes and payment addresses for Bob and Alice', async function () {
        const alicePaymentCode = await aliceQiWallet.getPaymentCode(0);
        assert.equal(
            alicePaymentCode,
            'PM8TJTzqM3pqdQxBA52AX9M5JBCdkyJYWpNfJZpNX9H7FY2XitYFd99LSfCCQamCN5LubK1YNQMoz33g1WgVNX2keWoDtfDG9H1AfGcupRzHsPn6Rc2z',
        );

        const bobPaymentCode = await bobQiWallet.getPaymentCode(0);
        assert.equal(
            bobPaymentCode,
            'PM8TJaDZL8og3dTyeBF2DFZnhiNAKr5evrNRVJhwi3bMt6ZLvTu3wVQApup7bf5R4bYc1mxvzQzFsrTabv8B3E2syDgzHwGcQUzLWrf5Nt2A2K6kdeAC',
        );

        // Alice generates a payment address for sending funds to Bob
        const bobAddress = await aliceQiWallet.generateSendAddress(bobPaymentCode);
        assert.equal(bobAddress, '0x798e976dfAffe2174c3b21ac7116A35D09DB837d');

        // Bob generates a payment address for receiving funds from Alice
        const receiveAddress = await bobQiWallet.generateReceiveAddress(alicePaymentCode);
        assert.equal(receiveAddress, '0x798e976dfAffe2174c3b21ac7116A35D09DB837d');
    });
});
