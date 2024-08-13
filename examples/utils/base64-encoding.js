const quais = require('../../lib/commonjs/quais');

// String to decode
const toDecode = 'EjQ=';

async function main() {
    // Decode the string to Uint8Array
    const decoded = quais.decodeBase64(toDecode);
    console.log(
        'The string "' + toDecode + '" decoded using base64 encoding gives the Uint8Array: [' + decoded + ']\n',
    );

    // Encode the hex string to base64
    const encoded = quais.encodeBase64(decoded);
    console.log(
        'Encoding the resultant Uint8Array using base64 encoding gives the string: "' +
            encoded +
            '" that we started with.',
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
