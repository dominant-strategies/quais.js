import assert from 'assert';
import { loadTests } from '../utils.js';
import { Mnemonic, QiHDWallet, Zone, OutpointInfo, Block, QiAddressInfo } from '../../index.js';
import { Outpoint } from '../../transaction/utxo.js';
import { MockProvider } from './mockProvider.js';

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

import dotenv from 'dotenv';
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });
dotenv.config({ path: `.env`, override: false });

interface ScanTestCase {
    name: string;
    mnemonic: string;
    provider_outpoints: Array<{
        address: string;
        outpoints: Array<Outpoint>;
    }>;
    provider_locked_balance: Array<{
        address: string;
        balance: number;
    }>;
    provider_balance: Array<{
        address: string;
        balance: number;
    }>;
    provider_blocks: Array<{
        key: string;
        block: Block;
    }>;
    expected_external_addresses: Array<QiAddressInfo>;
    expected_change_addresses: Array<QiAddressInfo>;
    expected_outpoints_info: Array<OutpointInfo>;
    expected_balance: number;
}

describe('QiHDWallet scan', async function () {
    const tests = loadTests<ScanTestCase>('qi-wallet-scan');

    for (const test of tests) {
        describe(test.name, async function () {
            this.timeout(1200000);

            const mockProvider = new MockProvider();

            // set the provider outpoints
            for (const outpoint of test.provider_outpoints) {
                mockProvider.setOutpoints(outpoint.address, outpoint.outpoints);
            }

            // set the provider blocks
            for (const block of test.provider_blocks) {
                mockProvider.setBlock(block.key, block.block);
            }

            // set the provider locked balace
            for (const lockedBalance of test.provider_locked_balance) {
                mockProvider.setLockedBalance(lockedBalance.address, BigInt(lockedBalance.balance));
            }

            // set the provider balance
            for (const balance of test.provider_balance) {
                mockProvider.setBalance(balance.address, BigInt(balance.balance));
            }

            const mnemonic = Mnemonic.fromPhrase(test.mnemonic);
            const wallet = QiHDWallet.fromMnemonic(mnemonic);
            wallet.connect(mockProvider);
            it('it scans the wallet with no errors', async function () {
                try {
                    await wallet.scan(Zone.Cyprus1);
                    assert.ok(true, '====> TESTING: scan completed');
                } catch (error) {
                    console.error('====> TESTING: error: ', error);
                    assert.fail('====> TESTING: error: ', error);
                }
            });
            it('validates expected external addresses', async function () {
                const externalAddresses = wallet.getAddressesForZone(Zone.Cyprus1);
                const sortedExternalAddresses = externalAddresses.sort((a, b) => a.index - b.index);
                const sortedExpectedExternalAddresses = test.expected_external_addresses.sort(
                    (a, b) => a.index - b.index,
                );
                assert.deepEqual(sortedExternalAddresses, sortedExpectedExternalAddresses);
            });

            it('validates expected change addresses', async function () {
                const changeAddresses = wallet.getChangeAddressesForZone(Zone.Cyprus1);
                const sortedChangeAddresses = changeAddresses.sort((a, b) => a.index - b.index);
                const sortedExpectedChangeAddresses = test.expected_change_addresses.sort((a, b) => a.index - b.index);
                assert.deepEqual(sortedChangeAddresses, sortedExpectedChangeAddresses);
            });

            it('validates wallet balance', async function () {
                const balance = await wallet.getBalanceForZone(Zone.Cyprus1);
                assert.equal(balance.toString(), test.expected_balance.toString());
            });

            it('validates expected outpoints info', async function () {
                assert.deepEqual(wallet.getOutpoints(Zone.Cyprus1), test.expected_outpoints_info);
            });
        });
    }
});
