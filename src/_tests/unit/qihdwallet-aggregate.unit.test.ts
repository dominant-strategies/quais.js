import assert from 'assert';
import { loadTests } from '../utils.js';
import { QiHDWallet } from '../../wallet/qi-hdwallet.js';
import { Mnemonic } from '../../wallet/mnemonic.js';
import { Zone } from '../../constants/zones.js';
import { QiTransactionResponse } from '../../quais.js';
import { MockProvider } from './mockProvider.js';
import { TxInput, TxOutput } from '../../transaction/utxo.js';

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
        txInputs: Array<TxInput>;
        txOutputs: Array<TxOutput>;
    };
}

// helper method to sort txInputs by txhash
const sortTxInputs = (txInputs: Array<TxInput> | undefined) => {
    return (txInputs || []).sort((a, b) => a.txhash.localeCompare(b.txhash));
};

// helper method to sort txOutputs by address and filtering out 'lock'
const sortTxOutputs = (txOutputs: Array<TxOutput> | undefined) => {
    return (txOutputs || [])
        .map((txOutput) => ({
            address: txOutput.address.toLowerCase(),
            denomination: txOutput.denomination,
        }))
        .sort((a, b) => a.address.localeCompare(b.address));
};

describe('QiHDWallet.aggregate', () => {
    const testCases = loadTests<AggregateTestCase>('qi-wallet-aggregate');

    testCases.forEach((testCase) => {
        it(`should correctly aggregate UTXOs for QiHDWallet`, async () => {
            const mnemonic = Mnemonic.fromPhrase(testCase.mnemonic);
            const wallet = QiHDWallet.fromMnemonic(mnemonic);

            const mockProvider = new MockProvider({ network: BigInt(1) });

            wallet.connect(mockProvider);

            // Add addresses to wallet before importing outpoints
            for (const addressToAdd of testCase.addressesToAdd) {
                wallet.addAddress(addressToAdd.account, addressToAdd.addressIndex);
            }

            // Import test outpoints
            wallet.importOutpoints(testCase.outpointInfos, 'BIP44:external');

            const txResponse = (await wallet.aggregate(testCase.zone)) as QiTransactionResponse;

            // assert txResponse is not null or undefined
            assert(txResponse !== null && txResponse !== undefined, 'txResponse is null or undefined');

            // assert expected txInputs are equal to captured txInputs
            assert.deepStrictEqual(
                sortTxInputs(txResponse.txInputs),
                sortTxInputs(testCase.expected.txInputs),
                `txInputs: expected: ${JSON.stringify(testCase.expected.txInputs, null, 2)}, \nactual: ${JSON.stringify(txResponse.txInputs, null, 2)}`,
            );

            // assert expected txOutputs are equal to captured txOutputs
            assert.deepStrictEqual(
                sortTxOutputs(txResponse.txOutputs),
                sortTxOutputs(testCase.expected.txOutputs),
                `txOutputs: expected: ${JSON.stringify(testCase.expected.txOutputs, null, 2)}, \nactual: ${JSON.stringify(txResponse.txOutputs, null, 2)}`,
            );
        });
    });
});
