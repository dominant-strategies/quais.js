import assert from 'assert';
import { FewestCoinSelector } from '../../transaction/coinselector-fewest.js';
import { UTXOLike, denominations } from '../../transaction/utxo.js';

const TEST_SPEND_ADDRESS = '0x00539bc2CE3eD0FD039c582CB700EF5398bB0491';
const TEST_RECEIVE_ADDRESS = '0x02b9B1D30B6cCdc7d908B82739ce891463c3FA19';

// Utility function to create UTXOs (adjust as necessary)
function createUTXOs(denominations: bigint[]): UTXOLike[] {
    return denominations.map((denomination) => ({
        denomination,
        address: TEST_SPEND_ADDRESS,
    }));
}

describe('FewestCoinSelector', function () {
    describe('Selecting valid UTXOs', function () {
        it('selects a single UTXO that exactly matches the target amount', function () {
            const availableUTXOs = createUTXOs([denominations[1], denominations[2], denominations[3]]); // .065 Qi
            const targetSpend = { value: denominations[3], address: TEST_RECEIVE_ADDRESS }; // .05 Qi
            const selector = new FewestCoinSelector(availableUTXOs);
            const result = selector.performSelection(targetSpend);

            // A single 0.05 Qi UTXO should have been selected
            assert.strictEqual(result.inputs.length, 1);
            assert.strictEqual(result.inputs[0].denomination, denominations[3]);

            // A single new 0.05 Qi UTXO should have been outputed
            assert.strictEqual(result.spendOutputs.length, 1);
            assert.strictEqual(result.spendOutputs[0].denomination, denominations[3]);

            // No change should be returned
            assert.strictEqual(result.changeOutputs.length, 0);
        });

        it('selects multiple UTXOs whose combined value meets the target amount', function () {
            const availableUTXOs = createUTXOs([
                denominations[1],
                denominations[2],
                denominations[2],
                denominations[3],
            ]); // .075 Qi
            const targetSpend = { value: denominations[2] + denominations[3], address: TEST_RECEIVE_ADDRESS }; // .06 Qi
            const selector = new FewestCoinSelector(availableUTXOs);
            const result = selector.performSelection(targetSpend);

            // 2 UTXOs should have been selected for a total of .06 Qi
            assert.strictEqual(result.inputs.length, 2);
            const inputValue = result.inputs[0].denomination! + result.inputs[1].denomination!;
            assert.strictEqual(inputValue, denominations[2] + denominations[3]);

            // 2 new UTxOs should have been outputed for a total of .06 Qi
            assert.strictEqual(result.spendOutputs.length, 2);
            const spendValue = result.spendOutputs[0].denomination! + result.spendOutputs[1].denomination!;
            assert.strictEqual(spendValue, denominations[2] + denominations[3]);

            // No change should be returned
            assert.strictEqual(result.changeOutputs.length, 0);
        });

        it('selects a single UTXO that is larger than the target amount, ensuring change is correctly calculated', function () {
            const availableUTXOs = createUTXOs([denominations[2], denominations[4]]); // .11 Qi
            const targetSpend = { value: denominations[3], address: TEST_RECEIVE_ADDRESS }; // .05 Qi
            const selector = new FewestCoinSelector(availableUTXOs);
            const result = selector.performSelection(targetSpend);

            // A single 0.1 Qi UTXO should have been selected
            assert.strictEqual(result.inputs.length, 1);
            assert.strictEqual(result.inputs[0].denomination, denominations[4]);

            // A single new 0.05 Qi UTXO should have been outputed
            assert.strictEqual(result.spendOutputs.length, 1);
            assert.strictEqual(result.spendOutputs[0].denomination, denominations[3]);

            // 0.05 Qi should be returned in change
            assert.strictEqual(result.changeOutputs.length, 1);
            assert.strictEqual(result.changeOutputs[0].denomination, denominations[3]);
        });

        it('selects multiple UTXOs where the total exceeds the target amount, ensuring change is correctly calculated', function () {
            const availableUTXOs = createUTXOs([
                denominations[2],
                denominations[4],
                denominations[4],
                denominations[4],
                denominations[5],
            ]); // .56 Qi
            const targetSpend = { value: denominations[6], address: TEST_RECEIVE_ADDRESS }; // .5 Qi
            const selector = new FewestCoinSelector(availableUTXOs);
            const result = selector.performSelection(targetSpend);

            // 4 UTXOs should have been selected for a total of .55 Qi
            assert.strictEqual(result.inputs.length, 4);
            const inputValue =
                result.inputs[0].denomination! +
                result.inputs[1].denomination! +
                result.inputs[2].denomination! +
                result.inputs[3].denomination!;
            assert.strictEqual(inputValue, denominations[4] + denominations[4] + denominations[4] + denominations[5]);

            // A single new 0.5 Qi UTXO should have been outputed
            assert.strictEqual(result.spendOutputs.length, 1);
            assert.strictEqual(result.spendOutputs[0].denomination, denominations[6]);

            // 0.05 Qi should be returned in change
            assert.strictEqual(result.changeOutputs.length, 1);
            assert.strictEqual(result.changeOutputs[0].denomination, denominations[3]);
        });
    });

    describe('Selecting valid UTXOs', function () {
        it('throws an error when there are insufficient funds', function () {
            const selector = new FewestCoinSelector(createUTXOs([denominations[0], denominations[0]]));
            assert.throws(
                () => selector.performSelection({ value: denominations[3], address: TEST_RECEIVE_ADDRESS }),
                /Insufficient funds/,
            );
        });

        it('throws an error when no UTXOs are available', function () {
            const selector = new FewestCoinSelector([]);
            assert.throws(
                () => selector.performSelection({ value: denominations[2], address: TEST_RECEIVE_ADDRESS }),
                /No UTXOs available/,
            );
        });

        it('throws an error when the target amount is negative', function () {
            const selector = new FewestCoinSelector(createUTXOs([denominations[2], denominations[2]]));
            assert.throws(
                () => selector.performSelection({ value: -denominations[1], address: TEST_RECEIVE_ADDRESS }),
                /Target amount must be greater than 0/,
            );
        });
    });
});
