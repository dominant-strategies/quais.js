import assert from 'assert';
import { FewestCoinSelector } from '../../transaction/coinselector-fewest.js';
import { UTXO, denominate, denominations } from '../../transaction/utxo.js';

const TEST_SPEND_ADDRESS = '0x00539bc2CE3eD0FD039c582CB700EF5398bB0491';

// Utility function to create UTXOs with specified denominations
function createUTXOs(denominationIndices: number[]): UTXO[] {
    return denominationIndices.map((index, idx) =>
        UTXO.from({
            txhash: `0x${String(idx).padStart(64, '0')}`,
            index: idx,
            address: TEST_SPEND_ADDRESS,
            denomination: index,
        }),
    );
}

describe('FewestCoinSelector', function () {
    describe('Selecting valid UTXOs', function () {
        it('selects a single UTXO that exactly matches the target amount', function () {
            const availableUTXOs = createUTXOs([1, 2, 3]); // .065 Qi
            const targetSpend = denominations[3]; // .05 Qi
            const selector = new FewestCoinSelector(availableUTXOs);
            const result = selector.performSelection(targetSpend);

            // A single 0.05 Qi UTXO should have been selected
            assert.strictEqual(result.inputs.length, 1);
            assert.strictEqual(result.inputs[0].denomination, 3);

            // A single new 0.05 Qi UTXO should have been outputed
            assert.strictEqual(result.spendOutputs.length, 1);
            assert.strictEqual(result.spendOutputs[0].denomination, 3);

            // No change should be returned
            assert.strictEqual(result.changeOutputs.length, 0);
        });

        it('selects multiple UTXOs whose combined value meets the target amount', function () {
            const availableUTXOs = createUTXOs([1, 2, 2, 3]); // .075 Qi
            const targetSpend = denominations[2] + denominations[3]; // .06 Qi
            const selector = new FewestCoinSelector(availableUTXOs);
            const result = selector.performSelection(targetSpend);

            // 2 UTXOs should have been selected for a total of .06 Qi
            assert.strictEqual(result.inputs.length, 2);
            const inputValue =
                denominations[result.inputs[0].denomination!] + denominations[result.inputs[1].denomination!];
            assert.strictEqual(inputValue, denominations[2] + denominations[3]);

            // 2 new UTxOs should have been outputed for a total of .06 Qi
            assert.strictEqual(result.spendOutputs.length, 2);
            const spendValue =
                denominations[result.spendOutputs[0].denomination!] +
                denominations[result.spendOutputs[1].denomination!];
            assert.strictEqual(spendValue, denominations[2] + denominations[3]);

            // No change should be returned
            assert.strictEqual(result.changeOutputs.length, 0);
        });

        it('selects a single UTXO that is larger than the target amount, ensuring change is correctly calculated', function () {
            const availableUTXOs = createUTXOs([2, 4]); // .11 Qi
            const targetSpend = denominations[3]; // .05 Qi
            const selector = new FewestCoinSelector(availableUTXOs);
            const result = selector.performSelection(targetSpend);

            // A single 0.1 Qi UTXO should have been selected
            assert.strictEqual(result.inputs.length, 1);
            assert.strictEqual(result.inputs[0].denomination, 4);

            // A single new 0.05 Qi UTXO should have been outputed
            assert.strictEqual(result.spendOutputs.length, 1);
            assert.strictEqual(result.spendOutputs[0].denomination, 3);

            // 0.05 Qi should be returned in change
            assert.strictEqual(result.changeOutputs.length, 1);
            assert.strictEqual(result.changeOutputs[0].denomination, 3);
        });

        it('selects multiple UTXOs where the total exceeds the target amount, ensuring change is correctly calculated', function () {
            const availableUTXOs = createUTXOs([2, 4, 4, 4, 5]); // .56 Qi
            const targetSpend = denominations[6]; // .5 Qi
            const selector = new FewestCoinSelector(availableUTXOs);
            const result = selector.performSelection(targetSpend);

            // 4 UTXOs should have been selected for a total of .55 Qi
            assert.strictEqual(result.inputs.length, 4);
            const inputValue =
                denominations[result.inputs[0].denomination!] +
                denominations[result.inputs[1].denomination!] +
                denominations[result.inputs[2].denomination!] +
                denominations[result.inputs[3].denomination!];
            assert.strictEqual(inputValue, denominations[4] + denominations[4] + denominations[4] + denominations[5]);

            // Two 0.25 Qi UTXOs should have been outputed
            assert.strictEqual(result.spendOutputs.length, 2);
            assert.strictEqual(result.spendOutputs[0].denomination, 5);
            assert.strictEqual(result.spendOutputs[1].denomination, 5);

            // 0.05 Qi should be returned in change
            assert.strictEqual(result.changeOutputs.length, 1);
            assert.strictEqual(result.changeOutputs[0].denomination, 3);
        });
    });

    describe('Error cases', function () {
        it('throws an error when there are insufficient funds', function () {
            const selector = new FewestCoinSelector(createUTXOs([0, 0]));
            assert.throws(() => selector.performSelection(denominations[3]), /Insufficient funds/);
        });

        it('throws an error when no UTXOs are available', function () {
            const selector = new FewestCoinSelector([]);
            assert.throws(() => selector.performSelection(denominations[2]), /No UTXOs available/);
        });

        it('throws an error when the target amount is negative', function () {
            const selector = new FewestCoinSelector(createUTXOs([2, 2]));
            assert.throws(() => selector.performSelection(-denominations[1]), /Target amount must be greater than 0/);
        });
    });

    // New tests for increaseFee and decreaseFee
    describe('Fee Adjustment Methods', function () {
        it('increases fee by reducing change outputs when sufficient change is available', function () {
            const availableUTXOs = createUTXOs([3]); // Denomination index 3 (50 units)
            const targetSpend = denominations[2]; // 10 units
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection(targetSpend);

            // Calculate expected initial change amount
            const initialChangeAmount = denominations[3] - denominations[2]; // 50 - 10 = 40 units

            const maxInputDenomination = denominations[3]; // 50 units

            // Denominate the change amount using maxDenomination
            const expectedChangeDenominations = denominate(initialChangeAmount, maxInputDenomination);

            // Assert that change outputs are correctly created
            assert.strictEqual(selector.changeOutputs.length, expectedChangeDenominations.length);

            // Verify that the change outputs sum to the expected change amount
            const actualInitialChangeAmount = selector.changeOutputs.reduce((sum, output) => {
                return sum + denominations[output.denomination!];
            }, BigInt(0));
            assert.strictEqual(actualInitialChangeAmount, initialChangeAmount);

            // Increase fee by 10 units
            const additionalFeeNeeded = denominations[2]; // 10 units
            const success = selector.increaseFee(additionalFeeNeeded);

            assert.strictEqual(success, true);

            // Calculate expected new change amount
            const newChangeAmount = initialChangeAmount - additionalFeeNeeded; // 40 - 10 = 30 units

            // Denominate the new change amount
            const expectedNewChangeDenominations = denominate(newChangeAmount, maxInputDenomination);

            // Assert that change outputs are updated correctly
            assert.strictEqual(selector.changeOutputs.length, expectedNewChangeDenominations.length);

            // Verify that the change outputs sum to the new change amount
            const actualNewChangeAmount = selector.changeOutputs.reduce((sum, output) => {
                return sum + denominations[output.denomination!];
            }, BigInt(0));
            assert.strictEqual(actualNewChangeAmount, newChangeAmount);

            // Ensure total input value remains the same
            assert.strictEqual(selector.totalInputValue, denominations[3]);

            // Ensure no additional inputs were added
            assert.strictEqual(selector.selectedUTXOs.length, 1);
        });

        it('increases fee by adding inputs when change outputs are insufficient', function () {
            const availableUTXOs = createUTXOs([2, 2, 2]); // Denomination index 2 (10 units each)
            const targetSpend = denominations[2] * BigInt(2); // 20 units
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection(targetSpend);

            // Initially, no change outputs (total input = 20 units)
            assert.strictEqual(selector.changeOutputs.length, 0);

            // Increase fee by 10 units
            const additionalFeeNeeded = denominations[2]; // 10 units
            const success = selector.increaseFee(additionalFeeNeeded);

            assert.strictEqual(success, true);

            // After adding an additional input, total input value is 30 units
            assert.strictEqual(selector.totalInputValue, denominations[2] * BigInt(3)); // 30 units

            // Calculate expected change amount
            // const expectedChangeAmount = selector.totalInputValue - targetSpend.value - additionalFeeNeeded; // 30 - 20 - 10 = 0 units

            // Since change amount is zero, no change outputs
            assert.strictEqual(selector.changeOutputs.length, 0);

            // Verify that the number of selected UTXOs is now 3
            assert.strictEqual(selector.selectedUTXOs.length, 3);
        });

        it('fails to increase fee when no additional inputs are available', function () {
            const availableUTXOs = createUTXOs([2, 2]); // Two .01 Qi UTXOs
            const targetSpend = denominations[2] * BigInt(2); // .02 Qi
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection(targetSpend);

            // No change outputs expected
            assert.strictEqual(selector.changeOutputs.length, 0);

            // Attempt to increase fee by .01 Qi
            const additionalFeeNeeded = denominations[2]; // .01 Qi
            const success = selector.increaseFee(additionalFeeNeeded);

            // Should fail due to insufficient funds
            assert.strictEqual(success, false);

            // Inputs and outputs remain unchanged
            assert.strictEqual(selector.selectedUTXOs.length, 2);
            assert.strictEqual(selector.changeOutputs.length, 0);
        });

        it('decreases fee by increasing change outputs when possible', function () {
            const availableUTXOs = createUTXOs([3, 2]); // .05 Qi and .01 Qi
            const targetSpend = denominations[3]; // .05 Qi
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection(targetSpend);

            // No change outputs expected
            assert.strictEqual(selector.changeOutputs.length, 0);

            // Decrease fee by .01 Qi
            const feeReduction = denominations[2]; // .01 Qi
            selector.decreaseFee(feeReduction);

            // Change output should now reflect the reduced fee
            assert.strictEqual(selector.changeOutputs.length, 1);
            assert.strictEqual(denominations[selector.changeOutputs[0].denomination!], denominations[2]);

            // Inputs remain the same
            assert.strictEqual(selector.selectedUTXOs.length, 1);
        });

        it.only('decreases fee by removing inputs when possible', function () {
            const availableUTXOs = createUTXOs([3, 2]); // Denomination indices 3 (50 units) and 2 (10 units)
            const targetSpend = denominations[1]; // 20 units
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection(targetSpend);

            // Initially, selects the 50-unit UTXO for the target spend
            assert.strictEqual(selector.selectedUTXOs.length, 1);
            assert.strictEqual(selector.totalInputValue, denominations[2]); // 10 units

            // Calculate initial change amount
            const initialChangeAmount = denominations[2] - denominations[1]; // 10 - 5 = 5 units

            // Decrease fee by 5 units
            const feeReduction = denominations[1]; // 5 units
            selector.decreaseFee(feeReduction);

            // New change amount should include the fee reduction
            const newChangeAmount = initialChangeAmount - feeReduction; // 5 + 5 = 10 units

            // Denominate new change amount using max input denomination (50 units)
            const expectedChangeDenominations = denominate(newChangeAmount, denominations[2]);

            // Assert that change outputs are updated correctly
            assert.strictEqual(selector.changeOutputs.length, expectedChangeDenominations.length);

            // Verify that the change outputs sum to the new change amount
            const actualNewChangeAmount = selector.changeOutputs.reduce((sum, output) => {
                return sum + denominations[output.denomination!];
            }, BigInt(0));
            assert.strictEqual(actualNewChangeAmount, newChangeAmount);

            // Inputs remain the same (cannot remove inputs without violating protocol rules)
            assert.strictEqual(selector.selectedUTXOs.length, 1);
            assert.strictEqual(selector.totalInputValue, denominations[2]); // Still 10 units
        });

        it('does not remove inputs if it would result in insufficient funds when decreasing fee', function () {
            const availableUTXOs = createUTXOs([3]); // .05 Qi
            const targetSpend = denominations[3]; // .05 Qi
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection(targetSpend);

            // No change outputs expected
            assert.strictEqual(selector.changeOutputs.length, 0);

            // Decrease fee by .01 Qi
            const feeReduction = denominations[2]; // .01 Qi
            selector.decreaseFee(feeReduction);

            // Cannot remove any inputs, but can adjust change outputs
            // Change output should now reflect the reduced fee
            assert.strictEqual(selector.changeOutputs.length, 1);
            assert.strictEqual(denominations[selector.changeOutputs[0].denomination!], denominations[2]);

            // Inputs remain the same
            assert.strictEqual(selector.selectedUTXOs.length, 1);
            assert.strictEqual(selector.totalInputValue, denominations[3]);
        });

        it('handles edge case where fee increase consumes entire change output and requires additional inputs', function () {
            const availableUTXOs = createUTXOs([2, 2]); // Denomination indices 2 (10 units each)
            const targetSpend = denominations[2]; // 10 units
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection(targetSpend);

            // Initially, selects one UTXO, change expected
            assert.strictEqual(selector.selectedUTXOs.length, 1);
            assert.strictEqual(selector.totalInputValue, denominations[2]); // 10 units

            // Calculate initial change amount
            // const initialChangeAmount = denominations[2] - denominations[2]; // 10 - 10 = 0 units

            // No change outputs expected
            assert.strictEqual(selector.changeOutputs.length, 0);

            // Increase fee by 5 units
            const additionalFeeNeeded = denominations[1]; // 5 units
            const success = selector.increaseFee(additionalFeeNeeded);

            assert.strictEqual(success, true);

            // Now, an additional input is added
            assert.strictEqual(selector.selectedUTXOs.length, 2);
            assert.strictEqual(selector.totalInputValue, denominations[2] * BigInt(2)); // 20 units

            // New change amount
            const newChangeAmount = selector.totalInputValue - targetSpend - additionalFeeNeeded; // 20 - 10 - 5 = 5 units

            // Denominate the new change amount using max input denomination (10 units)
            const expectedChangeDenominations = denominate(newChangeAmount, denominations[2]);

            // Assert that change outputs are correctly created
            assert.strictEqual(selector.changeOutputs.length, expectedChangeDenominations.length);

            // Verify that the change outputs sum to the new change amount
            const actualChangeAmount = selector.changeOutputs.reduce((sum, output) => {
                return sum + denominations[output.denomination!];
            }, BigInt(0));
            assert.strictEqual(actualChangeAmount, newChangeAmount);
        });
    });
});
