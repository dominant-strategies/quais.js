const {
	JsonRpcProvider,
	Mnemonic,
	QiHDWallet,
	Zone,
} = require('../../lib/commonjs/quais');
require('dotenv').config();

/**
 * Qi HD Wallet Transaction Example
 * 
 * This script demonstrates how to perform UTXO-based transactions using QiHDWallet
 * between two parties (Alice and Bob) on the Quai network. It implements BIP-0047
 * payment codes for secure address generation and QIP-7 for UTXO transactions.
 * 
 * The script demonstrates:
 * 1. Creating QiHDWallets for both sender (Alice) and receiver (Bob)
 * 2. Generating and exchanging payment codes between parties
 * 3. Opening payment channels using BIP-0047
 * 4. Scanning wallets for available UTXOs
 * 5. Sending Qi tokens from Alice to Bob using payment codes
 * 
 * Usage:
 * First, set up your .env file with:
 * MNEMONIC="sender's twelve word mnemonic phrase here"
 * RPC_URL="your Quai node RPC endpoint"
 * 
 * Then run:
 * ```
 * node qihdwallet-sendTransaction.js
 * ```
 * 
 * The script will output:
 * - Payment codes for both Alice and Bob
 * - Wallet addresses for both parties
 * - Initial balances
 * - Transaction details and confirmation
 * 
 * Note: This example uses the Cyprus1 zone for demonstration. The QiHDWallet
 * implements UTXO-based transactions as specified in QIP-7, with privacy features
 * from BIP-0047 payment codes.
 */

async function main() {
    // Create provider
	const options =  {usePathing: false};
    const provider = new JsonRpcProvider(process.env.RPC_URL, undefined, options);

    // Create wallet and connect to provider
    console.log(process.env.RPC_URL)
    const aliceMnemonic = Mnemonic.fromPhrase(process.env.MNEMONIC);
    const aliceWallet = QiHDWallet.fromMnemonic(aliceMnemonic);
    aliceWallet.connect(provider);

    // Get Alice payment code
    const alicePaymentCode = aliceWallet.getPaymentCode(0);
    console.log("Alice payment code: ", alicePaymentCode);
 
	// Create Bob wallet
	const BOB_MNEMONIC = "innocent perfect bus miss prevent night oval position aspect nut angle usage expose grace juice";
	const bobMnemonic = Mnemonic.fromPhrase(BOB_MNEMONIC);
    const bobWallet = QiHDWallet.fromMnemonic(bobMnemonic);
    bobWallet.connect(provider);

	// Get Bob payment code
	const bobPaymentCode = bobWallet.getPaymentCode(0);
	console.log("Bob payment code: ", bobPaymentCode);

	// Open channel
	aliceWallet.openChannel(bobPaymentCode);
	bobWallet.openChannel(alicePaymentCode);

	// Scan Alice wallet
	console.log("...scanning alice wallet");
	await aliceWallet.scan(Zone.Cyprus1);

	// log alice change wallet addresses
	console.log("Alice change wallet addresses: ", aliceWallet.getChangeAddressesForZone(Zone.Cyprus1).map(a => a.address));
	// log alice external wallet addresses
	console.log("Alice external wallet addresses: ", aliceWallet.getAddressesForZone(Zone.Cyprus1).map(a => a.address));

	// // Scan Bob wallet
	console.log("...scanning bob wallet");
	await bobWallet.scan(Zone.Cyprus1);

	// Get Alice initial balance
	console.log("...getting alice initial balance");
	const aliceInitialBalance = await aliceWallet.getBalanceForZone(Zone.Cyprus1);
	console.log("Alice initial balance: ", aliceInitialBalance);

	// Get Bob initial balance
	console.log("...getting bob initial balance");
	const bobInitialBalance = await bobWallet.getBalanceForZone(Zone.Cyprus1);
	console.log("Bob initial balance: ", bobInitialBalance);

	// log Alice outpoints
	console.log("Alice outpoints: ", JSON.stringify(aliceWallet.getOutpoints(Zone.Cyprus1), null, 2));

	// Send Qi
	const amountToSendToBob = 15000000;
	console.log(`...sending ${amountToSendToBob} qit to Bob`);
	const tx = await aliceWallet.sendTransaction(bobPaymentCode, amountToSendToBob, Zone.Cyprus1, Zone.Cyprus1);
	console.log("... Alice transaction sent. Waiting for receipt...");

	// Wait for tx to be mined
	const txReceipt = await tx.wait();
	console.log("Alice's transaction receipt received. Block number: ", txReceipt.blockNumber);

	// Scan Bob wallet
	console.log("...scanning bob wallet");
	await bobWallet.scan(Zone.Cyprus1);

	// Get Bob final balance
	console.log("...getting bob final balance");
	const bobFinalBalance = await bobWallet.getBalanceForZone(Zone.Cyprus1);
	console.log("Bob final balance: ", bobFinalBalance);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
