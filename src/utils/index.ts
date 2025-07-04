/**
 * There are many simple utilities required to interact with Ethereum and to simplify the library, without increasing
 * the library dependencies for simple functions.
 */

export {
    getBytes,
    getBytesCopy,
    isHexString,
    isBytesLike,
    hexlify,
    concat,
    dataLength,
    dataSlice,
    stripZerosLeft,
    zeroPadValue,
    zeroPadBytes,
} from './data.js';

export {
    isCallException,
    isError,
    assert,
    assertArgument,
    assertArgumentCount,
    assertPrivate,
    assertNormalize,
    makeError,
} from './errors.js';

export { EventPayload } from './events.js';

export { FetchRequest, FetchResponse, FetchCancelSignal } from './fetch.js';

export { FixedNumber } from './fixednumber.js';

export {
    fromTwos,
    toTwos,
    mask,
    getBigInt,
    getNumber,
    getUint,
    toBigInt,
    toNumber,
    toBeHex,
    toBeArray,
    toQuantity,
} from './maths.js';

export { resolveProperties, defineProperties } from './properties.js';

export { formatQuai, parseQuai, formatQi, parseQi, formatUnits, parseUnits } from './units.js';

export { uuidV4 } from './uuid.js';

export { getTxType, getZoneForAddress, getAddressDetails } from './shards.js';

/////////////////////////////
// Types

export type { BytesLike, DataHexString, HexString } from './data.js';

export type {
    ErrorCode,
    quaisError,
    UnknownError,
    NotImplementedError,
    UnsupportedOperationError,
    NetworkError,
    ServerError,
    TimeoutError,
    BadDataError,
    CancelledError,
    BufferOverrunError,
    NumericFaultError,
    InvalidArgumentError,
    MissingArgumentError,
    UnexpectedArgumentError,
    CallExceptionError,
    InsufficientFundsError,
    NonceExpiredError,
    ReplacementUnderpricedError,
    TransactionReplacedError,
    ActionRejectedError,
    CallExceptionAction,
    CallExceptionTransaction,
    CodedquaisError,
} from './errors.js';

export type { EventEmitterable, Listener } from './events.js';

export type {
    GetUrlResponse,
    FetchPreflightFunc,
    FetchProcessFunc,
    FetchRetryFunc,
    FetchGatewayFunc,
    FetchGetUrlFunc,
} from './fetch.js';

export type { FixedFormat } from './fixednumber.js';

export type { BigNumberish, Numeric } from './maths.js';
