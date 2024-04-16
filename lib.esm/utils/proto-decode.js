import * as Proto from "./ProtoBuf/proto_block";
export function decodeProtoTransaction(bytes) {
    const tx = Proto.block.ProtoTransaction.deserialize(bytes);
    return tx.toObject();
}
export function decodeProtoWorkObject(bytes) {
    const wo = Proto.block.ProtoWorkObject.deserialize(bytes);
    return wo.toObject();
}
//# sourceMappingURL=proto-decode.js.map