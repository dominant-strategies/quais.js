import assert from 'assert';

import { hashMessage, solidityPacked, solidityPackedKeccak256, solidityPackedSha256, isError } from '../../index.js';

import { loadTests } from '../utils.js';

import type { TestCaseSolidityHash } from '../types.js';

describe('Test EIP-191 Personal Message Hash', function () {
    const tests = [
        {
            test: 'hello-world',
            message: 'Hello World',
            hash: '0xa1de988600a42c4b4ab089b619297c17d53cffae5d5120d82d8a92d0bb3b78f2',
        },
        {
            test: 'binary-message',
            message: new Uint8Array([0x42, 0x43]),
            hash: '0x0d3abc18ec299cf9b42ba439ac6f7e3e6ec9f5c048943704e30fc2d9c7981438',
        },
        {
            test: 'hex-looking-string',
            message: '0x4243',
            hash: '0x6d91b221f765224b256762dcba32d62209cf78e9bebb0a1b758ca26c76db3af4',
        },
    ];

    for (const test of tests) {
        it(`tests hashMessage: ${test.test}`, function () {
            assert.equal(hashMessage(test.message), test.hash);
        });
    }
});

describe('Test Solidity Hash functions', function () {
    const tests = loadTests<TestCaseSolidityHash>('solidity-hashes');

    for (const test of tests) {
        it(`computes the solidity keccak256: ${test.name}`, function () {
            assert.equal(solidityPackedKeccak256(test.types, test.values), test.keccak256);
        });
    }

    for (const test of tests) {
        it(`computes the solidity sha256: ${test.name}`, function () {
            assert.equal(solidityPackedSha256(test.types, test.values), test.sha256);
        });
    }

    const badTypes = [
        { types: ['uint5'], values: [1] },
        { types: ['bytes0'], values: ['0x'] },
        { types: ['blorb'], values: [false] },
    ];

    for (const { types, values } of badTypes) {
        it('correctly fails on invalid type', function () {
            assert.throws(
                function () {
                    const result = solidityPacked(types, values);
                    console.log(result);
                },
                function (error) {
                    return isError(error, 'INVALID_ARGUMENT') && error.argument === 'type';
                },
            );
        });
    }
});
