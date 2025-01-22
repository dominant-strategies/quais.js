const {
	Mnemonic,
	QiHDWallet,
	Zone,
	QiTransaction,
	getBytes,
} = require('../../lib/commonjs/quais');
require('dotenv').config();

const { schnorr } = require('@noble/curves/secp256k1');

/**
 * Schnorr Signature Example for Qi Transactions
 * 
 * This script demonstrates how to create and verify a Schnorr signature
 * for a Qi transaction. It shows the complete workflow of:
 * 1. Creating a wallet and deriving an address
 * 2. Creating a Qi transaction
 * 3. Signing with Schnorr signature
 * 4. Verifying the signature
 * 
 * Usage:
 * First, set up your .env file with:
 * MNEMONIC="your twelve word mnemonic phrase here"
 * 
 * Then run:
 * ```
 * node sign-verify-qi-schnorr.js
 * ```
 * 
 * The script will output:
 * - The signer's address
 * - The transaction to be signed
 * - The serialized signed transaction
 * - The transaction hash
 * - The verification result
 * 
 * Note: This example uses Schnorr signatures which are more efficient and
 * provide better privacy compared to ECDSA signatures for UTXO transactions.
 */

async function main() {
    // Create wallet
    const mnemonic = Mnemonic.fromPhrase(process.env.MNEMONIC);
    const qiWallet = QiHDWallet.fromMnemonic(mnemonic);

    // Get address info
    const addressInfo1 = await qiWallet.getNextAddress(0, Zone.Cyprus1);
    const addr1 = addressInfo1.address;
	console.log('\n... signer address: ', addr1);
    const pubkey1 = addressInfo1.pubKey;

    // Define the outpoints for addr1 (this is just an example outpoint)
    // Outpoints are typically obtained via the getOutpointsForAddress function
    const outpointsInfo = [
        {
            outpoint: {
                txhash: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
                index: 0,
                denomination: 7,
            },
            address: addr1,
            zone: Zone.Cyprus1,
        },
    ];

    // Polulate wallet with outpoints
    qiWallet.importOutpoints(outpointsInfo);
    // Define tx inputs, outputs for the Qi Tx
    let txInputs = [
        {
            txhash: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
            index: 0,
            pubkey: pubkey1,
        },
    ];

    let txOutputs = [
        {
            address: '0x002F4783248e2D6FF1aa6482A8C0D7a76de3C329',
            denomination: 7,
        },
    ];

    // Create the Qi Tx to be signed
    const tx = new QiTransaction();
    tx.txInputs = txInputs;
    tx.txOutputs = txOutputs;

	console.log('\n... transaction to sign: ', JSON.stringify(tx, null, 2));

    // Sign the tx
    const serializedSignedTx = await qiWallet.signTransaction(tx);
	console.log('\n... signed transaction (serialized): ', serializedSignedTx);
    // Unmarshall the signed Tx
    const signedTxObj = QiTransaction.from(serializedSignedTx);

	// Digest to verify
	const txHash = getBytes(signedTxObj.digest);
	console.log('\n... txHash to verify: ', signedTxObj.digest);

    // Get the signature from the signed tx
    const signature = signedTxObj.signature;

    // Remove parity byte from pubkey
    const publicKey = '0x' + pubkey1.slice(4);

    // Verify the schnoor signature
    const verified = schnorr.verify(getBytes(signature), txHash, getBytes(publicKey));
    console.log('\n=> signature is valid: ', verified);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
