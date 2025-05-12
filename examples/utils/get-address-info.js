// Quai SDK Address Info Example
//
// This script demonstrates how to use the Quai SDK to:
//  - Determine if an address is a Qi (UTXO) or Quai (account) address
//  - Identify the zone/shard for an address
//  - Extract detailed address information (zone and ledger)
//
// The script iterates over a set of example addresses, showing results for each.

const {
	isQiAddress,
	isQuaiAddress,
	getZoneForAddress,
	getAddressDetails,
} = require('../../lib/commonjs/quais');

// Example addresses for demonstration
const addresses = [
	// Quai address in zone 0x00 (ledger bit = 0)
	'0x0012155ee74cA70C5A68C211B7b8019338C0E5A4',
	// Quai address in zone 0x01 (ledger bit = 0)
	'0x0112155ee74cA70C5A68C211B7b8019338C0E5A4',
	// Qi address in zone 0x00 (ledger bit = 1)
	'0x00baB97FFA195F6DFA5053F86f84B77C9F795105',
	// Qi address in zone 0x01 (ledger bit = 1)
	'0x01d8Dab4dD526ccb38eC10D07169d91C9A4bb657',
];

function printAddressInfo(address) {
	console.log('----------------------------------------');
	console.log('Address:', address);

	// 1. Get zone that address resides in
	const zone = getZoneForAddress(address);
	console.log('Zone:', zone);

	// 2. Get zone and ledger that address resides in
	const addressDetails = getAddressDetails(address);
	console.log('Address Details:', addressDetails);

	// 3. Check if address is a Qi (UTXO) address
	const isQi = isQiAddress(address);
	console.log('Is Qi Address:', isQi);

	// 4. Check if address is a Quai (account) address
	const isQuai = isQuaiAddress(address);
	console.log('Is Quai Address:', isQuai);

	// Educational note
	console.log(
		`This address is in zone ${zone} and is a ${isQi ? 'Qi (UTXO)' : isQuai ? 'Quai (account)' : 'Unknown'} address.\n`
	);
}

function main() {
	addresses.forEach(printAddressInfo);
}

main();