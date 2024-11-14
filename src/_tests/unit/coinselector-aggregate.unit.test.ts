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
    maxDenomination?: number;
    expectedOutputs: Array<{
        denomination: number;
    }>;
    expectedInputs: Array<{
        denomination: number;
        txhash: string;
        index: number;
        lock?: number;
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
                    maxDenomination: testCase.maxDenomination ?? undefined,
                });

                // Map UTXOs to same format as expected outputs before sorting
                const sortedExpectedOutputs = [...testCase.expectedOutputs].sort(sortByDenomination);
                const sortedActualOutputs = [...result.spendOutputs]
                    .map((utxo) => ({ denomination: utxo.denomination ?? 0 }))
                    .sort(sortByDenomination);

                // Verify number of outputs matches expected
                assert.strictEqual(
                    sortedActualOutputs.length,
                    sortedExpectedOutputs.length,
                    `Outputs length: Expected ${sortedExpectedOutputs.length} but got ${sortedActualOutputs.length}`,
                );

                // Verify each output denomination matches expected
                sortedActualOutputs.forEach((output, index) => {
                    assert.strictEqual(
                        output.denomination,
                        sortedExpectedOutputs[index].denomination,
                        `Outputs: Expected ${JSON.stringify(sortedExpectedOutputs[index], null, 2)} but got ${JSON.stringify(output, null, 2)}`,
                    );
                });

                // Verify no change outputs
                assert.strictEqual(result.changeOutputs.length, 0);

                // Verify expected inputs match selectedCoinResults inputs
                const sortedExpectedInputs = [...testCase.expectedInputs].sort(sortByDenomination);
                const sortedActualInputs = [...result.inputs]
                    .map((input) => ({
                        denomination: input.denomination ?? 0,
                        txhash: input.txhash,
                        index: input.index,
                    }))
                    .sort(sortByDenomination);

                sortedExpectedInputs.forEach((input, index) => {
                    assert.strictEqual(
                        sortedActualInputs[index].denomination,
                        input.denomination,
                        `Inputs: Expected ${JSON.stringify(input, null, 2)} but got ${JSON.stringify(sortedActualInputs[index], null, 2)}`,
                    );
                });

                // Verify total value conservation
                const inputValue = result.inputs.reduce(
                    (sum, input) => sum + BigInt(denominations[input.denomination!]),
                    BigInt(0),
                );
                const outputValue = result.spendOutputs.reduce(
                    (sum, output) => sum + BigInt(denominations[output.denomination!]),
                    BigInt(0),
                );
                assert.strictEqual(
                    inputValue,
                    outputValue + BigInt(testCase.fee),
                    `Input value: Expected ${inputValue} but got ${outputValue + BigInt(testCase.fee)}`,
                );
            } else {
                // Test error case
                assert.throws(() => {
                    selector.performSelection({
                        includeLocked: testCase.includeLocked,
                        fee: BigInt(testCase.fee),
                        maxDenomination: testCase.maxDenomination ?? 6,
                    });
                }, new Error(testCase.expectedError));
            }
        });
    });
});
