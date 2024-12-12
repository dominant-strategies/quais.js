import assert from 'assert';
import { QiHDWallet } from '../../wallet/qi-hdwallet.js';
import { Mnemonic } from '../../wallet/mnemonic.js';
import { Zone } from '../../constants/zones.js';
import { MockProvider } from './mockProvider.js';
import { QiTransaction } from '../../transaction/index.js';
import { Block } from '../../providers/index.js';

class TestQiHDWallet extends QiHDWallet {
    public async checkGasLimit(tx: QiTransaction, zone: Zone): Promise<boolean> {
        return this['_verifyGasLimit'](tx, zone);
    }
}

interface GasLimitTestCase {
    name: string;
    mnemonic: string;
    zone: Zone;
    blockGasLimit: bigint;
    estimatedGas: bigint;
    expectedResult: boolean;
}

const testMnemonic = 'test test test test test test test test test test test junk';

describe('QiHDWallet: Gas Limit Tests', () => {
    const testCases: GasLimitTestCase[] = [
        {
            name: 'Gas limit is sufficient (well below 90%)',
            mnemonic: testMnemonic,
            zone: Zone.Cyprus1,
            blockGasLimit: BigInt(30000),
            estimatedGas: BigInt(21000), // 70% of block gas limit
            expectedResult: true,
        },
        {
            name: 'Gas limit is insufficient (above 90%)',
            mnemonic: testMnemonic,
            zone: Zone.Cyprus1,
            blockGasLimit: BigInt(20000),
            estimatedGas: BigInt(19000), // 95% of block gas limit
            expectedResult: false,
        },
        {
            name: 'Gas limit exactly at 90%',
            mnemonic: testMnemonic,
            zone: Zone.Cyprus1,
            blockGasLimit: BigInt(20000),
            estimatedGas: BigInt(18000), // exactly 90% of block gas limit
            expectedResult: true,
        },
        {
            name: 'Gas limit slightly below 90%',
            mnemonic: testMnemonic,
            zone: Zone.Cyprus1,
            blockGasLimit: BigInt(20000),
            estimatedGas: BigInt(17900), // 89.5% of block gas limit
            expectedResult: true,
        },
        {
            name: 'Gas limit slightly above 90%',
            mnemonic: testMnemonic,
            zone: Zone.Cyprus1,
            blockGasLimit: BigInt(20000),
            estimatedGas: BigInt(18100), // 90.5% of block gas limit
            expectedResult: false,
        },
    ];

    testCases.forEach((testCase) => {
        it(testCase.name, async () => {
            const mnemonic = Mnemonic.fromPhrase(testCase.mnemonic);
            const wallet = TestQiHDWallet.fromMnemonic(mnemonic);

            const mockProvider = new MockProvider({ network: BigInt(1) });

            mockProvider.getBlock = async () => {
                return {
                    header: {
                        gasLimit: testCase.blockGasLimit,
                    },
                } as Block;
            };

            mockProvider.estimateGas = async () => {
                return testCase.estimatedGas;
            };

            wallet.connect(mockProvider);

            const tx = new QiTransaction();

            const result = await wallet.checkGasLimit(tx, testCase.zone);
            assert.equal(
                result,
                testCase.expectedResult,
                `Expected gas limit check to return ${testCase.expectedResult} but got ${result}`,
            );
        });
    });

    it('should throw error when provider is not set', async () => {
        const mnemonic = Mnemonic.fromPhrase(testMnemonic);
        const wallet = TestQiHDWallet.fromMnemonic(mnemonic);
        const tx = new QiTransaction();

        await assert.rejects(async () => await wallet.checkGasLimit(tx, Zone.Cyprus1), {
            message: 'Provider is not set',
        });
    });

    it('should throw error when block cannot be retrieved', async () => {
        const mnemonic = Mnemonic.fromPhrase(testMnemonic);
        const wallet = TestQiHDWallet.fromMnemonic(mnemonic);
        const mockProvider = new MockProvider({ network: BigInt(1) });

        mockProvider.getBlock = async () => null;

        wallet.connect(mockProvider);
        const tx = new QiTransaction();

        await assert.rejects(async () => await wallet.checkGasLimit(tx, Zone.Cyprus1), {
            message: 'Failed to get the current block',
        });
    });
});
