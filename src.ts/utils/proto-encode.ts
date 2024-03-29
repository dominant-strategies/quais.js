import { hexlify } from "./data";
import * as Proto from "./ProtoBuf/proto_block"

function _encode(object: any): Uint8Array {
    const tx = Proto.block.ProtoTransaction.fromObject(object);
    const result = tx.serialize();
    return result;
}

export function encodeProto(object: any): string{
    return hexlify(_encode(object));
}