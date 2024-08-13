const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

async function main() {
    // Create provider
    const provider = new quais.JsonRpcProvider(process.env.RPC_URL);

    // Get balance of a Quai or Qi address
    const balance = await provider.getBalance('0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329', 'latest');
    console.log('Balance: ', balance);

    // Get nonce of address
    const nonce = await provider.getTransactionCount('0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329', 'latest');
    console.log('Nonce: ', nonce);

    // Get code stored at a Quai address
    const code = await provider.getCode('0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329', 'latest');
    console.log('Code: ', code);

    // Get value of a storage slot at a Quai address
    const storage = await provider.getStorage('0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329', 0, 'latest');
    console.log('Storage: ', storage);

    // Get outpoints of Qi address
    const outpoints = await provider.getOutpointsByAddress('0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329');
    console.log('Outpoints: ', outpoints);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
