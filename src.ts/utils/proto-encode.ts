import { hexlify } from "./data";
import * as Proto from "./ProtoBuf/proto-block"

export function encodeProtoTransaction(object: any): string {
    const tx = Proto.block.ProtoWorkObject.fromObject(object);
    return hexlify(tx.serialize());
}

export function encodeProtoWorkObject(object: any): string {
    console.log("pre encoded work object", object);
    const wo = Proto.block.ProtoWorkObject.fromObject(object);
    return hexlify(wo.serialize());
}