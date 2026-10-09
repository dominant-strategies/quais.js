const quais = require('../../lib/commonjs/quais');
require('dotenv').config();

// WalletConnectProvider lets a WalletConnect wallet (which speaks the Ethereum
// `eth_*` namespace) sign Quai transactions. Wallet methods are translated to
// their `eth_*` names and sent to the wallet; reads are routed to a Quai RPC.
//
// In a real app `wcProvider` comes from an established WalletConnect session
// (e.g. `@walletconnect/ethereum-provider`, or a wagmi connector's
// `getProvider()`). Here we stub it to show the wiring without a live session.
async function main() {
    const rpcUrl = process.env.RPC_URL || 'https://rpc.quai.network/cyprus1';

    // --- Stub WalletConnect wallet (replace with your real WC provider) -------
    const account = '0x0015f5A6b1E6A0978E7ff0344fb863E75FDefb05';
    const wcProvider = {
        async request({ method }) {
            if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
            if (method === 'eth_sendTransaction') return '0x' + 'ab'.repeat(32);
            throw new Error(`stub does not implement ${method}`);
        },
    };
    // -------------------------------------------------------------------------

    const provider = new quais.WalletConnectProvider(wcProvider, rpcUrl, 9, {
        gasMultiplier: 1.5, // pad estimateGas so gas-tight swaps do not run out
        account, // reject writes signed for a different account
    });

    // Reads are served by the RPC; wallet methods go to the WalletConnect wallet.
    const signer = await provider.getSigner();
    console.log('Signer address:', await signer.getAddress());

    // `new quais.Contract(addr, abi, signer)` then any write works as usual, e.g.:
    //   const router = new quais.Contract(routerAddress, routerAbi, signer);
    //   await router.swapExactETHForTokens(minOut, path, to, deadline, { value });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
