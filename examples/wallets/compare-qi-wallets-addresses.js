const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

async function compareWallets() {
    const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);

    const newQiWallet = quais.QiHDWallet.fromMnemonic(mnemonic);
    const legacyQiWallet = quais.QiHDWalletLegacy.fromMnemonic(mnemonic);

    // Create Bob's wallet
    const bobMnemonic = quais.Mnemonic.fromPhrase("innocent perfect bus miss prevent night oval position aspect nut angle usage expose grace juice");
    const bobNewQiWallet = quais.QiHDWallet.fromMnemonic(bobMnemonic);
    const bobLegacyQiWallet = quais.QiHDWalletLegacy.fromMnemonic(bobMnemonic);

    const zones = [quais.Zone.Cyprus1, quais.Zone.Cyprus2];
    const addressCount = 5;

    for (const zone of zones) {
        console.log(`Comparing addresses for zone ${zone}:`);
        
        const newAddresses = [];
        const legacyAddresses = [];

        for (let i = 0; i < addressCount; i++) {
            const newAddressInfo = await newQiWallet.getNextAddress(0, zone);
            const legacyAddressInfo = await legacyQiWallet.getNextAddress(0, zone);

            newAddresses.push(newAddressInfo);
            legacyAddresses.push(legacyAddressInfo);

            compareAddressInfo(newAddressInfo, legacyAddressInfo, i);
        }

        console.log('\nComparing change addresses:');
        for (let i = 0; i < addressCount; i++) {
            const newChangeAddressInfo = await newQiWallet.getNextChangeAddress(0, zone);
            const legacyChangeAddressInfo = await legacyQiWallet.getNextChangeAddress(0, zone);

            compareAddressInfo(newChangeAddressInfo, legacyChangeAddressInfo, i, true);
        }

        console.log('\n');
    }

    // Compare payment codes
    console.log('Comparing payment codes:');
    const newPaymentCode = newQiWallet.getPaymentCode(0);
    const legacyPaymentCode = legacyQiWallet.getPaymentCode(0);
    if (newPaymentCode === legacyPaymentCode) {
        console.log('Payment codes match.');
    } else {
        console.log('Payment codes do not match:');
        console.log('New wallet:', newPaymentCode);
        console.log('Legacy wallet:', legacyPaymentCode);
    }

    // Compare getNextReceiveAddress
    console.log('\nComparing getNextReceiveAddress:');
    const bobNewPaymentCode = bobNewQiWallet.getPaymentCode(0);
    const bobLegacyPaymentCode = bobLegacyQiWallet.getPaymentCode(0);

    for (const zone of zones) {
	console.log(`Comparing receive addresses for zone ${zone}:`);
        for (let i = 0; i < addressCount; i++) {
            const newReceiveAddress = await newQiWallet.getNextReceiveAddress(bobNewPaymentCode, zone);
            const legacyReceiveAddress = await legacyQiWallet.getNextReceiveAddress(bobLegacyPaymentCode, zone);
            compareAddressInfo(newReceiveAddress, legacyReceiveAddress, i, false, 'Receive');
        }
    }

    // Compare getNextSendAddress
    console.log('\nComparing getNextSendAddress:');
    for (const zone of zones) {
	console.log(`Comparing send addresses for zone ${zone}:`);
        for (let i = 0; i < addressCount; i++) {
            const newSendAddress = await newQiWallet.getNextSendAddress(bobNewPaymentCode, zone);
            const legacySendAddress = await legacyQiWallet.getNextSendAddress(bobLegacyPaymentCode, zone);
            compareAddressInfo(newSendAddress, legacySendAddress, i, false, 'Send');
        }
    }
}

function compareAddressInfo(newInfo, legacyInfo, index, isChange = false, addressType = '') {
    const addressTypeString = addressType ? `${addressType} ` : '';
    const changeString = isChange ? 'Change ' : '';
    if (newInfo.address !== legacyInfo.address) {
        console.log(`${changeString}${addressTypeString}Address #${index + 1} mismatch:`);
        console.log('New wallet:', newInfo.address);
        console.log('Legacy wallet:', legacyInfo.address);
    } else if (newInfo.pubKey !== legacyInfo.pubKey) {
        console.log(`${changeString}${addressTypeString}Address #${index + 1} public key mismatch:`);
        console.log('New wallet:', newInfo.pubKey);
        console.log('Legacy wallet:', legacyInfo.pubKey);
    } else if (newInfo.index !== legacyInfo.index) {
        console.log(`${changeString}${addressTypeString}Address #${index + 1} index mismatch:`);
        console.log('New wallet:', newInfo.index);
        console.log('Legacy wallet:', legacyInfo.index);
    } else {
        console.log(`${changeString}${addressTypeString}Address #${index + 1} matches.`);
    }
}

compareWallets()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
