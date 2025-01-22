const {
	computeAddress,
} = require('../../lib/commonjs/quais');

/**
 * Public Key to Address Example
 * 
 * This script demonstrates how to derive a Quai address directly from a public key.
 * It uses the computeAddress function to derive the corresponding address from
 * an uncompressed or compressed public key.
 * 
 * Usage:
 * ```
 * node pubkey-to-address.js <public-key>
 * ```
 * 
 * Example:
 * ```
 * node pubkey-to-address.js 0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798
 * ```
 * 
 * The script will output:
 * - The input public key
 * - The derived Quai address
 * 
 * Note: The public key can be either compressed (33 bytes, starting with 02 or 03)
 * or uncompressed (65 bytes, starting with 04).
 */

async function main() {
    // Check if a public key is provided as a command line argument
    if (process.argv.length < 3) {
        console.error('Please provide a public key as a command line argument');
        process.exit(1);
    }

    const pubkey = process.argv[2];

    // Compute the address from the public key
    const address = computeAddress(pubkey);
    console.log(`Public Key: ${pubkey}`);
    console.log(`Derived Address: ${address}`);


}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
