const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

async function main() {
    // Create provider
    const provider = new quais.JsonRpcProvider(process.env.RPC_URL);

    // Get block (with includeTransactions set to false)
    const block = await provider.getBlock(quais.Shard.Cyprus1, 'latest', false);
    console.log('Block: ', block);

    // Get conversion rates for 100 Quai and Qi
    const latestQuaiRate = await provider.getLatestQuaiRate(quais.Shard.Cyprus1, 100);
    const latestQiRate = await provider.getLatestQiRate(quais.Shard.Cyprus1, 100);
    console.log('Latest Quai Rate: ', latestQuaiRate, '/nLatest Qi Rate: ', latestQiRate);

    // Get current protocol expansion number
    const protocolExpansionNumber = await provider.getProtocolExpansionNumber();
    console.log('Protocol Expansion Number: ', protocolExpansionNumber);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
