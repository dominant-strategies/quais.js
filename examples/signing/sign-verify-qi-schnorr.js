const {
	Mnemonic,
	QiHDWallet,
	Zone,
	QiTransaction,
	getBytes,
	keccak256,
} = require('../../lib/commonjs/quais');
require('dotenv').config();

const { schnorr } = require('@noble/curves/secp256k1');

async function main() {
    // Create wallet
    const mnemonic = Mnemonic.fromPhrase(process.env.MNEMONIC);
    const qiWallet = QiHDWallet.fromMnemonic(mnemonic);

    // Get address info
    const addressInfo1 = await qiWallet.getNextAddress(0, Zone.Cyprus1);
    const addr1 = addressInfo1.address;
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

    // Calculate the hash of the Qi tx (message to be signed and verified)
    const txHash = getBytes(keccak256(tx.unsignedSerialized));

    // Sign the tx
    const serializedSignedTx = await qiWallet.signTransaction(tx);

    // Unmarshall the signed Tx
    const signedTx = QiTransaction.from(serializedSignedTx);

    // Get the signature from the signed tx
    const signature = signedTx.signature;

    // Remove parity byte from pubkey
    publicKey = '0x' + pubkey1.slice(4);

    // Verify the schnoor signature
    const verified = schnorr.verify(getBytes(signature), txHash, getBytes(publicKey));
    console.log('Verified:', verified);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
