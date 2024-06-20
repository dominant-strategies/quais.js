import { UTXO, UTXOEntry, UTXOLike } from './utxo.js';

/**
 * Represents a target for spending.
 * @typedef {Object} SpendTarget
 * @property {string} address - The address to send to.
 * @property {bigint} value - The amount to send.
 */
export type SpendTarget = {
    address: string;
    value: bigint;
};

/**
 * Represents the result of selected coins.
 * @typedef {Object} SelectedCoinsResult
 * @property {UTXO[]} inputs - The selected UTXOs.
 * @property {UTXO[]} spendOutputs - The outputs for spending.
 * @property {UTXO[]} changeOutputs - The outputs for change.
 */
export type SelectedCoinsResult = {
    inputs: UTXO[];
    spendOutputs: UTXO[];
    changeOutputs: UTXO[];
};

/**
 * An **AbstractCoinSelector** provides a base class for other sub-classes to implement the functionality for selecting
 * UTXOs for a spend and to properly handle spend and change outputs.
 *
 * This class is abstract and should not be used directly. Sub-classes should implement the
 * {@link AbstractCoinSelector#performSelection | **performSelection**} method to provide the actual coin selection
 * logic.
 *
 * @category Transaction
 * @abstract
 */
export abstract class AbstractCoinSelector {
    #availableUXTOs: UTXO[];
    #spendOutputs: UTXO[];
    #changeOutputs: UTXO[];

    /**
     * Gets the available UTXOs.
     * @returns {UTXO[]} The available UTXOs.
     */
    get availableUXTOs(): UTXO[] {
        return this.#availableUXTOs;
    }

    /**
     * Sets the available UTXOs.
     * @param {UTXOLike[]} value - The UTXOs to set.
     */
    set availableUXTOs(value: UTXOLike[]) {
        this.#availableUXTOs = value.map((val) => {
            const utxo = UTXO.from(val);
            this._validateUTXO(utxo);
            return utxo;
        });
    }

    /**
     * Gets the spend outputs.
     * @returns {UTXO[]} The spend outputs.
     */
    get spendOutputs(): UTXO[] {
        return this.#spendOutputs;
    }

    /**
     * Sets the spend outputs.
     * @param {UTXOLike[]} value - The spend outputs to set.
     */
    set spendOutputs(value: UTXOLike[]) {
        this.#spendOutputs = value.map((utxo) => UTXO.from(utxo));
    }

    /**
     * Gets the change outputs.
     * @returns {UTXO[]} The change outputs.
     */
    get changeOutputs(): UTXO[] {
        return this.#changeOutputs;
    }

    /**
     * Sets the change outputs.
     * @param {UTXOLike[]} value - The change outputs to set.
     */
    set changeOutputs(value: UTXOLike[]) {
        this.#changeOutputs = value.map((utxo) => UTXO.from(utxo));
    }

    /**
     * Constructs a new AbstractCoinSelector instance with an empty UTXO array.
     * @param {UTXOEntry[]} [availableUXTOs=[]] - The initial available UTXOs.
     */
    constructor(availableUXTOs: UTXOEntry[] = []) {
        this.#availableUXTOs = availableUXTOs.map((val: UTXOLike) => {
            const utxo = UTXO.from(val);
            this._validateUTXO(utxo);
            return utxo;
        });
        this.#spendOutputs = [];
        this.#changeOutputs = [];
    }

    /**
     * This method should be implemented by sub-classes to provide the actual coin selection logic. It should select
     * UTXOs from the available UTXOs that sum to the target amount and return the selected UTXOs as well as the spend
     * and change outputs.
     *
     * @param {SpendTarget} target - The target address and value to spend.
     * @returns {SelectedCoinsResult} The selected UTXOs and outputs.
     * @abstract
     */
    abstract performSelection(target: SpendTarget): SelectedCoinsResult;

    /**
     * Validates the provided UTXO instance. In order to be valid for coin selection, the UTXO must have a valid address
     * and denomination.
     *
     * @param {UTXO} utxo - The UTXO to validate.
     * @throws {Error} If the UTXO is invalid.
     * @protected
     */
    protected _validateUTXO(utxo: UTXO): void {
        if (utxo.address == null) {
            throw new Error('UTXO address is required');
        }

        if (utxo.denomination == null) {
            throw new Error('UTXO denomination is required');
        }
    }
}
