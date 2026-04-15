/**
 * QUAI to QI and QI to QUAI Conversion Transactions Example
 * 
 * This script demonstrates how to submit QUAI <-> QI transactions using the quais.js SDK.
 *
 * Key Features Demonstrated:
 * 1. Instantiating and scanning both QUAI (EVM) and QI (UTXO-based) wallets
 * 2. Connecting to a Quai node via JsonRpcProvider
 * 3. Converting QUAI tokens to QI tokens with configurable slippage
 * 4. Converting QI tokens back to QUAI tokens with refund address handling
 * 5. Managing UTXO-based QI wallet operations (scanning, syncing, outpoint management)
 *
 * Usage Instructions:
 * 1. Set up your .env file with your private key and mnemonic phrase for secure configuration.
 * 2. Ensure you have sufficient QUAI and QI balances for the conversions you want to perform.
 * 3. Configure the conversion amounts and slippage tolerance in the script.
 * 4. Run the script:
 *    node conversions.js
 *
 * Output:
 * - Transaction requests and receipts for QUAI to QI conversions
 * - Conversion transaction data including hash, amount, addresses, and refund information
 * - Gas usage and block confirmation details
 * - Error messages for failed transactions
 *
 * Quai Blockchain Concepts:
 * - Quai operates a dual-token system: QUAI (EVM-based) and QI (UTXO-based)
 * - QUAI to QI conversion involves sending QUAI to a QI address with encoded slippage data
 * - QI to QUAI conversion requires UTXO management, outpoint collection, and refund address specification
 * - Slippage tolerance is encoded as basis points to protect against price volatility during conversion
 *
 * Security Note:
 * - Always use secure practices for managing private keys and sensitive data.
 * - Store credentials in environment variables, not in the source code.
 *
 * For more information, see the quais.js documentation and Quai blockchain developer resources.
 * 
 * 
 */
import { JsonRpcProvider, Wallet, QiHDWallet, Zone, Mnemonic, parseQi, parseQuai } from 'quais';

// Configuration Variables for Orchard Testnet
const rpcUrl = 'https://orchard.rpc.quai.network';
const privateKey = '<YOUR_QUAI_ACCOUNT_PRIVATE_KEY>';
const qiPhrase = '<YOUR_QI_ACCOUNT_MNEMONIC>';

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
console.log("Scanning QI Wallet, this may take a minute");
qiWallet.connect(provider);
// Scan the wallet
await qiWallet.scan(Zone.Cyprus1);


/**
 * Convert QUAI to QI using protocol's native functionality
 * @param {string} value - Amount of QUAI to convert (as string)
 * @param {number} maxSlippage - Maximum slippage percentage
 */
async function convertQuaiToQi(value, maxSlippage = 2.0) {
  
  // convert to wei
  const amount = parseQuai(value);
     
  // Use getNextAddress for more reliable address generation
  const addressInfo = qiWallet.getNextAddressSync(0, Zone.Cyprus1);
  
  // Encode the slippage value in the transaction data
  const slippageData = encodeSlippage(maxSlippage);
  
  // Convert to hex string format for the transaction
  const slippageDataHex = "0x" + Buffer.from(slippageData).toString("hex");
  
  // Create transaction request
  const convertTxRequest = {
    to: addressInfo.address,
    from: wallet.address,
    value: amount.toString(), // Convert BigInt to string
    gasLimit: 1000000, // Use 1M gas limit to avoid running out of gas when creating outpoints
    data: slippageDataHex,
  };
  console.log("Transaction Request: "+JSON.stringify(convertTxRequest));
  
  console.log("Sending transaction");
  const tx = await wallet.sendTransaction(convertTxRequest);
  console.log("Awaiting receipt");
  const txReceipt = await tx.wait();

  // Collect transaction receipt data
  const receiptData = {
    txHash: txReceipt.hash,
    gasPrice: txReceipt.gasPrice.toString(),
    blockNumber: txReceipt.blockNumber
  }

  console.log("Tx Receipt: "+JSON.stringify(receiptData));
  return;
}

/**
 * Convert QI to QUAI using protocol's native functionality
 * @param {string} to - QUAI address to receive the converted tokens
 * @param {string} value - Amount of QI to convert (as string)
 * @param {number} maxSlippage - Maximum slippage percentage
 */
async function convertQiToQuai(to, value, maxSlippage = 2.0) {  
    
  const amount = parseQi(value);
  
  // Ensure QiHDWallet is properly synced
  console.log("syncing wallet");
  await qiWallet.sync(Zone.Cyprus1);
  
  try {    
    // Get UTXOs and execute conversion
    console.log("Getting outpoints");
    const outpoints = qiWallet.getOutpoints(Zone.Cyprus1);

    console.log("Importing outpoints");
    qiWallet.importOutpoints(outpoints);

    // Execute the conversion transaction
    // Encode slippage data
    const slippageData = encodeSlippage(maxSlippage);
    
    // Get refund address
    const refundAddress = qiWallet.getNextAddressSync(0, Zone.Cyprus1).address;
    const refundAddressBytes = Buffer.from(refundAddress.replace('0x', ''), 'hex');
      
    // Combine slippage data and refund address
    console.log("Combinging tx data");
    const combinedData = new Uint8Array(slippageData.length + refundAddressBytes.length);
    combinedData.set(slippageData);
    combinedData.set(refundAddressBytes, slippageData.length);
      
    // Execute the conversion transaction
    console.log("Executing QI to QUAI conversion transation")
    const tx = await qiWallet.convertToQuai(to, amount, {
      data: combinedData,
    });
    
    // Get sender payment code
    const senderPaymentCode = qiWallet.getPaymentCode(0);
    
    // Collect transaction data
    const txData = {
      hash: tx.hash,
      amount: amount.toString(),
      from: senderPaymentCode,
      to: to,
      refundAddress: tx.refundAddress,
    };    
    console.log(JSON.stringify(txData));
    return
  } catch (error) {
    console.log(error);
    return;
  }
}

/**
 * Encode slippage value as two bytes in big-endian format
 * @param {number} slippage - Slippage percentage (0-100)
 * @returns {Uint8Array} Encoded slippage data
 */
function encodeSlippage(slippage) {
  const slippageValue = Math.round(slippage * 100); // Convert to basis points
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setUint16(0, slippageValue, false); // false for big-endian
  return new Uint8Array(buffer);
}


// Execute QUAI to QI conversion
// 10 QUAI for QI with a max slippage of 2%
console.log("Executing QUAI to QI conversion");
await convertQuaiToQi("10",2.0);

// Execute QI to QUAI conversion
// 10 QI for QUAI with a max slippage of 2%
console.log("Executing QI to QUAI conversion");
await convertQiToQuai(wallet.address,"10",2.0);


