import { getAddress } from "../address/index.js";
import { getBigInt } from "../utils/index.js";
import type { BigNumberish } from "../utils/index.js";
import { bigIntAbs } from "../utils/maths.js";

type OutPoint = {
    txhash: string;
    index: number;
};

type UTXOTransactionInput = {
    previousOutPoint: OutPoint;
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

export type SpendTarget = {
    address: string;
    value: bigint;
};

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
            denomination: this.denomination ? this.denomination.toString() : null,
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

type SelectedCoinsResult = {
    inputs: UTXO[];
    spendOutputs: UTXO[];
    changeOutputs: UTXO[];
};

/**
 * The CoinSelector class is used to select available UTXOs for
 * spending and to properly handle spend and change outputs.
 */
export class CoinSelector {
    #availableUXTOs: UTXO[];
    #spendOutputs: UTXO[];
    #changeOutputs: UTXO[];

    get availableUXTOs(): UTXO[] { return this.#availableUXTOs; }
    set availableUXTOs(value: UTXOLike[]) {
        this.#availableUXTOs = value.map((val: UTXOLike) => {
            const utxo = UTXO.from(val);
            this.#validateUTXO(utxo);
            return utxo;
        });
    }

    get spendOutputs(): UTXO[] { return this.#spendOutputs; }
    set spendOutputs(value: UTXOLike[]) {
        this.#spendOutputs = value.map((utxo: UTXOLike) => UTXO.from(utxo));
    }

    get changeOutputs(): UTXO[] { return this.#changeOutputs; }
    set changeOutputs(value: UTXOLike[]) {
        this.#changeOutputs = value.map((utxo: UTXOLike) => UTXO.from(utxo));
    }

    /**
     * Constructs a new CoinSelector instance with an empty UTXO array.
     */
    constructor() {
        this.#availableUXTOs = [];
        this.#spendOutputs = [];
        this.#changeOutputs = [];
    }


    /**
     * The largest first coin selection algorithm.
     * 
     * This algorithm selects the largest UTXOs first, and continues to select UTXOs until the
     * target amount is reached. If the total value of the selected UTXOs is greater than the
     * target amount, the remaining value is returned as a change output.
     * @param target The target amount to select UTXOs for.
     */
    performSelection(target: SpendTarget): SelectedCoinsResult {
        if (target.value <= BigInt(0)) {
            throw new Error("Target amount must be greater than 0");
        }

        if (this.availableUXTOs.length === 0) {
            throw new Error("No UTXOs available");
        }

        // Sort UTXOs in descending order based on their denomination
        const sortedUTXOs = this.availableUXTOs.sort((a, b) => {
            const diff = (b.denomination ?? BigInt(0)) - (a.denomination ?? BigInt(0));
            return diff > 0 ? 1 : diff < 0 ? -1 : 0;
        });

        let totalValue = BigInt(0);
        const selectedUTXOs: UTXO[] = [];

        // Get UTXOs that meets or exceeds the target value
        const UTXOsEqualOrGreaterThanTarget = sortedUTXOs.filter(utxo => utxo.denomination && utxo.denomination >= target.value);

        if (UTXOsEqualOrGreaterThanTarget.length > 0) {
            // Find the smallest UTXO that meets or exceeds the target value
            const optimalUTXO = UTXOsEqualOrGreaterThanTarget.reduce((minDenominationUTXO, currentUTXO) => {
                if (!currentUTXO.denomination) return minDenominationUTXO;
                return currentUTXO.denomination < minDenominationUTXO.denomination! ? currentUTXO : minDenominationUTXO;
            }, UTXOsEqualOrGreaterThanTarget[0]); // Initialize with the first UTXO in the list

            selectedUTXOs.push(optimalUTXO);
            totalValue += optimalUTXO.denomination!;
        } else {
            // If no single UTXO meets or exceeds the target, aggregate smaller denominations
            // until the target is met/exceeded or there are no more UTXOs to aggregate
            while (sortedUTXOs.length > 0 && totalValue < target.value) {
                const nextOptimalUTXO = sortedUTXOs.reduce<UTXO>((closest, utxo) => {
                    if (!utxo.denomination) return closest;

                    // Prioritize UTXOs that bring totalValue closer to target.value
                    const absThisDiff = bigIntAbs(target.value - (totalValue + utxo.denomination));
                    const currentClosestDiff = closest && closest.denomination
                        ? bigIntAbs(target.value - (totalValue + closest.denomination))
                        : BigInt(Infinity);

                    return absThisDiff < currentClosestDiff ? utxo : closest;

                }, sortedUTXOs[0]);

                // Add the selected UTXO to the selection and update totalValue
                selectedUTXOs.push(nextOptimalUTXO);
                totalValue += nextOptimalUTXO.denomination!;

                // Remove the selected UTXO from the list of available UTXOs
                const index = sortedUTXOs.findIndex(utxo => utxo.denomination === nextOptimalUTXO.denomination && utxo.address === nextOptimalUTXO.address);
                sortedUTXOs.splice(index, 1);
            }
        }

        // Check if the selected UTXOs meet or exceed the target amount
        if (totalValue < target.value) {
            throw new Error("Insufficient funds");
        }

        // Break down the total spend into properly denominatated UTXOs
        const spendDenominations = this.#denominate(target.value);
        this.spendOutputs = spendDenominations.map(denomination => {
            const utxo = new UTXO();
            utxo.denomination = denomination;
            utxo.address = target.address;
            return utxo;
        });

        // Calculate change if the total value exceeds the target
        const change = totalValue - target.value;

        // If there's change, break it down into properly denominatated UTXOs
        if (change > BigInt(0)) {
            const changeDenominations = this.#denominate(change);
            this.changeOutputs = changeDenominations.map(denomination => {
                const utxo = new UTXO();
                utxo.denomination = denomination;
                // We do not have access to change addresses here so leave it null
                return utxo;
            });
        } else {
            this.changeOutputs = [];
        }

        return {
            inputs: selectedUTXOs,
            spendOutputs: this.spendOutputs,
            changeOutputs: this.changeOutputs,
        };
    }

    /**
     * Validates the provided UTXO instance. In order to be valid for coin 
     * selection, the UTXO must have a valid address and denomination.
     * @param utxo The UTXO instance to validate.
     * @throws An error if the UTXO instance is invalid.
     */
    #validateUTXO(utxo: UTXO): void {
        if (utxo.address == null) {
            throw new Error("UTXO address is required");
        }

        if (utxo.denomination == null) {
            throw new Error("UTXO denomination is required");
        }
    }

    /**
     * Given a value, returns an array of supported denominations that sum to the value.
     * @param value The value to denominate.
     * @returns Array of supported denominations that sum to the value.
     */
    #denominate(value: bigint): bigint[] {
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

}
