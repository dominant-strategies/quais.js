import { keccak256 } from '../crypto/index.js';
import { toUtf8Bytes } from '../encoding/index.js';

/**
 * A simple hashing function which operates on UTF-8 strings to compute an 32-byte identifier.
 *
 * This simply computes the {@link toUtf8Bytes | **UTF-8 bytes**} and computes the {@link keccak256 | **keccak256**}.
 *
 * @category Hash
 * @example
 *
 * ```ts
 * id('hello world');
 * ```
 *
 * @param {string} value - The string to hash.
 * @returns {string} The 32-byte identifier.
 */
export function id(value: string): string {
    return keccak256(toUtf8Bytes(value));
}
