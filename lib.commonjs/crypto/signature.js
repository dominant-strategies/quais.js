"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Signature = void 0;
const index_js_1 = require("../constants/index.js");
const index_js_2 = require("../utils/index.js");
const BN_1 = BigInt(1);
const _guard = {};
function toUint256(value) {
    return (0, index_js_2.zeroPadValue)((0, index_js_2.toBeArray)(value), 32);
}
/**
 *  A Signature  @TODO
 *
 *
 *  @_docloc: api/crypto:Signing
 */
class Signature {
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
        (0, index_js_2.assertArgument)((0, index_js_2.dataLength)(value) === 32, "invalid r", "value", value);
        this.#r = (0, index_js_2.hexlify)(value);
    }
    /**
     *  The ``s`` value for a signature.
     */
    get s() { return this.#s; }
    set s(_value) {
        (0, index_js_2.assertArgument)((0, index_js_2.dataLength)(_value) === 32, "invalid s", "value", _value);
        const value = (0, index_js_2.hexlify)(_value);
        (0, index_js_2.assertArgument)(parseInt(value.substring(0, 3)) < 8, "non-canonical s", "value", value);
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
        const v = (0, index_js_2.getNumber)(value, "value");
        (0, index_js_2.assertArgument)(v === 0 || v === 1, "invalid v", "v", value); // Updated condition
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
        const yParityAndS = (0, index_js_2.getBytes)(this.s);
        if (this.yParity === 1) {
            yParityAndS[0] |= 0x80;
        }
        return (0, index_js_2.hexlify)(yParityAndS);
    }
    /**
     *  The [[link-eip-2098]] compact representation.
     */
    get compactSerialized() {
        return (0, index_js_2.concat)([this.r, this.yParityAndS]);
    }
    /**
     *  The serialized representation.
     */
    get serialized() {
        return (0, index_js_2.concat)([this.r, this.s, (this.yParity === 1 ? "0x1c" : "0x1b")]);
    }
    /**
     *  @private
     */
    constructor(guard, r, s, v) {
        (0, index_js_2.assertPrivate)(guard, _guard, "Signature");
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
            (0, index_js_2.assertArgument)(check, message, "signature", sig);
        }
        ;
        if (sig == null || (typeof sig === 'object' && sig.v == null && sig.r == null && sig.s == null)) {
            return new Signature(_guard, index_js_1.ZeroHash, index_js_1.ZeroHash, 0); // Default to 0
        }
        if (sig == null) {
            return new Signature(_guard, index_js_1.ZeroHash, index_js_1.ZeroHash, 0); // Default to 0
        }
        if (typeof (sig) === "string") {
            const bytes = (0, index_js_2.getBytes)(sig, "signature");
            if (bytes.length === 64) {
                // Parse the compact representation
                const r = (0, index_js_2.hexlify)(bytes.slice(0, 32));
                const s = bytes.slice(32, 64);
                const v = (s[0] & 0x80) ? 1 : 0; // Adjusted for v as 0 or 1
                s[0] &= 0x7f;
                return new Signature(_guard, r, (0, index_js_2.hexlify)(s), v);
            }
            // Handle the full length signature
            if (bytes.length === 65) {
                const r = (0, index_js_2.hexlify)(bytes.slice(0, 32));
                const s = (0, index_js_2.hexlify)(bytes.slice(32, 64));
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
                assertError((0, index_js_2.isHexString)(yParityAndS, 32), "invalid yParityAndS");
                const bytes = (0, index_js_2.getBytes)(yParityAndS);
                bytes[0] &= 0x7f;
                return (0, index_js_2.hexlify)(bytes);
            }
            assertError(false, "missing s");
        })(sig.s, sig.yParityAndS);
        assertError(((0, index_js_2.getBytes)(s)[0] & 0x80) == 0, "non-canonical s");
        // Simplified logic for v
        let v;
        if (sig.v != null) {
            v = ((0, index_js_2.getBigInt)(sig.v) === BN_1) ? 1 : 0; // Directly use 0 or 1 based on sig.v
        }
        else if (sig.yParityAndS != null) {
            assertError((0, index_js_2.isHexString)(sig.yParityAndS, 32), "invalid yParityAndS");
            v = ((0, index_js_2.getBytes)(sig.yParityAndS)[0] & 0x80) ? 1 : 0;
        }
        else if (sig.yParity != null) {
            v = ((0, index_js_2.getNumber)(sig.yParity, "sig.yParity") === 1) ? 1 : 0;
        }
        else {
            assertError(false, "missing v");
        }
        const result = new Signature(_guard, r, s, v);
        // Check consistency between v, yParity, and yParityAndS if given
        assertError(sig.yParity == null || (0, index_js_2.getNumber)(sig.yParity, "sig.yParity") === result.yParity, "yParity mismatch");
        assertError(sig.yParityAndS == null || sig.yParityAndS === result.yParityAndS, "yParityAndS mismatch");
        return result;
    }
}
exports.Signature = Signature;
//# sourceMappingURL=signature.js.map