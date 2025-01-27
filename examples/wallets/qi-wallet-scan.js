const {
	JsonRpcProvider,
	Mnemonic,
	QiHDWallet,
	Zone,
} = require('../../lib/commonjs/quais');
require('dotenv').config();

/**
 * Qi Wallet Scanning and Balance Discovery Example
 * 
 * This script demonstrates how to scan a Qi (UTXO-based) wallet to discover used addresses,
 * track balances, and manage both external and change addresses. It implements BIP44 wallet
 * scanning with gap limit management and UTXO tracking.
 * 
 * The script demonstrates:
 * 1. Creating and connecting a Qi wallet to a node
 * 2. Scanning for used addresses in a specific zone
 * 3. Managing external (receiving) and change addresses
 * 4. Tracking UTXOs (outpoints) associated with the wallet
 * 5. Calculating total wallet balance
 * 
 * Usage:
 * First, set up your .env file with:
 * MNEMONIC="your twelve word mnemonic phrase here"
 * RPC_URL="your node RPC endpoint"
 * 
 * Then run:
 * ```
 * node qi-wallet-scan.js
 * ```
 * 
 * The script will output:
 * - List of discovered external addresses with their:
 *   - Derivation paths
 *   - Public keys
 *   - Usage status (USED/UNUSED)
 *   - Last synced block information
 * - List of change addresses with similar details
 * - Available UTXOs (outpoints) with:
 *   - Transaction hashes
 *   - Output indices
 *   - Denominations
 * - Total wallet balance in the scanned zone
 * 
 * Note: This implementation follows BIP44 for HD wallet structure and QIP-7
 * for UTXO management in the Quai network's sharded architecture.
 */

async function main() {
	// Create provider
	const options =  {usePathing: false};
	console.log('RPC URL: ', process.env.RPC_URL);
	const provider = new JsonRpcProvider(process.env.RPC_URL, undefined, options);

	// Create wallet and connect to provider
	const mnemonic = Mnemonic.fromPhrase(process.env.MNEMONIC);
	const aliceQiWallet = QiHDWallet.fromMnemonic(mnemonic);
	aliceQiWallet.connect(provider);

	console.log('Scanning Alice Qi wallet...');
	await aliceQiWallet.scan(Zone.Cyprus1);
	console.log('Alice Qi wallet scan complete');

	// log Alice wallet external addresses
	const externalAddressesInfo = aliceQiWallet.getAddressesForZone(Zone.Cyprus1);
	console.log('Alice wallet external addresses: ', JSON.stringify(externalAddressesInfo, null, 2));

	const changeAddressesInfo = aliceQiWallet.getChangeAddressesForZone(Zone.Cyprus1);
	console.log('Alice wallet change addresses: ', JSON.stringify(changeAddressesInfo, null, 2));

	// log Alice wallet outpoints
	const outpoints = aliceQiWallet.getOutpoints(Zone.Cyprus1);
	console.log('Alice wallet outpoints: ', JSON.stringify(outpoints, null, 2));

	// log Alice wallet balance
	const balance = await aliceQiWallet.getBalanceForZone(Zone.Cyprus1);
	console.log('Alice wallet balance: ', balance);

}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
