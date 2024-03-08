import { getAddress } from "../address/index";
import { getBigInt } from "../utils/index";
;
export const denominations = [
    BigInt(1),
    BigInt(5),
    BigInt(10),
    BigInt(50),
    BigInt(100),
    BigInt(250),
    BigInt(500),
    BigInt(1000),
    BigInt(5000),
    BigInt(10000),
    BigInt(20000),
    BigInt(50000),
    BigInt(100000),
    BigInt(1000000),
    BigInt(10000000),
    BigInt(100000000),
    BigInt(1000000000), // 1000000 Qi
];
/**
 * Checks if the provided denomination is valid.
 * @param denomination The denomination to check.
 * @returns True if the denomination is valid, false otherwise.
 */
function isValidDenomination(denomination) {
    return denominations.includes(denomination);
}
/**
 * Handles conversion of string to bigint, specifically for transaction parameters.
 * @param value The string value to convert.
 * @param param The parameter name for error context.
 * @returns The bigint representation of the input string.
 */
function handleBigInt(value, param) {
    if (value === "0x") {
        return BigInt(0);
    }
    return getBigInt(value, param);
}
/**
 * Given a value, returns an array of supported denominations that sum to the value.
 * @param value The value to denominate.
 * @returns Array of supported denominations that sum to the value.
 */
export function denominate(value) {
    if (value <= BigInt(0)) {
        throw new Error("Value must be greater than 0");
    }
    const result = [];
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
export class UTXO {
    #txhash;
    #index;
    #address;
    #denomination;
    get txhash() { return this.#txhash; }
    set txhash(value) {
        this.#txhash = value;
    }
    get index() { return this.#index; }
    set index(value) {
        this.#index = value;
    }
    get address() { return this.#address; }
    set address(value) {
        this.#address = (value == null) ? null : getAddress(value);
    }
    get denomination() { return this.#denomination; }
    set denomination(value) {
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
    toJSON() {
        return {
            txhash: this.txhash,
            index: this.index,
            address: this.address,
            denomination: this.denomination ? this.denomination.toString() : null,
        };
    }
    /**
     * Creates a UTXO instance from a UTXOLike object.
     * @param utxo The UTXOLike object to create the UTXO instance from.
     * @returns A new UTXO instance.
     */
    static from(utxo) {
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
        if (utxo.address != null) {
            result.address = utxo.address;
        }
        if (utxo.denomination != null) {
            result.denomination = utxo.denomination;
        }
        return result;
    }
}
//# sourceMappingURL=utxo.js.map