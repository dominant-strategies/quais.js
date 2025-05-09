/**
 * Utilities for common tasks involving hashing. Also see [cryptographic hashing](about-crypto-hashing).
 */

export { id } from './id.js';
export { hashMessage, verifyMessage } from './message.js';
export { solidityPacked, solidityPackedKeccak256, solidityPackedSha256 } from './solidity.js';
export { TypedDataEncoder, verifyTypedData } from './typed-data.js';

export type { TypedDataDomain, TypedDataField } from './typed-data.js';
