/**
 * Addresses are a fundamental part of interacting with Ethereum. They represent the gloabal identity of Externally
 * Owned Accounts (accounts backed by a private key) and contracts.
 *
 * These functions help convert between various formats and validate addresses
 *
 * @category Address
 */

null;

/**
 * An interface for objects which have an address, and can resolve it asyncronously.
 *
 * This allows objects such as [Signer](Signer) or [Contract](../classes/Contract) to be used most places an address can
 * be, for example getting the [balance](../interfaces/Provider#getBalance).
 *
 * @category Address
 */
export interface Addressable {
    /**
     * Get the object address.
     */
    getAddress(): Promise<string>;
}

/**
 * Anything that can be used to return or resolve an address.
 *
 * @category Address
 */
export type AddressLike = string | Promise<string> | Addressable;

export {
    getAddress,
    computeAddress,
    recoverAddress,
    formatMixedCaseChecksumAddress,
    getContractAddress,
} from './address.js';

export { getCreateAddress, getCreate2Address } from './contract-address.js';

export { isAddressable, isAddress, resolveAddress, validateAddress, isQuaiAddress, isQiAddress } from './checks.js';
