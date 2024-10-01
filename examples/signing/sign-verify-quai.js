const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

async function main() {
    // Create wallet
    const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
    const quaiWallet = quais.QuaiHDWallet.fromMnemonic(mnemonic);

    // Create tx
    const addressInfo1 = await quaiWallet.getNextAddress(0, quais.Zone.Cyprus1);
    const from = addressInfo1.address;
    const txObj = new quais.QuaiTransaction(from);
    txObj.gasLimit = BigInt(1000000);
    (txObj.minerTip = BigInt(10000000000)),
        (txObj.gasPrice = BigInt(30000000000000)),
        (txObj.to = '0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329');
    txObj.value = BigInt(4200000);

    // Sign the tx
    const signedTxSerialized = await quaiWallet.signTransaction(txObj);

    // Unmarshall the signed tx
    const signedTx = quais.QuaiTransaction.from(signedTxSerialized);

    // Get the signature
    const signature = signedTx.signature;

    // Verify the signature
    const txHash = signedTx.digest;
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
