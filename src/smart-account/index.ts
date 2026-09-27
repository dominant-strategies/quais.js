/**
 * General wallet client and browser transport; signer and contract implementations remain adapters.
 */
export { SmartAccountClient, createPopupTransport } from './connector.js';
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
