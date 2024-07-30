const quais = require('../lib/commonjs/quais');
require('dotenv').config();

async function main() {
	// create provider
	const provider = new quais.JsonRpcProvider(process.env.RPC_URL);

	const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
	const qiWallet = quais.QiHDWallet.fromMnemonic(mnemonic);
	qiWallet.connect(provider);

	const addressInfo1 = await qiWallet.getNextAddress(0, quais.Zone.Cyprus1);
	const addr1 = addressInfo1.address;
	const pubkey1 = addressInfo1.pubKey;

	// Define the outpoints for addr1
	const outpointsInfo = [
		{
			outpoint: {
				txhash: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
				index: 0,
				denomination: 7,
			},
			address: addr1,
			zone: quais.Zone.Cyprus1
		},
	]

	// polulate wallet with outpoints
	qiWallet.importOutpoints(outpointsInfo);

	// Set tx inputs and outputs for the Qi Tx
	let txInputs = [
		{
			txhash: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
			index: 0,
			pubkey: pubkey1,
		},
	];

	let txOutputs = [
		{
			address: "0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329",
			denomination: 7,
		},
	];

	// Create the Qi Tx to be signed
	const txObj = new quais.QiTransaction();
	txObj.txInputs = txInputs;
	txObj.txOutputs = txOutputs;

	// Sign and send the tx
	const tx = await qiWallet.sendTransaction(txObj);

	// Wait for tx to be mined
	const txReceipt = await tx.wait();
	console.log('\nTx receipt:', txReceipt);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
