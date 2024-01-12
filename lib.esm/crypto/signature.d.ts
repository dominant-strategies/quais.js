import type { BigNumberish, BytesLike } from "../utils/index.js";
/**
 *  A SignatureLike
 *
 *  @_docloc: api/crypto:Signing
 */
export type SignatureLike = Signature | string | {
    r: string;
    s: string;
    v: BigNumberish;
    yParity?: 0 | 1;
    yParityAndS?: string;
} | {
    r: string;
    yParityAndS: string;
    yParity?: 0 | 1;
    s?: string;
    v?: number;
} | {
    r: string;
    s: string;
    yParity: 0 | 1;
    v?: BigNumberish;
    yParityAndS?: string;
};
/**
 *  A Signature  @TODO
 *
 *
 *  @_docloc: api/crypto:Signing
 */
export declare class Signature {
    #private;
    /**
     *  The ``r`` value for a signautre.
     *
     *  This represents the ``x`` coordinate of a "reference" or
     *  challenge point, from which the ``y`` can be computed.
     */
    get r(): string;
    set r(value: BytesLike);
    /**
     *  The ``s`` value for a signature.
     */
    get s(): string;
    set s(_value: BytesLike);
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
    get v(): 0 | 1;
    set v(value: BigNumberish);
    /**
     *  The ``yParity`` for the signature.
     */
    get yParity(): 0 | 1;
    /**
     *  The [[link-eip-2098]] compact representation of the ``yParity``
     *  and ``s`` compacted into a single ``bytes32``.
     */
    get yParityAndS(): string;
    /**
     *  The [[link-eip-2098]] compact representation.
     */
    get compactSerialized(): string;
    /**
     *  The serialized representation.
     */
    get serialized(): string;
    /**
     *  @private
     */
    constructor(guard: any, r: string, s: string, v: 0 | 1);
    /**
     *  Returns a new identical [[Signature]].
     */
    clone(): Signature;
    /**
     *  Returns a representation that is compatible with ``JSON.stringify``.
     */
    toJSON(): any;
    /**
     *  Creates a new [[Signature]].
     *
     *  If no %%sig%% is provided, a new [[Signature]] is created
     *  with default values.
     *
     *  If %%sig%% is a string, it is parsed.
     */
    static from(sig?: SignatureLike): Signature;
}
//# sourceMappingURL=signature.d.ts.map