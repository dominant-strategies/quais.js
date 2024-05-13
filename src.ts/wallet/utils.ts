/**
 *  @ignore
 */

import { assert, computeHmac, sha256 } from "../quais.js";
import {
    getBytesCopy, assertArgument, toUtf8Bytes, BytesLike, concat, dataSlice, encodeBase58, getBytes
} from "../utils/index.js";

export function looseArrayify(hexString: string): Uint8Array {
    if (typeof(hexString) === "string" && !hexString.startsWith("0x")) {
        hexString = "0x" + hexString;
    }
    return getBytesCopy(hexString);
}

export function getPassword(password: string | Uint8Array): Uint8Array {
    if (typeof(password) === 'string') {
        return toUtf8Bytes(password, "NFKC");
    }
    return getBytesCopy(password);
}

export function spelunk<T>(object: any, _path: string): T {

    const match = _path.match(/^([a-z0-9$_.-]*)(:([a-z]+))?(!)?$/i);
    assertArgument(match != null, "invalid path", "path", _path);

    const path = match[1];
    const type = match[3];
    const reqd = (match[4] === "!");

    let cur = object;
    for (const comp of path.toLowerCase().split('.')) {

        // Search for a child object with a case-insensitive matching key
        if (Array.isArray(cur)) {
            if (!comp.match(/^[0-9]+$/)) { break; }
            cur = cur[parseInt(comp)];

        } else if (typeof(cur) === "object") {
            let found: any = null;
            for (const key in cur) {
                 if (key.toLowerCase() === comp) {
                     found = cur[key];
                     break;
                 }
            }
            cur = found;

        } else {
            cur = null;
        }

        if (cur == null) { break; }
    }

    assertArgument(!reqd || cur != null, "missing required value", "path", path);

    if (type && cur != null) {
        if (type === "int") {
            if (typeof(cur) === "string" && cur.match(/^-?[0-9]+$/)) {
                return <T><unknown>parseInt(cur);
            } else if (Number.isSafeInteger(cur)) {
                return cur;
            }
        }

        if (type === "number") {
            if (typeof(cur) === "string" && cur.match(/^-?[0-9.]*$/)) {
                return <T><unknown>parseFloat(cur);
            }
        }

        if (type === "data") {
            if (typeof(cur) === "string") { return <T><unknown>looseArrayify(cur); }
        }

        if (type === "array" && Array.isArray(cur)) { return <T><unknown>cur; }
        if (type === typeof(cur)) { return cur; }

        assertArgument(false, `wrong type found for ${ type } `, "path", path);
    }

    return cur;
}

// HDNODEWallet and UTXO Wallet util methods


// "Bitcoin seed"
export const MasterSecret = new Uint8Array([ 66, 105, 116, 99, 111, 105, 110, 32, 115, 101, 101, 100 ]);

export const HardenedBit = 0x80000000;

export const N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");

export const Nibbles = "0123456789abcdef";

export function zpad(value: string | number, length: number): string {
    // Determine if the value is hexadecimal
    const isHex = typeof value === "string" && value.startsWith("0x");
    
    // Handle hexadecimal values
    if (isHex) {
        let hexValue = value.substring(2); // Remove the "0x" prefix
        while (hexValue.length < length * 2) { // Hexadecimal characters count double
            hexValue = "0" + hexValue;
        }
        return "0x" + hexValue;
    }
    
    // Handle numbers or non-hexadecimal strings
    let result = String(value);
    while (result.length < length) {
        result = '0' + result;
    }
    return result;
}



export function encodeBase58Check(_value: BytesLike): string {
    const value = getBytes(_value);
    const check = dataSlice(sha256(sha256(value)), 0, 4);
    const bytes = concat([ value, check ]);
    return encodeBase58(bytes);
}

export function ser_I(index: number, chainCode: string, publicKey: string, privateKey: null | string): { IL: Uint8Array, IR: Uint8Array } {
    const data = new Uint8Array(37);

    if (index & HardenedBit) {
        assert(privateKey != null, "cannot derive child of neutered node", "UNSUPPORTED_OPERATION", {
            operation: "deriveChild"
        });

        // Data = 0x00 || ser_256(k_par)
        data.set(getBytes(privateKey), 1);

    } else {
        // Data = ser_p(point(k_par))
        data.set(getBytes(publicKey));
    }

    // Data += ser_32(i)
    for (let i = 24; i >= 0; i -= 8) { data[33 + (i >> 3)] = ((index >> (24 - i)) & 0xff); }
    const I = getBytes(computeHmac("sha512", chainCode, data));

    return { IL: I.slice(0, 32), IR: I.slice(32) };
}

type HDNodeLike<T> = {
    coinType?: number; depth: number, deriveChild: (i: number) => T, setCoinType?: () => void 
};

export function derivePath<T extends HDNodeLike<T>>(node: T, path: string): T {
    const components = path.split("/");

    assertArgument(components.length > 0 && (components[0] === "m" || node.depth > 0), "invalid path", "path", path);

    if (components[0] === "m") { components.shift(); }

    let result: T = node;
    for (let i = 0; i < components.length; i++) {
        const component = components[i];

        if (component.match(/^[0-9]+'$/)) {
            const index = parseInt(component.substring(0, component.length - 1));
            assertArgument(index < HardenedBit, "invalid path index", `path[${ i }]`, component);
            result = result.deriveChild(HardenedBit + index);

        } else if (component.match(/^[0-9]+$/)) {
            const index = parseInt(component);
            assertArgument(index < HardenedBit, "invalid path index", `path[${ i }]`, component);
            result = result.deriveChild(index);

        } else {
            assertArgument(false, "invalid path component", `path[${ i }]`, component);
        }
    }
    // Extract the coin type from the path and set it on the node
    if (result.setCoinType) result.setCoinType();
    return result;
}

/*
export function follow(object: any, path: string): null | string {
    let currentChild = object;

    for (const comp of path.toLowerCase().split('/')) {

        // Search for a child object with a case-insensitive matching key
        let matchingChild = null;
        for (const key in currentChild) {
             if (key.toLowerCase() === comp) {
                 matchingChild = currentChild[key];
                 break;
             }
        }

        if (matchingChild === null) { return null; }

        currentChild = matchingChild;
    }

    return currentChild;
}

// "path/to/something:type!"
export function followRequired(data: any, path: string): string {
    const value = follow(data, path);
    if (value != null) { return value; }
    return logger.throwArgumentError("invalid value", `data:${ path }`,
    JSON.stringify(data));
}
*/
// See: https://www.ietf.org/rfc/rfc4122.txt (Section 4.4)
/*
export function uuidV4(randomBytes: BytesLike): string {
    const bytes = getBytes(randomBytes, "randomBytes");

    // Section: 4.1.3:
    // - time_hi_and_version[12:16] = 0b0100
    bytes[6] = (bytes[6] & 0x0f) | 0x40;

    // Section 4.4
    // - clock_seq_hi_and_reserved[6] = 0b0
    // - clock_seq_hi_and_reserved[7] = 0b1
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const value = hexlify(bytes);

    return [
       value.substring(2, 10),
       value.substring(10, 14),
       value.substring(14, 18),
       value.substring(18, 22),
       value.substring(22, 34),
    ].join("-");
}
*/
