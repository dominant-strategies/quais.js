import { BIP32API, BIP32Interface, HDNodeBIP32Adapter } from './bip32-types';
import { sha256 } from '@noble/hashes/sha256';
import { keccak256 } from '../crypto/index.js';
import { getBytes, hexlify } from '../utils/data.js';
import { getAddress } from '../address/address.js';
import type { TinySecp256k1Interface } from './bip32-types.js';

export const PC_VERSION = 0x47;

export class PaymentCodePublic {
    protected readonly ecc: TinySecp256k1Interface;
    protected readonly bip32: BIP32API;
    protected readonly buf: Uint8Array;
    root: BIP32Interface;
    hasPrivKeys: boolean;

    /**
     * Constructor for the PaymentCode class.
     *
     * @param {TinySecp256k1Interface} ecc - Implementation of secp256k1 elliptic curve
     * @param {BIP32API} bip32 - Bip32 instance
     * @param {Uint8Array} buf - The buffer representing the payment code.
     * @throws {Error} Invalid buffer length - If the length of the buffer is not 80.
     * @throws {Error} Only payment codes version 1 are supported - If the version of the payment code is not 1.
     */
    constructor(ecc: TinySecp256k1Interface, bip32: BIP32API, buf: Uint8Array) {
        this.ecc = ecc;
        this.bip32 = bip32;
        this.hasPrivKeys = false;

        if (buf.length !== 80) throw new Error('Invalid buffer length');

        if (buf[0] !== 1) throw new Error('Only payment codes version 1 are supported');

        this.buf = buf;
        this.root = bip32.fromPublicKey(this.pubKey, this.chainCode);
    }

    /**
     * Get the features of PaymentCode.
     *
     * @returns {Uint8Array} The features as a Uint8Array object.
     */
    get features(): Uint8Array {
        return this.buf.subarray(1, 2);
    }

    /**
     * Returns the public key.
     *
     * @returns {Uint8Array} The public key as a Uint8Array.
     */
    get pubKey(): Uint8Array {
        return this.buf.subarray(2, 2 + 33);
    }

    /**
     * Retrieves the chain code of the payment code.
     *
     * @returns {Uint8Array} - The extracted chain code as a Uint8Array.
     */
    get chainCode(): Uint8Array {
        return this.buf.subarray(35, 35 + 32);
    }

    /**
     * Retrieves the payment code buffer.
     *
     * @returns {Uint8Array} The payment code buffer.
     */
    get paymentCode(): Uint8Array {
        return this.buf;
    }

    /**
     * Creates a base58 representation of the payment code.
     *
     * @returns {string} - The Base58 representation of PaymentCode.
     */
    async toBase58(): Promise<string> {
        const version = new Uint8Array([PC_VERSION]);
        const buf = new Uint8Array(version.length + this.buf.length);

        buf.set(version);
        buf.set(this.buf, version.length);
        const { bs58check } = await import('@samouraiwallet/bip32/crypto');
        return bs58check.encode(buf);
    }

    /**
     * Derives a child from the root BIP32 node at the specified index.
     *
     * @param {number} index - The index of the child BIP32Interface object to be derived.
     * @returns {BIP32Interface} - The derived child BIP32Interface object.
     */
    derive(index: number): BIP32Interface {
        return this.root.derive(index);
    }

    /**
     * Retrieves the public key for notification.
     *
     * @returns {Uint8Array} The public key for notification.
     */
    getNotificationPublicKey(): Uint8Array {
        return getBytes(this.derive(0).publicKey);
    }

    /**
     * Derives a public key from the shared secret.
     *
     * @param {Uint8Array} B - Public key
     * @param {Uint8Array} S - Shared secret point
     * @returns {Uint8Array} The derived public key.
     * @throws {Error} If the shared secret is invalid or unable to derive the public key.
     */
    derivePublicKeyFromSharedSecret(B: Uint8Array, S: Uint8Array): Uint8Array {
        const Sx = S.subarray(1, 33);
        const s = sha256(Sx);

        if (!this.ecc.isPrivate(s)) throw new Error('Invalid shared secret');

        const P = this.ecc.pointAddScalar(B, s, true);

        if (!P) throw new Error('Unable to derive public key');

        return P;
    }

    /**
     * Derives a payment public key based on the given public payment code.
     *
     * @param {PaymentCodePublic} paymentCode - The public payment code to derive the payment public key from.
     * @param {number} idx - The index used for derivation.
     * @returns {Uint8Array} The derived payment public key.
     * @throws {Error} If the payment code does not contain a valid public key, or if any step in the derivation process
     *   fails.
     */
    derivePaymentPublicKey(paymentCode: PaymentCodePrivate, idx: number): Uint8Array {
        const a: Uint8Array = paymentCode.getNotificationPrivateKey();

        if (!this.ecc.isPrivate(a)) throw new Error('Received invalid private key');

        const B = this.derive(idx).publicKey;
        const S = this.ecc.pointMultiply(B, a);

        if (!S) throw new Error('Unable to compute secret point');

        return this.derivePublicKeyFromSharedSecret(B, S);
    }

    /**
     * Retrieves the address from a given public key.
     *
     * @param {Uint8Array} pubKey - The public key.
     * @returns {string} The generated address.
     * @throws {Error} - When unsupported address type is passed
     * @protected
     */
    protected getAddressFromPubkey(pubKey: Uint8Array): string {
        return getAddress(keccak256('0x' + hexlify(pubKey).substring(4)).substring(26));
    }

    /**
     * Retrieves a payment address based on the provided parameters.
     *
     * @param {PaymentCodePublic} paymentCode - The public payment code to derive the payment address from.
     * @param {number} idx - The index used in the derivation process.
     * @returns {string} - The generated payment address.
     * @throws {Error} - If unable to derive public key or if an unknown address type is specified.
     */
    getPaymentAddress(paymentCode: PaymentCodePrivate, idx: number): string {
        const pubkey = hexlify(this.derivePaymentPublicKey(paymentCode, idx));

        return getAddress(keccak256('0x' + pubkey.substring(4)).substring(26));
    }
}

export class PaymentCodePrivate extends PaymentCodePublic {
    /**
     * Constructor for the PaymentCodePrivate class.
     *
     * @param {HDNodeBIP32Adapter} root - The root HDNodeWallet as a HDNodeBIP32Adapter.
     * @param {TinySecp256k1Interface} ecc - Implementation of secp256k1 elliptic curve.
     * @param {BIP32API} bip32 - An instance implementing the bip32 API methods.
     * @param {Uint8Array} buf - The buffer representing the payment code.
     */
    constructor(root: HDNodeBIP32Adapter, ecc: TinySecp256k1Interface, bip32: BIP32API, buf: Uint8Array) {
        super(ecc, bip32, buf);
        this.root = root;
        this.hasPrivKeys = true;
    }

    /**
     * Derives a payment public key based on the given public payment code.
     *
     * @param {PaymentCodePublic} paymentCode - The public payment code to derive the payment public key from.
     * @param {number} idx - The index used for derivation.
     * @returns {Uint8Array} The derived payment public key.
     * @throws {Error} If the payment code does not contain a valid public key or unable to derive the node with private
     *   key.
     */
    derivePaymentPublicKey(paymentCode: PaymentCodePublic, idx: number): Uint8Array {
        const A: Uint8Array = paymentCode.getNotificationPublicKey();

        if (!this.ecc.isPoint(A)) throw new Error('Received invalid public key');

        const b_node = this.derive(idx);

        if (!b_node.privateKey) throw new Error('Unable to derive node with private key');

        const b = getBytes(b_node.privateKey);
        const B = getBytes(b_node.publicKey);
        const S = this.ecc.pointMultiply(A, b);

        if (!S) throw new Error('Unable to compute resulting point');

        return this.derivePublicKeyFromSharedSecret(B, S);
    }

    /**
     * Retrieves a payment address based on the provided parameters.
     *
     * @param {PaymentCodePublic} paymentCode - The public payment code to derive the payment address from.
     * @param {number} idx - The index used in the derivation process.
     * @returns {string} - The generated payment address.
     * @throws {Error} - If unable to derive public key or if an unknown address type is specified.
     */
    getPaymentAddress(paymentCode: PaymentCodePublic, idx: number): string {
        const pubKey = this.derivePaymentPublicKey(paymentCode, idx);
        return this.getAddressFromPubkey(pubKey);
    }

    /**
     * Derives a payment private key based on the given public payment code.
     *
     * @param {PaymentCodePublic} paymentCodePublic - The public payment code to derive the payment private key from.
     * @param {number} idx - The index used for derivation.
     * @returns {Uint8Array} The derived payment private key.
     * @throws {Error} If the payment code does not contain a valid public key, unable to derive the node without
     *   private key, unable to compute the resulting point, or invalid shared secret.
     */
    derivePaymentPrivateKey(paymentCodePublic: PaymentCodePublic, idx: number): Uint8Array {
        const A = paymentCodePublic.getNotificationPublicKey();

        if (!this.ecc.isPoint(A)) throw new Error('Argument is not a valid public key');

        const b_node = this.derive(idx);

        if (!b_node.privateKey) throw new Error('Unable to derive node without private key');

        const b = getBytes(b_node.privateKey);
        const S = this.ecc.pointMultiply(A, b);

        if (!S) throw new Error('Unable to compute resulting point');

        const Sx = S.subarray(1, 33);
        const s = sha256(Sx);

        if (!this.ecc.isPrivate(s)) throw new Error('Invalid shared secret');

        const paymentPrivateKey = this.ecc.privateAdd(b, s);

        if (!paymentPrivateKey) throw new Error('Unable to compute payment private key');

        return paymentPrivateKey;
    }

    /**
     * Retrieves the notification private key.
     *
     * @returns {Uint8Array} The notification private key.
     */
    getNotificationPrivateKey(): Uint8Array {
        const child = this.derive(0);
        return child.privateKey!;
    }
}
