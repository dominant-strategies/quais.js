export declare const nobleCrypto: {
    pointMultiplyUnsafe: (p: Uint8Array, a: Uint8Array, compress: boolean) => Uint8Array | null;
    pointMultiplyAndAddUnsafe: (p1: Uint8Array, a: Uint8Array, p2: Uint8Array, compress: boolean) => Uint8Array | null;
    pointAdd: (a: Uint8Array, b: Uint8Array, compress: boolean) => Uint8Array | null;
    pointAddTweak: (p: Uint8Array, tweak: Uint8Array, compress: boolean) => Uint8Array | null;
    pointCompress: (p: Uint8Array, compress?: boolean) => Uint8Array;
    liftX: (p: Uint8Array) => Uint8Array | null;
    getPublicKey: (s: Uint8Array, compress: boolean) => Uint8Array | null;
    taggedHash: (tag: string, ...messages: Uint8Array[]) => Uint8Array;
    sha256: (...messages: Uint8Array[]) => Uint8Array;
    readScalar(bytes: Uint8Array): bigint;
    readSecret(bytes: Uint8Array): bigint;
    isPoint(p: Uint8Array): boolean;
    isXOnlyPoint(p: Uint8Array): boolean;
    scalarAdd(a: Uint8Array, b: Uint8Array): Uint8Array;
    scalarMultiply(a: Uint8Array, b: Uint8Array): Uint8Array;
    scalarNegate(a: Uint8Array): Uint8Array;
    scalarMod(a: Uint8Array): Uint8Array;
    isScalar(t: Uint8Array): boolean;
    isSecret(s: Uint8Array): boolean;
    pointNegate(p: Uint8Array): Uint8Array;
    pointX(p: Uint8Array): Uint8Array;
    hasEvenY(p: Uint8Array): boolean;
};
//# sourceMappingURL=musig-crypto.d.ts.map