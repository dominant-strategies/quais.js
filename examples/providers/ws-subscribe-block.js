const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

async function main() {
	const provider = new quais.WebSocketProvider(process.env.WS_RPC_URL);

	let blockNumber = null;
	provider.on(
		'block',
		(newBlock) => {
			console.log(`Received new block: ${newBlock}`);
			blockNumber = newBlock;
		},
		quais.Zone.Cyprus1,
	);

	await new Promise((resolve, reject) => {
		let attempts = 0;
		const checkBlock = () => {
			if (blockNumber !== null) {
				resolve();
			} else if (attempts > 10) {
				reject(new Error('No block event received'));
			} else {
				attempts++;
				console.log(`Waiting for new block event via web socket...(attempt ${attempts})`);
				setTimeout(checkBlock, 5000);
			}
		};
		checkBlock();
	});

	await provider.destroy();
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
