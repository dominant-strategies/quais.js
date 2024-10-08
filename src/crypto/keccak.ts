/**
 * Cryptographic hashing functions
 */

import { keccak_256 } from '@noble/hashes/sha3';

import { getBytes, hexlify } from '../utils/index.js';

import type { BytesLike } from '../utils/index.js';

let locked = false;

const _keccak256 = function (data: Uint8Array): Uint8Array {
    return keccak_256(data);
};

let __keccak256: (data: Uint8Array) => BytesLike = _keccak256;

/**
 * Compute the cryptographic KECCAK256 hash of `data`.
 *
 * The `data` **must** be a data representation, to compute the hash of UTF-8 data use the [**id**}(../functions/id)
 * function.
 *
 * @category Crypto
 * @example
 *
 * ```ts
 * keccak256('0x');
 *
 * keccak256('0x1337');
 *
 * keccak256(new Uint8Array([0x13, 0x37]));
 *
 * // Strings are assumed to be DataHexString, otherwise it will
 * // throw. To hash UTF-8 data, see the note above.
 * keccak256('Hello World');
 * ```
 *
 * @param {BytesLike} _data - The data to hash.
 * @returns DataHexstring
 * @returns {string} The hash of the data.
 */
export function keccak256(_data: BytesLike): string {
    const data = getBytes(_data, 'data');
    return hexlify(__keccak256(data));
}
keccak256._ = _keccak256;
keccak256.lock = function (): void {
    locked = true;
};
keccak256.register = function (func: (data: Uint8Array) => BytesLike) {
    if (locked) {
        throw new TypeError('keccak256 is locked');
    }
    __keccak256 = func;
};
Object.freeze(keccak256);
