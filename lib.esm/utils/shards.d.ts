/**
 * Retrieves the shard information for a given address based on its byte prefix.
 * The function parses the address to extract its byte prefix, then filters the ShardData
 * to find a matching shard entry. If no matching shard is found, it returns null.
 *
 * @param {string} address - The blockchain address to be analyzed. The address should
 * start with "0x" followed by the hexadecimal representation.
 *
 * @returns {Object|null} The shard data object corresponding to the address's byte prefix,
 * or null if no matching shard is found.
 */
export declare function getShardForAddress(address: string): {
    name: string;
    nickname: string;
    shard: string;
    context: number;
    byte: string;
} | null;
/**
 * Extracts both shard and UTXO information from a given blockchain address. This function
 * first determines the address's shard by its byte prefix, then checks the 9th bit of the
 * address to ascertain if it's a UTXO or non-UTXO address.
 *
 * @param {string} address - The blockchain address to be analyzed, expected to start with
 * "0x" followed by its hexadecimal representation.
 *
 * @returns {Object|null} An object containing the shard data and a boolean indicating
 * whether the address is a UTXO address, or null if the shard cannot be determined.
 */
export declare function getAddressDetails(address: string): {
    shard: {
        name: string;
        nickname: string;
        shard: string;
        context: number;
        byte: string;
    };
    isUTXO: boolean;
} | null;
/**
 * @param from address
 * @param to adress
 * @returns txtype
 */
export declare function getTxType(from: string | null, to: string | null): number;
/**
* Checks whether a given blockchain address is a UTXO address based on the 9th bit of
* the address. This function extracts the second byte of the address and checks its
* first bit to determine the UTXO status.
*
* @param {string} address - The blockchain address to be analyzed, expected to start with
* "0x" followed by its hexadecimal representation.
*
* @returns {boolean} True if the address is a UTXO address, false otherwise.
*/
export declare function isUTXOAddress(address: string): boolean;
//# sourceMappingURL=shards.d.ts.map