const quais = require('../../lib/commonjs/quais');

// Example address
const address = '0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329';

function main() {
    // Get zone that address resides in
    const zone = quais.getZoneForAddress(address);
    console.log('Address zone: ', zone, '\n');

    // Get zone and ledger that address resides in
    const addressDetails = quais.getAddressDetails(address);
    console.log('Address details: ', addressDetails);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
