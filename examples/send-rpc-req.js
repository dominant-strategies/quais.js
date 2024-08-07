const quais = require('../lib/commonjs/quais');
require('dotenv').config();


async function main() {

	const provider = new quais.JsonRpcProvider(process.env.RPC_URL);
	const block = await provider.getBlock(quais.Shard.Cyprus1, "latest", true);
	console.log("Block: ", block);
}


main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});