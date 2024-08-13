const quais = require('../../lib/commonjs/quais');

// Example hex string
const hex = '0x1234567890abcdef';

// Example Uint8Array
const uint8Array = new Uint8Array([18, 52, 86, 120, 144, 171, 205, 239]);

function main() {
    // Evaluate if provided data is a valid bytesLike
    const bytesLike = quais.isBytesLike(hex);
    console.log('Provided data "' + hex + '" is' + (bytesLike ? '' : ' not') + ' bytesLike.\n');

    // Convert hex string to Uint8Array
    const hexToUint8Array = quais.getBytes(hex);
    console.log('The hex string "' + hex + '" converted to Uint8Array gives: [ ' + hexToUint8Array + ' ].\n');

    // Convert Uint8Array to hex string
    const uint8ArrayToHex = quais.hexlify(hexToUint8Array);
    console.log('The Uint8Array [ ' + uint8Array + ' ] converted to hex string gives: "' + uint8ArrayToHex + '".');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
