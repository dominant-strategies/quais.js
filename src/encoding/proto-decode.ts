import { ProtoTransaction } from '../transaction/abstract-transaction.js';
import { ProtoWorkObject } from '../transaction/work-object.js';
import * as Proto from './protoc/proto_block.js';

/**
 * @category Encoding
 * @param {Uint8Array} bytes - Write variable description
 *
 * @returns {ProtoTransaction} Write return description
 * @todo Write documentation for this function.
 */
export function decodeProtoTransaction(bytes: Uint8Array): ProtoTransaction {
    const tx = Proto.block.ProtoTransaction.deserialize(bytes);
    const result = tx.toObject() as ProtoTransaction;
    if (result.to?.length == 0) {
        result.to = null;
    }
    return result;
}

/**
 * @category Encoding
 * @param {Uint8Array} bytes - Write variable description
 *
 * @returns {ProtoWorkObject} Write return description
 * @todo Write documentation for this function.
 */
export function decodeProtoWorkObject(bytes: Uint8Array): ProtoWorkObject {
    const wo = Proto.block.ProtoWorkObject.deserialize(bytes);
    return wo.toObject() as ProtoWorkObject;
}
