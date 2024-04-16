import type { BigNumberish } from "../utils/index";
export type OutPoint = {
    txhash: string;
    index: number;
};
export type UTXOTransactionInput = {
    previousOutPoint: OutPoint;
    pubKey: Uint8Array;
};
export interface UTXOEntry {
    denomination: null | bigint;
    address: null | string;
}
export type UTXOTransactionOutput = UTXOEntry;
export type UTXOTransaction = {
    chainId: bigint;
    inputs: UTXOTransactionInput[];
    outputs: UTXOTransactionOutput[];
    signature?: Uint8Array;
};
export interface UTXOLike extends UTXOEntry {
    txhash?: null | string;
    index?: null | number;
}
export declare const denominations: bigint[];
/**
 * Given a value, returns an array of supported denominations that sum to the value.
 * @param value The value to denominate.
 * @returns Array of supported denominations that sum to the value.
 */
export declare function denominate(value: bigint): bigint[];
export declare class UTXO implements UTXOLike {
    #private;
    get txhash(): null | string;
    set txhash(value: null | string);
    get index(): null | number;
    set index(value: null | number);
    get address(): null | string;
    set address(value: null | string);
    get denomination(): null | bigint;
    set denomination(value: null | BigNumberish);
    /**
     * Constructs a new UTXO instance with null properties.
     */
    constructor();
    /**
     * Converts the UTXO instance to a JSON object.
     * @returns A JSON representation of the UTXO instance.
     */
    toJSON(): any;
    /**
     * Creates a UTXO instance from a UTXOLike object.
     * @param utxo The UTXOLike object to create the UTXO instance from.
     * @returns A new UTXO instance.
     */
    static from(utxo: UTXOLike): UTXO;
}
//# sourceMappingURL=utxo.d.ts.map