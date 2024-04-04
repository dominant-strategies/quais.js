import { ProtoTransaction } from "../transaction/transaction";
import { ProtoWorkObject } from "../transaction/work-object";
import { hexlify } from "./data";
import * as Proto from "./ProtoBuf/proto-block"

export function encodeProtoTransaction(protoTx: ProtoTransaction): string {
    const tx = Proto.block.ProtoTransaction.fromObject(protoTx as any);
    return hexlify(tx.serialize());
}

export function encodeProtoWorkObject(protoWo: ProtoWorkObject): string {
    const wo = Proto.block.ProtoWorkObject.fromObject(protoWo as any);
    return hexlify(wo.serialize());
}

