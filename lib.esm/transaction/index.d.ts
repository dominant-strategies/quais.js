/**
 *  Each state-changing operation on Ethereum requires a transaction.
 *
 *  @_section api/transaction:Transactions  [about-transactions]
 */
/**
 *  A single [[AccessList]] entry of storage keys (slots) for an address.
 */
export type AccessListEntry = {
    address: string;
    storageKeys: Array<string>;
};
/**
 *  An ordered collection of [[AccessList]] entries.
 */
export type AccessList = Array<AccessListEntry>;
/**
 *  Any quais-supported access list structure.
 */
export type AccessListish = AccessList | Array<[string, Array<string>]> | Record<string, Array<string>>;
export { accessListify } from "./accesslist.js";
export { computeAddress, recoverAddress } from "./address.js";
export { Transaction } from "./transaction.js";
<<<<<<< HEAD
=======
export { FewestCoinSelector } from "./coinselector-fewest.js";
>>>>>>> ee35178e (utxohdwallet)
export type { TransactionLike } from "./transaction.js";
//# sourceMappingURL=index.d.ts.map