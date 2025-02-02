const {
	JsonRpcProvider,
	Mnemonic,
	QiHDWallet,
	QuaiHDWallet,
	Zone,
} = require('../../lib/commonjs/quais');
require('dotenv').config();

/**
 * Qi to Quai Conversion Example
 * 
 * This script demonstrates how to convert Qi (UTXO-based) tokens to Quai (EVM-based) tokens
 * using QiHDWallet. It implements QIP-7 specifications for UTXO management and cross-ledger
 * conversion between Qi and Quai ledgers.
 * 
 * The script demonstrates:
 * 1. Creating both Qi and Quai HD wallets from the same mnemonic
 * 2. Scanning the Qi wallet for available UTXOs in a specific zone
 * 3. Displaying wallet addresses and current UTXO distribution
 * 4. Converting a specified amount of Qi tokens to Quai tokens
 * 5. Verifying the conversion results in both ledgers
 * 
 * Usage:
 * First, set up your .env file with:
 * MNEMONIC="your twelve word mnemonic phrase here"
 * RPC_URL="your Quai node RPC endpoint"
 * 
 * Then run:
 * ```
 * node qihdwallet-convert-to-quai.js
 * ```
 * 
 * The script will output:
 * - Qi and Quai wallet addresses
 * - Initial Qi balance and UTXO distribution
 * - Conversion transaction details
 * - Final Quai balance after conversion
 * 
 * Note: This example uses the Cyprus1 zone for demonstration. The conversion
 * process follows QIP-7 specifications for cross-ledger operations, allowing
 * users to move value between Qi (UTXO) and Quai (EVM) ledgers within the
 * same zone. The transaction will fail if insufficient UTXOs are available
 * for the requested conversion amount.
 */

async function main() {
    // Create provider
	const options =  {usePathing: false};
    const provider = new JsonRpcProvider(process.env.RPC_URL, undefined, options);

    // Create wallet and connect to provider
    console.log(process.env.RPC_URL)
    const aliceMnemonic =Mnemonic.fromPhrase(process.env.MNEMONIC);
    const aliceQiWallet =QiHDWallet.fromMnemonic(aliceMnemonic);
    aliceQiWallet.connect(provider);

	const aliceQuaiWallet =QuaiHDWallet.fromMnemonic(aliceMnemonic);
	aliceQuaiWallet.connect(provider);
	// get alice quai address
	const aliceQuaiAddressInfo = aliceQuaiWallet.getNextAddressSync(0,Zone.Cyprus1);
	console.log("Alice Quai address: ", aliceQuaiAddressInfo.address);

	// Scan Alice wallet
	console.log("...scanning alice wallet");
	await aliceQiWallet.scan(Zone.Cyprus1);

	// log alice change wallet addresses
	console.log("Alice change wallet addresses: ", aliceQiWallet.getChangeAddressesForZone(Zone.Cyprus1).map(a => a.address));
	// log alice external wallet addresses
	console.log("Alice external wallet addresses: ", aliceQiWallet.getAddressesForZone(Zone.Cyprus1).map(a => a.address));

	// Get Alice initial balance
	console.log("...getting alice initial balance");
	const aliceInitialQiBalance = await aliceQiWallet.getBalanceForZone(Zone.Cyprus1);
	console.log("Alice initial Qi balance: ", aliceInitialQiBalance);

	// log Alice outpoints
	console.log("Alice outpoints: ", JSON.stringify(aliceQiWallet.getOutpoints(Zone.Cyprus1), null, 2));

	const amountToConvert = 100000;
	console.log(`...converting ${amountToConvert} Qi to Quai address ${aliceQuaiAddressInfo.address}`);

	const tx = await aliceQiWallet.convertToQuai(aliceQuaiAddressInfo.address, amountToConvert);
	console.log("... Alice transaction sent. Waiting for receipt...");

	// Wait for tx to be mined
	const txReceipt = await tx.wait();
	console.log("Alice's transaction receipt (block number): ", txReceipt.blockNumber);

	// Get Alice updated Quai balance
	const aliceUpdatedQuaiBalance = await provider.getBalance(aliceQuaiAddressInfo.address);
	console.log("Alice updated Quai balance: ", aliceUpdatedQuaiBalance);

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
