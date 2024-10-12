import { validateAddress } from '../address/index.js';
import { getAddress, formatMixedCaseChecksumAddress } from '../address/index.js';
import { assertArgument, isHexString } from '../utils/index.js';

import type { AccessList, AccessListish } from './index.js';

/**
 * Converts an address and storage keys into an access set.
 *
 * @param {string} addr - The address to validate and convert.
 * @param {string[]} storageKeys - The storage keys to validate and convert.
 * @returns {{ address: string; storageKeys: string[] }} The access set.
 */
function accessSetify(addr: string, storageKeys: Array<string>): { address: string; storageKeys: Array<string> } {
    validateAddress(addr);
    return {
        address: getAddress(addr),
        storageKeys: storageKeys.map((storageKey, index) => {
            assertArgument(isHexString(storageKey, 32), 'invalid slot', `storageKeys[${index}]`, storageKey);
            return storageKey.toLowerCase();
        }),
    };
}

/**
 * Returns an {@link AccessList | **AccessList**} from any quasi-supported access-list structure.
 *
 * @category Transaction
 * @param {AccessListish} value - The value to convert to an access list.
 * @returns {AccessList} The access list.
 * @throws {Error} If the value is not a valid access list.
 */
export function accessListify(value: AccessListish): AccessList {
    if (Array.isArray(value)) {
        return (<Array<[string, Array<string>] | { address: string; storageKeys: Array<string> }>>value).map(
            (set, index) => {
                if (Array.isArray(set)) {
                    assertArgument(set.length === 2, 'invalid slot set', `value[${index}]`, set);
                    return accessSetify(formatMixedCaseChecksumAddress(set[0]), set[1]);
                }
                assertArgument(set != null && typeof set === 'object', 'invalid address-slot set', 'value', value);
                return accessSetify(formatMixedCaseChecksumAddress(set.address), set.storageKeys);
            },
        );
    }

    assertArgument(value != null && typeof value === 'object', 'invalid access list', 'value', value);

    const result: Array<{ address: string; storageKeys: Array<string> }> = Object.keys(value).map((addr) => {
        const storageKeys: Record<string, true> = value[addr].reduce(
            (accum, storageKey) => {
                accum[storageKey] = true;
                return accum;
            },
            <Record<string, true>>{},
        );
        return accessSetify(addr, Object.keys(storageKeys).sort());
    });
    result.sort((a, b) => a.address.localeCompare(b.address));
    return result;
}
