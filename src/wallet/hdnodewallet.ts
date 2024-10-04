import { computeHmac, randomBytes, ripemd160, SigningKey, sha256 } from '../crypto/index.js';
import { VoidSigner } from '../signers/index.js';
import { computeAddress } from '../address/index.js';
import { decodeBase58, encodeBase58 } from '../encoding/index.js';
import {
    concat,
    dataSlice,
    defineProperties,
    getBytes,
    hexlify,
    isBytesLike,
    getNumber,
    toBeArray,
    toBigInt,
    toBeHex,
    assertPrivate,
    assert,
    assertArgument,
} from '../utils/index.js';
import { LangEn } from '../wordlists/lang-en.js';

import { BaseWallet } from './base-wallet.js';
import { Mnemonic } from './mnemonic.js';
import { encryptKeystoreJson, encryptKeystoreJsonSync } from './json-keystore.js';

import type { ProgressCallback } from '../crypto/index.js';
import type { Provider } from '../providers/index.js';
import type { BytesLike, Numeric } from '../utils/index.js';
import type { Wordlist } from '../wordlists/index.js';

import type { KeystoreAccount } from './json-keystore.js';

// "Bitcoin seed"
const MasterSecret = new Uint8Array([66, 105, 116, 99, 111, 105, 110, 32, 115, 101, 101, 100]);

const HardenedBit = 0x80000000;

const N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');

const Nibbles = '0123456789abcdef';
function zpad(value: number, length: number): string {
    let result = '';
    while (value) {
        result = Nibbles[value % 16] + result;
        value = Math.trunc(value / 16);
    }
    while (result.length < length * 2) {
        result = '0' + result;
    }
    return '0x' + result;
}

function encodeBase58Check(_value: BytesLike): string {
    const value = getBytes(_value);
    const check = dataSlice(sha256(sha256(value)), 0, 4);
    const bytes = concat([value, check]);
    return encodeBase58(bytes);
}

const _guard = {};

function ser_I(
    index: number,
    chainCode: string,
    publicKey: string,
    privateKey: null | string,
): { IL: Uint8Array; IR: Uint8Array } {
    const data = new Uint8Array(37);

    if (index & HardenedBit) {
        assert(privateKey != null, 'cannot derive child of neutered node', 'UNSUPPORTED_OPERATION', {
            operation: 'deriveChild',
        });

        // Data = 0x00 || ser_256(k_par)
        data.set(getBytes(privateKey), 1);
    } else {
        // Data = ser_p(point(k_par))
        data.set(getBytes(publicKey));
    }

    // Data += ser_32(i)
    for (let i = 24; i >= 0; i -= 8) {
        data[33 + (i >> 3)] = (index >> (24 - i)) & 0xff;
    }
    const I = getBytes(computeHmac('sha512', chainCode, data));

    return { IL: I.slice(0, 32), IR: I.slice(32) };
}

type HDNodeLike<T> = { depth: number; deriveChild: (i: number) => T };
function derivePath<T extends HDNodeLike<T>>(node: T, path: string): T {
    const components = path.split('/');

    assertArgument(components.length > 0, 'invalid path', 'path', path);

    if (components[0] === 'm') {
        assertArgument(
            node.depth === 0,
            `cannot derive root path (i.e. path starting with "m/") for a node at non-zero depth ${node.depth}`,
            'path',
            path,
        );
        components.shift();
    }

    let result: T = node;
    for (let i = 0; i < components.length; i++) {
        const component = components[i];

        if (component.match(/^[0-9]+'$/)) {
            const index = parseInt(component.substring(0, component.length - 1));
            assertArgument(index < HardenedBit, 'invalid path index', `path[${i}]`, component);
            result = result.deriveChild(HardenedBit + index);
        } else if (component.match(/^[0-9]+$/)) {
            const index = parseInt(component);
            assertArgument(index < HardenedBit, 'invalid path index', `path[${i}]`, component);
            result = result.deriveChild(index);
        } else {
            assertArgument(false, 'invalid path component', `path[${i}]`, component);
        }
    }

    return result;
}

/**
 * An **HDNodeWallet** is a [[Signer]] backed by the private key derived from an HD Node using the [[link-bip-32]]
 * standard.
 *
 * An HD Node forms a hierarchical structure with each HD Node having a private key and the ability to derive child HD
 * Nodes, defined by a path indicating the index of each child.
 */
export class HDNodeWallet extends BaseWallet {
    /**
     * The compressed public key.
     *
     * @type {string}
     */
    readonly publicKey!: string;

    /**
     * The fingerprint.
     *
     * A fingerprint allows a quick way to detect parent and child nodes, but developers should be prepared to deal with
     * collisions as it is only 4 bytes.
     *
     * @type {string}
     */
    readonly fingerprint!: string;

    /**
     * The parent fingerprint.
     *
     * @type {string}
     */
    readonly parentFingerprint!: string;

    /**
     * The mnemonic used to create this HD Node, if available.
     *
     * Sources such as extended keys do not encode the mnemonic, in which case this will be `null`.
     *
     * @type {null | Mnemonic}
     */
    readonly mnemonic!: null | Mnemonic;

    /**
     * The chaincode, which is effectively a public key used to derive children.
     *
     * @type {string}
     */
    readonly chainCode!: string;

    /**
     * The derivation path of this wallet.
     *
     * Since extended keys do not provide full path details, this may be `null`, if instantiated from a source that does
     * not encode it.
     *
     * @type {null | string}
     */
    readonly path!: null | string;

    /**
     * The child index of this wallet. Values over `2 ** 31` indicate the node is hardened.
     *
     * @type {number}
     */
    readonly index!: number;

    /**
     * The depth of this wallet, which is the number of components in its path.
     *
     * @type {number}
     */
    readonly depth!: number;

    /**
     * @ignore
     * @param {any} guard
     * @param {SigningKey} signingKey
     * @param {string} parentFingerprint
     * @param {string} chainCode
     * @param {null | string} path
     * @param {number} index
     * @param {number} depth
     * @param {null | Mnemonic} mnemonic
     * @param {null | Provider} provider
     */
    constructor(
        guard: any,
        signingKey: SigningKey,
        parentFingerprint: string,
        chainCode: string,
        path: null | string,
        index: number,
        depth: number,
        mnemonic: null | Mnemonic,
        provider: null | Provider,
    ) {
        super(signingKey, provider);
        assertPrivate(guard, _guard, 'HDNodeWallet');

        defineProperties<HDNodeWallet>(this, { publicKey: signingKey.compressedPublicKey });

        const fingerprint = dataSlice(ripemd160(sha256(this.publicKey)), 0, 4);
        defineProperties<HDNodeWallet>(this, {
            parentFingerprint,
            fingerprint,
            chainCode,
            path,
            index,
            depth,
        });

        defineProperties<HDNodeWallet>(this, { mnemonic });
    }

    /**
     * Connects the wallet to a provider.
     *
     * @param {null | Provider} provider
     * @returns {HDNodeWallet}
     */
    connect(provider: null | Provider): HDNodeWallet {
        return new HDNodeWallet(
            _guard,
            this.signingKey,
            this.parentFingerprint,
            this.chainCode,
            this.path,
            this.index,
            this.depth,
            this.mnemonic,
            provider,
        );
    }

    /**
     * @ignore
     * @returns {KeystoreAccount}
     */
    #account(): KeystoreAccount {
        const account: KeystoreAccount = { address: this.address, privateKey: this.privateKey };
        const m = this.mnemonic;
        if (this.path && m && m.wordlist.locale === 'en' && m.password === '') {
            account.mnemonic = {
                path: this.path,
                locale: 'en',
                entropy: m.entropy,
            };
        }

        return account;
    }

    /**
     * Resolves to a [JSON Keystore Wallet](json-wallets) encrypted with `password`.
     *
     * If `progressCallback` is specified, it will receive periodic updates as the encryption process progresses.
     *
     * @param {Uint8Array | string} password
     * @param {ProgressCallback} [progressCallback]
     * @returns {Promise<string>}
     */
    async encrypt(password: Uint8Array | string, progressCallback?: ProgressCallback): Promise<string> {
        return await encryptKeystoreJson(this.#account(), password, { progressCallback });
    }

    /**
     * Returns a [JSON Keystore Wallet](json-wallets) encrypted with `password`.
     *
     * It is preferred to use the [async version](encrypt) instead, which allows a `ProgressCallback` to keep the user
     * informed.
     *
     * This method will block the event loop (freezing all UI) until it is complete, which may be a non-trivial
     * duration.
     *
     * @param {Uint8Array | string} password
     * @returns {string}
     */
    encryptSync(password: Uint8Array | string): string {
        return encryptKeystoreJsonSync(this.#account(), password);
    }

    /**
     * The extended key.
     *
     * This key will begin with the prefix `xpriv` and can be used to reconstruct this HD Node to derive its children.
     *
     * @returns {string}
     */
    get extendedKey(): string {
        // We only support the mainnet values for now, but if anyone needs
        // testnet values, let me know. I believe current sentiment is that
        // we should always use mainnet, and use BIP-44 to derive the network
        //   - Mainnet: public=0x0488B21E, private=0x0488ADE4
        //   - Testnet: public=0x043587CF, private=0x04358394

        assert(this.depth < 256, 'Depth too deep', 'UNSUPPORTED_OPERATION', {
            operation: 'extendedKey',
        });

        return encodeBase58Check(
            concat([
                '0x0488ADE4',
                zpad(this.depth, 1),
                this.parentFingerprint,
                zpad(this.index, 4),
                this.chainCode,
                concat(['0x00', this.privateKey]),
            ]),
        );
    }

    /**
     * Returns true if this wallet has a path, providing a Type Guard that the path is non-null.
     *
     * @returns {boolean}
     */
    hasPath(): this is { path: string } {
        return this.path != null;
    }

    /**
     * Returns a neutered HD Node, which removes the private details of an HD Node.
     *
     * A neutered node has no private key, but can be used to derive child addresses and other public data about the HD
     * Node.
     *
     * @returns {HDNodeVoidWallet}
     */
    neuter(): HDNodeVoidWallet {
        return new HDNodeVoidWallet(
            _guard,
            this.address,
            this.publicKey,
            this.parentFingerprint,
            this.chainCode,
            this.path,
            this.index,
            this.depth,
            this.provider,
        );
    }

    /**
     * Return the child for `index`.
     *
     * @param {Numeric} _index
     * @returns {HDNodeWallet}
     */
    deriveChild(_index: Numeric): HDNodeWallet {
        const index = getNumber(_index, 'index');
        assertArgument(index <= 0xffffffff, 'invalid index', 'index', index);

        // Base path
        let path = this.path;
        if (path) {
            path += '/' + (index & ~HardenedBit);
            if (index & HardenedBit) {
                path += "'";
            }
        }

        const { IR, IL } = ser_I(index, this.chainCode, this.publicKey, this.privateKey);
        const ki = new SigningKey(toBeHex((toBigInt(IL) + BigInt(this.privateKey)) % N, 32));

        return new HDNodeWallet(
            _guard,
            ki,
            this.fingerprint,
            hexlify(IR),
            path,
            index,
            this.depth + 1,
            this.mnemonic,
            this.provider,
        );
    }

    /**
     * Return the HDNode for `path` from this node.
     *
     * @param {string} path
     * @returns {HDNodeWallet}
     */
    derivePath(path: string): HDNodeWallet {
        return derivePath<HDNodeWallet>(this, path);
    }

    /**
     * @ignore
     * @param {BytesLike} _seed
     * @param {null | Mnemonic} mnemonic
     * @returns {HDNodeWallet}
     */
    static #fromSeed(_seed: BytesLike, mnemonic: null | Mnemonic): HDNodeWallet {
        assertArgument(isBytesLike(_seed), 'invalid seed', 'seed', '[REDACTED]');

        const seed = getBytes(_seed, 'seed');
        assertArgument(seed.length >= 16 && seed.length <= 64, 'invalid seed', 'seed', '[REDACTED]');

        const I = getBytes(computeHmac('sha512', MasterSecret, seed));
        const signingKey = new SigningKey(hexlify(I.slice(0, 32)));

        return new HDNodeWallet(_guard, signingKey, '0x00000000', hexlify(I.slice(32)), 'm', 0, 0, mnemonic, null);
    }

    /**
     * Creates a new HD Node from `extendedKey`.
     *
     * If the `extendedKey` will either have a prefix or `xpub` or `xpriv`, returning a neutered HD Node
     * ([[HDNodeVoidWallet]]) or full HD Node ([[HDNodeWallet]]) respectively.
     *
     * @param {string} extendedKey
     * @returns {HDNodeWallet | HDNodeVoidWallet}
     */
    static fromExtendedKey(extendedKey: string): HDNodeWallet | HDNodeVoidWallet {
        const bytes = toBeArray(decodeBase58(extendedKey)); // @TODO: redact

        assertArgument(
            bytes.length === 82 || encodeBase58Check(bytes.slice(0, 78)) === extendedKey,
            'invalid extended key',
            'extendedKey',
            '[ REDACTED ]',
        );

        const depth = bytes[4];
        const parentFingerprint = hexlify(bytes.slice(5, 9));
        const index = parseInt(hexlify(bytes.slice(9, 13)).substring(2), 16);
        const chainCode = hexlify(bytes.slice(13, 45));
        const key = bytes.slice(45, 78);

        switch (hexlify(bytes.slice(0, 4))) {
            // Public Key
            case '0x0488b21e':
            case '0x043587cf': {
                const publicKey = hexlify(key);
                return new HDNodeVoidWallet(
                    _guard,
                    computeAddress(publicKey),
                    publicKey,
                    parentFingerprint,
                    chainCode,
                    null,
                    index,
                    depth,
                    null,
                );
            }

            // Private Key
            case '0x0488ade4':
            case '0x04358394 ':
                if (key[0] !== 0) {
                    break;
                }
                return new HDNodeWallet(
                    _guard,
                    new SigningKey(key.slice(1)),
                    parentFingerprint,
                    chainCode,
                    null,
                    index,
                    depth,
                    null,
                    null,
                );
        }

        assertArgument(false, 'invalid extended key prefix', 'extendedKey', '[ REDACTED ]');
    }

    /**
     * Creates a new random HDNode.
     *
     * @param {string} path
     * @param {string} [password]
     * @param {Wordlist} [wordlist]
     * @returns {HDNodeWallet}
     */
    static createRandom(path: string, password?: string, wordlist?: Wordlist): HDNodeWallet {
        if (password == null) {
            password = '';
        }
        if (wordlist == null) {
            wordlist = LangEn.wordlist();
        }
        const mnemonic = Mnemonic.fromEntropy(randomBytes(16), password, wordlist);
        return HDNodeWallet.#fromSeed(mnemonic.computeSeed(), mnemonic).derivePath(path);
    }

    /**
     * Create an HD Node from `mnemonic`.
     *
     * @param {Mnemonic} mnemonic
     * @param {string} path
     * @returns {HDNodeWallet}
     */
    static fromMnemonic(mnemonic: Mnemonic, path: string): HDNodeWallet {
        return HDNodeWallet.#fromSeed(mnemonic.computeSeed(), mnemonic).derivePath(path);
    }

    /**
     * Creates an HD Node from a mnemonic `phrase`.
     *
     * @param {string} phrase
     * @param {string} path
     * @param {string} [password]
     * @param {Wordlist} [wordlist]
     * @returns {HDNodeWallet}
     */
    static fromPhrase(phrase: string, path: string, password?: string, wordlist?: Wordlist): HDNodeWallet {
        if (password == null) {
            password = '';
        }
        if (wordlist == null) {
            wordlist = LangEn.wordlist();
        }
        const mnemonic = Mnemonic.fromPhrase(phrase, password, wordlist);
        return HDNodeWallet.#fromSeed(mnemonic.computeSeed(), mnemonic).derivePath(path);
    }

    /**
     * Creates an HD Node from a `seed`.
     *
     * @param {BytesLike} seed
     * @returns {HDNodeWallet}
     */
    static fromSeed(seed: BytesLike): HDNodeWallet {
        return HDNodeWallet.#fromSeed(seed, null);
    }
}

/**
 * A **HDNodeVoidWallet** cannot sign, but provides access to the children nodes of a [[link-bip-32]] HD wallet
 * addresses.
 *
 * They can be created by using an extended `xpub` key to [[HDNodeWallet_fromExtendedKey]] or by
 * [neutering](HDNodeWallet-neuter) a [[HDNodeWallet]].
 */
export class HDNodeVoidWallet extends VoidSigner {
    /**
     * The compressed public key.
     *
     * @type {string}
     */
    readonly publicKey!: string;

    /**
     * The fingerprint.
     *
     * A fingerprint allows a quick way to detect parent and child nodes, but developers should be prepared to deal with
     * collisions as it is only 4 bytes.
     *
     * @type {string}
     */
    readonly fingerprint!: string;

    /**
     * The parent node fingerprint.
     *
     * @type {string}
     */
    readonly parentFingerprint!: string;

    /**
     * The chaincode, which is effectively a public key used to derive children.
     *
     * @type {string}
     */
    readonly chainCode!: string;

    /**
     * The derivation path of this wallet.
     *
     * Since extended keys do not provide full path details, this may be `null`, if instantiated from a source that does
     * not encode it.
     *
     * @type {null | string}
     */
    readonly path!: null | string;

    /**
     * The child index of this wallet. Values over `2 ** 31` indicate the node is hardened.
     *
     * @type {number}
     */
    readonly index!: number;

    /**
     * The depth of this wallet, which is the number of components in its path.
     *
     * @type {number}
     */
    readonly depth!: number;

    /**
     * @ignore
     * @param {any} guard
     * @param {string} address
     * @param {string} publicKey
     * @param {string} parentFingerprint
     * @param {string} chainCode
     * @param {null | string} path
     * @param {number} index
     * @param {number} depth
     * @param {null | Provider} provider
     */
    constructor(
        guard: any,
        address: string,
        publicKey: string,
        parentFingerprint: string,
        chainCode: string,
        path: null | string,
        index: number,
        depth: number,
        provider: null | Provider,
    ) {
        super(address, provider);
        assertPrivate(guard, _guard, 'HDNodeVoidWallet');

        defineProperties<HDNodeVoidWallet>(this, { publicKey });

        const fingerprint = dataSlice(ripemd160(sha256(publicKey)), 0, 4);
        defineProperties<HDNodeVoidWallet>(this, {
            publicKey,
            fingerprint,
            parentFingerprint,
            chainCode,
            path,
            index,
            depth,
        });
    }

    /**
     * Connects the wallet to a provider.
     *
     * @param {null | Provider} provider
     * @returns {HDNodeVoidWallet}
     */
    connect(provider: null | Provider): HDNodeVoidWallet {
        return new HDNodeVoidWallet(
            _guard,
            this.address,
            this.publicKey,
            this.parentFingerprint,
            this.chainCode,
            this.path,
            this.index,
            this.depth,
            provider,
        );
    }

    /**
     * The extended key.
     *
     * This key will begin with the prefix `xpub` and can be used to reconstruct this neutered key to derive its
     * children addresses.
     *
     * @returns {string}
     */
    get extendedKey(): string {
        // We only support the mainnet values for now, but if anyone needs
        // testnet values, let me know. I believe current sentiment is that
        // we should always use mainnet, and use BIP-44 to derive the network
        //   - Mainnet: public=0x0488B21E, private=0x0488ADE4
        //   - Testnet: public=0x043587CF, private=0x04358394

        assert(this.depth < 256, 'Depth too deep', 'UNSUPPORTED_OPERATION', { operation: 'extendedKey' });

        return encodeBase58Check(
            concat([
                '0x0488B21E',
                zpad(this.depth, 1),
                this.parentFingerprint,
                zpad(this.index, 4),
                this.chainCode,
                this.publicKey,
            ]),
        );
    }

    /**
     * Returns true if this wallet has a path, providing a Type Guard that the path is non-null.
     *
     * @returns {boolean}
     */
    hasPath(): this is { path: string } {
        return this.path != null;
    }

    /**
     * Return the child for `index`.
     *
     * @param {Numeric} _index
     * @returns {HDNodeVoidWallet}
     */
    deriveChild(_index: Numeric): HDNodeVoidWallet {
        const index = getNumber(_index, 'index');
        assertArgument(index <= 0xffffffff, 'invalid index', 'index', index);

        // Base path
        let path = this.path;
        if (path) {
            path += '/' + (index & ~HardenedBit);
            if (index & HardenedBit) {
                path += "'";
            }
        }

        const { IR, IL } = ser_I(index, this.chainCode, this.publicKey, null);
        const Ki = SigningKey.addPoints(IL, this.publicKey, true);

        const address = computeAddress(Ki);

        return new HDNodeVoidWallet(
            _guard,
            address,
            Ki,
            this.fingerprint,
            hexlify(IR),
            path,
            index,
            this.depth + 1,
            this.provider,
        );
    }

    /**
     * Return the signer for `path` from this node.
     *
     * @param {string} path
     * @returns {HDNodeVoidWallet}
     */
    derivePath(path: string): HDNodeVoidWallet {
        return derivePath<HDNodeVoidWallet>(this, path);
    }
}

/**
 * Returns the [[link-bip-32]] path for the account at `index`.
 *
 * This is the pattern used by wallets like Ledger.
 *
 * There is also an [alternate pattern](getIndexedAccountPath) used by some software.
 *
 * @param {Numeric} _index
 * @returns {string}
 */
export function getAccountPath(_index: Numeric): string {
    const index = getNumber(_index, 'index');
    assertArgument(index >= 0 && index < HardenedBit, 'invalid account index', 'index', index);
    return `m/44'/60'/${index}'/0/0`;
}

/**
 * Returns the path using an alternative pattern for deriving accounts, at `index`.
 *
 * This derivation path uses the `index` component rather than the `account` component to derive sequential accounts.
 *
 * This is the pattern used by wallets like MetaMask.
 *
 * @param {Numeric} _index
 * @returns {string}
 */
export function getIndexedAccountPath(_index: Numeric): string {
    const index = getNumber(_index, 'index');
    assertArgument(index >= 0 && index < HardenedBit, 'invalid account index', 'index', index);
    return `m/44'/60'/0'/0/${index}`;
}
