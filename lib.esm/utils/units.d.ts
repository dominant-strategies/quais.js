import type { BigNumberish, Numeric } from "../utils/index.js";
/**
 *  Converts %%value%% into a //decimal string//, assuming %%unit%% decimal
 *  places. The %%unit%% may be the number of decimal places or the name of
 *  a unit (e.g. ``"gwei"`` for 9 decimal places).
 *
 */
export declare function formatUnits(value: BigNumberish, unit?: string | Numeric): string;
/**
 *  Converts the //decimal string// %%value%% to a BigInt, assuming
 *  %%unit%% decimal places. The %%unit%% may the number of decimal places
 *  or the name of a unit (e.g. ``"gwei"`` for 9 decimal places).
 */
export declare function parseUnits(value: string, unit?: string | Numeric): bigint;
/**
 *  Converts %%value%% into a //decimal string// using 18 decimal places.
 */
export declare function formatQuai(wei: BigNumberish): string;
/**
 *  Converts %%value%% into a //decimal string// using 3 decimal places.
 */
export declare function formatQi(value: BigNumberish): string;
/**
 *  Converts the //decimal string// %%quai%% to a BigInt, using 18
 *  decimal places.
 */
export declare function parseQuai(ether: string): bigint;
/**
 *  Converts %%value%% into a //decimal string// using 3 decimal places.
 */
export declare function parseQi(value: string): bigint;
export declare const formatEther: typeof formatQuai;
export declare const parseEther: typeof parseQuai;
//# sourceMappingURL=units.d.ts.map