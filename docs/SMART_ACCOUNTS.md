# Smart-account wallet connector (experimental)

The `quais/smart-account` entry point provides a portable client and optional browser
popup transport. It has no Privy, React, relay server, factory address, token catalog
dependency for the connector. An optional Safe adapter is exported alongside it. It is not an ERC-4337 bundler client, an EIP-1193 provider,
or a replacement for the existing native `Wallet` signer.

```ts
import { SmartAccountClient, createPopupTransport } from 'quais/smart-account';

const wallet = new SmartAccountClient(
    createPopupTransport({
        walletUrl: 'https://wallet.qu.ai', // configure a trusted wallet host
        // Only use background methods the chosen host explicitly supports.
        backgroundMethods: ['sendCalls'],
        onAttention(waiting) {
            setShowOpenWallet(waiting);
        },
    }),
);
// Call connect from a click handler so the browser permits the popup.
const account = await wallet.connect();
const capabilities = await wallet.getCapabilities();
const requestId = crypto.randomUUID();
// Persist requestId and the exact calls before opening the wallet.
// On later action clicks, prepare synchronously before awaiting quotes or RPC.
wallet.prepare();
const operation = await wallet.sendCalls({
    chainId: account.chainId,
    account: account.address,
    calls: [{ to: recipient, value: '1000000000000000000', data: '0x' }],
    requestId,
});
// Operation IDs are opaque relay IDs, not transaction hashes.
const status = await wallet.getOperation(operation.id);
// If a reload lost the sendCalls response:
const recovered = await wallet.getOperationByRequest(requestId);
// Only status.state === 'confirmed' reports confirmed success.
await wallet.disconnect();
wallet.destroy();
```

Amounts are decimal base-unit strings. `data` is hexadecimal contract calldata.
The selected wallet determines supported actions, contract implementation, signing
provider and sponsorship. Check capabilities before using optional methods.
`signMessage`, `getDepositQuote`, `getDepositStatus`, and `recoverDeposit` are
available to hosts that advertise those capabilities. `getFeeQuote` is available
to transports with quote support; the current Quai Smart
Wallet host advertises `payment.quotes: false` and rejects that method. All actions
accepted by that host's relay are sponsored without reimbursement, subject to capacity.
Capabilities do not reserve gas or guarantee admission.
`backgroundSwaps: true` means the connected user has allowed eligible swaps from
that app to skip the wallet host's review screen. It does not make arbitrary calls
silent and does not guarantee that a signer prompt can stay in the background.

A custom `WalletTransport` may replace the popup transport for native/mobile hosts.
It must enforce the same consent, signing and response-validation requirements.
`serveWalletRequests` supplies source/origin/channel validation for browser hosts.
With the popup transport, omit `source` so the host binds the source from the
first validated `hello` message; the popup has no `window.opener` reference.
It does not itself implement permissions, account verification or transaction review.
The reference Quai Smart Wallet host supplies these separately.

## Security and lifecycle

-   Pin the wallet URL; never take it from an untrusted transaction or query string.
-   HTTPS is required except exact localhost origins for development. Popup messages
    bind both window identity and origin, version, channel and request ID.
-   Requests are serialized through one popup and are never automatically retried.
    `pendingRequests` includes active and queued work, so apps can skip background
    polling while an interactive action is pending.
-   Call `prepare()` synchronously from action click handlers before awaited quote,
    simulation or RPC work. It opens or focuses the trusted wallet without starting
    a request, preventing browser popup blocking after a page reload loses the old
    window handle.
-   The popup transport focuses interactive requests by default. A reviewed host can
    opt specific methods into `backgroundMethods` and call `prepare({ focus: false })`
    to keep an existing window behind the dApp. This changes focus only: the host must
    still validate every request and bring itself forward whenever user review is
    required. When the host calls `HostContext.attention()`, the transport attempts to
    focus it and invokes `onAttention(true)`. Browsers may reject programmatic focus,
    so the app should display an **Open wallet** control whose click handler calls
    `prepare()`. The transport invokes `onAttention(false)` when the request settles.
-   A signer rejection using EIP-1193 code `4001` or ethers `ACTION_REJECTED` is
    normalized to `USER_REJECTED`. Other unexpected provider errors are sanitized as
    `REQUEST_FAILED`; raw provider text never crosses from the wallet host to the app.
-   `AbortSignal`, popup closure and timeouts stop waiting. They cannot reverse a
    transaction already submitted. Inspect activity/status before any retry.
-   Persist a UUIDv4 `requestId` before `sendCalls` or `recoverDeposit`. A conforming
    host can map it to an operation before relay submission; recover a response lost
    during refresh with `getOperationByRequest(requestId)`.
-   Keep the popup open for noninteractive status reads. If closed, invoke the next
    request from a user gesture to reopen it. Reloading a pending popup requires recovery.
-   After 1,000 requests, the host returns `RECONNECT`. The transport closes that
    popup; invoke the next request from a user gesture to open a fresh session.
-   Importing the module in Node is safe. Only creating the popup transport needs a browser.
-   A connected address is the smart account, not its owner signer. Changing an app's
    embedded signer does not move funds or transfer ownership.
-   Contract adapters and manifests must be versioned and reviewed independently.

This source addition is not a published npm release. Native end-to-end execution and
supported signers must be tested by integrating wallet hosts before production use.

## Safe 1.4.1 adapter

The same entry point exports pure upstream Safe helpers, without a default deployment,
RPC, UI or signer. Supply independently verified contract addresses:

```ts
import {
    findSafe,
    encodeSafeCreate,
    safeRequest,
    encodeSafeExecute,
    safePersonalSignature,
    safeSigner,
    verifySafeDeployment,
    verifySafeAccount,
    TypedDataEncoder,
} from 'quais';

const predicted = findSafe(factory, owner, deployment);
const setup = encodeSafeCreate(owner, factory, deployment);
// Factory setup is atomic: one owner, threshold one, pinned handler, no modules,
// guard, setup payment or setup delegatecall. Show consent before submission.
await verifySafeDeployment(reader, factory, deployment);
// After confirmed creation:
await verifySafeAccount(reader, predicted.account, deployment, owner);
const request = safeRequest(chainId, predicted.account, calls, nonce, deployment.multiSendCallOnly);
const digest = TypedDataEncoder.hash(request.domain, request.types, request.value);
// Trusted wallet host only, after decoded review. Provider is the chosen EVM signer.
const raw = await provider.request({ method: 'personal_sign', params: [digest, owner] });
const signature = safePersonalSignature(raw);
if (safeSigner(request, signature) !== owner) throw Error('Owner signature mismatch');
const data = encodeSafeExecute(request, signature);
// Submit {to: predicted.account, data} through a native Quai sender or relay.
```

`deployment` contains singleton, fallbackHandler and multiSendCallOnly. `reader`
has `code(address)` and `call(address, calldata)` methods. findSafe searches the
existing Safe saltNonce for Cyprus-1; it does not alter upstream contract bytes.
Verify the owner's provider account before and after prompts and discard responses
after disconnect. Do not expose generic signing to untrusted dApps.

safeRequest defaults to fully sponsored execution (zero reimbursement). It uses
CALL or a delegatecall to supplied MultiSendCallOnly; callers must verify that
address. decodeSponsoredSafe enforces the sponsored subset, not all Safe features.
SafeTx has no expiry; nonce consumption prevents replay. A UI timeout does not
invalidate a signed transaction. safeMessageRequest constructs the standard handler's
account-bound ERC-1271 wrapping.

This adapter supports the single-owner, threshold-one profile without modules/guard.
Safe itself supports more configurations. Native-funded integration and actual
browser signers must be tested by the host; inclusion in this library does not
certify a live deployment. See [artifact provenance](SAFE_ARTIFACTS.md).

## Funding a deployed Safe with native QUAI

For an upstream SafeProxy, a native transfer with empty calldata still executes the
proxy and singleton receive path. Quai therefore requires the sender's transaction
access list to cover both contracts. Generating a list only for nonempty calldata is
insufficient: an empty-data Pelagus transfer constructed with quais.js alpha.54
reverted with an empty list.

The source fix in `AbstractSigner.populateQuaiTransaction` generates access lists
for native type-0 transfers too, including when the caller sets a gas limit. It
estimates gas with that same list, preserving caller-supplied lists. Explicit lists
must be complete. This fix requires adoption by the sending wallet; updating the
receiving wallet UI does not update an installed extension. It is not yet an npm
release or proof of a successful funded transfer.

For manual transaction preparation, call `provider.createAccessList(request)`,
then `provider.estimateGas({ ...request, accessList })`, and include both results
in the exact transaction reviewed and signed. Generate fresh values for each send;
do not hardcode an incident's estimate or change the list after signing. A successful
read-only call alone does not verify access-list enforcement during mining.

The `quai-receive-v1` deployment profile uses the unchanged Safe 1.4.1 singleton
with a Quai-specific proxy and factory. Its proxy handles empty-calldata native
deposits directly and emits the standard `SafeReceived` event, so that deposit path
does not need to access the singleton. Pass the profile in `SafeDeployment`;
discovery, creation and runtime verification then use the profile's pinned creation
code and code hashes. Accounts created by the upstream and receiving profiles have
different deterministic addresses.

The embedded profile artifact uses Safe 1.4.1's Solidity 0.7.6 compiler settings.
Its constructor, nonempty-calldata fallback and factory logic are source-compared
to the pinned upstream release; direct `receive()` is the explicit behavior delta.

The receiving profile does not remove access-list requirements for token calls,
Safe execution, swaps or other contract interactions. Keep normal transaction
access-list generation enabled even when a dApp uses this profile.
