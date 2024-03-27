"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nobleCrypto = void 0;
const tslib_1 = require("tslib");
const sha256_1 = require("@noble/hashes/sha256");
const secp256k1_1 = require("@noble/curves/secp256k1");
const baseCrypto = tslib_1.__importStar(require("./base-crypto"));
exports.nobleCrypto = {
    ...baseCrypto,
    pointMultiplyUnsafe: (p, a, compress) => {
        try {
            const product = secp256k1_1.secp256k1.ProjectivePoint.fromHex(p).multiplyAndAddUnsafe(secp256k1_1.secp256k1.ProjectivePoint.ZERO, BigInt(`0x${Buffer.from(a).toString('hex')}`), BigInt(1));
            if (!product)
                return null;
            return product.toRawBytes(compress);
        }
        catch {
            return null;
        }
    },
    pointMultiplyAndAddUnsafe: (p1, a, p2, compress) => {
        try {
            const p2p = secp256k1_1.secp256k1.ProjectivePoint.fromHex(p2);
            const p = secp256k1_1.secp256k1.ProjectivePoint.fromHex(p1).multiplyAndAddUnsafe(p2p, BigInt(`0x${Buffer.from(a).toString('hex')}`), BigInt(1));
            if (!p)
                return null;
            return p.toRawBytes(compress);
        }
        catch {
            return null;
        }
    },
    pointAdd: (a, b, compress) => {
        try {
            return secp256k1_1.secp256k1.ProjectivePoint.fromHex(a)
                .add(secp256k1_1.secp256k1.ProjectivePoint.fromHex(b))
                .toRawBytes(compress);
        }
        catch {
            return null;
        }
    },
    pointAddTweak: (p, tweak, compress) => {
        try {
            const P = secp256k1_1.secp256k1.ProjectivePoint.fromHex(p);
            const t = baseCrypto.readSecret(tweak);
            const Q = secp256k1_1.secp256k1.ProjectivePoint.BASE.multiplyAndAddUnsafe(P, t, 1n);
            if (!Q)
                throw new Error('Tweaked point at infinity');
            return Q.toRawBytes(compress);
        }
        catch {
            return null;
        }
    },
    pointCompress: (p, compress = true) => secp256k1_1.secp256k1.ProjectivePoint.fromHex(p).toRawBytes(compress),
    liftX: (p) => {
        try {
            return secp256k1_1.secp256k1.ProjectivePoint.fromHex(p).toRawBytes(false);
        }
        catch {
            return null;
        }
    },
    getPublicKey: (s, compress) => {
        try {
            return secp256k1_1.secp256k1.getPublicKey(s, compress);
        }
        catch {
            return null;
        }
    },
    taggedHash: secp256k1_1.schnorr.utils.taggedHash,
    sha256: (...messages) => {
        const h = sha256_1.sha256.create();
        for (const message of messages)
            h.update(message);
        return h.digest();
    },
};
//# sourceMappingURL=musig-crypto.js.map