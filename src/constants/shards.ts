import { ZoneData } from './zones.js';

/**
 * A shard represents a chain within the Quai network hierarchy. A shard refer to the Prime chain, a region under the
 * Prime chain, or a Zone within a region. The value is a hexadecimal string representing the encoded value of the
 * shard. Read more [here](https://github.com/quai-network/qips/blob/master/qip-0002.md).
 *
 * @category Constants
 */
export enum Shard {
    Cyprus = '0x0',
    Cyprus1 = '0x00',
    Cyprus2 = '0x01',
    Cyprus3 = '0x02',
    Paxos = '0x1',
    Paxos1 = '0x10',
    Paxos2 = '0x11',
    Paxos3 = '0x12',
    Hydra = '0x2',
    Hydra1 = '0x20',
    Hydra2 = '0x21',
    Hydra3 = '0x22',
    Prime = '0x',
}

function shardFromBytes(shard: string): Shard {
    switch (shard) {
        case '0x':
            return Shard.Prime;
        case '0x0':
            return Shard.Cyprus;
        case '0x1':
            return Shard.Paxos;
        case '0x2':
            return Shard.Hydra;
        case '0x00':
            return Shard.Cyprus1;
        case '0x01':
            return Shard.Cyprus2;
        case '0x02':
            return Shard.Cyprus3;
        case '0x10':
            return Shard.Paxos1;
        case '0x11':
            return Shard.Paxos2;
        case '0x12':
            return Shard.Paxos3;
        case '0x20':
            return Shard.Hydra1;
        case '0x21':
            return Shard.Hydra2;
        case '0x22':
            return Shard.Hydra3;
        default:
            throw new Error('Invalid shard');
    }
}
/**
 * Constant data that defines each shard within the network.
 *
 * @category Constants
 */
export const ShardData = [
    ...ZoneData,
    {
        name: 'Cyprus',
        nickname: 'cyprus',
        shard: 'region-0',
        context: 2,
        byte: '0x0',
    },
    {
        name: 'Paxos',
        nickname: 'paxos',
        shard: 'region-1',
        context: 2,
        byte: '0x1',
    },
    {
        name: 'Hydra',
        nickname: 'hydra',
        shard: 'region-2',
        context: 2,
        byte: '0x2',
    },
    {
        name: 'Prime',
        nickname: 'prime',
        shard: 'prime',
        context: 2,
        byte: '0x',
    },
];

export function toShard(shard: string): Shard {
    return shardFromBytes(
        ShardData.find((it) => it.name == shard || it.byte == shard || it.nickname == shard || it.shard == shard)
            ?.byte || '',
    );
}

export function fromShard(shard: Shard, key: 'name' | 'nickname' | 'shard' | 'byte'): string {
    return ShardData.find((it) => it.byte == shard)?.[key] || '';
}
