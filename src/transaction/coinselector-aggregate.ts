import { AbstractCoinSelector, CoinSelectionConfig, SelectedCoinsResult } from './abstract-coinselector.js';
import { UTXO, denominations } from './utxo.js';

/**
 * A coin selector that aggregates multiple UTXOs into larger denominations. It attempts to combine smaller denomination
 * UTXOs into the largest possible denominations.
 */
export class AggregateCoinSelector extends AbstractCoinSelector {
    /**
     * Performs coin selection by aggregating UTXOs into larger denominations. This implementation combines smaller
     * denomination UTXOs into the largest possible denominations up to maxDenomination, while ensuring enough value
     * remains to cover the transaction fee.
     *
     * @param {CoinSelectionConfig} config - The configuration object containing:
     * @param {boolean} [config.includeLocked=false] - Whether to include locked UTXOs in the selection. Default is
     *   `false`
     * @param {bigint} [config.fee=0n] - The fee amount to account for. Default is `0n`
     * @param {number} [config.maxDenomination=6] - The maximum denomination to aggregate up to (default 6 = 1 Qi).
     *   Default is `6`
     * @returns {SelectedCoinsResult} The selected UTXOs and aggregated outputs
     * @throws {Error} If no eligible UTXOs are available for aggregation
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    performSelection(config: CoinSelectionConfig): SelectedCoinsResult {
        const {
            includeLocked = false,
            fee = BigInt(0),
            maxDenomination = 6, // Default to denomination[6] (1 Qi)
        } = config;

        this.validateUTXOs();

        // Filter UTXOs based on lock status if needed
        const eligibleUTXOs = includeLocked
            ? this.availableUTXOs
            : this.availableUTXOs.filter((utxo) => utxo.lock === null || utxo.lock === 0);

        // totalInputValue is the sum of the denominations of the eligible UTXOsregardless of maxDenomination
        this.totalInputValue = eligibleUTXOs.reduce(
            (sum, utxo) => sum + BigInt(denominations[utxo.denomination!]),
            BigInt(0),
        );

        // get the UTXOs that are below maxDenomination
        const smallDenominationsUTXOs = eligibleUTXOs.filter((utxo) => utxo.denomination! < maxDenomination);

        if (smallDenominationsUTXOs.length === 0) {
            throw new Error('No eligible UTXOs available for aggregation');
        }

        // get the UTXOs that are above or equal to maxDenomination
        const bigDenominationUTXOs = eligibleUTXOs.filter((utxo) => utxo.denomination! >= maxDenomination);

        // calculate the sum of the denominations of the big denomination UTXOs
        const totalInputValueAboveMaxDenomination = bigDenominationUTXOs.reduce(
            (sum, utxo) => sum + BigInt(denominations[utxo.denomination!]),
            BigInt(0),
        );

        // calculate the sum of the denominations of the small denomination UTXOs
        const totalInputValueBelowMaxDenomination = this.totalInputValue - totalInputValueAboveMaxDenomination;

        // The valueToAggregate value is calculated as:
        // 1. If the total value of bigDenominationsUTXOs is greater than the fee, then the fee is covered by bigDenominationsUTXOs, and
        //    the valueToAggregate is the value of small denomination UTXOs, i.e.:
        //    valueToAggregate = totalInputValueBelowMaxDenomination
        // 2. Otherwise, the valueToAggregate equals the value of small denomination UTXOs minus
        //    the difference between the fee and the value of the big denomination UTXOs, i.e.:
        //    valueToAggregate = totalInputValueBelowMaxDenomination - (fee - totalInputValueAboveMaxDenomination)
        const valueToAggregate =
            totalInputValueAboveMaxDenomination >= fee
                ? totalInputValueBelowMaxDenomination
                : totalInputValueBelowMaxDenomination - (fee - totalInputValueAboveMaxDenomination);

        if (valueToAggregate <= BigInt(0)) {
            throw new Error('Insufficient funds to cover fee');
        }

        this.spendOutputs = this.createOptimalDenominations(valueToAggregate);

        // get the inputs to cover the valueToAggregate
        const inputsToAggregate = this.getInputsToAggregate(smallDenominationsUTXOs, valueToAggregate);

        // get UTXOs inputs not included in inputsToAggregate to cover the fee.
        const feeInputs = this.getInputsForFee(inputsToAggregate, eligibleUTXOs, fee);

        // calculate the value of the feeInputs
        const feeInputsValue = feeInputs.reduce(
            (sum, utxo) => sum + BigInt(denominations[utxo.denomination!]),
            BigInt(0),
        );

        // if the feeInputs value is higher than the fee, add the difference to the outputs to compensate the fee
        if (feeInputsValue > fee) {
            const difference = feeInputsValue - fee;
            const additionalOutputs = this.createOptimalDenominations(difference);
            this.spendOutputs.push(...additionalOutputs);
        }

        this.selectedUTXOs = [...feeInputs, ...inputsToAggregate];

        // if the number of outputs is greater than or equal to the number of inputs to aggregate, throw an error
        if (this.spendOutputs.length >= inputsToAggregate.length) {
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

    // gets the input UTXOs to cover the fee
    private getInputsForFee(inputsToAggregate: UTXO[], eligibleUTXOs: UTXO[], fee: bigint): UTXO[] {
        // get the input UTXOs that are not included in inputsToAggregate
        const eligiblefeeInputs = eligibleUTXOs.filter(
            (utxo) => !inputsToAggregate.some((input) => input.txhash === utxo.txhash && input.index === utxo.index),
        );

        const sortedUTXOs = this.sortUTXOsByDenomination(eligiblefeeInputs, 'asc');

        // loop through sortedUTXOs and sum the denominations until the sum is greater than or equal to the fee
        let sum = BigInt(0);
        const feeInputs: UTXO[] = [];
        for (const utxo of sortedUTXOs) {
            sum += BigInt(denominations[utxo.denomination!]);
            feeInputs.push(utxo);
            if (sum >= fee) {
                return feeInputs;
            }
        }

        throw new Error('Unable to find inputs to cover fee');
    }

    // gets the input UTXOs whose value equals the amount to aggregate, i.e. valueToAggregate
    private getInputsToAggregate(smallDenominationsUTXOs: UTXO[], valueToAggregate: bigint): UTXO[] {
        const sortedUTXOs = this.sortUTXOsByDenomination(smallDenominationsUTXOs, 'asc');
        const inputsToAggregate: UTXO[] = [];
        for (const utxo of sortedUTXOs) {
            inputsToAggregate.push(utxo);
            if (
                inputsToAggregate.reduce((sum, utxo) => sum + BigInt(denominations[utxo.denomination!]), BigInt(0)) ===
                valueToAggregate
            ) {
                return inputsToAggregate;
            }
        }
        throw new Error('Unable to find inputs to aggregate');
    }
}
