declare module "ws" {
    export class WebSocket {
        constructor(...args: Array<any>);

        onopen: null | ((...args: Array<any>) => any);
        onmessage: null | ((...args: Array<any>) => any);
        onerror: null | ((...args: Array<any>) => any);

        readyState: number;

        send(payload: any): void;
        close(code?: number, reason?: string): void;
    }
}

declare module "react-native-fast-crypto" {
    export interface ReactNativeFastCrypto {
        scrypt(
            passwd: Uint8Array,
            salt: Uint8Array,
            N: number,
            r: number,
            p: number,
            size: number
        ): Promise<Uint8Array>;

        secp256k1: {
            publicKeyCreate(privateKey: Uint8Array, compressed: boolean): Promise<Uint8Array>;
            privateKeyTweakAdd(privateKey: Uint8Array, tweak: Uint8Array): Promise<Uint8Array>;
            publicKeyTweakAdd(publicKey: Uint8Array, tweak: Uint8Array, compressed: boolean): Promise<Uint8Array>;
        };

        pbkdf2: {
            deriveAsync(
                data: Uint8Array,
                salt: Uint8Array,
                iterations: number,
                size: number,
                alg: string
            ): Promise<Uint8Array>;
        };
    }

    export function scrypt(
        passwd: Uint8Array,
        salt: Uint8Array,
        N: number,
        r: number,
        p: number,
        size: number
    ): Promise<Uint8Array>;

    export const secp256k1: {
        publicKeyCreate(privateKey: Uint8Array, compressed: boolean): Promise<Uint8Array>;
        privateKeyTweakAdd(privateKey: Uint8Array, tweak: Uint8Array): Promise<Uint8Array>;
        publicKeyTweakAdd(publicKey: Uint8Array, tweak: Uint8Array, compressed: boolean): Promise<Uint8Array>;
    };

    export const pbkdf2: {
        deriveAsync(
            data: Uint8Array,
            salt: Uint8Array,
            iterations: number,
            size: number,
            alg: string
        ): Promise<Uint8Array>;
    };
}


