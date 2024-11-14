/**
 * Each state-changing operation on Ethereum requires a transaction.
 */

null;

/**
 * A single {@link AccessList | **AccessList** } entry of storage keys (slots) for an address.
 *
 * @category Transaction
 */
export type AccessListEntry = { address: string; storageKeys: Array<string> };

/**
 * An ordered collection of {@link AccessList | **AccessList** } entries.
 *
 * @category Transaction
 */
export type AccessList = Array<AccessListEntry>;

/**
 * Any quais-supported access list structure.
 *
 * @category Transaction
 */
export type AccessListish = AccessList | Array<[string, Array<string>]> | Record<string, Array<string>>;

export { accessListify } from './accesslist.js';
export { AbstractTransaction } from './abstract-transaction.js';

export { FewestCoinSelector } from './coinselector-fewest.js';
export { AggregateCoinSelector } from './coinselector-aggregate.js';
export type { SpendTarget } from './abstract-coinselector.js';

export type { TransactionLike } from './abstract-transaction.js';

export type { TxInput, TxOutput } from './utxo.js';
export { denominations, UTXO } from './utxo.js';

export { QiTransaction } from './qi-transaction.js';
export { QiTransactionLike } from './qi-transaction.js';
export { QuaiTransaction } from './quai-transaction.js';
export { QuaiTransactionLike } from './quai-transaction.js';
