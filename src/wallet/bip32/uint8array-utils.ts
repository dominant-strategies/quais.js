/**
 * Uint8Array comparison
 */
export function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a === b) {
        return true;
    }
    if (a.length !== b.length) {
        return false;
    }
    for (let index = 0; index < a.length; index++) {
        if (a[index] !== b[index]) {
            return false;
        }
    }
    return true;
}
