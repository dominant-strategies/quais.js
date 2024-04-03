import { hexlify } from "./data";
import * as Proto from "./ProtoBuf/proto_block";
function _encode(object) {
    const tx = Proto.block.ProtoTransaction.fromObject(object);
    const result = tx.serialize();
    return result;
}
export function encodeProto(object) {
    return hexlify(_encode(object));
}
//# sourceMappingURL=proto-encode.js.map