/**
 * Quai EVM Access List Creation Example
 *
 * This script demonstrates how to generate an EIP-2930 access list for a smart contract transaction on the Quai blockchain using the quais.js SDK.
 * Access lists are used to optimize gas usage by pre-declaring which storage slots and addresses a transaction will access.
 *
 * Key Features Demonstrated:
 * 1. Loading a compiled Solidity contract artifact (ABI)
 * 2. Connecting to a Quai node via JsonRpcProvider
 * 3. Encoding a contract function call using Interface
 * 4. Preparing a transaction request for a contract method
 * 5. Using provider.createAccessList to generate an access list for the transaction
 *
 * Usage Instructions:
 * 1. Ensure you have compiled your Solidity contract (e.g., using Hardhat) and have the artifact JSON available.
 * 2. Set up your .env file if you wish to use environment variables for configuration.
 * 3. Run the script:
 *    node createAccessList.js
 *
 * Output:
 * - The transaction request for which the access list is generated
 * - The resulting access list and gas estimate
 *
 * Quai Blockchain Concepts:
 * - Quai's EVM-based ledger supports EIP-2930 access lists, which can reduce gas costs for transactions that access multiple storage slots or contracts.
 * - Access lists are especially useful for complex contract interactions and can improve transaction predictability.
 *
 * Security Note:
 * - Always use secure practices for managing private keys and sensitive data. This script does not require signing or sending transactions, only simulating them for access list generation.
 *
 * For more information, see the quais.js documentation and Quai blockchain developer resources.
 */

// Load required modules from quais.js and Node.js
const { JsonRpcProvider, Interface } = require('quais');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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

// Load the compiled contract artifact (ABI)
const artifacts = JSON.parse(fs.readFileSync(path.join(__dirname, '../contracts/artifacts/SimpleStorage.json'), 'utf8'));

async function main() {
  // Set up the provider to connect to the Quai node
  // You can replace the RPC_URL with your own node endpoint or use environment variables
  const RPC_URL = 'https://rpc.orchard.quai.network';
	console.log("RPC_URL: ", RPC_URL);
	
  const provider = new JsonRpcProvider(RPC_URL, undefined, { usePathing: true });

  // Specify the deployed contract address (update as needed for your deployment)
  const contractAddress = '0x000bF5f1D31644cB4042Ff95d2f2985D8CFE8245';

  // Create an Interface instance for ABI encoding/decoding
  const iface = new Interface(artifacts.abi);
  // Encode the function call data for set(uint256) with value 42
  const data = iface.encodeFunctionData('set', [42]); // set value to 42

  // Prepare the transaction request object
  const tx = {
    to: contractAddress,
    data: data,
  };

  // Log the transaction request for reference
  console.log("Creating access list for tx: ", tx);

  // Call createAccessList to simulate the transaction and generate an access list
  // This returns the access list and a gas estimate for the transaction
  const accessListResult = await provider.createAccessList(tx);

  // Output the generated access list and gas estimate
  console.log('Access List Result:', accessListResult);
}

main().catch(console.error);