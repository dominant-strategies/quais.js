const quais = require('../../lib/commonjs/quais');


async function main() {
    // Check if a public key is provided as a command line argument
    if (process.argv.length < 3) {
        console.error('Please provide a public key as a command line argument');
        process.exit(1);
    }

    const pubkey = process.argv[2];

	// Verify if the provided string is a valid public key of the type 0x0250495cb2f9535c684ebe4687b501c0d41a623d68c118b8dcecd393370f1d90e6
	if (!quais.isHexString(pubkey) || pubkey.length !== 68) {
        console.error('Invalid public key format');
        process.exit(1);
    }


    try {
        // Compute the address from the public key
        const address = quais.computeAddress(pubkey);
        console.log(`Public Key: ${pubkey}`);
        console.log(`Derived Address: ${address}`);
    } catch (error) {
        console.error('Error computing address:', error.message);
        process.exit(1);
    }

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
