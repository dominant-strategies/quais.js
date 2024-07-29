import { validateAddress } from '../address/index.js';
import { getBigInt } from '../utils/index.js';
import type { BigNumberish } from '../utils/index.js';

/**
 * Represents an a spendable transaction outpoint.
 *
 * @ignore
 * @category Transaction
 */
export type Outpoint = {
    txhash: string;
    index: number;
    denomination: number;
};

/**
 * Represents a UTXO entry.
 *
 * @ignore
 * @category Transaction
 */
export interface UTXOEntry {
    denomination: null | bigint;
    address: string;
}

/**
 * Represents a UTXO-like object.
 *
 * @ignore
 * @category Transaction
 */
export interface UTXOLike extends UTXOEntry {
    txhash?: null | string;
    index?: null | number;
}

/**
 * Represents a Qi transaction input.
 *
 * @category Transaction
 */
export type TxInput = {
    txhash: string;
    index: number;
    pubkey: string;
};

/**
 * Represents a Qi transaction output.
 *
 * @category Transaction
 */
export type TxOutput = {
    address: string;
    denomination: number;
};

/**
 * List of supported Qi denominations.
 *
 * @category Transaction
 */
export const denominations: bigint[] = [
    BigInt(1), // 0.001 Qi
    BigInt(5), // 0.005 Qi
    BigInt(10), // 0.01 Qi
    BigInt(50), // 0.05 Qi
    BigInt(100), // 0.1 Qi
    BigInt(250), // 0.25 Qi
    BigInt(500), // 0.5 Qi
    BigInt(1000), // 1 Qi
    BigInt(5000), // 5 Qi
    BigInt(10000), // 10 Qi
    BigInt(20000), // 20 Qi
    BigInt(50000), // 50 Qi
    BigInt(100000), // 100 Qi
    BigInt(1000000), // 1000 Qi
    BigInt(10000000), // 10000 Qi
    BigInt(100000000), // 100000 Qi
    BigInt(1000000000), // 1000000 Qi
];

/**
 * Checks if the provided denomination is valid.
 *
 * @category Transaction
 * @param {bigint} denomination - The denomination to check.
 * @returns {boolean} True if the denomination is valid, false otherwise.
 */
function isValidDenomination(denomination: bigint): boolean {
    return denominations.includes(denomination);
}

/**
 * Handles conversion of string to bigint, specifically for transaction parameters.
 *
 * @ignore
 * @category Transaction
 * @param {string} value - The value to convert.
 * @param {string} param - The parameter name.
 * @returns {bigint} The converted value.
 */
function handleBigInt(value: string, param: string): bigint {
    if (value === '0x') {
        return BigInt(0);
    }
    return getBigInt(value, param);
}

/**
 * Given a value, returns an array of supported denominations that sum to the value.
 *
 * @category Transaction
 * @param {bigint} value - The value to denominate.
 * @returns {bigint[]} An array of denominations that sum to the value.
 * @throws {Error} If the value is less than or equal to 0 or cannot be matched with available denominations.
 */
export function denominate(value: bigint): bigint[] {
    if (value <= BigInt(0)) {
        throw new Error('Value must be greater than 0');
    }

    const result: bigint[] = [];
    let remainingValue = value;

    // Iterate through denominations in descending order
    for (let i = denominations.length - 1; i >= 0; i--) {
        const denomination = denominations[i];

        // Add the denomination to the result array as many times as possible
        while (remainingValue >= denomination) {
            result.push(denomination);
            remainingValue -= denomination;
        }
    }

    if (remainingValue > 0) {
        throw new Error('Unable to match the value with available denominations');
    }

    return result;
}

/**
 * Represents a UTXO (Unspent Transaction Output).
 *
 * @category Transaction
 * @implements {UTXOLike}
 */
export class UTXO implements UTXOLike {
    #txhash: null | string;
    #index: null | number;
    #address: null | string;
    #denomination: null | bigint;

    /**
     * Gets the transaction hash.
     *
     * @returns {null | string} The transaction hash.
     */
    get txhash(): null | string {
        return this.#txhash;
    }

    /**
     * Sets the transaction hash.
     *
     * @param {null | string} value - The transaction hash.
     */
    set txhash(value: null | string) {
        this.#txhash = value;
    }

    /**
     * Gets the index.
     *
     * @returns {null | number} The index.
     */
    get index(): null | number {
        return this.#index;
    }

    /**
     * Sets the index.
     *
     * @param {null | number} value - The index.
     */
    set index(value: null | number) {
        this.#index = value;
    }

    /**
     * Gets the address.
     *
     * @returns {string} The address.
     */
    get address(): string {
        return this.#address || '';
    }

    /**
     * Sets the address.
     *
     * @param {string} value - The address.
     * @throws {Error} If the address is invalid.
     */
    set address(value: string) {
        validateAddress(value);
        this.#address = value;
    }

    /**
     * Gets the denomination.
     *
     * @returns {null | bigint} The denomination.
     */
    get denomination(): null | bigint {
        return this.#denomination;
    }

    /**
     * Sets the denomination.
     *
     * @param {null | BigNumberish} value - The denomination.
     * @throws {Error} If the denomination value is invalid.
     */
    set denomination(value: null | BigNumberish) {
        if (value == null) {
            this.#denomination = null;
            return;
        }

        const denominationBigInt = handleBigInt(value.toString(), 'denomination');
        if (!isValidDenomination(denominationBigInt)) {
            throw new Error('Invalid denomination value');
        }

        this.#denomination = denominationBigInt;
    }

    /**
     * Constructs a new UTXO instance with null properties.
     */
    constructor() {
        this.#txhash = null;
        this.#index = null;
        this.#address = null;
        this.#denomination = null;
    }

    /**
     * Converts the UTXO instance to a JSON object.
     *
     * @returns {any} A JSON representation of the UTXO instance.
     */
    toJSON(): any {
        return {
            txhash: this.txhash,
            index: this.index,
            address: this.address,
            denomination: this.denomination,
        };
    }

    /**
     * Creates a UTXO instance from a UTXOLike object.
     *
     * @param {UTXOLike} utxo - The UTXOLike object to convert.
     * @returns {UTXO} The UTXO instance.
     */
    static from(utxo: UTXOLike): UTXO {
        if (utxo === null) {
            return new UTXO();
        }

        const result = utxo instanceof UTXO ? utxo : new UTXO();
        if (utxo.txhash != null) {
            result.txhash = utxo.txhash;
        }
        if (utxo.index != null) {
            result.index = utxo.index;
        }
        if (utxo.address != null && utxo.address !== '') {
            result.address = utxo.address;
        }
        if (utxo.denomination != null) {
            result.denomination = utxo.denomination;
        }

        return result;
    }
}
