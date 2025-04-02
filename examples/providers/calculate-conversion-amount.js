const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

/**
 * Calculate Conversion Amount Example
 * 
 * This script demonstrates how to calculate conversion amounts between Quai and Qi tokens
 * on the Quai network. The conversion rate is determined by the prime terminus exchange rate
 * and includes various discounts based on network conditions.
 * 
 * The conversion direction is automatically determined by the address prefixes.
 * 
 * The script demonstrates two methods of calculating conversions:
 * 1. Using individual parameters
 * 2. Using an object parameter
 * 
 * Key features of the conversion:
 * - Automatic ledger detection based on address prefixes
 * - Application of prime terminus exchange rate
 * - Conversion flow discount (cubic discount)
 * - K-Quai discount based on exchange rate trends
 * - Minimum conversion amount protection (10% of original value)
 * 
 * Usage:
 * First, set up your .env file with:
 * RPC_URL="your Quai node RPC endpoint"
 * 
 * Then run:
 * ```
 * node calculate-conversion-amount.js
 * ```
 * 
 * The script will output:
 * - The original amount to convert
 * - The converted amount using both method calls
 * 
 * Note: The conversion rate and discounts are determined by the current state
 * of the network's prime terminus block, which includes factors like:
 * - Current exchange rate
 * - Miner difficulty
 * - Conversion flow amount
 * - Exchange rate trend (increasing/decreasing)
 */

async function main() {
	console.log("RPC_URL: ", process.env.RPC_URL);
	const options =  {usePathing: false};
	const provider = new quais.JsonRpcProvider(process.env.RPC_URL, undefined, options);

	const qiAmount = quais.parseQi("1.0");
	console.log("amount to convert: ", quais.formatQi(qiAmount), " Qi");

	// Method 1: Using individual parameters
	const quaiAmount1 = await provider.calculateConversionAmount(
		"0x009f1545923a5A1052Aa162F858e2b925863Cd3D",
		"0x0012155ee74cA70C5A68C211B7b8019338C0E5A4",
		qiAmount
	);

	console.log("converted amount1: ", quais.formatQuai(quaiAmount1), " Quai");
	
	// Method 2: Using an object parameter
	const quaiAmount2 = await provider.calculateConversionAmount({
		from: "0x009f1545923a5A1052Aa162F858e2b925863Cd3D",
		to: "0x0012155ee74cA70C5A68C211B7b8019338C0E5A4",
		value: qiAmount.toString()
	});

	console.log("converted amount2: ", quais.formatQuai(quaiAmount2), " Quai");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
