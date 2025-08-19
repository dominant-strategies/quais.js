/**
 * Interacting with Wrapped QI Example
 * 
 * This script demonstrates how to interact with Wrapped QI by wrapping, claiming, and unwrapping QI using quais.js SDK.
 *
 * Key Features Demonstrated:
 * 1. Instantiating and scanning both QUAI (EVM) and QI (UTXO-based) wallets
 * 2. Connecting to a Quai node via JsonRpcProvider
 * 3. Wrapping native QI tokens into WQI (ERC-20 equivalent) tokens
 * 4. Claiming WQI tokens from the smart contract after wrapping
 * 5. Unwrapping WQI tokens back to native QI tokens
 * 6. Managing UTXO-based QI wallet operations (scanning, syncing, outpoint management)
 * 7. Smart contract interaction using Contract class and function encoding
 *
 * Usage Instructions:
 * 1. Set up your .env file with your private key and mnemonic phrase for secure configuration.
 * 2. Ensure you have sufficient QI balance for wrapping operations and QUAI for gas fees.
 * 3. Configure the WQI contract address and wrapping amounts in the script.
 * 4. Run the script:
 *    node wrappedQi.js
 *
 * Output:
 * - Transaction requests and receipts for QI wrapping operations
 * - WQI deposit balance queries and claim transaction data
 * - Unwrap transaction data including QI address and contract interactions
 * - Gas usage and block confirmation details for all operations
 * - Error messages for failed transactions
 *
 * Quai Blockchain Concepts:
 * - Wrapped QI (WQI) is an ERC-20 representation of native QI tokens on the EVM
 * - Wrapping involves sending QI to the WQI contract address with encoded data
 * - Claiming requires querying deposit balances and calling the claimDeposit() function
 * - Unwrapping converts WQI back to native QI by calling unwrapQi() with a QI address
 * - The WQI contract manages the conversion between UTXO-based QI and EVM-compatible WQI
 *
 * Security Note:
 * - Always use secure practices for managing private keys and sensitive data.
 * - Store credentials in environment variables, not in the source code.
 * - Verify WQI contract address before performing operations.
 *
 * For more information, see the quais.js documentation and Quai blockchain developer resources.
 * 
 * 
 */
import { JsonRpcProvider, Wallet, QiHDWallet, Zone, Mnemonic, parseQi, formatQi, Contract} from 'quais';

// Configuration Variables for Orchard Testnet
const rpcUrl = 'https://orchard.rpc.quai.network';
const wQiContractAddress = '0x002b2596EcF05C93a31ff916E8b456DF6C77c750';
const privateKey = '<YOUR QUAI ACCOUNT PRIVATE KEY>';
const qiPhrase = '<YOUR QI ACCOUNT MNEMONIC PHRASE>';

// Connect to Quai RPC and instantiate Quai wallet
console.log("Connecting to RPC");
const provider = new JsonRpcProvider(rpcUrl, undefined, {usePathing: true});
console.log("Creating QUAI wallet");
const wallet = new Wallet(privateKey, provider);
// Create mnemonic from phrase for Qi wallet
console.log("Importing QI Mnemonic");
const mnemonic = Mnemonic.fromPhrase(qiPhrase);
// Create QiHDWallet from mnemonic
console.log("Creating QI Wallet");
const qiWallet = QiHDWallet.fromMnemonic(mnemonic);
// Connect wallet to provider
qiWallet.connect(provider);
// Scan QI Wallet
console.log("Scanning QI Wallet, this may take a minute");
await qiWallet.scan(Zone.Cyprus1);

/**
 * Wrap QI tokens to WQI tokens
 * @param {string} amount - Amount of QI to wrap
 */
async function wrapQi(amount) {
  
  console.log("Syncing Qi Wallet");
  await qiWallet.sync(Zone.Cyprus1);
    
  const amountToWrap = parseQi(amount);
  
  // Convert to WQI contract address bytes like the working example
  const WRAPPED_QI_CONTRACT_ADDRESS_BYTES = new Uint8Array(Buffer.from(wQiContractAddress.replace("0x", ""), "hex"));

  console.log("Getting outpoints");
  const outpoints = qiWallet.getOutpoints(Zone.Cyprus1);

  console.log("Importing outpoints");
  qiWallet.importOutpoints(outpoints);

  console.log("Executing wrap Qi transaction");
  console.log('Wrapping '+amount+" Qi and sending to "+wallet.address);
  // Execute the wrap transaction like the working example
  const tx = await qiWallet.convertToQuai(wallet.address, amountToWrap, {
    data: WRAPPED_QI_CONTRACT_ADDRESS_BYTES,
  });

  // Collect transaction data
  const txData = {
    hash: tx.hash,
    amount: amountToWrap.toString(),
    to: wQiContractAddress,
    recipient: wallet.address
  };
  console.log("Transaction data: "+JSON.stringify(txData));
}


/**
 * Claim WQI from smart contract
 */
async function claimWqi() {
  
  console.log("Getting WQI Deposit Balance");
  const wQiDeposit = await provider.send("quai_getWrappedQiDeposit", [
      wQiContractAddress,
      wallet.address,
      "latest"
  ], Zone.Cyprus1);
  const deposit = BigInt(wQiDeposit);
  console.log("Found "+formatQi(wQiDeposit)+" WQI available to claim");

  // Create contract instance for claiming
  console.log("Creating Contract object");
  const contract = new Contract(
    wQiContractAddress,
    ["function claimDeposit() external returns (uint256)"],
    provider
  );

  // Get the encoded function data
  console.log("Getting encoded function");
  const encodedFunction = contract.interface.encodeFunctionData("claimDeposit");
  
  // Construct the transaction request
  console.log("Constructing request");
  const request = {
    to: wQiContractAddress,
    from: wallet.address,
    data: encodedFunction,
    gasLimit: 50000000
  };

  console.log("Sending WQI claim transaction");
  const tx = await wallet.sendTransaction(request);
    
  console.log("Waiting for transaction receipt");
  const txReceipt = await tx.wait();

  console.log("Collecting receipt data");
  const receiptData =  {
    hash: txReceipt.hash,
    address: wallet.address,
    amount: deposit.toString(),
  };

  console.log("Transaction Receipt Data: "+JSON.stringify(receiptData));
}


/**
 * Unwrap WQI tokens back to native QI
 * @param {string|BigInt} amount - Amount of WQI to unwrap
 */
async function unwrapQi(amount) {
  
  // Parse amount to BigInt - handle both string and BigInt inputs
  const amountToUnwrap = parseQi(amount);
  
  // Determine QI address to receive unwrapped QI
  console.log("Getting QI address");
  const qiAddress = qiWallet.getNextAddressSync(0, Zone.Cyprus1).address;
  
  // Create contract instance for unwrapping
  console.log("Creating contract object");
  const contract = new Contract(
    wQiContractAddress,
    ["function unwrapQi(address qiAddr, uint256 value, uint64 etxGasLimit) external"],
    provider   
  );
  
  // Get the encoded function data
  console.log("Getting encoded function");
  const encodedFunction = contract.interface.encodeFunctionData("unwrapQi", [
    qiAddress,
    amountToUnwrap,
    1000000
  ]);
  
  // Construct the transaction request
  console.log("Contructing transaction request");
  const request = {
    to: wQiContractAddress,
    from: wallet.address,
    data: encodedFunction,
    gasLimit: 50000000 // Higher gas limit for unwrapping operation
  };
  
  console.log("Sending unwrap transaction");
  const unwrapTx = await wallet.sendTransaction(request);
  console.log("Awaiting transaction receipt");
  const txReceipt = await unwrapTx.wait();

  console.log("Syncing QI wallet");
  await qiWallet.sync(Zone.Cyprus1);
  
  console.log("Collecting receipt data");
  const txReceiptData = {
    hash: txReceipt.hash,
    address: wallet.address,
    amount: amountToUnwrap.toString(),
    qiAddress: qiAddress,
    contract: wQiContractAddress,
  };

  console.log("Transaction receipt data: "+JSON.stringify(txReceiptData));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(){
  console.log("Wrapping QI");
  await wrapQi('10');

  console.log("Waiting 20 seconds before claiming");
  await sleep(20000);

  console.log("Claiming wrapped QI");
  await claimWqi();

  console.log("Unwrapping QI");
  await unwrapQi("10");
}
await main();