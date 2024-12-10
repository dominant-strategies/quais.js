const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

async function main() {
    // Create wallet
    const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
    const quaiWallet = quais.QuaiHDWallet.fromMnemonic(mnemonic);

    // Create tx
    const addressInfo1 = await quaiWallet.getNextAddress(0, quais.Zone.Cyprus1);
    const from = addressInfo1.address;
	console.log('from: ', from);
    const txObj = new quais.QuaiTransaction(from);
	txObj.chainId = BigInt(969);
	txObj.nonce = BigInt(0);
    txObj.gasLimit = BigInt(1000000);
    txObj.minerTip = BigInt(10000000000);
    txObj.gasPrice = BigInt(30000000000000);
    txObj.to = '0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329';
    txObj.value = BigInt(4200000);


	// transaction to sign
	console.log('txObj: ', JSON.stringify(txObj, null, 2));

    // Sign the tx
	const signedTxSerialized = await quaiWallet.signTransaction(txObj);
	console.log('signedTxSerialized: ', signedTxSerialized);

    // Unmarshall the signed tx
    const signedTxObj = quais.QuaiTransaction.from(signedTxSerialized);

	console.log('signedTxObj: ', signedTxObj);

    // Get the signature
    const signature = signedTxObj.signature;

    // Verify the signature
    const txHash = signedTxObj.digest;
    const signerAddress = quais.recoverAddress(txHash, signature);

    if (signerAddress === from) {
        console.log('\nSignature is valid');
    } else {
        console.log('\nSignature is invalid');
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
