const quais = require('../lib/commonjs/quais');
require('dotenv').config();

async function main() {
    // Create wallet
    const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
    const quaiWallet = quais.QuaiHDWallet.fromMnemonic(mnemonic);

    // derive new address for account '0' and zone 'Cyprus1'
    const addressInfo1 = await quaiWallet.getNextAddress(0, quais.Zone.Cyprus1);
    console.log('Address info #1: ', addressInfo1);

    // derive another new address for account '0' and zone 'Cyprus1'
    const addressInfo2 = await quaiWallet.getNextAddress(0, quais.Zone.Cyprus1);
    console.log('Address info #2: ', addressInfo2);

    // derive new address for account '1' and zone 'Cyprus1'
    const addressInfo3 = await quaiWallet.getNextAddress(1, quais.Zone.Cyprus1);
    console.log('Address info #3: ', addressInfo3);

    // get address info for the new address #1
    const addressInfo = quaiWallet.getAddressInfo(addressInfo1.address);
    console.log('Address #1 info:', addressInfo);

    // get all addresses for zone 'Cyprus1'
    const addressesInfo = quaiWallet.getAddressesForZone(quais.Zone.Cyprus1);
    console.log('Addresses in Cyprus1: ', addressesInfo);

    // get all addresses for account '0'
    const account0addrs = quaiWallet.getAddressesForAccount(0);
    console.log('Addresses in account 0: ', account0addrs);

    // serialize and deserialize the wallet
    const serialized = quaiWallet.serialize();
    console.log('Serialized wallet:', serialized);
    const deserialized = await quais.QuaiHDWallet.deserialize(serialized);
    const addresses = deserialized.getAddressesForZone(quais.Zone.Cyprus1);
    console.log('Cyprus 1 addresses contained in deserialized wallet:', addresses);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
