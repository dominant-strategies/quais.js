/**
 *  @_ignore
 */
import { BytesLike } from "../utils/index.js";
export declare function looseArrayify(hexString: string): Uint8Array;
export declare function getPassword(password: string | Uint8Array): Uint8Array;
export declare function spelunk<T>(object: any, _path: string): T;
export declare const MasterSecret: Uint8Array;
export declare const HardenedBit = 2147483648;
export declare const N: bigint;
export declare const Nibbles = "0123456789abcdef";
export declare function zpad(value: string | number, length: number): string;
export declare function encodeBase58Check(_value: BytesLike): string;
export declare function ser_I(index: number, chainCode: string, publicKey: string, privateKey: null | string): {
    IL: Uint8Array;
    IR: Uint8Array;
};
type HDNodeLike<T> = {
    coinType?: number;
    depth: number;
    deriveChild: (i: number) => T;
    setCoinType?: () => void;
};
export declare function derivePath<T extends HDNodeLike<T>>(node: T, path: string): T;
export {};
//# sourceMappingURL=utils.d.ts.map