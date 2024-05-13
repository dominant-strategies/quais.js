import { keccak256 } from "../crypto/index.js";
import { MessagePrefix } from "../constants/index.js";
import { recoverAddress } from "../transaction/index.js";
import { concat, toUtf8Bytes } from "../utils/index.js";

import type { SignatureLike } from "../crypto/index.js";
/**
 *  Computes the [EIP-191](https://eips.ethereum.org/EIPS/eip-191) personal-sign 
 *  message digest to sign.
 *
 *  This prefixes the message with {@link MessagePrefix | **MessagePrefix**} and the decimal length
 *  of `message` and computes the {@link keccak256 | **keccak256**} digest.
 *
 *  If `message` is a string, it is converted to its UTF-8 bytes
 *  first. To compute the digest of a [**DataHexString**](../types/DataHex), it must be converted
 *  to [**bytes**](../functions/getBytes).
 *
 *  @example
 *  ```ts
 *    hashMessage("Hello World")
 *    //_result:
 *
 *    // Hashes the SIX (6) string characters, i.e.
 *    // [ "0", "x", "4", "2", "4", "3" ]
 *    hashMessage("0x4243")
 *    //_result:
 *
 *    // Hashes the TWO (2) bytes [ 0x42, 0x43 ]...
 *    hashMessage(getBytes("0x4243"))
 *    //_result:
 *
 *    // ...which is equal to using data
 *    hashMessage(new Uint8Array([ 0x42, 0x43 ]))
 *    //_result:
 *  ```
 * 
 *  @param {Uint8Array | string} message - The message to hash.
 *  @returns {string} The message digest.
 * 
 *  @category Hash
 */
export function hashMessage(message: Uint8Array | string): string {
    if (typeof(message) === "string") { message = toUtf8Bytes(message); }
    return keccak256(concat([
        toUtf8Bytes(MessagePrefix),
        toUtf8Bytes(String(message.length)),
        message
    ]));
}

/**
 *  Return the address of the private key that produced
 *  the signature `sig` during signing for `message`.
 * 
 *  @param {Uint8Array | string} message - The message that was signed.
 *  @param {SignatureLike} sig - The signature to verify.
 *  @returns {string} The address of the signer.
 * 
 *  @category Hash
 */
export function verifyMessage(message: Uint8Array | string, sig: SignatureLike): string {
    const digest = hashMessage(message);
    return recoverAddress(digest, sig);
}
