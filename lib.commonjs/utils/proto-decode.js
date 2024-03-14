"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeProto = void 0;
const tslib_1 = require("tslib");
const Proto = tslib_1.__importStar(require("./ProtoBuf/proto-block"));
function _decode(object) {
    const tx = Proto.block.ProtoTransaction.deserialize(object);
    const result = tx.toObject();
    return result;
}
function decodeProto(object) {
    return _decode(object);
}
exports.decodeProto = decodeProto;
//# sourceMappingURL=proto-decode.js.map