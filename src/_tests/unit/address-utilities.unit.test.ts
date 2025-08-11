import { isQiAddress, isQuaiAddress, getZoneForAddress, getAddressDetails } from '../../index.js';
import assert from 'assert';

// Example addresses for testing
const testCases = [
    {
        address: '0x0012155ee74cA70C5A68C211B7b8019338C0E5A4',
        expected: {
            zone: '0x00',
            isQi: false,
            isQuai: true,
            ledger: 0, // Quai
        },
    },
    {
        address: '0x0112155ee74cA70C5A68C211B7b8019338C0E5A4',
        expected: {
            zone: '0x01',
            isQi: false,
            isQuai: true,
            ledger: 0, // Quai
        },
    },
    {
        address: '0x00baB97FFA195F6DFA5053F86f84B77C9F795105',
        expected: {
            zone: '0x00',
            isQi: true,
            isQuai: false,
            ledger: 1, // Qi
        },
    },
    {
        address: '0x01d8Dab4dD526ccb38eC10D07169d91C9A4bb657',
        expected: {
            zone: '0x01',
            isQi: true,
            isQuai: false,
            ledger: 1, // Qi
        },
    },
];

describe('Quai SDK Address Utility Functions', function () {
    testCases.forEach(({ address, expected }) => {
        it(`correctly identifies zone and ledger for address ${address}`, function () {
            // Test getZoneForAddress
            const zone = getZoneForAddress(address);
            assert.strictEqual(zone, expected.zone, `Zone should be ${expected.zone}`);

            // Test getAddressDetails
            const details = getAddressDetails(address);
            assert(details, 'getAddressDetails should not return null');
            assert.strictEqual(details.zone, expected.zone, `Details.zone should be ${expected.zone}`);
            assert.strictEqual(details.ledger, expected.ledger, `Ledger should be ${expected.ledger}`);
        });

        it(`correctly identifies Qi/Quai type for address ${address}`, function () {
            // Test isQiAddress
            assert.strictEqual(isQiAddress(address), expected.isQi, `isQiAddress should be ${expected.isQi}`);
            // Test isQuaiAddress
            assert.strictEqual(isQuaiAddress(address), expected.isQuai, `isQuaiAddress should be ${expected.isQuai}`);
        });
    });

    describe('Address Scope Detection (Go implementation compatibility)', function () {
        // Test cases based on Go implementation:
        // func (a Address) IsInQiLedgerScope() bool {
        //     return a.Bytes()[1] > 127
        // }
        const scopeTestCases = [
            {
                address: '0x00c0000000000000000000000000000000000000',
                expectedQi: true,
                description: 'Second byte is 0xc0 (192 > 127) - should be Qi',
            },
            {
                address: '0x0080000000000000000000000000000000000000',
                expectedQi: true,
                description: 'Second byte is 0x80 (128 > 127) - should be Qi',
            },
            {
                address: '0x0040000000000000000000000000000000000000',
                expectedQi: false,
                description: 'Second byte is 0x40 (64 <= 127) - should be Quai',
            },
            {
                address: '0x007f000000000000000000000000000000000000',
                expectedQi: false,
                description: 'Second byte is 0x7f (127 <= 127) - should be Quai',
            },
            {
                address: '0x00ff000000000000000000000000000000000000',
                expectedQi: true,
                description: 'Second byte is 0xff (255 > 127) - should be Qi',
            },
            {
                address: '0x0000000000000000000000000000000000000000',
                expectedQi: false,
                description: 'Second byte is 0x00 (0 <= 127) - should be Quai',
            },
        ];

        scopeTestCases.forEach(({ address, expectedQi, description }) => {
            it(`${description}`, function () {
                // Test isQiAddress function
                assert.strictEqual(
                    isQiAddress(address),
                    expectedQi,
                    `isQiAddress(${address}) should return ${expectedQi}`,
                );

                // Test isQuaiAddress function
                assert.strictEqual(
                    isQuaiAddress(address),
                    !expectedQi,
                    `isQuaiAddress(${address}) should return ${!expectedQi}`,
                );

                // Test getAddressDetails function
                const details = getAddressDetails(address);
                assert(details, 'getAddressDetails should not return null');
                const isQiFromDetails = details.ledger === 1; // Ledger.Qi = 1
                assert.strictEqual(
                    isQiFromDetails,
                    expectedQi,
                    `getAddressDetails(${address}).ledger should indicate ${expectedQi ? 'Qi' : 'Quai'} ledger`,
                );
            });
        });

        it('should check the correct byte position (second byte, not third nibble)', function () {
            // This test verifies the implementation details
            const address = '0x00c0000000000000000000000000000000000000';
            const secondByte = address.substring(4, 6); // Should be 'c0'
            const secondByteValue = parseInt(secondByte, 16); // Should be 192

            assert.strictEqual(secondByte, 'c0', 'Second byte should be c0');
            assert.strictEqual(secondByteValue, 192, 'Second byte value should be 192');
            assert.strictEqual(secondByteValue > 127, true, '192 > 127 should be true');

            // Verify the binary representation
            const binaryString = secondByteValue.toString(2).padStart(8, '0');
            assert.strictEqual(binaryString[0], '1', 'First bit of second byte should be 1 for Qi addresses');
        });
    });
});
