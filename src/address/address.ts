import { keccak256, SigningKey } from '../crypto/index.js';
import {
    getBytes,
    assertArgument,
    BytesLike,
    concat,
    zeroPadValue,
    dataSlice,
    BigNumberish,
    toBigInt,
    toBeHex,
    stripZerosLeft,
} from '../utils/index.js';

import type { SignatureLike } from '../crypto/index.js';

function getChecksumAddress(address: string): string {
    address = address.toLowerCase();

    const chars = address.substring(2).split('');

    const expanded = new Uint8Array(40);
    for (let i = 0; i < 40; i++) {
        expanded[i] = chars[i].charCodeAt(0);
    }

    const hashed = getBytes(keccak256(expanded));

    for (let i = 0; i < 40; i += 2) {
        if (hashed[i >> 1] >> 4 >= 8) {
            chars[i] = chars[i].toUpperCase();
        }
        if ((hashed[i >> 1] & 0x0f) >= 8) {
            chars[i + 1] = chars[i + 1].toUpperCase();
        }
    }

    return '0x' + chars.join('');
}

/**
 * Returns a normalized and checksumed address for `address`. This accepts non-checksum addresses, checksum addresses
 * and [[getIcapAddress]] formats.
 *
 * The checksum in Ethereum uses the capitalization (upper-case vs lower-case) of the characters within an address to
 * encode its checksum, which offers, on average, a checksum of 15-bits.
 *
 * If `address` contains both upper-case and lower-case, it is assumed to already be a checksum address and its checksum
 * is validated, and if the address fails its expected checksum an error is thrown.
 *
 * If you wish the checksum of `address` to be ignore, it should be converted to lower-case (i.e. `.toLowercase()`)
 * before being passed in. This should be a very rare situation though, that you wish to bypass the safegaurds in place
 * to protect against an address that has been incorrectly copied from another source.
 *
 * @category Address
 * @example
 *
 * ```js
 * // Adds the checksum (via upper-casing specific letters)
 * getAddress('0x8ba1f109551bd432803012645ac136ddd64dba72');
 * //_result:
 *
 * // Converts ICAP address and adds checksum
 * getAddress('XE65GB6LDNXYOFTX0NSV3FUWKOWIXAMJK36');
 * //_result:
 *
 * // Throws an error if an address contains mixed case,
 * // but the checksum fails
 * getAddress('0x8Ba1f109551bD432803012645Ac136ddd64DBA72');
 * //_error:
 * ```
 *
 * @todo Revise this documentation as ICAP addresses are not supported
 *
 * @todo GetIcapAddress has been removed, link must be revised or removed
 */
export function getAddress(address: string): string {
    assertArgument(typeof address === 'string', 'invalid address', 'address', address);

    if (address.match(/^(0x)?[0-9a-fA-F]{40}$/)) {
        // Missing the 0x prefix
        if (!address.startsWith('0x')) {
            address = '0x' + address;
        }

        const result = getChecksumAddress(address);

        // It is a checksummed address with a bad checksum
        assertArgument(
            !address.match(/([A-F].*[a-f])|([a-f].*[A-F])/) || result === address,
            'bad address checksum',
            'address',
            address,
        );

        return result;
    }

    assertArgument(false, 'invalid address', 'address', address);
}

export function getContractAddress(from: string, nonce: BigNumberish, data: BytesLike): string {
    const nonceBytes = zeroPadValue(toBeHex(toBigInt(nonce)), 8);
    return getAddress(dataSlice(keccak256(concat([getAddress(from), nonceBytes, stripZerosLeft(data)])), 12));
}

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