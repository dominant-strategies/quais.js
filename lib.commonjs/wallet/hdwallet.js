"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quaiHDAccountPath = exports.qiHDAccountPath = exports.getIndexedAccountPath = exports.getAccountPath = exports.HDNodeVoidWallet = exports.HDNodeWallet = void 0;
/**
 *  Explain HD Wallets..
 *
 *  @_subsection: api/wallet:HD Wallets  [hd-wallets]
 */
const index_js_1 = require("../crypto/index.js");
const index_js_2 = require("../providers/index.js");
const index_js_3 = require("../transaction/index.js");
const index_js_4 = require("../utils/index.js");
<<<<<<< HEAD
const lang_en_js_1 = require("../wordlists/lang-en.js");
=======
>>>>>>> ee35178e (utxohdwallet)
const base_wallet_js_1 = require("./base-wallet.js");
const mnemonic_js_1 = require("./mnemonic.js");
const json_keystore_js_1 = require("./json-keystore.js");
const index_js_5 = require("../constants/index.js");
const index_js_6 = require("../utils/index.js");
<<<<<<< HEAD
// "Bitcoin seed"
const MasterSecret = new Uint8Array([66, 105, 116, 99, 111, 105, 110, 32, 115, 101, 101, 100]);
const HardenedBit = 0x80000000;
const N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
const Nibbles = "0123456789abcdef";
function zpad(value, length) {
    let result = "";
    while (value) {
        result = Nibbles[value % 16] + result;
        value = Math.trunc(value / 16);
    }
    while (result.length < length * 2) {
        result = "0" + result;
    }
    return "0x" + result;
}
function encodeBase58Check(_value) {
    const value = (0, index_js_4.getBytes)(_value);
    const check = (0, index_js_4.dataSlice)((0, index_js_1.sha256)((0, index_js_1.sha256)(value)), 0, 4);
    const bytes = (0, index_js_4.concat)([value, check]);
    return (0, index_js_4.encodeBase58)(bytes);
}
const _guard = {};
function ser_I(index, chainCode, publicKey, privateKey) {
    const data = new Uint8Array(37);
    if (index & HardenedBit) {
        (0, index_js_4.assert)(privateKey != null, "cannot derive child of neutered node", "UNSUPPORTED_OPERATION", {
            operation: "deriveChild"
        });
        // Data = 0x00 || ser_256(k_par)
        data.set((0, index_js_4.getBytes)(privateKey), 1);
    }
    else {
        // Data = ser_p(point(k_par))
        data.set((0, index_js_4.getBytes)(publicKey));
    }
    // Data += ser_32(i)
    for (let i = 24; i >= 0; i -= 8) {
        data[33 + (i >> 3)] = ((index >> (24 - i)) & 0xff);
    }
    const I = (0, index_js_4.getBytes)((0, index_js_1.computeHmac)("sha512", chainCode, data));
    return { IL: I.slice(0, 32), IR: I.slice(32) };
}
function derivePath(node, path) {
    const components = path.split("/");
    (0, index_js_4.assertArgument)(components.length > 0 && (components[0] === "m" || node.depth > 0), "invalid path", "path", path);
    if (components[0] === "m") {
        components.shift();
    }
    let result = node;
    for (let i = 0; i < components.length; i++) {
        const component = components[i];
        if (component.match(/^[0-9]+'$/)) {
            const index = parseInt(component.substring(0, component.length - 1));
            (0, index_js_4.assertArgument)(index < HardenedBit, "invalid path index", `path[${i}]`, component);
            result = result.deriveChild(HardenedBit + index);
        }
        else if (component.match(/^[0-9]+$/)) {
            const index = parseInt(component);
            (0, index_js_4.assertArgument)(index < HardenedBit, "invalid path index", `path[${i}]`, component);
            result = result.deriveChild(index);
        }
        else {
            (0, index_js_4.assertArgument)(false, "invalid path component", `path[${i}]`, component);
        }
    }
    // Extract the coin type from the path and set it on the node
    if (result.setCoinType)
        result.setCoinType();
    return result;
}
=======
const utils_js_1 = require("./utils.js");
const _guard = {};
>>>>>>> ee35178e (utxohdwallet)
/**
 *  An **HDNodeWallet** is a [[Signer]] backed by the private key derived
 *  from an HD Node using the [[link-bip-32]] stantard.
 *
 *  An HD Node forms a hierarchal structure with each HD Node having a
 *  private key and the ability to derive child HD Nodes, defined by
 *  a path indicating the index of each child.
 */
class HDNodeWallet extends base_wallet_js_1.BaseWallet {
    /**
     *  The compressed public key.
     */
    #publicKey;
    /**
     *  The fingerprint.
     *
     *  A fingerprint allows quick qay to detect parent and child nodes,
     *  but developers should be prepared to deal with collisions as it
     *  is only 4 bytes.
     */
    fingerprint;
    /**
     *  The parent fingerprint.
     */
    accountFingerprint;
    /**
     *  The mnemonic used to create this HD Node, if available.
     *
     *  Sources such as extended keys do not encode the mnemonic, in
     *  which case this will be ``null``.
     */
    mnemonic;
    /**
     *  The chaincode, which is effectively a public key used
     *  to derive children.
     */
    chainCode;
    /**
     *  The derivation path of this wallet.
     *
     *  Since extended keys do not provider full path details, this
     *  may be ``null``, if instantiated from a source that does not
     *  enocde it.
     */
    path;
    /**
     *  The child index of this wallet. Values over ``2 *\* 31`` indicate
     *  the node is hardened.
     */
    index;
    /**
     *  The depth of this wallet, which is the number of components
     *  in its path.
     */
    depth;
    coinType;
    /**
     *  @private
     */
    constructor(guard, signingKey, accountFingerprint, chainCode, path, index, depth, mnemonic, provider) {
        super(signingKey, provider);
<<<<<<< HEAD
        (0, index_js_4.assertPrivate)(guard, _guard, "HDNodeWallet");
=======
        (0, index_js_4.assertPrivate)(guard, _guard);
>>>>>>> ee35178e (utxohdwallet)
        this.#publicKey = signingKey.compressedPublicKey;
        const fingerprint = (0, index_js_4.dataSlice)((0, index_js_1.ripemd160)((0, index_js_1.sha256)(this.#publicKey)), 0, 4);
        (0, index_js_4.defineProperties)(this, {
            accountFingerprint, fingerprint,
            chainCode, path, index, depth
        });
        (0, index_js_4.defineProperties)(this, { mnemonic });
    }
    connect(provider) {
        return new HDNodeWallet(_guard, this.signingKey, this.accountFingerprint, this.chainCode, this.path, this.index, this.depth, this.mnemonic, provider);
    }
    #account() {
        const account = { address: this.address, privateKey: this.privateKey };
        const m = this.mnemonic;
        if (this.path && m && m.wordlist.locale === "en" && m.password === "") {
            account.mnemonic = {
                path: this.path,
                locale: "en",
                entropy: m.entropy
            };
        }
        return account;
    }
    /**
     *  Resolves to a [JSON Keystore Wallet](json-wallets) encrypted with
     *  %%password%%.
     *
     *  If %%progressCallback%% is specified, it will receive periodic
     *  updates as the encryption process progreses.
     */
    async encrypt(password, progressCallback) {
        return await (0, json_keystore_js_1.encryptKeystoreJson)(this.#account(), password, { progressCallback });
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
        return (0, json_keystore_js_1.encryptKeystoreJsonSync)(this.#account(), password);
    }
    /**
     *  The extended key.
     *
     *  This key will begin with the prefix ``xpriv`` and can be used to
     *  reconstruct this HD Node to derive its children.
     */
    get extendedKey() {
        // We only support the mainnet values for now, but if anyone needs
        // testnet values, let me know. I believe current sentiment is that
        // we should always use mainnet, and use BIP-44 to derive the network
        //   - Mainnet: public=0x0488B21E, private=0x0488ADE4
        //   - Testnet: public=0x043587CF, private=0x04358394
        (0, index_js_4.assert)(this.depth < 256, "Depth too deep", "UNSUPPORTED_OPERATION", { operation: "extendedKey" });
<<<<<<< HEAD
        return encodeBase58Check((0, index_js_4.concat)([
            "0x0488ADE4", zpad(this.depth, 1), this.accountFingerprint ?? '',
            zpad(this.index, 4), this.chainCode,
=======
        return (0, utils_js_1.encodeBase58Check)((0, index_js_4.concat)([
            "0x0488ADE4", (0, utils_js_1.zpad)(this.depth, 1), this.accountFingerprint ?? '',
            (0, utils_js_1.zpad)(this.index, 4), this.chainCode,
>>>>>>> ee35178e (utxohdwallet)
            (0, index_js_4.concat)(["0x00", this.privateKey])
        ]));
    }
    /**
     * Gets the current publicKey
     */
    get publicKey() {
        return this.#publicKey;
    }
    /**
     *  Returns true if this wallet has a path, providing a Type Guard
     *  that the path is non-null.
     */
    hasPath() { return (this.path != null); }
    /**
     *  Returns a neutered HD Node, which removes the private details
     *  of an HD Node.
     *
     *  A neutered node has no private key, but can be used to derive
     *  child addresses and other public data about the HD Node.
     */
    neuter() {
        return new HDNodeVoidWallet(_guard, this.address, this.#publicKey, this.accountFingerprint ?? '', this.chainCode, this.path ?? '', this.index, this.depth, this.provider);
    }
    /**
     *  Return the child for %%index%%.
     */
    deriveChild(_index) {
        const index = (0, index_js_4.getNumber)(_index, "index");
        (0, index_js_4.assertArgument)(index <= 0xffffffff, "invalid index", "index", index);
        // Base path
<<<<<<< HEAD
        let path = this.path;
        if (path) {
            path += "/" + (index & ~HardenedBit);
            if (index & HardenedBit) {
                path += "'";
            }
        }
        const { IR, IL } = ser_I(index, this.chainCode, this.#publicKey, this.privateKey);
        const ki = new index_js_1.SigningKey((0, index_js_4.toBeHex)(((0, index_js_4.toBigInt)(IL) + BigInt(this.privateKey)) % N, 32));
        //BIP44 if we are at the account depth get that fingerprint, otherwise continue with the current one
        let newFingerprint = this.depth == 3 ? this.fingerprint : this.accountFingerprint;
        return new HDNodeWallet(_guard, ki, newFingerprint, (0, index_js_4.hexlify)(IR), path, index, this.depth + 1, this.mnemonic, this.provider);
=======
        let newDepth = this.depth + 1;
        let path = this.path;
        if (path) {
            let pathFields = path.split("/");
            if (pathFields.length == 6) {
                pathFields.pop();
                path = pathFields.join("/");
                newDepth--;
            }
            path += "/" + (index & ~utils_js_1.HardenedBit);
            if (index & utils_js_1.HardenedBit) {
                path += "'";
            }
        }
        const { IR, IL } = (0, utils_js_1.ser_I)(index, this.chainCode, this.#publicKey, this.privateKey);
        const ki = new index_js_1.SigningKey((0, index_js_4.toBeHex)(((0, index_js_4.toBigInt)(IL) + BigInt(this.privateKey)) % index_js_5.N, 32));
        //BIP44 if we are at the account depth get that fingerprint, otherwise continue with the current one
        let newFingerprint = this.depth == 3 ? this.fingerprint : this.accountFingerprint;
        return new HDNodeWallet(_guard, ki, newFingerprint, (0, index_js_4.hexlify)(IR), path, index, newDepth, this.mnemonic, this.provider);
>>>>>>> ee35178e (utxohdwallet)
    }
    /**
     *  Return the HDNode for %%path%% from this node.
     */
    derivePath(path) {
<<<<<<< HEAD
        return derivePath(this, path);
=======
        return (0, utils_js_1.derivePath)(this, path);
>>>>>>> ee35178e (utxohdwallet)
    }
    setCoinType() {
        this.coinType = Number(this.path?.split("/")[2].replace("'", ""));
    }
    static #fromSeed(_seed, mnemonic) {
        (0, index_js_4.assertArgument)((0, index_js_4.isBytesLike)(_seed), "invalid seed", "seed", "[REDACTED]");
        const seed = (0, index_js_4.getBytes)(_seed, "seed");
        (0, index_js_4.assertArgument)(seed.length >= 16 && seed.length <= 64, "invalid seed", "seed", "[REDACTED]");
<<<<<<< HEAD
        const I = (0, index_js_4.getBytes)((0, index_js_1.computeHmac)("sha512", MasterSecret, seed));
=======
        const I = (0, index_js_4.getBytes)((0, index_js_1.computeHmac)("sha512", utils_js_1.MasterSecret, seed));
>>>>>>> ee35178e (utxohdwallet)
        const signingKey = new index_js_1.SigningKey((0, index_js_4.hexlify)(I.slice(0, 32)));
        const result = new HDNodeWallet(_guard, signingKey, "0x00000000", (0, index_js_4.hexlify)(I.slice(32)), "m", 0, 0, mnemonic, null);
        return result;
    }
    /**
     *  Creates a new HD Node from %%extendedKey%%.
     *
     *  If the %%extendedKey%% will either have a prefix or ``xpub`` or
     *  ``xpriv``, returning a neutered HD Node ([[HDNodeVoidWallet]])
     *  or full HD Node ([[HDNodeWallet) respectively.
     */
    static fromExtendedKey(extendedKey) {
        const bytes = (0, index_js_4.toBeArray)((0, index_js_4.decodeBase58)(extendedKey)); // @TODO: redact
<<<<<<< HEAD
        (0, index_js_4.assertArgument)(bytes.length === 82 || encodeBase58Check(bytes.slice(0, 78)) === extendedKey, "invalid extended key", "extendedKey", "[ REDACTED ]");
=======
        (0, index_js_4.assertArgument)(bytes.length === 82 || (0, utils_js_1.encodeBase58Check)(bytes.slice(0, 78)) === extendedKey, "invalid extended key", "extendedKey", "[ REDACTED ]");
>>>>>>> ee35178e (utxohdwallet)
        const depth = bytes[4];
        const accountFingerprint = (0, index_js_4.hexlify)(bytes.slice(5, 9));
        const index = parseInt((0, index_js_4.hexlify)(bytes.slice(9, 13)).substring(2), 16);
        const chainCode = (0, index_js_4.hexlify)(bytes.slice(13, 45));
        const key = bytes.slice(45, 78);
        switch ((0, index_js_4.hexlify)(bytes.slice(0, 4))) {
            // Public Key
            case "0x0488b21e":
            case "0x043587cf": {
                const publicKey = (0, index_js_4.hexlify)(key);
                return new HDNodeVoidWallet(_guard, (0, index_js_3.computeAddress)(publicKey), publicKey, accountFingerprint, chainCode, null, index, depth, null);
            }
            // Private Key
            case "0x0488ade4":
            case "0x04358394 ":
                if (key[0] !== 0) {
                    break;
                }
                return new HDNodeWallet(_guard, new index_js_1.SigningKey(key.slice(1)), accountFingerprint, chainCode, null, index, depth, null, null);
        }
        (0, index_js_4.assertArgument)(false, "invalid extended key prefix", "extendedKey", "[ REDACTED ]");
    }
    /**
     *  Creates a new random HDNode.
     */
    static createRandom(path, password, wordlist) {
<<<<<<< HEAD
        if (password == null) {
            password = "";
        }
        if (path == null || !this.isValidPath(path)) {
            throw new Error('Invalid path: ' + path);
        }
        if (wordlist == null) {
            wordlist = lang_en_js_1.LangEn.wordlist();
        }
=======
        if (path == null || !this.isValidPath(path)) {
            throw new Error('Invalid path: ' + path);
        }
>>>>>>> ee35178e (utxohdwallet)
        const mnemonic = mnemonic_js_1.Mnemonic.fromEntropy((0, index_js_1.randomBytes)(16), password, wordlist);
        return HDNodeWallet.#fromSeed(mnemonic.computeSeed(), mnemonic).derivePath(path);
    }
    /**
     *  Create an HD Node from %%mnemonic%%.
     */
    static fromMnemonic(mnemonic, path) {
        if (path == null || !this.isValidPath(path)) {
            throw new Error('Invalid path: ' + path);
        }
        return HDNodeWallet.#fromSeed(mnemonic.computeSeed(), mnemonic).derivePath(path);
    }
    /**
     *  Creates an HD Node from a mnemonic %%phrase%%.
     */
    static fromPhrase(phrase, path, password, wordlist) {
<<<<<<< HEAD
        if (password == null) {
            password = "";
        }
        if (path == null || !this.isValidPath(path)) {
            throw new Error('Invalid path: ' + path);
        }
        if (wordlist == null) {
            wordlist = lang_en_js_1.LangEn.wordlist();
        }
=======
        if (path == null || !this.isValidPath(path)) {
            throw new Error('Invalid path: ' + path);
        }
>>>>>>> ee35178e (utxohdwallet)
        const mnemonic = mnemonic_js_1.Mnemonic.fromPhrase(phrase, password, wordlist);
        return HDNodeWallet.#fromSeed(mnemonic.computeSeed(), mnemonic).derivePath(path);
    }
    /**
     * Checks if the provided BIP44 path is valid and limited to the change level.
     * @param path The BIP44 path to check.
     * @returns true if the path is valid and does not include the address_index; false otherwise.
     */
    static isValidPath(path) {
        // BIP44 path regex pattern for up to the 'change' level, excluding 'address_index'
        // This pattern matches paths like "m/44'/0'/0'/0" and "m/44'/60'/0'/1", but not "m/44'/60'/0'/0/0"
        const pathRegex = /^m\/44'\/\d+'\/\d+'\/[01]$/;
        return pathRegex.test(path);
    }
    /**
     *  Creates an HD Node from a %%seed%%.
     */
    static fromSeed(seed) {
        return HDNodeWallet.#fromSeed(seed, null);
    }
    /**
     * Derives address by incrementing address_index according to BIP44
     */
    deriveAddress(index, zone) {
<<<<<<< HEAD
=======
        if (!this.path)
            throw new Error("Missing Path");
>>>>>>> ee35178e (utxohdwallet)
        //Case for a non quai/qi wallet where zone is not needed
        if (!zone) {
            if (this.coinType == 994 || this.coinType == 969) {
                //Zone not provided but wallet cointype is quai/qi
                throw new Error("No zone provided for a Quai / Qi wallet");
            }
            //Return address for any other cointype with no 
            return this.derivePath(this.path + "/" + index.toString());
        }
        zone = zone.toLowerCase();
        // Check if zone is valid
        const shard = index_js_5.ShardData.find(shard => shard.name.toLowerCase() === zone || shard.nickname.toLowerCase() === zone || shard.byte.toLowerCase() === zone);
        if (!shard) {
            throw new Error("Invalid zone");
        }
<<<<<<< HEAD
        if (!this.path)
            throw new Error("Missing Path");
=======
>>>>>>> ee35178e (utxohdwallet)
        let newWallet;
        let addrIndex = 0;
        let zoneIndex = index + 1;
        do {
<<<<<<< HEAD
            // const pathComponents = this.path?.split('/');
            // let newPath;
            // if (pathComponents.length == 5) {
            //     newPath = this.path + "/" + addrIndex.toString();
            // } else if (pathComponents.length == 6)
            //     newPath = this.path.replace(pathComponents[pathComponents.length - 1], addrIndex.toString());
            //     else throw new Error(`Invalid or uncomplete path: ${newPath} ${this.path}`);
=======
>>>>>>> ee35178e (utxohdwallet)
            newWallet = this.derivePath(addrIndex.toString());
            if ((0, index_js_6.getShardForAddress)(newWallet.address) == shard && ((newWallet.coinType == 969) == (0, index_js_6.isUTXOAddress)(newWallet.address)))
                zoneIndex--;
            addrIndex++;
        } while (zoneIndex > 0);
        return newWallet;
    }
}
exports.HDNodeWallet = HDNodeWallet;
// // In crements the address_ index according to BIP-44
// function incrementPathIndex(path: string): string {
//     const parts = path.split('/');
//     const lastIndex = parseInt(parts[parts.length - 1], 10);
//     parts[parts.length - 1] = (lastIndex + 1).toString();
//     return parts.join('/');
// }
/**
 *  A **HDNodeVoidWallet** cannot sign, but provides access to
 *  the children nodes of a [[link-bip-32]] HD wallet addresses.
 *
 *  The can be created by using an extended ``xpub`` key to
 *  [[HDNodeWallet_fromExtendedKey]] or by
 *  [nuetering](HDNodeWallet-neuter) a [[HDNodeWallet]].
 */
class HDNodeVoidWallet extends index_js_2.VoidSigner {
    /**
     *  The compressed public key.
     */
    publicKey;
    /**
     *  The fingerprint.
     *
     *  A fingerprint allows quick qay to detect parent and child nodes,
     *  but developers should be prepared to deal with collisions as it
     *  is only 4 bytes.
     */
    fingerprint;
    /**
     *  The parent node fingerprint.
     */
    accountFingerprint;
    /**
     *  The chaincode, which is effectively a public key used
     *  to derive children.
     */
    chainCode;
    /**
     *  The derivation path of this wallet.
     *
     *  Since extended keys do not provider full path details, this
     *  may be ``null``, if instantiated from a source that does not
     *  enocde it.
     */
    path;
    /**
     *  The child index of this wallet. Values over ``2 *\* 31`` indicate
     *  the node is hardened.
     */
    index;
    /**
     *  The depth of this wallet, which is the number of components
     *  in its path.
     */
    depth;
    /**
     *  @private
     */
    constructor(guard, address, publicKey, accountFingerprint, chainCode, path, index, depth, provider) {
        super(address, provider);
        (0, index_js_4.assertPrivate)(guard, _guard, "HDNodeVoidWallet");
        (0, index_js_4.defineProperties)(this, { publicKey });
        const fingerprint = (0, index_js_4.dataSlice)((0, index_js_1.ripemd160)((0, index_js_1.sha256)(publicKey)), 0, 4);
        (0, index_js_4.defineProperties)(this, {
            publicKey, fingerprint, accountFingerprint, chainCode, path, index, depth
        });
    }
    connect(provider) {
        return new HDNodeVoidWallet(_guard, this.address, this.publicKey, this.accountFingerprint ?? '', this.chainCode, this.path, this.index, this.depth, provider);
    }
    /**
     *  The extended key.
     *
     *  This key will begin with the prefix ``xpub`` and can be used to
     *  reconstruct this neutered key to derive its children addresses.
     */
    get extendedKey() {
        // We only support the mainnet values for now, but if anyone needs
        // testnet values, let me know. I believe current sentiment is that
        // we should always use mainnet, and use BIP-44 to derive the network
        //   - Mainnet: public=0x0488B21E, private=0x0488ADE4
        //   - Testnet: public=0x043587CF, private=0x04358394
        (0, index_js_4.assert)(this.depth < 256, "Depth too deep", "UNSUPPORTED_OPERATION", { operation: "extendedKey" });
<<<<<<< HEAD
        return encodeBase58Check((0, index_js_4.concat)([
            "0x0488B21E",
            zpad(this.depth, 1),
            this.accountFingerprint ?? '',
            zpad(this.index, 4),
=======
        return (0, utils_js_1.encodeBase58Check)((0, index_js_4.concat)([
            "0x0488B21E",
            (0, utils_js_1.zpad)(this.depth, 1),
            this.accountFingerprint ?? '',
            (0, utils_js_1.zpad)(this.index, 4),
>>>>>>> ee35178e (utxohdwallet)
            this.chainCode,
            this.publicKey,
        ]));
    }
    /**
     *  Returns true if this wallet has a path, providing a Type Guard
     *  that the path is non-null.
     */
    hasPath() { return (this.path != null); }
    /**
     *  Return the child for %%index%%.
     */
    deriveChild(_index) {
        const index = (0, index_js_4.getNumber)(_index, "index");
        (0, index_js_4.assertArgument)(index <= 0xffffffff, "invalid index", "index", index);
        // Base path
        let path = this.path;
        if (path) {
<<<<<<< HEAD
            path += "/" + (index & ~HardenedBit);
            if (index & HardenedBit) {
                path += "'";
            }
        }
        const { IR, IL } = ser_I(index, this.chainCode, this.publicKey, null);
=======
            path += "/" + (index & ~utils_js_1.HardenedBit);
            if (index & utils_js_1.HardenedBit) {
                path += "'";
            }
        }
        const { IR, IL } = (0, utils_js_1.ser_I)(index, this.chainCode, this.publicKey, null);
>>>>>>> ee35178e (utxohdwallet)
        const Ki = index_js_1.SigningKey.addPoints(IL, this.publicKey, true);
        const address = (0, index_js_3.computeAddress)(Ki);
        return new HDNodeVoidWallet(_guard, address, Ki, this.fingerprint, (0, index_js_4.hexlify)(IR), path, index, this.depth + 1, this.provider);
    }
    /**
     *  Return the signer for %%path%% from this node.
     */
    derivePath(path) {
<<<<<<< HEAD
        return derivePath(this, path);
=======
        return (0, utils_js_1.derivePath)(this, path);
>>>>>>> ee35178e (utxohdwallet)
    }
}
exports.HDNodeVoidWallet = HDNodeVoidWallet;
/*
export class HDNodeWalletManager {
    #root: HDNodeWallet;

    constructor(phrase: string, password?: null | string, path?: null | string, locale?: null | Wordlist) {
        if (password == null) { password = ""; }
        if (path == null) { path = "m/44'/60'/0'/0"; }
        if (locale == null) { locale = LangEn.wordlist(); }
        this.#root = HDNodeWallet.fromPhrase(phrase, password, path, locale);
    }

    getSigner(index?: number): HDNodeWallet {
        return this.#root.deriveChild((index == null) ? 0: index);
    }
}
*/
/**
 *  Returns the [[link-bip-32]] path for the account at %%index%%.
 *
 *  This is the pattern used by wallets like Ledger.
 *
 *  There is also an [alternate pattern](getIndexedAccountPath) used by
 *  some software.
 */
function getAccountPath(_index) {
    const index = (0, index_js_4.getNumber)(_index, "index");
<<<<<<< HEAD
    (0, index_js_4.assertArgument)(index >= 0 && index < HardenedBit, "invalid account index", "index", index);
=======
    (0, index_js_4.assertArgument)(index >= 0 && index < utils_js_1.HardenedBit, "invalid account index", "index", index);
>>>>>>> ee35178e (utxohdwallet)
    return `m/44'/60'/${index}'/0/0`;
}
exports.getAccountPath = getAccountPath;
/**
 *  Returns the path using an alternative pattern for deriving accounts,
 *  at %%index%%.
 *
 *  This derivation path uses the //index// component rather than the
 *  //account// component to derive sequential accounts.
 *
 *  This is the pattern used by wallets like MetaMask.
 */
function getIndexedAccountPath(_index) {
    const index = (0, index_js_4.getNumber)(_index, "index");
<<<<<<< HEAD
    (0, index_js_4.assertArgument)(index >= 0 && index < HardenedBit, "invalid account index", "index", index);
=======
    (0, index_js_4.assertArgument)(index >= 0 && index < utils_js_1.HardenedBit, "invalid account index", "index", index);
>>>>>>> ee35178e (utxohdwallet)
    return `m/44'/60'/0'/0/${index}`;
}
exports.getIndexedAccountPath = getIndexedAccountPath;
/**
 * Returns a derivation path for a Qi blockchain account.
 * @param {number} account - The account index (defaults to 0).
 * @returns {string} The BIP44 derivation path for the specified account on the Qi blockchain.
 */
function qiHDAccountPath(account = 0, change = false) {
    return `m/44'/969'/${account}'/${change ? 1 : 0}`;
}
exports.qiHDAccountPath = qiHDAccountPath;
/**
 * Returns a derivation path for a Quai blockchain account.
 * @param {number} account - The account index (defaults to 0).
 * @returns {string} The BIP44 derivation path for the specified account on the Quai blockchain.
 */
function quaiHDAccountPath(account = 0) {
    return `m/44'/994'/${account}'/0`;
}
exports.quaiHDAccountPath = quaiHDAccountPath;
//# sourceMappingURL=hdwallet.js.map