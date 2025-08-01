/**
 * Add details about signing here.
 */

import { secp256k1 } from '@noble/curves/secp256k1';

import { concat, dataLength, getBytes, getBytesCopy, hexlify, toBeHex, assertArgument } from '../utils/index.js';

import { Signature } from './signature.js';

import type { BytesLike } from '../utils/index.js';

import type { SignatureLike } from './index.js';

/**
 * A **SigningKey** provides high-level access to the elliptic curve cryptography (ECC) operations and key management.
 *
 * @category Crypto
 */
export class SigningKey {
    #privateKey: string;
    #cachedCompressed?: string; // store once, reuse forever

    /**
     * Creates a new **SigningKey** for `privateKey`.
     */
    constructor(privateKey: BytesLike, compressedPub?: BytesLike) {
        assertArgument(dataLength(privateKey) === 32, 'invalid private key', 'privateKey', '[REDACTED]');
        this.#privateKey = hexlify(privateKey);

        if (compressedPub) {
            assertArgument(dataLength(compressedPub) === 33, 'invalid public key', 'compressedPub', compressedPub);
            this.#cachedCompressed = hexlify(compressedPub);
        }
    }

    /**
     * The private key.
     */
    get privateKey(): string {
        return this.#privateKey;
    }

    /**
     * The uncompressed public key.
     *
     * This will always begin with the prefix `0x04` and be 132 characters long (the `0x` prefix and 130 hexadecimal
     * nibbles).
     */
    get publicKey(): string {
        // derive once from the compressed copy (fast) and cache via closure
        const uncompressed = SigningKey.computePublicKey(this.compressedPublicKey, false);
        // Future calls to publicKey will return the cached value
        Object.defineProperty(this, 'publicKey', { value: uncompressed });
        return uncompressed;
    }
    /**
     * The compressed public key.
     *
     * This will always begin with either the prefix `0x02` or `0x03` and be 68 characters long (the `0x` prefix and 33
     * hexadecimal nibbles)
     */
    get compressedPublicKey(): string {
        if (!this.#cachedCompressed) {
            // first access – compute & cache (JS if native not present)
            this.#cachedCompressed = SigningKey.computePublicKey(this.#privateKey, true);
        }
        return this.#cachedCompressed;
    }

    /**
     * Return the signature of the signed `digest`.
     *
     * @param {BytesLike} digest - The data to sign.
     * @returns {Signature} The signature of the data.
     * @throws {Error} If the digest is not 32 bytes long.
     */
    sign(digest: BytesLike): Signature {
        assertArgument(dataLength(digest) === 32, 'invalid digest length', 'digest', digest);

        const sig = secp256k1.sign(getBytesCopy(digest), getBytesCopy(this.#privateKey), {
            lowS: true,
        });

        return Signature.from({
            r: toBeHex('0x' + sig.r.toString(16), 32),
            s: toBeHex('0x' + sig.s.toString(16), 32),
            v: sig.recovery ? 0x1c : 0x1b,
        });
    }

    /**
     * Returns the [ECDH](https://en.wikipedia.org/wiki/Elliptic-curve_Diffie-Hellman) shared secret between this
     * private key and the `other` key.
     *
     * The `other` key may be any type of key, a raw public key, a compressed/uncompressed pubic key or aprivate key.
     *
     * Best practice is usually to use a cryptographic hash on the returned value before using it as a symetric secret.
     *
     * @example
     *
     * ```ts
     * sign1 = new SigningKey(id('some-secret-1'));
     * sign2 = new SigningKey(id('some-secret-2'));
     *
     * // Notice that privA.computeSharedSecret(pubB)...
     * sign1.computeSharedSecret(sign2.publicKey);
     *
     * // ...is equal to privB.computeSharedSecret(pubA).
     * sign2.computeSharedSecret(sign1.publicKey);
     * ```
     *
     * @param {BytesLike} other - The other key to compute the shared secret with.
     * @returns {string} The shared secret.
     */
    computeSharedSecret(other: BytesLike): string {
        const pubKey = SigningKey.computePublicKey(other);
        return hexlify(secp256k1.getSharedSecret(getBytesCopy(this.#privateKey), getBytes(pubKey), false));
    }

    /**
     * Compute the public key for `key`, optionally `compressed`.
     *
     * The `key` may be any type of key, a raw public key, a compressed/uncompressed public key or private key.
     *
     * @example
     *
     * ```ts
     * sign = new SigningKey(id('some-secret'));
     *
     * // Compute the uncompressed public key for a private key
     * SigningKey.computePublicKey(sign.privateKey);
     *
     * // Compute the compressed public key for a private key
     * SigningKey.computePublicKey(sign.privateKey, true);
     *
     * // Compute the uncompressed public key
     * SigningKey.computePublicKey(sign.publicKey, false);
     *
     * // Compute the Compressed a public key
     * SigningKey.computePublicKey(sign.publicKey, true);
     * ```
     *
     * @param {BytesLike} key - The key to compute the public key for.
     * @param {boolean} [compressed] - Whether to return the compressed public key.
     * @returns {string} The public key.
     */
    static computePublicKey(key: BytesLike, compressed?: boolean): string {
        let bytes = getBytes(key, 'key');

        // private key
        if (bytes.length === 32) {
            const pubKey = secp256k1.getPublicKey(bytes, !!compressed);
            return hexlify(pubKey);
        }

        // raw public key; use uncompressed key with 0x04 prefix
        if (bytes.length === 64) {
            const pub = new Uint8Array(65);
            pub[0] = 0x04;
            pub.set(bytes, 1);
            bytes = pub;
        }

        const point = secp256k1.ProjectivePoint.fromHex(bytes);
        return hexlify(point.toRawBytes(compressed));
    }

    /**
     * Returns the public key for the private key which produced the `signature` for the given `digest`.
     *
     * @example
     *
     * ```ts
     * key = new SigningKey(id('some-secret'));
     * digest = id('hello world');
     * sig = key.sign(digest);
     *
     * // Notice the signer public key...
     * key.publicKey;
     *
     * // ...is equal to the recovered public key
     * SigningKey.recoverPublicKey(digest, sig);
     * ```
     *
     * @param {BytesLike} digest - The data that was signed.
     * @param {SignatureLike} signature - The signature of the data.
     * @returns {string} The public key.
     */
    static recoverPublicKey(digest: BytesLike, signature: SignatureLike): string {
        assertArgument(dataLength(digest) === 32, 'invalid digest length', 'digest', digest);

        const sig = Signature.from(signature);

        let secpSig = secp256k1.Signature.fromCompact(getBytesCopy(concat([sig.r, sig.s])));
        secpSig = secpSig.addRecoveryBit(sig.yParity);

        const pubKey = secpSig.recoverPublicKey(getBytesCopy(digest));
        assertArgument(pubKey != null, 'invalid signautre for digest', 'signature', signature);

        return '0x' + pubKey.toHex(false);
    }

    /**
     * Returns the point resulting from adding the ellipic curve points `p0` and `p1`.
     *
     * This is not a common function most developers should require, but can be useful for certain privacy-specific
     * techniques.
     *
     * For example, it is used by [**QuaiHDWallet**](../classes/QuaiHDWallet) to compute child addresses from parent
     * public keys and chain codes.
     *
     * @param {BytesLike} p0 - The first point to add.
     * @param {BytesLike} p1 - The second point to add.
     * @param {boolean} [compressed] - Whether to return the compressed public key.
     * @returns {string} The sum of the points.
     */
    static addPoints(p0: BytesLike, p1: BytesLike, compressed?: boolean): string {
        const pub0 = secp256k1.ProjectivePoint.fromHex(SigningKey.computePublicKey(p0).substring(2));
        const pub1 = secp256k1.ProjectivePoint.fromHex(SigningKey.computePublicKey(p1).substring(2));
        return '0x' + pub0.add(pub1).toHex(!!compressed);
    }
}
