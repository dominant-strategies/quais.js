/**
 *  Some data helpers.
 *
 *
 *  @_subsection api/utils:Data Helpers  [about-data]
 */
import { assert, assertArgument } from "./errors.js";

/**
 *  A {@link HexString | **HexString**} whose length is even, which ensures it is a valid
 *  representation of binary data.
 * 
 *  @category Utils
 */
export type DataHexString = string;

/**
 *  A string which is prefixed with `0x` and followed by any number
 *  of case-agnostic hexadecimal characters.
 *
 *  It must match the regular expression `/0x[0-9A-Fa-f]*\/`.
 * 
 *  @category Utils
 */
export type HexString = string;

/**
 *  An object that can be used to represent binary data.
 * 
 *  @category Utils
 */
export type BytesLike = DataHexString | Uint8Array;

function _getBytes(value: BytesLike, name?: string, copy?: boolean): Uint8Array {
    if (value instanceof Uint8Array) {
        if (copy) { return new Uint8Array(value); }
        return value;
    }

    if (typeof(value) === "string" && value.match(/^0x([0-9a-f][0-9a-f])*$/i)) {
        const result = new Uint8Array((value.length - 2) / 2);
        let offset = 2;
        for (let i = 0; i < result.length; i++) {
            result[i] = parseInt(value.substring(offset, offset + 2), 16);
            offset += 2;
        }
        return result;
    }

    assertArgument(false, "invalid BytesLike value", name || "value", value);
}

/**
 *  Get a typed Uint8Array for `value`. If already a Uint8Array
 *  the original `value` is returned; if a copy is required use
 *  {@link getBytesCopy | **getBytesCopy**}.
 *  
 *  @param {BytesLike} value - The value to convert to a Uint8Array.
 *  @param {string} name - The name of the value for error context.
 *  @returns {Uint8Array} The typed Uint8Array.
 * 
 *  @category Utils
 */
export function getBytes(value: BytesLike, name?: string): Uint8Array {
    return _getBytes(value, name, false);
}

/**
 *  Get a typed Uint8Array for `value`, creating a copy if necessary
 *  to prevent any modifications of the returned value from being
 *  reflected elsewhere.
 * 
 *  @param {BytesLike} value - The value to convert to a Uint8Array.
 *  @param {string} [name] - The name of the value for error context.
 *  @returns {Uint8Array} The typed Uint8Array.
 *  
 *  @category Utils
 */
export function getBytesCopy(value: BytesLike, name?: string): Uint8Array {
    return _getBytes(value, name, true);
}


/**
 *  Returns true if `value` is a valid {@link HexString | **HexString**}.
 *
 *  If `length` is `true` or a //number//, it also checks that
 *  `value` is a valid {@link DataHexString | **DataHexString**} of `length` (if a //number//)
 *  bytes of data (e.g. `0x1234` is 2 bytes).
 * 
 *  @param {any} value - The value to check.
 *  @param {number | boolean} [length] - The expected length of the data.
 *  @returns {boolean} True if the value is a valid {@link HexString | **HexString**}.
 *  
 *  @category Utils
 */
export function isHexString(value: any, length?: number | boolean): value is `0x${ string }` {
    if (typeof(value) !== "string" || !value.match(/^0x[0-9A-Fa-f]*$/)) {
        return false
    }

    if (typeof(length) === "number" && value.length !== 2 + 2 * length) { return false; }
    if (length === true && (value.length % 2) !== 0) { return false; }

    return true;
}

/**
 *  Returns true if `value` is a valid representation of arbitrary
 *  data (i.e. a valid {@link DataHexString | **DataHexString**} or a Uint8Array).
 * 
 *  @param {any} value - The value to check.
 *  @returns {boolean} True if the value is a valid {@link DataHexString | **DataHexString**}.
 * 
 *  @category Utils
 */
export function isBytesLike(value: any): value is BytesLike {
    return (isHexString(value, true) || (value instanceof Uint8Array));
}

const HexCharacters: string = "0123456789abcdef";

/**
 *  Returns a {@link DataHexString | **DataHexString**} representation of `data`.
 * 
 *  @param {BytesLike} data - The data to convert to a hex string.
 *  @returns {string} The hex string.
 *  
 *  @category Utils
 */
export function hexlify(data: BytesLike): string {
    const bytes = getBytes(data);

    let result = "0x";
    for (let i = 0; i < bytes.length; i++) {
        const v = bytes[i];
        result += HexCharacters[(v & 0xf0) >> 4] + HexCharacters[v & 0x0f];
    }
    return result;
}

/**
 *  Returns a {@link DataHexString | **DataHexString** } by concatenating all values
 *  within `data`.
 * 
 *  @param {ReadonlyArray<BytesLike>} datas - The data to concatenate.
 *  @returns {string} The concatenated data.
 *  
 *  @category Utils
 */
export function concat(datas: ReadonlyArray<BytesLike>): string {
    return "0x" + datas.map((d) => hexlify(d).substring(2)).join("");
}

/**
 *  Returns the length of `data`, in bytes.
 * 
 *  @param {BytesLike} data - The data to get the length of.
 *  @returns {number} The length of the data.
 *  
 *  @category Utils
 */
export function dataLength(data: BytesLike): number {
    if (isHexString(data, true)) { return (data.length - 2) / 2; }
    return getBytes(data).length;
}

/**
 *  Returns a {@link DataHexString | **DataHexString** } by slicing `data` from the `start`
 *  offset to the `end` offset.
 *
 *  By default `start` is 0 and `end` is the length of `data`.
 * 
 *  @param {BytesLike} data - The data to slice.
 *  @param {number} [start] - The start offset.
 *  @param {number} [end] - The end offset.
 *  @returns {string} The sliced data.
 *  
 *  @category Utils
 */
export function dataSlice(data: BytesLike, start?: number, end?: number): string {
    const bytes = getBytes(data);
    if (end != null && end > bytes.length) {
        assert(false, "cannot slice beyond data bounds", "BUFFER_OVERRUN", {
            buffer: bytes, length: bytes.length, offset: end
        });
    }
    return hexlify(bytes.slice((start == null) ? 0: start, (end == null) ? bytes.length: end));
}

/**
 *  Return the {@link DataHexString | **DataHexString**} result by stripping all **leading**
 *  zero bytes from `data`.
 * 
 *  @param {BytesLike} data - The data to strip.
 *  @returns {string} The stripped data.
 *  
 *  @category Utils
 */
export function stripZerosLeft(data: BytesLike): string {
    let bytes = hexlify(data).substring(2);
    while (bytes.startsWith("00")) { bytes = bytes.substring(2); }
    return "0x" + bytes;
}

function zeroPad(data: BytesLike, length: number, left: boolean): string {
    const bytes = getBytes(data);
    assert(length >= bytes.length, "padding exceeds data length", "BUFFER_OVERRUN", {
        buffer: new Uint8Array(bytes),
        length: length,
        offset: length + 1
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
 *  Return the {@link DataHexString | **DataHexString**} of `data` padded on the **left**
 *  to `length` bytes.
 *
 *  If `data` already exceeds `length`, a [BufferOverrunError](../interfaces/BufferOverrunError) is
 *  thrown.
 *
 *  This pads data the same as **values** are in Solidity
 *  (e.g. `uint128`).
 * 
 *  @param {BytesLike} data - The data to pad.
 *  @param {number} length - The length to pad to.
 *  @returns {string} The padded data.
 *  
 *  @category Utils
 */
export function zeroPadValue(data: BytesLike, length: number): string {
    return zeroPad(data, length, true);
}

/**
 *  Return the {@link DataHexString | **DataHexString**} of `data` padded on the **right**
 *  to `length` bytes.
 *
 *  If `data` already exceeds %%length%%, a [BufferOverrunError](../interfaces/BufferOverrunError) is
 *  thrown.
 *
 *  This pads data the same as **bytes** are in Solidity
 *  (e.g. `bytes16`).
 * 
 *  @param {BytesLike} data - The data to pad.
 *  @param {number} length - The length to pad to.
 *  @returns {string} The padded data.
 * 
 *  @category Utils
 */
export function zeroPadBytes(data: BytesLike, length: number): string {
    return zeroPad(data, length, false);
}
