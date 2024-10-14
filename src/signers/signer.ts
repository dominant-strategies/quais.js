import type { Addressable } from '../address/index.js';
import type { TypedDataDomain, TypedDataField } from '../hash/index.js';
import type { TransactionLike } from '../transaction/index.js';

import type { ContractRunner } from '../contract/index.js';
import type { BlockTag, Provider, TransactionRequest, TransactionResponse } from '../providers/provider.js';
import { AccessList } from '../transaction/index.js';

/**
 * A Signer represents an account on the Ethereum Blockchain, and is most often backed by a private key represented by a
 * mnemonic or residing on a Hardware Wallet.
 *
 * The API remains abstract though, so that it can deal with more advanced exotic Signing entities, such as Smart
 * Contract Wallets or Virtual Wallets (where the private key may not be known).
 *
 * @category Signers
 */
export interface Signer extends Addressable, ContractRunner {
    /**
     * The {@link Provider | **Provider**} attached to this Signer (if any).
     */
    provider: null | Provider;

    /**
     * Returns a new instance of this Signer connected to provider or detached from any Provider if null.
     *
     * @param {null | Provider} provider - The Provider to connect to.
     * @returns {Signer} A new instance of this Signer.
     * @throws {Error} If the Signer cannot be connected to the Provider.
     */
    connect(provider: null | Provider): Signer;

    ////////////////////
    // State

    /**
     * Get the address of the Signer.
     *
     * @returns {Promise<string>} The address of the Signer.
     * @throws {Error} If the Signer has no address.
     */
    getAddress(): Promise<string>;

    /**
     * Gets the next nonce required for this Signer to send a transaction.
     *
     * @param blockTag - The blocktag to base the transaction count on, keep in mind many nodes do not honour this value
     *   and silently ignore it [default: `"latest"`]
     * @returns {Promise<number>} The next nonce.
     */
    getNonce(blockTag?: BlockTag): Promise<number>;

    ////////////////////
    // Preparation

    /**
     * Prepares a {@link TransactionRequest} for calling:
     *
     * - Resolves `to` and `from` addresses
     * - If `from` is specified , check that it matches this Signer
     *
     * @param {TransactionRequest} tx - The call to prepare
     * @returns {Promise<TransactionLike>} A promise resolving to the prepared transaction.
     */
    populateCall(tx: TransactionRequest): Promise<TransactionLike>;

    /**
     * Prepares a {@link TransactionRequest} for sending to the network by populating any missing properties:
     *
     * - Resolves `to` and `from` addresses
     * - If `from` is specified , check that it matches this Signer
     * - Populates `nonce` via `signer.getNonce("pending")`
     * - Populates `gasLimit` via `signer.estimateGas(tx)`
     * - Populates `chainId` via `signer.provider.getNetwork()`
     * - Populates `type` and relevant fee data for that type (`gasPrice`, `minerTip`, etc)
     *
     * @param {TransactionRequest} tx - The transaction to prepare.
     * @returns {Promise<TransactionLike>} A promise resolving to the prepared transaction.
     * @throws {Error} If the transaction is invalid.
     * @note Some Signer implementations may skip populating properties that
     *        are populated downstream; for example JsonRpcSigner defers to the
     *        node to populate the nonce and fee data.
     */
    populateQuaiTransaction(tx: TransactionRequest): Promise<TransactionLike>;

    ////////////////////
    // Execution

    /**
     * Estimates the required gas required to execute tx on the Blockchain. This will be the expected amount a
     * transaction will require as its `gasLimit` to successfully run all the necessary computations and store the
     * needed state that the transaction intends.
     *
     * Keep in mind that this is **best efforts**, since the state of the Blockchain is in flux, which could affect
     * transaction gas requirements.
     *
     * @param {TransactionRequest} tx - The transaction to estimate gas for.
     * @returns {Promise<bigint>} A promise resolving to the estimated gas.
     * @throws UNPREDICTABLE_GAS_LIMIT A transaction that is believed by the node to likely fail will throw an error
     *   during gas estimation. This could indicate that it will actually fail or that the circumstances are simply too
     *   complex for the node to take into account. In these cases, a manually determined `gasLimit` will need to be
     *   made.
     */
    estimateGas(tx: TransactionRequest): Promise<bigint>;

    /**
     * Creates an AccessList for the transaction. This is used to specify which addresses the transaction might touch.
     *
     * @param tx
     * @returns {Promise<AccessList>} A promise resolving to the access list.
     */
    createAccessList(tx: TransactionRequest): Promise<AccessList>;

    /**
     * Evaluates th tx by running it against the current Blockchain state. This cannot change state and has no cost in
     * ether, as it is effectively simulating execution.
     *
     * This can be used to have the Blockchain perform computations based on its state (e.g. running a Contract's
     * getters) or to simulate the effect of a transaction before actually performing an operation.
     *
     * @param {TransactionRequest} tx - The transaction to call.
     * @returns {Promise<string>} A promise resolving to the result of the call.
     */
    call(tx: TransactionRequest): Promise<string>;

    ////////////////////
    // Signing

    /**
     * Signs `tx`, returning the fully signed transaction. This does not populate any additional properties within the
     * transaction.
     *
     * @param {TransactionRequest} tx - The transaction to sign.
     * @returns {Promise<string>} A promise resolving to the signed transaction.
     * @throws {Error} If the transaction is invalid.
     */
    signTransaction(tx: TransactionRequest): Promise<string>;

    /**
     * Sends `tx` to the Network. The `signer.populateTransaction(tx)` is called first to ensure all necessary
     * properties for the transaction to be valid have been popualted first.
     *
     * @param {TransactionRequest} tx - The transaction to send.
     * @returns {Promise<TransactionResponse>} A promise resolving to the transaction response.
     * @throws {Error} If the transaction is invalid.
     */
    sendTransaction(tx: TransactionRequest): Promise<TransactionResponse>;

    /**
     * Signs an [EIP-191](https://eips.ethereum.org/EIPS/eip-191) prefixed personal message.
     *
     * If the `message` is a string, it is signed as UTF-8 encoded bytes. It is **not** interpretted as a
     * [BytesLike](../type-aliases/BytesLike); so the string `"0x1234"` is signed as six characters, **not** two bytes.
     *
     * To sign that example as two bytes, the Uint8Array should be used (i.e. `new Uint8Array([ 0x12, 0x34 ])`).
     *
     * @param {string | Uint8Array} message - The message to sign.
     * @returns {Promise<string>} A promise resolving to the signed message.
     * @throws {Error} If the message is invalid.
     */
    signMessage(message: string | Uint8Array): Promise<string>;

    /**
     * Signs the [EIP-712](https://eips.ethereum.org/EIPS/eip-712) typed data.
     *
     * @param {TypedDataDomain} domain - The domain of the typed data.
     * @param {Record<string, TypedDataField[]>} types - The types of the typed data.
     * @param {Record<string, any>} value - The value of the typed data.
     * @returns {Promise<string>} A promise resolving to the signed typed data.
     */
    signTypedData(
        domain: TypedDataDomain,
        types: Record<string, Array<TypedDataField>>,
        value: Record<string, any>,
    ): Promise<string>;
}
