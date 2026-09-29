/**
 * General wallet client and browser transport; signer and contract implementations remain adapters.
 */
export { SmartAccountClient, createPopupTransport, createEmbeddedTransport } from './connector.js';
export type { WalletTransport } from './connector.js';
export { WalletConnectorError, isUserRejection } from './connector-protocol.js';
export type {
    SendCalls,
    WalletAccount,
    WalletCapabilities,
    WalletOperation,
    WalletFeeQuote,
    WalletMethod,
    ConnectorRequest,
    MessagePeer,
} from './connector-protocol.js';
export { serveWalletRequests } from './connector-host.js';
export type { HostContext } from './connector-host.js';
export * from './safe.js';
export { QUAI_SAFE_MAINNET_V5 } from './quai-mainnet.js';
