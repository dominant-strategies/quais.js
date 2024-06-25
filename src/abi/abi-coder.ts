/**
 * When sending values to or receiving values from a [Contract](../classes/Contract), the data is generally encoded
 * using the [ABI
 * Specification](https://docs.soliditylang.org/en/v0.8.19/abi-spec.html#formal-specification-of-the-encoding).
 *
 * The AbiCoder provides a utility to encode values to ABI data and decode values from ABI data.
 *
 * Most of the time, developers should favor the [Contract](../classes/Contract) class, which further abstracts the
 * finer details of ABI data.
 *
 * @category Application Binary Interface
 */

import { assertArgumentCount, assertArgument } from '../utils/index.js';

import { Coder, Reader, Result, Writer } from './coders/abstract-coder.js';
import { AddressCoder } from './coders/address.js';
import { ArrayCoder } from './coders/array.js';
import { BooleanCoder } from './coders/boolean.js';
import { BytesCoder } from './coders/bytes.js';
import { FixedBytesCoder } from './coders/fixed-bytes.js';
import { NullCoder } from './coders/null.js';
import { NumberCoder } from './coders/number.js';
import { StringCoder } from './coders/string.js';
import { TupleCoder } from './coders/tuple.js';
import { ParamType } from './fragments.js';

import { getAddress } from '../address/index.js';
import { getBytes, hexlify, makeError } from '../utils/index.js';

import type { BytesLike, CallExceptionAction, CallExceptionError, CallExceptionTransaction } from '../utils/index.js';

// https://docs.soliditylang.org/en/v0.8.17/control-structures.html
const PanicReasons: Map<number, string> = new Map();
PanicReasons.set(0x00, 'GENERIC_PANIC');
PanicReasons.set(0x01, 'ASSERT_FALSE');
PanicReasons.set(0x11, 'OVERFLOW');
PanicReasons.set(0x12, 'DIVIDE_BY_ZERO');
PanicReasons.set(0x21, 'ENUM_RANGE_ERROR');
PanicReasons.set(0x22, 'BAD_STORAGE_DATA');
PanicReasons.set(0x31, 'STACK_UNDERFLOW');
PanicReasons.set(0x32, 'ARRAY_RANGE_ERROR');
PanicReasons.set(0x41, 'OUT_OF_MEMORY');
PanicReasons.set(0x51, 'UNINITIALIZED_FUNCTION_CALL');

const paramTypeBytes = new RegExp(/^bytes([0-9]*)$/);
const paramTypeNumber = new RegExp(/^(u?int)([0-9]*)$/);

let defaultCoder: null | AbiCoder = null;
let defaultMaxInflation = 1024;

function getBuiltinCallException(
    action: CallExceptionAction,
    tx: { to?: null | string; from?: null | string; data?: string },
    data: null | BytesLike,
    abiCoder: AbiCoder,
): CallExceptionError {
    let message = 'missing revert data';

    let reason: null | string = null;
    const invocation = null;
    let revert: null | { signature: string; name: string; args: Array<any> } = null;

    if (data) {
        message = 'execution reverted';

        const bytes = getBytes(data);
        data = hexlify(data);

        if (bytes.length === 0) {
            message += ' (no data present; likely require(false) occurred';
            reason = 'require(false)';
        } else if (bytes.length % 32 !== 4) {
            message += ' (could not decode reason; invalid data length)';
        } else if (hexlify(bytes.slice(0, 4)) === '0x08c379a0') {
            // Error(string)
            try {
                reason = abiCoder.decode(['string'], bytes.slice(4))[0];
                revert = {
                    signature: 'Error(string)',
                    name: 'Error',
                    args: [reason],
                };
                message += `: ${JSON.stringify(reason)}`;
            } catch (error) {
                message += ' (could not decode reason; invalid string data)';
            }
        } else if (hexlify(bytes.slice(0, 4)) === '0x4e487b71') {
            // Panic(uint256)
            try {
                const code = Number(abiCoder.decode(['uint256'], bytes.slice(4))[0]);
                revert = {
                    signature: 'Panic(uint256)',
                    name: 'Panic',
                    args: [code],
                };
                reason = `Panic due to ${PanicReasons.get(code) || 'UNKNOWN'}(${code})`;
                message += `: ${reason}`;
            } catch (error) {
                message += ' (could not decode panic code)';
            }
        } else {
            message += ' (unknown custom error)';
        }
    }

    const transaction: CallExceptionTransaction = {
        to: tx.to ? getAddress(tx.to) : null,
        data: tx.data || '0x',
    };
    if (tx.from) {
        transaction.from = getAddress(tx.from);
    }

    return makeError(message, 'CALL_EXCEPTION', {
        action,
        data,
        reason,
        transaction,
        invocation,
        revert,
    });
}

/**
 * The **AbiCoder** is a low-level class responsible for encoding JavaScript values into binary data and decoding binary
 * data into JavaScript values.
 *
 * @category Application Binary Interface
 */
export class AbiCoder {
    #getCoder(param: ParamType): Coder {
        if (param.isArray()) {
            return new ArrayCoder(this.#getCoder(param.arrayChildren), param.arrayLength, param.name);
        }

        if (param.isTuple()) {
            return new TupleCoder(
                param.components.map((c) => this.#getCoder(c)),
                param.name,
            );
        }

        switch (param.baseType) {
            case 'address':
                return new AddressCoder(param.name);
            case 'bool':
                return new BooleanCoder(param.name);
            case 'string':
                return new StringCoder(param.name);
            case 'bytes':
                return new BytesCoder(param.name);
            case '':
                return new NullCoder(param.name);
        }

        // u?int[0-9]*
        let match = param.type.match(paramTypeNumber);
        if (match) {
            const size = parseInt(match[2] || '256');
            assertArgument(
                size !== 0 && size <= 256 && size % 8 === 0,
                'invalid ' + match[1] + ' bit length',
                'param',
                param,
            );
            return new NumberCoder(size / 8, match[1] === 'int', param.name);
        }

        // bytes[0-9]+
        match = param.type.match(paramTypeBytes);
        if (match) {
            const size = parseInt(match[1]);
            assertArgument(size !== 0 && size <= 32, 'invalid bytes length', 'param', param);
            return new FixedBytesCoder(size, param.name);
        }

        assertArgument(false, 'invalid type', 'type', param.type);
    }

    /**
     * Get the default values for the given types. For example, a `uint` is by default `0` and `bool` is by default
     * `false`.
     *
     * @param {(string | ParamType)[]} types - Array of parameter types to get default values for.
     * @returns {Result} The default values corresponding to the given types.
     */
    getDefaultValue(types: ReadonlyArray<string | ParamType>): Result {
        const coders: Array<Coder> = types.map((type) => this.#getCoder(ParamType.from(type)));
        const coder = new TupleCoder(coders, '_');
        return coder.defaultValue();
    }

    /**
     * Encode the values as the specified types into ABI data.
     *
     * @param {(string | ParamType)[]} types - Array of parameter types.
     * @param {any[]} values - Array of values to encode.
     * @returns {string} The encoded data in hexadecimal format.
     */
    encode(types: ReadonlyArray<string | ParamType>, values: ReadonlyArray<any>): string {
        assertArgumentCount(values.length, types.length, 'types/values length mismatch');

        const coders = types.map((type) => this.#getCoder(ParamType.from(type)));
        const coder = new TupleCoder(coders, '_');

        const writer = new Writer();
        coder.encode(writer, values);
        return writer.data;
    }

    /**
     * Decode the ABI data as the types into values.
     *
     * If loose decoding is enabled, then strict padding is not enforced. Some older versions of Solidity incorrectly
     * padded event data emitted from `external` functions.
     *
     * @param {(string | ParamType)[]} types - Array of parameter types.
     * @param {BytesLike} data - The ABI data to decode.
     * @param {boolean} [loose=false] - Enable loose decoding. Default is `false`
     * @returns {Result} The decoded values.
     */
    decode(types: ReadonlyArray<string | ParamType>, data: BytesLike, loose?: boolean): Result {
        const coders: Array<Coder> = types.map((type) => this.#getCoder(ParamType.from(type)));
        const coder = new TupleCoder(coders, '_');
        return coder.decode(new Reader(data, loose, defaultMaxInflation));
    }

    /**
     * Set the default maximum inflation factor.
     *
     * @ignore
     * @param {number} value - The new inflation factor.
     */
    static _setDefaultMaxInflation(value: number): void {
        assertArgument(
            typeof value === 'number' && Number.isInteger(value),
            'invalid defaultMaxInflation factor',
            'value',
            value,
        );
        defaultMaxInflation = value;
    }

    /**
     * Returns the shared singleton instance of a default {@link AbiCoder | **AbiCoder**}.
     *
     * On the first call, the instance is created internally.
     *
     * @returns {AbiCoder} The default ABI coder instance.
     */
    static defaultAbiCoder(): AbiCoder {
        if (defaultCoder == null) {
            defaultCoder = new AbiCoder();
        }
        return defaultCoder;
    }

    /**
     * Returns a quais-compatible {@link CallExceptionError | **CallExceptionError**} for the given result data.
     *
     * @param {CallExceptionAction} action - The action that triggered the exception.
     * @param {Object} tx - The transaction information.
     * @param {BytesLike | null} data - The data associated with the call exception.
     * @returns {CallExceptionError} The corresponding call exception error.
     */
    static getBuiltinCallException(
        action: CallExceptionAction,
        tx: { to?: null | string; from?: null | string; data?: string },
        data: null | BytesLike,
    ): CallExceptionError {
        return getBuiltinCallException(action, tx, data, AbiCoder.defaultAbiCoder());
    }
}
