import { denominations, UTXO } from './utxo.js';

/**
 * Represents a target for spending.
 *
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
 *
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
export interface CoinSelectionConfig {
    target?: bigint;
    fee?: bigint;
    includeLocked?: boolean;
    maxDenomination?: number;
    // Any future parameters can be added here
}

export abstract class AbstractCoinSelector {
    public availableUTXOs: UTXO[];
    public totalInputValue: bigint = BigInt(0);
    public spendOutputs: UTXO[] = [];
    public changeOutputs: UTXO[] = [];
    public selectedUTXOs: UTXO[] = [];
    public target: bigint | null = null;

    /**
     * Constructs a new AbstractCoinSelector instance with an empty UTXO array.
     *
     * @param {UTXO[]} [availableUXTOs=[]] - The initial available UTXOs. Default is `[]`
     */
    constructor(availableUTXOs: UTXO[] = []) {
        this.availableUTXOs = availableUTXOs.map((utxo: UTXO) => {
            this._validateUTXO(utxo);
            return utxo;
        });
        this.spendOutputs = [];
        this.changeOutputs = [];
    }

    /**
     * This method should be implemented by sub-classes to provide the actual coin selection logic. It should select
     * UTXOs from the available UTXOs that sum to the target amount and return the selected UTXOs as well as the spend
     * and change outputs.
     *
     * @abstract
     * @param {CoinSelectionConfig} config - The configuration for coin selection.
     * @returns {SelectedCoinsResult} The selected UTXOs and outputs.
     */
    abstract performSelection(config: CoinSelectionConfig): SelectedCoinsResult;

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

        if (utxo.txhash == null) {
            throw new Error('UTXO txhash is required');
        }

        if (utxo.index == null) {
            throw new Error('UTXO index is required');
        }
    }

    /**
     * Validates the available UTXOs.
     *
     * @throws Will throw an error if there are no available UTXOs.
     */
    protected validateUTXOs() {
        if (this.availableUTXOs.length === 0) {
            throw new Error('No UTXOs available');
        }
    }

    /**
     * Sorts UTXOs by their denomination.
     *
     * @param {UTXO[]} utxos - The UTXOs to sort.
     * @param {'asc' | 'desc'} direction - The direction to sort ('asc' for ascending, 'desc' for descending).
     * @returns {UTXO[]} The sorted UTXOs.
     */
    protected sortUTXOsByDenomination(utxos: UTXO[], direction: 'asc' | 'desc'): UTXO[] {
        if (direction === 'asc') {
            return [...utxos].sort((a, b) => {
                const diff =
                    BigInt(a.denomination !== null ? denominations[a.denomination] : 0) -
                    BigInt(b.denomination !== null ? denominations[b.denomination] : 0);
                return diff > BigInt(0) ? 1 : diff < BigInt(0) ? -1 : 0;
            });
        }
        return [...utxos].sort((a, b) => {
            const diff =
                BigInt(b.denomination !== null ? denominations[b.denomination] : 0) -
                BigInt(a.denomination !== null ? denominations[a.denomination] : 0);
            return diff > BigInt(0) ? 1 : diff < BigInt(0) ? -1 : 0;
        });
    }
}
