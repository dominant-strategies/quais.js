import assert from 'assert';

import { hashMessage, solidityPacked, solidityPackedKeccak256, solidityPackedSha256, isError } from '../../index.js';

import { loadTests } from '../utils.js';

import type { TestCaseSolidityHash } from '../types.js';

describe('Test EIP-191 Personal Message Hash', function () {
    const tests = [
        {
            test: 'hello-world',
            message: 'Hello World',
            hash: '0xca6464b285e602e01f3261caa151da2bd35fe19cb3532f7acd0d594ca0d810c5',
        },
        {
            test: 'binary-message',
            message: new Uint8Array([0x42, 0x43]),
            hash: '0xd2ca8706bdbb1255b510b6acf42339faabf95bb8192cc7c562a6019ad8463c60',
        },
        {
            test: 'hex-looking-string',
            message: '0x4243',
            hash: '0xcfe58e0f243f48080feeeb86f9b27e35f65955d3b39a644478c376b2733d9804',
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
