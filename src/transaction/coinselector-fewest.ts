// import { bigIntAbs } from '../utils/maths.js';
import { AbstractCoinSelector, CoinSelectionConfig, SelectedCoinsResult } from './abstract-coinselector.js';
import { UTXO, denominate, denominations } from './utxo.js';

/**
 * The FewestCoinSelector class provides a coin selection algorithm that selects the fewest UTXOs required to meet the
 * target amount. This algorithm is useful for minimizing the size of the transaction and the fees associated with it.
 *
 * This class is a sub-class of {@link AbstractCoinSelector | **AbstractCoinSelector** } and implements the
 * {@link AbstractCoinSelector.performSelection | **performSelection** } method to provide the actual coin selection
 * logic.
 *
 * @category Transaction
 */
export class FewestCoinSelector extends AbstractCoinSelector {
    /**
     * Performs coin selection to meet the target amount plus fee, using the smallest possible denominations and
     * minimizing the number of inputs and outputs.
     *
     * @param {bigint} target - The target amount to spend.
     * @param {bigint} fee - The fee amount to include in the selection.
     * @returns {SelectedCoinsResult} The selected UTXOs and outputs.
     */
    performSelection(config: CoinSelectionConfig): SelectedCoinsResult {
        const { target = BigInt(0), fee = BigInt(0) } = config;

        if (target <= BigInt(0)) {
            throw new Error('Target amount must be greater than 0');
        }

        if (fee < BigInt(0)) {
            throw new Error('Fee amount cannot be negative');
        }

        this.validateUTXOs();
        this.target = target;
        const totalRequired = BigInt(target) + BigInt(fee);

        // Initialize selection state
        this.selectedUTXOs = [];
        this.totalInputValue = BigInt(0);

        // Sort available UTXOs by denomination in ascending order
        const sortedUTXOs = this.sortUTXOsByDenomination(this.availableUTXOs, 'asc');

        // Attempt to find a single UTXO that can cover the total required amount
        const singleUTXO = sortedUTXOs.find((utxo) => BigInt(denominations[utxo.denomination!]) >= totalRequired);

        if (singleUTXO) {
            // Use the smallest UTXO that can cover the total required amount
            this.selectedUTXOs.push(singleUTXO);
            this.totalInputValue = BigInt(denominations[singleUTXO.denomination!]);
        } else {
            // If no single UTXO can cover the total required amount, find the minimal set
            this.selectedUTXOs = this.findMinimalUTXOSet(sortedUTXOs, totalRequired);

            if (this.selectedUTXOs.length === 0) {
                throw new Error('Insufficient funds');
            }

            // Calculate total input value
            this.totalInputValue = this.selectedUTXOs.reduce(
                (sum, utxo) => sum + BigInt(denominations[utxo.denomination!]),
                BigInt(0),
            );
        }

        // Create outputs
        const changeAmount = this.totalInputValue - BigInt(target) - BigInt(fee);

        // Create spend outputs (to the recipient)
        this.spendOutputs = this.createSpendOutputs(target);

        // Create change outputs (to ourselves), if any
        this.changeOutputs = this.createChangeOutputs(changeAmount);

        // Verify that sum of outputs does not exceed sum of inputs
        const totalOutputValue = this.calculateTotalOutputValue();
        if (totalOutputValue > this.totalInputValue) {
            throw new Error('Total output value exceeds total input value');
        }

        return {
            inputs: this.selectedUTXOs,
            spendOutputs: this.spendOutputs,
            changeOutputs: this.changeOutputs,
        };
    }

    /**
     * Finds the minimal set of UTXOs that can cover the total required amount.
     *
     * @param {UTXO[]} sortedUTXOs - Available UTXOs sorted by denomination (ascending).
     * @param {bigint} totalRequired - The total amount required (target + fee).
     * @returns {UTXO[]} The minimal set of UTXOs.
     */
    protected findMinimalUTXOSet(sortedUTXOs: UTXO[], totalRequired: bigint): UTXO[] {
        // First, try to find the smallest single UTXO that covers the total required amount
        const singleUTXO = sortedUTXOs.find((utxo) => BigInt(denominations[utxo.denomination!]) >= totalRequired);
        if (singleUTXO) {
            return [singleUTXO];
        }

        // If no single UTXO is sufficient, use a greedy algorithm starting from the largest denominations
        const utxos = [...sortedUTXOs].reverse(); // Largest to smallest
        let totalValue = BigInt(0);
        const selectedUTXOs: UTXO[] = [];

        for (const utxo of utxos) {
            if (totalValue >= totalRequired) {
                break;
            }
            selectedUTXOs.push(utxo);
            totalValue += BigInt(denominations[utxo.denomination!]);
        }

        if (totalValue >= totalRequired) {
            return selectedUTXOs;
        } else {
            return []; // Insufficient funds
        }
    }

    /**
     * Creates spend outputs based on the target amount and input denominations.
     *
     * @param {bigint} amount - The target amount to spend.
     * @param {UTXO[]} inputs - The selected inputs.
     * @returns {UTXO[]} The spend outputs.
     */
    protected createSpendOutputs(amount: bigint): UTXO[] {
        const maxInputDenomination = this.getMaxInputDenomination();

        // Denominate the amount using available denominations up to the max input denomination
        const spendDenominations = denominate(amount, maxInputDenomination);

        return spendDenominations.map((denominationValue) => {
            const utxo = new UTXO();
            utxo.denomination = denominations.indexOf(denominationValue);
            return utxo;
        });
    }

    /**
     * Creates change outputs based on the change amount and input denominations.
     *
     * @param {bigint} change - The change amount to return.
     * @param {UTXO[]} inputs - The selected inputs.
     * @returns {UTXO[]} The change outputs.
     */
    protected createChangeOutputs(change: bigint): UTXO[] {
        if (change <= BigInt(0)) {
            return [];
        }

        const maxInputDenomination = this.getMaxInputDenomination();

        // Denominate the change amount using available denominations up to the max input denomination
        const changeDenominations = denominate(change, maxInputDenomination);

        return changeDenominations.map((denominationValue) => {
            const utxo = new UTXO();
            utxo.denomination = denominations.indexOf(denominationValue);
            return utxo;
        });
    }

    /**
     * Calculates the total value of outputs (spend + change).
     *
     * @returns {bigint} The total output value.
     */
    protected calculateTotalOutputValue(): bigint {
        const spendValue = this.spendOutputs.reduce(
            (sum, output) => sum + BigInt(denominations[output.denomination!]),
            BigInt(0),
        );

        const changeValue = this.changeOutputs.reduce(
            (sum, output) => sum + BigInt(denominations[output.denomination!]),
            BigInt(0),
        );

        return spendValue + changeValue;
    }

    /**
     * Gets the maximum denomination value from the selected UTXOs.
     *
     * @returns {bigint} The maximum input denomination value.
     */
    protected getMaxInputDenomination(): bigint {
        const inputs = [...this.selectedUTXOs];
        return this.getMaxDenomination(inputs);
    }

    /**
     * Gets the maximum denomination value from the spend and change outputs.
     *
     * @returns {bigint} The maximum output denomination value.
     */
    protected getMaxOutputDenomination(): bigint {
        const outputs = [...this.spendOutputs, ...this.changeOutputs];
        return this.getMaxDenomination(outputs);
    }

    /**
     * Gets the maximum denomination value from a list of UTXOs.
     *
     * @param {UTXO[]} utxos - The list of UTXOs.
     * @returns {bigint} The maximum denomination value.
     */
    protected getMaxDenomination(utxos: UTXO[]): bigint {
        return utxos.reduce((max, utxo) => {
            const denomValue = BigInt(denominations[utxo.denomination!]);
            return denomValue > max ? denomValue : max;
        }, BigInt(0));
    }

    /**
     * Increases the total fee by first reducing change outputs, then selecting additional inputs if necessary.
     *
     * @param {bigint} additionalFeeNeeded - The additional fee needed.
     * @returns {boolean} Returns true if successful, false if insufficient funds.
     */
    increaseFee(additionalFeeNeeded: bigint): SelectedCoinsResult {
        let remainingFee = BigInt(additionalFeeNeeded);

        // First, try to cover the fee by reducing change outputs
        const totalChange = this.changeOutputs.reduce(
            (sum, output) => BigInt(sum) + BigInt(denominations[output.denomination!]),
            BigInt(0),
        );

        if (totalChange >= remainingFee) {
            // We can cover the fee by reducing change outputs
            this.adjustChangeOutputs(totalChange - remainingFee);
            return {
                inputs: this.selectedUTXOs,
                spendOutputs: this.spendOutputs,
                changeOutputs: this.changeOutputs,
            };
        }

        // If we can't cover the entire fee with change, reduce change to zero and calculate remaining fee
        remainingFee -= BigInt(totalChange);
        this.changeOutputs = [];

        // Now, select additional inputs to cover the remaining fee
        const unusedUTXOs = this.availableUTXOs.filter((utxo) => !this.selectedUTXOs.includes(utxo));
        const sortedUTXOs = this.sortUTXOsByDenomination(unusedUTXOs, 'asc');

        for (const utxo of sortedUTXOs) {
            this.selectedUTXOs.push(utxo);
            this.totalInputValue += BigInt(denominations[utxo.denomination!]);
            remainingFee -= BigInt(denominations[utxo.denomination!]);

            if (remainingFee <= BigInt(0)) {
                // If we have excess, create a new change output
                if (remainingFee < BigInt(0)) {
                    const change = BigInt(this.totalInputValue) - BigInt(this.target!) - BigInt(additionalFeeNeeded);
                    this.adjustChangeOutputs(change);
                }
            }
        }

        return {
            inputs: this.selectedUTXOs,
            spendOutputs: this.spendOutputs,
            changeOutputs: this.changeOutputs,
        };
    }

    /**
     * Decreases the fee by removing inputs if possible and adjusting change outputs.
     *
     * @param {bigint} feeReduction - The amount by which the fee has decreased.
     * @returns {void}
     */
    decreaseFee(feeReduction: bigint): SelectedCoinsResult {
        let excessValue = feeReduction;

        // First, try to remove inputs
        const sortedInputs = this.sortUTXOsByDenomination(this.selectedUTXOs, 'desc');
        const inputsToRemove: UTXO[] = [];

        for (const input of sortedInputs) {
            const inputValue = BigInt(denominations[input.denomination!]);
            if (excessValue >= inputValue && this.totalInputValue - inputValue >= this.target!) {
                inputsToRemove.push(input);
                excessValue -= BigInt(inputValue);
                this.totalInputValue -= BigInt(inputValue);
            }

            if (excessValue === BigInt(0)) break;
        }

        // Remove the identified inputs
        this.selectedUTXOs = this.selectedUTXOs.filter((utxo) => !inputsToRemove.includes(utxo));

        // If there's still excess value, add it to change outputs
        if (excessValue > BigInt(0)) {
            this.adjustChangeOutputs(excessValue);
        }

        return {
            inputs: this.selectedUTXOs,
            spendOutputs: this.spendOutputs,
            changeOutputs: this.changeOutputs,
        };
    }

    /**
     * Helper method to adjust change outputs.
     *
     * @param {bigint} changeAmount - The amount to adjust change outputs by.
     */
    protected adjustChangeOutputs(changeAmount: bigint): void {
        if (changeAmount <= BigInt(0)) {
            this.changeOutputs = [];
            return;
        }

        this.changeOutputs = this.createChangeOutputs(changeAmount);
    }
}
