import { hexlify } from "./data";
import * as Proto from "./ProtoBuf/proto_block";
export function encodeProtoTransaction(protoTx) {
    const tx = Proto.block.ProtoTransaction.fromObject(protoTx);
    return hexlify(tx.serialize());
}
export function encodeProtoWorkObject(protoWo) {
    const wo = Proto.block.ProtoWorkObject.fromObject(protoWo);
    return hexlify(wo.serialize());
}
//# sourceMappingURL=proto-encode.js.map