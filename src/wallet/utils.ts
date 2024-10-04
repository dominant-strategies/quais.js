/**
 * @module wallet/utils
 */

import { getBytesCopy, assertArgument, BytesLike, concat, dataSlice, getBytes, assert } from '../utils/index.js';
import { computeHmac, sha256 } from '../crypto/index.js';
import { encodeBase58, toUtf8Bytes } from '../encoding/index.js';

/**
 * Converts a hex string to a Uint8Array. If the string does not start with '0x', it adds it.
 *
 * @param {string} hexString - The hex string to convert.
 * @returns {Uint8Array} The resulting byte array.
 */
export function looseArrayify(hexString: string): Uint8Array {
    if (typeof hexString === 'string' && !hexString.startsWith('0x')) {
        hexString = '0x' + hexString;
    }
    return getBytesCopy(hexString);
}

/**
 * Converts a password to a Uint8Array. If the password is a string, it converts it to UTF-8 bytes.
 *
 * @param {string | Uint8Array} password - The password to convert.
 * @returns {Uint8Array} The resulting byte array.
 */
export function getPassword(password: string | Uint8Array): Uint8Array {
    if (typeof password === 'string') {
        return toUtf8Bytes(password, 'NFKC');
    }
    return getBytesCopy(password);
}

/**
 * Traverses an object based on a path and returns the value at that path.
 *
 * @param {any} object - The object to traverse.
 * @param {string} _path - The path to traverse.
 * @returns {T} The value at the specified path.
 */
export function spelunk<T>(object: any, _path: string): T {
    const match = _path.match(/^([a-z0-9$_.-]*)(:([a-z]+))?(!)?$/i);
    assertArgument(match != null, 'invalid path', 'path', _path);

    const path = match[1];
    const type = match[3];
    const reqd = match[4] === '!';

    let cur = object;
    for (const comp of path.toLowerCase().split('.')) {
        // Search for a child object with a case-insensitive matching key
        if (Array.isArray(cur)) {
            if (!comp.match(/^[0-9]+$/)) {
                break;
            }
            cur = cur[parseInt(comp)];
        } else if (typeof cur === 'object') {
            let found: any = null;
            for (const key in cur) {
                if (key.toLowerCase() === comp) {
                    found = cur[key];
                    break;
                }
            }
            cur = found;
        } else {
            cur = null;
        }

        if (cur == null) {
            break;
        }
    }

    assertArgument(!reqd || cur != null, 'missing required value', 'path', path);

    if (type && cur != null) {
        if (type === 'int') {
            if (typeof cur === 'string' && cur.match(/^-?[0-9]+$/)) {
                return <T>(<unknown>parseInt(cur));
            } else if (Number.isSafeInteger(cur)) {
                return cur;
            }
        }

        if (type === 'number') {
            if (typeof cur === 'string' && cur.match(/^-?[0-9.]*$/)) {
                return <T>(<unknown>parseFloat(cur));
            }
        }

        if (type === 'data') {
            if (typeof cur === 'string') {
                return <T>(<unknown>looseArrayify(cur));
            }
        }

        if (type === 'array' && Array.isArray(cur)) {
            return <T>(<unknown>cur);
        }
        if (type === typeof cur) {
            return cur;
        }

        assertArgument(false, `wrong type found for ${type} `, 'path', path);
    }

    return cur;
}

// HDNODEWallet and UTXO Wallet util methods

/**
 * "Bitcoin seed"
 */
export const MasterSecret = new Uint8Array([66, 105, 116, 99, 111, 105, 110, 32, 115, 101, 101, 100]);

/**
 * Hardened bit constant
 */
export const HardenedBit = 0x80000000;

/**
 * Constant N used in cryptographic operations
 */
export const N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');

/**
 * Hexadecimal characters
 */
export const Nibbles = '0123456789abcdef';

/**
 * Pads a value with leading zeros to a specified length.
 *
 * @param {string | number} value - The value to pad.
 * @param {number} length - The desired length.
 * @returns {string} The padded value.
 */
export function zpad(value: string | number, length: number): string {
    // Determine if the value is hexadecimal
    const isHex = typeof value === 'string' && value.startsWith('0x');

    // Handle hexadecimal values
    if (isHex) {
        let hexValue = value.substring(2); // Remove the "0x" prefix
        while (hexValue.length < length * 2) {
            // Hexadecimal characters count double
            hexValue = '0' + hexValue;
        }
        return '0x' + hexValue;
    }

    // Handle numbers or non-hexadecimal strings
    let result = String(value);
    while (result.length < length) {
        result = '0' + result;
    }
    return result;
}

/**
 * Encodes a value using Base58Check encoding.
 *
 * @param {BytesLike} _value - The value to encode.
 * @returns {string} The Base58Check encoded string.
 */
export function encodeBase58Check(_value: BytesLike): string {
    const value = getBytes(_value);
    const check = dataSlice(sha256(sha256(value)), 0, 4);
    const bytes = concat([value, check]);
    return encodeBase58(bytes);
}

/**
 * Serializes an index, chain code, public key, and private key into a pair of derived keys.
 *
 * @param {number} index - The index to serialize.
 * @param {string} chainCode - The chain code.
 * @param {string} publicKey - The public key.
 * @param {null | string} privateKey - The private key.
 * @returns {{ IL: Uint8Array; IR: Uint8Array }} The derived keys.
 */
export function ser_I(
    index: number,
    chainCode: string,
    publicKey: string,
    privateKey: null | string,
): { IL: Uint8Array; IR: Uint8Array } {
    const data = new Uint8Array(37);

    if (index & HardenedBit) {
        assert(privateKey != null, 'cannot derive child of neutered node', 'UNSUPPORTED_OPERATION', {
            operation: 'deriveChild',
        });

        // Data = 0x00 || ser_256(k_par)
        data.set(getBytes(privateKey), 1);
    } else {
        // Data = ser_p(point(k_par))
        data.set(getBytes(publicKey));
    }

    // Data += ser_32(i)
    for (let i = 24; i >= 0; i -= 8) {
        data[33 + (i >> 3)] = (index >> (24 - i)) & 0xff;
    }
    const I = getBytes(computeHmac('sha512', chainCode, data));

    return { IL: I.slice(0, 32), IR: I.slice(32) };
}
