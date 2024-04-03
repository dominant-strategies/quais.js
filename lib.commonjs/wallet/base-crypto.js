"use strict";
// BigInt / Uint8Array versions of Crypto functions that do not require point
// math. If your JS interpreter has BigInt, you can use all of these. If not,
// you'll need to either shim it in or override more of these functions.
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasEvenY = exports.pointX = exports.pointNegate = exports.isSecret = exports.isScalar = exports.scalarMod = exports.scalarNegate = exports.scalarMultiply = exports.scalarAdd = exports.isXOnlyPoint = exports.isPoint = exports.readSecret = exports.readScalar = void 0;
// Idea from noble-secp256k1, be nice to bad JS parsers
const _0n = BigInt(0);
const _1n = BigInt(1);
const _2n = BigInt(2);
const _3n = BigInt(3);
const _5n = BigInt(5);
const _7n = BigInt(7);
const _64n = BigInt(64);
const _64mask = BigInt('0xFFFFFFFFFFFFFFFF');
const CURVE = {
    b: BigInt(7),
    P: BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F'),
    n: BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141'),
};
// Big Endian
function read32b(bytes) {
    if (bytes.length !== 32)
        throw new Error(`Expected 32-bytes, not ${bytes.length}`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    let b = view.getBigUint64(0);
    for (let offs = 8; offs < bytes.length; offs += 8) {
        b <<= _64n;
        b += view.getBigUint64(offs);
    }
    return b;
}
function write32b(num, dest = new Uint8Array(32)) {
    // All input values are modulo P or n, so no bounds checking needed
    const view = new DataView(dest.buffer, dest.byteOffset, dest.length);
    for (let offs = 24; offs >= 0; offs -= 8) {
        view.setBigUint64(offs, num & _64mask);
        num >>= _64n;
    }
    return dest;
}
function readScalar(bytes) {
    const a = read32b(bytes);
    if (a >= CURVE.n)
        throw new Error('Expected value mod n');
    return a;
}
exports.readScalar = readScalar;
function readSecret(bytes) {
    const a = readScalar(bytes);
    if (a === 0n)
        throw new Error('Expected non-zero');
    return a;
}
exports.readSecret = readSecret;
// The short Weierstrass form curve equation simplifes to y^2 = x^3 + 7.
function secp256k1Right(x) {
    const x2 = (x * x) % CURVE.P;
    const x3 = (x2 * x) % CURVE.P;
    return (x3 + CURVE.b) % CURVE.P;
}
// For prime P, the Jacobi Symbol of 'a' is 1 if and only if 'a' is a quadratic
// residue mod P, ie. there exists a value 'x' for whom x^2 = a.
function jacobiSymbol(a) {
    if (a === _0n)
        return 0; // Vanishingly improbable
    let p = CURVE.P;
    let sign = 1;
    // This algorithm is fairly heavily optimized, so don't simplify it w/o benchmarking
    for (;;) {
        let and3;
        // Handle runs of zeros efficiently w/o flipping sign each time
        for (and3 = a & _3n; and3 === _0n; a >>= _2n, and3 = a & _3n)
            ;
        // If there's one more zero, shift it off and flip the sign
        if (and3 === _2n) {
            a >>= _1n;
            const pand7 = p & _7n;
            if (pand7 === _3n || pand7 === _5n)
                sign = -sign;
        }
        if (a === _1n)
            break;
        if ((_3n & a) === _3n && (_3n & p) === _3n)
            sign = -sign;
        [a, p] = [p % a, a];
    }
    return sign > 0 ? 1 : -1;
}
function isPoint(p) {
    if (p.length < 33)
        return false;
    const t = p[0];
    if (p.length === 33) {
        return (t === 0x02 || t === 0x03) && isXOnlyPoint(p.subarray(1));
    }
    if (t !== 0x04 || p.length !== 65)
        return false;
    const x = read32b(p.subarray(1, 33));
    if (x === _0n)
        return false;
    if (x >= CURVE.P)
        return false;
    const y = read32b(p.subarray(33));
    if (y === _0n)
        return false;
    if (y >= CURVE.P)
        return false;
    const left = (y * y) % CURVE.P;
    const right = secp256k1Right(x);
    return left === right;
}
exports.isPoint = isPoint;
function isXOnlyPoint(p) {
    if (p.length !== 32)
        return false;
    const x = read32b(p);
    if (x === _0n)
        return false;
    if (x >= CURVE.P)
        return false;
    const y2 = secp256k1Right(x);
    return jacobiSymbol(y2) === 1; // If sqrt(y^2) exists, x is on the curve.
}
exports.isXOnlyPoint = isXOnlyPoint;
function scalarAdd(a, b) {
    const aN = readScalar(a);
    const bN = readScalar(b);
    const sum = (aN + bN) % CURVE.n;
    return write32b(sum);
}
exports.scalarAdd = scalarAdd;
function scalarMultiply(a, b) {
    const aN = readScalar(a);
    const bN = readScalar(b);
    const product = (aN * bN) % CURVE.n;
    return write32b(product);
}
exports.scalarMultiply = scalarMultiply;
function scalarNegate(a) {
    const aN = readScalar(a);
    const negated = aN === _0n ? _0n : CURVE.n - aN;
    return write32b(negated);
}
exports.scalarNegate = scalarNegate;
function scalarMod(a) {
    const aN = read32b(a);
    const remainder = aN % CURVE.n;
    return write32b(remainder);
}
exports.scalarMod = scalarMod;
function isScalar(t) {
    try {
        readScalar(t);
        return true;
    }
    catch {
        return false;
    }
}
exports.isScalar = isScalar;
function isSecret(s) {
    try {
        readSecret(s);
        return true;
    }
    catch {
        return false;
    }
}
exports.isSecret = isSecret;
function pointNegate(p) {
    // hasEvenY does basic structure check, so start there
    const even = hasEvenY(p);
    // `from` because node.Buffer.slice doesn't copy but looks like a Uint8Array
    const negated = Uint8Array.from(p);
    if (p.length === 33) {
        negated[0] = even ? 3 : 2;
    }
    else if (p.length === 65) {
        const y = read32b(p.subarray(33));
        if (y >= CURVE.P)
            throw new Error('Expected Y coordinate mod P');
        const minusY = y === _0n ? _0n : CURVE.P - y;
        write32b(minusY, negated.subarray(33));
    }
    return negated;
}
exports.pointNegate = pointNegate;
function pointX(p) {
    if (p.length === 32)
        return p;
    hasEvenY(p); // hasEvenY throws if not well structured
    return p.slice(1, 33);
}
exports.pointX = pointX;
function hasEvenY(p) {
    if (p.length === 33) {
        if (p[0] === 2)
            return true;
        else if (p[0] === 3)
            return false;
        else
            throw new Error('Wrong first byte to be a point');
    }
    if (p.length === 65) {
        if (p[0] !== 4)
            throw new Error('Wrong first byte to be point');
        return p[64] % 2 === 0;
    }
    throw new Error('Wrong length to be a point');
}
exports.hasEvenY = hasEvenY;
//# sourceMappingURL=base-crypto.js.map