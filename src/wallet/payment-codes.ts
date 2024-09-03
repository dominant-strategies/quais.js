import { HDNodeWallet } from './hdnodewallet.js';
import { sha256 } from '@noble/hashes/sha256';
import type { TinySecp256k1Interface } from './types.js';
import { computeHmac } from '../crypto/index.js';
import { decodeBase58, encodeBase58 } from '../encoding/index.js';
import { getBytes, xorUint8Arrays } from '../utils/data.js';

const PC_VERSION = 0x47;

export class PaymentCodePublic {
    protected readonly ecc: TinySecp256k1Interface;
    protected readonly root: HDNodeWallet;
    protected readonly buf: Uint8Array;
    hasPrivKeys: boolean;

    /**
     * Constructor for the PaymentCodePublic class.
     * @param {TinySecp256k1Interface} ecc - Implementation of secp256k1 elliptic curve
     * @param {HDNodeWallet} hdNode - HDNodeWallet instance
     * @param {Uint8Array} buf - The buffer representing the payment code.
     *
     * @throws {Error} Invalid buffer length - If the length of the buffer is not 80.
     * @throws {Error} Only payment codes version 1 are supported - If the version of the payment code is not 1.
     */
    constructor(ecc: TinySecp256k1Interface, hdNode: HDNodeWallet, buf: Uint8Array) {
        this.ecc = ecc;
        this.root = hdNode;
        this.hasPrivKeys = false;

        if (buf.length !== 80) throw new Error('Invalid buffer length');

        if (buf[0] !== 1) throw new Error('Only payment codes version 1 are supported');

        this.buf = buf;
    }

    /**
     * Get the features of PaymentCode.
     * @return {Uint8Array} The features as a Uint8Array object.
     */
    get features(): Uint8Array {
        return this.buf.subarray(1, 2);
    }

    /**
     * Returns the public key.
     * @returns {Uint8Array} The public key as a Uint8Array.
     */
    get pubKey(): Uint8Array {
        return this.buf.subarray(2, 2 + 33);
    }

    /**
     * Retrieves the chain code of the payment code.
     * @return {Uint8Array} - The extracted chain code as a Uint8Array.
     */
    get chainCode(): Uint8Array {
        return this.buf.subarray(35, 35 + 32);
    }

    /**
     * Retrieves the payment code buffer.
     * @returns {Uint8Array} The payment code buffer.
     */
    get paymentCode(): Uint8Array {
        return this.buf;
    }

    /**
     * Creates a base58 representation of the payment code.
     * @returns {string} - The Base58 representation of PaymentCode.
     */
    toBase58(): string {
        const version = new Uint8Array([PC_VERSION]);
        const buf = new Uint8Array(version.length + this.buf.length);

        buf.set(version);
        buf.set(this.buf, version.length);

        return encodeBase58(buf);
    }

    /**
     * Derives a child HDNodeWallet at the specified index.
     * @param {number} index - The index of the child HDNodeWallet to derive.
     * @returns {HDNodeWallet} - The derived child HDNodeWallet.
     */
    derive(index: number): HDNodeWallet {
        return this.root.deriveChild(index);
    }

    /**
     * Retrieves the public key for notification.
     * @returns {Uint8Array} The public key for notification.
     */
    getNotificationPublicKey(): Uint8Array {
        return getBytes(this.derive(0).publicKey);
    }

    /**
     * Derives a public key from the shared secret.
     * @param {Uint8Array} B - Public key
     * @param {Uint8Array} S - Shared secret point
     * @returns {Uint8Array} The derived public key.
     * @throws {Error} If the shared secret is invalid or unable to derive the public key.
     */
    derivePublicKeyFromSharedSecret(B: Uint8Array, S: Uint8Array): Uint8Array {
        const Sx = S.subarray(1, 33);
        const s = sha256(Sx);

        if (!this.ecc.isPrivate(s))
            throw new Error('Invalid shared secret');

        const P = this.ecc.pointAddScalar(B, s, true);

        if (!P)
            throw new Error('Unable to derive public key');

        return P;
    }
}

export class PaymentCodePrivate extends PaymentCodePublic {
    /**
     * Constructor for the PaymentCodePrivate class.
     * @param {HDNodeWallet} root - The root HDNodeWallet.
     * @param {TinySecp256k1Interface} ecc - Implementation of secp256k1 elliptic curve.
     * @param {HDNodeWallet} hdNode - HDNodeWallet instance.
     * @param {Uint8Array} buf - The buffer representing the payment code.
     */
    constructor(root: HDNodeWallet, ecc: TinySecp256k1Interface, buf: Uint8Array) {
        super(ecc, root, buf);
        this.hasPrivKeys = true;
    }

    /**
     * Creates a new instance of PaymentCodePublic from the current PaymentCodePrivate instance.
     * @returns {PaymentCodePublic} A new instance of PaymentCodePublic.
     */
    toPaymentCodePublic(): PaymentCodePublic {
        return new PaymentCodePublic(this.ecc, this.root, this.buf.slice(0));
    }

    /**
     * Clones the PaymentCodePrivate instance.
     * @returns {PaymentCodePrivate} A new PaymentCodePrivate instance that is a clone of the current one.
     */
    clone(): PaymentCodePrivate {
        return new PaymentCodePrivate(this.root, this.ecc, this.buf.slice(0));
    }

    /**
     * Derives a hardened child HDNodeWallet at the specified index.
     * @param {number} index - The index of the hardened child HDNodeWallet to derive.
     * @returns {HDNodeWallet} - The derived hardened child HDNodeWallet.
     */
    deriveHardened(index: number): HDNodeWallet {
        return this.root.deriveChild(index | 0x80000000);
    }

    /**
     * Derives a payment public key based on the given public payment code.
     * @param {PaymentCodePublic} paymentCode - The public payment code to derive the payment public key from.
     * @param {number} idx - The index used for derivation.
     * @returns {Uint8Array} The derived payment public key.
     * @throws {Error} If the payment code does not contain a valid public key or unable to derive the node with private key.
     */
    derivePaymentPublicKey(paymentCode: PaymentCodePublic, idx: number): Uint8Array {
        const A: Uint8Array = paymentCode.getNotificationPublicKey();

        if (!this.ecc.isPoint(A)) throw new Error('Received invalid public key');

        const b_node = this.derive(idx);

        if (!b_node.privateKey) throw new Error('Unable to derive node with private key');

        const b = b_node.privateKey;
        const B = b_node.publicKey;
        const S = this.ecc.pointMultiply(A, b);

        return this.derivePublicKeyFromSharedSecret(B, S);
    }

    /**
     * Derives a payment private key based on the given public payment code.
     * @param {PaymentCodePublic} paymentCodePublic - The public payment code to derive the payment private key from.
     * @param {number} idx - The index used for derivation.
     * @returns {Uint8Array} The derived payment private key.
     * @throws {Error} If the payment code does not contain a valid public key, unable to derive the node without private key,
     *                 unable to compute the resulting point, or invalid shared secret.
     */
    derivePaymentPrivateKey(paymentCodePublic: PaymentCodePublic, idx: number): Uint8Array {
        const A = paymentCodePublic.getNotificationPublicKey();

        if (!this.ecc.isPoint(A))
            throw new Error('Argument is not a valid public key');

        const b_node = this.derive(idx);

        if (!b_node.privateKey)
            throw new Error('Unable to derive node without private key');

        const b = b_node.privateKey;
        const S = this.ecc.pointMultiply(A, b);

        if (!S)
            throw new Error('Unable to compute resulting point');

        const Sx = S.subarray(1, 33);
        const s = sha256(Sx);

        if (!this.ecc.isPrivate(s))
            throw new Error('Invalid shared secret');

        const paymentPrivateKey = this.ecc.privateAdd(b, s);

        if (!paymentPrivateKey)
            throw new Error('Unable to compute payment private key');

        return paymentPrivateKey;
    }

    /**
     * Retrieves the notification private key.
     * @returns {Uint8Array} The notification private key.
     */
    getNotificationPrivateKey(): Uint8Array {
        const child = this.derive(0);
        return getBytes(child.privateKey!);
    }

    /**
     * Retrieves the payment code from the notification transaction data.
     * @param {Uint8Array} scriptPubKey - The scriptPubKey of the notification transaction.
     * @param {Uint8Array} outpoint - The outpoint of the notification transaction.
     * @param {Uint8Array} pubKey - The public key.
     * @returns {PaymentCodePublic} The retrieved payment code.
     * @throws {Error} If the OP_RETURN payload is invalid or unable to compute the secret point.
     */
    getPaymentCodeFromNotificationTransactionData(scriptPubKey: Uint8Array, outpoint: Uint8Array, pubKey: Uint8Array): PaymentCodePublic {
        if (!(scriptPubKey.length === 83 && scriptPubKey[0] === 0x6a && scriptPubKey[1] === 0x4c && scriptPubKey[2] === 0x50)) throw new Error('Invalid OP_RETURN payload');

        const A: Uint8Array = pubKey;
        const b: Uint8Array = this.getNotificationPrivateKey();
        const S: Uint8Array | null = this.ecc.pointMultiply(A, b);

        if (!S) throw new Error('Unable to compute secret point');

        const x: Uint8Array = S.subarray(1, 33);
        const s: Uint8Array = getBytes(computeHmac('sha512', outpoint, x));

        const blindedPaymentCode: Uint8Array = scriptPubKey.subarray(3);

        const paymentCodeBuffer: Uint8Array = blindedPaymentCode.slice(0);

        paymentCodeBuffer.set(
            xorUint8Arrays(s.subarray(0, 32), blindedPaymentCode.subarray(3, 35)),
            3,
        );
        paymentCodeBuffer.set(
            xorUint8Arrays(s.subarray(32, 64), blindedPaymentCode.subarray(35, 67)),
            35,
        );

        return new PaymentCodePublic(this.ecc, this.root, paymentCodeBuffer);
    }
}

export const BIP47Factory = (ecc: TinySecp256k1Interface) => {
    /**
     * Creates a new PaymentCodePrivate instance from a given seed.
     * @param {Uint8Array} bSeed - Wallet master seed to create the PaymentCode from.
     * @returns {PaymentCodePrivate} The created PaymentCodePrivate instance.
     * @throws {Error} If the publicKey or chainCode is missing or incorrect.
     */
    const fromSeed = (bSeed: Uint8Array): PaymentCodePrivate => {
        const root = HDNodeWallet.fromSeed(bSeed);
        const root_bip47 = root.derivePath(`m/47'/0'/0'`);

        const pc = new Uint8Array(80);

        pc.set([1, 0]); // set version + options

        if (root_bip47.publicKey.length !== 33) throw new Error('Missing or wrong publicKey');
        pc.set(root_bip47.publicKey, 2); // set public key

        if (root_bip47.chainCode.length !== 32) throw new Error('Missing or wrong chainCode');
        pc.set(root_bip47.chainCode, 35);

        return new PaymentCodePrivate(root_bip47, ecc, HDNodeWallet.fromSeed(bSeed), pc);
    };

    /**
     * Creates a new PaymentCodePublic instance from a base58 encoded payment code string.
     * @param {string} inString - Payment code string.
     * @returns {PaymentCodePublic} The created PaymentCodePublic instance.
     * @throws {Error} If the payment code string is invalid.
     */
    const fromBase58 = (inString: string): PaymentCodePublic => {
        const buf = decodeBase58(inString);

        const version = buf[0];
        if (version !== PC_VERSION)
            throw new Error('Invalid version');

        return new PaymentCodePublic(ecc, HDNodeWallet.fromSeed(new Uint8Array(32)), buf.slice(1));
    };

    /**
     * Creates a new PaymentCodePublic instance from a raw payment code buffer.
     * @param {Uint8Array} buf - Raw payment code buffer.
     * @returns {PaymentCodePublic} The created PaymentCodePublic instance.
     */
    const fromBuffer = (buf: Uint8Array): PaymentCodePublic => {
        return new PaymentCodePublic(ecc, HDNodeWallet.fromSeed(new Uint8Array(32)), buf);
    };

    return {
        fromSeed,
        fromBase58,
        fromBuffer
    };
};