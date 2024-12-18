const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

async function main() {
    // Create provider
	const options =  {usePathing: false};
    const provider = new quais.JsonRpcProvider(process.env.RPC_URL, undefined, options);

    // Create wallet and connect to provider
    console.log(process.env.RPC_URL)
    const aliceMnemonic = quais.Mnemonic.fromPhrase(process.env.MNEMONIC);
    const aliceWallet = quais.QiHDWallet.fromMnemonic(aliceMnemonic);
    aliceWallet.connect(provider);

    // Get Alice payment code
    const alicePaymentCode = aliceWallet.getPaymentCode(0);
    console.log("Alice payment code: ", alicePaymentCode);
 
	// Create Bob wallet
	const BOB_MNEMONIC = "innocent perfect bus miss prevent night oval position aspect nut angle usage expose grace juice";
	const bobMnemonic = quais.Mnemonic.fromPhrase(BOB_MNEMONIC);
    const bobWallet = quais.QiHDWallet.fromMnemonic(bobMnemonic);
    bobWallet.connect(provider);

	// Get Bob payment code
	const bobPaymentCode = bobWallet.getPaymentCode(0);
	console.log("Bob payment code: ", bobPaymentCode);

	// Open channel
	aliceWallet.openChannel(bobPaymentCode);
	bobWallet.openChannel(alicePaymentCode);

	// Scan Alice wallet
	console.log("...scanning alice wallet");
	await aliceWallet.scan(quais.Zone.Cyprus1);

	// log alice change wallet addresses
	console.log("Alice change wallet addresses: ", aliceWallet.getChangeAddressesForZone(quais.Zone.Cyprus1).map(a => a.address));
	// log alice external wallet addresses
	console.log("Alice external wallet addresses: ", aliceWallet.getAddressesForZone(quais.Zone.Cyprus1).map(a => a.address));

	// Scan Bob wallet
	console.log("...scanning bob wallet");
	await bobWallet.scan(quais.Zone.Cyprus1);

	// Get Alice initial balance
	console.log("...getting alice initial balance");
	const aliceInitialBalance = await aliceWallet.getBalanceForZone(quais.Zone.Cyprus1);
	console.log("Alice initial balance: ", aliceInitialBalance);

	// Get Bob initial balance
	console.log("...getting bob initial balance");
	const bobInitialBalance = await bobWallet.getBalanceForZone(quais.Zone.Cyprus1);
	console.log("Bob initial balance: ", bobInitialBalance);

	// Send Qi
	console.log("...sending qi to Bob");
	const amountToSendToBob = 25000;
	const tx = await aliceWallet.sendTransaction(bobPaymentCode, amountToSendToBob, quais.Zone.Cyprus1, quais.Zone.Cyprus1);
	console.log("... Alice transaction sent. Waiting for receipt...");

	// Wait for tx to be mined
	const txReceipt = await tx.wait();
	console.log("Alice's transaction receipt: ", txReceipt);

	// Sync wallets
	console.log("...syncing wallets");
	await aliceWallet.sync(quais.Zone.Cyprus1);
	await bobWallet.sync(quais.Zone.Cyprus1);

	// Get Alice updated balance
	console.log("...getting alice updated balance");
	const aliceUpdatedBalance = await aliceWallet.getBalanceForZone(quais.Zone.Cyprus1);
	console.log("Alice updated balance: ", aliceUpdatedBalance);

	// Get Bob updated balance
	console.log("...getting bob updated balance");
	const bobUpdatedBalance = await bobWallet.getBalanceForZone(quais.Zone.Cyprus1);
	console.log("Bob updated balance: ", bobUpdatedBalance);

	// Bob sends Qi back to Alice
	console.log("...sending qi back to Alice");
	const amountToSendToAlice = 10000;
	const tx2 = await bobWallet.sendTransaction(alicePaymentCode, amountToSendToAlice, quais.Zone.Cyprus1, quais.Zone.Cyprus1);
	console.log("... Bob sent transaction. Waiting for receipt...");

	// Wait for tx2 to be mined
	const tx2Receipt = await tx2.wait();
	console.log("Bob's transaction receipt: ", tx2Receipt);

	// Sync wallets
	await aliceWallet.sync(quais.Zone.Cyprus1);
	await bobWallet.sync(quais.Zone.Cyprus1);

	// Get Alice updated balance
	console.log("...getting alice updated balance");
	const aliceUpdatedBalance2 = await aliceWallet.getBalanceForZone(quais.Zone.Cyprus1);
	console.log("Alice updated balance: ", aliceUpdatedBalance2);

	// Get Bob updated balance
	console.log("...getting bob updated balance");
	const bobUpdatedBalance2 = await bobWallet.getBalanceForZone(quais.Zone.Cyprus1);
	console.log("Bob updated balance: ", bobUpdatedBalance2);

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
