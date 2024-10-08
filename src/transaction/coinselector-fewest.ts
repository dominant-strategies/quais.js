import { bigIntAbs } from '../utils/maths.js';
import { AbstractCoinSelector, SelectedCoinsResult } from './abstract-coinselector.js';
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
     * The coin selection algorithm considering transaction fees.
     *
     * @param {bigint} target - The target amount to spend.
     * @returns {SelectedCoinsResult} The selected UTXOs and change outputs.
     */
    performSelection(target: bigint): SelectedCoinsResult {
        if (target <= BigInt(0)) {
            throw new Error('Target amount must be greater than 0');
        }

        this.validateUTXOs();
        this.target = target;

        // Initialize selection state
        this.selectedUTXOs = [];
        this.totalInputValue = BigInt(0);

        const sortedUTXOs = this.sortUTXOsByDenomination(this.availableUTXOs, 'desc');

        let totalValue = BigInt(0);
        let selectedUTXOs: UTXO[] = [];

        // Get UTXOs that meets or exceeds the target value
        const UTXOsEqualOrGreaterThanTarget = sortedUTXOs.filter(
            (utxo) => utxo.denomination !== null && BigInt(denominations[utxo.denomination]) >= target,
        );

        if (UTXOsEqualOrGreaterThanTarget.length > 0) {
            // Find the smallest UTXO that meets or exceeds the target value
            const optimalUTXO = UTXOsEqualOrGreaterThanTarget.reduce((minDenominationUTXO, currentUTXO) => {
                if (currentUTXO.denomination === null) return minDenominationUTXO;
                return BigInt(denominations[currentUTXO.denomination]) <
                    BigInt(denominations[minDenominationUTXO.denomination!])
                    ? currentUTXO
                    : minDenominationUTXO;
            }, UTXOsEqualOrGreaterThanTarget[0]);

            selectedUTXOs.push(optimalUTXO);
            totalValue += BigInt(denominations[optimalUTXO.denomination!]);
        } else {
            // If no single UTXO meets or exceeds the target, aggregate smaller denominations
            // until the target is met/exceeded or there are no more UTXOs to aggregate
            while (sortedUTXOs.length > 0 && totalValue < target) {
                const nextOptimalUTXO = sortedUTXOs.reduce<UTXO>((closest, utxo) => {
                    if (utxo.denomination === null) return closest;

                    // Prioritize UTXOs that bring totalValue closer to target.value
                    const absThisDiff = bigIntAbs(
                        BigInt(target) - (BigInt(totalValue) + BigInt(denominations[utxo.denomination])),
                    );
                    const currentClosestDiff =
                        closest && closest.denomination !== null
                            ? bigIntAbs(
                                  BigInt(target) - (BigInt(totalValue) + BigInt(denominations[closest.denomination])),
                              )
                            : BigInt(Number.MAX_SAFE_INTEGER);

                    return absThisDiff < currentClosestDiff ? utxo : closest;
                }, sortedUTXOs[0]);

                // Add the selected UTXO to the selection and update totalValue
                selectedUTXOs.push(nextOptimalUTXO);
                totalValue += BigInt(denominations[nextOptimalUTXO.denomination!]);

                // Remove the selected UTXO from the list of available UTXOs
                const index = sortedUTXOs.findIndex(
                    (utxo) =>
                        utxo.denomination === nextOptimalUTXO.denomination && utxo.address === nextOptimalUTXO.address,
                );
                sortedUTXOs.splice(index, 1);
            }
        }

        // Optimize the selection process
        let optimalSelection = selectedUTXOs;
        let minExcess = BigInt(totalValue) - BigInt(target);

        for (let i = 0; i < selectedUTXOs.length; i++) {
            const subsetUTXOs = selectedUTXOs.slice(0, i).concat(selectedUTXOs.slice(i + 1));
            const subsetTotal = subsetUTXOs.reduce(
                (sum, utxo) => BigInt(sum) + BigInt(denominations[utxo.denomination!]),
                BigInt(0),
            );

            if (subsetTotal >= target) {
                const excess = BigInt(subsetTotal) - BigInt(target);
                if (excess < minExcess) {
                    optimalSelection = subsetUTXOs;
                    minExcess = excess;
                    totalValue = subsetTotal;
                }
            }
        }

        selectedUTXOs = optimalSelection;

        // Find the largest denomination used in the inputs

        // Store the selected UTXOs and total input value
        this.selectedUTXOs = selectedUTXOs;
        this.totalInputValue = totalValue;

        // Check if the selected UTXOs meet or exceed the target amount
        if (totalValue < target) {
            throw new Error('Insufficient funds');
        }

        // Store spendOutputs and changeOutputs
        this.spendOutputs = this.createSpendOutputs(target);
        this.changeOutputs = this.createChangeOutputs(BigInt(totalValue) - BigInt(target));

        return {
            inputs: selectedUTXOs,
            spendOutputs: this.spendOutputs,
            changeOutputs: this.changeOutputs,
        };
    }

    // Helper methods to create spend and change outputs
    private createSpendOutputs(amount: bigint): UTXO[] {
        const maxDenomination = this.getMaxInputDenomination();

        const spendDenominations = denominate(amount, maxDenomination);
        return spendDenominations.map((denomination) => {
            const utxo = new UTXO();
            utxo.denomination = denominations.indexOf(denomination);
            return utxo;
        });
    }

    private createChangeOutputs(change: bigint): UTXO[] {
        if (change <= BigInt(0)) {
            return [];
        }

        const maxDenomination = this.getMaxInputDenomination();

        const changeDenominations = denominate(change, maxDenomination);
        return changeDenominations.map((denomination) => {
            const utxo = new UTXO();
            utxo.denomination = denominations.indexOf(denomination);
            return utxo;
        });
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
                    const change =
                        BigInt(this.totalInputValue) -
                        BigInt(this.target!) -
                        (BigInt(additionalFeeNeeded) - BigInt(remainingFee));
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

    private getMaxInputDenomination(): bigint {
        return this.selectedUTXOs.reduce((max, utxo) => {
            const denomValue = BigInt(denominations[utxo.denomination!]);
            return denomValue > max ? denomValue : max;
        }, BigInt(0));
    }

    /**
     * Helper method to adjust change outputs.
     *
     * @param {bigint} changeAmount - The amount to adjust change outputs by.
     */
    private adjustChangeOutputs(changeAmount: bigint): void {
        if (changeAmount <= BigInt(0)) {
            this.changeOutputs = [];
            return;
        }

        this.changeOutputs = this.createChangeOutputs(changeAmount);
    }

    /**
     * Sorts UTXOs by their denomination.
     *
     * @param {UTXO[]} utxos - The UTXOs to sort.
     * @param {'asc' | 'desc'} direction - The direction to sort ('asc' for ascending, 'desc' for descending).
     * @returns {UTXO[]} The sorted UTXOs.
     */
    private sortUTXOsByDenomination(utxos: UTXO[], direction: 'asc' | 'desc'): UTXO[] {
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

    /**
     * Validates the available UTXOs.
     *
     * @throws Will throw an error if there are no available UTXOs.
     */
    private validateUTXOs() {
        if (this.availableUTXOs.length === 0) {
            throw new Error('No UTXOs available');
        }
    }
}
