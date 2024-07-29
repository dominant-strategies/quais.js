/**
 * Some mathematic operations.
 */
import { hexlify, isBytesLike } from './data.js';
import { assert, assertArgument } from './errors.js';

import type { BytesLike } from './data.js';

/**
 * Any type that can be used where a numeric value is needed.
 *
 * @category Utils
 */
export type Numeric = number | bigint;

/**
 * Any type that can be used where a big number is needed.
 *
 * @category Utils
 */
export type BigNumberish = string | Numeric;

const BN_0 = BigInt(0);
const BN_1 = BigInt(1);

//const BN_Max256 = (BN_1 << BigInt(256)) - BN_1;

// IEEE 754 support 53-bits of mantissa
const maxValue = 0x1fffffffffffff;

/**
 * Convert `value` from a twos-compliment representation of `width` bits to its value.
 *
 * If the highest bit is `1`, the result will be negative.
 *
 * @category Utils
 * @param {BigNumberish} _value - The value to convert.
 * @param {Numeric} _width - The width of the value in bits.
 * @returns {bigint} The value.
 * @throws {Error} If the value is too large for the width.
 */
export function fromTwos(_value: BigNumberish, _width: Numeric): bigint {
    const value = getUint(_value, 'value');
    const width = BigInt(getNumber(_width, 'width'));

    assert(value >> width === BN_0, 'overflow', 'NUMERIC_FAULT', {
        operation: 'fromTwos',
        fault: 'overflow',
        value: _value,
    });

    // Top bit set; treat as a negative value
    if (value >> (width - BN_1)) {
        const mask = (BN_1 << width) - BN_1;
        return -((~value & mask) + BN_1);
    }

    return value;
}

/**
 * Convert `value` to a twos-compliment representation of `width` bits.
 *
 * The result will always be positive.
 *
 * @category Utils
 * @param {BigNumberish} _value - The value to convert.
 * @param {Numeric} _width - The width of the value in bits.
 * @returns {bigint} The value.
 * @throws {Error} If the value is too large for the width.
 */
export function toTwos(_value: BigNumberish, _width: Numeric): bigint {
    let value = getBigInt(_value, 'value');
    const width = BigInt(getNumber(_width, 'width'));

    const limit = BN_1 << (width - BN_1);

    if (value < BN_0) {
        value = -value;
        assert(value <= limit, 'too low', 'NUMERIC_FAULT', {
            operation: 'toTwos',
            fault: 'overflow',
            value: _value,
        });
        const mask = (BN_1 << width) - BN_1;
        return (~value & mask) + BN_1;
    } else {
        assert(value < limit, 'too high', 'NUMERIC_FAULT', {
            operation: 'toTwos',
            fault: 'overflow',
            value: _value,
        });
    }

    return value;
}

/**
 * Mask `value` with a bitmask of `bits` ones.
 *
 * @category Utils
 * @param {BigNumberish} _value - The value to mask.
 * @param {Numeric} _bits - The number of bits to mask.
 * @returns {bigint} The masked value.
 */
export function mask(_value: BigNumberish, _bits: Numeric): bigint {
    const value = getUint(_value, 'value');
    const bits = BigInt(getNumber(_bits, 'bits'));
    return value & ((BN_1 << bits) - BN_1);
}

/**
 * Gets a BigInt from `value`. If it is an invalid value for a BigInt, then an ArgumentError will be thrown for `name`.
 *
 * @category Utils
 * @param {BigNumberish} value - The value to convert.
 * @param {string} name - The name of the value.
 * @returns {bigint} The value.
 */
export function getBigInt(value: BigNumberish, name?: string): bigint {
    switch (typeof value) {
        case 'bigint':
            return value;
        case 'number':
            assertArgument(Number.isInteger(value), 'underflow', name || 'value', value);
            assertArgument(value >= -maxValue && value <= maxValue, 'overflow', name || 'value', value);
            return BigInt(value);
        case 'string':
            try {
                if (value === '') {
                    throw new Error('empty string');
                }
                if (value[0] === '-' && value[1] !== '-') {
                    return -BigInt(value.substring(1));
                }
                return BigInt(value);
            } catch (e: any) {
                assertArgument(false, `invalid BigNumberish string: ${e.message}`, name || 'value', value);
            }
    }
    assertArgument(false, 'invalid BigNumberish value', name || 'value', value);
}

/**
 * Returns absolute value of bigint `value`.
 *
 * @category Utils
 * @param {BigNumberish} value - The value to convert.
 * @returns {bigint} The absolute value.
 */
export function bigIntAbs(value: BigNumberish): bigint {
    value = getBigInt(value);

    // if value is negative (including -0), return -value, else return value
    if (value === -BN_0 || value < BN_0) {
        return -value;
    }
    return value;
}

/**
 * Returns `value` as a bigint, validating it is valid as a bigint value and that it is positive.
 *
 * @category Utils
 * @param {BigNumberish} value - The value to convert.
 * @param {string} name - The name of the value.
 * @returns {bigint} The value.
 * @throws {Error} If the value is negative.
 */
export function getUint(value: BigNumberish, name?: string): bigint {
    const result = getBigInt(value, name);
    assert(result >= BN_0, 'unsigned value cannot be negative', 'NUMERIC_FAULT', {
        fault: 'overflow',
        operation: 'getUint',
        value,
    });
    return result;
}

const Nibbles = '0123456789abcdef';

/**
 * Converts `value` to a BigInt. If `value` is a Uint8Array, it is treated as Big Endian data.
 *
 * @category Utils
 * @param {BigNumberish | Uint8Array} value - The value to convert.
 * @returns {bigint} The value.
 */
export function toBigInt(value: BigNumberish | Uint8Array): bigint {
    if (value instanceof Uint8Array) {
        let result = '0x0';
        for (const v of value) {
            result += Nibbles[v >> 4];
            result += Nibbles[v & 0x0f];
        }
        return BigInt(result);
    }

    return getBigInt(value);
}

/**
 * Gets a number from `value`. If it is an invalid value for a number, then an ArgumentError will be thrown for `name`.
 *
 * @category Utils
 * @param {BigNumberish} value - The value to convert.
 * @param {string} name - The name of the value.
 * @returns {number} The value.
 * @throws {Error} If the value is invalid.
 * @throws {Error} If the value is too large.
 */
export function getNumber(value: BigNumberish, name?: string): number {
    switch (typeof value) {
        case 'bigint':
            assertArgument(value >= -maxValue && value <= maxValue, 'overflow', name || 'value', value);
            return Number(value);
        case 'number':
            assertArgument(Number.isInteger(value), 'underflow', name || 'value', value);
            assertArgument(value >= -maxValue && value <= maxValue, 'overflow', name || 'value', value);
            return value;
        case 'string':
            try {
                if (value === '') {
                    throw new Error('empty string');
                }
                return getNumber(BigInt(value), name);
            } catch (e: any) {
                assertArgument(false, `invalid numeric string: ${e.message}`, name || 'value', value);
            }
    }
    assertArgument(false, 'invalid numeric value', name || 'value', value);
}

/**
 * Converts `value` to a number. If `value` is a Uint8Array, it is treated as Big Endian data. Throws if the value is
 * not safe.
 *
 * @category Utils
 * @param {BigNumberish | Uint8Array} value - The value to convert.
 * @returns {number} The value.
 * @throws {Error} If the value is not safe to convert to a number.
 */
export function toNumber(value: BigNumberish | Uint8Array): number {
    return getNumber(toBigInt(value));
}

/**
 * Converts `value` to a Big Endian hexstring, optionally padded to `width` bytes.
 *
 * @category Utils
 * @param {BigNumberish} _value - The value to convert.
 * @param {Numeric} _width - The width of the value in bytes.
 * @returns {string} The hexstring.
 * @throws {Error} If the value exceeds the width.
 */
export function toBeHex(_value: BigNumberish, _width?: Numeric): string {
    const value = getUint(_value, 'value');

    let result = value.toString(16);

    if (_width == null) {
        // Ensure the value is of even length
        if (result.length % 2) {
            result = '0' + result;
        }
    } else {
        const width = getNumber(_width, 'width');
        assert(width * 2 >= result.length, `value exceeds width (${width} bytes)`, 'NUMERIC_FAULT', {
            operation: 'toBeHex',
            fault: 'overflow',
            value: _value,
        });

        // Pad the value to the required width
        while (result.length < width * 2) {
            result = '0' + result;
        }
    }

    return '0x' + result;
}

/**
 * Converts `value` to a Big Endian Uint8Array.
 *
 * @category Utils
 * @param {BigNumberish} _value - The value to convert.
 * @returns {Uint8Array} The value.
 */
export function toBeArray(_value: BigNumberish): Uint8Array {
    const value = getUint(_value, 'value');

    if (value === BN_0) {
        return new Uint8Array([]);
    }

    let hex = value.toString(16);
    if (hex.length % 2) {
        hex = '0' + hex;
    }

    const result = new Uint8Array(hex.length / 2);
    for (let i = 0; i < result.length; i++) {
        const offset = i * 2;
        result[i] = parseInt(hex.substring(offset, offset + 2), 16);
    }

    return result;
}

/**
 * Returns a `HexString` for `value` safe to use as a Quantity.
 *
 * A Quantity does not have and leading 0 values unless the value is the literal value `0x0`. This is most commonly used
 * for JSSON-RPC numeric values.
 *
 * @category Utils
 * @param {BigNumberish | Uint8Array} value - The value to convert.
 * @returns {string} The quantity.
 */
export function toQuantity(value: BytesLike | BigNumberish): string {
    let result = hexlify(isBytesLike(value) ? value : toBeArray(value)).substring(2);
    while (result.startsWith('0')) {
        result = result.substring(1);
    }
    if (result === '') {
        result = '0';
    }
    return '0x' + result;
}
