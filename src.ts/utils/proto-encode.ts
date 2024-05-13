import { ProtoTransaction } from "../transaction/abstract-transaction.js";
import { ProtoWorkObject } from "../transaction/work-object.js";
import { hexlify } from "./index.js";
import * as Proto from "./ProtoBuf/proto_block.js"

/**
 *  @TODO write documentation for this function.
 * 
 *  @param {ProtoTransaction} protoTx - write variable description
 *  @returns {string} write return description
 * 
 *  @category Utils
 */
export function encodeProtoTransaction(protoTx: ProtoTransaction): string {
    const tx = Proto.block.ProtoTransaction.fromObject(protoTx as any);
    return hexlify(tx.serialize());
}

/**
 *  @TODO write documentation for this function.
 * 
 *  @param {ProtoWorkObject} protoWo - write variable description
 *  @returns {string} write return description
 * 
 *  @category Utils
 */
export function encodeProtoWorkObject(protoWo: ProtoWorkObject): string {
    const wo = Proto.block.ProtoWorkObject.fromObject(protoWo as any);
    return hexlify(wo.serialize());
}

