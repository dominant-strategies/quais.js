"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTxType = exports.getShardForAddress = void 0;
const shards_js_1 = require("../constants/shards.js");
function getShardForAddress(address) {
    if (address.length < 4)
        return null;
    const byteCode = address.substring(2, 4).toUpperCase();
    for (const shardInfo of shards_js_1.ShardData) {
        if (byteCode >= shardInfo.byte[0].toUpperCase() && byteCode <= shardInfo.byte[1].toUpperCase()) {
            return shardInfo.shard;
        }
    }
    return null;
}
exports.getShardForAddress = getShardForAddress;
function getTxType(from, to) {
    if (from === null || to === null)
        return 0;
    const fromShard = getShardForAddress(from);
    const toShard = getShardForAddress(to);
    if (fromShard === null || toShard === null) {
        throw new Error("Invalid address or shard not found");
    }
    return fromShard === toShard ? 0 : 2;
}
exports.getTxType = getTxType;
//# sourceMappingURL=shards.js.map