const quais = require('../lib/commonjs/quais');
require('dotenv').config();

async function main() {
    // Create provider
    const provider = new quais.JsonRpcProvider(process.env.RPC_URL);

    // Create wallet and connect to provider
    const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
    const qiWallet = quais.QiHDWallet.fromMnemonic(mnemonic);
    qiWallet.connect(provider);

    // Initialize Qi wallet
    console.log('\nInitializing wallet...');
    await qiWallet.scan(quais.Zone.Cyprus1);

    // Get all gap and change addresses for zone 'Cyprus1'
    console.log('\nRetrieving gap addresses...');
    let gapAddresses = qiWallet.getGapAddressesForZone(quais.Zone.Cyprus1);
    console.log(`\ngap addresses for cyprus1: ${gapAddresses.length}`);

    // Get all change addresses for zone 'Cyprus1'
    console.log('\nRetrieving change addresses...');
    let changeAddresses = qiWallet.getChangeAddressesForZone(quais.Zone.Cyprus1);
    console.log(`\nchange addresses for cyprus1: ${changeAddresses.length}`);

    const addr1 = gapAddresses[0].address;

    // derive new address for account '1' and zone 'Cyprus2'
    let newAddrInfo = await qiWallet.getNextAddress(1, quais.Zone.Cyprus2);
    console.log('New address for Cyprus2: ', newAddrInfo.address);
    // derive new change address for account '1' and zone 'Cyprus2'
    let newChangeAddrInfo = await qiWallet.getNextChangeAddress(1, quais.Zone.Cyprus2);
    console.log('New change address for Cyprus2: ', newChangeAddrInfo.address);

    // Define the outpoints for addr1 (this is just an example outpoint)
    // Outpoints are typically obtained via the getOutpointsForAddress function
    const outpointsInfo = [
        {
            outpoint: {
                txhash: '0xccb4b1ae1e97c64f8af4bd04cc061f691fd035fe1aa0bb21d464450dc3d3b959',
                index: 0,
                denomination: 7,
            },
            address: addr1,
            zone: quais.Zone.Cyprus1,
        },
    ];

    console.log('Importing outpoints...');
    qiWallet.importOutpoints(outpointsInfo);

    // Serialize wallet
    const serialized = qiWallet.serialize();

    // Deserialize wallet
    const deserialized = await quais.QiHDWallet.deserialize(serialized);

    // Log gap and change addresses from deserialized wallet
    gapAddresses = deserialized.getAddressesForZone(quais.Zone.Cyprus1);
    console.log('Gap Addresses contained in deserialized wallet:', gapAddresses.length);
    console.table(
        gapAddresses.map((addr) => ({
            address: addr.address,
            index: addr.index,
            zone: addr.zone,
            change: addr.change,
            account: addr.account,
        })),
    );
    changeAddresses = deserialized.getChangeAddressesForZone(quais.Zone.Cyprus1);
    console.log('Change Addresses contained in deserialized wallet:', changeAddresses.length);
    console.table(
        changeAddresses.map((addr) => ({
            address: addr.address,
            index: addr.index,
            zone: addr.zone,
            change: addr.change,
            account: addr.account,
        })),
    );

    // Get new addresses and change addresses from deserialized wallet in Cyprus2
    newAddrInfo = deserialized.getAddressesForZone(quais.Zone.Cyprus2);
    console.log('New address info from deserialized wallet (Cyprus2): ', newAddrInfo);
    newChangeAddrInfo = deserialized.getChangeAddressesForZone(quais.Zone.Cyprus2);
    console.log('New change address info from deserialized wallet (Cyprus2): ', newChangeAddrInfo);

    // Log outpoints known to the deserialized wallet
    const outpoints = deserialized.getOutpoints(quais.Zone.Cyprus1);
    console.log('Outpoints for Cyprus1: ', outpoints);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
