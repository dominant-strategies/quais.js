const quais = require('../../lib/commonjs/quais');
const { printWalletInfo } = require('./utils');
require('dotenv').config();

async function main() {
	// Create provider
	console.log('RPC URL: ', process.env.RPC_URL);
	const provider = new quais.JsonRpcProvider(process.env.RPC_URL);

	// Create wallet and connect to provider
	const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
	const aliceQiWallet = quais.QiHDWallet.fromMnemonic(mnemonic);
	const alicePaymentCode = aliceQiWallet.getPaymentCode(0);
	aliceQiWallet.connect(provider);

	const bobMnemonic = quais.Mnemonic.fromPhrase("innocent perfect bus miss prevent night oval position aspect nut angle usage expose grace juice");
	const bobQiWallet = quais.QiHDWallet.fromMnemonic(bobMnemonic);
	bobQiWallet.connect(provider);
	const bobPaymentCode = bobQiWallet.getPaymentCode(0);
	aliceQiWallet.openChannel(bobPaymentCode);

	console.log('Scanning Alice Qi wallet...');
	await aliceQiWallet.scan(quais.Zone.Cyprus1);
	console.log('Alice Qi wallet scan complete');

	printWalletInfo('Alice', aliceQiWallet);

	// Bob opens a channel with Alice
	bobQiWallet.openChannel(alicePaymentCode);
	console.log('Scanning Bob Qi wallet...');
	await bobQiWallet.scan(quais.Zone.Cyprus1);
	console.log('Bob Qi wallet scan complete');
	printWalletInfo('Bob', bobQiWallet);

	// Alice sends 50 Qi to Bob
	console.log('\nAlice sends 50 Qi to Bob');
	const tx = await aliceQiWallet.sendTransaction(bobPaymentCode, 50000n, quais.Zone.Cyprus1, quais.Zone.Cyprus1);
	//     console.log('Transaction sent: ', tx);
	console.log(`Transaction hash: ${tx.hash}`);
	console.log(`Tx contains ${tx.txInputs?.length} inputs`);
	console.log(`Tx inputs: ${JSON.stringify(tx.txInputs)}`);
	console.log(`Tx contains ${tx.txOutputs?.length} outputs`);

	console.log('Waiting for transaction to be confirmed...');
	const response = await tx.wait();
	console.log('Transaction confirmed in block: ', response.blockNumber);

	console.log('Syncing Alice Qi wallet...');
	await aliceQiWallet.sync(quais.Zone.Cyprus1);
	console.log('Alice Qi wallet sync complete');

	printWalletInfo('Alice', aliceQiWallet);

	console.log('Syncing Bob Qi wallet...');
	await bobQiWallet.sync(quais.Zone.Cyprus1);
	console.log('Bob Qi wallet sync complete');
	printWalletInfo('Bob', bobQiWallet);

	console.log('\nAlice sends another 50 Qi to Bob');
	const tx2 = await aliceQiWallet.sendTransaction(bobPaymentCode, 50000n, quais.Zone.Cyprus1, quais.Zone.Cyprus1);
	console.log(`Transaction hash: ${tx2.hash}`);
	console.log(`Tx contains ${tx2.txInputs?.length} inputs`);
	console.log(`Tx inputs: ${JSON.stringify(tx2.txInputs)}`);
	console.log(`Tx contains ${tx2.txOutputs?.length} outputs`);

	console.log('Waiting for transaction to be confirmed...');
	const response2 = await tx2.wait();
	console.log('Transaction confirmed in block: ', response2.blockNumber);

	console.log('Syncing Alice Qi wallet...');
	await aliceQiWallet.sync(quais.Zone.Cyprus1);
	console.log('Alice Qi wallet sync complete');

	printWalletInfo('Alice', aliceQiWallet);

	console.log('Syncing Bob Qi wallet...');
	await bobQiWallet.sync(quais.Zone.Cyprus1);
	console.log('Bob Qi wallet sync complete');
	printWalletInfo('Bob', bobQiWallet);	
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
