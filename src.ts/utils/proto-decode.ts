import * as Proto from "./ProtoBuf/proto_block"

function _decode(object: any): any {
    const tx = Proto.block.ProtoTransaction.deserialize(object);
    const result = tx.toObject();
    return result;
}

export function decodeProto(object: Uint8Array): string{
    // console.log('Test decode')
    return _decode(object);
}