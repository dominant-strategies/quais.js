/* eslint-disable @typescript-eslint/no-unused-vars */
import { HDNodeWallet } from '../hdnodewallet.js';
import { getBytes } from '../../utils/data.js';
interface XOnlyPointAddTweakResult {
    parity: 1 | 0;
    xOnlyPubkey: Uint8Array;
}

export interface TinySecp256k1InterfaceBIP32 {
    isPoint(p: Uint8Array): boolean;
    isPrivate(d: Uint8Array): boolean;
    pointFromScalar(d: Uint8Array, compressed?: boolean): Uint8Array | null;
    pointAddScalar(p: Uint8Array, tweak: Uint8Array, compressed?: boolean): Uint8Array | null;
    privateAdd(d: Uint8Array, tweak: Uint8Array): Uint8Array | null;
    sign(h: Uint8Array, d: Uint8Array, e?: Uint8Array): Uint8Array;
    signSchnorr?(h: Uint8Array, d: Uint8Array, e?: Uint8Array): Uint8Array;
    verify(h: Uint8Array, Q: Uint8Array, signature: Uint8Array, strict?: boolean): boolean;
    verifySchnorr?(h: Uint8Array, Q: Uint8Array, signature: Uint8Array): boolean;
    xOnlyPointAddTweak?(p: Uint8Array, tweak: Uint8Array): XOnlyPointAddTweakResult | null;
    privateNegate?(d: Uint8Array): Uint8Array;
}

export interface Network {
    bip32: {
        public: number;
        private: number;
    };
    wif: number;
}

export interface TinySecp256k1Interface extends TinySecp256k1InterfaceBIP32 {
    pointMultiply(p: Uint8Array, tweak: Uint8Array, compressed?: boolean): Uint8Array | null;

    pointAdd(pA: Uint8Array, pB: Uint8Array, compressed?: boolean): Uint8Array | null;

    xOnlyPointFromPoint(p: Uint8Array): Uint8Array;
}

export interface SignerBIP32 {
    publicKey: Uint8Array;
    lowR: boolean;
    sign(hash: Uint8Array, lowR?: boolean): Uint8Array;
    verify(hash: Uint8Array, signature: Uint8Array): boolean;
    signSchnorr(hash: Uint8Array): Uint8Array;
    verifySchnorr(hash: Uint8Array, signature: Uint8Array): boolean;
}
export interface BIP32Interface extends SignerBIP32 {
    chainCode: Uint8Array;
    network: Network;
    depth: number;
    index: number;
    parentFingerprint: number;
    privateKey?: Uint8Array;
    identifier: Uint8Array;
    fingerprint: Uint8Array;
    isNeutered(): boolean;
    neutered(): BIP32Interface;
    toBase58(): string;
    derive(index: number): BIP32Interface;
    deriveHardened(index: number): BIP32Interface;
    derivePath(path: string): BIP32Interface;
    tweak(t: Uint8Array): SignerBIP32;
}

export interface BIP32API {
    fromSeed(seed: Uint8Array, network?: Network): BIP32Interface;
    fromBase58(inString: string, network?: Network): BIP32Interface;
    fromPublicKey(publicKey: Uint8Array, chainCode: Uint8Array, network?: Network): BIP32Interface;
    fromPrivateKey(privateKey: Uint8Array, chainCode: Uint8Array, network?: Network): BIP32Interface;
}

export class HDNodeBIP32Adapter implements BIP32Interface {
    private hdNodeWallet: HDNodeWallet;

    constructor(hdNodeWallet: HDNodeWallet) {
        this.hdNodeWallet = hdNodeWallet;
    }

    get chainCode(): Uint8Array {
        return getBytes(this.hdNodeWallet.chainCode);
    }

    get network(): Network {
        throw 'Not implemented';
    }

    get depth(): number {
        return this.hdNodeWallet.depth;
    }

    get index(): number {
        return this.hdNodeWallet.index;
    }

    get parentFingerprint(): number {
        return parseInt(this.hdNodeWallet.parentFingerprint);
    }

    get privateKey(): Uint8Array | undefined {
        return getBytes(this.hdNodeWallet.privateKey);
    }

    get identifier(): Uint8Array {
        throw 'Not implemented';
    }

    get fingerprint(): Uint8Array {
        throw 'Not implemented';
    }

    isNeutered(): boolean {
        throw 'Not implemented';
    }

    neutered(): BIP32Interface {
        throw 'Not implemented';
    }

    toBase58(): string {
        throw 'Not implemented';
    }

    // Map `derive` to `deriveChild`
    derive(index: number): BIP32Interface {
        const derivedNode = this.hdNodeWallet.deriveChild(index);
        return new HDNodeBIP32Adapter(derivedNode);
    }

    deriveHardened(index: number): BIP32Interface {
        throw 'Not implemented';
    }

    derivePath(path: string): BIP32Interface {
        const derivedNode = this.hdNodeWallet.derivePath(path);
        return new HDNodeBIP32Adapter(derivedNode);
    }

    tweak(t: Uint8Array): BIP32Interface {
        throw 'Not implemented';
    }

    get publicKey(): Uint8Array {
        return getBytes(this.hdNodeWallet.publicKey);
    }

    get lowR(): boolean {
        throw 'Not implemented';
    }

    sign(hash: Uint8Array): Uint8Array {
        const sig = this.hdNodeWallet.signingKey.sign(hash);
        return getBytes(sig.serialized);
    }

    verify(hash: Uint8Array, signature: Uint8Array): boolean {
        throw 'Not implemented';
    }

    signSchnorr(hash: Uint8Array): Uint8Array {
        throw 'Not implemented';
    }

    verifySchnorr(hash: Uint8Array, signature: Uint8Array): boolean {
        throw 'Not implemented';
    }
}
