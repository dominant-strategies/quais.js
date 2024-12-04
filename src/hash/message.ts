import { keccak256 } from '../crypto/index.js';
import { MessagePrefix } from '../constants/index.js';
import { recoverAddress } from '../address/index.js';
import { concat } from '../utils/index.js';
import { toUtf8Bytes } from '../encoding/index.js';

import type { SignatureLike } from '../crypto/index.js';

/**
 * Computes the Quai Network equivalent of the [EIP-191](https://eips.ethereum.org/EIPS/eip-191) personal-sign message
 * digest to sign.
 *
 * This prefixes the message with {@link MessagePrefix | **MessagePrefix**} and the decimal length of `message` and
 * computes the {@link keccak256 | **keccak256**} digest.
 *
 * If `message` is a string, it is converted to its UTF-8 bytes first. To compute the digest of a
 * [**DataHexString**](../types-aliases/DataHex), it must be converted to [**bytes**](../functions/getBytes).
 *
 * @category Hash
 * @example
 *
 * ```ts
 * hashMessage('Hello World');
 *
 * // Hashes the SIX (6) string characters, i.e.
 * // [ "0", "x", "4", "2", "4", "3" ]
 * hashMessage('0x4243');
 *
 * // Hashes the TWO (2) bytes [ 0x42, 0x43 ]...
 * hashMessage(getBytes('0x4243'));
 *
 * // ...which is equal to using data
 * hashMessage(new Uint8Array([0x42, 0x43]));
 * ```
 *
 * @param {Uint8Array | string} message - The message to hash.
 * @returns {string} The message digest.
 */
export function hashMessage(message: Uint8Array | string): string {
    if (typeof message === 'string') {
        message = toUtf8Bytes(message);
    }
    return keccak256(concat([toUtf8Bytes(MessagePrefix), toUtf8Bytes(String(message.length)), message]));
}

/**
 * Return the address of the private key that produced the signature `sig` during signing for `message`.
 *
 * @category Hash
 * @param {Uint8Array | string} message - The message that was signed.
 * @param {SignatureLike} sig - The signature to verify.
 * @returns {string} The address of the signer.
 */
export function verifyMessage(message: Uint8Array | string, sig: SignatureLike): string {
    const digest = hashMessage(message);
    return recoverAddress(digest, sig);
}
