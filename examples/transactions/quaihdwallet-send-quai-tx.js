const {
	JsonRpcProvider,
	Mnemonic,
	QuaiHDWallet,
	QuaiTransaction,
	Zone,
} = require('../../lib/commonjs/quais');
require('dotenv').config();

/**
 * Quai HD Wallet Transaction Example
 * 
 * This script demonstrates how to perform EVM-based transactions using QuaiHDWallet
 * on the Quai network. It shows the basic functionality of sending Quai tokens
 * between addresses within the same wallet.
 * 
 * The script demonstrates:
 * 1. Creating and connecting a QuaiHDWallet to a provider
 * 2. Generating new addresses within a specific zone
 * 3. Checking initial balances
 * 4. Sending Quai tokens between addresses
 * 5. Verifying transaction completion and final balances
 * 
 * Usage:
 * First, set up your .env file with:
 * MNEMONIC="your twelve word mnemonic phrase here"
 * RPC_URL="your Quai node RPC endpoint"
 * 
 * Then run:
 * ```
 * node quaihdwallet-send-quai-tx.js
 * ```
 * 
 * The script will output:
 * - Generated sender and receiver addresses
 * - Initial balance of the receiver
 * - Transaction details and confirmation
 * - Final balance after transfer
 * 
 * Note: This example uses the Cyprus1 zone for demonstration. The transaction
 * follows standard EVM-based operations, with optional parameters for chainId,
 * nonce, gasLimit, and gasPrice that can be customized as needed. The transaction
 * will fail if the sender has insufficient funds or if gas parameters are incorrectly
 * specified.
 */


async function main() {
    // Create provider
	const options =  {usePathing: false};
    const provider = new JsonRpcProvider(process.env.RPC_URL, undefined, options);

    // Create wallet and connect to provider
    const mnemonic = Mnemonic.fromPhrase(process.env.MNEMONIC);
    const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);
    quaiWallet.connect(provider);

    // Create tx
    const addressInfo1 = await quaiWallet.getNextAddress(0, Zone.Cyprus1);
    const from = addressInfo1.address;
    const txObj = new QuaiTransaction(from);
	const addressInfo2 = await quaiWallet.getNextAddress(0, Zone.Cyprus1);
	const to = addressInfo2.address;
	txObj.to = to;
	const initialBalance = await provider.getBalance(to);
	console.log('Initial balance:', initialBalance);
    txObj.value = BigInt(420000);
    /*
     * The following fields are optional, but can be set as follows:
     * txObj.chainId = BigInt(9000);
     * txObj.nonce = await provider.getTransactionCount(from, 'latest');
     * txObj.gasLimit = BigInt(1000000);
     * txObj.gasPrice = BigInt(30000000000000),
     */

    // Sign and send the transaction
    const tx = await quaiWallet.sendTransaction(txObj);

    // Wait for tx to be mined
    const txReceipt = await tx.wait();
    console.log('\nTx included in block:', txReceipt.blockNumber);
	const finalBalance = await provider.getBalance(to);
	console.log('Final balance:', finalBalance);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
