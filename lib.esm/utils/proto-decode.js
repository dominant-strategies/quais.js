import * as Proto from "./ProtoBuf/proto_block";
function _decode(object) {
    const tx = Proto.block.ProtoTransaction.deserialize(object);
    const result = tx.toObject();
    return result;
}
export function decodeProto(object) {
    return _decode(object);
}
//# sourceMappingURL=proto-decode.js.map