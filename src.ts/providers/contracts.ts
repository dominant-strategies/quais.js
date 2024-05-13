import type {
    Provider, QuaiTransactionRequest, TransactionRequest, TransactionResponse
} from "./provider.js";

/**
 *  A **ContractRunner** is a generic interface which defines an object
 *  capable of interacting with a Contract on the network.
 *
 *  The more operations supported, the more utility it is capable of.
 *
 *  The most common ContractRunners are [Providers](../classes/Provider) which enable
 *  read-only access and [Signers](../classes/Signer) which enable write-access.
 * 
 *  @category Providers
 */
export interface ContractRunner {
    /**
     *  The provider used for necessary state querying operations.
     *
     *  This can also point to the **ContractRunner** itself, in the
     *  case of an [AbstractProvider](../classes/AbstractProvider).
     */
    provider: null | Provider;

    /**
     *  Required to estimate gas.
     * 
     *  @param {TransactionRequest} tx - The transaction object.
     *  @returns {Promise<bigint>} A promise resolving to the estimated gas.
     */
    estimateGas?: (tx: TransactionRequest) => Promise<bigint>;

    /**
     * Required for pure, view or static calls to contracts.
     * 
     *  @param {QuaiTransactionRequest} tx - The transaction object.
     *  @returns {Promise<string>} A promise resolving to the result of the call.
     */
    call?: (tx: QuaiTransactionRequest) => Promise<string>;

    /**
     *  Required for state mutating calls
     * 
     *  @param {TransactionRequest} tx - The transaction object.
     *  @returns {Promise<TransactionResponse>} A promise resolving to the transaction response.
     */
    sendTransaction?: (tx: TransactionRequest) => Promise<TransactionResponse>;
}
