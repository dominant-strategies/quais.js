import { ShardData } from "../constants";


export function getShardForAddress(address: string): string | null {
    if (address.length < 4) return null;
    const byteCode = address.substring(2, 4).toUpperCase();
    for (const shardInfo of ShardData) {
        if (byteCode >= shardInfo.byte[0] && byteCode <= shardInfo.byte[1]) {
            return shardInfo.shard;
        }
    }
    return null;
}

export function getTxType(from: string | null , to: string | null ): number {
    if (from === null || to === null) return 0;
    const fromShard = getShardForAddress(from);
    const toShard = getShardForAddress(to);

    if (fromShard === null || toShard === null) {
        throw new Error("Invalid address or shard not found");
    }

    return fromShard === toShard ? 0 : 2;
}