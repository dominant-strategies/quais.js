export declare function readScalar(bytes: Uint8Array): bigint;
export declare function readSecret(bytes: Uint8Array): bigint;
export declare function isPoint(p: Uint8Array): boolean;
export declare function isXOnlyPoint(p: Uint8Array): boolean;
export declare function scalarAdd(a: Uint8Array, b: Uint8Array): Uint8Array;
export declare function scalarMultiply(a: Uint8Array, b: Uint8Array): Uint8Array;
export declare function scalarNegate(a: Uint8Array): Uint8Array;
export declare function scalarMod(a: Uint8Array): Uint8Array;
export declare function isScalar(t: Uint8Array): boolean;
export declare function isSecret(s: Uint8Array): boolean;
export declare function pointNegate(p: Uint8Array): Uint8Array;
export declare function pointX(p: Uint8Array): Uint8Array;
export declare function hasEvenY(p: Uint8Array): boolean;
//# sourceMappingURL=base-crypto.d.ts.map