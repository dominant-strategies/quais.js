import {
    CONNECTOR_PROTOCOL,
    WalletConnectorError,
    connectorBrowser,
    type MessagePeer,
    type ConnectorMessageEvent,
    boundedMessage,
    isConnectorUuid,
    isUserRejection,
    parseParams,
    parseRequest,
    trustedOrigin,
    type ConnectorRequest,
} from './connector-protocol.js';
export interface HostContext {
    origin: string;
    signal: AbortSignal;
    /**
     * Ask the app to bring the wallet window forward because this request needs the user here. Browsers only let the
     * app raise a window shortly after a click.
     */
    attention(): void;
}
/**
 * No signer/relay knowledge here. The handler MUST enforce connection consent and action review.
 */
export function serveWalletRequests(options: {
    origin: string;
    source?: MessagePeer;
    channel: string;
    handle(request: ConnectorRequest, context: HostContext): Promise<unknown>;
}) {
    const browser = connectorBrowser();
    const origin = trustedOrigin(options.origin);
    if (!isConnectorUuid(options.channel)) throw new Error('Invalid channel');
    const seen = new Set<string>();
    let source = options.source;
    let active: { id: string; abort: AbortController } | undefined,
        disposed = false;
    const reply = (id: string, result?: unknown, error?: { code: string; message: string }) => {
        if (disposed || !source) return;
        const envelope = {
            protocol: CONNECTOR_PROTOCOL,
            version: 1,
            channel: options.channel,
            type: 'response',
            id,
        };
        const response = { ...envelope, ...(error ? { error } : { result }) };
        const fallback = {
            ...envelope,
            error: {
                code: 'INVALID_RESPONSE',
                message: 'The wallet could not return this response. Check wallet activity before retrying.',
            },
        };
        // Match the client's inbound bound, including envelope and error fields.
        // An action may already have executed; never imply that retrying is safe.
        try {
            source.postMessage(boundedMessage(response) ? response : fallback, origin);
        } catch {
            // JSON-compatible size does not guarantee structured-clone compatibility.
            // For example, function-valued fields are omitted by JSON.stringify.
            try {
                source.postMessage(fallback, origin);
            } catch {
                /* Peer closed. */
            }
        }
    };
    const receive = (event: ConnectorMessageEvent) => {
        if (event.origin !== origin || !boundedMessage(event.data)) return;
        const value = event.data;
        if (value?.protocol !== CONNECTOR_PROTOCOL || value.version !== 1 || value.channel !== options.channel) return;
        if (!source) {
            if (
                value.type !== 'hello' ||
                !event.source ||
                typeof (event.source as MessagePeer).postMessage !== 'function'
            )
                return;
            source = event.source as MessagePeer;
        }
        if (event.source !== source) return;
        if (value.type === 'hello') {
            source.postMessage(
                {
                    protocol: CONNECTOR_PROTOCOL,
                    version: 1,
                    channel: options.channel,
                    type: 'ready',
                },
                origin,
            );
            return;
        }
        if (value.type === 'cancel') {
            if (active && active.id === value.id) active.abort.abort();
            return;
        }
        let request: ConnectorRequest;
        try {
            request = parseRequest(value);
        } catch {
            return;
        }
        if (active?.id === request.id) return;
        if (seen.has(request.id)) {
            reply(request.id, undefined, {
                code: 'DUPLICATE_REQUEST',
                message: 'Request already handled. Check operation status.',
            });
            return;
        }
        if (seen.size >= 1000) {
            reply(request.id, undefined, {
                code: 'RECONNECT',
                message: 'Reconnect the wallet.',
            });
            return;
        }
        seen.add(request.id);
        if (active) {
            reply(request.id, undefined, {
                code: 'BUSY',
                message: 'Another wallet request is pending.',
            });
            return;
        }
        try {
            parseParams(request.method, request.params);
        } catch {
            reply(request.id, undefined, {
                code: 'INVALID_REQUEST',
                message: 'Invalid wallet request.',
            });
            return;
        }
        const abort = new AbortController();
        active = { id: request.id, abort };
        const attention = () => {
            if (disposed || !source || abort.signal.aborted || active?.id !== request.id) return;
            try {
                source.postMessage(
                    {
                        protocol: CONNECTOR_PROTOCOL,
                        version: 1,
                        channel: options.channel,
                        type: 'attention',
                        id: request.id,
                    },
                    origin,
                );
            } catch {
                /* Peer closed. */
            }
        };
        void options
            .handle(request, { origin, signal: abort.signal, attention })
            .then((result) => {
                if (!abort.signal.aborted) reply(request.id, result);
            })
            .catch((error: unknown) => {
                if (abort.signal.aborted) return;
                // A declined signer prompt produced no signature, so nothing can be submitted.
                const declined = !(error instanceof WalletConnectorError) && isUserRejection(error);
                reply(request.id, undefined, {
                    code:
                        error instanceof WalletConnectorError
                            ? error.code
                            : declined
                              ? 'USER_REJECTED'
                              : 'REQUEST_FAILED',
                    // Never pass provider errors, signatures or relay responses across origins.
                    message:
                        error instanceof WalletConnectorError
                            ? error.message
                            : declined
                              ? 'User declined the request.'
                              : 'The wallet could not complete this request. Check the wallet for details.',
                });
            })
            .finally(() => {
                active = undefined;
            });
    };
    browser.addEventListener('message', receive);
    return () => {
        disposed = true;
        active?.abort.abort();
        browser.removeEventListener('message', receive);
    };
}
