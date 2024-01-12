import { ZeroHash } from "../constants/index.js";
import { concat, dataLength, getBigInt, getBytes, getNumber, hexlify, toBeArray, isHexString, zeroPadValue, assertArgument, assertPrivate } from "../utils/index.js";
const BN_1 = BigInt(1);
const _guard = {};
function toUint256(value) {
    return zeroPadValue(toBeArray(value), 32);
}
/**
 *  A Signature  @TODO
 *
 *
 *  @_docloc: api/crypto:Signing
 */
export class Signature {
    #r;
    #s;
    #v;
    /**
     *  The ``r`` value for a signautre.
     *
     *  This represents the ``x`` coordinate of a "reference" or
     *  challenge point, from which the ``y`` can be computed.
     */
    get r() { return this.#r; }
    set r(value) {
        assertArgument(dataLength(value) === 32, "invalid r", "value", value);
        this.#r = hexlify(value);
    }
    /**
     *  The ``s`` value for a signature.
     */
    get s() { return this.#s; }
    set s(_value) {
        assertArgument(dataLength(_value) === 32, "invalid s", "value", _value);
        const value = hexlify(_value);
        assertArgument(parseInt(value.substring(0, 3)) < 8, "non-canonical s", "value", value);
        this.#s = value;
    }
    /**
     *  The ``v`` value for a signature.
     *
     *  Since a given ``x`` value for ``r`` has two possible values for
     *  its correspondin ``y``, the ``v`` indicates which of the two ``y``
     *  values to use.
     *
     *  It is normalized to the values ``27`` or ``28`` for legacy
     *  purposes.
     */
    get v() { return this.#v; } // Updated getter
    set v(value) {
        const v = getNumber(value, "value");
        assertArgument(v === 0 || v === 1, "invalid v", "v", value); // Updated condition
        this.#v = v;
    }
    /**
     *  The ``yParity`` for the signature.
     */
    get yParity() {
        return this.v; // Directly return v as it's now 0 or 1
    }
    /**
     *  The [[link-eip-2098]] compact representation of the ``yParity``
     *  and ``s`` compacted into a single ``bytes32``.
     */
    get yParityAndS() {
        // The EIP-2098 compact representation
        const yParityAndS = getBytes(this.s);
        if (this.yParity === 1) {
            yParityAndS[0] |= 0x80;
        }
        return hexlify(yParityAndS);
    }
    /**
     *  The [[link-eip-2098]] compact representation.
     */
    get compactSerialized() {
        return concat([this.r, this.yParityAndS]);
    }
    /**
     *  The serialized representation.
     */
    get serialized() {
        return concat([this.r, this.s, (this.yParity === 1 ? "0x1c" : "0x1b")]);
    }
    /**
     *  @private
     */
    constructor(guard, r, s, v) {
        assertPrivate(guard, _guard, "Signature");
        this.#r = r;
        this.#s = s;
        this.#v = v;
    }
    [Symbol.for('nodejs.util.inspect.custom')]() {
        return `Signature { r: "${this.r}", s: "${this.s}", yParity: ${this.yParity} }`;
    }
    /**
     *  Returns a new identical [[Signature]].
     */
    clone() {
        return new Signature(_guard, this.r, this.s, this.v);
    }
    /**
     *  Returns a representation that is compatible with ``JSON.stringify``.
     */
    toJSON() {
        return {
            _type: "signature",
            r: this.r, s: this.s, v: this.v,
        };
    }
    /**
     *  Creates a new [[Signature]].
     *
     *  If no %%sig%% is provided, a new [[Signature]] is created
     *  with default values.
     *
     *  If %%sig%% is a string, it is parsed.
     */
    static from(sig) {
        function assertError(check, message) {
            assertArgument(check, message, "signature", sig);
        }
        ;
        if (sig == null || (typeof sig === 'object' && sig.v == null && sig.r == null && sig.s == null)) {
            return new Signature(_guard, ZeroHash, ZeroHash, 0); // Default to 0
        }
        if (sig == null) {
            return new Signature(_guard, ZeroHash, ZeroHash, 0); // Default to 0
        }
        if (typeof (sig) === "string") {
            const bytes = getBytes(sig, "signature");
            if (bytes.length === 64) {
                // Parse the compact representation
                const r = hexlify(bytes.slice(0, 32));
                const s = bytes.slice(32, 64);
                const v = (s[0] & 0x80) ? 1 : 0; // Adjusted for v as 0 or 1
                s[0] &= 0x7f;
                return new Signature(_guard, r, hexlify(s), v);
            }
            // Handle the full length signature
            if (bytes.length === 65) {
                const r = hexlify(bytes.slice(0, 32));
                const s = hexlify(bytes.slice(32, 64));
                const v = (bytes[64] === 1) ? 1 : 0; // Adjusted for v as 0 or 1
                return new Signature(_guard, r, s, v);
            }
            assertError(false, "invalid raw signature length");
        }
        if (sig instanceof Signature) {
            return sig.clone();
        }
        // Get r
        const _r = sig.r;
        assertError(_r != null, "missing r");
        const r = toUint256(_r);
        // Get s; by any means necessary (we check consistency below)
        const s = (function (s, yParityAndS) {
            if (s != null) {
                return toUint256(s);
            }
            if (yParityAndS != null) {
                assertError(isHexString(yParityAndS, 32), "invalid yParityAndS");
                const bytes = getBytes(yParityAndS);
                bytes[0] &= 0x7f;
                return hexlify(bytes);
            }
            assertError(false, "missing s");
        })(sig.s, sig.yParityAndS);
        assertError((getBytes(s)[0] & 0x80) == 0, "non-canonical s");
        // Simplified logic for v
        let v;
        if (sig.v != null) {
            v = (getBigInt(sig.v) === BN_1) ? 1 : 0; // Directly use 0 or 1 based on sig.v
        }
        else if (sig.yParityAndS != null) {
            assertError(isHexString(sig.yParityAndS, 32), "invalid yParityAndS");
            v = (getBytes(sig.yParityAndS)[0] & 0x80) ? 1 : 0;
        }
        else if (sig.yParity != null) {
            v = (getNumber(sig.yParity, "sig.yParity") === 1) ? 1 : 0;
        }
        else {
            assertError(false, "missing v");
        }
        const result = new Signature(_guard, r, s, v);
        // Check consistency between v, yParity, and yParityAndS if given
        assertError(sig.yParity == null || getNumber(sig.yParity, "sig.yParity") === result.yParity, "yParity mismatch");
        assertError(sig.yParityAndS == null || sig.yParityAndS === result.yParityAndS, "yParityAndS mismatch");
        return result;
    }
}
//# sourceMappingURL=signature.js.map