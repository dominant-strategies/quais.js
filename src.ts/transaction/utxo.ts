import { getAddress } from "../address/index.js";
import { getBigInt } from "../utils/index.js";
import type { BigNumberish } from "../utils/index.js";

/**
 *  @TODO write documentation for this type.
 *  @TODO if not used, replace with `ignore`
 * 
 *  @category Transaction
 */
export type Outpoint = {
    Txhash: string;
    Index: number;
    Denomination: number;
};

/**
 *  @TODO write documentation for this type.
 *  @TODO if not used, replace with `ignore`
 * 
 *  @category Transaction
 */
export type UTXOTransactionInput = {
    previousOutPoint: Outpoint;
    pubKey: Uint8Array;
};

/**
 *  @TODO write documentation for this type.
 *  @TODO if not used, replace with `ignore`
 * 
 *  @category Transaction
 */
export interface UTXOEntry extends UTXOEntryLike{
    denomination: null | bigint;
    address: string;
};

/**
 *  @TODO write documentation for this type.
 *  @TODO if not used, replace with `ignore`
 * 
 *  @category Transaction
 */
export interface UTXOEntryLike {
    denomination: null | BigNumberish;
    address: null | string;
}

/**
 *  @TODO write documentation for this type.
 *  @TODO if not used, replace with `ignore`
 * 
 *  @category Transaction
 */
export type UTXOTransactionOutputLike = UTXOEntryLike;

/**
 *  @TODO write documentation for this type.
 *  @TODO if not used, replace with `ignore`
 * 
 *  @category Transaction
 */
export type UTXOTransactionOutput = UTXOEntry;

/**
 *  @TODO write documentation for this type.
 *  @TODO if not used, replace with `ignore`
 * 
 *  @category Transaction
 */
export type TxOutput = {
    address: Uint8Array;
    denomination: number;
};

/**
 *  @TODO write documentation for this type.
 *  @TODO if not used, replace with `ignore`
 * 
 *  @category Transaction
 */
export type TxInput = {
    previous_out_point: {
        hash: {
            value: Uint8Array;
        };  
        index: number;
    };
    pub_key: Uint8Array;  
};

/**
 *  @TODO write documentation for this type.
 *  @TODO if not used, replace with `ignore`
 * 
 *  @category Transaction
 */
export interface UTXOEntry {
    denomination: null | bigint;
    address: string;
};

/**
 *  @TODO write documentation for this type.
 *  @TODO if not used, replace with `ignore`
 * 
 *  @category Transaction
 */
export interface UTXOLike extends UTXOEntry {
    txhash?: null | string;
    index?: null | number;
}

/**
 *  @TODO write documentation for this type.
 *  @TODO if not used, replace with `ignore`
 * 
 *  @category Transaction
 */
export const denominations: bigint[] = [
    BigInt(1),           // 0.001 Qi
    BigInt(5),           // 0.005 Qi
    BigInt(10),          // 0.01 Qi
    BigInt(50),          // 0.05 Qi
    BigInt(100),         // 0.1 Qi
    BigInt(250),         // 0.25 Qi
    BigInt(500),         // 0.5 Qi
    BigInt(1000),        // 1 Qi
    BigInt(5000),        // 5 Qi
    BigInt(10000),       // 10 Qi
    BigInt(20000),       // 20 Qi 
    BigInt(50000),       // 50 Qi
    BigInt(100000),      // 100 Qi
    BigInt(1000000),     // 1000 Qi
    BigInt(10000000),    // 10000 Qi
    BigInt(100000000),   // 100000 Qi
    BigInt(1000000000),  // 1000000 Qi
];

/**
 *  Checks if the provided denomination is valid.
 *  
 *  @param {bigint} denomination - The denomination to check.
 *  @returns {boolean} True if the denomination is valid, false otherwise.
 *  
 *  @category Transaction
 */
function isValidDenomination(denomination: bigint): boolean {
    return denominations.includes(denomination);
}

/**
 *  Handles conversion of string to bigint, specifically for transaction parameters.
 * 
 *  @param {string} value - The value to convert.
 *  @param {string} param - The parameter name.
 *  @returns {bigint} The converted value.
 *  
 *  @category Transaction
 */
function handleBigInt(value: string, param: string): bigint {
    if (value === "0x") { return BigInt(0); }
    return getBigInt(value, param);
}

/**
 *  Given a value, returns an array of supported denominations that sum to the value.
 *  @param {bigint} value - The value to denominate.
 *  @returns {bigint[]} An array of denominations that sum to the value.
 *  
 *  @category Transaction
 */
export function denominate(value: bigint): bigint[] {
    if (value <= BigInt(0)) {
        throw new Error("Value must be greater than 0");
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
        throw new Error("Unable to match the value with available denominations");
    }



    return result;
}

/**
 *  @TODO write documentation for this type.
 *  @TODO if not used, replace with `ignore`
 * 
 *  @category Transaction
 */ 
export class UTXO implements UTXOLike {
    #txhash: null | string;
    #index: null | number;
    #address: null | string;
    #denomination: null | bigint;

    get txhash(): null | string { return this.#txhash; }
    set txhash(value: null | string) {
        this.#txhash = value;
    }

    get index(): null | number { return this.#index; }
    set index(value: null | number) {
        this.#index = value;
    }

    get address(): string { return this.#address || ""; }
    set address(value: string) {
        this.#address = getAddress(value);
    }

    get denomination(): null | bigint { return this.#denomination; }
    set denomination(value: null | BigNumberish) {
        if (value == null) {
            this.#denomination = null;
            return;
        }

        const denominationBigInt = handleBigInt(value.toString(), "denomination");
        if (!isValidDenomination(denominationBigInt)) {
            throw new Error("Invalid denomination value");
        }

        this.#denomination = denominationBigInt;
    }

    /**
     *  Constructs a new UTXO instance with null properties.
     */
    constructor() {
        this.#txhash = null;
        this.#index = null;
        this.#address = null;
        this.#denomination = null;
    }

    /**
     *  Converts the UTXO instance to a JSON object.
     * 
     *  @returns {any} A JSON representation of the UTXO instance.
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
     *  Creates a UTXO instance from a UTXOLike object.
     *  
     *  @param {UTXOLike} utxo - The UTXOLike object to convert.
     *  @returns {UTXO} The UTXO instance.
     */
    static from(utxo: UTXOLike): UTXO {
        if (utxo === null) { return new UTXO(); }

        const result = utxo instanceof UTXO ? utxo : new UTXO();
        if (utxo.txhash != null) { result.txhash = utxo.txhash; }
        if (utxo.index != null) { result.index = utxo.index; }
        if (utxo.address != null) { result.address = utxo.address; }
        if (utxo.denomination != null) { result.denomination = utxo.denomination; }

        return result;
    }
}
