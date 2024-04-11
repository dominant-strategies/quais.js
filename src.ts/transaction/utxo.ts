import { getAddress } from "../address/index";
import { getBigInt } from "../utils/index";
import type { BigNumberish } from "../utils/index";

export type Outpoint = {
    Txhash: string;
    Index: number;
    Denomination: number;
};

export type UTXOTransactionInput = {
    previousOutPoint: Outpoint;
    pubKey: Uint8Array;
};

export interface UTXOEntry {
    denomination: null | bigint;
    address: null | string;
};

export type UTXOTransactionOutput = UTXOEntry;

export type UTXOTransaction = {
    chainId: bigint;
    inputs: UTXOTransactionInput[];
    outputs: UTXOTransactionOutput[];
    signature?: Uint8Array;
};

export interface UTXOLike extends UTXOEntry {
    txhash?: null | string;
    index?: null | number;
}

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
 * Checks if the provided denomination is valid.
 * @param denomination The denomination to check.
 * @returns True if the denomination is valid, false otherwise.
 */
function isValidDenomination(denomination: bigint): boolean {
    return denominations.includes(denomination);
}

/**
 * Handles conversion of string to bigint, specifically for transaction parameters.
 * @param value The string value to convert.
 * @param param The parameter name for error context.
 * @returns The bigint representation of the input string.
 */
function handleBigInt(value: string, param: string): bigint {
    if (value === "0x") { return BigInt(0); }
    return getBigInt(value, param);
}

/**
 * Given a value, returns an array of supported denominations that sum to the value.
 * @param value The value to denominate.
 * @returns Array of supported denominations that sum to the value.
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

    get address(): null | string { return this.#address; }
    set address(value: null | string) {
        this.#address = (value == null) ? null : getAddress(value);
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
     * @returns A JSON representation of the UTXO instance.
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
     * @param utxo The UTXOLike object to create the UTXO instance from.
     * @returns A new UTXO instance.
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
