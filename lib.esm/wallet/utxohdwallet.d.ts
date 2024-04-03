import { SigningKey } from "../crypto/index.js";
import { Numeric, Provider, TransactionRequest, Wordlist } from '../quais.js';
import { Mnemonic } from './mnemonic.js';
import { BaseWallet } from "./base-wallet.js";
interface UTXOAddress {
    pubKey: string;
    privKey: string;
}
export declare class UTXOHDWallet extends BaseWallet {
    #private;
    /**
     *  The fingerprint.
     *
     *  A fingerprint allows quick qay to detect parent and child nodes,
     *  but developers should be prepared to deal with collisions as it
     *  is only 4 bytes.
     */
    readonly fingerprint: string;
    /**
     *  The parent fingerprint.
     */
    readonly accountFingerprint: string;
    /**
     *  The mnemonic used to create this HD Node, if available.
     *
     *  Sources such as extended keys do not encode the mnemonic, in
     *  which case this will be ``null``.
     */
    readonly mnemonic: null | Mnemonic;
    /**
     *  The chaincode, which is effectively a public key used
     *  to derive children.
     */
    readonly chainCode: string;
    /**
     *  The derivation path of this wallet.
     *
     *  Since extended keys do not provider full path details, this
     *  may be ``null``, if instantiated from a source that does not
     *  enocde it.
     */
    readonly path: null | string;
    /**
     *  The child index of this wallet. Values over ``2 *\* 31`` indicate
     *  the node is hardened.
     */
    readonly index: number;
    /**
     *  The depth of this wallet, which is the number of components
     *  in its path.
     */
    readonly depth: number;
    coinType?: number;
    get utxoAddresses(): UTXOAddress[];
    /**
     * Gets the current publicKey
     */
    get publicKey(): string;
    /**
     *  @private
     */
    constructor(guard: any, signingKey: SigningKey, accountFingerprint: string, chainCode: string, path: null | string, index: number, depth: number, mnemonic: null | Mnemonic, provider: null | Provider);
    connect(provider: null | Provider): UTXOHDWallet;
    derivePath(path: string): UTXOHDWallet;
    setCoinType(): void;
    /**
     *  Creates a new random HDNode.
     */
    static createRandom(path: string, password?: string, wordlist?: Wordlist): UTXOHDWallet;
    /**
     *  Create an HD Node from %%mnemonic%%.
     */
    static fromMnemonic(mnemonic: Mnemonic, path: string): UTXOHDWallet;
    /**
     *  Creates an HD Node from a mnemonic %%phrase%%.
     */
    static fromPhrase(phrase: string, path: string, password?: string, wordlist?: Wordlist): UTXOHDWallet;
    /**
     * Checks if the provided BIP44 path is valid and limited to the change level.
     * @param path The BIP44 path to check.
     * @returns true if the path is valid and does not include the address_index; false otherwise.
     */
    static isValidPath(path: string): boolean;
    /**
     *  Return the child for %%index%%.
     */
    deriveChild(_index: Numeric): UTXOHDWallet;
    generateUTXOs(zone: string, gap?: number): Promise<void>;
    /**
     * Derives address by incrementing address_index according to BIP44
     */
    deriveAddress(index: number, zone?: string): UTXOHDWallet;
    signTransaction(tx: TransactionRequest): Promise<string>;
}
export {};
//# sourceMappingURL=utxohdwallet.d.ts.map