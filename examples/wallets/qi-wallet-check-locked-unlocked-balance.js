/**
 * Qi Wallet Locked Balance Check Example
 * 
 * This script demonstrates how to check locked and spendable balances in a Qi (UTXO-based) wallet.
 * It shows how to:
 * 1. Connect to a Quai node
 * 2. Scan a Qi wallet for addresses and UTXOs
 * 3. Display wallet addresses and UTXOs in a tabular format
 * 4. Check locked and spendable balances
 * 
 * The script follows BIP44 wallet structure and QIP-7 for UTXO management
 * in the Quai network's sharded architecture.
 * 
 * Usage:
 * First, set up your .env file with:
 * MNEMONIC="your twelve word mnemonic phrase here"
 * RPC_URL="your node RPC endpoint"
 * 
 * Then run:
 * ```
 * node qi-wallet-check-locked-balance.js
 * ```
 * 
 * The script will output:
 * - Table of external addresses with their status and last sync block
 * - Table of change addresses with their status and last sync block
 * - Table of UTXOs with their denominations and lock times
 * - Locked and spendable balances in Qi
 */

const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

async function main() {
    // Create provider
	const options =  {usePathing: true};
    const provider = new quais.JsonRpcProvider(process.env.RPC_URL, undefined, options);

    // Create wallet and connect to provider
	console.log('Connecting to RPC URL:', process.env.RPC_URL)
	// console.log(process.env.MNEMONIC)
    const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
    const wallet = quais.QiHDWallet.fromMnemonic(mnemonic);
    wallet.connect(provider);

	// perform initial scan
	console.log('\nScanning Qi wallet...');
	await wallet.scan(quais.Zone.Cyprus1);
	console.log('Qi wallet scan complete\n');

	// get external addresses
	const externalAddressesInfo = wallet.getAddressesForZone(quais.Zone.Cyprus1);
	console.log('External Addresses:');
	console.table(externalAddressesInfo.map(addr => ({
		Address: addr.address,
		Status: addr.status,
		'Last Block': addr.lastSyncedBlock.number,
		'Derivation Path': addr.derivationPath
	})));

	// get change addresses
	const changeAddressesInfo = wallet.getChangeAddressesForZone(quais.Zone.Cyprus1);
	console.log('\nChange Addresses:');
	console.table(changeAddressesInfo.map(addr => ({
		Address: addr.address,
		Status: addr.status,
		'Last Block': addr.lastSyncedBlock.number,
		'Derivation Path': addr.derivationPath
	})));

	// get outpoints
	const outpoints = wallet.getOutpoints(quais.Zone.Cyprus1);
	console.log('\nUTXOs:');
	console.table(outpoints.map(out => ({
		Address: out.address,
		'Transaction Hash': out.outpoint.txhash,
		Denomination: out.outpoint.denomination,
		'Lock Height': out.outpoint.lock,
		'Derivation Path': out.derivationPath
	})));

	// get locked balance (use cached outpoints = TRUE, fetch from network = FALSE)
	const lockedBalance = await wallet.getLockedBalance(quais.Zone.Cyprus1, null, true);


	// get spendable balance
	const spendableBalance = await wallet.getSpendableBalance(quais.Zone.Cyprus1);
	
	// console log the locked balance in Qi
	console.log('\nBalances:');

	console.table([
		{ Type: 'Locked', Balance: quais.formatQi(lockedBalance) },
		{ Type: 'Spendable', Balance: quais.formatQi(spendableBalance) }
	]);
	

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
