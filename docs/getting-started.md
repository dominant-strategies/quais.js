# Getting Started @<getting-started> @priority<100>

This is a very short introduction to quais, but covers many of the most common operations that developers require and provides a starting point for those newer to Quai Network.

## Getting quais

If using NPM, you must first install quais.

```bash
  # Install quais
  /home/test-quais> npm install quais
```

Everything in quais is exported from its root as well as on the `quais` object. There are also `exports` in the `package.json` to facilitate more fine-grained importing.

Generally this documentation will presume all exports from quais have been imported in the code examples, but you may import the necessary objects in any way you wish.

```js title=Importing In NodeJS
// Import everything
import { quais } from 'quais';

// Import just a few select items
import { BrowserProvider, parseUnits } from 'quais';

// Import from a specific export
import { QuaiHDWallet, QiHDWallet } from 'quais/wallet';
```

```js title=Importing In a Browser
<script type="module">
    import {quais} from "https://cdnjs.cloudflare.com/ajax/libs/quais/6.7.0/quais.min.js"; // Your code here...
</script>
```

## Some Common Terminology

To begin, it is useful to have a basic understanding of the types of objects available and what they are responsible for, at a high level.

### Provider

A `Provider` is a read-only connection to the blockchain, which allows querying the blockchain state, such as account, block or transaction details, querying event logs or evaluating read-only code using call.

If you are coming from Web3.js, you are used to a **Provider** offering both read and write access. In quais, all write operations are further abstracted into another Object, the **Signer**.

### Signer

A `Signer` wraps all operations that interact with an account. An account generally has a private key located _somewhere_, which can be used to sign a variety of types of payloads.

The private key may be located in memory (using a Wallet) or protected via some IPC layer, such as MetaMask which proxies interaction from a website to a browser plug-in, which keeps the private key out of the reach of the website and only permits interaction after requesting permission from the user and receiving authorization.

### Transaction

To make any state changes to the blockchain, a transaction is required, which requires a fee to be paid, where the fee covers the associated costs with executing the transaction (such as reading the disk and performing maths) and storing the updated information.

If a transaction reverts, a fee must still be paid, since the validator still had to expend resources to try running the transaction to determine that it reverted and the details of its failure are still be recorded.

Transactions include sending ether from one user to another, deploying a **Contract** or executing a state-changing operation against a **Contract**.

### Contract

A `Contract` is a program that has been deployed to the blockchain, which includes some code and has allocated storage which it can read from and write to.

It may be read from when it is connected to a Provider or state-changing operations can be called when connected to a Signer.

### Receipt

Once a **Transaction** has been submitted to the blockchain, it is placed in the memory pool (mempool) until a miner decides to include it.

A transaction's changes are only made once it has been included in the blockchain, at which time a receipt is available, which includes details about the transaction, such as which block it was included in, the actual fee paid, gas used, all the events that it emitted and whether it was successful or reverted.

## Connecting to Quai

This very first thing needed to begin interacting with the blockchain is connecting to it using a [[Provider]].

### Pelagus (and other injected providers)

The quickest and easiest way to experiment and begin developing on Quai is to use [Pelagus](https://pelaguswallet.io/), which is a browser extension that injects objects into the `window`, providing:

-   read-only access to Quai (a Provider)
-   authenticated write access backed by a private key (a Signer)

When requesting access to the authenticated methods, such as sending a transaction or even requesting the private key address, MetaMask will show a pop-up to the user asking for permission.

```js
let signer = null;
let provider;

if (window.pelagus == null) {
    // Indicate if Pelagus is not installed
    console.log('Pelagus not installed');
} else {
    // Connect to the Pelagus EIP-1193 object. This is a standard
    // protocol that allows quais access to make all read-only
    // requests through Pelagus.
    provider = new quais.BrowserProvider(window.pelagus);

    // It also provides an opportunity to request access to write
    // operations, which will be performed by the private key
    // that Pelagus manages for the user.
    signer = await provider.getSigner();
}
```

### Custom RPC Backend

If you are running your own Quai node (e.g. [go-quai](https://qu.ai/docs/category/node/)) or using a custom third-party service, you can use the `JsonRpcProvider` directly, which communicates using the [JSON-RPC](https://qu.ai/docs/develop/apis/json-rpc-api/) protocol.

When using your own Quai node as a provider, the resultant `Signer` will return `null`. The go-quai client does not bundle a CLI wallet or key manager, so it is not possible to sign transactions directly from the node.

## User Interaction

All units in Quai tend to be integer values, since dealing with decimals and floating points can lead to imprecise and non-obvious results when performing mathematic operations.

As a result, the internal units used (e.g. wei) which are suited for machine-readable purposes and maths are often very large and not easily human-readable.

For example, imagine dealing with dollars and cents; you would show values like `"$2.56"`. In the blockchain world, we would keep all values as cents, so that would be `256` cents, internally.

So, when accepting data that a user types, it must be converted from its decimal string representation (e.g. `"2.56"`) to its lowest-unit integer representation (e.g. `256`). And when displaying a value to a user the opposite operation is necessary.

In Quai, _one quai_ is equal to `10 *\* 18` wei and _one gwei_ is equal to `10 *\* 9` wei, so the values get very large very quickly, so some convenience functions are provided to help convert between representations.

```js
// Convert user-provided strings in Quai to wei for a value
quai = parseQuai('1.0');

// Convert user-provided strings in gwei to wei for max base fee
feePerGas = parseUnits('4.5', 'gwei');

// Convert a value in wei to a string in Quai to display in a UI
formatQuai(quai);

// Convert a value in wei to a string in gwei to display in a UI
formatUnits(feePerGas, 'gwei');
```

## Interacting with the Blockchain

### Querying State

Once you have a Provider, you have a read-only connection to the data on the blockchain. This can be used to query the current account state, fetch historic logs, look up contract code and so on.

```js
// Look up the current block number (i.e. height)
await provider.getBlockNumber();

// Get the current balance of an account
balance = await provider.getBalance('0x643aA0A61eADCC9Cc202D1915D942d35D005400C');

// Since the balance is in wei, you may wish to display it
// in Quai instead.
formatQuai(balance);

// Get the next nonce required to send a transaction
await provider.getTransactionCount('0x643aA0A61eADCC9Cc202D1915D942d35D005400C');
```

### Sending Transactions

To write to the blockchain you require access to a private key which controls some account. In most cases, those private keys are not accessible directly to your code, and instead you make requests via a `Signer`, which dispatches the request to a service (such as [Pelagus](https://pelaguswallet.io/)) which provides strictly gated access and requires feedback to the user to approve or reject operations.

```js
// When sending a transaction, the value is in wei, so parseQuai
// converts quai to wei.
tx = await signer.sendTransaction({
    to: '0x643aA0A61eADCC9Cc202D1915D942d35D005400C',
    value: parseQuai('1.0'),
});
```

## Contracts

A **Contract** is a meta-class, which means that its definition its derived at run-time, based on the ABI it is passed, which then determined what methods and properties are available on it.

### Application Binary Interface (ABI)

Since all operations that occur on the blockchain must be encoded as binary data, we need a concise way to define how to convert between common objects (like strings and numbers) and its binary representation, as well as encode the ways to call and interpret the Contract.

For any method, event or error you wish to use, you must include a Fragment to inform quais how it should encode the request and decode the result.

Any methods or events that are not needed can be safely excluded.

There are several common formats available to describe an ABI. The Solidity compiler usually dumps a JSON representation but when typing an ABI by hand it is often easier (and more readable) to use the human-readable ABI, which is just the Solidity signature.

```js
abi = [
    'function decimals() view returns (string)',
    'function symbol() view returns (string)',
    'function balanceOf(address addr) view returns (uint)',
];

// Create a contract
contract = new Contract('0x643aA0A61eADCC9Cc202D1915D942d35D005400C', abi, provider);
```

### Read-only methods (i.e. `view` and `pure`)

A read-only method is one which cannot change the state of the blockchain, but often provide a simple interface to get important data about a Contract.

```js
// The contract ABI (fragments we care about)
abi = [
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function balanceOf(address a) view returns (uint)',
];

// Create a contract; connected to a Provider, so it may
// only access read-only methods (like view and pure)
contract = new Contract('0x643aA0A61eADCC9Cc202D1915D942d35D005400C', abi, provider);

// The symbol name for the token
sym = await contract.symbol();

// The number of decimals the token uses
decimals = await contract.decimals();

// Read the token balance for an account
balance = await contract.balanceOf('0x643aA0A61eADCC9Cc202D1915D942d35D005400C');

// Format the balance for humans, such as in a UI
formatUnits(balance, decimals);
```

### State-changing Methods

```js title=Change state on an ERC-20 contract
abi = ['function transfer(address to, uint amount)'];

// Connected to a Signer; can make state changing transactions,
// which will cost the account quai
contract = new Contract('0x643aA0A61eADCC9Cc202D1915D942d35D005400C', abi, signer);

// Send 1 ERC-20 token to another account
amount = parseUnits('1.0', 18);

// Send the transaction
tx = await contract.transfer('0x643aA0A61eADCC9Cc202D1915D942d35D005400C', amount);
```

```js title=Preflighting a Transaction
abi = ['function transfer(address to, uint amount) returns (bool)'];

// Connected to a Provider since we only require read access
contract = new Contract('0x643aA0A61eADCC9Cc202D1915D942d35D005400C', abi, provider);

amount = parseUnits('1.0', 18);

// There are many limitations to using a static call, but can
// often be useful to preflight a transaction.
await contract.transfer.staticCall('0x643aA0A61eADCC9Cc202D1915D942d35D005400C', amount);

// We can also simulate the transaction as another account
other = new VoidSigner('0x643aA0A61eADCC9Cc202D1915D942d35D005400C');
contractAsOther = contract.connect(other.connect(provider));
await contractAsOther.transfer.staticCall('0x643aA0A61eADCC9Cc202D1915D942d35D005400C', amount);
```

### Listening to Events

Quais does not natively support event listening via polling. Instead, it relies on the shim package [`quais-polling`](https://npmjs.com/package/quais-polling) to provide a short-lived event listener. For more information, see the [quais-polling documentation](https://www.npmjs.com/package/quais-polling).

### Query Historic Events

When querying within a large range of blocks, some backends may be prohibitively slow, may return an error or may truncate the results without any indication. This is at the discretion of each backend.

```js title=Query historic ERC-20 events
abi = ['event Transfer(address indexed from, address indexed to, uint amount)'];

// Create a contract; connected to a Provider, so it may
// only access read-only methods (like view and pure)
contract = new Contract('0x643aA0A61eADCC9Cc202D1915D942d35D005400C', abi, provider);

// Query the last 100 blocks for any transfer
filter = contract.filters.Transfer;
events = await contract.queryFilter(filter, -100);

// The events are a normal Array
events.length;

// The first matching event
events[0];

// Query all time for any transfer to quais.eth
filter = contract.filters.Transfer('0x643aA0A61eADCC9Cc202D1915D942d35D005400C');
events = await contract.queryFilter(filter);

// The first matching event
events[0];
```

### Signing Messages

A private key can do a lot more than just sign a transaction to authorize it. It can also be used to sign other forms of data, which are then able to be validated for other purposes.

For example, signing **a message** can be used to prove ownership of an account which a website could use to authenticate a user and log them in.

```js
// Our signer; Signing messages does not require a Provider
signer = new Wallet(id('test'));

message = 'sign into qu.ai?';

// Signing the message
sig = await signer.signMessage(message);

// Validating a message; notice the address matches the signer
verifyMessage(message, sig);
```

Many other more advanced protocols built on top of signed messages are used to allow a private key to authorize other users to transfer their tokens, allowing the transaction fees of the transfer to be paid by someone else.
