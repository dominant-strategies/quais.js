/**
 * Portable wallet connector protocol. No signer, relay, UI or contract implementation dependencies.
 */
export const CONNECTOR_PROTOCOL = 'quai-wallet' as const;
export interface SendCalls {
    chainId: string;
    account: string;
    calls: { to: string; value: string; data: string }[];
    /**
     * Durable dApp-generated correlation ID. Persist it before opening the wallet.
     */
    requestId?: string;
}
export interface SignMessage {
    chainId: string;
    account: string;
    message: string;
}
export interface WalletSignature {
    signature: string;
}
export type DepositRouteId = 'ethereum-usdt' | 'base-quai';
export interface DepositQuote {
    chainId: string;
    account: string;
    routeId: DepositRouteId;
    sourceSender: string;
    amount: string;
}
export interface DepositTransfer {
    chainId: '9';
    account: string;
    routeId: DepositRouteId;
    sourceHash: string;
    /**
     * Durable dApp-generated correlation ID for recovery submissions.
     */
    requestId?: string;
}
export interface WalletDepositPlan {
    version: 1;
    routeId: DepositRouteId;
    sourceChainId: 1 | 8453;
    account: string;
    sourceSender: string;
    amount: string;
    fee: string;
    minimumOutput: string;
    expiresAt: number;
    quotedAt: number;
    refundAuthority: string;
    refundRecipient: string;
    transaction: { to: string; data: string; value: '0'; chainId: 1 | 8453 };
}
export interface WalletDepositStatus {
    routeId: DepositRouteId;
    sourceHash: string;
    account: string;
    state:
        | 'source-pending'
        | 'source-reverted'
        | 'source-confirming'
        | 'bridging'
        | 'delivered'
        | 'recoverable'
        | 'recovery-requested'
        | 'refunded';
    recoverAfter?: number;
    refundRecipient?: string;
    amount?: string;
    outputBalance: string;
    destinationHash?: string;
    receivedAmount?: string;
}
export interface WalletAccount {
    address: string;
    chainId: string;
}
export interface WalletCapabilities {
    protocolVersion: 1;
    chainId: string;
    accountProtocol: string;
    actions: string[];
    payment: {
        mode: 'sponsored' | 'user-paid' | 'mixed';
        quotes: boolean;
        guaranteed: false;
        userFeeWei?: string;
    };
    /**
     * The user lets this app's eligible swaps skip the wallet review, and their signer prompts outside the wallet
     * window. The app may leave the wallet in the background for swaps; the wallet still sends `attention` when a
     * request needs the user there.
     */
    backgroundSwaps?: boolean;
}
export interface WalletOperation {
    id: string;
    state: 'reserved' | 'signed' | 'submitted' | 'confirmed' | 'reverted' | 'uncertain';
    txHash?: string;
    safeTxHash?: string;
    requestId?: string;
}
export interface WalletFeeQuote {
    id: string;
    chainId: string;
    account: string;
    actionHash: string;
    payment: 'sponsored' | 'user-paid';
    userFeeWei: string;
    expiresAt: string;
}
export const methods = [
    'connect',
    'getAccount',
    'getCapabilities',
    'getFeeQuote',
    'sendCalls',
    'signMessage',
    'getDepositQuote',
    'getDepositStatus',
    'recoverDeposit',
    'getOperation',
    'getOperationByRequest',
    'disconnect',
] as const;
export type WalletMethod = (typeof methods)[number];
export interface ConnectorRequest {
    protocol: typeof CONNECTOR_PROTOCOL;
    version: 1;
    channel: string;
    id: string;
    method: WalletMethod;
    params: unknown;
}
const uint = (value: unknown): value is string =>
    typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 78 && BigInt(value) < 1n << 256n;
const addr = (value: unknown): value is string =>
    typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
export const isConnectorUuid = (value: unknown): value is string =>
    typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function object(value: unknown, keys: string[]): Record<string, unknown> {
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).length !== keys.length ||
        keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
    )
        throw new Error('Invalid request shape');
    return value as Record<string, unknown>;
}
export function parseCalls(value: unknown): SendCalls {
    const raw = value as Record<string, unknown> | null;
    const keys =
        raw?.requestId === undefined ? ['chainId', 'account', 'calls'] : ['chainId', 'account', 'calls', 'requestId'];
    const v = object(value, keys);
    if (
        !uint(v.chainId) ||
        v.chainId === '0' ||
        !addr(v.account) ||
        (v.requestId !== undefined && !isConnectorUuid(v.requestId)) ||
        !Array.isArray(v.calls) ||
        !v.calls.length ||
        v.calls.length > 16
    )
        throw new Error('Invalid calls');
    const calls = v.calls.map((item) => {
        const call = object(item, ['to', 'value', 'data']);
        if (
            !addr(call.to) ||
            !uint(call.value) ||
            typeof call.data !== 'string' ||
            call.data.length > 60002 ||
            !/^0x(?:[a-fA-F0-9]{2})*$/.test(call.data)
        )
            throw new Error('Invalid call');
        return { to: call.to, value: call.value, data: call.data };
    });
    return {
        chainId: v.chainId,
        account: v.account,
        calls,
        ...(v.requestId === undefined ? {} : { requestId: v.requestId as string }),
    };
}
export function parseSignMessage(value: unknown): SignMessage {
    const v = object(value, ['chainId', 'account', 'message']);
    if (
        !uint(v.chainId) ||
        v.chainId === '0' ||
        !addr(v.account) ||
        typeof v.message !== 'string' ||
        v.message.length < 1 ||
        v.message.length > 8192
    )
        throw new Error('Invalid message request');
    return { chainId: v.chainId, account: v.account, message: v.message };
}
export function parseDepositQuote(value: unknown): DepositQuote {
    const v = object(value, ['chainId', 'account', 'routeId', 'sourceSender', 'amount']);
    if (
        v.chainId !== '9' ||
        !addr(v.account) ||
        !['ethereum-usdt', 'base-quai'].includes(String(v.routeId)) ||
        !addr(v.sourceSender) ||
        !uint(v.amount) ||
        v.amount === '0'
    )
        throw new Error('Invalid deposit quote request');
    return v as unknown as DepositQuote;
}
export function parseDepositTransfer(value: unknown): DepositTransfer {
    const raw = value as Record<string, unknown> | null;
    const keys =
        raw?.requestId === undefined
            ? ['chainId', 'account', 'routeId', 'sourceHash']
            : ['chainId', 'account', 'routeId', 'sourceHash', 'requestId'];
    const v = object(value, keys);
    if (
        v.chainId !== '9' ||
        !addr(v.account) ||
        !['ethereum-usdt', 'base-quai'].includes(String(v.routeId)) ||
        typeof v.sourceHash !== 'string' ||
        !/^0x[0-9a-fA-F]{64}$/.test(v.sourceHash) ||
        (v.requestId !== undefined && !isConnectorUuid(v.requestId))
    )
        throw new Error('Invalid deposit transfer request');
    return v as unknown as DepositTransfer;
}
export function parseRequest(value: unknown): ConnectorRequest {
    const v = object(value, ['protocol', 'version', 'channel', 'id', 'method', 'params']);
    if (
        v.protocol !== CONNECTOR_PROTOCOL ||
        v.version !== 1 ||
        !isConnectorUuid(v.channel) ||
        !isConnectorUuid(v.id) ||
        !methods.includes(v.method as WalletMethod)
    )
        throw new Error('Invalid request');
    const method = v.method as WalletMethod;
    parseParams(method, v.params);
    return {
        protocol: CONNECTOR_PROTOCOL,
        version: 1,
        channel: v.channel,
        id: v.id,
        method,
        params: v.params,
    };
}
export function parseParams(method: WalletMethod, params: unknown): unknown {
    if (!methods.includes(method)) throw new Error('Unsupported method');
    if (method === 'sendCalls' || method === 'getFeeQuote') return parseCalls(params);
    if (method === 'signMessage') return parseSignMessage(params);
    if (method === 'getDepositQuote') return parseDepositQuote(params);
    if (method === 'getDepositStatus' || method === 'recoverDeposit') return parseDepositTransfer(params);
    if (method === 'getOperation') {
        const v = object(params, ['id']);
        if (typeof v.id !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(v.id)) throw new Error('Invalid operation ID');
        return { id: v.id };
    }
    if (method === 'getOperationByRequest') {
        const v = object(params, ['requestId']);
        if (!isConnectorUuid(v.requestId)) throw new Error('Invalid request ID');
        return { requestId: v.requestId };
    }
    return object(params, []);
}
export class WalletConnectorError extends Error {
    constructor(
        readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'WalletConnectorError';
    }
}
/**
 * The signer declined before producing a signature: EIP-1193 4001, including ethers' ACTION_REJECTED and provider
 * errors wrapped in another error.
 */
export function isUserRejection(error: unknown): boolean {
    const queue: unknown[] = [error];
    for (let i = 0; i < queue.length && i < 16; i++) {
        const value = queue[i];
        if (!value || typeof value !== 'object') continue;
        const v = value as Record<string, unknown>;
        if (v.code === 4001 || v.code === 'ACTION_REJECTED') return true;
        for (const key of ['cause', 'error', 'info']) if (v[key] && typeof v[key] === 'object') queue.push(v[key]);
    }
    return false;
}
export function trustedOrigin(value: string): string {
    const url = new URL(value);
    if (
        url.origin !== value ||
        url.username ||
        url.password ||
        (url.protocol !== 'https:' &&
            !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    )
        throw new WalletConnectorError('INVALID_ORIGIN', 'Use an exact HTTPS origin, or localhost for development.');
    return url.origin;
}
export function boundedMessage(value: unknown): boolean {
    try {
        const encoded = JSON.stringify(value);
        return !!encoded && encoded.length <= 131072;
    } catch {
        return false;
    }
}

/**
 * Validate a wallet response before exposing it to the integrating application.
 */
export function parseResult(method: WalletMethod, result: unknown): unknown {
    if (method === 'disconnect') {
        if (result !== null && result !== undefined) throw new Error('Invalid disconnect result');
        return;
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid wallet result');
    const v = result as Record<string, unknown>;
    if (method === 'connect' || method === 'getAccount') {
        if (!addr(v.address) || !uint(v.chainId) || v.chainId === '0') throw new Error('Invalid account result');
        return { address: v.address, chainId: v.chainId };
    }
    if (
        method === 'sendCalls' ||
        method === 'recoverDeposit' ||
        method === 'getOperation' ||
        method === 'getOperationByRequest'
    ) {
        if (
            typeof v.id !== 'string' ||
            !/^0x[0-9a-f]{64}$/i.test(v.id) ||
            typeof v.state !== 'string' ||
            !['reserved', 'signed', 'submitted', 'confirmed', 'reverted', 'uncertain'].includes(v.state) ||
            (v.txHash !== undefined && (typeof v.txHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(v.txHash))) ||
            (v.safeTxHash !== undefined &&
                (typeof v.safeTxHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(v.safeTxHash))) ||
            (v.requestId !== undefined && !isConnectorUuid(v.requestId))
        )
            throw new Error('Invalid operation result');
        return {
            id: v.id,
            state: v.state,
            ...(v.txHash ? { txHash: v.txHash } : {}),
            ...(v.safeTxHash ? { safeTxHash: v.safeTxHash } : {}),
            ...(v.requestId ? { requestId: v.requestId } : {}),
        };
    }
    if (method === 'signMessage') {
        if (typeof v.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(v.signature))
            throw new Error('Invalid account signature');
        return { signature: v.signature };
    }
    if (method === 'getDepositQuote') {
        const transaction = v.transaction as Record<string, unknown> | undefined;
        if (
            v.version !== 1 ||
            !['ethereum-usdt', 'base-quai'].includes(String(v.routeId)) ||
            ![1, 8453].includes(Number(v.sourceChainId)) ||
            !addr(v.account) ||
            !addr(v.sourceSender) ||
            !uint(v.amount) ||
            !uint(v.fee) ||
            !uint(v.minimumOutput) ||
            typeof v.expiresAt !== 'number' ||
            !Number.isSafeInteger(v.expiresAt) ||
            typeof v.quotedAt !== 'number' ||
            !Number.isSafeInteger(v.quotedAt) ||
            !addr(v.refundAuthority) ||
            !addr(v.refundRecipient) ||
            !transaction ||
            !addr(transaction.to) ||
            typeof transaction.data !== 'string' ||
            !/^0x(?:[0-9a-fA-F]{2})*$/.test(transaction.data) ||
            transaction.value !== '0' ||
            ![1, 8453].includes(Number(transaction.chainId))
        )
            throw new Error('Invalid deposit plan');
    }
    if (method === 'getDepositStatus') {
        if (
            !['ethereum-usdt', 'base-quai'].includes(String(v.routeId)) ||
            typeof v.sourceHash !== 'string' ||
            !/^0x[0-9a-fA-F]{64}$/.test(v.sourceHash) ||
            !addr(v.account) ||
            ![
                'source-pending',
                'source-reverted',
                'source-confirming',
                'bridging',
                'delivered',
                'recoverable',
                'recovery-requested',
                'refunded',
            ].includes(String(v.state)) ||
            !uint(v.outputBalance) ||
            (v.recoverAfter !== undefined &&
                (typeof v.recoverAfter !== 'number' || !Number.isSafeInteger(v.recoverAfter))) ||
            (v.refundRecipient !== undefined && !addr(v.refundRecipient)) ||
            (v.amount !== undefined && !uint(v.amount)) ||
            (v.destinationHash !== undefined &&
                (typeof v.destinationHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(v.destinationHash))) ||
            (v.receivedAmount !== undefined && !uint(v.receivedAmount))
        )
            throw new Error('Invalid deposit status');
    }
    if (method === 'getCapabilities') {
        const p = v.payment as Record<string, unknown> | undefined;
        if (
            v.protocolVersion !== 1 ||
            !uint(v.chainId) ||
            v.chainId === '0' ||
            typeof v.accountProtocol !== 'string' ||
            !Array.isArray(v.actions) ||
            !v.actions.every((a) => typeof a === 'string') ||
            !p ||
            typeof p.mode !== 'string' ||
            !['sponsored', 'user-paid', 'mixed'].includes(p.mode) ||
            typeof p.quotes !== 'boolean' ||
            p.guaranteed !== false ||
            (p.userFeeWei !== undefined && !uint(p.userFeeWei)) ||
            (v.backgroundSwaps !== undefined && typeof v.backgroundSwaps !== 'boolean')
        )
            throw new Error('Invalid capabilities');
    } else if (method === 'getFeeQuote') {
        if (
            typeof v.id !== 'string' ||
            !uint(v.chainId) ||
            v.chainId === '0' ||
            !addr(v.account) ||
            typeof v.actionHash !== 'string' ||
            !/^0x[0-9a-f]{64}$/i.test(v.actionHash) ||
            typeof v.payment !== 'string' ||
            !['sponsored', 'user-paid'].includes(v.payment) ||
            !uint(v.userFeeWei) ||
            typeof v.expiresAt !== 'string' ||
            !Number.isFinite(Date.parse(v.expiresAt))
        )
            throw new Error('Invalid fee quote');
    }
    return result;
}

// Structural browser boundary keeps DOM declarations out of Node and React Native consumers.
export interface MessagePeer {
    postMessage(message: unknown, targetOrigin: string): void;
}
export interface WalletPopup extends MessagePeer {
    readonly closed: boolean;
    opener: unknown;
    location: { replace(url: string): void };
    focus(): void;
    close(): void;
}
export interface ConnectorMessageEvent {
    origin: string;
    source: unknown;
    data: any;
}
export interface ConnectorBrowser {
    window: {
        open(url: URL, target: string, features: string): WalletPopup | null;
    };
    location: { origin: string };
    crypto: { randomUUID(): string };
    addEventListener(type: 'message', listener: (event: ConnectorMessageEvent) => void): void;
    removeEventListener(type: 'message', listener: (event: ConnectorMessageEvent) => void): void;
}
export function connectorBrowser(): ConnectorBrowser {
    return globalThis as unknown as ConnectorBrowser;
}
