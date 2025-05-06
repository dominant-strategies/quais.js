/**
 * Quai QiHDWallet Serialization Example
 *
 * This script demonstrates how to create, scan, and serialize a QiHDWallet (Hierarchical Deterministic Wallet for Quai's UTXO-based Qi ledger)
 * using the quais.js SDK. Serialization allows you to export the wallet's state for backup, migration, or later restoration.
 *
 * Key Features Demonstrated:
 * 1. Creating a QiHDWallet from a BIP-39 mnemonic phrase
 * 2. Connecting the wallet to a Quai node via JsonRpcProvider
 * 3. Scanning the wallet for UTXOs in a specific zone (Cyprus1)
 * 4. Serializing the wallet's state to a JSON object
 *
 * Usage Instructions:
 * 1. Set up your .env file with:
 *    MNEMONIC="your twelve word mnemonic phrase here"
 * 2. Run the script:
 *    node qi-wallet-serialize-deserialize.js
 *
 * Output:
 * - The serialized wallet object, suitable for backup or migration
 *
 * Quai Blockchain Concepts:
 * - QiHDWallet implements BIP-44 and QIP-3 for HD wallet derivation, supporting Quai's sharded address space.
 * - Scanning discovers UTXOs for the wallet in the specified zone, as per QIP-7.
 * - Serialization captures the wallet's state, including derived addresses and UTXO set, but never exposes private keys in plaintext.
 *
 * Security Note:
 * - Always protect your mnemonic and serialized wallet data. Never share them publicly.
 *
 * For more information, see the quais.js documentation and Quai blockchain developer resources.
 */

// Load the quais.js SDK and dotenv for environment variable management
const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

async function main() {
	// Set up the provider to connect to the Quai node
	const RPC_URL = 'https://rpc.orchard.quai.network';
	console.log("RPC_URL: ", RPC_URL);

	const provider = new quais.JsonRpcProvider(RPC_URL, undefined, { usePathing: true });

	// Create a QiHDWallet from the mnemonic phrase in the environment variable
	const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
	const qiWallet = quais.QiHDWallet.fromMnemonic(mnemonic);
	// Connect the wallet to the provider for blockchain interactions
	qiWallet.connect(provider);

	// Scan the wallet for UTXOs in the Cyprus1 zone
	console.log('Scanning wallet...');
	await qiWallet.scan(quais.Zone.Cyprus1);
	console.log('Scan complete');

	// Serialize the wallet's state for backup or migration
	console.log('\nSerializing wallet...');
	const serializedWallet = qiWallet.serialize();

	// Output the serialized wallet object (never share this or your mnemonic publicly)
	console.log("serializedWallet: ", JSON.stringify(serializedWallet, null, 2));
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
