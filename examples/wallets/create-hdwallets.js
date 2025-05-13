// Quai SDK HD Wallet Creation Example
//
// This script demonstrates how to use the Quai SDK to:
//  - Create HD wallets for both Quai (EVM-based) and Qi (UTXO-based) ledgers
//  - Instantiate wallets from both a mnemonic phrase and a seed
//  - Derive addresses for specific accounts and zones
//
// The script highlights the difference between mnemonic-based and seed-based wallet instantiation,
// and shows how to generate addresses for both Quai and Qi ledgers.
//
// Educational notes are included throughout to explain key blockchain and wallet concepts.

const {
	Mnemonic,
	QuaiHDWallet,
	QiHDWallet,
	Zone,
} = require('../../lib/commonjs/quais');
require('dotenv').config();

async function main() {
	// 1. Create a mnemonic from a phrase (typically 12 or 24 words)
	//    The mnemonic is a human-readable backup for your wallet, as per BIP-39.
	const mnemonic = Mnemonic.fromPhrase(process.env.MNEMONIC);

	// 2. Create a Quai wallet from a mnemonic
	//    This uses BIP-44 derivation paths for EVM-based Quai addresses.
	const quaiWalletFromPhrase = QuaiHDWallet.fromMnemonic(mnemonic);
	// Derive 1 Quai address for the first account and Cyprus1 zone
	const quaiAddressFromPhrase = await quaiWalletFromPhrase.getNextAddress(0, Zone.Cyprus1);
	console.log('quaiAddressFromPhrase: ', quaiAddressFromPhrase);

	// 3. Create a Quai wallet from a seed
	//    The seed is a binary value derived from the mnemonic (and optional passphrase) using PBKDF2.
	//    This demonstrates programmatic wallet recovery when only the seed is available.
	const quaiWalletFromSeed = QuaiHDWallet.fromSeed(mnemonic.computeSeed());
	const quaiAddressFromSeed = await quaiWalletFromSeed.getNextAddress(0, Zone.Cyprus1);
	console.log('quaiAddressFromSeed: ', quaiAddressFromSeed);

	// 4. Create a Qi wallet from a mnemonic
	//    Qi wallets use BIP-44 derivation for UTXO-based addresses, following Quai's sharded architecture.
	const qiWalletFromPhrase = QiHDWallet.fromMnemonic(mnemonic);
	const qiAddressFromPhrase = await qiWalletFromPhrase.getNextAddress(0, Zone.Cyprus1);
	console.log('qiAddressFromPhrase: ', qiAddressFromPhrase);

	// 5. Create a Qi wallet from a seed
	//    This is useful for interoperability or when only the binary seed is available.
	const qiWalletFromSeed = QiHDWallet.fromSeed(mnemonic.computeSeed());
	const qiAddressFromSeed = await qiWalletFromSeed.getNextAddress(0, Zone.Cyprus1);
	console.log('qiAddressFromSeed: ', qiAddressFromSeed);

	// Educational note:
	// - QuaiHDWallet is for EVM-based (account model) addresses, while QiHDWallet is for UTXO-based addresses.
	// - Both support hierarchical deterministic (HD) derivation, allowing you to manage many accounts and addresses from a single root.
	// - Instantiating from a mnemonic is user-friendly and supports recovery, while instantiating from a seed is useful for programmatic workflows.
}

main().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});