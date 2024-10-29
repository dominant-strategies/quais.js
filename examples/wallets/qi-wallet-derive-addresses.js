const quais = require('../../lib/commonjs/quais');
require('dotenv').config();
const { printAddressTable } = require('./utils');

async function main() {

	const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);

	const aliceQiWallet = quais.QiHDWallet.fromMnemonic(mnemonic);

	console.log('Generating 5 Qi addresses for Cyprus1:');
	const cyprus1Addresses = [];

	for (let i = 0; i < 5; i++) {
		const addressInfo = await aliceQiWallet.getNextAddress(0, quais.Zone.Cyprus1);
		cyprus1Addresses.push(addressInfo);
	}
	printAddressTable(cyprus1Addresses);

	console.log('Generating 5 Qi addresses for Cyprus2:');
	const cyprus2Addresses = [];

	for (let i = 0; i < 5; i++) {
		const addressInfo = await aliceQiWallet.getNextAddress(0, quais.Zone.Cyprus2);
		cyprus2Addresses.push(addressInfo);
	}
	printAddressTable(cyprus2Addresses);

	console.log('Generating 5 Qi change addresses for Cyprus1:');
	const cyprus1ChangeAddresses = [];

	for (let i = 0; i < 5; i++) {
		const addressInfo = await aliceQiWallet.getNextChangeAddress(0, quais.Zone.Cyprus1);
		cyprus1ChangeAddresses.push(addressInfo);
	}
	printAddressTable(cyprus1ChangeAddresses);

	console.log('Generating 5 Qi change addresses for Cyprus2:');
	const cyprus2ChangeAddresses = [];

	for (let i = 0; i < 5; i++) {
		const addressInfo = await aliceQiWallet.getNextChangeAddress(0, quais.Zone.Cyprus2);
		cyprus2ChangeAddresses.push(addressInfo);
	}
	printAddressTable(cyprus2ChangeAddresses);

	const bobMnemonic = quais.Mnemonic.fromPhrase("innocent perfect bus miss prevent night oval position aspect nut angle usage expose grace juice");
	const bobaliceQiWallet = quais.QiHDWallet.fromMnemonic(bobMnemonic);
	const bobPaymentCode = bobaliceQiWallet.getPaymentCode(0);
	aliceQiWallet.openChannel(bobPaymentCode);

	console.log('Generating 5 Qi send addresses for Cyprus1:');
	const cyprus1PaymentCodeSendAddresses = [];
	for (let i = 0; i < 5; i++) {
		const addressInfo = await aliceQiWallet.getNextSendAddress(bobPaymentCode, quais.Zone.Cyprus1);
		cyprus1PaymentCodeSendAddresses.push(addressInfo);
	}
	printAddressTable(cyprus1PaymentCodeSendAddresses);

	console.log('Generating 5 Qi receive addresses for Cyprus1:');
	const cyprus1PaymentCodeReceivedAddresses = [];
	for (let i = 0; i < 5; i++) {
		const addressInfo = await aliceQiWallet.getNextReceiveAddress(bobPaymentCode, quais.Zone.Cyprus1);
		cyprus1PaymentCodeReceivedAddresses.push(addressInfo);
	}
	printAddressTable(cyprus1PaymentCodeReceivedAddresses);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

