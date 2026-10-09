# Using WalletConnect wallets with quais

`WalletConnectProvider` lets a wallet connected over
[WalletConnect](https://walletconnect.network/) sign Quai transactions, even
though WalletConnect wallets speak the Ethereum `eth_*` JSON-RPC namespace
rather than Quai's `quai_*` namespace.

It is the WalletConnect counterpart of `BrowserProvider` (which wraps an
injected wallet such as Pelagus). Once constructed, you use it exactly like any
other provider: call `getSigner()` and hand the signer to a `Contract`.

## Why a dedicated provider is needed

`BrowserProvider` sends the whole `quai_*` namespace — reads *and* writes — to
the single injected provider it wraps, because a Quai-native wallet proxies all
of it. A WalletConnect session is different in two ways:

1. It only answers **wallet-controlled** methods (accounts + signing), and only
   under their `eth_*` names.
2. It does **not** serve arbitrary reads (nonce, gas, chain id, receipts).

`WalletConnectProvider` bridges both gaps:

- **Wallet methods** (`quai_sendTransaction`, `quai_signTypedData_v4`,
  `quai_accounts`, …) are translated to their `eth_*` equivalents and sent to
  the WalletConnect wallet. The wallet must run a Quai-native serializer under
  `eth_sendTransaction` (chain id `9`, mapped through WalletConnect's `eip155`
  namespace).
- **Everything else** is a read and is routed to a Quai RPC you provide.

## Basic usage

```ts
import { WalletConnectProvider, Contract } from 'quais';

// `wcProvider` is the EIP-1193 provider from an established WalletConnect
// session (e.g. `@walletconnect/ethereum-provider` or a wagmi connector's
// `getProvider()`), already on chain id 9.
const provider = new WalletConnectProvider(
    wcProvider,
    'https://rpc.quai.network/cyprus1', // Quai RPC for reads
    9,                                  // network (optional, avoids a chainId round-trip)
);

const signer = await provider.getSigner();
const contract = new Contract(tokenAddress, erc20Abi, signer);
await contract.transfer(recipient, amount);
```

Every existing `quais.Contract` write works unchanged — only the provider
construction differs from an injected-wallet setup.

## With wagmi

Keep wagmi's standard `walletConnect()` connector for the *connection*, then
wrap the connector's provider for *signing*:

```ts
import { WalletConnectProvider } from 'quais';

const wcProvider = await connector.getProvider(); // wagmi Connector
const provider = new WalletConnectProvider(wcProvider, QUAI_RPC_URL, 9, {
    account: address, // reject writes signed for a different account
});
const signer = await provider.getSigner();
```

## Options

```ts
new WalletConnectProvider(wallet, rpc, network?, {
    gasMultiplier?: number, // default 1
    account?: string,       // default undefined
});
```

- **`rpc`** — a Quai RPC URL string, or an existing `JsonRpcProvider`. Pass a
  `JsonRpcProvider` when you need multi-shard routing; a URL string is served by
  a single endpoint (fine when it is scoped to the account's zone).
- **`gasMultiplier`** — multiply the `quai_estimateGas` result by this factor
  before the wallet signs (e.g. `1.5`). See the caveat below.
- **`account`** — if set, any transaction or typed-data request signed for a
  different address is rejected, guarding against a stale session signing from
  an unexpected account.

## Gas caveat (important)

A raw `estimateGas` result can be a hair too low for on-chain execution of
nested contract calls — a DEX swap's inner token transfer gets starved of gas
under the EIP-150 63/64 rule — so wallets normally pad the estimate. Set
`gasMultiplier` (e.g. `1.5`) so the transaction the wallet signs carries
headroom.

This only helps wallets that **honor the gas limit the dApp provides**. Some
WalletConnect wallets re-estimate gas on their own node and ignore the provided
limit entirely; for those, `gasMultiplier` has no effect and gas-tight
transactions will revert with out-of-gas until the wallet adds its own buffer.
When integrating a specific hardware/mobile wallet, verify a real swap on-device
before treating it as supported.
