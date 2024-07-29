import { assertArgument } from '../utils/index.js';

import { formatMixedCaseChecksumAddress, getAddress } from './address.js';

import type { Addressable, AddressLike } from './index.js';

/**
 * Returns true if `value` is an object which implements the [**Addressable**](../interfaces/Addressable) interface.
 *
 * @category Address
 * @example
 *
 * ```js
 * // Wallets and AbstractSigner sub-classes
 * isAddressable(Wallet.createRandom());
 *
 * // Contracts
 * contract = new Contract('0x643aA0A61eADCC9Cc202D1915D942d35D005400C', [], provider);
 * isAddressable(contract);
 * ```
 *
 * @param {any} value - The value to check.
 * @returns {boolean} True if the value is an Addressable.
 */
export function isAddressable(value: any): value is Addressable {
    return value && typeof value.getAddress === 'function';
}

/**
 * Returns true if `value` is a valid address.
 *
 * @category Address
 * @example
 *
 * ```js
 * // Valid address
 * isAddress('0x8ba1f109551bD432803012645Ac136ddd64DBA72');
 *
 * // Invalid checksum
 * isAddress('0x8Ba1f109551bD432803012645Ac136ddd64DBa72');
 * ```
 *
 * @param {any} value - The value to check.
 * @returns {boolean} True if the value is a valid address.
 */
export function isAddress(value: any): value is string {
    try {
        getAddress(value);
        return true;
        // eslint-disable-next-line no-empty
    } catch (error) {}
    return false;
}

async function checkAddress(target: any, promise: Promise<null | string>): Promise<string> {
    const result = await promise;
    if (result == null || result === '0x0000000000000000000000000000000000000000') {
        assertArgument(false, 'invalid AddressLike value; did not resolve to a value address', 'target', target);
    }
    return result;
}

/**
 * Resolves to an address for the `target`, which may be any supported address type, an
 * [**Addressable**](../interfaces/Addressable) or a Promise which resolves to an address.
 *
 * @category Address
 * @example
 *
 * ```js
 * addr = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
 *
 * // Addresses are return synchronously
 * resolveAddress(addr, provider);
 *
 * // Address promises are resolved asynchronously
 * resolveAddress(Promise.resolve(addr));
 *
 * // Addressable objects are resolved asynchronously
 * contract = new Contract(addr, []);
 * resolveAddress(contract, provider);
 * ```
 *
 * @param {AddressLike} target - The target to resolve to an address.
 * @returns {string | Promise<string>} The resolved address.
 */
export function resolveAddress(target: AddressLike): string | Promise<string> {
    if (typeof target === 'string') {
        if (target.match(/^0x[0-9a-f]{40}$/i)) {
            return target;
        }
    } else if (isAddressable(target)) {
        return checkAddress(target, target.getAddress());
    } else if (target && typeof target.then === 'function') {
        return checkAddress(target, target);
    }

    assertArgument(false, 'unsupported addressable value', 'target', target);
}

/**
 * Checks if the address is a valid mixed case checksummed address.
 *
 * @category Address
 * @param address - The address to validate.
 * @returns True if the address is a valid mixed case checksummed address.
 */
export function validateAddress(address: string): void {
    assertArgument(typeof address === 'string', 'address must be string', 'address', address);
    assertArgument(
        Boolean(address.match(/^(0x)?[0-9a-fA-F]{40}$/)),
        'invalid address string format',
        'address',
        address,
    );
    assertArgument(formatMixedCaseChecksumAddress(address) === address, 'invalid address checksum', 'address', address);
}

/**
 * Checks whether a given address is in the Qi ledger scope by checking the 9th bit of the address.
 *
 * @category Address
 * @param {string} address - The address to check
 * @returns {boolean} True if the address is in the Qi ledger scope, false otherwise.
 */
export function isQiAddress(address: string): boolean {
    const secondByte = address.substring(4, 6);
    const binaryString = parseInt(secondByte, 16).toString(2).padStart(8, '0');
    const isUTXO = binaryString[0] === '1';

    return isUTXO;
}

/**
 * Checks whether a given address is in the Quai ledger scope by checking the 9th bit of the address.
 *
 * @category Address
 * @param {string} address - The address to check
 * @returns {boolean} True if the address is in the Quai ledger scope, false otherwise.
 */
export function isQuaiAddress(address: string): boolean {
    return !isQiAddress(address);
}
