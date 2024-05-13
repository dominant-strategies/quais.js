import { ProtoTransaction } from "../transaction/abstract-transaction.js";
import { ProtoWorkObject } from "../transaction/work-object.js";
import * as Proto from "./ProtoBuf/proto_block.js"

/**
 *  @TODO write documentation for this function.
 * 
 *  @param {Uint8Array} bytes - write variable description
 *  @returns {ProtoTransaction} write return description
 * 
 *  @category Utils
 */
export function decodeProtoTransaction(bytes: Uint8Array): ProtoTransaction {
    const tx = Proto.block.ProtoTransaction.deserialize(bytes);
    const result = tx.toObject() as ProtoTransaction;
    if (result.to?.length == 0) {
        result.to = null;
    }
    return result
}

/**
 *  @TODO write documentation for this function.
 * 
 *  @param {Uint8Array} bytes - write variable description
 *  @returns {ProtoWorkObject} write return description
 * 
 *  @category Utils
 */
export function decodeProtoWorkObject(bytes: Uint8Array): ProtoWorkObject {
    const wo = Proto.block.ProtoWorkObject.deserialize(bytes);
    return wo.toObject() as ProtoWorkObject;
}