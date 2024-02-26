"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUTXOAddress = exports.getTxType = exports.getAddressDetails = exports.getShardForAddress = void 0;
const shards_js_1 = require("../constants/shards.js");
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
function getShardForAddress(address) {
    const addressByte = address.substring(2, 4);
    const filteredShards = shards_js_1.ShardData.filter((obj) => {
        return parseInt(addressByte, 16) === parseInt(obj.byte, 16);
    });
    if (filteredShards.length === 0) {
        return null;
    }
    return filteredShards[0];
}
exports.getShardForAddress = getShardForAddress;
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
function getAddressDetails(address) {
    const addressByte = address.substring(2, 4);
    const isUTXO = (parseInt(address.substring(4, 5), 16) & 0x1) === 1;
    const filteredShards = shards_js_1.ShardData.filter((obj) => {
        return parseInt(addressByte, 16) === parseInt(obj.byte, 16);
    });
    if (filteredShards.length === 0) {
        return null;
    }
    return { shard: filteredShards[0], isUTXO };
}
exports.getAddressDetails = getAddressDetails;
/**
 * Determines the transaction type based on the shard information of the 'from' and 'to'
 * addresses. If both addresses belong to the same shard, it returns 0, indicating an
 * intra-shard transaction. Otherwise, it returns 2, indicating an inter-shard transaction.
 * Throws an error if either address is null or if the shard cannot be found.
 *
 * @param {string|null} from - The sender's blockchain address.
 * @param {string|null} to - The recipient's blockchain address.
 *
 * @returns {number} The transaction type: 0 for intra-shard, 2 for inter-shard.
 * @throws {Error} If either address is null or if the shard cannot be determined.
 */
function getTxType(from, to) {
    if (from === null || to === null)
        throw new Error("Invalid address for from or to");
    const fromDetails = getAddressDetails(from);
    const toDetails = getAddressDetails(to);
    if (fromDetails === null || toDetails === null) {
        throw new Error("Invalid address or shard not found");
    }
    return fromDetails.shard === toDetails.shard ? 0 : 2;
}
exports.getTxType = getTxType;
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
function isUTXOAddress(address) {
    const secondByte = address.substring(3, 5);
    const binaryString = parseInt(secondByte, 16).toString(2).padStart(8, '0');
    const isUTXO = binaryString[0] === '1';
    return isUTXO;
}
exports.isUTXOAddress = isUTXOAddress;
//# sourceMappingURL=shards.js.map