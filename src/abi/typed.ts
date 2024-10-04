/**
 * A Typed object allows a value to have its type explicitly specified.
 *
 * For example, in Solidity, the value `45` could represent a `uint8` or a `uint256`. The value `0x1234` could represent
 * a `bytes2` or `bytes`.
 *
 * Since JavaScript has no meaningful way to explicitly inform any APIs which what the type is, this allows transparent
 * interoperation with Soldity.
 *
 * @category Application Binary Interface
 */

import { assertPrivate, defineProperties } from '../utils/index.js';

import type { Addressable } from '../address/index.js';
import type { BigNumberish, BytesLike } from '../utils/index.js';

import type { Result } from './coders/abstract-coder.js';

const _guard = {};

function n(value: BigNumberish, width: number): Typed {
    let signed = false;
    if (width < 0) {
        signed = true;
        width *= -1;
    }

    // @TODO: Check range is valid for value
    return new Typed(_guard, `${signed ? '' : 'u'}int${width}`, value, { signed, width });
}

function b(value: BytesLike, size?: number): Typed {
    // @TODO: Check range is valid for value
    return new Typed(_guard, `bytes${size ? size : ''}`, value, { size });
}

// @TODO: Remove this in v7, it was replaced by TypedBigInt
/**
 * @ignore
 */
export interface TypedNumber extends Typed {
    value: number;
    defaultValue(): number;
    minValue(): number;
    maxValue(): number;
}

/**
 * A **Typed** that represents a numeric value.
 *
 * @category Application Binary Interface
 */
export interface TypedBigInt extends Typed {
    /**
     * The value.
     */
    value: bigint;

    /**
     * The default value for all numeric types is `0`.
     */
    defaultValue(): bigint;

    /**
     * The minimum value for this type, accounting for bit-width and signed-ness.
     */
    minValue(): bigint;

    /**
     * The minimum value for this type, accounting for bit-width.
     */
    maxValue(): bigint;
}

/**
 * A **Typed** that represents a binary sequence of data as bytes.
 *
 * @category Application Binary Interface
 */
export interface TypedData extends Typed {
    /**
     * The value.
     */
    value: string;

    /**
     * The default value for this type.
     */
    defaultValue(): string;
}

/**
 * A **Typed** that represents a UTF-8 sequence of bytes.
 *
 * @category Application Binary Interface
 */
export interface TypedString extends Typed {
    /**
     * The value.
     */
    value: string;

    /**
     * The default value for the string type is the empty string (i.e. `""`).
     */
    defaultValue(): string;
}

const _typedSymbol = Symbol.for('_quais_typed');

/**
 * The **Typed** class to wrap values providing explicit type information.
 *
 * @category Application Binary Interface
 */
export class Typed {
    /**
     * The type, as a Solidity-compatible type.
     */
    readonly type!: string;

    /**
     * The actual value.
     */
    readonly value!: any;

    readonly #options: any;

    /**
     * @ignore
     */
    readonly _typedSymbol!: symbol;

    /**
     * @ignore
     */
    constructor(guard: any, type: string, value: any, options?: any) {
        if (options == null) {
            options = null;
        }
        assertPrivate(_guard, guard, 'Typed');
        defineProperties<Typed>(this, { _typedSymbol, type, value });
        this.#options = options;

        // Check the value is valid
        this.format();
    }

    /**
     * Format the type as a Human-Readable type.
     *
     * @returns The human-readable type for the provided type.
     * @throws If the type is array or dynamic array.
     */
    format(): string {
        if (this.type === 'array') {
            throw new Error('');
        } else if (this.type === 'dynamicArray') {
            throw new Error('');
        } else if (this.type === 'tuple') {
            return `tuple(${this.value.map((v: Typed) => v.format()).join(',')})`;
        }

        return this.type;
    }

    /**
     * The default value returned by this type.
     *
     * @returns The default value for this type.
     */
    defaultValue(): string | number | bigint | Result {
        return 0;
    }

    /**
     * The minimum value for numeric types.
     *
     * @returns The minimum value for the provided numeric type.
     */
    minValue(): string | number | bigint {
        return 0;
    }

    /**
     * The maximum value for numeric types.
     *
     * @returns The maximum value for the provided numeric type.
     */
    maxValue(): string | number | bigint {
        return 0;
    }

    /**
     * Returns whether this is a {@link TypedBigInt | **TypedBigInt**}. If true, a type guard is provided.
     *
     * @returns `true` if this is a big integer.
     */
    isBigInt(): this is TypedBigInt {
        return !!this.type.match(/^u?int[0-9]+$/);
    }

    /**
     * Returns whether this is a {@link TypedData | **TypedData**}. If true, a type guard is provided.
     *
     * @returns {boolean} `true` if this is a number.
     */
    isData(): this is TypedData {
        return this.type.startsWith('bytes');
    }

    /**
     * Return whether this is a {@link TypedString | **TypedString**}. If true, a type guard is provided.
     *
     * @returns {boolean} `true` if this is a string.
     */
    isString(): this is TypedString {
        return this.type === 'string';
    }

    /**
     * Returns the tuple name.
     *
     * @returns {boolean} The tuple name if this is a tuple.
     * @throws If this is not a tuple.
     */
    get tupleName(): null | string {
        if (this.type !== 'tuple') {
            throw TypeError('not a tuple');
        }
        return this.#options;
    }

    /**
     * Returns the length of a typed array.
     *
     * @returns {number} The length of the array type or `-1` if it is dynamic.
     * @throws If this is not an array.
     */
    get arrayLength(): null | number {
        if (this.type !== 'array') {
            throw TypeError('not an array');
        }
        if (this.#options === true) {
            return -1;
        }
        if (this.#options === false) {
            return (<Array<any>>this.value).length;
        }
        return null;
    }

    /**
     * Returns a new **Typed** of `type` with the `value`.
     *
     * @param {string} type - The type to use.
     * @param {any} value - The value to use.
     */
    static from(type: string, value: any): Typed {
        return new Typed(_guard, type, value);
    }

    /**
     * Return a new `uint8` type for v.
     *
     * @param {BigNumberish} v - The value to convert to a `uint8`.
     * @returns {uint8} A new `uint8` type for `v`.
     */
    static uint8(v: BigNumberish): Typed {
        return n(v, 8);
    }

    /**
     * Return a new `uint16` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint16`.
     * @returns A new `uint16` type for `v`.
     */
    static uint16(v: BigNumberish): Typed {
        return n(v, 16);
    }

    /**
     * Return a new `uint24` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint24`.
     * @returns A new `uint24` type for `v`.
     */
    static uint24(v: BigNumberish): Typed {
        return n(v, 24);
    }

    /**
     * Return a new `uint32` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint32`.
     * @returns A new `uint32` type for `v`.
     */
    static uint32(v: BigNumberish): Typed {
        return n(v, 32);
    }

    /**
     * Return a new `uint40` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint40`.
     * @returns A new `uint40` type for `v`.
     */
    static uint40(v: BigNumberish): Typed {
        return n(v, 40);
    }

    /**
     * Return a new `uint48` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint48`.
     * @returns A new `uint48` type for `v`.
     */
    static uint48(v: BigNumberish): Typed {
        return n(v, 48);
    }

    /**
     * Return a new `uint56` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint56`.
     * @returns A new `uint56` type for `v`.
     */
    static uint56(v: BigNumberish): Typed {
        return n(v, 56);
    }

    /**
     * Return a new `uint64` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint64`.
     * @returns A new `uint64` type for `v`.
     */
    static uint64(v: BigNumberish): Typed {
        return n(v, 64);
    }

    /**
     * Return a new `uint72` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint72`.
     * @returns A new `uint72` type for `v`.
     */
    static uint72(v: BigNumberish): Typed {
        return n(v, 72);
    }

    /**
     * Return a new `uint80` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint80`.
     * @returns A new `uint80` type for `v`.
     */
    static uint80(v: BigNumberish): Typed {
        return n(v, 80);
    }

    /**
     * Return a new `uint88` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint88`.
     * @returns A new `uint88` type for `v`.
     */
    static uint88(v: BigNumberish): Typed {
        return n(v, 88);
    }

    /**
     * Return a new `uint96` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint96`.
     * @returns A new `uint96` type for `v`.
     */
    static uint96(v: BigNumberish): Typed {
        return n(v, 96);
    }

    /**
     * Return a new `uint104` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint104`.
     * @returns A new `uint104` type for `v`.
     */
    static uint104(v: BigNumberish): Typed {
        return n(v, 104);
    }

    /**
     * Return a new `uint112` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint112`.
     * @returns A new `uint112` type for `v`.
     */
    static uint112(v: BigNumberish): Typed {
        return n(v, 112);
    }

    /**
     * Return a new `uint120` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint120`.
     * @returns A new `uint120` type for `v`.
     */
    static uint120(v: BigNumberish): Typed {
        return n(v, 120);
    }

    /**
     * Return a new `uint128` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint128`.
     * @returns A new `uint128` type for `v`.
     */
    static uint128(v: BigNumberish): Typed {
        return n(v, 128);
    }

    /**
     * Return a new `uint136` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint136`.
     * @returns A new `uint136` type for `v`.
     */
    static uint136(v: BigNumberish): Typed {
        return n(v, 136);
    }

    /**
     * Return a new `uint144` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint144`.
     * @returns A new `uint144` type for `v`.
     */
    static uint144(v: BigNumberish): Typed {
        return n(v, 144);
    }

    /**
     * Return a new `uint152` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint152`.
     * @returns A new `uint152` type for `v`.
     */
    static uint152(v: BigNumberish): Typed {
        return n(v, 152);
    }

    /**
     * Return a new `uint160` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint160`.
     * @returns A new `uint160` type for `v`.
     */
    static uint160(v: BigNumberish): Typed {
        return n(v, 160);
    }

    /**
     * Return a new `uint168` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint168`.
     * @returns A new `uint168` type for `v`.
     */
    static uint168(v: BigNumberish): Typed {
        return n(v, 168);
    }

    /**
     * Return a new `uint176` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint176`.
     * @returns A new `uint176` type for `v`.
     */
    static uint176(v: BigNumberish): Typed {
        return n(v, 176);
    }

    /**
     * Return a new `uint184` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint184`.
     * @returns A new `uint184` type for `v`.
     */
    static uint184(v: BigNumberish): Typed {
        return n(v, 184);
    }

    /**
     * Return a new `uint192` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint192`.
     * @returns A new `uint192` type for `v`.
     */
    static uint192(v: BigNumberish): Typed {
        return n(v, 192);
    }

    /**
     * Return a new `uint200` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint200`.
     * @returns A new `uint200` type for `v`.
     */
    static uint200(v: BigNumberish): Typed {
        return n(v, 200);
    }

    /**
     * Return a new `uint208` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint208`.
     * @returns A new `uint208` type for `v`.
     */
    static uint208(v: BigNumberish): Typed {
        return n(v, 208);
    }

    /**
     * Return a new `uint216` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint216`.
     * @returns A new `uint216` type for `v`.
     */
    static uint216(v: BigNumberish): Typed {
        return n(v, 216);
    }

    /**
     * Return a new `uint224` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint224`.
     * @returns A new `uint224` type for `v`.
     */
    static uint224(v: BigNumberish): Typed {
        return n(v, 224);
    }

    /**
     * Return a new `uint232` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint232`.
     * @returns A new `uint232` type for `v`.
     */
    static uint232(v: BigNumberish): Typed {
        return n(v, 232);
    }

    /**
     * Return a new `uint240` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint240`.
     * @returns A new `uint240` type for `v`.
     */
    static uint240(v: BigNumberish): Typed {
        return n(v, 240);
    }

    /**
     * Return a new `uint248` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint248`.
     * @returns A new `uint248` type for `v`.
     */
    static uint248(v: BigNumberish): Typed {
        return n(v, 248);
    }

    /**
     * Return a new `uint256` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint256`.
     * @returns A new `uint256` type for `v`.
     */
    static uint256(v: BigNumberish): Typed {
        return n(v, 256);
    }

    /**
     * Return a new `uint256` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to a `uint256`.
     * @returns A new `uint256` type for `v`.
     */
    static uint(v: BigNumberish): Typed {
        return n(v, 256);
    }

    /**
     * Return a new `int8` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int8`.
     * @returns A new `int8` type for `v`.
     */
    static int8(v: BigNumberish): Typed {
        return n(v, -8);
    }

    /**
     * Return a new `int16` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int16`.
     * @returns A new `int16` type for `v`.
     */
    static int16(v: BigNumberish): Typed {
        return n(v, -16);
    }

    /**
     * Return a new `int24` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int24`.
     * @returns A new `int24` type for `v`.
     */
    static int24(v: BigNumberish): Typed {
        return n(v, -24);
    }

    /**
     * Return a new `int32` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int32`.
     * @returns A new `int32` type for `v`.
     */
    static int32(v: BigNumberish): Typed {
        return n(v, -32);
    }

    /**
     * Return a new `int40` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int40`.
     * @returns A new `int40` type for `v`.
     */
    static int40(v: BigNumberish): Typed {
        return n(v, -40);
    }

    /**
     * Return a new `int48` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int48`.
     * @returns A new `int48` type for `v`.
     */
    static int48(v: BigNumberish): Typed {
        return n(v, -48);
    }

    /**
     * Return a new `int56` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int56`.
     * @returns A new `int56` type for `v`.
     */
    static int56(v: BigNumberish): Typed {
        return n(v, -56);
    }

    /**
     * Return a new `int64` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int64`.
     * @returns A new `int64` type for `v`.
     */
    static int64(v: BigNumberish): Typed {
        return n(v, -64);
    }

    /**
     * Return a new `int72` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int72`.
     * @returns A new `int72` type for `v`.
     */
    static int72(v: BigNumberish): Typed {
        return n(v, -72);
    }

    /**
     * Return a new `int80` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int80`.
     * @returns A new `int80` type for `v`.
     */
    static int80(v: BigNumberish): Typed {
        return n(v, -80);
    }

    /**
     * Return a new `int88` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int88`.
     * @returns A new `int88` type for `v`.
     */
    static int88(v: BigNumberish): Typed {
        return n(v, -88);
    }

    /**
     * Return a new `int96` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int96`.
     * @returns A new `int96` type for `v`.
     */
    static int96(v: BigNumberish): Typed {
        return n(v, -96);
    }

    /**
     * Return a new `int104` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int104`.
     * @returns A new `int104` type for `v`.
     */
    static int104(v: BigNumberish): Typed {
        return n(v, -104);
    }

    /**
     * Return a new `int112` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int112`.
     * @returns A new `int112` type for `v`.
     */
    static int112(v: BigNumberish): Typed {
        return n(v, -112);
    }

    /**
     * Return a new `int120` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int120`.
     * @returns A new `int120` type for `v`.
     */
    static int120(v: BigNumberish): Typed {
        return n(v, -120);
    }

    /**
     * Return a new `int128` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int128`.
     * @returns A new `int128` type for `v`.
     */
    static int128(v: BigNumberish): Typed {
        return n(v, -128);
    }

    /**
     * Return a new `int136` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int136`.
     * @returns A new `int136` type for `v`.
     */
    static int136(v: BigNumberish): Typed {
        return n(v, -136);
    }

    /**
     * Return a new `int144` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int144`.
     * @returns A new `int144` type for `v`.
     */
    static int144(v: BigNumberish): Typed {
        return n(v, -144);
    }

    /**
     * Return a new `int152` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int152`.
     * @returns A new `int152` type for `v`.
     */
    static int152(v: BigNumberish): Typed {
        return n(v, -152);
    }

    /**
     * Return a new `int160` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int160`.
     * @returns A new `int160` type for `v`.
     */
    static int160(v: BigNumberish): Typed {
        return n(v, -160);
    }

    /**
     * Return a new `int168` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int168`.
     * @returns A new `int168` type for `v`.
     */
    static int168(v: BigNumberish): Typed {
        return n(v, -168);
    }

    /**
     * Return a new `int176` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int176`.
     * @returns A new `int176` type for `v`.
     */
    static int176(v: BigNumberish): Typed {
        return n(v, -176);
    }

    /**
     * Return a new `int184` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int184`.
     * @returns A new `int184` type for `v`.
     */
    static int184(v: BigNumberish): Typed {
        return n(v, -184);
    }

    /**
     * Return a new `int192` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int192`.
     * @returns A new `int192` type for `v`.
     */
    static int192(v: BigNumberish): Typed {
        return n(v, -192);
    }

    /**
     * Return a new `int200` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int200`.
     * @returns A new `int200` type for `v`.
     */
    static int200(v: BigNumberish): Typed {
        return n(v, -200);
    }

    /**
     * Return a new `int208` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int208`.
     * @returns A new `int208` type for `v`.
     */
    static int208(v: BigNumberish): Typed {
        return n(v, -208);
    }

    /**
     * Return a new `int216` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int216`.
     * @returns A new `int216` type for `v`.
     */
    static int216(v: BigNumberish): Typed {
        return n(v, -216);
    }

    /**
     * Return a new `int224` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int224`.
     * @returns A new `int224` type for `v`.
     */
    static int224(v: BigNumberish): Typed {
        return n(v, -224);
    }

    /**
     * Return a new `int232` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int232`.
     * @returns A new `int232` type for `v`.
     */
    static int232(v: BigNumberish): Typed {
        return n(v, -232);
    }

    /**
     * Return a new `int240` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int240`.
     * @returns A new `int240` type for `v`.
     */
    static int240(v: BigNumberish): Typed {
        return n(v, -240);
    }

    /**
     * Return a new `int248` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int248`.
     * @returns A new `int248` type for `v`.
     */
    static int248(v: BigNumberish): Typed {
        return n(v, -248);
    }

    /**
     * Return a new `int256` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int256`.
     * @returns A new `int256` type for `v`.
     */
    static int256(v: BigNumberish): Typed {
        return n(v, -256);
    }

    /**
     * Return a new `int256` type for `v`.
     *
     * @param {BigNumberish} v - The value to convert to an `int256`.
     * @returns A new `int256` type for `v`.
     */
    static int(v: BigNumberish): Typed {
        return n(v, -256);
    }

    /**
     * Return a new `bytes1` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes1`.
     * @returns A new `bytes1` type for `v`.
     */
    static bytes1(v: BytesLike): Typed {
        return b(v, 1);
    }

    /**
     * Return a new `bytes2` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes2`.
     * @returns A new `bytes2` type for `v`.
     */
    static bytes2(v: BytesLike): Typed {
        return b(v, 2);
    }

    /**
     * Return a new `bytes3` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes3`.
     * @returns A new `bytes3` type for `v`.
     */
    static bytes3(v: BytesLike): Typed {
        return b(v, 3);
    }

    /**
     * Return a new `bytes4` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes4`.
     * @returns A new `bytes4` type for `v`.
     */
    static bytes4(v: BytesLike): Typed {
        return b(v, 4);
    }

    /**
     * Return a new `bytes5` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes5`.
     * @returns A new `bytes5` type for `v`.
     */
    static bytes5(v: BytesLike): Typed {
        return b(v, 5);
    }

    /**
     * Return a new `bytes6` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes6`.
     * @returns A new `bytes6` type for `v`.
     */
    static bytes6(v: BytesLike): Typed {
        return b(v, 6);
    }

    /**
     * Return a new `bytes7` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes7`.
     * @returns A new `bytes7` type for `v`.
     */
    static bytes7(v: BytesLike): Typed {
        return b(v, 7);
    }

    /**
     * Return a new `bytes8` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes8`.
     * @returns A new `bytes8` type for `v`.
     */
    static bytes8(v: BytesLike): Typed {
        return b(v, 8);
    }

    /**
     * Return a new `bytes9` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes9`.
     * @returns A new `bytes9` type for `v`.
     */
    static bytes9(v: BytesLike): Typed {
        return b(v, 9);
    }

    /**
     * Return a new `bytes10` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes10`.
     * @returns A new `bytes10` type for `v`.
     */
    static bytes10(v: BytesLike): Typed {
        return b(v, 10);
    }

    /**
     * Return a new `bytes11` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes11`.
     * @returns A new `bytes11` type for `v`.
     */
    static bytes11(v: BytesLike): Typed {
        return b(v, 11);
    }

    /**
     * Return a new `bytes12` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes12`.
     * @returns A new `bytes12` type for `v`.
     */
    static bytes12(v: BytesLike): Typed {
        return b(v, 12);
    }

    /**
     * Return a new `bytes13` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes13`.
     * @returns A new `bytes13` type for `v`.
     */
    static bytes13(v: BytesLike): Typed {
        return b(v, 13);
    }

    /**
     * Return a new `bytes14` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes14`.
     * @returns A new `bytes14` type for `v`.
     */
    static bytes14(v: BytesLike): Typed {
        return b(v, 14);
    }

    /**
     * Return a new `bytes15` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes15`.
     * @returns A new `bytes15` type for `v`.
     */
    static bytes15(v: BytesLike): Typed {
        return b(v, 15);
    }

    /**
     * Return a new `bytes16` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes16`.
     * @returns A new `bytes16` type for `v`.
     */
    static bytes16(v: BytesLike): Typed {
        return b(v, 16);
    }

    /**
     * Return a new `bytes17` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes17`.
     * @returns A new `bytes17` type for `v`.
     */
    static bytes17(v: BytesLike): Typed {
        return b(v, 17);
    }

    /**
     * Return a new `bytes18` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes18`.
     * @returns A new `bytes18` type for `v`.
     */
    static bytes18(v: BytesLike): Typed {
        return b(v, 18);
    }

    /**
     * Return a new `bytes19` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes19`.
     * @returns A new `bytes19` type for `v`.
     */
    static bytes19(v: BytesLike): Typed {
        return b(v, 19);
    }

    /**
     * Return a new `bytes20` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes20`.
     * @returns A new `bytes20` type for `v`.
     */
    static bytes20(v: BytesLike): Typed {
        return b(v, 20);
    }

    /**
     * Return a new `bytes21` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes21`.
     * @returns A new `bytes21` type for `v`.
     */
    static bytes21(v: BytesLike): Typed {
        return b(v, 21);
    }

    /**
     * Return a new `bytes22` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes22`.
     * @returns A new `bytes22` type for `v`.
     */
    static bytes22(v: BytesLike): Typed {
        return b(v, 22);
    }

    /**
     * Return a new `bytes23` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes23`.
     * @returns A new `bytes23` type for `v`.
     */
    static bytes23(v: BytesLike): Typed {
        return b(v, 23);
    }

    /**
     * Return a new `bytes24` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes24`.
     * @returns A new `bytes24` type for `v`.
     */
    static bytes24(v: BytesLike): Typed {
        return b(v, 24);
    }

    /**
     * Return a new `bytes25` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes25`.
     * @returns A new `bytes25` type for `v`.
     */
    static bytes25(v: BytesLike): Typed {
        return b(v, 25);
    }

    /**
     * Return a new `bytes26` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes26`.
     * @returns A new `bytes26` type for `v`.
     */
    static bytes26(v: BytesLike): Typed {
        return b(v, 26);
    }

    /**
     * Return a new `bytes27` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes27`.
     * @returns A new `bytes27` type for `v`.
     */
    static bytes27(v: BytesLike): Typed {
        return b(v, 27);
    }

    /**
     * Return a new `bytes28` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes28`.
     * @returns A new `bytes28` type for `v`.
     */
    static bytes28(v: BytesLike): Typed {
        return b(v, 28);
    }

    /**
     * Return a new `bytes29` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes29`.
     * @returns A new `bytes29` type for `v`.
     */
    static bytes29(v: BytesLike): Typed {
        return b(v, 29);
    }

    /**
     * Return a new `bytes30` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes30`.
     * @returns A new `bytes30` type for `v`.
     */
    static bytes30(v: BytesLike): Typed {
        return b(v, 30);
    }

    /**
     * Return a new `bytes31` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes31`.
     * @returns A new `bytes31` type for `v`.
     */
    static bytes31(v: BytesLike): Typed {
        return b(v, 31);
    }

    /**
     * Return a new `bytes32` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes32`.
     * @returns A new `bytes32` type for `v`.
     */
    static bytes32(v: BytesLike): Typed {
        return b(v, 32);
    }

    /**
     * Return a new `address` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to an `address`.
     * @returns A new `address` type for `v`.
     */
    static address(v: string | Addressable): Typed {
        return new Typed(_guard, 'address', v);
    }

    /**
     * Return a new `bool` type for `v`.
     *
     * @param {any} v - The value to convert to a `bool`.
     * @returns A new `bool` type for `v`.
     */
    static bool(v: any): Typed {
        return new Typed(_guard, 'bool', !!v);
    }

    /**
     * Return a new `bytes` type for `v`.
     *
     * @param {BytesLike} v - The value to convert to a `bytes`.
     * @returns A new `bytes` type for `v`.
     */
    static bytes(v: BytesLike): Typed {
        return new Typed(_guard, 'bytes', v);
    }

    /**
     * Return a new `string` type for `v`.
     *
     * @param {string} v - The value to convert to a `string`.
     * @returns A new `string` type for `v`.
     */
    static string(v: string): Typed {
        return new Typed(_guard, 'string', v);
    }

    /**
     * Return a new `array` type for v, allowing dynamic length.
     *
     * @param {(any | Typed)[]} v - The value to convert to an `array`.
     * @param {null | boolean} dynamic - Whether the array is dynamic.
     * @returns A new `array` type for `v`.
     */
    static array(v: Array<any | Typed>, dynamic?: null | boolean): Typed {
        throw new Error('not implemented yet');
        return new Typed(_guard, 'array', v, dynamic);
    }

    /**
     * Return a new `tuple` type for v, with the optional name.
     *
     * @param {(any | Typed)[]} v - The value to convert to a `tuple`.
     * @param {string} name - The name of the tuple.
     * @returns A new `tuple` type for `v`.
     */
    static tuple(v: Array<any | Typed> | Record<string, any | Typed>, name?: string): Typed {
        throw new Error('not implemented yet');
        return new Typed(_guard, 'tuple', v, name);
    }

    /**
     * Return a new `overrides` type with the provided properties.
     *
     * @param {Record<string, any>} v - A record containing the properties to be included in the `overrides` type.
     * @returns A new `overrides` type with the given properties.
     */
    static overrides(v: Record<string, any>): Typed {
        return new Typed(_guard, 'overrides', Object.assign({}, v));
    }

    /**
     * Returns true only if `value` is a {@link Typed | **Typed**} instance.
     *
     * @param {any} value - The value to check.
     * @returns {boolean} True if `value` is a {@link Typed | **Typed**} instance.
     */
    static isTyped(value: any): value is Typed {
        return value && typeof value === 'object' && '_typedSymbol' in value && value._typedSymbol === _typedSymbol;
    }

    /**
     * If the value is a {@link Typed | **Typed**} instance, validates the underlying value and returns it, otherwise
     * returns value directly.
     *
     * This is useful for functions that with to accept either a {@link Typed | **Typed**} object or values.
     *
     * @param {Typed | T} value - The value to dereference.
     * @param {string} type - The dereferenced value.
     */
    static dereference<T>(value: Typed | T, type: string): T {
        if (Typed.isTyped(value)) {
            if (value.type !== type) {
                throw new Error(`invalid type: expected ${type}, got ${value.type}`);
            }
            return value.value;
        }
        return value;
    }
}
