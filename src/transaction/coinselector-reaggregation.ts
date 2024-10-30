import { AbstractCoinSelector, SelectedCoinsResult } from './abstract-coinselector.js';
import { UTXO, denominations } from './utxo.js';

/**
 * The ReaggregationCoinSelector class provides a coin selection algorithm for reaggregation transactions. It selects
 * UTXOs that can be combined to form larger denominations, reducing the number of outputs.
 *
 * @category Transaction
 */
export class ReaggregationCoinSelector extends AbstractCoinSelector {
    /**
     * Performs coin selection for reaggregation.
     *
     * @returns {SelectedCoinsResult} The selected UTXOs and outputs.
     */
    performSelection(): SelectedCoinsResult {
        // Validate UTXOs
        this.validateUTXOs();

        // Initialize selection state
        this.selectedUTXOs = [];
        this.spendOutputs = [];
        this.totalInputValue = BigInt(0);
        this.target = null;

        // Create a copy of available UTXOs to manipulate
        const utxos = [...this.availableUTXOs];

        // Exclude larger UTXOs that cannot be combined
        const smallerUTXOs = utxos.filter((utxo) => utxo.denomination! < denominations.length - 1);

        // Sort UTXOs by denomination (ascending)
        smallerUTXOs.sort((a, b) => denominations[a.denomination!] - denominations[b.denomination!]);

        // Attempt to aggregate UTXOs into higher denominations
        for (let i = denominations.length - 1; i > 0; i--) {
            const targetDenomination = denominations[i];

            // Find combinations of UTXOs that sum to the target denomination
            const combination = this.findCombination(smallerUTXOs, targetDenomination);

            if (combination.length > 0) {
                // Add selected UTXOs to inputs
                this.selectedUTXOs.push(...combination);

                // Create a spend output of the target denomination
                const output = new UTXO();
                output.denomination = i;
                this.spendOutputs.push(output);

                // Remove used UTXOs from the pool
                for (const usedUtxo of combination) {
                    const index = smallerUTXOs.indexOf(usedUtxo);
                    if (index !== -1) {
                        smallerUTXOs.splice(index, 1);
                    }
                }

                // Update total input value
                this.totalInputValue += targetDenomination;
            }
        }

        // The remaining UTXOs are not included in the transaction
        // (They cannot be combined to form higher denominations)

        return {
            inputs: this.selectedUTXOs,
            spendOutputs: this.spendOutputs,
            changeOutputs: [], // No change outputs in reaggregation
        };
    }

    /**
     * Finds a combination of UTXOs that sum up exactly to the target denomination.
     *
     * @param {UTXO[]} utxos - The list of available UTXOs.
     * @param {bigint} target - The target denomination value to reach.
     * @returns {UTXO[]} The combination of UTXOs that sum to the target, or an empty array if none found.
     */
    private findCombination(utxos: UTXO[], target: bigint): UTXO[] {
        const dp: Map<bigint, UTXO[]> = new Map();
        dp.set(BigInt(0), []);

        for (const utxo of utxos) {
            const utxoValue = denominations[utxo.denomination!];
            const entries = Array.from(dp.entries());

            for (const [sum, combination] of entries) {
                const newSum = sum + utxoValue;

                if (newSum > target) continue;
                if (dp.has(newSum)) continue;

                dp.set(newSum, [...combination, utxo]);

                if (newSum === target) {
                    return dp.get(newSum)!;
                }
            }
        }

        return [];
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

        for (const utxo of this.availableUTXOs) {
            this._validateUTXO(utxo);
        }
    }
}
