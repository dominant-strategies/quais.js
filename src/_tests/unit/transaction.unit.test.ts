import assert from 'assert';
import { loadTests } from '../utils.js';
import type { TestCaseTransaction, TestCaseTransactionTx } from '../types.js';

import { QuaiTransaction } from '../../transaction/quai-transaction.js';

const BN_0 = BigInt(0);

function assertTxUint(actual: null | bigint, _expected: undefined | string, name: string): void {
    const expected = _expected != null ? BigInt(_expected) : null;
    assert.equal(actual, expected, name);
}

function assertTxEqual(actual: QuaiTransaction, expected: TestCaseTransactionTx): void {
    assert.equal(actual.to, expected.to, 'to');
    assert.equal(actual.nonce, expected.nonce, 'nonce');

    assertTxUint(actual.gasLimit, expected.gasLimit, 'gasLimit');

    assertTxUint(actual.gasPrice, expected.gasPrice, 'gasPrice');
    assertTxUint(actual.minerTip, expected.minerTip, 'minerTip');

    assert.equal(actual.data, expected.data, 'data');
    assertTxUint(actual.value, expected.value, 'value');

    if (expected.accessList) {
        assert.equal(JSON.stringify(actual.accessList), JSON.stringify(expected.accessList), 'accessList');
    } else {
        assert.equal(actual.accessList, null, 'accessList:!null');
    }

    assertTxUint(actual.chainId, expected.chainId, 'chainId');
}

function addDefault(tx: any, key: string, defaultValue: any): void {
    if (tx[key] == null) {
        tx[key] = defaultValue;
    }
}

function addDefaults(tx: any): any {
    tx = Object.assign({}, tx);
    addDefault(tx, 'nonce', 0);
    addDefault(tx, 'gasLimit', BN_0);
    addDefault(tx, 'gasPrice', BN_0);
    addDefault(tx, 'minerTip', BN_0);
    addDefault(tx, 'value', 0);
    addDefault(tx, 'data', '0x');
    addDefault(tx, 'accessList', []);
    addDefault(tx, 'chainId', BN_0);
    return tx;
}

describe('Tests Unsigned Transaction Parsing', function () {
    const tests = loadTests<TestCaseTransaction>('transactions');

    for (const test of tests) {
        if (!test.unsigned) {
            continue;
        }
        it(`parses unsigned EIP-155 transaction: ${test.name}`, function () {
            assert.throws(() => {
                QuaiTransaction.from(test.unsigned);
            }, new Error('Proto decoding only supported for signed transactions'));
        });
    }
});

describe('Tests Signed Transaction Parsing', function () {
    const tests = loadTests<TestCaseTransaction>('transactions');

    for (const test of tests) {
        if (!test.unsigned) {
            continue;
        }
        it(`parses signed EIP-155 transaction: ${test.name}`, function () {
            let tx = QuaiTransaction.from(test.signed);
            const expected = addDefaults(test.transaction);
            expected.gasLimit = 0;
            expected.minerTip = 0;
            expected.accessList = [];
            for (let i = 0; i < 2; i++) {
                assertTxEqual(tx, expected);

                assert.ok(!!tx.signature, 'signature:!null');
                assert.equal(tx.signature.r, test.signature.r, 'signature.r');
                assert.equal(tx.signature.s, test.signature.s, 'signature.s');

                tx = tx.clone();
            }
        });
    }
});
