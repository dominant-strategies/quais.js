const {
	Mnemonic,
	QiHDWallet,
	Zone,
} = require('../../lib/commonjs/quais');
const { generateAddresses } = require('./utils');
require('dotenv').config();

/**
 * Qi Wallet Address Generation Example
 * 
 * This script demonstrates how to generate multiple Qi (UTXO-based) addresses from a single HD wallet.
 * It showcases the hierarchical deterministic (HD) wallet functionality for the Qi ledger,
 * implementing BIP44 and QIP-3 specifications for address derivation.
 * 
 * The script demonstrates:
 * 1. Creating a Qi HD wallet from a mnemonic
 * 2. Deriving multiple addresses for a specific account and zone
 * 3. Proper zone-specific address generation following QIP-2 and QIP-4
 * 
 * Usage:
 * First, set up your .env file with:
 * MNEMONIC="your twelve word mnemonic phrase here"
 * 
 * Then run:
 * ```
 * node qi-wallet-generate-addresses.js
 * ```
 * 
 * The script will output:
 * - 5 derived Qi addresses for account index 0 in the Cyprus1 zone
 * - Each address will include its derivation path and public key
 * 
 * Note: Qi addresses follow a different format than Quai addresses as they are
 * designed for UTXO-based transactions following QIP-7 specifications.
 */

async function main() {
    // Create quai wallet
    const mnemonic = Mnemonic.fromPhrase(process.env.MNEMONIC);
    const qiWallet = QiHDWallet.fromMnemonic(mnemonic);

	// derive 5 new addresses for account '0' and zone 'Cyprus1'
	const addresses = generateAddresses(qiWallet, 0, Zone.Cyprus1, 5);
	console.log('Generated Qi addresses for account 0 and zone Cyprus1:', JSON.stringify(addresses, null, 2));

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });


