import { validateAddress } from '../address/index.js';

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
    lock?: number;
};

/**
 * Represents a UTXO entry.
 *
 * @ignore
 * @category Transaction
 */
export interface UTXOEntry {
    denomination: null | number;
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
    lock?: string;
};

type PreviousOutpointJson = {
    txHash: string;
    index: string;
};

export type TxInputJson = {
    previousOutpoint: PreviousOutpointJson;
    pubkey: string;
};

export type TxOutputJson = {
    address: string;
    denomination: string;
    lock?: string;
};

export interface OutpointDeltas {
    [address: string]: {
        created: Outpoint[];
        deleted: Outpoint[];
    };
}

/**
 * List of supported Qi denominations.
 *
 * @category Transaction
 */
export const denominations: bigint[] = [
    BigInt(1), // 0.001 Qi (1 Qit)
    BigInt(5), // 0.005 Qi (5 Qit)
    BigInt(10), // 0.01 Qi (10 Qit)
    BigInt(50), // 0.05 Qi (50 Qit)
    BigInt(100), // 0.1 Qi (100 Qit)
    BigInt(500), // 0.5 Qi (500 Qit)
    BigInt(1000), // 1 Qi (1000 Qit)
    BigInt(5000), // 5 Qi (5000 Qit)
    BigInt(10000), // 10 Qi (10000 Qit)
    BigInt(20000), // 20 Qi (20000 Qit)
    BigInt(100000), // 100 Qi (100000 Qit)
    BigInt(1000000), // 1,000 Qi (1,000,000 Qit)
    BigInt(10000000), // 10,000 Qi (10,000,000 Qit)
    BigInt(100000000), // 100,000 Qi (100,000,000 Qit)
    BigInt(1000000000), // 1,000,000 Qi (1,000,000,000 Qit)
];

/**
 * Checks if the provided denomination index is valid.
 *
 * @category Transaction
 * @param {number} index - The denomination index to check.
 * @returns {boolean} True if the denomination index is valid, false otherwise.
 */
function isValidDenominationIndex(index: number): boolean {
    return index >= 0 && index < denominations.length;
}

/**
 * Given a value, returns an array of supported denominations that sum to the value.
 *
 * @category Transaction
 * @param {bigint} value - The value to denominate.
 * @returns {bigint[]} An array of denominations that sum to the value.
 * @throws {Error} If the value is less than or equal to 0 or cannot be matched with available denominations.
 */
export function denominate(value: bigint, maxDenomination?: bigint): bigint[] {
    if (value <= BigInt(0)) {
        throw new Error('Value must be greater than 0');
    }

    const result: bigint[] = [];
    let remainingValue = BigInt(value);

    // Find the index of the maximum allowed denomination
    let maxDenominationIndex: number;
    if (maxDenomination != null) {
        maxDenominationIndex = denominations.findIndex((d) => d === maxDenomination);
        if (maxDenominationIndex === -1) {
            throw new Error('Invalid maximum denomination');
        }
    } else {
        // No maximum denomination set, use the highest denomination
        maxDenominationIndex = denominations.length - 1;
    }

    // Iterate through denominations in descending order, up to the maximum allowed denomination
    for (let i = maxDenominationIndex; i >= 0; i--) {
        const denomination = denominations[i];

        // Add the denomination to the result array as many times as possible
        while (remainingValue >= denomination) {
            result.push(denomination);
            remainingValue -= BigInt(denomination);
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
    #denomination: null | number;
    #lock: null | number;

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
     * @returns {null | number} The denomination.
     */
    get denomination(): null | number {
        return this.#denomination;
    }

    /**
     * Sets the denomination.
     *
     * @param {null | number} value - The denomination.
     * @throws {Error} If the denomination value is invalid.
     */
    set denomination(value: null | number) {
        if (value == null) {
            this.#denomination = null;
            return;
        }

        if (!isValidDenominationIndex(value)) {
            throw new Error('Invalid denomination value');
        }

        this.#denomination = value;
    }

    get lock(): null | number {
        return this.#lock;
    }

    set lock(value: null | number) {
        this.#lock = value;
    }

    /**
     * Constructs a new UTXO instance with null properties.
     */
    constructor() {
        this.#txhash = null;
        this.#index = null;
        this.#address = null;
        this.#denomination = null;
        this.#lock = null;
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
