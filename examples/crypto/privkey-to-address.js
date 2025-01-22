const {
	computeAddress,
	SigningKey,
} = require('../../lib/commonjs/quais');

/**
 * Key to Address Example
 * 
 * This script demonstrates how to derive a Quai address from a private key.
 * It uses the SigningKey class to compute the public key and then derives
 * the corresponding address.
 * 
 * Usage:
 * ```
 * node key-to-address.js <private-key>
 * ```
 * 
 * Example:
 * ```
 * node key-to-address.js 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
 * ```
 * 
 * The script will output:
 * - The input private key
 * - The derived public key
 * - The corresponding Quai address
 */

async function main() {
    // Check if a public key is provided as a command line argument
    if (process.argv.length < 3) {
        console.error('Please provide a public key as a command line argument');
        process.exit(1);
    }

    const key = process.argv[2];

    // Compute the address from the public key
    console.log(`Private Key: ${key}`);
    const pubkey = SigningKey.computePublicKey(key, true);
    console.log(`Public Key: ${pubkey}`);
    const address = computeAddress(key);
    console.log(`Derived Address: ${address}`);

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
