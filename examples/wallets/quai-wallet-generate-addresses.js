const {
	Mnemonic,
	QuaiHDWallet,
	Zone,
} = require('../../lib/commonjs/quais');
const { generateAddresses } = require('./utils');
require('dotenv').config();

/**
 * Quai Wallet Address Generation Example
 * 
 * This script demonstrates how to generate multiple Quai (EVM-based) addresses from a single HD wallet.
 * It showcases the hierarchical deterministic (HD) wallet functionality for the Quai ledger,
 * implementing BIP44 specifications with Quai-specific derivation paths.
 * 
 * The script demonstrates:
 * 1. Creating a Quai HD wallet from a mnemonic
 * 2. Deriving multiple addresses for a specific account and zone
 * 3. Proper zone-specific address generation following QIP-2 and QIP-4
 * 
 * Usage:
 * First, set up your .env file with:
 * MNEMONIC="your twelve word mnemonic phrase here"
 * 
 * Then run:
 * ```
 * node quai-wallet-generate-addresses.js
 * ```
 * 
 * The script will output:
 * - 5 derived Quai addresses for account index 0 in the Cyprus1 zone
 * - Each address will include its derivation path and public key
 * 
 * Note: Quai addresses follow the standard EVM address format with zone-specific
 * prefixes as defined in QIP-2 and QIP-4.
 */

async function main() {
    // Create quai wallet
    const mnemonic = Mnemonic.fromPhrase(process.env.MNEMONIC);
    const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);

    // derive 5 new addresses for account '0' and zone 'Cyprus1'
    const addresses = generateAddresses(quaiWallet, 0, Zone.Cyprus1, 5);
    console.log('Generated Quai addresses for account 0 and zone Cyprus1:', JSON.stringify(addresses, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
