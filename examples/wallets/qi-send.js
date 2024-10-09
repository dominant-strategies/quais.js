const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

// Descrepancy between our serialized data and go quais in that ours in inlcude extra data at the end -> 201406c186bf3b66571cfdd8c7d9336df2298e4d4a9a2af7fcca36fbdfb0b43459a41c45b6c8885dc1f828d44fd005572cbac4cd72dc598790429255d19ec32f7750e

async function main() {
    // Create provider
    console.log('RPC URL: ', process.env.RPC_URL);
    const provider = new quais.JsonRpcProvider(process.env.RPC_URL);

    // Create wallet and connect to provider
    const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
    const aliceQiWallet = quais.QiHDWallet.fromMnemonic(mnemonic);
    aliceQiWallet.connect(provider);

    // Initialize Qi wallet
    console.log('Initializing Alice wallet...');
    await aliceQiWallet.sync(quais.Zone.Cyprus1);
    console.log('Alice wallet scan complete');
    console.log('Serializing Alice wallet...');
    const serializedWallet = aliceQiWallet.serialize();

    const summary = {
        'Total Addresses': serializedWallet.addresses.length,
        'Change Addresses': serializedWallet.changeAddresses.length,
        'Gap Addresses': serializedWallet.gapAddresses.length,
        'Gap Change Addresses': serializedWallet.gapChangeAddresses.length,
        Outpoints: serializedWallet.outpoints.length,
        'Coin Type': serializedWallet.coinType,
        Version: serializedWallet.version,
    };

    console.log('Alice Wallet Summary:');
    console.table(summary);

    const addressTable = serializedWallet.addresses.map((addr) => ({
        PubKey: addr.pubKey,
        Address: addr.address,
        Index: addr.index,
        Change: addr.change ? 'Yes' : 'No',
        Zone: addr.zone,
    }));

    console.log('\nAlice Wallet Addresses:');
    console.table(addressTable);

    const outpointsInfoTable = serializedWallet.outpoints.map((outpoint) => ({
        Address: outpoint.address,
        Denomination: outpoint.outpoint.denomination,
        Index: outpoint.outpoint.index,
        TxHash: outpoint.outpoint.txhash,
        Zone: outpoint.zone,
        Account: outpoint.account,
    }));

    console.log('\nAlice Outpoints Info:');
    console.table(outpointsInfoTable);

    console.log(`Generating Bob's wallet and payment code...`);
    const bobMnemonic = quais.Mnemonic.fromPhrase(
        'innocent perfect bus miss prevent night oval position aspect nut angle usage expose grace juice',
    );
    const bobQiWallet = quais.QiHDWallet.fromMnemonic(bobMnemonic);
    bobQiWallet.connect(provider);
    const bobPaymentCode = await bobQiWallet.getPaymentCode(0);
    console.log('Bob Payment code: ', bobPaymentCode);

    // Alice opens a channel to send Qi to Bob
    aliceQiWallet.openChannel(bobPaymentCode, 'sender');

    // Alice sends 1000 Qi to Bob
    const tx = await aliceQiWallet.sendTransaction(bobPaymentCode, 750000, quais.Zone.Cyprus1, quais.Zone.Cyprus1);
    console.log('Transaction sent: ', tx);

    console.log('Syncing Alice wallet...');
    await aliceQiWallet.sync(quais.Zone.Cyprus1);

    console.log('Alice Wallet Summary:');
    console.table(summary);

    const addressTable2 = aliceQiWallet.serialize().addresses.map((addr) => ({
        PubKey: addr.pubKey,
        Address: addr.address,
        Index: addr.index,
        Change: addr.change ? 'Yes' : 'No',
        Zone: addr.zone,
    }));

    console.log('\nAlice Wallet Addresses:');
    console.table(addressTable2);

    const outpointsInfoTable2 = aliceQiWallet.serialize().outpoints.map((outpoint) => ({
        Address: outpoint.address,
        Denomination: outpoint.outpoint.denomination,
        Index: outpoint.outpoint.index,
        TxHash: outpoint.outpoint.txhash,
        Zone: outpoint.zone,
        Account: outpoint.account,
    }));

    console.log('\nAlice Outpoints Info:');
    console.table(outpointsInfoTable2);

    // wait 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log('Initializing Bob wallet...');
    const alicePaymentCode = await aliceQiWallet.getPaymentCode(0);
    console.log('Alice Payment code: ', alicePaymentCode);
    bobQiWallet.openChannel(alicePaymentCode, 'receiver');
    await bobQiWallet.sync(quais.Zone.Cyprus1);
    console.log('Bob wallet scan complete');
    const addressTableBob = bobQiWallet.serialize().addresses.map((addr) => ({
        PubKey: addr.pubKey,
        Address: addr.address,
        Index: addr.index,
        Change: addr.change ? 'Yes' : 'No',
        Zone: addr.zone,
    }));
    console.log('\nBob Wallet Addresses:');
    console.table(addressTableBob);

    const outpointsInfoTableBob = bobQiWallet.serialize().outpoints.map((outpoint) => ({
        Address: outpoint.address,
        Denomination: outpoint.outpoint.denomination,
        Index: outpoint.outpoint.index,
        TxHash: outpoint.outpoint.txhash,
        Zone: outpoint.zone,
        Account: outpoint.account,
    }));
    console.log('\nBob Outpoints Info:');
    console.table(outpointsInfoTableBob);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
