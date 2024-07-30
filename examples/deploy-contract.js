
/* Example contract:
* // SPDX-License-Identifier: MIT
* pragma solidity ^0.8.0;
* 
* contract SimpleStorage {
*     uint256 private storedValue;
* 
*     event ValueSet(uint256 value, address indexed sender);
* 
*     function set(uint256 value) public {
*         storedValue = value;
*         emit ValueSet(value, msg.sender);
*     }
* 
*     function get() public view returns (uint256) {
*         uint256 value = storedValue;
*         return value;
*     }
* }
*
*/

const quais = require('../lib/commonjs/quais');
const fs = require('fs');
const { EventEmitter } = require('events');
const eventEmitter = new EventEmitter();
require('dotenv').config();

// Prerequisites: compile the smart contract and generate artifacts, i.e. run:
// solc --bin --abi SimpleStorage.sol --output-dir artifacts 

const abi = JSON.parse(fs.readFileSync('artifacts/SimpleStorage.abi', 'utf8'));
const bytecode = fs.readFileSync('artifacts/SimpleStorage.bin', 'utf8');

async function main() {
	const provider = new quais.JsonRpcProvider(process.env.RPC_URL);
	
	const wallet = new quais.Wallet(process.env.CYPRUS1PK, provider);
	console.log('Wallet address:', wallet.address);

	// get address balance
	let balance = await provider.getBalance(wallet.address);
	console.log('Balance:', balance.toString());
	
	// Deploy contract	
	const factory = new quais.ContractFactory(abi, bytecode, wallet);
	
	let nonce = await provider.getTransactionCount(wallet.address, 'latest');
	const deployParams = {
		nonce,
		maxPriorityFeePerGas: 1000000000n,
		maxFeePerGas: 3000000000000n,
		from: wallet.address,
	};
	let contract = await factory.deploy(deployParams);
	const contractAddress = await contract.getAddress();
	console.log('Contract address:', contractAddress);
	
	// wait for contract to be deployed
	await contract.waitForDeployment(); 

	// Subscribe to events
	contract.on('ValueSet', (value, sender) => {
		console.log(`\n\n'ValueSet' event detected => value: ${value.toString()}, sender: ${sender}\n\n`);
		eventEmitter.emit('eventCaptured');
	});
	
	// Write to contract	
	const tx = await contract.set(42);
	
	const receipt = await tx.wait();
	console.log('Value set in contract. Tx receipt:', receipt);
	
	// Read from contract
	const value = await contract.get();
	console.log('Stored value in contract:', value.toString());

	// helper promise to wait for event before exiting 
	const waitForContractEvent = new Promise((resolve) => eventEmitter.once('eventCaptured', resolve));
	const intervalId = setInterval( ()=>{ console.log('Waiting for solidity event...'); }, 5000);
	await waitForContractEvent;
	clearInterval(intervalId);
}

main()
.then(() => process.exit(0))
.catch((error) => {
	console.error(error);
	process.exit(1);
});