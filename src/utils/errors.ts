/**
 * All errors in quais include properties to ensure they are both human-readable (i.e. `.message`) and machine-readable
 * (i.e. `.code`).
 *
 * The {@link isError | **isError**} function can be used to check the error `code` and provide a type guard for the
 * properties present on that error interface.
 */

import { version } from '../_version.js';

import { defineProperties } from './properties.js';

import type { TransactionRequest, TransactionReceipt, TransactionResponse } from '../providers/index.js';

import type { FetchRequest, FetchResponse } from './fetch.js';
import { ExternalTransactionResponse } from '../providers/provider.js';

/**
 * An error may contain additional properties, but those must not conflict with any implicit properties.
 *
 * @category Utils
 */
export type ErrorInfo<T> = Omit<T, 'code' | 'name' | 'message' | 'shortMessage'> & { shortMessage?: string };

function stringify(value: any): any {
    if (value == null) {
        return 'null';
    }

    if (Array.isArray(value)) {
        return '[ ' + value.map(stringify).join(', ') + ' ]';
    }

    if (value instanceof Uint8Array) {
        const HEX = '0123456789abcdef';
        let result = '0x';
        for (let i = 0; i < value.length; i++) {
            result += HEX[value[i] >> 4];
            result += HEX[value[i] & 0xf];
        }
        return result;
    }

    if (typeof value === 'object' && typeof value.toJSON === 'function') {
        return stringify(value.toJSON());
    }

    switch (typeof value) {
        case 'boolean':
        case 'symbol':
            return value.toString();
        case 'bigint':
            return BigInt(value).toString();
        case 'number':
            return value.toString();
        case 'string':
            return JSON.stringify(value);
        case 'object': {
            const keys = Object.keys(value);
            keys.sort();
            return '{ ' + keys.map((k) => `${stringify(k)}: ${stringify(value[k])}`).join(', ') + ' }';
        }
    }

    return `[ COULD NOT SERIALIZE ]`;
}

/**
 * All errors emitted by quais have an **ErrorCode** to help identify and coalesce errors to simplify programmatic
 * analysis.
 *
 * Each **ErrorCode** is the `code` proerty of a coresponding {@link quaisError | **quaisError**}.
 *
 * **Generic Errors**
 *
 * **`"UNKNOWN_ERROR"`** - see {@link UnknownError | **UnknownError**}
 *
 * **`"NOT_IMPLEMENTED"`** - see {@link NotImplementedError | **NotImplementedError**}
 *
 * **`"UNSUPPORTED_OPERATION"`** - see {@link UnsupportedOperationError | **UnsupportedOperationError**}
 *
 * **`"NETWORK_ERROR"`** - see {@link NetworkError | **NetworkError**}
 *
 * **`"SERVER_ERROR"`** - see {@link ServerError | **ServerError**}
 *
 * **`"TIMEOUT"`** - see {@link TimeoutError | **TimeoutError**}
 *
 * **`"BAD_DATA"`** - see {@link BadDataError | **BadDataError**}
 *
 * **`"CANCELLED"`** - see {@link CancelledError | **CancelledError**}
 *
 * **Operational Errors**
 *
 * **`"BUFFER_OVERRUN"`** - see {@link BufferOverrunError | **BufferOverrunError**}
 *
 * **`"NUMERIC_FAULT"`** - see {@link NumericFaultError | **NumericFaultError**}
 *
 * **Argument Errors**
 *
 * **`"INVALID_ARGUMENT"`** - see {@link InvalidArgumentError | **InvalidArgumentError**}
 *
 * **`"MISSING_ARGUMENT"`** - see {@link MissingArgumentError | **MissingArgumentError**}
 *
 * **`"UNEXPECTED_ARGUMENT"`** - see {@link UnexpectedArgumentError | **UnexpectedArgumentError**}
 *
 * **Blockchain Errors**
 *
 * **`"CALL_EXCEPTION"`** - see {@link CallExceptionError | **CallExceptionError**}
 *
 * **`"INSUFFICIENT_FUNDS"`** - see {@link InsufficientFundsError | **InsufficientFundsError**}
 *
 * **`"NONCE_EXPIRED"`** - see{@link NonceExpiredError | **NonceExpiredError**}
 *
 * **`"REPLACEMENT_UNDERPRICED"`** - see {@link ReplacementUnderpricedError | **ReplacementUnderpricedError**}
 *
 * **`"TRANSACTION_REPLACED"`** - see {@link TransactionReplacedError | **TransactionReplacedError**}
 *
 * **User Interaction Errors**
 *
 * **`"ACTION_REJECTED"`** - see {@link ActionRejectedError | **ActionRejectedError**}
 */
export type ErrorCode =
    // Generic Errors
    | 'UNKNOWN_ERROR'
    | 'NOT_IMPLEMENTED'
    | 'UNSUPPORTED_OPERATION'
    | 'NETWORK_ERROR'
    | 'SERVER_ERROR'
    | 'TIMEOUT'
    | 'BAD_DATA'
    | 'CANCELLED'

    // Operational Errors
    | 'BUFFER_OVERRUN'
    | 'NUMERIC_FAULT'

    // Argument Errors
    | 'INVALID_ARGUMENT'
    | 'MISSING_ARGUMENT'
    | 'UNEXPECTED_ARGUMENT'
    | 'VALUE_MISMATCH'

    // Blockchain Errors
    | 'CALL_EXCEPTION'
    | 'INSUFFICIENT_FUNDS'
    | 'NONCE_EXPIRED'
    | 'REPLACEMENT_UNDERPRICED'
    | 'TRANSACTION_REPLACED'
    | 'UNCONFIGURED_NAME'
    | 'OFFCHAIN_FAULT'
    | 'TRANSACTION_NOT_FOUND'
    | 'TRANSACTION_ALREADY_KNOWN'

    // User Interaction
    | 'ACTION_REJECTED'

    // Provider Errors
    | 'PROVIDER_FAILED_TO_INITIALIZE';

/**
 * All errors in quais include properties to assist in machine-readable errors.
 *
 * @category Utils
 */
// TODO:
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface quaisError<T extends ErrorCode = ErrorCode> extends Error {
    /**
     * The string error code.
     */
    code: ErrorCode;

    /**
     * A short message describing the error, with minimal additional details.
     */
    shortMessage: string;

    /**
     * Additional info regarding the error that may be useful.
     *
     * This is generally helpful mostly for human-based debugging.
     */
    info?: Record<string, any>;

    /**
     * Any related error.
     */
    error?: Error;
}

// Generic Errors

/**
 * This Error is a catch-all for when there is no way for quais to know what the underlying problem is.
 *
 * @category Utils
 */
export interface UnknownError extends quaisError<'UNKNOWN_ERROR'> {
    [key: string]: any;
}

/**
 * This Error is mostly used as a stub for functionality that is intended for the future, but is currently not
 * implemented.
 *
 * @category Utils
 */
export interface NotImplementedError extends quaisError<'NOT_IMPLEMENTED'> {
    /**
     * The attempted operation.
     */
    operation: string;
}

/**
 * This Error indicates that the attempted operation is not supported.
 *
 * This could range from a specific JSON-RPC end-point not supporting a feature to a specific configuration of an object
 * prohibiting the operation.
 *
 * For example, a [Wallet](../classes/Wallet) with no connected [Provider](../interfaces/Provider) is unable to send a
 * transaction.
 *
 * @category Utils
 */
export interface UnsupportedOperationError extends quaisError<'UNSUPPORTED_OPERATION'> {
    /**
     * The attempted operation.
     */
    operation: string;
}

/**
 * This Error indicates a problem connecting to a network.
 *
 * @category Utils
 */
export interface NetworkError extends quaisError<'NETWORK_ERROR'> {
    /**
     * The network event.
     */
    event: string;
}

/**
 * This Error indicates there was a problem fetching a resource from a server.
 *
 * @category Utils
 */
export interface ServerError extends quaisError<'SERVER_ERROR'> {
    /**
     * The requested resource.
     */
    request: FetchRequest | string;

    /**
     * The response received from the server, if available.
     */
    response?: FetchResponse;
}

/**
 * This Error indicates that the timeout duration has expired and that the operation has been implicitly cancelled.
 *
 * The side-effect of the operation may still occur, as this generally means a request has been sent and there has
 * simply been no response to indicate whether it was processed or not.
 *
 * @category Utils
 */
export interface TimeoutError extends quaisError<'TIMEOUT'> {
    /**
     * The attempted operation.
     */
    operation: string;

    /**
     * The reason.
     */
    reason: string;

    /**
     * The resource request, if available.
     */
    request?: FetchRequest;
}

/**
 * This Error indicates that a provided set of data cannot be correctly interpreted.
 *
 * @category Utils
 */
export interface BadDataError extends quaisError<'BAD_DATA'> {
    /**
     * The data.
     */
    value: any;
}

/**
 * This Error indicates that the operation was cancelled by a programmatic call, for example to `cancel()`.
 *
 * @category Utils
 */
export interface CancelledError extends quaisError<'CANCELLED'> {}

// Operational Errors

/**
 * This Error indicates an attempt was made to read outside the bounds of protected data.
 *
 * Most operations in quais are protected by bounds checks, to mitigate exploits when parsing data.
 *
 * @category Utils
 */
export interface BufferOverrunError extends quaisError<'BUFFER_OVERRUN'> {
    /**
     * The buffer that was overrun.
     */
    buffer: Uint8Array;

    /**
     * The length of the buffer.
     */
    length: number;

    /**
     * The offset that was requested.
     */
    offset: number;
}

/**
 * This Error indicates an operation which would result in incorrect arithmetic output has occurred.
 *
 * For example, trying to divide by zero or using a `uint8` to store a negative value.
 *
 * @category Utils
 */
export interface NumericFaultError extends quaisError<'NUMERIC_FAULT'> {
    /**
     * The attempted operation.
     */
    operation: string;

    /**
     * The fault reported.
     */
    fault: string;

    /**
     * The value the operation was attempted against.
     */
    value: any;
}

// Argument Errors

/**
 * This Error indicates an incorrect type or value was passed to a function or method.
 *
 * @category Utils
 */
export interface InvalidArgumentError extends quaisError<'INVALID_ARGUMENT'> {
    /**
     * The name of the argument.
     */
    argument: string;

    /**
     * The value that was provided.
     */
    value: any;

    info?: Record<string, any>;
}

/**
 * This Error indicates there were too few arguments were provided.
 *
 * @category Utils
 */
export interface MissingArgumentError extends quaisError<'MISSING_ARGUMENT'> {
    /**
     * The number of arguments received.
     */
    count: number;

    /**
     * The number of arguments expected.
     */
    expectedCount: number;
}

/**
 * This Error indicates too many arguments were provided.
 *
 * @category Utils
 */
export interface UnexpectedArgumentError extends quaisError<'UNEXPECTED_ARGUMENT'> {
    /**
     * The number of arguments received.
     */
    count: number;

    /**
     * The number of arguments expected.
     */
    expectedCount: number;
}

// Blockchain Errors

/**
 * The action that resulted in the call exception.
 *
 * @category Utils
 */
export type CallExceptionAction = 'call' | 'estimateGas' | 'getTransactionResult' | 'sendTransaction' | 'unknown';

/**
 * The related transaction that caused the error.
 *
 * @category Utils
 */
export type CallExceptionTransaction = {
    to: null | string;
    from?: string;
    data: string;
};

/**
 * This **Error** indicates a transaction reverted.
 *
 * @category Utils
 */
export interface CallExceptionError extends quaisError<'CALL_EXCEPTION'> {
    /**
     * The action being performed when the revert was encountered.
     */
    action: CallExceptionAction;

    /**
     * The revert data returned.
     */
    data: null | string;

    /**
     * A human-readable representation of data, if possible.
     */
    reason: null | string;

    /**
     * The transaction that triggered the exception.
     */
    transaction: CallExceptionTransaction;

    /**
     * The contract invocation details, if available.
     */
    invocation: null | {
        method: string;
        signature: string;
        args: Array<any>;
    };

    /**
     * The built-in or custom revert error, if available
     */
    revert: null | {
        signature: string;
        name: string;
        args: Array<any>;
    };

    /**
     * If the error occurred in a transaction that was mined (with a status of `0`), this is the receipt.
     */
    receipt?: TransactionReceipt; // @TODO: in v7, make this `null | TransactionReceipt`
}

/**
 * The sending account has insufficient funds to cover the entire transaction cost.
 *
 * @category Utils
 */
export interface InsufficientFundsError extends quaisError<'INSUFFICIENT_FUNDS'> {
    /**
     * The transaction.
     */
    transaction: TransactionRequest;
}

/**
 * The sending account has already used this nonce in a transaction that has been included.
 *
 * @category Utils
 */
export interface NonceExpiredError extends quaisError<'NONCE_EXPIRED'> {
    /**
     * The transaction.
     */
    transaction: TransactionRequest;
}

/**
 * An attempt was made to replace a transaction, but with an insufficient additional fee to afford evicting the old
 * transaction from the memory pool.
 *
 * @category Utils
 */
export interface ReplacementUnderpricedError extends quaisError<'REPLACEMENT_UNDERPRICED'> {
    /**
     * The transaction.
     */
    transaction: TransactionRequest;
}

/**
 * A pending transaction was replaced by another.
 *
 * @category Utils
 */
export interface TransactionReplacedError extends quaisError<'TRANSACTION_REPLACED'> {
    /**
     * If the transaction was cancelled, such that the original effects of the transaction cannot be assured.
     */
    cancelled: boolean;

    /**
     * The reason the transaction was replaced.
     */
    reason: 'repriced' | 'cancelled' | 'replaced';

    /**
     * The hash of the replaced transaction.
     */
    hash: string;

    /**
     * The transaction that replaced the transaction.
     */
    replacement: TransactionResponse | ExternalTransactionResponse;

    /**
     * The receipt of the transaction that replace the transaction.
     */
    receipt: TransactionReceipt;
}

/**
 * This Error indicates a request was rejected by the user.
 *
 * In most clients (such as MetaMask), when an operation requires user authorization (such as `signer.sendTransaction`),
 * the client presents a dialog box to the user. If the user denies the request this error is thrown.
 *
 * @category Utils
 */
export interface ActionRejectedError extends quaisError<'ACTION_REJECTED'> {
    /**
     * The requested action.
     */
    action: 'requestAccess' | 'sendTransaction' | 'signMessage' | 'signTransaction' | 'signTypedData' | 'unknown';

    /**
     * The reason the action was rejected.
     *
     * If there is already a pending request, some clients may indicate there is already a `"pending"` action. This
     * prevents an app from spamming the user.
     */
    reason: 'expired' | 'rejected' | 'pending';
}

/**
 * This Error indicates the requested transaction was not found by the node.
 *
 * @category Utils
 */
export interface TransactionNotFoundError extends quaisError<'TRANSACTION_NOT_FOUND'> {}

/**
 * This Error indicates the sent transaction is already known to the node.
 *
 * @category Utils
 */
export interface TransactionAlreadyKnown extends quaisError<'TRANSACTION_ALREADY_KNOWN'> {}

export interface ProviderFailedToInitializeError extends quaisError<'PROVIDER_FAILED_TO_INITIALIZE'> {}

// Coding; converts an ErrorCode its Typed Error

/**
 * A conditional type that transforms the {@link ErrorCode | **ErrorCode**} T into its quaisError type.
 *
 * @category Utils
 */
export type CodedquaisError<T> = T extends 'UNKNOWN_ERROR'
    ? UnknownError
    : T extends 'NOT_IMPLEMENTED'
      ? NotImplementedError
      : T extends 'UNSUPPORTED_OPERATION'
        ? UnsupportedOperationError
        : T extends 'NETWORK_ERROR'
          ? NetworkError
          : T extends 'SERVER_ERROR'
            ? ServerError
            : T extends 'TIMEOUT'
              ? TimeoutError
              : T extends 'BAD_DATA'
                ? BadDataError
                : T extends 'CANCELLED'
                  ? CancelledError
                  : T extends 'BUFFER_OVERRUN'
                    ? BufferOverrunError
                    : T extends 'NUMERIC_FAULT'
                      ? NumericFaultError
                      : T extends 'INVALID_ARGUMENT'
                        ? InvalidArgumentError
                        : T extends 'MISSING_ARGUMENT'
                          ? MissingArgumentError
                          : T extends 'UNEXPECTED_ARGUMENT'
                            ? UnexpectedArgumentError
                            : T extends 'CALL_EXCEPTION'
                              ? CallExceptionError
                              : T extends 'INSUFFICIENT_FUNDS'
                                ? InsufficientFundsError
                                : T extends 'NONCE_EXPIRED'
                                  ? NonceExpiredError
                                  : T extends 'REPLACEMENT_UNDERPRICED'
                                    ? ReplacementUnderpricedError
                                    : T extends 'TRANSACTION_REPLACED'
                                      ? TransactionReplacedError
                                      : T extends 'ACTION_REJECTED'
                                        ? ActionRejectedError
                                        : T extends 'TRANSACTION_NOT_FOUND'
                                          ? TransactionNotFoundError
                                          : T extends 'TRANSACTION_ALREADY_KNOWN'
                                            ? TransactionAlreadyKnown
                                            : T extends 'PROVIDER_FAILED_TO_INITIALIZE'
                                              ? ProviderFailedToInitializeError
                                              : never;

/**
 * Returns true if the `error` matches an error thrown by quais that matches the error `code`.
 *
 * In TypeScript environments, this can be used to check that `error` matches an quaisError type, which means the
 * expected properties will be set.
 *
 * @category Utils
 * @example
 *
 * ```ts
 * try {
 *     // code....
 * } catch (e) {
 *     if (isError(e, 'CALL_EXCEPTION')) {
 *         // The Type Guard has validated this object
 *         console.log(e.data);
 *     }
 * }
 * ```
 *
 * @see [ErrorCodes](api:ErrorCode)
 */
export function isError<K extends ErrorCode, T extends CodedquaisError<K>>(error: any, code: K): error is T {
    return error && (<quaisError>error).code === code;
}

/**
 * Returns true if `error` is a {@link CallExceptionError | **CallExceptionError**}.
 *
 * @category Utils
 */
export function isCallException(error: any): error is CallExceptionError {
    return isError(error, 'CALL_EXCEPTION');
}

/**
 * Returns a new Error configured to the format quais emits errors, with the `message`, {@link ErrorCode | **ErrorCode**}
 * `code` and additional properties for the corresponding quaisError.
 *
 * Each error in quais includes the version of quais, a machine-readable {@link ErrorCode | **ErrorCode**}, and depending
 * on `code`, additional required properties. The error message will also include the `message`, quais version, `code`
 * and all additional properties, serialized.
 *
 * @category Utils
 * @param {string} message - The error message.
 * @param {ErrorCode} code - The error code.
 * @param {ErrorInfo<T>} [info] - Additional properties for the error.
 * @returns {T} The new error.
 */
export function makeError<K extends ErrorCode, T extends CodedquaisError<K>>(
    message: string,
    code: K,
    info?: ErrorInfo<T>,
): T {
    const shortMessage = message;

    {
        const details: Array<string> = [];
        if (info) {
            if ('message' in info || 'code' in info || 'name' in info) {
                throw new Error(`value will overwrite populated values: ${stringify(info)}`);
            }
            for (const key in info) {
                if (key === 'shortMessage') {
                    continue;
                }
                const value = <any>info[<keyof ErrorInfo<T>>key];
                details.push(key + '=' + stringify(value));
            }
        }
        details.push(`code=${code}`);
        details.push(`version=${version}`);

        if (details.length) {
            message += ' (' + details.join(', ') + ')';
        }
    }

    let error;
    switch (code) {
        case 'INVALID_ARGUMENT':
            error = new TypeError(message);
            break;
        case 'NUMERIC_FAULT':
        case 'BUFFER_OVERRUN':
            error = new RangeError(message);
            break;
        default:
            error = new Error(message);
    }

    defineProperties<quaisError>(<quaisError>error, { code });

    if (info) {
        Object.assign(error, info);
    }

    if ((<any>error).shortMessage == null) {
        defineProperties<quaisError>(<quaisError>error, { shortMessage });
    }

    return <T>error;
}

/**
 * Throws an quaisError with `message`, `code` and additional error `info` when `check` is falsish..
 *
 * @category Utils
 * @param {unknown} check - The value to check.
 * @param {string} message - The error message.
 * @param {ErrorCode} code - The error code.
 * @param {ErrorInfo<T>} [info] - Additional properties for the error.
 * @throws {T} Throws the error if `check` is falsish.
 */
export function assert<K extends ErrorCode, T extends CodedquaisError<K>>(
    check: unknown,
    message: string,
    code: K,
    info?: ErrorInfo<T>,
): asserts check {
    if (!check) {
        throw makeError(message, code, info);
    }
}

/**
 * A simple helper to simply ensuring provided arguments match expected constraints, throwing if not.
 *
 * In TypeScript environments, the `check` has been asserted true, so any further code does not need additional
 * compile-time checks.
 *
 * @category Utils
 * @param {unknown} check - The value to check.
 * @param {string} message - The error message.
 * @param {string} name - The name of the argument.
 * @param {unknown} value - The value of the argument.
 * @throws {InvalidArgumentError} Throws if `check` is falsish.
 */
export function assertArgument(check: unknown, message: string, name: string, value: unknown): asserts check {
    assert(check, message, 'INVALID_ARGUMENT', { argument: name, value: value });
}

export function assertArgumentCount(count: number, expectedCount: number, message?: string): void {
    if (message == null) {
        message = '';
    }
    if (message) {
        message = ': ' + message;
    }

    assert(count >= expectedCount, 'missing arguemnt' + message, 'MISSING_ARGUMENT', {
        count: count,
        expectedCount: expectedCount,
    });

    assert(count <= expectedCount, 'too many arguemnts' + message, 'UNEXPECTED_ARGUMENT', {
        count: count,
        expectedCount: expectedCount,
    });
}

const _normalizeForms = ['NFD', 'NFC', 'NFKD', 'NFKC'].reduce(
    (accum, form) => {
        try {
            // General test for normalize
            /* c8 ignore start */
            if ('test'.normalize(form) !== 'test') {
                throw new Error('bad');
            }
            /* c8 ignore stop */

            if (form === 'NFD') {
                const check = String.fromCharCode(0xe9).normalize('NFD');
                const expected = String.fromCharCode(0x65, 0x0301);
                /* c8 ignore start */
                if (check !== expected) {
                    throw new Error('broken');
                }
                /* c8 ignore stop */
            }

            accum.push(form);
            // eslint-disable-next-line no-empty
        } catch (error) {}

        return accum;
    },
    <Array<string>>[],
);

/**
 * Throws if the normalization `form` is not supported.
 *
 * @category Utils
 * @param {string} form - The normalization form.
 * @throws {UnsupportedOperationError} Throws if the form is not supported.
 */
export function assertNormalize(form: string): void {
    assert(_normalizeForms.indexOf(form) >= 0, 'platform missing String.prototype.normalize', 'UNSUPPORTED_OPERATION', {
        operation: 'String.prototype.normalize',
        info: { form },
    });
}

/**
 * Many classes use file-scoped values to guard the constructor, making it effectively private. This facilitates that
 * pattern by ensuring the `givenGuard` matches the file-scoped `guard`, throwing if not, indicating the `className%% if
 * provided.
 *
 * @category Utils
 * @param {any} givenGuard - The guard provided to the constructor.
 * @param {any} guard - The file-scoped guard.
 * @param {string} [className] - The class name.
 * @throws {UnsupportedOperationError} Throws if the guards do not match.
 */
export function assertPrivate(givenGuard: any, guard: any, className?: string): void {
    if (className == null) {
        className = '';
    }
    if (givenGuard !== guard) {
        let method = className,
            operation = 'new';
        if (className) {
            method += '.';
            operation += ' ' + className;
        }
        assert(false, `private constructor; use ${method}from* methods`, 'UNSUPPORTED_OPERATION', {
            operation,
        });
    }
}
