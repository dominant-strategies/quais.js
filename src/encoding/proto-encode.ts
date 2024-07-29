import { ProtoTransaction } from '../transaction/abstract-transaction.js';
import { ProtoWorkObject } from '../transaction/work-object.js';
import { hexlify } from '../utils/index.js';
import * as Proto from './protoc/proto_block.js';

/**
 * @category Encoding
 * @param {ProtoTransaction} protoTx - The signed constructed transaction
 * @returns {string} - The Protobuf encoded transaction
 */
export function encodeProtoTransaction(protoTx: ProtoTransaction): string {
    const tx = Proto.block.ProtoTransaction.fromObject(protoTx as any);
    return hexlify(tx.serialize());
}

/**
 * @category Encoding
 * @param {ProtoWorkObject} protoWo - The constructed WorkObject
 * @returns {string} - The Protobuf encoded WorkObject
 */
export function encodeProtoWorkObject(protoWo: ProtoWorkObject): string {
    const wo = Proto.block.ProtoWorkObject.fromObject(protoWo as any);
    return hexlify(wo.serialize());
}
