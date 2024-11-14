// import { describe, expect, test } from '@jest/globals';
import assert from 'assert';
import { loadTests } from '../utils.js';
import { AggregateCoinSelector } from '../../transaction/coinselector-aggregate.js';
import { UTXO, denominations } from '../../transaction/utxo.js';

interface AggregationTestCase {
    name: string;
    inputs: Array<{
        denomination: number;
        txhash: string;
        index: number;
        lock?: number;
    }>;
    fee: string;
    includeLocked: boolean;
    expectedOutputs: Array<{
        denomination: number;
    }>;
    shouldSucceed: boolean;
    expectedError?: string;
}

// Helper function to sort denomination arrays for comparison
function sortByDenomination(a: { denomination: number }, b: { denomination: number }): number {
    return a.denomination - b.denomination;
}

describe('AggregateCoinSelector', () => {
    const testCases = loadTests<AggregationTestCase>('qi-coin-aggregation');

    testCases.forEach((testCase) => {
        it(testCase.name, () => {
            // Create UTXOs from test inputs
            const utxos = testCase.inputs.map((input) => {
                const utxo = new UTXO();
                utxo.denomination = input.denomination;
                utxo.txhash = input.txhash;
                utxo.index = input.index;
                if (input.lock !== undefined) {
                    utxo.lock = input.lock;
                }
                return utxo;
            });

            // Create coin selector instance
            const selector = new AggregateCoinSelector(utxos);

            if (testCase.shouldSucceed) {
                // Test successful case
                const result = selector.performSelection({
                    includeLocked: testCase.includeLocked,
                    fee: BigInt(testCase.fee),
                });

                // Map UTXOs to same format as expected outputs before sorting
                const sortedExpectedOutputs = [...testCase.expectedOutputs].sort(sortByDenomination);
                const sortedActualOutputs = [...result.spendOutputs]
                    .map((utxo) => ({ denomination: utxo.denomination ?? 0 }))
                    .sort(sortByDenomination);

                // Verify number of outputs matches expected
                assert.strictEqual(sortedActualOutputs.length, sortedExpectedOutputs.length);

                // Verify each output denomination matches expected
                sortedActualOutputs.forEach((output, index) => {
                    assert.strictEqual(output.denomination, sortedExpectedOutputs[index].denomination);
                });

                // Verify no change outputs
                assert.strictEqual(result.changeOutputs.length, 0);

                // Verify input selection
                const expectedInputCount = testCase.includeLocked
                    ? testCase.inputs.length
                    : testCase.inputs.filter((input) => input.lock === undefined).length;
                assert.strictEqual(result.inputs.length, expectedInputCount);

                // Verify total value conservation
                const inputValue = result.inputs.reduce(
                    (sum, input) => sum + BigInt(denominations[input.denomination!]),
                    BigInt(0),
                );
                const outputValue = result.spendOutputs.reduce(
                    (sum, output) => sum + BigInt(denominations[output.denomination!]),
                    BigInt(0),
                );
                assert.strictEqual(inputValue, outputValue + BigInt(testCase.fee));
            } else {
                // Test error case
                assert.throws(() => {
                    selector.performSelection({ includeLocked: testCase.includeLocked, fee: BigInt(testCase.fee) });
                }, new Error(testCase.expectedError));
            }
        });
    });
});
