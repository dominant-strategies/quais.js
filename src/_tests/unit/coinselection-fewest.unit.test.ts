import assert from 'assert';
import { FewestCoinSelector } from '../../transaction/coinselector-fewest.js';
import { UTXO, denominations } from '../../transaction/utxo.js';

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
            const result = selector.performSelection({ target: targetSpend });

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
            const result = selector.performSelection({ target: targetSpend });

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
            const result = selector.performSelection({ target: targetSpend });

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
            const availableUTXOs = createUTXOs([2, 5, 6]); // 1510 Qit
            const targetSpend = denominations[4] + denominations[6]; // 1100 Qit
            const selector = new FewestCoinSelector(availableUTXOs);
            const result = selector.performSelection({ target: targetSpend });

            // 2 UTXOs should have been selected for a total of 1100 Qit
            assert.strictEqual(result.inputs.length, 2);
            const inputValue =
                denominations[result.inputs[0].denomination!] + denominations[result.inputs[1].denomination!];
            assert.strictEqual(inputValue, denominations[5] + denominations[6]);
            // Two 1100 Qit UTXOs should have been outputed
            const sortedSpendOutputs = result.spendOutputs.sort((a, b) => a.denomination! - b.denomination!);
            assert.strictEqual(sortedSpendOutputs.length, 2);
            assert.strictEqual(sortedSpendOutputs[0].denomination, 4);
            assert.strictEqual(sortedSpendOutputs[1].denomination, 6);

            // 400 Qit should be returned in change
            assert.strictEqual(result.changeOutputs.length, 4);
            assert.strictEqual(result.changeOutputs[0].denomination, 4);
            assert.strictEqual(result.changeOutputs[1].denomination, 4);
            assert.strictEqual(result.changeOutputs[2].denomination, 4);
            assert.strictEqual(result.changeOutputs[3].denomination, 4);
        });
    });

    describe('Error cases', function () {
        it('throws an error when there are insufficient funds', function () {
            const selector = new FewestCoinSelector(createUTXOs([0, 0]));
            assert.throws(() => selector.performSelection({ target: denominations[3] }), /Insufficient funds/);
        });

        it('throws an error when no UTXOs are available', function () {
            const selector = new FewestCoinSelector([]);
            assert.throws(() => selector.performSelection({ target: denominations[2] }), /No UTXOs available/);
        });

        it('throws an error when the target amount is negative', function () {
            const selector = new FewestCoinSelector(createUTXOs([2, 2]));
            assert.throws(
                () => selector.performSelection({ target: -denominations[1] }),
                /Target amount must be greater than 0/,
            );
        });
    });

    // Helper to sum UTXO denomination values
    function sumOutputs(outputs: UTXO[]): bigint {
        return outputs.reduce((sum, o) => sum + BigInt(denominations[o.denomination!]), BigInt(0));
    }

    describe('increaseFee', function () {
        it('reduces change outputs when sufficient change is available (fee=0)', function () {
            const availableUTXOs = createUTXOs([3]); // 50 units
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection({ target: denominations[2] }); // target=10, fee=0

            // Initial: inputs=50, spend=10, change=40, implicitFee=0
            assert.strictEqual(sumOutputs(selector.changeOutputs), BigInt(40));

            selector.increaseFee(denominations[2]); // +10 fee

            // Change should decrease by 10: 40 - 10 = 30
            assert.strictEqual(sumOutputs(selector.changeOutputs), BigInt(30));
            assert.strictEqual(selector.selectedUTXOs.length, 1); // no new inputs
            // Implicit fee = 50 - 10 - 30 = 10
            assert.strictEqual(
                selector.totalInputValue - sumOutputs(selector.spendOutputs) - sumOutputs(selector.changeOutputs),
                BigInt(10),
            );
        });

        it('adds inputs when change is insufficient (fee=0, no excess)', function () {
            const availableUTXOs = createUTXOs([2, 2, 2]); // three 10-unit UTXOs
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection({ target: denominations[2] * BigInt(2) }); // target=20

            // Initial: inputs=20, spend=20, change=0
            assert.strictEqual(selector.selectedUTXOs.length, 2);

            selector.increaseFee(denominations[2]); // +10 fee

            // Should add 3rd UTXO, no excess change
            assert.strictEqual(selector.selectedUTXOs.length, 3);
            assert.strictEqual(selector.totalInputValue, BigInt(30));
            assert.strictEqual(sumOutputs(selector.changeOutputs), BigInt(0));
        });

        it('adds inputs with excess returned as change (fee=0)', function () {
            const availableUTXOs = createUTXOs([2, 2]); // two 10-unit UTXOs
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection({ target: denominations[2] }); // target=10

            // Initial: inputs=10, spend=10, change=0
            selector.increaseFee(denominations[1]); // +5 fee

            // Must add 2nd UTXO (10), excess = 10 - 5 = 5 returned as change
            assert.strictEqual(selector.selectedUTXOs.length, 2);
            assert.strictEqual(selector.totalInputValue, BigInt(20));
            assert.strictEqual(sumOutputs(selector.changeOutputs), BigInt(5));
            // Implicit fee = 20 - 10 - 5 = 5
            assert.strictEqual(
                selector.totalInputValue - sumOutputs(selector.spendOutputs) - sumOutputs(selector.changeOutputs),
                BigInt(5),
            );
        });

        it('correctly accounts for original fee when adding inputs (regression)', function () {
            // This is the key regression test: performSelection with non-zero fee,
            // then increaseFee that triggers path 2 (needs new inputs).
            // The old code computed change as (totalInputValue - target - additionalFee),
            // omitting the original fee, which made the implicit fee too low.
            const availableUTXOs = createUTXOs([2, 2, 2]); // three 10-unit UTXOs
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection({ target: denominations[2], fee: denominations[1] }); // target=10, fee=5

            // Initial: inputs=20, spend=10, change=20-10-5=5, implicitFee=5
            assert.strictEqual(selector.totalInputValue, BigInt(20));
            assert.strictEqual(sumOutputs(selector.changeOutputs), BigInt(5));

            selector.increaseFee(denominations[2]); // +10 additional fee

            // Change(5) < additionalFee(10), so path 2 is taken:
            // - consume all change, remainingFee = 10 - 5 = 5
            // - add 3rd UTXO (10), remainingFee = 5 - 10 = -5
            // - excess change = 5
            assert.strictEqual(selector.selectedUTXOs.length, 3);
            assert.strictEqual(selector.totalInputValue, BigInt(30));
            assert.strictEqual(sumOutputs(selector.changeOutputs), BigInt(5));
            // Implicit fee must be original(5) + additional(10) = 15
            assert.strictEqual(
                selector.totalInputValue - sumOutputs(selector.spendOutputs) - sumOutputs(selector.changeOutputs),
                BigInt(15),
            );
        });

        it('correctly reduces change with non-zero original fee (path 1, regression)', function () {
            const availableUTXOs = createUTXOs([4]); // 100-unit UTXO
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection({ target: denominations[3], fee: denominations[2] }); // target=50, fee=10

            // Initial: inputs=100, spend=50, change=40, implicitFee=10
            assert.strictEqual(sumOutputs(selector.changeOutputs), BigInt(40));

            selector.increaseFee(denominations[1]); // +5 additional fee

            // Path 1: change(40) >= additionalFee(5), new change = 40 - 5 = 35
            assert.strictEqual(sumOutputs(selector.changeOutputs), BigInt(35));
            assert.strictEqual(selector.selectedUTXOs.length, 1); // no new inputs
            // Implicit fee = 100 - 50 - 35 = 15
            assert.strictEqual(
                selector.totalInputValue - sumOutputs(selector.spendOutputs) - sumOutputs(selector.changeOutputs),
                BigInt(15),
            );
        });

        it('fails when no additional inputs are available', function () {
            const availableUTXOs = createUTXOs([2, 2]); // two 10-unit UTXOs
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection({ target: denominations[2] * BigInt(2) }); // target=20

            // All UTXOs used, no change
            selector.increaseFee(denominations[2]); // +10 fee

            // No unused UTXOs available, change stays empty
            assert.strictEqual(selector.selectedUTXOs.length, 2);
            assert.strictEqual(sumOutputs(selector.changeOutputs), BigInt(0));
        });
    });

    describe('decreaseFee', function () {
        it('increases change outputs when inputs cannot be removed', function () {
            const availableUTXOs = createUTXOs([3]); // 50-unit UTXO
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection({ target: denominations[3] }); // target=50

            // Initial: inputs=50, spend=50, change=0, implicitFee=0
            selector.decreaseFee(denominations[2]); // reduce fee by 10

            // Can't remove the only input, so excess becomes change
            assert.strictEqual(selector.selectedUTXOs.length, 1);
            assert.strictEqual(sumOutputs(selector.changeOutputs), BigInt(10));
        });

        it('preserves existing change when adding fee reduction (regression)', function () {
            // This is the key regression test: with existing change outputs,
            // decreaseFee must ADD excess to existing change, not replace it.
            // The old code called adjustChangeOutputs(excessValue) which replaced
            // the existing change entirely.
            const availableUTXOs = createUTXOs([4]); // 100-unit UTXO
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection({ target: denominations[3], fee: denominations[2] }); // target=50, fee=10

            // Initial: inputs=100, spend=50, change=40, implicitFee=10
            assert.strictEqual(sumOutputs(selector.changeOutputs), BigInt(40));

            selector.decreaseFee(denominations[1]); // reduce fee by 5

            // Can't remove the 100-unit input (would go below target).
            // Excess 5 must be ADDED to existing change: 40 + 5 = 45
            assert.strictEqual(selector.selectedUTXOs.length, 1);
            assert.strictEqual(sumOutputs(selector.changeOutputs), BigInt(45));
            // Implicit fee = 100 - 50 - 45 = 5 = original(10) - reduction(5)
            assert.strictEqual(
                selector.totalInputValue - sumOutputs(selector.spendOutputs) - sumOutputs(selector.changeOutputs),
                BigInt(5),
            );
        });

        it('removes inputs when possible and returns remaining excess as change', function () {
            const availableUTXOs = createUTXOs([2, 2]); // two 10-unit UTXOs
            const selector = new FewestCoinSelector(availableUTXOs);
            selector.performSelection({ target: denominations[2] }); // target=10

            // Initial: selects single 10-unit UTXO, change=0
            assert.strictEqual(selector.selectedUTXOs.length, 1);

            // First increase fee to get 2 inputs
            selector.increaseFee(denominations[1]); // +5 fee
            // Now: inputs=[10,10]=20, spend=10, change=5, fee=5
            assert.strictEqual(selector.selectedUTXOs.length, 2);

            // Now decrease fee by 10 - should remove one input
            selector.decreaseFee(denominations[2]); // -10

            // The 10-unit input can be removed (20-10=10 >= target 10)
            assert.strictEqual(selector.selectedUTXOs.length, 1);
            assert.strictEqual(selector.totalInputValue, BigInt(10));
            // excessValue = 10 - 10 = 0, plus existing change(5) preserved
            // Actually after removing input worth 10, excessValue = 0, so
            // the existing change outputs remain unchanged at 5
            assert.strictEqual(sumOutputs(selector.changeOutputs), BigInt(5));
        });
    });
});
