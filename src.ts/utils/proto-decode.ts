import { ProtoTransaction } from "../transaction/transaction";
import { ProtoWorkObject } from "../transaction/work-object";
import * as Proto from "./ProtoBuf/proto-block"

export function decodeProtoTransaction(bytes: Uint8Array): ProtoTransaction {
    const tx = Proto.block.ProtoTransaction.deserialize(bytes);
    return tx.toObject() as ProtoTransaction;
}

export function decodeProtoWorkObject(bytes: Uint8Array): ProtoWorkObject {
    const wo = Proto.block.ProtoWorkObject.deserialize(bytes);
    return wo.toObject() as ProtoWorkObject;
}