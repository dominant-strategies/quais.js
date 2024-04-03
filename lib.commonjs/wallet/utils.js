"use strict";
/**
 *  @_ignore
 */
Object.defineProperty(exports, "__esModule", { value: true });
<<<<<<< HEAD
exports.spelunk = exports.getPassword = exports.zpad = exports.looseArrayify = void 0;
=======
exports.derivePath = exports.ser_I = exports.encodeBase58Check = exports.zpad = exports.Nibbles = exports.N = exports.HardenedBit = exports.MasterSecret = exports.spelunk = exports.getPassword = exports.looseArrayify = void 0;
const quais_js_1 = require("../quais.js");
>>>>>>> ee35178e (utxohdwallet)
const index_js_1 = require("../utils/index.js");
function looseArrayify(hexString) {
    if (typeof (hexString) === "string" && !hexString.startsWith("0x")) {
        hexString = "0x" + hexString;
    }
    return (0, index_js_1.getBytesCopy)(hexString);
}
exports.looseArrayify = looseArrayify;
<<<<<<< HEAD
function zpad(value, length) {
    value = String(value);
    while (value.length < length) {
        value = '0' + value;
    }
    return value;
}
exports.zpad = zpad;
=======
>>>>>>> ee35178e (utxohdwallet)
function getPassword(password) {
    if (typeof (password) === 'string') {
        return (0, index_js_1.toUtf8Bytes)(password, "NFKC");
    }
    return (0, index_js_1.getBytesCopy)(password);
}
exports.getPassword = getPassword;
function spelunk(object, _path) {
    const match = _path.match(/^([a-z0-9$_.-]*)(:([a-z]+))?(!)?$/i);
    (0, index_js_1.assertArgument)(match != null, "invalid path", "path", _path);
    const path = match[1];
    const type = match[3];
    const reqd = (match[4] === "!");
    let cur = object;
    for (const comp of path.toLowerCase().split('.')) {
        // Search for a child object with a case-insensitive matching key
        if (Array.isArray(cur)) {
            if (!comp.match(/^[0-9]+$/)) {
                break;
            }
            cur = cur[parseInt(comp)];
        }
        else if (typeof (cur) === "object") {
            let found = null;
            for (const key in cur) {
                if (key.toLowerCase() === comp) {
                    found = cur[key];
                    break;
                }
            }
            cur = found;
        }
        else {
            cur = null;
        }
        if (cur == null) {
            break;
        }
    }
    (0, index_js_1.assertArgument)(!reqd || cur != null, "missing required value", "path", path);
    if (type && cur != null) {
        if (type === "int") {
            if (typeof (cur) === "string" && cur.match(/^-?[0-9]+$/)) {
                return parseInt(cur);
            }
            else if (Number.isSafeInteger(cur)) {
                return cur;
            }
        }
        if (type === "number") {
            if (typeof (cur) === "string" && cur.match(/^-?[0-9.]*$/)) {
                return parseFloat(cur);
            }
        }
        if (type === "data") {
            if (typeof (cur) === "string") {
                return looseArrayify(cur);
            }
        }
        if (type === "array" && Array.isArray(cur)) {
            return cur;
        }
        if (type === typeof (cur)) {
            return cur;
        }
        (0, index_js_1.assertArgument)(false, `wrong type found for ${type} `, "path", path);
    }
    return cur;
}
exports.spelunk = spelunk;
<<<<<<< HEAD
=======
// HDNODEWallet and UTXO Wallet util methods
// "Bitcoin seed"
exports.MasterSecret = new Uint8Array([66, 105, 116, 99, 111, 105, 110, 32, 115, 101, 101, 100]);
exports.HardenedBit = 0x80000000;
exports.N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
exports.Nibbles = "0123456789abcdef";
function zpad(value, length) {
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
exports.zpad = zpad;
function encodeBase58Check(_value) {
    const value = (0, index_js_1.getBytes)(_value);
    const check = (0, index_js_1.dataSlice)((0, quais_js_1.sha256)((0, quais_js_1.sha256)(value)), 0, 4);
    const bytes = (0, index_js_1.concat)([value, check]);
    return (0, index_js_1.encodeBase58)(bytes);
}
exports.encodeBase58Check = encodeBase58Check;
function ser_I(index, chainCode, publicKey, privateKey) {
    const data = new Uint8Array(37);
    if (index & exports.HardenedBit) {
        (0, quais_js_1.assert)(privateKey != null, "cannot derive child of neutered node", "UNSUPPORTED_OPERATION", {
            operation: "deriveChild"
        });
        // Data = 0x00 || ser_256(k_par)
        data.set((0, index_js_1.getBytes)(privateKey), 1);
    }
    else {
        // Data = ser_p(point(k_par))
        data.set((0, index_js_1.getBytes)(publicKey));
    }
    // Data += ser_32(i)
    for (let i = 24; i >= 0; i -= 8) {
        data[33 + (i >> 3)] = ((index >> (24 - i)) & 0xff);
    }
    const I = (0, index_js_1.getBytes)((0, quais_js_1.computeHmac)("sha512", chainCode, data));
    return { IL: I.slice(0, 32), IR: I.slice(32) };
}
exports.ser_I = ser_I;
function derivePath(node, path) {
    const components = path.split("/");
    (0, index_js_1.assertArgument)(components.length > 0 && (components[0] === "m" || node.depth > 0), "invalid path", "path", path);
    if (components[0] === "m") {
        components.shift();
    }
    let result = node;
    for (let i = 0; i < components.length; i++) {
        const component = components[i];
        if (component.match(/^[0-9]+'$/)) {
            const index = parseInt(component.substring(0, component.length - 1));
            (0, index_js_1.assertArgument)(index < exports.HardenedBit, "invalid path index", `path[${i}]`, component);
            result = result.deriveChild(exports.HardenedBit + index);
        }
        else if (component.match(/^[0-9]+$/)) {
            const index = parseInt(component);
            (0, index_js_1.assertArgument)(index < exports.HardenedBit, "invalid path index", `path[${i}]`, component);
            result = result.deriveChild(index);
        }
        else {
            (0, index_js_1.assertArgument)(false, "invalid path component", `path[${i}]`, component);
        }
    }
    // Extract the coin type from the path and set it on the node
    if (result.setCoinType)
        result.setCoinType();
    return result;
}
exports.derivePath = derivePath;
>>>>>>> ee35178e (utxohdwallet)
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
//# sourceMappingURL=utils.js.map