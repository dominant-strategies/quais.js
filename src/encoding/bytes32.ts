/**
 * Provides utility functions for encoding and decoding strings in the Bytes32 format.
 *
 * @category Application Binary Interface
 */

import { getBytes, zeroPadBytes } from '../utils/index.js';
import { toUtf8Bytes, toUtf8String } from './index.js';

import type { BytesLike } from '../utils/index.js';

/**
 * Encodes a string as a Bytes32 string. This is used to encode ABI data.
 *
 * @category Encoding
 * @param {string} text - The string to encode.
 * @returns {string} The Bytes32-encoded string.
 * @throws {Error} If the string is too long to fit in a Bytes32 format.
 */
export function encodeBytes32(text: string): string {
    // Get the bytes
    const bytes = toUtf8Bytes(text);

    // Check we have room for null-termination
    if (bytes.length > 31) {
        throw new Error('bytes32 string must be less than 32 bytes');
    }

    // Zero-pad (implicitly null-terminates)
    return zeroPadBytes(bytes, 32);
}

/**
 * Decodes a Bytes32-encoded string into a regular string. This is used to decode ABI-encoded data.
 *
 * @category Encoding
 * @param {BytesLike} _bytes - The Bytes32-encoded data.
 * @returns {string} The decoded string.
 * @throws {Error} If the input is not exactly 32 bytes long or lacks a null terminator.
 */
export function decodeBytes32(_bytes: BytesLike): string {
    const data = getBytes(_bytes, 'bytes');

    // Must be 32 bytes with a null-termination
    if (data.length !== 32) {
        throw new Error('invalid bytes32 - not 32 bytes long');
    }
    if (data[31] !== 0) {
        throw new Error('invalid bytes32 string - no null terminator');
    }

    // Find the null termination
    let length = 31;
    while (data[length - 1] === 0) {
        length--;
    }

    // Determine the string value
    return toUtf8String(data.slice(0, length));
}
