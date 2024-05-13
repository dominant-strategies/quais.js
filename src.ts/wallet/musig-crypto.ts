import { sha256 } from '@noble/hashes/sha256';
import { secp256k1, schnorr } from '@noble/curves/secp256k1';
import * as baseCrypto from './base-crypto.js';


export const nobleCrypto = {
  ...baseCrypto,
  pointMultiplyUnsafe: (p: Uint8Array, a: Uint8Array, compress: boolean): Uint8Array | null => {
    try {
      const product = secp256k1.ProjectivePoint.fromHex(p).multiplyAndAddUnsafe(
        secp256k1.ProjectivePoint.ZERO,
        BigInt(`0x${Buffer.from(a).toString('hex')}`),
        BigInt(1)
      );
      if (!product) return null;
      return product.toRawBytes(compress);
    } catch {
      return null;
    }
  },
  pointMultiplyAndAddUnsafe: (
    p1: Uint8Array,
    a: Uint8Array,
    p2: Uint8Array,
    compress: boolean
  ): Uint8Array | null => {
    try {
      const p2p = secp256k1.ProjectivePoint.fromHex(p2);
      const p = secp256k1.ProjectivePoint.fromHex(p1).multiplyAndAddUnsafe(
        p2p,
        BigInt(`0x${Buffer.from(a).toString('hex')}`),
        BigInt(1)
      );
      if (!p) return null;
      return p.toRawBytes(compress);
    } catch {
      return null;
    }
  },
  pointAdd: (a: Uint8Array, b: Uint8Array, compress: boolean): Uint8Array | null => {
    try {
      return secp256k1.ProjectivePoint.fromHex(a)
        .add(secp256k1.ProjectivePoint.fromHex(b))
        .toRawBytes(compress);
    } catch {
      return null;
    }
  },
  pointAddTweak: (p: Uint8Array, tweak: Uint8Array, compress: boolean): Uint8Array | null => {
    try {
      const P = secp256k1.ProjectivePoint.fromHex(p);
      const t = baseCrypto.readSecret(tweak);
      const Q = secp256k1.ProjectivePoint.BASE.multiplyAndAddUnsafe(P, t, 1n);
      if (!Q) throw new Error('Tweaked point at infinity');
      return Q.toRawBytes(compress);
    } catch {
      return null;
    }
  },
  pointCompress: (p: Uint8Array, compress = true): Uint8Array =>
    secp256k1.ProjectivePoint.fromHex(p).toRawBytes(compress),
  liftX: (p: Uint8Array): Uint8Array | null => {
    try {
      return secp256k1.ProjectivePoint.fromHex(p).toRawBytes(false);
    } catch {
      return null;
    }
  },
  getPublicKey: (s: Uint8Array, compress: boolean): Uint8Array | null => {
    try {
      return secp256k1.getPublicKey(s, compress);
    } catch {
      return null;
    }
  },
  taggedHash: schnorr.utils.taggedHash,
  sha256: (...messages: Uint8Array[]): Uint8Array => {
    const h = sha256.create();
    for (const message of messages) h.update(message);
    return h.digest();
  },
};