import { getAddress, computeAddress, resolveAddress, validateAddress } from '../address/index.js';
import { hashMessage, TypedDataEncoder } from '../hash/index.js';
import { AbstractSigner } from '../signers/index.js';
import { resolveProperties, assertArgument } from '../utils/index.js';

import type { SigningKey } from '../crypto/index.js';
import type { TypedDataDomain, TypedDataField } from '../hash/index.js';
import type { Provider } from '../providers/index.js';
import { QuaiTransactionRequest } from '../providers/provider.js';
import { QuaiTransaction, QuaiTransactionLike } from '../transaction/quai-transaction.js';
import { keccak256 } from '../crypto/index.js';

/**
 * The **BaseWallet** is a stream-lined implementation of a {@link AbstractSigner} that operates with a private key.
 *
 * It is preferred to use the {@link Wallet} class, as it offers additional functionality and simplifies loading a
 * variety of JSON formats, Mnemonic Phrases, etc.
 *
 * This class may be of use for those attempting to implement a minimal Signer.
 *
 * @category Wallet
 */
export class BaseWallet extends AbstractSigner {
    /**
     * The wallet address.
     *
     * @type {string}
     * @readonly
     */
    readonly #address!: string;

    /**
     * The signing key used for signing payloads.
     *
     * @type {SigningKey}
     * @readonly
     */
    readonly #signingKey: SigningKey;

    /**
     * Creates a new BaseWallet for `privateKey`, optionally connected to `provider`.
     *
     * If `provider` is not specified, only offline methods can be used.
     *
     * @param {SigningKey} privateKey - The private key for the wallet.
     * @param {null | Provider} [provider] - The provider to connect to.
     */
    constructor(privateKey: SigningKey, provider?: null | Provider) {
        super(provider);

        assertArgument(
            privateKey && typeof privateKey.sign === 'function',
            'invalid private key',
            'privateKey',
            '[ REDACTED ]',
        );

        this.#signingKey = privateKey;

        this.#address = computeAddress(this.signingKey.publicKey);
    }

    // Store private values behind getters to reduce visibility

    /**
     * The address of this wallet.
     *
     * @type {string}
     * @readonly
     */
    get address(): string {
        return this.#address;
    }

    /**
     * The {@link SigningKey | **SigningKey**} used for signing payloads.
     *
     * @type {SigningKey}
     * @readonly
     */
    get signingKey(): SigningKey {
        return this.#signingKey;
    }

    /**
     * The private key for this wallet.
     *
     * @type {string}
     * @readonly
     */
    get privateKey(): string {
        return this.signingKey.privateKey;
    }

    // TODO: `_zone` is not used, should it be removed?
    /**
     * Returns the address of this wallet.
     *
     * @param {string} [_zone] - The zone (optional).
     * @returns {Promise<string>} The wallet address.
     */
    // eslint-disable-next-line
    async getAddress(_zone?: string): Promise<string> {
        return this.#address;
    }

    /**
     * Connects the wallet to a provider.
     *
     * @param {null | Provider} provider - The provider to connect to.
     * @returns {BaseWallet} The connected wallet.
     */
    connect(provider: null | Provider): BaseWallet {
        return new BaseWallet(this.#signingKey, provider);
    }

    /**
     * Signs a transaction.
     *
     * @param {QuaiTransactionRequest} tx - The transaction request.
     * @returns {Promise<string>} The signed transaction.
     */
    async signTransaction(tx: QuaiTransactionRequest): Promise<string> {
        // Replace any Addressable with an address
        const { to, from } = await resolveProperties({
            to: tx.to ? resolveAddress(tx.to) : undefined,
            from: tx.from ? resolveAddress(tx.from) : undefined,
        });

        if (to !== undefined) {
            validateAddress(to);
            tx.to = to;
        }

        if (from !== undefined) {
            assertArgument(
                getAddress(<string>from) === this.#address,
                'transaction from address mismatch',
                'tx.from',
                from,
            );
        } else {
            // No `from` specified, use the wallet's address
            tx.from = this.#address;
        }

        const btx = QuaiTransaction.from(<QuaiTransactionLike>tx);
        const digest = keccak256(btx.unsignedSerialized);
        btx.signature = this.signingKey.sign(digest);

        return btx.serialized;
    }

    /**
     * Signs a message.
     *
     * @async
     * @param {string | Uint8Array} message - The message to sign.
     * @returns {Promise<string>} The signed message.
     */
    async signMessage(message: string | Uint8Array): Promise<string> {
        return this.signMessageSync(message);
    }

    // @TODO: Add a secialized signTx and signTyped sync that enforces
    // all parameters are known?
    /**
     * Returns the signature for `message` signed with this wallet.
     *
     * @param {string | Uint8Array} message - The message to sign.
     * @returns {string} The serialized signature.
     */
    signMessageSync(message: string | Uint8Array): string {
        return this.signingKey.sign(hashMessage(message)).serialized;
    }

    /**
     * Signs typed data.
     *
     * @async
     * @param {TypedDataDomain} domain - The domain of the typed data.
     * @param {Record<string, TypedDataField[]>} types - The types of the typed data.
     * @param {Record<string, any>} value - The value of the typed data.
     * @returns {Promise<string>} The signed typed data.
     */
    async signTypedData(
        domain: TypedDataDomain,
        types: Record<string, Array<TypedDataField>>,
        value: Record<string, any>,
    ): Promise<string> {
        return this.signingKey.sign(TypedDataEncoder.hash(domain, types, value)).serialized;
    }
}
