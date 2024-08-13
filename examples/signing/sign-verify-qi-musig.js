const quais = require('../../lib/commonjs/quais');
require('dotenv').config();
const { keccak_256 } = require('@noble/hashes/sha3');
const { schnorr } = require('@noble/curves/secp256k1');
const { MuSigFactory } = require('@brandonblack/musig');

async function main() {
    // Create wallet
    const mnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
    const qiWallet = quais.QiHDWallet.fromMnemonic(mnemonic);

    // Generate 1 address for each outpoint
    const addressInfo1 = await qiWallet.getNextAddress(0, quais.Zone.Cyprus1);
    const addr1 = addressInfo1.address;
    const pubkey1 = addressInfo1.pubKey;

    const addressInfo2 = await qiWallet.getNextAddress(0, quais.Zone.Cyprus1);
    const addr2 = addressInfo2.address;
    const pubkey2 = addressInfo2.pubKey;

    // Define the outpoints for addr1
    const outpointsInfo = [
        {
            outpoint: {
                txhash: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
                index: 0,
                denomination: 7,
            },
            address: addr1,
            zone: quais.Zone.Cyprus1,
        },
        {
            outpoint: {
                txhash: '0xccb4b1ae1e97c64f8af4bd04cc061f691fd035fe1aa0bb21d464450dc3d3b959',
                index: 0,
                denomination: 7,
            },
            address: addr2,
            zone: quais.Zone.Cyprus1,
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
    const tx = new quais.QiTransaction();
    tx.txInputs = txInputs;
    tx.txOutputs = txOutputs;

    // Calculate the hash of the Qi tx (message to be signed and verified)
    const txHash = keccak_256(tx.unsignedSerialized);

    // Sign the tx
    const serializedSignedTx = await qiWallet.signTransaction(tx);

    // Unmarshall the signed Tx
    const signedTx = quais.QiTransaction.from(serializedSignedTx);

    // Get the signature from the signed tx
    const signature = signedTx.signature;

    const musig = MuSigFactory(quais.musigCrypto);
    const pubKeysArray = [quais.getBytes(pubkey1), quais.getBytes(pubkey2)];
    const aggPublicKeyObj = musig.keyAgg(pubKeysArray);

    let aggPublicKey = quais.hexlify(aggPublicKeyObj.aggPublicKey);

    // Remove the last 32 bytes (64 hex) from the aggPublicKey
    let compressedPubKey = aggPublicKey.slice(0, -64);

    // Remove parity byte from compressedPubKey
    compressedPubKey = '0x' + compressedPubKey.slice(4);

    // Verify the schnoor signature
    const verified = schnorr.verify(quais.getBytes(signature), txHash, quais.getBytes(compressedPubKey));
    console.log('Verified:', verified);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
