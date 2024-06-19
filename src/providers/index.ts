/**
 * A **Provider** provides a connection to the blockchain, whch can be used to query its current state, simulate
 * execution and send transactions to update the state.
 *
 * It is one of the most fundamental components of interacting with a blockchain application, and there are many ways to
 * connect, such as over HTTP, WebSockets or injected providers such as [MetaMask](https://metamask.io/).
 */

export { AbstractProvider, UnmanagedSubscriber } from './abstract-provider.js';

export { Network } from './network.js';

export { JsonRpcApiProvider, JsonRpcProvider, JsonRpcSigner } from './provider-jsonrpc.js';

export { BrowserProvider } from './provider-browser.js';

export { SocketProvider } from './provider-socket.js';
export { WebSocketProvider } from './provider-websocket.js';

export { Block, FeeData, Log, TransactionReceipt, TransactionResponse, copyRequest } from './provider.js';

export {
    SocketSubscriber,
    SocketBlockSubscriber,
    SocketPendingSubscriber,
    SocketEventSubscriber,
} from './provider-socket.js';

export type {
    Subscription,
    Subscriber,
    PerformActionFilter,
    PerformActionTransaction,
    PerformActionRequest,
} from './abstract-provider.js';

export type { BlockParams, LogParams, TransactionReceiptParams, TransactionResponseParams } from './formatting.js';

export type { Networkish } from './network.js';

export type {
    BlockTag,
    TransactionRequest,
    PreparedTransactionRequest,
    EventFilter,
    Filter,
    FilterByBlockHash,
    OrphanFilter,
    ProviderEvent,
    TopicFilter,
    Provider,
    MinedBlock,
    MinedTransactionResponse,
    QiTransactionRequest,
    QiTransactionResponse,
    QuaiTransactionRequest,
    QuaiTransactionResponse,
    QiPreparedTransactionRequest,
    QuaiPreparedTransactionRequest,
} from './provider.js';

export type { DebugEventBrowserProvider, Eip1193Provider } from './provider-browser.js';

export type {
    JsonRpcPayload,
    JsonRpcResult,
    JsonRpcError,
    JsonRpcApiProviderOptions,
    JsonRpcTransactionRequest,
    QuaiJsonRpcTransactionRequest,
    QiJsonRpcTransactionRequest,
} from './provider-jsonrpc.js';

export type { WebSocketCreator, WebSocketLike } from './provider-websocket.js';
