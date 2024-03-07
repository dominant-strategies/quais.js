"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeProto = void 0;
const tslib_1 = require("tslib");
const data_1 = require("./data");
const Proto = tslib_1.__importStar(require("./ProtoBuf/proto-block"));
function _encode(object) {
    const tx = Proto.block.ProtoTransaction.fromObject(object);
    const result = tx.serialize();
    return result;
}
function encodeProto(object) {
    return (0, data_1.hexlify)(_encode(object));
}
exports.encodeProto = encodeProto;
//# sourceMappingURL=proto-encode.js.map