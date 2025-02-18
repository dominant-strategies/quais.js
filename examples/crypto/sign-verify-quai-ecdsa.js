const {
	Mnemonic,
	QuaiHDWallet,
	Zone,
	QuaiTransaction,
	recoverAddress,
} = require('../../lib/commonjs/quais');
require('dotenv').config();

/**
 * ECDSA Signature Example for Quai Transactions
 * 
 * This script demonstrates how to create and verify an ECDSA signature
 * for a Quai (EVM-based) transaction. It shows the complete workflow of:
 * 1. Creating a wallet and deriving an address
 * 2. Creating a Quai transaction with standard EVM fields
 * 3. Signing with ECDSA
 * 4. Verifying the signature through address recovery
 * 
 * Usage:
 * First, set up your .env file with:
 * MNEMONIC="your twelve word mnemonic phrase here"
 * 
 * Then run:
 * ```
 * node sign-verify-quai-ecdsa.js
 * ```
 * 
 * The script will output:
 * - The signer's address
 * - The transaction to be signed (with chainId, nonce, gas parameters)
 * - The serialized signed transaction
 * - The transaction hash
 * - The recovered signer address
 * - Verification result
 * 
 * Note: This example uses standard EVM-style ECDSA signatures, which are
 * different from the Schnorr signatures used in Qi (UTXO) transactions.
 */


async function main() {
    // Create wallet
    const mnemonic = Mnemonic.fromPhrase(process.env.MNEMONIC);
    const quaiWallet = QuaiHDWallet.fromMnemonic(mnemonic);

    const addressInfo1 = await quaiWallet.getNextAddress(0, Zone.Cyprus1);
    const from = addressInfo1.address;
	console.log('\n... signer address (from): ', from);
	
    // Create tx
    const txObj = new QuaiTransaction(from);
	txObj.chainId = BigInt(969);
	txObj.nonce = BigInt(0);
    txObj.gasLimit = BigInt(1000000);
    txObj.gasPrice = BigInt(30000000000000);
    txObj.to = '0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329';
    txObj.value = BigInt(4200000);


	console.log('\n... transaction to sign: ', JSON.stringify(txObj, null, 2));

    // Sign the tx
	const signedTxSerialized = await quaiWallet.signTransaction(txObj);
	console.log('\n... signed transaction (serialized): ', signedTxSerialized);

    // Unmarshall the signed tx
    const signedTxObj = QuaiTransaction.from(signedTxSerialized);

    // Get the signature
    const signature = signedTxObj.signature;

    // Verify the signature
    const txHash = signedTxObj.digest;
	console.log('\n... txHash to verify: ', txHash);
    const signerAddress = recoverAddress(txHash, signature);
	console.log('\n... signerAddress (recovered): ', signerAddress);
    if (signerAddress === from) {
        console.log('\n=> signature is valid');
    } else {
        console.log('\n=> signature is invalid');
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
