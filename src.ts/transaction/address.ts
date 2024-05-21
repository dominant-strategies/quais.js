import { getAddress } from '../address/index.js';
import { keccak256, SigningKey } from '../crypto/index.js';

import type { SignatureLike } from '../crypto/index.js';
import type { BytesLike } from '../utils/index.js';

/**
 * Returns the address for the `key`.
 *
 * The key may be any standard form of public key or a private key.
 *
 * @category Transaction
 * @param {string | SigningKey} key - The key to compute the address for.
 *
 * @returns {string} The address.
 */
export function computeAddress(key: string | SigningKey): string {
    let pubkey: string;
    if (typeof key === 'string') {
        pubkey = SigningKey.computePublicKey(key, false);
    } else {
        pubkey = key.publicKey;
    }
    return getAddress(keccak256('0x' + pubkey.substring(4)).substring(26));
}

/**
 * Returns the recovered address for the private key that was used to sign `digest` that resulted in `signature`.
 *
 * @category Transaction
 * @param {BytesLike} digest - The digest of the message.
 * @param {SignatureLike} signature - The signature.
 *
 * @returns {string} The address.
 */
export function recoverAddress(digest: BytesLike, signature: SignatureLike): string {
    return computeAddress(SigningKey.recoverPublicKey(digest, signature));
}
