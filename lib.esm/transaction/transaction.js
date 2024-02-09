import { getAddress } from "../address/index.js";
import { keccak256, Signature, SigningKey } from "../crypto/index.js";
import { concat, decodeRlp, encodeRlp, getBytes, getBigInt, getNumber, hexlify, assert, assertArgument, toBeArray, zeroPadValue } from "../utils/index.js";
import { accessListify } from "./accesslist.js";
import { recoverAddress } from "./address.js";
const BN_0 = BigInt(0);
// const BN_2 = BigInt(2);
// const BN_27 = BigInt(27)
// const BN_28 = BigInt(28)
// const BN_35 = BigInt(35);
const BN_MAX_UINT = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
function handleAddress(value) {
    if (value === "0x") {
        return null;
    }
    return getAddress(value);
}
function handleAccessList(value, param) {
    try {
        return accessListify(value);
    }
    catch (error) {
        assertArgument(false, error.message, param, value);
    }
}
function handleNumber(_value, param) {
    if (_value === "0x") {
        return 0;
    }
    return getNumber(_value, param);
}
function handleUint(_value, param) {
    if (_value === "0x") {
        return BN_0;
    }
    const value = getBigInt(_value, param);
    assertArgument(value <= BN_MAX_UINT, "value exceeds uint size", param, value);
    return value;
}
function formatNumber(_value, name) {
    const value = getBigInt(_value, "value");
    const result = toBeArray(value);
    assertArgument(result.length <= 32, `value too large`, `tx.${name}`, value);
    return result;
}
function formatAccessList(value) {
    return accessListify(value).map((set) => [set.address, set.storageKeys]);
}
function _parseSignature(tx, fields, serialize) {
    let yParity;
    try {
        yParity = handleNumber(fields[0], "yParity");
        if (yParity !== 0 && yParity !== 1) {
            throw new Error("bad yParity");
        }
    }
    catch (error) {
        assertArgument(false, "invalid yParity", "yParity", fields[0]);
    }
    const r = zeroPadValue(fields[1], 32);
    const s = zeroPadValue(fields[2], 32);
    const signature = Signature.from({ r, s, yParity });
    tx.signature = signature;
}
function _parse(data) {
    const fields = decodeRlp(getBytes(data).slice(1));
    assertArgument(Array.isArray(fields) && (fields.length === 9 || fields.length === 12), "invalid field count for transaction type: 2", "data", hexlify(data));
    const maxPriorityFeePerGas = handleUint(fields[2], "maxPriorityFeePerGas");
    const maxFeePerGas = handleUint(fields[3], "maxFeePerGas");
    const tx = {
        type: 0,
        chainId: handleUint(fields[0], "chainId"),
        nonce: handleNumber(fields[1], "nonce"),
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        maxFeePerGas: maxFeePerGas,
        gasLimit: handleUint(fields[4], "gasLimit"),
        to: handleAddress(fields[5]),
        value: handleUint(fields[6], "value"),
        data: hexlify(fields[7]),
        accessList: handleAccessList(fields[8], "accessList"),
    };
    // Unsigned EIP-1559 Transaction
    if (fields.length === 9) {
        return tx;
    }
    tx.hash = keccak256(data);
    _parseSignature(tx, fields.slice(9), _serialize);
    return tx;
}
function _parseStandardETx(data) {
    const fields = decodeRlp(getBytes(data).slice(1));
    assertArgument(Array.isArray(fields) && (fields.length === 8 || fields.length === 17), "invalid field count for transaction type: 2", "data", hexlify(data));
    const maxPriorityFeePerGas = handleUint(fields[2], "maxPriorityFeePerGas");
    const maxFeePerGas = handleUint(fields[3], "maxFeePerGas");
    const tx = {
        type: 2,
        chainId: handleUint(fields[0], "chainId"),
        nonce: handleNumber(fields[1], "nonce"),
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        maxFeePerGas: maxFeePerGas,
        gasLimit: handleUint(fields[4], "gasLimit"),
        to: handleAddress(fields[5]),
        value: handleUint(fields[6], "value"),
        data: hexlify(fields[7]),
        accessList: handleAccessList(fields[8], "accessList"),
        externalGasLimit: handleUint(fields[9], "externalGasLimit"),
        externalGasPrice: handleUint(fields[10], "externalGasPrice"),
        externalGasTip: handleUint(fields[11], "externalGasTip"),
        externalData: hexlify(fields[12]),
        externalAccessList: handleAccessList(fields[13], "externalAccessList")
    };
    fields;
    // Unsigned EIP-2930 Transaction
    if (fields.length === 8) {
        return tx;
    }
    tx.hash = keccak256(data);
    _parseSignature(tx, fields.slice(14), _serializeStandardETx);
    return tx;
}
function _serialize(tx, sig) {
    const fields = [
        formatNumber(tx.chainId || 0, "chainId"),
        formatNumber(tx.nonce || 0, "nonce"),
        formatNumber(tx.maxPriorityFeePerGas || 0, "maxPriorityFeePerGas"),
        formatNumber(tx.maxFeePerGas || 0, "maxFeePerGas"),
        formatNumber(tx.gasLimit || 0, "gasLimit"),
        ((tx.to != null) ? getAddress(tx.to) : "0x"),
        formatNumber(tx.value || 0, "value"),
        (tx.data || "0x"),
        (formatAccessList(tx.accessList || []))
    ];
    if (sig) {
        fields.push(formatNumber(sig.yParity, "yParity"));
        fields.push(toBeArray(sig.r));
        fields.push(toBeArray(sig.s));
    }
    return concat(["0x00", encodeRlp(fields)]);
}
function _serializeStandardETx(transaction, sig) {
    const fields = [
        formatNumber(transaction.chainId || 0, "chainId"),
        formatNumber(transaction.nonce || 0, "nonce"),
        formatNumber(transaction.maxPriorityFeePerGas || 0, "maxPriorityFeePerGas"),
        formatNumber(transaction.maxFeePerGas || 0, "maxFeePerGas"),
        formatNumber(transaction.gasLimit || 0, "gasLimit"),
        ((transaction.to != null) ? getAddress(transaction.to) : "0x"),
        formatNumber(transaction.value || 0, "value"),
        (transaction.data || "0x"),
        (formatAccessList(transaction.accessList || [])),
        formatNumber(transaction.externalGasLimit || 0, "externalGasLimit"),
        formatNumber(transaction.externalGasPrice || 0, "externalGasPrice"),
        formatNumber(transaction.externalGasTip || 0, "externalGasTip"),
        (transaction.externalData || "0x"),
        (formatAccessList(transaction.externalAccessList || [])),
    ];
    if (sig) {
        fields.push(formatNumber(sig.yParity, "recoveryParam"));
        fields.push(toBeArray(sig.r));
        fields.push(toBeArray(sig.s));
    }
    return concat(["0x02", encodeRlp(fields)]);
}
/**
 *  A **Transaction** describes an operation to be executed on
 *  Ethereum by an Externally Owned Account (EOA). It includes
 *  who (the [[to]] address), what (the [[data]]) and how much (the
 *  [[value]] in ether) the operation should entail.
 *
 *  @example:
 *    tx = new Transaction()
 *    //_result:
 *
 *    tx.data = "0x1234";
 *    //_result:
 */
export class Transaction {
    #type;
    #to;
    #data;
    #nonce;
    #gasLimit;
    #gasPrice;
    #maxPriorityFeePerGas;
    #maxFeePerGas;
    #value;
    #chainId;
    #sig;
    #accessList;
    #externalGasLimit;
    #externalGasTip;
    #externalGasPrice;
    #externalAccessList;
    #externalData;
    /**
     *  The transaction type.
     *
     *  If null, the type will be automatically inferred based on
     *  explicit properties.
     */
    get type() { return this.#type; }
    set type(value) {
        switch (value) {
            case null:
                this.#type = null;
                break;
            case 0:
            case "standard":
                this.#type = 0;
                break;
            // case 1: case "external":
            //     this.#type = 1;
            //     break;
            case 2:
            case "internalToExternal":
                this.#type = 2;
                break;
            default:
                assertArgument(false, "unsupported transaction type", "type", value);
        }
    }
    /**
     *  The name of the transaction type.
     */
    get typeName() {
        switch (this.type) {
            case 0: return "standard";
            case 1: return "external";
            case 2: return "internalToExternal";
        }
        return null;
    }
    /**
     *  The ``to`` address for the transaction or ``null`` if the
     *  transaction is an ``init`` transaction.
     */
    get to() { return this.#to; }
    set to(value) {
        this.#to = (value == null) ? null : getAddress(value);
    }
    /**
     *  The transaction nonce.
     */
    get nonce() { return this.#nonce; }
    set nonce(value) { this.#nonce = getNumber(value, "value"); }
    /**
     *  The gas limit.
     */
    get gasLimit() { return this.#gasLimit; }
    set gasLimit(value) { this.#gasLimit = getBigInt(value); }
    /**
     *  The gas price.
     *
     *  On legacy networks this defines the fee that will be paid. On
     *  EIP-1559 networks, this should be ``null``.
     */
    get gasPrice() {
        const value = this.#gasPrice;
        return value;
    }
    set gasPrice(value) {
        this.#gasPrice = (value == null) ? null : getBigInt(value, "gasPrice");
    }
    /**
     *  The maximum priority fee per unit of gas to pay. On legacy
     *  networks this should be ``null``.
     */
    get maxPriorityFeePerGas() {
        const value = this.#maxPriorityFeePerGas;
        if (value == null) {
            return null;
        }
        return value;
    }
    set maxPriorityFeePerGas(value) {
        this.#maxPriorityFeePerGas = (value == null) ? null : getBigInt(value, "maxPriorityFeePerGas");
    }
    /**
     *  The maximum total fee per unit of gas to pay. On legacy
     *  networks this should be ``null``.
     */
    get maxFeePerGas() {
        const value = this.#maxFeePerGas;
        if (value == null) {
            return null;
        }
        return value;
    }
    set maxFeePerGas(value) {
        this.#maxFeePerGas = (value == null) ? null : getBigInt(value, "maxFeePerGas");
    }
    /**
     *  The transaction data. For ``init`` transactions this is the
     *  deployment code.
     */
    get data() { return this.#data; }
    set data(value) { this.#data = hexlify(value); }
    /**
     *  The amount of ether to send in this transactions.
     */
    get value() { return this.#value; }
    set value(value) {
        this.#value = getBigInt(value, "value");
    }
    /**
     *  The chain ID this transaction is valid on.
     */
    get chainId() { return this.#chainId; }
    set chainId(value) { this.#chainId = getBigInt(value); }
    /**
     *  If signed, the signature for this transaction.
     */
    get signature() { return this.#sig || null; }
    set signature(value) {
        this.#sig = (value == null) ? null : Signature.from(value);
    }
    /**
     *  The access list.
     *
     *  An access list permits discounted (but pre-paid) access to
     *  bytecode and state variable access within contract execution.
     */
    get accessList() {
        const value = this.#accessList || null;
        if (value == null) {
            return null;
        }
        return value;
    }
    set accessList(value) {
        this.#accessList = (value == null) ? null : accessListify(value);
    }
    /**
     *  The gas limit.
     */
    get externalGasLimit() { return this.#externalGasLimit; }
    set externalGasLimit(value) { this.#externalGasLimit = getBigInt(value); }
    /**
     *  The maximum priority fee per unit of gas to pay. On legacy
     *  networks this should be ``null``.
     */
    get externalGasTip() {
        const value = this.#externalGasTip;
        if (value == null) {
            return null;
        }
        return value;
    }
    set externalGasTip(value) {
        this.#externalGasTip = (value == null) ? null : getBigInt(value, "externalGasTip");
    }
    /**
     *  The maximum total fee per unit of gas to pay. On legacy
     *  networks this should be ``null``.
     */
    get externalGasPrice() {
        const value = this.#externalGasPrice;
        if (value == null) {
            return null;
        }
        return value;
    }
    set externalGasPrice(value) {
        this.#externalGasPrice = (value == null) ? null : getBigInt(value, "externalGasPrice");
    }
    /**
     *  The transaction externalData. For ``init`` transactions this is the
     *  deployment code.
     */
    get externalData() { return this.#externalData; }
    set externalData(value) { this.#externalData = hexlify(value); }
    /**
     *  The external access list.
     *
     *  An access list permits discounted (but pre-paid) access to
     *  bytecode and state variable access within contract execution.
     */
    get externalAccessList() {
        const value = this.#externalAccessList || null;
        if (value == null) {
            return null;
        }
        return value;
    }
    set externalAccessList(value) {
        this.#externalAccessList = (value == null) ? null : accessListify(value);
    }
    /**
     *  Creates a new Transaction with default values.
     */
    constructor() {
        this.#type = null;
        this.#to = null;
        this.#nonce = 0;
        this.#gasLimit = BigInt(0);
        this.#gasPrice = null;
        this.#maxPriorityFeePerGas = null;
        this.#maxFeePerGas = null;
        this.#data = "0x";
        this.#value = BigInt(0);
        this.#chainId = BigInt(0);
        this.#sig = null;
        this.#accessList = null;
        this.#externalGasLimit = BigInt(0);
        this.#externalGasTip = null;
        this.#externalGasPrice = null;
        this.#externalData = "0x";
        this.#externalAccessList = null;
    }
    /**
     *  The transaction hash, if signed. Otherwise, ``null``.
     */
    get hash() {
        if (this.signature == null) {
            return null;
        }
        return keccak256(this.serialized);
    }
    /**
     *  The pre-image hash of this transaction.
     *
     *  This is the digest that a [[Signer]] must sign to authorize
     *  this transaction.
     */
    get unsignedHash() {
        return keccak256(this.unsignedSerialized);
    }
    /**
     *  The sending address, if signed. Otherwise, ``null``.
     */
    get from() {
        if (this.signature == null) {
            return null;
        }
        return recoverAddress(this.unsignedHash, this.signature);
    }
    /**
     *  The public key of the sender, if signed. Otherwise, ``null``.
     */
    get fromPublicKey() {
        if (this.signature == null) {
            return null;
        }
        return SigningKey.recoverPublicKey(this.unsignedHash, this.signature);
    }
    /**
     *  Returns true if signed.
     *
     *  This provides a Type Guard that properties requiring a signed
     *  transaction are non-null.
     */
    isSigned() {
        //isSigned(): this is SignedTransaction {
        return this.signature != null;
    }
    /**
     *  The serialized transaction.
     *
     *  This throws if the transaction is unsigned. For the pre-image,
     *  use [[unsignedSerialized]].
     */
    get serialized() {
        assert(this.signature != null, "cannot serialize unsigned transaction; maybe you meant .unsignedSerialized", "UNSUPPORTED_OPERATION", { operation: ".serialized" });
        switch (this.inferType()) {
            case 0:
                return _serialize(this, this.signature);
            // case 1:
            //     return _serializeEip2930(this, this.signature);
            case 2:
                return _serializeStandardETx(this, this.signature);
        }
        assert(false, "unsupported transaction type", "UNSUPPORTED_OPERATION", { operation: ".serialized" });
    }
    /**
     *  The transaction pre-image.
     *
     *  The hash of this is the digest which needs to be signed to
     *  authorize this transaction.
     */
    get unsignedSerialized() {
        switch (this.inferType()) {
            case 0:
                return _serialize(this);
            // case 1:
            //     return _serializeEip2930(this);
            case 2:
                return _serializeStandardETx(this);
        }
        assert(false, "unsupported transaction type", "UNSUPPORTED_OPERATION", { operation: ".unsignedSerialized" });
    }
    /**
     *  Return the most "likely" type; currently the highest
     *  supported transaction type.
     */
    inferType() {
        return (this.inferTypes().pop());
    }
    /**
     *  Validates the explicit properties and returns a list of compatible
     *  transaction types.
     */
    inferTypes() {
        // Checks that there are no conflicting properties set
        // const hasGasPrice = this.gasPrice != null;
        // const hasFee = (this.maxFeePerGas != null || this.maxPriorityFeePerGas != null);
        const hasExternal = (this.externalGasLimit != null || this.externalGasTip != null || this.externalGasPrice != null || this.externalData != null || this.externalAccessList != null);
        // const hasAccessList = (this.accessList != null);
        //if (hasGasPrice && hasFee) {
        //    throw new Error("transaction cannot have gasPrice and maxFeePerGas");
        //}
        if (this.maxFeePerGas != null && this.maxPriorityFeePerGas != null) {
            assert(this.maxFeePerGas >= this.maxPriorityFeePerGas, "priorityFee cannot be more than maxFee", "BAD_DATA", { value: this });
        }
        //if (this.type === 2 && hasGasPrice) {
        //    throw new Error("eip-1559 transaction cannot have gasPrice");
        //}
        assert(hasExternal || (this.type !== 0 && this.type !== 1), "transaction type cannot have externalGasLimit, externalGasTip, externalGasPrice, externalData, or externalAccessList", "BAD_DATA", { value: this });
        const types = [];
        // Explicit type
        if (this.type != null) {
            types.push(this.type);
        }
        else {
            if (hasExternal) {
                types.push(2);
            }
            else {
                types.push(0);
            }
        }
        types.sort();
        return types;
    }
    /**
     *  Create a copy of this transaciton.
     */
    clone() {
        return Transaction.from(this);
    }
    /**
     *  Return a JSON-friendly object.
     */
    toJSON() {
        const s = (v) => {
            if (v == null) {
                return null;
            }
            return v.toString();
        };
        return {
            type: this.type,
            to: this.to,
            //            from: this.from,
            data: this.data,
            nonce: this.nonce,
            gasLimit: s(this.gasLimit),
            gasPrice: s(this.gasPrice),
            maxPriorityFeePerGas: s(this.maxPriorityFeePerGas),
            maxFeePerGas: s(this.maxFeePerGas),
            value: s(this.value),
            chainId: s(this.chainId),
            sig: this.signature ? this.signature.toJSON() : null,
            accessList: this.accessList,
            externalGasLimit: s(this.externalGasLimit),
            externalGasTip: s(this.externalGasTip),
            externalGasPrice: s(this.externalGasPrice),
            externalData: this.externalData,
            externalAccessList: this.externalAccessList,
        };
    }
    /**
     *  Create a **Transaction** from a serialized transaction or a
     *  Transaction-like object.
     */
    static from(tx) {
        if (tx == null) {
            return new Transaction();
        }
        if (typeof (tx) === "string") {
            const payload = getBytes(tx);
            if (payload[0] >= 0x7f) { // @TODO: > vs >= ??
                return Transaction.from(_parse(payload));
            }
            switch (payload[0]) {
                case 0: return Transaction.from(_parse(payload));
                case 2: return Transaction.from(_parseStandardETx(payload));
            }
            assert(false, "unsupported transaction type", "UNSUPPORTED_OPERATION", { operation: "from" });
        }
        const result = new Transaction();
        if (tx.type != null) {
            result.type = tx.type;
        }
        if (tx.to != null) {
            result.to = tx.to;
        }
        if (tx.nonce != null) {
            result.nonce = tx.nonce;
        }
        if (tx.gasLimit != null) {
            result.gasLimit = tx.gasLimit;
        }
        if (tx.maxPriorityFeePerGas != null) {
            result.maxPriorityFeePerGas = tx.maxPriorityFeePerGas;
        }
        if (tx.maxFeePerGas != null) {
            result.maxFeePerGas = tx.maxFeePerGas;
        }
        if (tx.data != null) {
            result.data = tx.data;
        }
        if (tx.value != null) {
            result.value = tx.value;
        }
        if (tx.chainId != null) {
            result.chainId = tx.chainId;
        }
        if (tx.signature != null) {
            result.signature = Signature.from(tx.signature);
        }
        if (tx.accessList != null) {
            result.accessList = tx.accessList;
        }
        if (tx.externalGasLimit != null) {
            result.externalGasLimit = tx.externalGasLimit;
        }
        if (tx.externalGasPrice != null) {
            result.externalGasPrice = tx.externalGasPrice;
        }
        if (tx.externalGasTip != null) {
            result.externalGasTip = tx.externalGasTip;
        }
        if (tx.externalData != null) {
            result.externalData = tx.externalData;
        }
        if (tx.externalAccessList != null) {
            result.externalAccessList = tx.externalAccessList;
        }
        if (tx.hash != null) {
            assertArgument(result.isSigned(), "unsigned transaction cannot define hash", "tx", tx);
            assertArgument(result.hash === tx.hash, "hash mismatch", "tx", tx);
        }
        if (tx.from != null) {
            assertArgument(result.isSigned(), "unsigned transaction cannot define from", "tx", tx);
            assertArgument(result.from.toLowerCase() === (tx.from || "").toLowerCase(), "from mismatch", "tx", tx);
        }
        return result;
    }
}
//# sourceMappingURL=transaction.js.map