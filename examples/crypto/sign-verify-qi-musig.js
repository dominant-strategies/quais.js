const {
	Mnemonic,
	QiHDWallet,
	Zone,
	QiTransaction,
	getBytes,
	musigCrypto,
	hexlify,
} = require('../../lib/commonjs/quais');
require('dotenv').config();
const { schnorr } = require('@noble/curves/secp256k1');
const { MuSigFactory } = require('@brandonblack/musig');

/**
 * MuSig Signature Example for Qi Transactions
 * 
 * This script demonstrates how to create and verify a MuSig (multi-signature) Schnorr signature
 * for a Qi transaction. It shows the complete workflow of:
 * 1. Creating multiple addresses from a single wallet
 * 2. Creating a Qi transaction with multiple inputs
 * 3. Signing with MuSig (aggregated signatures)
 * 4. Verifying the aggregated signature
 * 
 * Usage:
 * First, set up your .env file with:
 * MNEMONIC="your twelve word mnemonic phrase here"
 * 
 * Then run:
 * ```
 * node sign-verify-qi-musig.js
 * ```
 * 
 * The script will output:
 * - Two signer addresses
 * - The transaction to be signed
 * - The serialized signed transaction
 * - The transaction hash
 * - The verification result
 * 
 * Note: This example uses MuSig for aggregating Schnorr signatures, which is
 * particularly useful for UTXO-based multi-signature transactions.
 */

async function main() {
    // Create wallet
    const mnemonic = Mnemonic.fromPhrase(process.env.MNEMONIC);
    const qiWallet = QiHDWallet.fromMnemonic(mnemonic);

    // Generate 1 address for each outpoint
    const addressInfo1 = await qiWallet.getNextAddress(0, Zone.Cyprus1);
    const addr1 = addressInfo1.address;
    const pubkey1 = addressInfo1.pubKey;
	console.log('\n... signer address #1: ', addr1);
    const addressInfo2 = await qiWallet.getNextAddress(0, Zone.Cyprus1);
    const addr2 = addressInfo2.address;
    const pubkey2 = addressInfo2.pubKey;
	console.log('\n... signer address #2: ', addr2);
    // Define the outpoints for addr1
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
        {
            outpoint: {
                txhash: '0xccb4b1ae1e97c64f8af4bd04cc061f691fd035fe1aa0bb21d464450dc3d3b959',
                index: 0,
                denomination: 7,
            },
            address: addr2,
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
        {
            txhash: '0xccb4b1ae1e97c64f8af4bd04cc061f691fd035fe1aa0bb21d464450dc3d3b959',
            index: 0,
            pubkey: pubkey2,
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

    // Unmarshall the signed Tx
    const signedTxObj = QiTransaction.from(serializedSignedTx);
	console.log('\n... signed transaction (serialized): ', serializedSignedTx);

	// Digest to verify
	const txHash = getBytes(signedTxObj.digest);
	console.log('\n... txHash to verify: ', signedTxObj.digest);
	
    // Get the signature from the signed tx
    const signature = signedTxObj.signature;

    const musig = MuSigFactory(musigCrypto);
    const pubKeysArray = [getBytes(pubkey1), getBytes(pubkey2)];
    const aggPublicKeyObj = musig.keyAgg(pubKeysArray);

    let aggPublicKey = hexlify(aggPublicKeyObj.aggPublicKey);

    // Remove the last 32 bytes (64 hex) from the aggPublicKey
    let compressedPubKey = aggPublicKey.slice(0, -64);

    // Remove parity byte from compressedPubKey
    compressedPubKey = '0x' + compressedPubKey.slice(4);

    // Verify the schnoor signature
    const verified = schnorr.verify(getBytes(signature), txHash, getBytes(compressedPubKey));
    console.log('Verified:', verified);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
