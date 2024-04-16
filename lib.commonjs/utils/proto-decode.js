"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeProtoWorkObject = exports.decodeProtoTransaction = void 0;
const tslib_1 = require("tslib");
const Proto = tslib_1.__importStar(require("./ProtoBuf/proto_block"));
function decodeProtoTransaction(bytes) {
    const tx = Proto.block.ProtoTransaction.deserialize(bytes);
    return tx.toObject();
}
exports.decodeProtoTransaction = decodeProtoTransaction;
function decodeProtoWorkObject(bytes) {
    const wo = Proto.block.ProtoWorkObject.deserialize(bytes);
    return wo.toObject();
}
exports.decodeProtoWorkObject = decodeProtoWorkObject;
//# sourceMappingURL=proto-decode.js.map