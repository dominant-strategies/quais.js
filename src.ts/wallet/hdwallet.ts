/**
 *  Explain HD Wallets..
 *
 *  @section api/wallet:HD Wallets  [hd-wallets]
 */
import { computeHmac, randomBytes, ripemd160, SigningKey, sha256 } from "../crypto/index.js";
import { VoidSigner } from "../providers/index.js";
import { computeAddress } from "../transaction/index.js";
import {
    concat, dataSlice, decodeBase58, defineProperties,
    getBytes, hexlify, isBytesLike,
    getNumber, toBeArray, toBigInt, toBeHex,
    assertPrivate, assert, assertArgument
} from "../utils/index.js";
import { BaseWallet } from "./base-wallet.js";
import { Mnemonic } from "./mnemonic.js";
import {
    encryptKeystoreJson, encryptKeystoreJsonSync,
} from "./json-keystore.js";
import { N, ShardData } from "../constants/index.js";
import { getShardForAddress, isUTXOAddress } from "../utils/index.js";
import type { ProgressCallback } from "../crypto/index.js";
import type { Provider } from "../providers/index.js";
import type { BytesLike, Numeric } from "../utils/index.js";
import type { Wordlist } from "../wordlists/index.js";
import type { KeystoreAccount } from "./json-keystore.js";
import { encodeBase58Check, zpad, HardenedBit, ser_I, derivePath, MasterSecret } from "./utils.js";

const _guard = { };

/**
 *  An **HDNodeWallet** is a [Signer](../interfaces/Signer) backed by the private key derived
 *  from an HD Node using the [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) stantard.
 *
 *  An HD Node forms a hierarchal structure with each HD Node having a
 *  private key and the ability to derive child HD Nodes, defined by
 *  a path indicating the index of each child.
 * 
 *  @category Wallet
 */
export class HDNodeWallet extends BaseWallet {
    /**
     *  The compressed public key.
     */
    readonly #publicKey!: string;

    /**
     *  The fingerprint.
     *
     *  A fingerprint allows quick qay to detect parent and child nodes,
     *  but developers should be prepared to deal with collisions as it
     *  is only 4 bytes.
     */
    readonly fingerprint!: string;

    /**
     *  The parent fingerprint.
     */
    readonly accountFingerprint!: string;

    /**
     *  The mnemonic used to create this HD Node, if available.
     *
     *  Sources such as extended keys do not encode the mnemonic, in
     *  which case this will be `null`.
     */
    readonly mnemonic!: null | Mnemonic;

    /**
     *  The chaincode, which is effectively a public key used
     *  to derive children.
     */
    readonly chainCode!: string;

    /**
     *  The derivation path of this wallet.
     *
     *  Since extended keys do not provider full path details, this
     *  may be `null`, if instantiated from a source that does not
     *  enocde it.
     */
    readonly path!: null | string;

    /**
     *  The child index of this wallet. Values over `2 *\* 31` indicate
     *  the node is hardened.
     */
    readonly index!: number;

    /**
     *  The depth of this wallet, which is the number of components
     *  in its path.
     */
    readonly depth!: number;


    coinType?: number;

    /**
     *  @private
     */
    constructor(guard: any, signingKey: SigningKey, accountFingerprint: string, chainCode: string, path: null | string, index: number, depth: number, mnemonic: null | Mnemonic, provider: null | Provider) {
        super(signingKey, provider);
        assertPrivate(guard, _guard);

        this.#publicKey = signingKey.compressedPublicKey 

        const fingerprint = dataSlice(ripemd160(sha256(this.#publicKey)), 0, 4);
        defineProperties<HDNodeWallet>(this, {
            accountFingerprint, fingerprint,
            chainCode, path, index, depth
        });
        defineProperties<HDNodeWallet>(this, { mnemonic });
    }

    connect(provider: null | Provider): HDNodeWallet {
        return new HDNodeWallet(_guard, this.signingKey, this.accountFingerprint,
            this.chainCode, this.path, this.index, this.depth, this.mnemonic, provider);
    }

    #account(): KeystoreAccount {
        const account: KeystoreAccount = { address: this.address, privateKey: this.privateKey };
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
     *  `password`.
     *
     *  If `progressCallback` is specified, it will receive periodic
     *  updates as the encryption process progreses.
     * 
     *  @param {Uint8Array | string} password - The password to encrypt the wallet with.
     *  @param {ProgressCallback} [progressCallback] - An optional callback to receive progress updates.
     *  @returns {Promise<string>} The encrypted JSON Keystore Wallet.
     */
    async encrypt(password: Uint8Array | string, progressCallback?: ProgressCallback): Promise<string> {
        return await encryptKeystoreJson(this.#account(), password, { progressCallback });
    }

    /**
     *  Returns a [JSON Keystore Wallet](json-wallets) encryped with
     *  `password`.
     *
     *  It is preferred to use the [async version](encrypt) instead,
     *  which allows a {@link ProgressCallback | **ProgressCallback**} to keep the user informed.
     *
     *  This method will block the event loop (freezing all UI) until
     *  it is complete, which may be a non-trivial duration.
     * 
     *  @param {Uint8Array | string} password - The password to encrypt the wallet with.
     *  @returns {string} The encrypted JSON Keystore Wallet.
     */
    encryptSync(password: Uint8Array | string): string {
        return encryptKeystoreJsonSync(this.#account(), password);
    }

    /**
     *  The extended key.
     *
     *  This key will begin with the prefix `xpriv` and can be used to
     *  reconstruct this HD Node to derive its children.
     */
    get extendedKey(): string {
        // We only support the mainnet values for now, but if anyone needs
        // testnet values, let me know. I believe current sentiment is that
        // we should always use mainnet, and use BIP-44 to derive the network
        //   - Mainnet: public=0x0488B21E, private=0x0488ADE4
        //   - Testnet: public=0x043587CF, private=0x04358394

        assert(this.depth < 256, "Depth too deep", "UNSUPPORTED_OPERATION", { operation: "extendedKey" });

        return encodeBase58Check(concat([
            "0x0488ADE4", zpad(this.depth, 1), this.accountFingerprint ?? '',
            zpad(this.index, 4), this.chainCode,
            concat([ "0x00", this.privateKey ])
        ]));
    }

    /**
     * Gets the current publicKey
     */
    get publicKey(): string {
        return this.#publicKey;
    }


    /**
     *  Returns true if this wallet has a path, providing a Type Guard
     *  that the path is non-null.
     * 
     *  @returns {boolean} True if the path is non-null.
     */
    hasPath(): this is { path: string } { return (this.path != null); }

    /**
     *  Returns a neutered HD Node, which removes the private details
     *  of an HD Node.
     *
     *  A neutered node has no private key, but can be used to derive
     *  child addresses and other public data about the HD Node.
     * 
     *  @returns {HDNodeVoidWallet} A neutered HD Node.
     */
    neuter(): HDNodeVoidWallet {
        return new HDNodeVoidWallet(_guard, this.address, this.#publicKey,
            this.accountFingerprint ?? '', this.chainCode, this.path ?? '', this.index,
            this.depth, this.provider);
    }

    /**
     *  Return the child for `index`.
     * 
     *  @param {Numeric} _index - The index of the child to derive.
     *  @returns {HDNodeWallet} The derived child HD Node.
     */
    deriveChild(_index: Numeric): HDNodeWallet {
        const index = getNumber(_index, "index");
        assertArgument(index <= 0xffffffff, "invalid index", "index", index);

        // Base path
        let newDepth = this.depth + 1;
        let path = this.path;
        if (path) {
            let pathFields = path.split("/");
            if (pathFields.length == 6){
                pathFields.pop();
                path = pathFields.join("/");
                newDepth--;
            }

            path += "/" + (index & ~HardenedBit);
            if (index & HardenedBit) { path += "'"; }
        }

        const { IR, IL } = ser_I(index, this.chainCode, this.#publicKey, this.privateKey);
        const ki = new SigningKey(toBeHex((toBigInt(IL) + BigInt(this.privateKey)) % N, 32));
        
        //BIP44 if we are at the account depth get that fingerprint, otherwise continue with the current one
        let newFingerprint = this.depth == 3 ? this.fingerprint : this.accountFingerprint;

        return new HDNodeWallet(_guard, ki, newFingerprint, hexlify(IR),
            path, index, newDepth, this.mnemonic, this.provider);

    }

    /**
     *  Return the HDNode for `path` from this node.
     * 
     *  @param {string} path - The path to derive.
     *  @returns {HDNodeWallet} The derived HD Node.
     */
    derivePath(path: string): HDNodeWallet {
        return derivePath<HDNodeWallet>(this, path);
    }

    setCoinType(): void {
        this.coinType = Number(this.path?.split("/")[2].replace("'", ""));
    }

    static #fromSeed(_seed: BytesLike, mnemonic: null | Mnemonic): HDNodeWallet {
        assertArgument(isBytesLike(_seed), "invalid seed", "seed", "[REDACTED]");

        const seed = getBytes(_seed, "seed");
        assertArgument(seed.length >= 16 && seed.length <= 64 , "invalid seed", "seed", "[REDACTED]");

        const I = getBytes(computeHmac("sha512", MasterSecret, seed));
        const signingKey = new SigningKey(hexlify(I.slice(0, 32)));

        const result = new HDNodeWallet(_guard, signingKey, "0x00000000", hexlify(I.slice(32)),
            "m", 0, 0, mnemonic, null);
        return result;
    }

    /**
     *  Creates a new HD Node from `extendedKey`.
     *
     *  If the `extendedKey` will either have a prefix or `xpub` or
     *  `xpriv`, returning a neutered HD Node ({@link HDNodeVoidWallet | **HDNodeVoidWallet**})
     *  or full HD Node ({@link HDNodeWallet | **HDNodeWallet**}) respectively.
     * 
     *  @param {string} extendedKey - The extended key to create the HD Node from.
     *  @returns {HDNodeWallet | HDNodeVoidWallet} The HD Node created from the extended key.
     */
    static fromExtendedKey(extendedKey: string): HDNodeWallet | HDNodeVoidWallet {
        const bytes = toBeArray(decodeBase58(extendedKey)); // @TODO: redact

        assertArgument(bytes.length === 82 || encodeBase58Check(bytes.slice(0, 78)) === extendedKey,
            "invalid extended key", "extendedKey", "[ REDACTED ]");

        const depth = bytes[4];
        const accountFingerprint = hexlify(bytes.slice(5, 9));
        const index = parseInt(hexlify(bytes.slice(9, 13)).substring(2), 16);
        const chainCode = hexlify(bytes.slice(13, 45));
        const key = bytes.slice(45, 78);

        switch (hexlify(bytes.slice(0, 4))) {
            // Public Key
            case "0x0488b21e": case "0x043587cf": {
                const publicKey = hexlify(key);
                return new HDNodeVoidWallet(_guard, computeAddress(publicKey), publicKey,
                    accountFingerprint, chainCode, null, index, depth, null);
            }

            // Private Key
            case "0x0488ade4": case "0x04358394 ":
                if (key[0] !== 0) { break; }
                return new HDNodeWallet(_guard, new SigningKey(key.slice(1)),
                    accountFingerprint, chainCode, null, index, depth, null, null);
        }


        assertArgument(false, "invalid extended key prefix", "extendedKey", "[ REDACTED ]");
    }

    /**
     *  Creates a new random HDNode.
     * 
     *  @param {string} path - The BIP44 path to derive the HD Node from.
     *  @param {string} [password] - The password to use for the mnemonic.
     *  @param {Wordlist} [wordlist] - The wordlist to use for the mnemonic.
     *  @returns {HDNodeWallet} The new HD Node.
     */
    static createRandom( path: string, password?: string, wordlist?: Wordlist): HDNodeWallet {
        if (path == null || !this.isValidPath(path)) { throw new Error('Invalid path: ' + path)}
        const mnemonic = Mnemonic.fromEntropy(randomBytes(16), password, wordlist)
        return HDNodeWallet.#fromSeed(mnemonic.computeSeed(), mnemonic).derivePath(path);
    }

    /**
     *  Create an HD Node from `mnemonic`.
     * 
     *  @param {Mnemonic} mnemonic - The mnemonic to create the HD Node from.
     *  @param {string} path - The BIP44 path to derive the HD Node from.
     *  @returns {HDNodeWallet} The new HD Node Wallet.
     */
    static fromMnemonic(mnemonic: Mnemonic, path: string): HDNodeWallet {
        if (path == null || !this.isValidPath(path)) { throw new Error('Invalid path: ' + path)}
        return HDNodeWallet.#fromSeed(mnemonic.computeSeed(), mnemonic).derivePath(path);
    }

    /**
     *  Creates an HD Node from a mnemonic `phrase`.
     * 
     *  @param {string} phrase - The mnemonic phrase to create the HD Node from.
     *  @param {string} path - The BIP44 path to derive the HD Node from.
     *  @param {string} [password] - The password to use for the mnemonic.
     *  @param {Wordlist} [wordlist] - The wordlist to use for the mnemonic.
     *  @returns {HDNodeWallet} The new HD Node Wallet.
     */
    static fromPhrase(phrase: string, path: string, password?: string, wordlist?: Wordlist): HDNodeWallet {
        if (path == null || !this.isValidPath(path)) { throw new Error('Invalid path: ' + path)}
        const mnemonic = Mnemonic.fromPhrase(phrase, password, wordlist)
        return HDNodeWallet.#fromSeed(mnemonic.computeSeed(), mnemonic).derivePath(path);
    }

    /**
     *  Checks if the provided BIP44 path is valid and limited to the change level.
     *  
     *  @param {string} path - The BIP44 path to validate.
     *  @returns {boolean} true if the path is valid and does not include the address_index; false otherwise.
     */
    static isValidPath(path: string): boolean {
        // BIP44 path regex pattern for up to the 'change' level, excluding 'address_index'
        // This pattern matches paths like "m/44'/0'/0'/0" and "m/44'/60'/0'/1", but not "m/44'/60'/0'/0/0"
        const pathRegex = /^m\/44'\/\d+'\/\d+'\/[01]$/;
        return pathRegex.test(path);
    }


    /**
     *  Creates an HD Node from a `seed`.
     * 
     *  @param {BytesLike} seed - The seed to create the HD Node from.
     *  @returns {HDNodeWallet} The new HD Node Wallet.
     */
    static fromSeed(seed: BytesLike): HDNodeWallet {
        return HDNodeWallet.#fromSeed(seed, null);
    }

    /**
     * Derives address by incrementing address_index according to BIP44
     * 
     *  @param {number} index - The index of the address to derive.
     *  @param {string} [zone] - The zone of the address to derive.
     *  @returns {HDNodeWallet} The derived HD Node.
     *  @throws {Error} If the path is missing or the zone is invalid.
     */
    deriveAddress(index: number, zone?: string): HDNodeWallet {
        if (!this.path) throw new Error("Missing Path");

        //Case for a non quai/qi wallet where zone is not needed
        if (!zone){
            if (this.coinType == 994 || this.coinType == 969){
                //Zone not provided but wallet cointype is quai/qi
                throw new Error("No zone provided for a Quai / Qi wallet")
            }
            //Return address for any other cointype with no 
            return this.derivePath(this.path + "/" + index.toString());
        }
        zone = zone.toLowerCase();
        // Check if zone is valid
        const shard = ShardData.find(shard => shard.name.toLowerCase() === zone || shard.nickname.toLowerCase() === zone || shard.byte.toLowerCase() === zone);
        if (!shard) {
            throw new Error("Invalid zone");
        }

        let newWallet: HDNodeWallet;
        let addrIndex: number = 0;
        let zoneIndex: number = index + 1;
        do {
            newWallet = this.derivePath(addrIndex.toString());
            if (getShardForAddress(newWallet.address) == shard && ((newWallet.coinType == 969) == isUTXOAddress(newWallet.address)))
            zoneIndex--;
            addrIndex++;
        } while ( zoneIndex > 0);

        return newWallet;   
    }

}

// // In crements the address_ index according to BIP-44
// function incrementPathIndex(path: string): string {
//     const parts = path.split('/');
//     const lastIndex = parseInt(parts[parts.length - 1], 10);
//     parts[parts.length - 1] = (lastIndex + 1).toString();
//     return parts.join('/');
// }



/**
 *  A **HDNodeVoidWallet** cannot sign, but provides access to
 *  the children nodes of a [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) HD wallet addresses.
 *
 *  The can be created by using an extended `xpub` key to
 *  {@link HDNodeWallet.fromExtendedKey | **HDNodeWallet.fromExtendedKey**} or by 
 *  [nuetering](HDNodeWallet-neuter) a {@link HDNodeWallet | **HDNodeWallet**}.
 * 
 *  @category Wallet
 */
export class HDNodeVoidWallet extends VoidSigner {
    /**
     *  The compressed public key.
     */
    readonly publicKey!: string;

    /**
     *  The fingerprint.
     *
     *  A fingerprint allows quick qay to detect parent and child nodes,
     *  but developers should be prepared to deal with collisions as it
     *  is only 4 bytes.
     */
    readonly fingerprint!: string;

    /**
     *  The parent node fingerprint.
     */
    readonly accountFingerprint!: string;

    /**
     *  The chaincode, which is effectively a public key used
     *  to derive children.
     */
    readonly chainCode!: string;

    /**
     *  The derivation path of this wallet.
     *
     *  Since extended keys do not provider full path details, this
     *  may be `null`, if instantiated from a source that does not
     *  enocde it.
     */
    readonly path!: null | string;

    /**
     *  The child index of this wallet. Values over `2 *\* 31` indicate
     *  the node is hardened.
     */
    readonly index!: number;

    /**
     *  The depth of this wallet, which is the number of components
     *  in its path.
     */
    readonly depth!: number;

    /**
     *  @private
     */
    constructor(guard: any, address: string, publicKey: string, accountFingerprint: string, chainCode: string, path: null | string, index: number, depth: number, provider: null | Provider) {
        super(address, provider);
        assertPrivate(guard, _guard, "HDNodeVoidWallet");

        defineProperties<HDNodeVoidWallet>(this, { publicKey });

        const fingerprint = dataSlice(ripemd160(sha256(publicKey)), 0, 4);
        defineProperties<HDNodeVoidWallet>(this, {
            publicKey, fingerprint, accountFingerprint, chainCode, path, index, depth
        });
    }

    connect(provider: null | Provider): HDNodeVoidWallet {
        return new HDNodeVoidWallet(_guard, this.address, this.publicKey,
            this.accountFingerprint??'', this.chainCode, this.path, this.index, this.depth, provider);
    }

    /**
     *  The extended key.
     *
     *  This key will begin with the prefix `xpub` and can be used to
     *  reconstruct this neutered key to derive its children addresses.
     */
    get extendedKey(): string {
        // We only support the mainnet values for now, but if anyone needs
        // testnet values, let me know. I believe current sentiment is that
        // we should always use mainnet, and use BIP-44 to derive the network
        //   - Mainnet: public=0x0488B21E, private=0x0488ADE4
        //   - Testnet: public=0x043587CF, private=0x04358394

        assert(this.depth < 256, "Depth too deep", "UNSUPPORTED_OPERATION", { operation: "extendedKey" });

        return encodeBase58Check(concat([
            "0x0488B21E",
            zpad(this.depth, 1),
            this.accountFingerprint ?? '',
            zpad(this.index, 4),
            this.chainCode,
            this.publicKey,
        ]));
    }

    /**
     *  Returns true if this wallet has a path, providing a Type Guard
     *  that the path is non-null.
     * 
     *  @returns {boolean} True if the path is non-null.
     */
    hasPath(): this is { path: string } { return (this.path != null); }

    /**
     *  Return the child for `index`.
     * 
     *  @param {Numeric} _index - The index of the child to derive.
     *  @returns {HDNodeVoidWallet} The derived child HD Node.
     */
    deriveChild(_index: Numeric): HDNodeVoidWallet {
        const index = getNumber(_index, "index");
        assertArgument(index <= 0xffffffff, "invalid index", "index", index);

        // Base path
        let path = this.path;
        if (path) {
            path += "/" + (index & ~HardenedBit);
            if (index & HardenedBit) { path += "'"; }
        }
        const { IR, IL } = ser_I(index, this.chainCode, this.publicKey, null);
        const Ki = SigningKey.addPoints(IL, this.publicKey, true);

        const address = computeAddress(Ki);

        return new HDNodeVoidWallet(_guard, address, Ki, this.fingerprint, hexlify(IR),
            path, index, this.depth + 1, this.provider);

    }

    /**
     *  Return the signer for `path` from this node.
     * 
     *  @param {string} path - The path to derive.
     *  @returns {HDNodeVoidWallet} The derived HD Node.
     */
    derivePath(path: string): HDNodeVoidWallet {
        return derivePath<HDNodeVoidWallet>(this, path);
    }
}

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
 *  Returns the [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) path for the account at `index`.
 *
 *  This is the pattern used by wallets like Ledger.
 *
 *  There is also an [alternate pattern](getIndexedAccountPath) used by
 *  some software.
 * 
 *  @param {Numeric} _index - The account index.
 *  @returns {string} The BIP44 derivation path for the specified account.
 *  
 *  @category Wallet
 */
export function getAccountPath(_index: Numeric): string {
    const index = getNumber(_index, "index");
    assertArgument(index >= 0 && index < HardenedBit, "invalid account index", "index", index);
    return `m/44'/60'/${ index }'/0/0`;
}

/**
 *  Returns the path using an alternative pattern for deriving accounts,
 *  at `index`.
 *
 *  This derivation path uses the //index// component rather than the
 *  //account// component to derive sequential accounts.
 *
 *  This is the pattern used by wallets like MetaMask.
 * 
 *  @param {Numeric} _index - The account index.
 *  @returns {string} The BIP44 derivation path for the specified account.
 *  
 *  @category Wallet
 */
export function getIndexedAccountPath(_index: Numeric): string {
    const index = getNumber(_index, "index");
    assertArgument(index >= 0 && index < HardenedBit, "invalid account index", "index", index);
    return `m/44'/60'/0'/0/${ index}`;
}

/**
 *  Returns a derivation path for a Qi blockchain account.
 * 
 *  @param {number} account - The account index (defaults to 0).
 *  @returns {string} The BIP44 derivation path for the specified account on the Qi blockchain.
 *  
 *  @category Wallet
 */
export function qiHDAccountPath(account: number = 0, change: boolean = false): string {
    return `m/44'/969'/${account}'/${change ? 1 : 0}`;
}

/**
 *  Returns a derivation path for a Quai blockchain account.
 *  
 *  @param {number} account - The account index (defaults to 0).
 *  @returns {string} The BIP44 derivation path for the specified account on the Quai blockchain.
 *  
 *  @category Wallet
 */
export function quaiHDAccountPath(account: number = 0): string {
    return `m/44'/994'/${account}'/0`;
}


