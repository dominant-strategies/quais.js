/**
 * A zone is the lowest level shard within the Quai network hierarchy. Zones are the only shards in the network that
 * accept user transactions. The value is a hexadecimal string representing the encoded value of the zone. Read more
 * [here](https://github.com/quai-network/qips/blob/master/qip-0002.md).
 *
 * @category Constants
 */
export enum Zone {
    Cyprus1 = '0x00',
    Cyprus2 = '0x01',
    Cyprus3 = '0x02',
    Paxos1 = '0x10',
    Paxos2 = '0x11',
    Paxos3 = '0x12',
    Hydra1 = '0x20',
    Hydra2 = '0x21',
    Hydra3 = '0x22',
}

export enum Ledger {
    Quai = 0,
    Qi = 1,
}

function zoneFromBytes(zone: string): Zone {
    switch (zone) {
        case '0x00':
            return Zone.Cyprus1;
        case '0x01':
            return Zone.Cyprus2;
        case '0x02':
            return Zone.Cyprus3;
        case '0x10':
            return Zone.Paxos1;
        case '0x11':
            return Zone.Paxos2;
        case '0x12':
            return Zone.Paxos3;
        case '0x20':
            return Zone.Hydra1;
        case '0x21':
            return Zone.Hydra2;
        case '0x22':
            return Zone.Hydra3;
        default:
            throw new Error(`Invalid zone: ${zone}`);
    }
}

export const ZoneData = [
    {
        name: 'Cyprus One',
        nickname: 'cyprus1',
        shard: 'zone-0-0',
        context: 2,
        byte: '0x00', //0000 0000 region-0 zone-0
    },
    {
        name: 'Cyprus Two',
        nickname: 'cyprus2',
        shard: 'zone-0-1',
        context: 2,
        byte: '0x01', // 0000 0001 region-0 zone-1
    },
    {
        name: 'Cyprus Three',
        nickname: 'cyprus3',
        shard: 'zone-0-2',
        context: 2,
        byte: '0x02', // 0000 0010 region-0 zone-2
    },
    {
        name: 'Paxos One',
        nickname: 'paxos1',
        shard: 'zone-1-0',
        context: 2,
        byte: '0x10', // 0001 0000 region-1 zone-0
    },
    {
        name: 'Paxos Two',
        nickname: 'paxos2',
        shard: 'zone-1-1',
        context: 2,
        byte: '0x11', // 0001 0001 region-1 zone-1
    },
    {
        name: 'Paxos Three',
        nickname: 'paxos3',
        shard: 'zone-1-2',
        context: 2,
        byte: '0x12', // 0001 0010 region-1 zone-2
    },
    {
        name: 'Hydra One',
        nickname: 'hydra1',
        shard: 'zone-2-0',
        context: 2,
        byte: '0x20', // 0010 0000 region-2 zone-0
    },
    {
        name: 'Hydra Two',
        nickname: 'hydra2',
        shard: 'zone-2-1',
        context: 2,
        byte: '0x21', // 0010 0001 region-2 zone-1
    },
    {
        name: 'Hydra Three',
        nickname: 'hydra3',
        shard: 'zone-2-2',
        context: 2,
        byte: '0x22', // 0010 0010 region-2 zone-2
    },
];

export function toZone(shard: string): Zone {
    return zoneFromBytes(
        ZoneData.find((it) => it.name == shard || it.byte == shard || it.nickname == shard || it.shard == shard)
            ?.byte || '',
    );
}
export function fromZone(zone: Zone, key: 'name' | 'nickname' | 'shard' | 'byte'): string {
    return ZoneData.find((it) => it.byte == zone)?.[key] || '';
}
