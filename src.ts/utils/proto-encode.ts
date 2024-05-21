import { ProtoTransaction } from '../transaction/abstract-transaction.js';
import { ProtoWorkObject } from '../transaction/work-object.js';
import { hexlify } from './index.js';
import * as Proto from './ProtoBuf/proto_block.js';

/**
 * @category Utils
 * @param {ProtoTransaction} protoTx - Write variable description
 *
 * @returns {string} Write return description
 * @todo Write documentation for this function.
 */
export function encodeProtoTransaction(protoTx: ProtoTransaction): string {
    const tx = Proto.block.ProtoTransaction.fromObject(protoTx as any);
    return hexlify(tx.serialize());
}

/**
 * @category Utils
 * @param {ProtoWorkObject} protoWo - Write variable description
 *
 * @returns {string} Write return description
 * @todo Write documentation for this function.
 */
export function encodeProtoWorkObject(protoWo: ProtoWorkObject): string {
    const wo = Proto.block.ProtoWorkObject.fromObject(protoWo as any);
    return hexlify(wo.serialize());
}
