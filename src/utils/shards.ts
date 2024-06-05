import { toZone, Zone } from '../constants/zones.js';
/**
 * Retrieves the shard information for a given address based on its byte prefix. The function parses the address to
 * extract its byte prefix, then filters the ShardData to find a matching shard entry. If no matching shard is found, it
 * returns null.
 *
 * @category Utils
 * @param {string} address - The blockchain address to be analyzed. The address should start with "0x" followed by the
 *   hexadecimal representation.
 *
 * @returns {Object | null} An object containing the shard information, or null if no
 */
export function getZoneForAddress(address: string): Zone | null {
    try {
        return toZone(address.slice(0, 4));
    } catch (error) {
        return null;
    }
}

/**
 * Extracts both zone and UTXO information from a given blockchain address. This function first determines the address's
 * zone by its byte prefix, then checks the 9th bit of the address to ascertain if it's a UTXO or non-UTXO address.
 *
 * @category Utils
 * @param {string} address - The blockchain address to be analyzed, expected to start with "0x" followed by its
 *   hexadecimal representation.
 *
 * @returns {Object | null} An object containing the zone and UTXO information, or null if no address is found.
 */
export function getAddressDetails(address: string): { zone: Zone; isUTXO: boolean } | null {
    const isUTXO = (parseInt(address.substring(4, 5), 16) & 0x1) === 1;

    return { zone: toZone(address.substring(0, 4)), isUTXO };
}

/**
 * Determines the transaction type based on the sender and recipient addresses. The function checks if both addresses
 * are UTXO addresses, in which case it returns 2. If only the sender address is a UTXO address, it returns 1.
 * Otherwise, it returns 0.
 *
 * @category Utils
 * @param {string | null} from - The sender address, expected to start with "0x" followed by its hexadecimal
 *   representation. If null, the function returns 0.
 * @param {string | null} to - The recipient address, expected to start with "0x" followed by its hexadecimal
 *   representation. If null, the function returns 0.
 *
 * @returns {number} The transaction type based on the addresses.
 */
export function getTxType(from: string | null, to: string | null): number {
    if (from === null || to === null) return 0;
    const fromUTXO = isQiAddress(from);
    const toUTXO = isQiAddress(to);

    switch (true) {
        case fromUTXO && toUTXO:
            return 2;
        case fromUTXO && !toUTXO:
            return 2;
        default:
            return 0;
    }
}

/**
 * Checks whether a given blockchain address is a UTXO address based on the 9th bit of the address. This function
 * extracts the second byte of the address and checks its first bit to determine the UTXO status.
 *
 * @category Utils
 * @param {string} address - The blockchain address to be analyzed, expected to start with "0x" followed by its
 *   hexadecimal representation.
 *
 * @returns {boolean} True if the address is a UTXO address, false otherwise.
 */
export function isQiAddress(address: string): boolean {
    const secondByte = address.substring(4, 6);
    const binaryString = parseInt(secondByte, 16).toString(2).padStart(8, '0');
    const isUTXO = binaryString[0] === '1';

    return isUTXO;
}
