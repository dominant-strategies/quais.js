/**
 * Quai and Qi Address Generation Example
 * 
 * This script demonstrates how to generate new addresses for both Quai (EVM-based) and Qi (UTXO-based)
 * wallets in the Quai network. It shows how to:
 * 1. Create HD wallets from a mnemonic phrase
 * 2. Generate new external addresses for Quai and Qi wallets
 * 3. Generate new change addresses for Qi wallets
 * 
 * The script follows BIP44 wallet structure and QIP-2/QIP-4 address space management
 * for the Quai network's sharded architecture.
 * 
 * Usage:
 * First, set up your .env file with:
 * MNEMONIC="your twelve word mnemonic phrase here"
 * 
 * Then run:
 * ```
 * node get-next-quai-qi-addresst.js
 * ```
 * 
 * The script will output:
 * - Next available Quai address with its derivation path and public key
 * - Next available Qi external address with its derivation path and public key
 * - Next available Qi change address with its derivation path and public key
 * 
 * Note: This implementation follows BIP44 for HD wallet structure and QIP-2/QIP-4
 * for address space management in the Quai network's sharded architecture.
 */

const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

async function main() {
    // Create HD wallets from mnemonic
    const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
    const quaiWallet = quais.QuaiHDWallet.fromMnemonic(mnemonic);
	const qiWallet = quais.QiHDWallet.fromMnemonic(mnemonic);

	const quaiAddressInfo = quaiWallet.getNextAddressSync(0, quais.Zone.Cyprus1);
	console.log('Quai Address info #1: ', quaiAddressInfo);

	const qiAddressInfo = qiWallet.getNextAddressSync(0, quais.Zone.Cyprus1);
	console.log('Qi Address info #1: ', qiAddressInfo);

	const qiChangeAddressInfo = qiWallet.getNextChangeAddressSync(0, quais.Zone.Cyprus1);
	console.log('Qi Change Address info #1: ', qiChangeAddressInfo);

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
