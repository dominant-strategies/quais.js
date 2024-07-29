import { keccak256 } from '../crypto/index.js';
import { concat, dataSlice, getBigInt, getBytes, assertArgument } from '../utils/index.js';

import { getAddress } from './address.js';

import type { BigNumberish, BytesLike } from '../utils/index.js';

// http://ethereum.stackexchange.com/questions/760/how-is-the-address-of-an-ethereum-contract-computed

/**
 * Returns the address that would result from a `CREATE` for `tx`.
 *
 * This can be used to compute the address a contract will be deployed to by an EOA when sending a deployment
 * transaction (i.e. when the `to` address is `null`).
 *
 * This can also be used to compute the address a contract will be deployed to by a contract, by using the contract's
 * address as the `to` and the contract's nonce.
 *
 * @category Address
 * @example
 *
 * ```js
 * from = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';
 * nonce = 5;
 *
 * getCreateAddress({ from, nonce });
 * ```
 *
 * @param {object} tx - The transaction object.
 * @param {string} tx.from - The address of the sender.
 * @param {BigNumberish} tx.nonce - The nonce of the sender.
 * @param {string} [tx.data] - The data of the transaction.
 */
export function getCreateAddress(tx: { from: string; nonce: BigNumberish; data: string | null }): string {
    const from = getAddress(tx.from);
    const nonce = getBigInt(tx.nonce, 'tx.nonce');

    const nonceBytes = bigEndianNonce(nonce);
    const fromBytes = getBytes(from);
    const codeBytes = tx.data ? getBytes(tx.data) : new Uint8Array();

    const concatenated = new Uint8Array([...fromBytes, ...nonceBytes, ...codeBytes]);
    const hash = keccak256(concatenated);
    return getAddress(dataSlice(hash, 12));
}

/**
 * Returns the address that would result from a `CREATE2` operation with the given `from`, `salt` and `initCodeHash`.
 *
 * To compute the `initCodeHash` from a contract's init code, use the [**keccak256**](../functions/keccak256) function.
 *
 * For a quick overview and example of `CREATE2`, see [Wisps: The Magical World of
 * Create2](https://blog.ricmoo.com/wisps-the-magical-world-of-create2-5c2177027604).
 *
 * @category Address
 * @example
 *
 * ```js
 * // The address of the contract
 * from = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';
 *
 * // The salt
 * salt = id('HelloWorld');
 *
 * // The hash of the initCode
 * initCode = '0x6394198df16000526103ff60206004601c335afa6040516060f3';
 * initCodeHash = keccak256(initCode);
 *
 * getCreate2Address(from, salt, initCodeHash);
 * ```
 *
 * @param {string} _from - The address of the sender.
 * @param {BytesLike} _salt - The salt value.
 * @param {BytesLike} _initCodeHash - The hash of the init code.
 * @returns {string} The computed address.
 * @throws {Error} If the salt is not exactly 32 bytes long.
 * @throws {Error} If the initCodeHash is not exactly 32 bytes long.
 */
export function getCreate2Address(_from: string, _salt: BytesLike, _initCodeHash: BytesLike): string {
    const from = getAddress(_from);
    const salt = getBytes(_salt, 'salt');
    const initCodeHash = getBytes(_initCodeHash, 'initCodeHash');

    assertArgument(salt.length === 32, 'salt must be 32 bytes', 'salt', _salt);

    assertArgument(initCodeHash.length === 32, 'initCodeHash must be 32 bytes', 'initCodeHash', _initCodeHash);

    return getAddress(dataSlice(keccak256(concat(['0xff', from, salt, initCodeHash])), 12));
}

// Helper function to convert a BigInt nonce to a big-endian byte array
function bigEndianNonce(nonce: bigint): Uint8Array {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setBigUint64(0, nonce, false);
    return new Uint8Array(buffer);
}
