"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Wallet = void 0;
const index_js_1 = require("../crypto/index.js");
const index_js_2 = require("../utils/index.js");
const base_wallet_js_1 = require("./base-wallet.js");
const hdwallet_js_1 = require("./hdwallet.js");
const json_crowdsale_js_1 = require("./json-crowdsale.js");
const json_keystore_js_1 = require("./json-keystore.js");
const mnemonic_js_1 = require("./mnemonic.js");
<<<<<<< HEAD
=======
const utxohdwallet_js_1 = require("./utxohdwallet.js");
>>>>>>> ee35178e (utxohdwallet)
function stall(duration) {
    return new Promise((resolve) => { setTimeout(() => { resolve(); }, duration); });
}
/**
 *  A **Wallet** manages a single private key which is used to sign
 *  transactions, messages and other common payloads.
 *
 *  This class is generally the main entry point for developers
 *  that wish to use a private key directly, as it can create
 *  instances from a large variety of common sources, including
 *  raw private key, [[link-bip-39]] mnemonics and encrypte JSON
 *  wallets.
 */
class Wallet extends base_wallet_js_1.BaseWallet {
    /**
     *  Create a new wallet for the private %%key%%, optionally connected
     *  to %%provider%%.
     */
    constructor(key, provider) {
        if (typeof (key) === "string" && !key.startsWith("0x")) {
            key = "0x" + key;
        }
        let signingKey = (typeof (key) === "string") ? new index_js_1.SigningKey(key) : key;
        super(signingKey, provider);
    }
    connect(provider) {
        return new Wallet(this.signingKey, provider);
    }
    /**
     *  Resolves to a [JSON Keystore Wallet](json-wallets) encrypted with
     *  %%password%%.
     *
     *  If %%progressCallback%% is specified, it will receive periodic
     *  updates as the encryption process progreses.
     */
    async encrypt(password, progressCallback) {
        const account = { address: this.address, privateKey: this.privateKey };
        return await (0, json_keystore_js_1.encryptKeystoreJson)(account, password, { progressCallback });
    }
    /**
     *  Returns a [JSON Keystore Wallet](json-wallets) encryped with
     *  %%password%%.
     *
     *  It is preferred to use the [async version](encrypt) instead,
     *  which allows a [[ProgressCallback]] to keep the user informed.
     *
     *  This method will block the event loop (freezing all UI) until
     *  it is complete, which may be a non-trivial duration.
     */
    encryptSync(password) {
        const account = { address: this.address, privateKey: this.privateKey };
        return (0, json_keystore_js_1.encryptKeystoreJsonSync)(account, password);
    }
    static #fromAccount(account) {
        (0, index_js_2.assertArgument)(account, "invalid JSON wallet", "json", "[ REDACTED ]");
        if ("mnemonic" in account && account.mnemonic && account.mnemonic.locale === "en") {
            const mnemonic = mnemonic_js_1.Mnemonic.fromEntropy(account.mnemonic.entropy);
            const wallet = hdwallet_js_1.HDNodeWallet.fromMnemonic(mnemonic, account.mnemonic.path || ''); // Add a check for undefined path
            if (wallet.address === account.address && wallet.privateKey === account.privateKey) {
                return wallet;
            }
            console.log("WARNING: JSON mismatch address/privateKey != mnemonic; fallback onto private key");
        }
        const wallet = new Wallet(account.privateKey);
        (0, index_js_2.assertArgument)(wallet.address === account.address, "address/privateKey mismatch", "json", "[ REDACTED ]");
        return wallet;
    }
    /**
     *  Creates (asynchronously) a **Wallet** by decrypting the %%json%%
     *  with %%password%%.
     *
     *  If %%progress%% is provided, it is called periodically during
     *  decryption so that any UI can be updated.
     */
    static async fromEncryptedJson(json, password, progress) {
        let account = null;
        if ((0, json_keystore_js_1.isKeystoreJson)(json)) {
            account = await (0, json_keystore_js_1.decryptKeystoreJson)(json, password, progress);
        }
        else if ((0, json_crowdsale_js_1.isCrowdsaleJson)(json)) {
            if (progress) {
                progress(0);
                await stall(0);
            }
            account = (0, json_crowdsale_js_1.decryptCrowdsaleJson)(json, password);
            if (progress) {
                progress(1);
                await stall(0);
            }
        }
        return Wallet.#fromAccount(account);
    }
    /**
     *  Creates a **Wallet** by decrypting the %%json%% with %%password%%.
     *
     *  The [[fromEncryptedJson]] method is preferred, as this method
     *  will lock up and freeze the UI during decryption, which may take
     *  some time.
     */
    static fromEncryptedJsonSync(json, password) {
        let account = null;
        if ((0, json_keystore_js_1.isKeystoreJson)(json)) {
            account = (0, json_keystore_js_1.decryptKeystoreJsonSync)(json, password);
        }
        else if ((0, json_crowdsale_js_1.isCrowdsaleJson)(json)) {
            account = (0, json_crowdsale_js_1.decryptCrowdsaleJson)(json, password);
        }
        else {
            (0, index_js_2.assertArgument)(false, "invalid JSON wallet", "json", "[ REDACTED ]");
        }
        return Wallet.#fromAccount(account);
    }
    /**
     *  Creates a new random [[HDNodeWallet]] using the available
     *  [cryptographic random source](randomBytes).
     *
     *  If there is no crytographic random source, this will throw.
     */
    static createRandom(path, provider) {
        const wallet = hdwallet_js_1.HDNodeWallet.createRandom(path);
        if (provider) {
            return wallet.connect(provider);
        }
        return wallet;
    }
    /**"m/44'/60'/0'/0/0"
     *  Creates a [[HDNodeWallet]] for %%phrase%%.
     */
    static fromPhrase(phrase, path, provider, wordlist) {
<<<<<<< HEAD
        const wallet = hdwallet_js_1.HDNodeWallet.fromPhrase(phrase, path, undefined, wordlist);
        if (provider) {
            return wallet.connect(provider);
        }
        return wallet;
=======
        const splitPath = path.split('/');
        if (splitPath.length < 3)
            throw new Error(`Incomplete path for wallet derivation ${path}`);
        let coinTypeStr = splitPath[2];
        coinTypeStr = coinTypeStr.replace("'", "");
        const coinType = parseInt(coinTypeStr);
        let wallet;
        switch (coinType) {
            case 994:
                wallet = hdwallet_js_1.HDNodeWallet.fromPhrase(phrase, path, undefined, wordlist);
                if (provider) {
                    return wallet.connect(provider);
                }
                return wallet;
            case 969:
                wallet = utxohdwallet_js_1.UTXOHDWallet.fromPhrase(phrase, path, undefined, wordlist);
                if (provider) {
                    return wallet.connect(provider);
                }
                return wallet;
            default:
                throw new Error(`Unsupported cointype ${coinType} for HD wallet derivation`);
        }
>>>>>>> ee35178e (utxohdwallet)
    }
}
exports.Wallet = Wallet;
//# sourceMappingURL=wallet.js.map