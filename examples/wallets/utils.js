const quais = require('../../lib/commonjs/quais');
const printWalletInfo = async (name, wallet) => {
    const serializedWallet = wallet.serialize();

    // Helper function to get addresses by type and status
    const getAddressesByType = (type) => {
        if (type == 'BIP44:external' || type == 'BIP44:change') {
            return serializedWallet.addresses.filter((addr) => addr.derivationPath === type);
        }
        return serializedWallet.addresses.filter((addr) => !addr.derivationPath.startsWith('BIP44:'));
    };

    const printUnusedAddressesData = (type) => {
        const addresses = getAddressesByType(type);

        // Find the index where the last group of UNUSED addresses starts
        let lastUnusedGroupStartIndex = addresses.length;
        for (let i = addresses.length - 1; i >= 0; i--) {
            if (addresses[i].status !== 'UNUSED') {
                break;
            }
            lastUnusedGroupStartIndex = i;
        }

        // Filter addresses: UNUSED and not part of the last group
        const filteredUnusedAddresses = addresses.filter(
            (addr, index) => addr.status === 'UNUSED' && index < lastUnusedGroupStartIndex,
        );
    };

    const summary = {
        'BIP44 External Addresses': getAddressesByType('BIP44:external').length,
        'BIP44 Change Addresses': getAddressesByType('BIP44:change').length,
        'BIP47 Addresses': getAddressesByType('BIP47').length,
        'Sender Payment Code Info': Object.keys(serializedWallet.senderPaymentCodeInfo).length,
        'Coin Type': serializedWallet.coinType,
        Version: serializedWallet.version,
    };
    console.log(
        `\n**************************************************** ${name} Qi wallet summary: ************************************************\n`,
    );
    console.table(summary);

    // Print BIP44 External Addresses
    console.log(`\n${name} BIP44 External Addresses:`);
    printAddressTable(getAddressesByType('BIP44:external'));
    printUnusedAddressesData('BIP44:external');

    // Print BIP44 Change Addresses
    console.log(`\n${name} BIP44 Change Addresses:`);
    printAddressTable(getAddressesByType('BIP44:change'));
    printUnusedAddressesData('BIP44:change');

    // Print BIP47 Addresses
    console.log(`\n${name} BIP47 Addresses:`);
    printAddressTable(getAddressesByType('BIP47'));
    printUnusedAddressesData('BIP47');

    // Print Sender Payment Code Info
    console.log(`\n${name} Wallet Sender Payment Code Info:`);
    printPaymentCodeInfo(serializedWallet.senderPaymentCodeInfo);

    // Print wallet Qi balance
    const walletBalance = await wallet.getBalanceForZone(quais.Zone.Cyprus1);
    console.log(`\n=> ${name} Wallet balance: ${quais.formatQi(walletBalance)} Qi\n`);
};

function printAddressTable(addresses) {
    const addressTable = addresses.map((addr) => ({
        PubKey: addr.pubKey,
        Address: addr.address,
        Index: addr.index,
        Change: addr.change ? 'Yes' : 'No',
        Zone: addr.zone,
        Status: addr.status,
        DerivationPath: addr.derivationPath,
    }));
    console.table(addressTable);
}

function printOutpointTable(outpoints) {
    const outpointTable = outpoints.map((outpoint) => ({
        Address: outpoint.address,
        Denomination: outpoint.outpoint.denomination,
        Index: outpoint.outpoint.index,
        TxHash: outpoint.outpoint.txhash,
        Zone: outpoint.zone,
        Account: outpoint.account,
    }));
    console.table(outpointTable);
}

function printPaymentCodeInfo(paymentCodeInfo) {
    for (const [paymentCode, addressInfoArray] of Object.entries(paymentCodeInfo)) {
        console.log(`Payment Code: ${paymentCode}`);
        const paymentCodeTable = addressInfoArray.map((info) => ({
            Address: info.address,
            PubKey: info.pubKey,
            Index: info.index,
            Zone: info.zone,
            Status: info.status,
        }));
        console.table(paymentCodeTable);
    }
}

module.exports = {
    printWalletInfo,
    printAddressTable,
    printOutpointTable,
    printPaymentCodeInfo,
};
