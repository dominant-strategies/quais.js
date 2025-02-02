const {
	JsonRpcProvider,
	Mnemonic,
	QiHDWallet,
	Zone,
} = require('../../lib/commonjs/quais');
require('dotenv').config();

/**
 * Qi HD Wallet UTXO Aggregation Example
 * 
 * This script demonstrates how to aggregate multiple UTXOs into larger denominations
 * in a QiHDWallet. It implements QIP-7 specifications for UTXO management and 
 * optimization of wallet holdings.
 * 
 * The script demonstrates:
 * 1. Creating and connecting a QiHDWallet to a provider
 * 2. Scanning the wallet for available UTXOs in a specific zone
 * 3. Displaying wallet addresses and current UTXO distribution
 * 4. Attempting to aggregate smaller denomination UTXOs into larger ones
 * 5. Verifying the aggregation results
 * 
 * Usage:
 * First, set up your .env file with:
 * MNEMONIC="your twelve word mnemonic phrase here"
 * RPC_URL="your Quai node RPC endpoint"
 * 
 * Then run:
 * ```
 * node qihdwallet-aggregate.js
 * ```
 * 
 * The script will output:
 * - Wallet addresses (both external and change)
 * - Initial balance and UTXO distribution
 * - Aggregation transaction details
 * - Final balance and updated UTXO distribution
 * 
 * Note: This example uses the Cyprus1 zone for demonstration. The aggregation
 * process follows QIP-7 specifications for UTXO management, attempting to combine
 * smaller denominations into larger ones when possible. The transaction will fail
 * if no beneficial aggregation is possible with the current UTXO set.
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

	// Scan Alice wallet
	console.log("...scanning alice wallet");
	await aliceWallet.scan(Zone.Cyprus1);

	// log alice change wallet addresses
	console.log("Alice change wallet addresses: ", aliceWallet.getChangeAddressesForZone(Zone.Cyprus1).map(a => a.address));
	// log alice external wallet addresses
	console.log("Alice external wallet addresses: ", aliceWallet.getAddressesForZone(Zone.Cyprus1).map(a => a.address));

	// Get Alice initial balance
	console.log("...getting alice initial balance");
	const aliceInitialBalance = await aliceWallet.getBalanceForZone(Zone.Cyprus1);
	console.log("Alice initial balance: ", aliceInitialBalance);

	// log Alice outpoints
	console.log("Alice outpoints: ", JSON.stringify(aliceWallet.getOutpoints(Zone.Cyprus1), null, 2));

	// Send Qi
	console.log("...aggregating alice balance");
	const tx = await aliceWallet.aggregate(Zone.Cyprus1);
	console.log("... Alice transaction sent. Waiting for receipt...");

	// Wait for tx to be mined
	const txReceipt = await tx.wait();
	console.log("Alice's transaction receipt (block number): ", txReceipt.blockNumber);

	// Get Alice final balance
	console.log("...getting alice final balance");
	const aliceFinalBalance = await aliceWallet.getBalanceForZone(Zone.Cyprus1);
	console.log("Alice final balance: ", aliceFinalBalance);

	// sync Alice wallet and log outpoints
	console.log("...syncing alice wallet and logging outpoints");
	await aliceWallet.scan(Zone.Cyprus1);
	console.log("Alice outpoints: ", JSON.stringify(aliceWallet.getOutpoints(Zone.Cyprus1), null, 2));

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
