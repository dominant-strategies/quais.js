/**
 * Most interactions with Ethereum requires integer values, which use the smallest magnitude unit.
 *
 * For example, imagine dealing with dollars and cents. Since dollars are divisible, non-integer values are possible,
 * such as `$10.77`. By using the smallest indivisible unit (i.e. cents), the value can be kept as the integer `1077`.
 *
 * When receiving decimal input from the user (as a decimal string), the value should be converted to an integer and
 * when showing a user a value, the integer value should be converted to a decimal string.
 *
 * This creates a clear distinction, between values to be used by code (integers) and values used for display logic to
 * users (decimals).
 *
 * The native unit in Ethereum, ether is divisible to 18 decimal places, where each individual unit is called a wei.
 */
import { assertArgument } from './errors.js';
import { FixedNumber } from './fixednumber.js';
import { getNumber } from './maths.js';

import type { BigNumberish, Numeric } from './index.js';

const names = ['wei', 'kwei', 'mwei', 'gwei', 'szabo', 'finney', 'ether'];

/**
 * Converts `value` into a decimal string, assuming `unit` decimal places. The `unit` may be the number of decimal
 * places or the name of a unit (e.g. `"gwei"` for 9 decimal places).
 *
 * @category Utils
 * @param {BigNumberish} value - The value to convert.
 * @param {string | Numeric} [unit=18] - The unit to convert to. Default is `18`
 * @returns {string} The converted value.
 * @throws {Error} If the unit is invalid.
 */
export function formatUnits(value: BigNumberish, unit?: string | Numeric): string {
    let decimals = 18;
    if (typeof unit === 'string') {
        const index = names.indexOf(unit);
        assertArgument(index >= 0, 'invalid unit', 'unit', unit);
        decimals = 3 * index;
    } else if (unit != null) {
        decimals = getNumber(unit, 'unit');
    }

    return FixedNumber.fromValue(value, decimals, { decimals, width: 512 }).toString();
}

/**
 * Converts the decimal string `value` to a BigInt, assuming `unit` decimal places. The `unit` may the number of decimal
 * places or the name of a unit (e.g. `"gwei"` for 9 decimal places).
 *
 * @category Utils
 * @param {string} value - The value to convert.
 * @param {string | Numeric} [unit=18] - The unit to convert from. Default is `18`
 * @returns {bigint} The converted value.
 * @throws {Error} If the unit is invalid.
 * @throws {Error} If the value is not a string.
 */
export function parseUnits(value: string, unit?: string | Numeric): bigint {
    assertArgument(typeof value === 'string', 'value must be a string', 'value', value);

    let decimals = 18;
    if (typeof unit === 'string') {
        const index = names.indexOf(unit);
        assertArgument(index >= 0, 'invalid unit', 'unit', unit);
        decimals = 3 * index;
    } else if (unit != null) {
        decimals = getNumber(unit, 'unit');
    }

    return FixedNumber.fromString(value, { decimals, width: 512 }).value;
}

/**
 * Converts `value` into a decimal string sing 18 decimal places.
 *
 * @category Utils
 * @param {BigNumberish} wei - The value to convert.
 * @returns {string} The converted value.
 */
export function formatQuai(wei: BigNumberish): string {
    return formatUnits(wei, 18);
}

/**
 * Converts `value` into a decimal string using 3 decimal places.
 *
 * @category Utils
 * @param {BigNumberish} value - The value to convert.
 * @returns {string} The converted value.
 */
export function formatQi(value: BigNumberish): string {
    return formatUnits(value, 3);
}

/**
 * Converts the decimal string `quai` to a BigInt, using 18 decimal places.
 *
 * @category Utils
 * @param {string} ether - The value to convert.
 * @returns {bigint} The converted value.
 */
export function parseQuai(ether: string): bigint {
    return parseUnits(ether, 18);
}

/**
 * Converts `value` into a decimal string using 3 decimal places.
 *
 * @category Utils
 * @param {string} value - The value to convert.
 * @returns {bigint} The converted value.
 */
export function parseQi(value: string): bigint {
    return parseUnits(value, 3);
}
