"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeProtoWorkObject = exports.encodeProtoTransaction = void 0;
const tslib_1 = require("tslib");
const data_1 = require("./data");
const Proto = tslib_1.__importStar(require("./ProtoBuf/proto_block"));
function encodeProtoTransaction(protoTx) {
    const tx = Proto.block.ProtoTransaction.fromObject(protoTx);
    return (0, data_1.hexlify)(tx.serialize());
}
exports.encodeProtoTransaction = encodeProtoTransaction;
function encodeProtoWorkObject(protoWo) {
    const wo = Proto.block.ProtoWorkObject.fromObject(protoWo);
    return (0, data_1.hexlify)(wo.serialize());
}
exports.encodeProtoWorkObject = encodeProtoWorkObject;
//# sourceMappingURL=proto-encode.js.map