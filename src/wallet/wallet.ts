import { SigningKey } from '../crypto/index.js';
import { assertArgument } from '../utils/index.js';

import { BaseWallet } from './base-wallet.js';
import { QuaiHDWallet } from './quai-hdwallet.js';
import {
    decryptKeystoreJson,
    decryptKeystoreJsonSync,
    encryptKeystoreJson,
    encryptKeystoreJsonSync,
    isKeystoreJson,
} from './json-keystore.js';

import type { ProgressCallback } from '../crypto/index.js';
import type { Provider } from '../providers/index.js';
import type { KeystoreAccount } from './json-keystore.js';

/**
 * A **Wallet** manages a single private key which is used to sign transactions, messages and other common payloads.
 *
 * This class is generally the main entry point for developers that wish to use a private key directly, as it can create
 * instances from a large variety of common sources, including raw private key,
 * [BIP-39](https://en.bitcoin.it/wiki/BIP_0039) mnemonics and encrypted JSON wallets.
 *
 * @category Wallet
 */
export class Wallet extends BaseWallet {
    /**
     * Create a new wallet for the private `key`, optionally connected to `provider`.
     *
     * @param {string | SigningKey} key - The private key.
     * @param {null | Provider} [provider] - The provider to connect to.
     */
    constructor(key: string | SigningKey, provider?: null | Provider) {
        if (typeof key === 'string' && !key.startsWith('0x')) {
            key = '0x' + key;
        }

        const signingKey = typeof key === 'string' ? new SigningKey(key) : key;
        super(signingKey, provider);
    }

    /**
     * Connects the wallet to a provider.
     *
     * @param {null | Provider} provider - The provider to connect to.
     * @returns {Wallet} The connected wallet.
     */
    connect(provider: null | Provider): Wallet {
        return new Wallet(this.signingKey!, provider);
    }

    /**
     * Resolves to a [JSON Keystore Wallet](json-wallets) encrypted with `password`.
     *
     * If `progressCallback` is specified, it will receive periodic updates as the encryption process progresses.
     *
     * @param {Uint8Array | string} password - The password to encrypt the wallet with.
     * @param {ProgressCallback} [progressCallback] - An optional callback to keep the user informed.
     * @returns {Promise<string>} The encrypted JSON wallet.
     */
    async encrypt(password: Uint8Array | string, progressCallback?: ProgressCallback): Promise<string> {
        const account = { address: this.address, privateKey: this.privateKey };
        return await encryptKeystoreJson(account, password, { progressCallback });
    }

    /**
     * Returns a [JSON Keystore Wallet](json-wallets) encrypted with `password`.
     *
     * It is preferred to use the [async version](encrypt) instead, which allows a
     * {@link ProgressCallback | **ProgressCallback**} to keep the user informed.
     *
     * This method will block the event loop (freezing all UI) until it is complete, which may be a non-trivial
     * duration.
     *
     * @param {Uint8Array | string} password - The password to encrypt the wallet with.
     * @returns {string} The encrypted JSON wallet.
     */
    encryptSync(password: Uint8Array | string): string {
        const account = { address: this.address, privateKey: this.privateKey };
        return encryptKeystoreJsonSync(account, password);
    }

    /**
     * Creates a wallet from a keystore account.
     *
     * @ignore
     * @param {KeystoreAccount} account - The keystore account.
     * @returns {Wallet} The wallet instance.
     */
    static #fromAccount(account: KeystoreAccount): Wallet {
        assertArgument(account, 'invalid JSON wallet', 'json', '[ REDACTED ]');

        const wallet = new Wallet(account.privateKey);

        assertArgument(wallet.address === account.address, 'address/privateKey mismatch', 'json', '[ REDACTED ]');

        return wallet;
    }

    /**
     * Creates (asynchronously) a **Wallet** by decrypting the `json` with `password`.
     *
     * If `progress` is provided, it is called periodically during decryption so that any UI can be updated.
     *
     * @param {string} json - The JSON data to decrypt.
     * @param {Uint8Array | string} password - The password to decrypt the JSON data.
     * @param {ProgressCallback} [progress] - An optional callback to keep the user informed.
     * @returns {Promise<QuaiHDWallet | Wallet>} The decrypted wallet.
     */
    static async fromEncryptedJson(
        json: string,
        password: Uint8Array | string,
        progress?: ProgressCallback,
    ): Promise<Wallet> {
        let account: KeystoreAccount;
        if (isKeystoreJson(json)) {
            account = await decryptKeystoreJson(json, password, progress);
            return Wallet.#fromAccount(account);
        }
        throw new Error('invalid JSON wallet');
    }

    /**
     * Creates a **Wallet** by decrypting the `json` with `password`.
     *
     * The {@link Wallet.fromEncryptedJson | **fromEncryptedJson**} method is preferred, as this method will lock up and
     * freeze the UI during decryption, which may take some time.
     *
     * @param {string} json - The JSON data to decrypt.
     * @param {Uint8Array | string} password - The password to decrypt the JSON data.
     * @returns {QuaiHDWallet | Wallet} The decrypted wallet.
     */
    static fromEncryptedJsonSync(json: string, password: Uint8Array | string): QuaiHDWallet | Wallet {
        let account: null | KeystoreAccount = null;
        if (isKeystoreJson(json)) {
            account = decryptKeystoreJsonSync(json, password);
        } else {
            assertArgument(false, 'invalid JSON wallet', 'json', '[ REDACTED ]');
        }

        return Wallet.#fromAccount(account);
    }
}
