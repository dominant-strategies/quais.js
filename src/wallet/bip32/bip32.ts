import * as crypto from './crypto.js';
import { testEcc } from './testecc.js';
// import ow from 'ow';
import { BIP32API, Network } from './types.js';

interface Bip32SignerConstructor {
    __D?: Uint8Array;
    __Q?: Uint8Array;
}

interface BIP32Constructor extends Bip32SignerConstructor {
    chainCode: Uint8Array;
    network: Network;
    __DEPTH?: number;
    __INDEX?: number;
    __PARENT_FINGERPRINT?: number;
}

export function BIP32Factory(ecc: any): BIP32API {
    testEcc(ecc);
    // const UINT256_TYPE = ow.uint8Array.length(32);
    // const NETWORK_TYPE = ow.object.partialShape({
    //     wif: ow.number.uint8,
    //     bip32: ow.object.exactShape({
    //         public: ow.number.uint32,
    //         private: ow.number.uint32,
    //     }),
    // });
    const BITCOIN: Network = {
        bip32: {
            public: 0x0488b21e,
            private: 0x0488ade4,
        },
        wif: 0x80,
    };
    const HIGHEST_BIT = 0x80000000;
    // const UINT31_MAX = Math.pow(2, 31) - 1;

    function toXOnly(pubKey: Uint8Array): Uint8Array {
        return pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);
    }

    class Bip32Signer {
        protected __D?: Uint8Array;
        protected __Q?: Uint8Array;
        public lowR: boolean;

        constructor({ __D, __Q }: Bip32SignerConstructor) {
            this.__D = __D;
            this.__Q = __Q;
            this.lowR = false;
        }

        get publicKey(): Uint8Array {
            if (this.__Q === undefined) this.__Q = ecc.pointFromScalar(this.__D, true);
            return this.__Q as Uint8Array;
        }

        get privateKey(): Uint8Array | undefined {
            return this.__D;
        }

        sign(hash: Uint8Array, lowR?: boolean): Uint8Array {
            if (!this.privateKey) throw new Error('Missing private key');
            if (lowR === undefined) lowR = this.lowR;
            if (lowR === false) {
                return ecc.sign(hash, this.privateKey);
            } else {
                let sig = ecc.sign(hash, this.privateKey);
                const extraData = new Uint8Array(32);
                const extraDataView = new DataView(extraData.buffer);
                let counter = 0;
                // if first try is lowR, skip the loop
                // for second try and on, add extra entropy counting up
                while (sig[0] > 0x7f) {
                    counter++;
                    extraDataView.setUint32(0, counter, true);
                    sig = ecc.sign(hash, this.privateKey, extraData);
                }
                return sig;
            }
        }

        signSchnorr(hash: Uint8Array): Uint8Array {
            if (!this.privateKey) throw new Error('Missing private key');
            if (!ecc.signSchnorr) throw new Error('signSchnorr not supported by ecc library');
            return ecc.signSchnorr(hash, this.privateKey);
        }

        verify(hash: Uint8Array, signature: Uint8Array): boolean {
            return ecc.verify(hash, this.publicKey, signature);
        }

        verifySchnorr(hash: Uint8Array, signature: Uint8Array): boolean {
            if (!ecc.verifySchnorr) throw new Error('verifySchnorr not supported by ecc library');
            return ecc.verifySchnorr(hash, this.publicKey.subarray(1, 33), signature);
        }
    }

    class BIP32 extends Bip32Signer {
        public chainCode: Uint8Array;
        public network: Network;
        private __DEPTH: number;
        private __INDEX: number;
        private __PARENT_FINGERPRINT: number;

        constructor({
            __D,
            __Q,
            chainCode,
            network,
            __DEPTH = 0,
            __INDEX = 0,
            __PARENT_FINGERPRINT = 0x00000000,
        }: BIP32Constructor) {
            super({ __D, __Q });
            this.chainCode = chainCode;
            this.network = network;
            this.__DEPTH = __DEPTH;
            this.__INDEX = __INDEX;
            this.__PARENT_FINGERPRINT = __PARENT_FINGERPRINT;
            // ow(network, NETWORK_TYPE);
        }

        get depth(): number {
            return this.__DEPTH;
        }

        get index(): number {
            return this.__INDEX;
        }

        get parentFingerprint(): number {
            return this.__PARENT_FINGERPRINT;
        }

        get identifier(): Uint8Array {
            return crypto.hash160(this.publicKey);
        }

        get fingerprint(): Uint8Array {
            return this.identifier.subarray(0, 4);
        }

        get compressed(): boolean {
            return true;
        }

        isNeutered(): boolean {
            return this.__D === undefined;
        }

        neutered(): BIP32 {
            return fromPublicKeyLocal(
                this.publicKey,
                this.chainCode,
                this.network,
                this.depth,
                this.index,
                this.parentFingerprint,
            );
        }

        toBase58(): string {
            const network = this.network;
            const version = !this.isNeutered() ? network.bip32.private : network.bip32.public;
            const buffer = new Uint8Array(78);
            const bufferView = new DataView(buffer.buffer);
            // 4 bytes: version bytes
            bufferView.setUint32(0, version, false);
            // 1 byte: depth: 0x00 for master nodes, 0x01 for level-1 descendants, ....
            bufferView.setUint8(4, this.depth);
            // 4 bytes: the fingerprint of the parent's key (0x00000000 if master key)
            bufferView.setUint32(5, this.parentFingerprint, false);
            // 4 bytes: child number. This is the number i in xi = xpar/i, with xi the key being serialized.
            // This is encoded in big endian. (0x00000000 if master key)
            bufferView.setUint32(9, this.index, false);
            // 32 bytes: the chain code
            buffer.set(this.chainCode, 13);
            // 33 bytes: the public key or private key data
            if (!this.isNeutered()) {
                // 0x00 + k for private keys
                bufferView.setUint8(45, 0);
                buffer.set(this.privateKey as Uint8Array, 46);
                // 33 bytes: the public key
            } else {
                // X9.62 encoding for public keys
                buffer.set(this.publicKey, 45);
            }
            return crypto.bs58check.encode(buffer);
        }

        derive(index: number): BIP32 {
            // ow(index, ow.number.message('Expected UInt32').uint32.message('Expected UInt32'));
            const isHardened = index >= HIGHEST_BIT;
            const data = new Uint8Array(37);
            const dataView = new DataView(data.buffer);
            // Hardened child
            if (isHardened) {
                if (this.isNeutered()) throw new TypeError('Missing private key for hardened child key');
                // data = 0x00 || ser256(kpar) || ser32(index)
                data[0] = 0x00;
                data.set(this.privateKey as Uint8Array, 1);
                dataView.setUint32(33, index, false);
                // Normal child
            } else {
                // data = serP(point(kpar)) || ser32(index)
                //      = serP(Kpar) || ser32(index)
                data.set(this.publicKey, 0);
                dataView.setUint32(33, index, false);
            }
            const I = crypto.hmacSHA512(this.chainCode, data);
            const IL = I.slice(0, 32);
            const IR = I.slice(32);
            // if parse256(IL) >= n, proceed with the next value for i
            if (!ecc.isPrivate(IL)) return this.derive(index + 1);
            // Private parent key -> private child key
            let hd: BIP32;
            if (!this.isNeutered()) {
                // ki = parse256(IL) + kpar (mod n)
                const ki = ecc.privateAdd(this.privateKey, IL);
                // In case ki == 0, proceed with the next value for i
                if (ki == null) return this.derive(index + 1);
                hd = fromPrivateKeyLocal(
                    ki,
                    IR,
                    this.network,
                    this.depth + 1,
                    index,
                    new DataView(this.fingerprint.buffer).getUint32(0, false),
                );
                // Public parent key -> public child key
            } else {
                // Ki = point(parse256(IL)) + Kpar
                //    = G*IL + Kpar
                const Ki = ecc.pointAddScalar(this.publicKey, IL, true);
                // In case Ki is the point at infinity, proceed with the next value for i
                if (Ki === null) return this.derive(index + 1);
                hd = fromPublicKeyLocal(
                    Ki,
                    IR,
                    this.network,
                    this.depth + 1,
                    index,
                    new DataView(this.fingerprint.buffer).getUint32(0, false),
                );
            }
            return hd;
        }

        deriveHardened(index: number): BIP32 {
            // ow(index, ow.number
            //     .message('Expected UInt31')
            //     .uint32.message('Expected UInt31')
            //     .is(value => value <= UINT31_MAX)
            //     .message('Expected UInt31'));
            // Only derives hardened private keys by default
            return this.derive(index + HIGHEST_BIT);
        }

        derivePath(path: string): BIP32 {
            // ow(path, ow.string
            //     .is(value => value.match(/^(m\/)?(\d+'?\/)*\d+'?$/) !== null)
            //     .message(value => `Expected BIP32Path, got ${value}`));
            let splitPath = path.split('/');
            if (splitPath[0] === 'm') {
                if (this.parentFingerprint) throw new TypeError('Expected master, got child');
                splitPath = splitPath.slice(1);
            }
            return splitPath.reduce((prevHd: BIP32, indexStr: string) => {
                let index;
                if (indexStr.slice(-1) === `'`) {
                    index = parseInt(indexStr.slice(0, -1), 10);
                    return prevHd.deriveHardened(index);
                } else {
                    index = parseInt(indexStr, 10);
                    return prevHd.derive(index);
                }
            }, this);
        }

        tweak(t: Uint8Array): Bip32Signer {
            if (this.privateKey) return this.tweakFromPrivateKey(t);
            return this.tweakFromPublicKey(t);
        }

        tweakFromPublicKey(t: Uint8Array): Bip32Signer {
            const xOnlyPubKey = toXOnly(this.publicKey);
            if (!ecc.xOnlyPointAddTweak) throw new Error('xOnlyPointAddTweak not supported by ecc library');
            const tweakedPublicKey = ecc.xOnlyPointAddTweak(xOnlyPubKey, t);
            if (!tweakedPublicKey || tweakedPublicKey.xOnlyPubkey === null) throw new Error('Cannot tweak public key!');
            const parityByte = Uint8Array.from([tweakedPublicKey.parity === 0 ? 0x02 : 0x03]);
            const tweakedPublicKeyCompresed = new Uint8Array(tweakedPublicKey.xOnlyPubkey.length + 1);
            tweakedPublicKeyCompresed.set(parityByte);
            tweakedPublicKeyCompresed.set(tweakedPublicKey.xOnlyPubkey, 1);
            return new Bip32Signer({ __Q: tweakedPublicKeyCompresed });
        }

        tweakFromPrivateKey(t: Uint8Array): Bip32Signer {
            const hasOddY = this.publicKey[0] === 3 || (this.publicKey[0] === 4 && (this.publicKey[64] & 1) === 1);
            const privateKey = (() => {
                if (!hasOddY) return this.privateKey;
                else if (!ecc.privateNegate) throw new Error('privateNegate not supported by ecc library');
                else return ecc.privateNegate(this.privateKey);
            })();
            const tweakedPrivateKey = ecc.privateAdd(privateKey, t);
            if (!tweakedPrivateKey) throw new Error('Invalid tweaked private key!');
            return new Bip32Signer({ __D: tweakedPrivateKey });
        }
    }

    function fromBase58(inString: string, network?: Network): BIP32 {
        const buffer = crypto.bs58check.decode(inString);
        const bufferView = new DataView(buffer.buffer);
        if (buffer.length !== 78) throw new TypeError('Invalid buffer length');
        network = network || BITCOIN;
        // 4 bytes: version bytes
        const version = bufferView.getUint32(0, false);
        if (version !== network.bip32.private && version !== network.bip32.public)
            throw new TypeError('Invalid network version');
        // 1 byte: depth: 0x00 for master nodes, 0x01 for level-1 descendants, ...
        const depth = buffer[4];
        // 4 bytes: the fingerprint of the parent's key (0x00000000 if master key)
        const parentFingerprint = bufferView.getUint32(5, false);
        if (depth === 0) {
            if (parentFingerprint !== 0x00000000) throw new TypeError('Invalid parent fingerprint');
        }
        // 4 bytes: child number. This is the number i in xi = xpar/i, with xi the key being serialized.
        // This is encoded in MSB order. (0x00000000 if master key)
        const index = bufferView.getUint32(9, false);
        if (depth === 0 && index !== 0) throw new TypeError('Invalid index');
        // 32 bytes: the chain code
        const chainCode = buffer.subarray(13, 45);
        let hd: BIP32;
        // 33 bytes: private key data (0x00 + k)
        if (version === network.bip32.private) {
            if (bufferView.getUint8(45) !== 0x00) throw new TypeError('Invalid private key');
            const k = buffer.subarray(46, 78);
            hd = fromPrivateKeyLocal(k, chainCode, network, depth, index, parentFingerprint);
            // 33 bytes: public key data (0x02 + X or 0x03 + X)
        } else {
            const X = buffer.subarray(45, 78);
            hd = fromPublicKeyLocal(X, chainCode, network, depth, index, parentFingerprint);
        }
        return hd;
    }

    function fromPrivateKey(privateKey: Uint8Array, chainCode: Uint8Array, network?: Network): BIP32 {
        return fromPrivateKeyLocal(privateKey, chainCode, network || BITCOIN, 0, 0, 0);
    }

    function fromPrivateKeyLocal(
        privateKey: Uint8Array,
        chainCode: Uint8Array,
        network: Network,
        depth: number,
        index: number,
        parentFingerprint: number,
    ): BIP32 {
        // ow({ privateKey, chainCode }, ow.object.exactShape({
        //     privateKey: UINT256_TYPE,
        //     chainCode: UINT256_TYPE,
        // }));
        network = network || BITCOIN;
        if (!ecc.isPrivate(privateKey)) throw new TypeError('Private key not in range [1, n)');
        return new BIP32({
            __D: privateKey,
            chainCode,
            network,
            __DEPTH: depth,
            __INDEX: index,
            __PARENT_FINGERPRINT: parentFingerprint,
        });
    }

    function fromPublicKey(publicKey: Uint8Array, chainCode: Uint8Array, network?: Network): BIP32 {
        return fromPublicKeyLocal(publicKey, chainCode, network || BITCOIN, 0, 0, 0);
    }

    function fromPublicKeyLocal(
        publicKey: Uint8Array,
        chainCode: Uint8Array,
        network: Network,
        depth: number,
        index: number,
        parentFingerprint: number,
    ): BIP32 {
        // ow({ publicKey, chainCode }, ow.object.exactShape({
        //     publicKey: ow.uint8Array.length(33),
        //     chainCode: UINT256_TYPE,
        // }));
        network = network || BITCOIN;
        // verify the X coordinate is a point on the curve
        if (!ecc.isPoint(publicKey)) throw new TypeError('Point is not on the curve');
        return new BIP32({
            __Q: publicKey,
            chainCode,
            network,
            __DEPTH: depth,
            __INDEX: index,
            __PARENT_FINGERPRINT: parentFingerprint,
        });
    }

    function fromSeed(seed: Uint8Array, network?: Network): BIP32 {
        // ow(seed, ow.uint8Array);
        if (seed.length < 16) throw new TypeError('Seed should be at least 128 bits');
        if (seed.length > 64) throw new TypeError('Seed should be at most 512 bits');
        network = network || BITCOIN;
        const encoder = new TextEncoder();
        const I = crypto.hmacSHA512(encoder.encode('Bitcoin seed'), seed);
        const IL = I.slice(0, 32);
        const IR = I.slice(32);
        return fromPrivateKey(IL, IR, network);
    }

    return {
        fromSeed,
        fromBase58,
        fromPublicKey,
        fromPrivateKey,
    };
}
