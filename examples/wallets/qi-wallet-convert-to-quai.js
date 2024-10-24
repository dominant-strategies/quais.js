const quais = require('../../lib/commonjs/quais');
const { printWalletInfo } = require('./utils');
require('dotenv').config();

async function main() {
    // Create provider
    console.log('RPC URL: ', process.env.RPC_URL);
    const provider = new quais.JsonRpcProvider(process.env.RPC_URL);

    // Create Alice's Qi wallet and connect to provider
    const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
    const aliceQiWallet = quais.QiHDWallet.fromMnemonic(mnemonic);
    aliceQiWallet.connect(provider);

    // Initialize Alice's Qi wallet
    console.log('\nInitializing Alice Qi wallet...');
    await aliceQiWallet.scan(quais.Zone.Cyprus1);
    console.log('Alice Qi wallet scan complete');

    printWalletInfo('Alice', aliceQiWallet);

    // Create Alice's Quai wallet and connect to provider
    const aliceQuaiWallet = quais.QuaiHDWallet.fromMnemonic(mnemonic);
    aliceQuaiWallet.connect(provider);

    // derive quai address
    const quaiAddressInfo = await aliceQuaiWallet.getNextAddress(0, quais.Zone.Cyprus1);
    console.log('\nAlice Quai address:', quaiAddressInfo.address);

    console.log('\nAlice converts 100 Qi to Quai...');

    const tx = await aliceQiWallet.convertToQuai(quaiAddressInfo.address, 100000);
    // console.log('Transaction sent: ', tx);
    console.log(`Transaction hash: ${tx.hash}`);
    console.log(`Tx contains ${tx.txInputs?.length} inputs`);
    console.log(`Tx contains ${tx.txOutputs?.length} outputs`);
    // wait for the transaction to be confirmed
    console.log('Waiting for transaction to be confirmed...');
    const response = await tx.wait(); 
    console.log('Transaction confirmed in block: ', response.blockNumber);

    console.log('Syncing Alice Qi wallet...');
    await aliceQiWallet.sync(quais.Zone.Cyprus1);
    console.log('Alice Qi wallet sync complete');

    printWalletInfo('Alice', aliceQiWallet);

    // print Alice's Quai address balance
    const balance = await provider.getBalance(quaiAddressInfo.address);
    console.log('\nAlice Quai address balance:', quais.formatQuai(balance));

    // repeat the same process of converting 100 Qi to Quai
    console.log('Alice converts another 100 Qi to Quai...');
    const tx2 = await aliceQiWallet.convertToQuai(quaiAddressInfo.address, 100000);
    console.log(`Tx contains ${tx2.txInputs?.length} inputs`);
    console.log(`Tx contains ${tx2.txOutputs?.length} outputs`);
    console.log('Waiting for transaction to be confirmed...');
    const response2 = await tx2.wait(); 
    console.log('Transaction confirmed in block: ', response2.blockNumber);

    console.log('Syncing Alice Qi wallet...');
    await aliceQiWallet.sync(quais.Zone.Cyprus1);
    console.log('Alice Qi wallet sync complete');

    printWalletInfo('Alice', aliceQiWallet);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
