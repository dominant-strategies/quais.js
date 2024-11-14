import { AbstractCoinSelector, CoinSelectionConfig, SelectedCoinsResult } from './abstract-coinselector.js';
import { UTXO, denominations } from './utxo.js';

/**
 * A coin selector that aggregates multiple UTXOs into larger denominations. It attempts to combine smaller denomination
 * UTXOs into the largest possible denominations.
 */
export class AggregateCoinSelector extends AbstractCoinSelector {
    /**
     * Performs coin selection by aggregating UTXOs into larger denominations.
     *
     * @param {bigint} _target - Ignored in this implementation as we aggregate all UTXOs
     * @param {bigint} fee - The fee amount to account for
     * @param {boolean} includeLocked - Whether to include locked UTXOs in the selection
     * @returns {SelectedCoinsResult} The selected UTXOs and outputs
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    performSelection(config: CoinSelectionConfig): SelectedCoinsResult {
        const { includeLocked = false, fee = BigInt(0) } = config;

        this.validateUTXOs();

        // Filter UTXOs based on lock status if needed
        const eligibleUTXOs = includeLocked
            ? this.availableUTXOs
            : this.availableUTXOs.filter((utxo) => utxo.lock === null || utxo.lock === 0);

        if (eligibleUTXOs.length === 0) {
            throw new Error('No eligible UTXOs available for aggregation');
        }

        this.selectedUTXOs = eligibleUTXOs;
        this.totalInputValue = eligibleUTXOs.reduce(
            (sum, utxo) => sum + BigInt(denominations[utxo.denomination!]),
            BigInt(0),
        );

        const totalAvailable = this.totalInputValue - fee;
        if (totalAvailable <= BigInt(0)) {
            throw new Error('Insufficient funds to cover fee');
        }

        this.spendOutputs = this.createOptimalDenominations(totalAvailable);

        const totalOutputValue = this.spendOutputs.reduce(
            (sum, output) => sum + BigInt(denominations[output.denomination!]),
            BigInt(0),
        );

        if (totalOutputValue + fee !== this.totalInputValue) {
            throw new Error('Output value mismatch after aggregation');
        }

        if (this.spendOutputs.length >= this.selectedUTXOs.length) {
            throw new Error('Aggregation would not reduce number of UTXOs');
        }

        this.changeOutputs = [];

        return {
            inputs: this.selectedUTXOs,
            spendOutputs: this.spendOutputs,
            changeOutputs: this.changeOutputs,
        };
    }

    /**
     * Helper method to calculate the optimal denomination distribution for a given value.
     *
     * @param {bigint} value - The value to optimize denominations for
     * @returns {UTXO[]} Array of UTXOs with optimal denomination distribution
     */
    private createOptimalDenominations(value: bigint): UTXO[] {
        const outputs: UTXO[] = [];
        let remaining = value;

        for (let i = denominations.length - 1; i >= 0 && remaining > BigInt(0); i--) {
            const denomination = denominations[i];
            while (remaining >= denomination) {
                const output = new UTXO();
                output.denomination = i;
                outputs.push(output);
                remaining -= denomination;
            }
        }

        if (remaining > BigInt(0)) {
            throw new Error('Unable to create optimal denominations');
        }

        return outputs;
    }
}
