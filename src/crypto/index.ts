/**
 * A fundamental building block of Ethereum is the underlying cryptographic primitives.
 */

null;

// We import all these so we can export lock()
import { computeHmac } from './hmac.js';
import { keccak256 } from './keccak.js';
import { ripemd160 } from './ripemd160.js';
import { pbkdf2 } from './pbkdf2.js';
import { randomBytes } from './random.js';
import { scrypt, scryptSync } from './scrypt.js';
import { sha256, sha512 } from './sha2.js';

export { computeHmac, randomBytes, keccak256, ripemd160, sha256, sha512, pbkdf2, scrypt, scryptSync };

export { SigningKey } from './signing-key.js';
export { Signature } from './signature.js';

/**
 * Once called, prevents any future change to the underlying cryptographic primitives using the `.register` feature for
 * hooks.
 *
 * @category Crypto
 */
function lock(): void {
    computeHmac.lock();
    keccak256.lock();
    pbkdf2.lock();
    randomBytes.lock();
    ripemd160.lock();
    scrypt.lock();
    scryptSync.lock();
    sha256.lock();
    sha512.lock();
    randomBytes.lock();
}

export { lock };

export { musigCrypto } from './musig.js';

/////////////////////////////
// Types

export type { ProgressCallback } from './scrypt.js';

export type { SignatureLike } from './signature.js';
