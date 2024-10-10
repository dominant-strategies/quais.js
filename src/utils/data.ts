/**
 * Some data helpers.
 */
import { assert, assertArgument } from './errors.js';

/**
 * A {@link HexString | **HexString**} whose length is even, which ensures it is a valid representation of binary data.
 *
 * @category Utils
 */
export type DataHexString = string;

/**
 * A string which is prefixed with `0x` and followed by any number of case-agnostic hexadecimal characters.
 *
 * It must match the regular expression `/0x[0-9A-Fa-f]*\/`.
 *
 * @category Utils
 */
export type HexString = string;

/**
 * An object that can be used to represent binary data.
 *
 * @category Utils
 */
export type BytesLike = DataHexString | Uint8Array;

/**
 * Converts a BytesLike value to a Uint8Array.
 *
 * @ignore
 * @category Utils
 * @param {BytesLike} value - The value to convert.
 * @param {string} [name] - The name of the value for error context.
 * @param {boolean} [copy] - Whether to create a copy of the value.
 * @returns {Uint8Array} The converted Uint8Array.
 * @throws {Error} If the value is not a valid BytesLike.
 */
function _getBytes(value: BytesLike, name?: string, copy?: boolean): Uint8Array {
    if (value instanceof Uint8Array) {
        if (copy) {
            return new Uint8Array(value);
        }
        return value;
    }

    if (typeof value === 'string' && value.match(/^0x([0-9a-f][0-9a-f])*$/i)) {
        const result = new Uint8Array((value.length - 2) / 2);
        let offset = 2;
        for (let i = 0; i < result.length; i++) {
            result[i] = parseInt(value.substring(offset, offset + 2), 16);
            offset += 2;
        }
        return result;
    }

    assertArgument(false, 'invalid BytesLike value', name || 'value', value);
}

/**
 * Get a typed Uint8Array for `value`. If already a Uint8Array the original `value` is returned; if a copy is required
 * use {@link getBytesCopy | **getBytesCopy**}.
 *
 * @category Utils
 * @param {BytesLike} value - The value to convert to a Uint8Array.
 * @param {string} [name] - The name of the value for error context.
 * @returns {Uint8Array} The typed Uint8Array.
 */
export function getBytes(value: BytesLike, name?: string): Uint8Array {
    return _getBytes(value, name, false);
}

/**
 * Get a typed Uint8Array for `value`, creating a copy if necessary to prevent any modifications of the returned value
 * from being reflected elsewhere.
 *
 * @category Utils
 * @param {BytesLike} value - The value to convert to a Uint8Array.
 * @param {string} [name] - The name of the value for error context.
 * @returns {Uint8Array} The typed Uint8Array.
 */
export function getBytesCopy(value: BytesLike, name?: string): Uint8Array {
    return _getBytes(value, name, true);
}

/**
 * Returns true if `value` is a valid {@link HexString | **HexString**}.
 *
 * If `length` is `true` or a number, it also checks that `value` is a valid {@link DataHexString | **DataHexString**} of
 * `length` (if a number) bytes of data (e.g. `0x1234` is 2 bytes).
 *
 * @category Utils
 * @param {any} value - The value to check.
 * @param {number | boolean} [length] - The expected length of the data.
 * @returns {boolean} True if the value is a valid {@link HexString | **HexString**}.
 */
export function isHexString(value: any, length?: number | boolean): value is `0x${string}` {
    if (typeof value !== 'string' || !value.match(/^0x[0-9A-Fa-f]*$/)) {
        return false;
    }

    if (typeof length === 'number' && value.length !== 2 + 2 * length) {
        return false;
    }
    if (length === true && value.length % 2 !== 0) {
        return false;
    }

    return true;
}

/**
 * Returns true if `value` is a valid representation of arbitrary data (i.e. a valid
 * {@link DataHexString | **DataHexString**} or a Uint8Array).
 *
 * @category Utils
 * @param {any} value - The value to check.
 * @returns {boolean} True if the value is a valid {@link DataHexString | **DataHexString**}.
 */
export function isBytesLike(value: any): value is BytesLike {
    return isHexString(value, true) || value instanceof Uint8Array;
}

const HexCharacters: string = '0123456789abcdef';

/**
 * Returns a {@link DataHexString | **DataHexString**} representation of `data`.
 *
 * @category Utils
 * @param {BytesLike} data - The data to convert to a hex string.
 * @returns {string} The hex string.
 */
export function hexlify(data: BytesLike): string {
    const bytes = getBytes(data);

    let result = '0x';
    for (let i = 0; i < bytes.length; i++) {
        const v = bytes[i];
        result += HexCharacters[(v & 0xf0) >> 4] + HexCharacters[v & 0x0f];
    }
    return result;
}

/**
 * Returns a {@link DataHexString | **DataHexString** } by concatenating all values within `data`.
 *
 * @category Utils
 * @param {ReadonlyArray<BytesLike>} datas - The data to concatenate.
 * @returns {string} The concatenated data.
 */
export function concat(datas: ReadonlyArray<BytesLike>): string {
    return '0x' + datas.map((d) => hexlify(d).substring(2)).join('');
}

/**
 * Returns the length of `data`, in bytes.
 *
 * @category Utils
 * @param {BytesLike} data - The data to get the length of.
 * @returns {number} The length of the data.
 */
export function dataLength(data: BytesLike): number {
    if (isHexString(data, true)) {
        return (data.length - 2) / 2;
    }
    return getBytes(data).length;
}

/**
 * Returns a {@link DataHexString | **DataHexString** } by slicing `data` from the `start` offset to the `end` offset.
 *
 * By default `start` is 0 and `end` is the length of `data`.
 *
 * @category Utils
 * @param {BytesLike} data - The data to slice.
 * @param {number} [start] - The start offset.
 * @param {number} [end] - The end offset.
 * @returns {string} The sliced data.
 * @throws {Error} If the end offset is beyond the data bounds.
 */
export function dataSlice(data: BytesLike, start?: number, end?: number): string {
    const bytes = getBytes(data);
    if (end != null && end > bytes.length) {
        assert(false, 'cannot slice beyond data bounds', 'BUFFER_OVERRUN', {
            buffer: bytes,
            length: bytes.length,
            offset: end,
        });
    }
    return hexlify(bytes.slice(start == null ? 0 : start, end == null ? bytes.length : end));
}

/**
 * Return the {@link DataHexString | **DataHexString**} result by stripping all **leading** zero bytes from `data`.
 *
 * @category Utils
 * @param {BytesLike} data - The data to strip.
 * @returns {string} The stripped data.
 */
export function stripZerosLeft(data: BytesLike): string {
    let bytes = hexlify(data).substring(2);
    while (bytes.startsWith('00')) {
        bytes = bytes.substring(2);
    }
    return '0x' + bytes;
}

/**
 * Pads the data to the specified length.
 *
 * @ignore
 * @category Utils
 * @param {BytesLike} data - The data to pad.
 * @param {number} length - The length to pad to.
 * @param {boolean} left - Whether to pad on the left.
 * @returns {string} The padded data.
 * @throws {Error} If the padding exceeds data length.
 */
function zeroPad(data: BytesLike, length: number, left: boolean): string {
    const bytes = getBytes(data);
    assert(length >= bytes.length, 'padding exceeds data length', 'BUFFER_OVERRUN', {
        buffer: new Uint8Array(bytes),
        length: length,
        offset: length + 1,
    });

    const result = new Uint8Array(length);
    result.fill(0);
    if (left) {
        result.set(bytes, length - bytes.length);
    } else {
        result.set(bytes, 0);
    }

    return hexlify(result);
}

/**
 * Return the {@link DataHexString | **DataHexString**} of `data` padded on the **left** to `length` bytes.
 *
 * If `data` already exceeds `length`, a [BufferOverrunError](../interfaces/BufferOverrunError) is thrown.
 *
 * This pads data the same as **values** are in Solidity (e.g. `uint128`).
 *
 * @category Utils
 * @param {BytesLike} data - The data to pad.
 * @param {number} length - The length to pad to.
 * @returns {string} The padded data.
 */
export function zeroPadValue(data: BytesLike, length: number): string {
    return zeroPad(data, length, true);
}

/**
 * Return the {@link DataHexString | **DataHexString**} of `data` padded on the **right** to `length` bytes.
 *
 * If `data` already exceeds %%length%%, a [BufferOverrunError](../interfaces/BufferOverrunError) is thrown.
 *
 * This pads data the same as **bytes** are in Solidity (e.g. `bytes16`).
 *
 * @category Utils
 * @param {BytesLike} data - The data to pad.
 * @param {number} length - The length to pad to.
 * @returns {string} The padded data.
 */
export function zeroPadBytes(data: BytesLike, length: number): string {
    return zeroPad(data, length, false);
}

/**
 * XOR two Uint8Array values.
 *
 * @category Utils
 * @param {Uint8Array} a - The first Uint8Array.
 * @param {Uint8Array} b - The second Uint8Array.
 * @returns {Uint8Array} The XOR result.
 */
export function xorUint8Arrays(a: Uint8Array, b: Uint8Array): Uint8Array {
    if (a.length !== b.length) {
        throw new Error('Uint8Arrays are not of the same length');
    }

    const result = new Uint8Array(a.length);

    // eslint-disable-next-line
    for (let i = 0; i < a.length; i++) {
        result[i] = a[i] ^ b[i];
    }

    return result;
}
