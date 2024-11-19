import assert from 'assert';
import { loadTests } from '../utils.js';
import { QiHDWallet } from '../../wallet/qi-hdwallet.js';
import { Mnemonic } from '../../wallet/mnemonic.js';
import { Zone } from '../../constants/zones.js';
import { UTXO } from '../../quais.js';

// Custom error class for controlled exit
class TestCompletionError extends Error {
    constructor(public readonly capturedArgs: any[]) {
        super('Test completed successfully');
        this.name = 'TestCompletionError';
    }
}

function sortByDenomination(inputs: UTXO[], order: 'asc' | 'desc' = 'asc') {
    return inputs.sort((a, b) =>
        order === 'asc' ? (a.denomination || 0) - (b.denomination || 0) : (b.denomination || 0) - (a.denomination || 0),
    );
}

interface AggregateTestCase {
    mnemonic: string;
    zone: Zone;
    outpointInfos: Array<{
        outpoint: {
            txhash: string;
            index: number;
            denomination: number;
            lock?: number;
        };
        address: string;
        zone: Zone;
        account: number;
    }>;
    addressesToAdd: Array<{
        account: number;
        addressIndex: number;
    }>;
    fee: number;
    expected: {
        selection: {
            inputs: Array<{
                txhash: string;
                index: number;
                address: string;
                denomination: number;
            }>;
            spendOutputs: Array<{
                denomination: number;
            }>;
            changeOutputs: Array<{
                denomination: number;
            }>;
        };
        inputPubKeys: string[];
        sendAddresses: string[];
        changeAddresses: string[];
    };
}

describe('QiHDWallet.aggregate', () => {
    const testCases = loadTests<AggregateTestCase>('qi-wallet-aggregate');

    testCases.forEach((testCase) => {
        it(`should correctly aggregate UTXOs for wallet with mnemonic`, async () => {
            // Create wallet from mnemonic
            const mnemonic = Mnemonic.fromPhrase(testCase.mnemonic);
            const wallet = QiHDWallet.fromMnemonic(mnemonic);

            // Mock provider with minimal implementation
            wallet.connect({
                getNetwork: async () => ({ chainId: BigInt(1) }),
            } as any);

            // Add addresses to wallet before importing outpoints
            for (const addressToAdd of testCase.addressesToAdd) {
                wallet.addAddress(addressToAdd.account, addressToAdd.addressIndex);
            }

            // Import test outpoints
            wallet.importOutpoints(testCase.outpointInfos);

            // Spy on prepareTransaction and throw custom error to exit early
            wallet['prepareTransaction'] = async (...args) => {
                throw new TestCompletionError(args);
            };

            try {
                await wallet.aggregate(testCase.zone as any);
                assert.fail('Expected TestCompletionError to be thrown');
            } catch (error) {
                if (error instanceof TestCompletionError) {
                    const [selection, inputPubKeys, sendAddresses, changeAddresses] = error.capturedArgs;

                    const sortedInputs = sortByDenomination(selection.inputs, 'desc');
                    const sortedExpectedInputs = sortByDenomination(
                        testCase.expected.selection.inputs as UTXO[],
                        'desc',
                    );

                    // Verify selection with complete input properties
                    assert.deepStrictEqual(
                        sortedInputs.map((input: UTXO) => ({
                            txhash: input.txhash,
                            index: input.index,
                            address: input.address,
                            denomination: input.denomination,
                        })),
                        sortedExpectedInputs,
                        `inputs: expected: ${JSON.stringify(sortedExpectedInputs, null, 2)}, \nactual: ${JSON.stringify(sortedInputs, null, 2)}`,
                    );

                    // Verify spendOutputs
                    assert.deepStrictEqual(
                        selection.spendOutputs.map((output: UTXO) => ({ denomination: output.denomination })),
                        testCase.expected.selection.spendOutputs,
                        `spendOutputs: expected: ${JSON.stringify(testCase.expected.selection.spendOutputs, null, 2)}, \nactual: ${JSON.stringify(selection.spendOutputs, null, 2)}`,
                    );

                    // Verify changeOutputs
                    assert.deepStrictEqual(
                        selection.changeOutputs.map((output: UTXO) => ({ denomination: output.denomination })),
                        testCase.expected.selection.changeOutputs,
                        `changeOutputs: expected: ${JSON.stringify(testCase.expected.selection.changeOutputs, null, 2)}, \nactual: ${JSON.stringify(selection.changeOutputs, null, 2)}`,
                    );

                    // Verify input public keys
                    assert.deepStrictEqual(
                        inputPubKeys,
                        testCase.expected.inputPubKeys,
                        `inputPubKeys: expected: ${JSON.stringify(testCase.expected.inputPubKeys, null, 2)}, \nactual: ${JSON.stringify(inputPubKeys, null, 2)}`,
                    );

                    // Verify addresses
                    assert.deepStrictEqual(
                        sendAddresses,
                        testCase.expected.sendAddresses,
                        `sendAddresses: expected: ${JSON.stringify(testCase.expected.sendAddresses, null, 2)}, \nactual: ${JSON.stringify(sendAddresses, null, 2)}`,
                    );
                    assert.deepStrictEqual(
                        changeAddresses,
                        testCase.expected.changeAddresses,
                        `changeAddresses: expected: ${JSON.stringify(testCase.expected.changeAddresses, null, 2)}, \nactual: ${JSON.stringify(changeAddresses, null, 2)}`,
                    );
                } else {
                    throw error;
                }
            }
        });
    });
});
