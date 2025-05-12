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
});
