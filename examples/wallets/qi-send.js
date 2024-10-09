const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

async function main() {
    // Create provider
    console.log('RPC URL: ', process.env.RPC_URL);
    const provider = new quais.JsonRpcProvider(process.env.RPC_URL);

    // Create Alice's wallet and connect to provider
    const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
    const aliceQiWallet = quais.QiHDWallet.fromMnemonic(mnemonic);
    aliceQiWallet.connect(provider);

    console.log(`Generating Bob's wallet and payment code...`);
    const bobMnemonic = quais.Mnemonic.fromPhrase(
        'innocent perfect bus miss prevent night oval position aspect nut angle usage expose grace juice',
    );

    // Create Bob's wallet and connect to provider
    const bobQiWallet = quais.QiHDWallet.fromMnemonic(bobMnemonic);
    bobQiWallet.connect(provider);
    const bobPaymentCode = await bobQiWallet.getPaymentCode(0);

    // Alice opens a channel to send Qi to Bob
    aliceQiWallet.openChannel(bobPaymentCode, 'sender');

    // Initialize Alice's wallet
    console.log('Initializing Alice wallet...');
    await aliceQiWallet.scan(quais.Zone.Cyprus1);
    console.log('Alice wallet scan complete');

    console.log('Alice Wallet Summary:');
    printWalletInfo(aliceQiWallet);

    // Bob open channel with Alice
    const alicePaymentCode = await aliceQiWallet.getPaymentCode(0);
    bobQiWallet.openChannel(alicePaymentCode, 'receiver');

    // Bob initializes his wallet
    console.log('Initializing Bob wallet...');
    await bobQiWallet.scan(quais.Zone.Cyprus1);
    console.log('Bob wallet scan complete');

    console.log('Bob Wallet Summary:');
    printWalletInfo(bobQiWallet);

    console.log('Alice sends 1 Qi to Bob...');

    // Alice sends 1 Qi to Bob (value in Qits - 1 Qi = 1000 Qits)
    const tx = await aliceQiWallet.sendTransaction(bobPaymentCode, 1000, quais.Zone.Cyprus1, quais.Zone.Cyprus1);
    console.log(`Tx contains ${tx.txInputs?.length} inputs`);
    console.log(`Tx contains ${tx.txOutputs?.length} outputs`);
    console.log('Tx: ', tx);
    // wait for the transaction to be confirmed
    console.log('Waiting for transaction to be confirmed...');
    // const receipt = await tx.wait(); //! throws 'wait() is not a function'
    // console.log('Transaction confirmed: ', receipt);
    // sleep for 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 5000));
    // const receipt = await provider.getTransactionReceipt(tx.hash); //! throws 'invalid shard'
    // console.log('Transaction confirmed: ', receipt);

    // Bob syncs his wallet
    console.log('Syncing Bob wallet...');
    await bobQiWallet.sync(quais.Zone.Cyprus1);
    console.log('Bob wallet sync complete');

    console.log('\n******** Bob Wallet Summary (after receiving Qi from Alice):********');
    printWalletInfo(bobQiWallet);

    console.log('Syncing Alice wallet...');
    await aliceQiWallet.sync(quais.Zone.Cyprus1);
    console.log('Alice wallet sync complete');

    console.log('\n******** Alice wallet summary (after sending Qi to Bob):********');
    printWalletInfo(aliceQiWallet);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

function printWalletInfo(wallet) {
    console.log('Wallet Balance: ', wallet.getBalanceForZone(quais.Zone.Cyprus1));
    const serializedWallet = wallet.serialize();
    const summary = {
        Addresses: serializedWallet.addresses.length,
        'Change Addresses': serializedWallet.changeAddresses.length,
        'Gap Addresses': serializedWallet.gapAddresses.length,
        'Gap Change Addresses': serializedWallet.gapChangeAddresses.length,
        'Used Gap Addresses': serializedWallet.usedGapAddresses.length,
        'Used Gap Change Addresses': serializedWallet.usedGapChangeAddresses.length,
        'Receiver PaymentCode addresses': Object.keys(wallet.receiverPaymentCodeInfo).length,
        'Sender PaymentCode addresses': Object.keys(wallet.senderPaymentCodeInfo).length,
        'Available Outpoints': serializedWallet.outpoints.length,
        'Pending Outpoints': serializedWallet.pendingOutpoints.length,
        'Coin Type': serializedWallet.coinType,
        Version: serializedWallet.version,
    };

    console.log(summary);

    console.log('\nWallet Addresses:');
    const addressesTable = serializedWallet.addresses.map((addr) => ({
        PubKey: addr.pubKey,
        Address: addr.address,
        Index: addr.index,
        Change: addr.change ? 'Yes' : 'No',
        Zone: addr.zone,
    }));
    console.table(addressesTable);

    console.log('\nWallet Change Addresses:');
    const changeAddressesTable = serializedWallet.changeAddresses.map((addr) => ({
        PubKey: addr.pubKey,
        Address: addr.address,
        Index: addr.index,
        Zone: addr.zone,
    }));
    console.table(changeAddressesTable);

    console.log('\nWallet Gap Addresses:');
    const gapAddressesTable = serializedWallet.gapAddresses.map((addr) => ({
        PubKey: addr.pubKey,
        Address: addr.address,
        Index: addr.index,
        Zone: addr.zone,
    }));
    console.table(gapAddressesTable);

    console.log('\nWallet Gap Change Addresses:');
    const gapChangeAddressesTable = serializedWallet.gapChangeAddresses.map((addr) => ({
        PubKey: addr.pubKey,
        Address: addr.address,
        Index: addr.index,
        Zone: addr.zone,
    }));
    console.table(gapChangeAddressesTable);

    console.log('\nWallet Used Gap Addresses:');
    const usedGapAddressesTable = serializedWallet.usedGapAddresses.map((addr) => ({
        PubKey: addr.pubKey,
        Address: addr.address,
        Index: addr.index,
        Zone: addr.zone,
    }));
    console.table(usedGapAddressesTable);

    console.log('\nWallet Used Gap Change Addresses:');
    const usedGapChangeAddressesTable = serializedWallet.usedGapChangeAddresses.map((addr) => ({
        PubKey: addr.pubKey,
        Address: addr.address,
        Index: addr.index,
        Zone: addr.zone,
    }));
    console.table(usedGapChangeAddressesTable);

    console.log('\nWallet Outpoints:');
    const outpointsInfoTable = serializedWallet.outpoints.map((outpoint) => ({
        Address: outpoint.address,
        Denomination: outpoint.outpoint.denomination,
        Index: outpoint.outpoint.index,
        TxHash: outpoint.outpoint.txhash,
        Zone: outpoint.zone,
        Account: outpoint.account,
    }));
    console.table(outpointsInfoTable);

    console.log('\nWallet Pending Outpoints:');
    const pendingOutpointsInfoTable = serializedWallet.pendingOutpoints.map((outpoint) => ({
        Address: outpoint.address,
        Denomination: outpoint.outpoint.denomination,
        Index: outpoint.outpoint.index,
        TxHash: outpoint.outpoint.txhash,
        Zone: outpoint.zone,
        Account: outpoint.account,
    }));
    console.table(pendingOutpointsInfoTable);

    // Print receiver payment code info
    console.log('\nWallet Receiver Payment Code Info:');
    const receiverPaymentCodeInfo = wallet.receiverPaymentCodeInfo;
    for (const [paymentCode, addressInfoArray] of Object.entries(receiverPaymentCodeInfo)) {
        console.log(`Payment Code: ${paymentCode}`);
        const receiverTable = addressInfoArray.map((info) => ({
            Address: info.address,
            PubKey: info.pubKey,
            Index: info.index,
            Zone: info.zone,
        }));
        console.table(receiverTable);
    }

    // Print sender payment code info
    console.log('\nWallet Sender Payment Code Info:');
    const senderPaymentCodeInfo = wallet.senderPaymentCodeInfo;
    for (const [paymentCode, addressInfoArray] of Object.entries(senderPaymentCodeInfo)) {
        console.log(`Payment Code: ${paymentCode}`);
        const senderTable = addressInfoArray.map((info) => ({
            Address: info.address,
            PubKey: info.pubKey,
            Index: info.index,
            Zone: info.zone,
        }));
        console.table(senderTable);
    }
}
