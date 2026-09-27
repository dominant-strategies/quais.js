import {
    CONNECTOR_PROTOCOL,
    WalletConnectorError,
    connectorBrowser,
    methods,
    type WalletPopup,
    type ConnectorMessageEvent,
    boundedMessage,
    parseParams,
    parseResult,
    trustedOrigin,
    type WalletMethod,
    type SendCalls,
    type SignMessage,
    type DepositQuote,
    type DepositTransfer,
    type WalletAccount,
    type WalletCapabilities,
    type WalletOperation,
    type WalletFeeQuote,
    type WalletSignature,
    type WalletDepositPlan,
    type WalletDepositStatus,
} from './connector-protocol.js';
export * from './connector-protocol.js';

/**
 * Framework-, signer-, factory- and relay-independent request boundary.
 */
export interface WalletTransport {
    /**
     * Open or focus the trusted wallet while the browser still recognizes a user gesture.
     */
    prepare?(options?: { focus?: boolean }): void;
    request(method: WalletMethod, params: unknown, signal?: AbortSignal): Promise<unknown>;
    destroy(): void;
}
export class SmartAccountClient {
    private tail: Promise<void> = Promise.resolve();
    private queued = 0;
    private disposed = false;
    constructor(readonly transport: WalletTransport) {}
    /**
     * Includes the active request and requests waiting behind it.
     */
    get pendingRequests() {
        return this.queued;
    }
    /**
     * Prepare the approval window synchronously before a dApp awaits RPC preflight.
     */
    prepare(options?: { focus?: boolean }) {
        if (this.disposed) throw new WalletConnectorError('DISCONNECTED', 'Connector disposed');
        this.transport.prepare?.(options);
    }
    private request<T>(method: WalletMethod, params: unknown, signal?: AbortSignal): Promise<T> {
        if (this.disposed) return Promise.reject(new WalletConnectorError('DISCONNECTED', 'Connector disposed'));
        this.queued += 1;
        const run = this.tail.then(async () => {
            if (this.disposed) throw new WalletConnectorError('DISCONNECTED', 'Connector disposed');
            if (signal?.aborted) throw new WalletConnectorError('CANCELLED', 'Request cancelled');
            return this.transport.request(method, params, signal) as Promise<T>;
        });
        this.tail = run.then(
            () => undefined,
            () => undefined,
        );
        return run.finally(() => {
            this.queued -= 1;
        });
    }
    connect(signal?: AbortSignal) {
        return this.request<WalletAccount>('connect', {}, signal);
    }
    getAccount(signal?: AbortSignal) {
        return this.request<WalletAccount>('getAccount', {}, signal);
    }
    getCapabilities(signal?: AbortSignal) {
        return this.request<WalletCapabilities>('getCapabilities', {}, signal);
    }
    getFeeQuote(request: SendCalls, signal?: AbortSignal) {
        return this.request<WalletFeeQuote>('getFeeQuote', request, signal);
    }
    sendCalls(request: SendCalls, signal?: AbortSignal) {
        return this.request<WalletOperation>('sendCalls', request, signal);
    }
    signMessage(request: SignMessage, signal?: AbortSignal) {
        return this.request<WalletSignature>('signMessage', request, signal);
    }
    getDepositQuote(request: DepositQuote, signal?: AbortSignal) {
        return this.request<WalletDepositPlan>('getDepositQuote', request, signal);
    }
    getDepositStatus(request: DepositTransfer, signal?: AbortSignal) {
        return this.request<WalletDepositStatus>('getDepositStatus', request, signal);
    }
    recoverDeposit(request: DepositTransfer, signal?: AbortSignal) {
        return this.request<WalletOperation>('recoverDeposit', request, signal);
    }
    getOperation(id: string, signal?: AbortSignal) {
        return this.request<WalletOperation>('getOperation', { id }, signal);
    }
    getOperationByRequest(requestId: string, signal?: AbortSignal) {
        return this.request<WalletOperation>('getOperationByRequest', { requestId }, signal);
    }
    disconnect(signal?: AbortSignal) {
        return this.request<void>('disconnect', {}, signal);
    }
    destroy() {
        this.disposed = true;
        this.transport.destroy();
    }
}

/**
 * Open requests from a user gesture. Never retries a transaction request automatically.
 */
export function createPopupTransport(options: {
    walletUrl: string;
    timeoutMs?: number;
    /**
     * Keep an existing wallet window in the background for these methods. This changes window focus only; the wallet
     * host still validates and approves every request.
     */
    backgroundMethods?: readonly WalletMethod[];
    /**
     * Called with true when the wallet asks for the user during a pending request, and with false when that request
     * settles. The transport tries to focus the wallet, but browsers only allow that shortly after a click, so also
     * offer a control whose click handler calls `prepare()`.
     */
    onAttention?(waiting: boolean): void;
}): WalletTransport {
    const browser = connectorBrowser();
    const url = new URL(options.walletUrl);
    const origin = trustedOrigin(url.origin);
    if (url.username || url.password || url.search || url.hash)
        throw new Error('Wallet URL must not contain credentials, query or fragment.');
    const timeout = options.timeoutMs ?? 180000;
    if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 600000) throw new Error('Invalid wallet timeout');
    const backgroundMethods = new Set(options.backgroundMethods ?? []);
    for (const method of backgroundMethods) {
        if (!methods.includes(method)) throw new Error('Invalid background wallet method');
    }
    let popup: WalletPopup | null = null,
        channel = browser.crypto.randomUUID(),
        disposed = false;
    let pending: { id: string; fail(error: Error): void } | undefined;
    const openPopup = (): WalletPopup => {
        if (disposed) throw new WalletConnectorError('DISCONNECTED', 'Connector disposed');
        if (!popup || popup.closed) {
            channel = browser.crypto.randomUUID();
            const destination = new URL(url.toString());
            // Fragment metadata is not sent to the hosting server or HTTP referrers.
            destination.hash = new URLSearchParams({
                walletConnector: '1',
                origin: trustedOrigin(browser.location.origin),
                channel,
            }).toString();
            const opened = browser.window.open(new URL('about:blank'), '_blank', 'popup,width=460,height=780');
            if (opened) {
                try {
                    // Clear the opener while the blank popup is still same-origin.
                    opened.opener = null;
                    opened.location.replace(destination.toString());
                    popup = opened;
                } catch {
                    opened.close();
                    throw new WalletConnectorError('POPUP_BLOCKED', 'Could not open the wallet popup.');
                }
            }
        }
        if (!popup) throw new WalletConnectorError('POPUP_BLOCKED', 'Allow the wallet popup and try again.');
        return popup;
    };
    return {
        prepare(prepareOptions) {
            const peer = openPopup();
            if (prepareOptions?.focus !== false) peer.focus();
        },
        request(method, params, signal) {
            if (disposed) return Promise.reject(new WalletConnectorError('DISCONNECTED', 'Connector disposed'));
            if (pending) return Promise.reject(new WalletConnectorError('BUSY', 'A wallet request is already pending'));
            if (signal?.aborted) return Promise.reject(new WalletConnectorError('CANCELLED', 'Request cancelled'));
            try {
                parseParams(method, params);
            } catch {
                return Promise.reject(new WalletConnectorError('INVALID_REQUEST', 'Invalid wallet request'));
            }
            let peer: WalletPopup;
            try {
                peer = openPopup();
            } catch (error) {
                return Promise.reject(error);
            }
            const id = browser.crypto.randomUUID();
            const request = {
                protocol: CONNECTOR_PROTOCOL,
                version: 1,
                channel,
                id,
                method,
                params,
            };
            // Snapshot payload before asynchronous handshaking.
            const payload = JSON.parse(JSON.stringify(request));
            if (!boundedMessage(payload))
                return Promise.reject(new WalletConnectorError('INVALID_REQUEST', 'Request too large'));
            if (
                ['connect', 'sendCalls', 'signMessage', 'recoverDeposit', 'disconnect'].includes(method) &&
                !backgroundMethods.has(method)
            ) {
                peer.focus();
            }
            return new Promise((resolve, reject) => {
                let sent = false,
                    waiting = false;
                const notify = (value: boolean) => {
                    waiting = value;
                    try {
                        options.onAttention?.(value);
                    } catch {
                        /* An app callback must not break the request. */
                    }
                };
                const finish = (error?: Error, result?: unknown) => {
                    clearInterval(poll);
                    clearTimeout(timer);
                    browser.removeEventListener('message', receive);
                    signal?.removeEventListener('abort', abort);
                    pending = undefined;
                    if (waiting) notify(false);
                    if (error) reject(error);
                    else resolve(result);
                };
                const cancel = () => {
                    if (sent && !peer.closed)
                        peer.postMessage(
                            {
                                protocol: CONNECTOR_PROTOCOL,
                                version: 1,
                                channel,
                                id,
                                type: 'cancel',
                            },
                            origin,
                        );
                };
                const abort = () => {
                    cancel();
                    finish(
                        new WalletConnectorError(
                            'CANCELLED',
                            'Request cancelled. If approval began, check wallet activity before retrying.',
                        ),
                    );
                };
                const receive = (event: ConnectorMessageEvent) => {
                    if (event.source !== peer || event.origin !== origin || !boundedMessage(event.data)) return;
                    const data = event.data;
                    if (data?.protocol !== CONNECTOR_PROTOCOL || data.version !== 1 || data.channel !== channel) return;
                    if (data.type === 'ready' && !sent) {
                        sent = true;
                        peer.postMessage(payload, origin);
                        return;
                    }
                    if (data.type === 'attention' && data.id === id) {
                        if (waiting) return;
                        try {
                            peer.focus();
                        } catch {
                            /* The app's fallback control can still focus it. */
                        }
                        notify(true);
                        return;
                    }
                    if (data.type !== 'response' || data.id !== id) return;
                    if (data.error) {
                        if (data.error.code === 'RECONNECT' && popup === peer) {
                            popup = null;
                            peer.close();
                        }
                        finish(new WalletConnectorError(String(data.error.code), String(data.error.message)));
                    } else {
                        try {
                            finish(undefined, parseResult(method, data.result));
                        } catch {
                            finish(
                                new WalletConnectorError(
                                    'INVALID_RESPONSE',
                                    'Invalid wallet response. Check wallet activity before retrying.',
                                ),
                            );
                        }
                    }
                };
                const poll = setInterval(() => {
                    if (peer.closed) {
                        finish(
                            new WalletConnectorError(
                                'WALLET_CLOSED',
                                'Wallet closed. Check activity before resubmitting an approved action.',
                            ),
                        );
                        return;
                    }
                    if (!sent)
                        peer.postMessage(
                            {
                                protocol: CONNECTOR_PROTOCOL,
                                version: 1,
                                channel,
                                type: 'hello',
                            },
                            origin,
                        );
                }, 250);
                const timer = setTimeout(() => {
                    cancel();
                    finish(
                        new WalletConnectorError(
                            'TIMEOUT',
                            'Wallet request timed out. Check activity before resubmitting an approved action.',
                        ),
                    );
                }, timeout);
                pending = {
                    id,
                    fail: (error) => {
                        cancel();
                        finish(error);
                    },
                };
                browser.addEventListener('message', receive);
                signal?.addEventListener('abort', abort, { once: true });
            });
        },
        destroy() {
            disposed = true;
            pending?.fail(
                new WalletConnectorError('DISCONNECTED', 'Connector disposed. Submitted operations remain on-chain.'),
            );
            popup?.close();
            popup = null;
        },
    };
}
