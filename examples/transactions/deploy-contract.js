/**
 * Quai EVM Contract Deployment Example
 *
 * This script demonstrates how to deploy a smart contract to the Quai blockchain using the quais.js SDK (a fork of ethers.js 6.x).
 * It is designed for educational purposes and illustrates best practices for interacting with Quai's EVM-based ledger.
 *
 * Key Features Demonstrated:
 * 1. Loading a compiled Solidity contract artifact (ABI and bytecode)
 * 2. Connecting to a Quai node via JsonRpcProvider
 * 3. Creating a Wallet instance for signing transactions
 * 4. Deploying a contract using ContractFactory
 * 5. Handling deployment parameters (nonce, gas fees)
 * 6. Awaiting deployment confirmation and retrieving the contract address
 *
 * Usage Instructions:
 * 1. Ensure you have compiled your Solidity contract (e.g., using Hardhat) and have the artifact JSON available.
 * 2. Set up your .env file with:
 *    RPC_URL="your Quai node RPC endpoint"
 *    CYPRUS1_PRIVKEY_1="your private key for the deployment account"
 * 3. Run the script:
 *    node deploy-contract.js
 *
 * Output:
 * - Wallet address used for deployment
 * - Account balance before deployment
 * - Deployed contract address
 * - Deployment transaction receipt
 *
 * Security Note:
 * - Never expose your private key. Use environment variables and secure key management practices.
 *
 * Quai Blockchain Concepts:
 * - This example targets the EVM-based ledger of Quai, supporting smart contracts similar to Ethereum.
 * - Gas parameters (maxFeePerGas, maxPriorityFeePerGas) are set explicitly for demonstration; adjust as needed for network conditions.
 * - The script is modular and can be adapted for different contracts or deployment scenarios.
 *
 * For more information, see the quais.js documentation and Quai blockchain developer resources.
 */

const quais = require('../../lib/commonjs/quais');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Prerequisites: compile the smart contract and generate Hardhat artifact, i.e. run:
// npx hardhat compile

const artifacts = JSON.parse(fs.readFileSync(path.join(__dirname, '../contracts/artifacts/SimpleStorage.json'), 'utf8'));

async function main() {
	const provider = new quais.JsonRpcProvider(process.env.RPC_URL, undefined, { usePathing: true });
	
	const wallet = new quais.Wallet(process.env.CYPRUS1_PRIVKEY_1, provider);
	console.log('Wallet address:', wallet.address);

	// get address balance
	let balance = await provider.getBalance(wallet.address);
	console.log('Balance:', balance.toString());
	
	// Deploy contract	
	const factory = new quais.ContractFactory(artifacts.abi, artifacts.bytecode, wallet, null);
	
	let nonce = await provider.getTransactionCount(wallet.address, 'latest');
	const deployParams = {
		nonce,
		maxPriorityFeePerGas: 1000000000n,
		maxFeePerGas: 3000000000000n,
	};
	let contract = await factory.deploy(deployParams);
	const contractAddress = await contract.getAddress();
	console.log('Contract address:', contractAddress);
	
	// wait for contract to be deployed
	const receipt = await contract.waitForDeployment(); 
	console.log('Contract deployed. Tx receipt:', receipt);
}

main()
.then(() => process.exit(0))
.catch((error) => {
	console.error(error);
	process.exit(1);
});