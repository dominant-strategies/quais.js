import * as Proto from "./ProtoBuf/proto-block"

export function decodeProtoTransaction(object: any): any {
    const tx = Proto.block.ProtoTransaction.deserialize(object);
    return tx.toObject();
}

export function decodeProtoWorkObject(object: any): any {
    const wo = Proto.block.ProtoWorkObject.deserialize(object);
    return wo.toObject();
}