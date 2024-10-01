const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

async function main() {
    // Create provider
    const provider = new quais.JsonRpcProvider(process.env.RPC_URL);

    // Create wallet and connect to provider
    const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
    const quaiWallet = quais.QuaiHDWallet.fromMnemonic(mnemonic);
    quaiWallet.connect(provider);

    // Create tx
    const addressInfo1 = await quaiWallet.getNextAddress(0, quais.Zone.Cyprus1);
    const from = addressInfo1.address;
    const txObj = new quais.QuaiTransaction(from);
    txObj.to = '0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329';
    txObj.value = BigInt(4200000);
    /*
     * The following fields are optional, but can be set as follows:
     * txObj.chainId = BigInt(9000);
     * txObj.nonce = await provider.getTransactionCount(from, 'latest');
     * txObj.gasLimit = BigInt(1000000);
     * txObj.minerTip = BigInt(10000000000),
     * txObj.gasPrice = BigInt(30000000000000),
     */

    // Sign and send the transaction
    const tx = await quaiWallet.sendTransaction(txObj);

    // Wait for tx to be mined
    const txReceipt = await tx.wait();
    console.log('\nTx receipt:', txReceipt);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
