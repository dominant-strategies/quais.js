import { BigNumberish } from "../utils/index.js";
import type { BlockParams, LogParams, TransactionReceiptParams, TransactionResponseParams, EtxParams } from "./formatting.js";
export type FormatFunc = (value: any) => any;
export declare function allowNull(format: FormatFunc, nullValue?: any): FormatFunc;
export declare function arrayOf(format: FormatFunc): FormatFunc;
export declare function object(format: Record<string, FormatFunc>, altNames?: Record<string, Array<string>>): FormatFunc;
export declare function formatBoolean(value: any): boolean;
export declare function formatData(value: string): string;
export declare function formatHash(value: any): string;
export declare function formatUint256(value: any): string;
export declare function handleNumber(_value: string, param: string): number;
export declare function formatNumber(_value: BigNumberish, name: string): Uint8Array;
export declare function formatLog(value: any): LogParams;
export declare function formatBlock(value: any): BlockParams;
export declare function formatReceiptLog(value: any): LogParams;
export declare function formatEtx(value: any): EtxParams;
export declare function formatTransactionReceipt(value: any): TransactionReceiptParams;
export declare function formatTransactionResponse(value: any): TransactionResponseParams;
//# sourceMappingURL=format.d.ts.map