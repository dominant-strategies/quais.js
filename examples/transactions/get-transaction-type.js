const quais = require('../../lib/commonjs/quais');

// Example addresses
const from = '0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329'; // Quai address
const to = '0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329'; // Quai address

function main() {
    // Get transaction type
    const txType = quais.getTxType(from, to);
    console.log('Transaction type: ', txType); // 0, both addresses are on the quai ledger
}

main();
