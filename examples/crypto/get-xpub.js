const {
	Mnemonic,
	QiHDWallet,
	QuaiHDWallet,
} = require('../../lib/commonjs/quais');

/**
 * Extended Public Key (xPub) Example
 * 
 * This script demonstrates how to derive extended public keys (xPub) from a mnemonic phrase
 * for both Qi (UTXO-based) and Quai (EVM-based) HD wallets.
 * 
 * Extended public keys are crucial for hierarchical deterministic wallets as they allow
 * for generating an entire tree of public keys without exposing private keys. This enables
 * watch-only wallets and other security-enhancing features.
 * 
 * The script:
 * - Creates HD wallets from a mnemonic phrase
 * - Retrieves the xPub for both wallet types
 * - Displays the xPub strings which can be used for wallet recovery or watch-only functionality
 * 
 * Note: The mnemonic phrase should be stored in an environment variable MNEMONIC for security.
 */

require('dotenv').config();

async function main() {
    const mnemonic = Mnemonic.fromPhrase(process.env.MNEMONIC);
    const qiWallet = QiHDWallet.fromMnemonic(mnemonic);

    console.log("Qi Wallet xPub: ", qiWallet.xPub());

	const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);
	console.log("Quai Wallet xPub: ", quaiWallet.xPub());


}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
