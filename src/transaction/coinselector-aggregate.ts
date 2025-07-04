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
            fee = BigInt(0),
            maxDenominationAggregate = 6, // Default to denomination[6] (1 Qi)
            maxDenominationOutput = denominations.length - 1, // Default to the last denomination
        } = config;

        this.validateUTXOs();

        // totalInputValue is the sum of the denominations of the eligible UTXOsregardless of maxDenomination
        this.totalInputValue = this.availableUTXOs.reduce(
            (sum, utxo) => sum + BigInt(denominations[utxo.denomination!]),
            BigInt(0),
        );

        // get the UTXOs that are below or equal to maxDenomination
        const smallDenominationsUTXOs = this.availableUTXOs.filter(
            (utxo) => utxo.denomination! <= maxDenominationAggregate,
        );

        if (smallDenominationsUTXOs.length === 0) {
            throw new Error('No eligible UTXOs available for aggregation');
        }

        // get the UTXOs that are above maxDenomination
        const bigDenominationUTXOs = this.availableUTXOs.filter(
            (utxo) => utxo.denomination! > maxDenominationAggregate,
        );

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

        this.spendOutputs = this.createOptimalDenominations(valueToAggregate, maxDenominationOutput);

        // get the inputs to cover the valueToAggregate
        let inputsToAggregate = this.getInputsToAggregate(smallDenominationsUTXOs, valueToAggregate);

        // get UTXOs inputs not included in inputsToAggregate to cover the fee.
        let feeInputs: UTXO[] = [];
        if (fee > BigInt(0)) {
            const feeResult = this.getInputsForFee(inputsToAggregate, this.availableUTXOs, fee);
            feeInputs = feeResult.feeInputs;
            inputsToAggregate = feeResult.updatedInputsToAggregate;

            // Recalculate spend outputs based on updated inputsToAggregate
            const updatedValueToAggregate = inputsToAggregate.reduce(
                (sum, utxo) => sum + BigInt(denominations[utxo.denomination!]),
                BigInt(0),
            );
            this.spendOutputs = this.createOptimalDenominations(updatedValueToAggregate, maxDenominationOutput);
        }

        // calculate the value of the feeInputs
        const feeInputsValue = feeInputs.reduce(
            (sum, utxo) => sum + BigInt(denominations[utxo.denomination!]),
            BigInt(0),
        );

        // if the feeInputs value is higher than the fee, add the difference to the outputs to compensate the fee
        if (feeInputsValue > fee) {
            const difference = feeInputsValue - fee;
            const additionalOutputs = this.createOptimalDenominations(difference, maxDenominationOutput);
            this.spendOutputs.push(...additionalOutputs);
        }

        this.selectedUTXOs = [...feeInputs, ...inputsToAggregate];

        // if the number of outputs is greater than or equal to the number of inputs to aggregate, throw an error
        if (this.spendOutputs.length >= inputsToAggregate.length) {
            console.warn(
                `Aggregation would not reduce number of UTXOs, ${this.spendOutputs.length} outputs vs ${inputsToAggregate.length} inputs`,
            );
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
     * @param {number} maxDenominationIndex - The index of the maximum denomination to use
     * @returns {UTXO[]} Array of UTXOs with optimal denomination distribution
     */
    private createOptimalDenominations(value: bigint, maxDenominationIndex: number): UTXO[] {
        if (maxDenominationIndex < 0 || maxDenominationIndex >= denominations.length) {
            throw new Error(`Invalid maxDenomination index: ${maxDenominationIndex}`);
        }

        const outputs: UTXO[] = [];
        let remaining = value;

        // Start from the specified maxDenominationIndex and work downwards
        for (let i = maxDenominationIndex; i >= 0 && remaining > BigInt(0); i--) {
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
    private getInputsForFee(
        inputsToAggregate: UTXO[],
        availableUTXOs: UTXO[],
        fee: bigint,
    ): { feeInputs: UTXO[]; updatedInputsToAggregate: UTXO[] } {
        let currentInputsToAggregate = [...inputsToAggregate];

        while (currentInputsToAggregate.length > 0) {
            // get the input UTXOs that are not included in currentInputsToAggregate
            const eligiblefeeInputs = availableUTXOs.filter(
                (utxo) =>
                    !currentInputsToAggregate.some(
                        (input) => input.txhash === utxo.txhash && input.index === utxo.index,
                    ),
            );

            // If no eligible fee inputs available, we need to remove inputs from aggregation
            if (eligiblefeeInputs.length === 0) {
                console.warn(
                    `No UTXOs available for fee coverage, removing minimum UTXOs from aggregation to cover fee`,
                );

                // Sort by denomination ascending to remove the smallest first
                const sortedInputsToAggregate = this.sortUTXOsByDenomination(currentInputsToAggregate, 'asc');

                // Calculate minimum number of UTXOs to remove to cover the fee
                let feeSum = BigInt(0);
                let utxosToRemove = 0;
                for (const utxo of sortedInputsToAggregate) {
                    feeSum += BigInt(denominations[utxo.denomination!]);
                    utxosToRemove++;
                    if (feeSum >= fee) {
                        break;
                    }
                }

                // Remove the minimum number of UTXOs needed to cover the fee
                currentInputsToAggregate = sortedInputsToAggregate.slice(utxosToRemove);

                // The removed UTXOs become our fee inputs
                const feeInputs = sortedInputsToAggregate.slice(0, utxosToRemove);
                return { feeInputs, updatedInputsToAggregate: currentInputsToAggregate };
            }

            const sortedUTXOs = this.sortUTXOsByDenomination(eligiblefeeInputs, 'asc');

            // loop through sortedUTXOs and sum the denominations until the sum is greater than or equal to the fee
            let sum = BigInt(0);
            const feeInputs: UTXO[] = [];
            for (const utxo of sortedUTXOs) {
                sum += BigInt(denominations[utxo.denomination!]);
                feeInputs.push(utxo);
                if (sum >= fee) {
                    return { feeInputs, updatedInputsToAggregate: currentInputsToAggregate };
                }
            }

            // Accept a 25% difference between the sum and the fee
            if (sum < fee && sum > (fee * 3n) / 4n) {
                console.warn(`Unable to find inputs to cover entire tx fee, wanted ${fee} but using ${sum} instead`);
                return { feeInputs, updatedInputsToAggregate: currentInputsToAggregate };
            }

            // If we can't cover the fee with available inputs, remove the smallest input from inputsToAggregate and try again
            console.warn(`Unable to find inputs to cover fee, removing input from aggregation and retrying`);
            // Sort by denomination ascending to remove the smallest first
            const sortedInputsToAggregate = this.sortUTXOsByDenomination(currentInputsToAggregate, 'asc');
            currentInputsToAggregate = sortedInputsToAggregate.slice(1); // Remove the first (smallest) input
        }

        throw new Error(
            `Unable to find inputs to cover fee, wanted ${fee} but got 0 after removing all inputs from aggregation`,
        );
    }

    // gets the input UTXOs whose value equals the amount to aggregate, i.e. valueToAggregate
    private getInputsToAggregate(smallDenominationsUTXOs: UTXO[], valueToAggregate: bigint): UTXO[] {
        const sortedUTXOs = this.sortUTXOsByDenomination(smallDenominationsUTXOs, 'asc');
        const inputsToAggregate: UTXO[] = [];
        for (const utxo of sortedUTXOs) {
            inputsToAggregate.push(utxo);
            if (
                inputsToAggregate.reduce((sum, utxo) => sum + BigInt(denominations[utxo.denomination!]), BigInt(0)) >=
                valueToAggregate
            ) {
                return inputsToAggregate;
            }
        }
        throw new Error(
            `Unable to find inputs to aggregate, wanted ${valueToAggregate} but got ${inputsToAggregate.reduce((sum, utxo) => sum + BigInt(denominations[utxo.denomination!]), BigInt(0))}`,
        );
    }
}
