/**
 *  [Base64 encoding](https://en.wikipedia.org/wiki/Base64) using 6-bit words to encode
 *  arbitrary bytes into a string using 65 printable symbols, the
 *  upper-case and lower-case alphabet, the digits `0` through `9`,
 *  `"+"` and `"/"` with the `"="` used for padding.
 *
 *  @_subsection: api/utils:Base64 Encoding  [about-base64]
 */
import { getBytes, getBytesCopy } from "./data.js";

import type { BytesLike } from "./data.js";

/**
 *  Decodes the base-64 encoded `value`.
 *
 *  @example
 *  ```ts
 *    // The decoded value is always binary data...
 *    result = decodeBase64("SGVsbG8gV29ybGQhIQ==")
 *    //_result:
 *
 *    // ...use toUtf8String to convert it to a string.
 *    toUtf8String(result)
 *    //_result:
 *
 *    // Decoding binary data
 *    decodeBase64("EjQ=")
 *    //_result:
 *  ```
 * 
 *  @param {string} value - The base-64 encoded value.
 *  @returns {Uint8Array} The decoded binary data.
 *  
 *  @category Utils
 */
export function decodeBase64(value: string): Uint8Array {
    return getBytesCopy(Buffer.from(value, "base64"));
};

/**
 *  Encodes `data` as a base-64 encoded string.
 *
 *  @example
 *  ```ts
 *    // Encoding binary data as a hexstring
 *    encodeBase64("0x1234")
 *    //_result:
 *
 *    // Encoding binary data as a Uint8Array
 *    encodeBase64(new Uint8Array([ 0x12, 0x34 ]))
 *    //_result:
 *
 *    // The input MUST be data...
 *    encodeBase64("Hello World!!")
 *    //_error:
 *
 *    // ...use toUtf8Bytes for this.
 *    encodeBase64(toUtf8Bytes("Hello World!!"))
 *    //_result:
 *  ```
 * 
 *  @param {BytesLike} data - The data to encode.
 *  @returns {string} The base-64 encoded string.
 *  
 *  @category Utils
 */
export function encodeBase64(data: BytesLike): string {
    return Buffer.from(getBytes(data)).toString("base64");
}
