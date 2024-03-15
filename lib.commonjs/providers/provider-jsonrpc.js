"use strict";
/**
 *  One of the most common ways to interact with the blockchain is
 *  by a node running a JSON-RPC interface which can be connected to,
 *  based on the transport, using:
 *
 *  - HTTP or HTTPS - [[JsonRpcProvider]]
 *  - WebSocket - [[WebSocketProvider]]
 *  - IPC - [[IpcSocketProvider]]
 *
 * @_section: api/providers/jsonrpc:JSON-RPC Provider  [about-jsonrpcProvider]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonRpcProvider = exports.JsonRpcApiProvider = exports.JsonRpcSigner = void 0;
// @TODO:
// - Add the batching API
// https://playground.open-rpc.org/?schemaUrl=https://raw.githubusercontent.com/ethereum/eth1.0-apis/assembled-spec/openrpc.json&uiSchema%5BappBar%5D%5Bui:splitView%5D=true&uiSchema%5BappBar%5D%5Bui:input%5D=false&uiSchema%5BappBar%5D%5Bui:examplesDropdown%5D=false
const index_js_1 = require("../abi/index.js");
const index_js_2 = require("../address/index.js");
const index_js_3 = require("../hash/index.js");
const index_js_4 = require("../transaction/index.js");
const index_js_5 = require("../utils/index.js");
const abstract_provider_js_1 = require("./abstract-provider.js");
const abstract_signer_js_1 = require("./abstract-signer.js");
const network_js_1 = require("./network.js");
const subscriber_filterid_js_1 = require("./subscriber-filterid.js");
const Primitive = "bigint,boolean,function,number,string,symbol".split(/,/g);
//const Methods = "getAddress,then".split(/,/g);
function deepCopy(value) {
    if (value == null || Primitive.indexOf(typeof (value)) >= 0) {
        return value;
    }
    // Keep any Addressable
    if (typeof (value.getAddress) === "function") {
        return value;
    }
    if (Array.isArray(value)) {
        return (value.map(deepCopy));
    }
    if (typeof (value) === "object") {
        return Object.keys(value).reduce((accum, key) => {
            accum[key] = value[key];
            return accum;
        }, {});
    }
    throw new Error(`should not happen: ${value} (${typeof (value)})`);
}
function stall(duration) {
    return new Promise((resolve) => { setTimeout(resolve, duration); });
}
function getLowerCase(value) {
    if (value) {
        return value.toLowerCase();
    }
    return value;
}
const defaultOptions = {
    staticNetwork: null,
    batchStallTime: 10,
    batchMaxSize: (1 << 20),
    batchMaxCount: 100,
    cacheTimeout: 250
};
// @TODO: Unchecked Signers
class JsonRpcSigner extends abstract_signer_js_1.AbstractSigner {
    address;
    constructor(provider, address) {
        super(provider);
        address = (0, index_js_2.getAddress)(address);
        (0, index_js_5.defineProperties)(this, { address });
    }
    connect(provider) {
        (0, index_js_5.assert)(false, "cannot reconnect JsonRpcSigner", "UNSUPPORTED_OPERATION", {
            operation: "signer.connect"
        });
    }
    async getAddress() {
        return this.address;
    }
    // JSON-RPC will automatially fill in nonce, etc. so we just check from
    async populateTransaction(tx) {
        return await this.populateCall(tx);
    }
    // Returns just the hash of the transaction after sent, which is what
    // the bare JSON-RPC API does;
    async sendUncheckedTransaction(_tx) {
        const tx = deepCopy(_tx);
        const promises = [];
        // Make sure the from matches the sender
        if (tx.from) {
            const _from = tx.from;
            promises.push((async () => {
                const from = await (0, index_js_2.resolveAddress)(_from, this.provider);
                (0, index_js_5.assertArgument)(from != null && from.toLowerCase() === this.address.toLowerCase(), "from address mismatch", "transaction", _tx);
                tx.from = from;
            })());
        }
        else {
            tx.from = this.address;
        }
        // The JSON-RPC for quai_sendTransaction uses 90000 gas; if the user
        // wishes to use this, it is easy to specify explicitly, otherwise
        // we look it up for them.
        if (tx.gasLimit == null) {
            promises.push((async () => {
                tx.gasLimit = await this.provider.estimateGas({ ...tx, from: this.address });
            })());
        }
        // The address may be an ENS name or Addressable
        if (tx.to != null) {
            const _to = tx.to;
            promises.push((async () => {
                tx.to = await (0, index_js_2.resolveAddress)(_to, this.provider);
            })());
        }
        // Wait until all of our properties are filled in
        if (promises.length) {
            await Promise.all(promises);
        }
        const hexTx = this.provider.getRpcTransaction(tx);
        return this.provider.send("quai_sendTransaction", [hexTx]);
    }
    async sendTransaction(tx) {
        // This cannot be mined any earlier than any recent block
        const shard = await this.shardFromAddress(tx.from);
        const blockNumber = await this.provider.getBlockNumber(shard);
        // Send the transaction
        const hash = await this.sendUncheckedTransaction(tx);
        // Unfortunately, JSON-RPC only provides and opaque transaction hash
        // for a response, and we need the actual transaction, so we poll
        // for it; it should show up very quickly
        return await (new Promise((resolve, reject) => {
            const timeouts = [1000, 100];
            let invalids = 0;
            const checkTx = async () => {
                try {
                    // Try getting the transaction
                    const tx = await this.provider.getTransaction(hash);
                    if (tx != null) {
                        resolve(tx.replaceableTransaction(blockNumber));
                        return;
                    }
                }
                catch (error) {
                    // If we were cancelled: stop polling.
                    // If the data is bad: the node returns bad transactions
                    // If the network changed: calling again will also fail
                    // If unsupported: likely destroyed
                    if ((0, index_js_5.isError)(error, "CANCELLED") || (0, index_js_5.isError)(error, "BAD_DATA") ||
                        (0, index_js_5.isError)(error, "NETWORK_ERROR" || (0, index_js_5.isError)(error, "UNSUPPORTED_OPERATION"))) {
                        if (error.info == null) {
                            error.info = {};
                        }
                        error.info.sendTransactionHash = hash;
                        reject(error);
                        return;
                    }
                    // Stop-gap for misbehaving backends; see #4513
                    if ((0, index_js_5.isError)(error, "INVALID_ARGUMENT")) {
                        invalids++;
                        if (error.info == null) {
                            error.info = {};
                        }
                        error.info.sendTransactionHash = hash;
                        if (invalids > 10) {
                            reject(error);
                            return;
                        }
                    }
                    // Notify anyone that cares; but we will try again, since
                    // it is likely an intermittent service error
                    this.provider.emit("error", (0, index_js_5.makeError)("failed to fetch transation after sending (will try again)", "UNKNOWN_ERROR", { error }));
                }
                // Wait another 4 seconds
                this.provider._setTimeout(() => { checkTx(); }, timeouts.pop() || 4000);
            };
            checkTx();
        }));
    }
    async signTransaction(_tx) {
        const tx = deepCopy(_tx);
        // Make sure the from matches the sender
        if (tx.from) {
            const from = await (0, index_js_2.resolveAddress)(tx.from, this.provider);
            (0, index_js_5.assertArgument)(from != null && from.toLowerCase() === this.address.toLowerCase(), "from address mismatch", "transaction", _tx);
            tx.from = from;
        }
        else {
            tx.from = this.address;
        }
        const hexTx = this.provider.getRpcTransaction(tx);
        return await this.provider.send("quai_signTransaction", [hexTx]);
    }
    async signMessage(_message) {
        const message = ((typeof (_message) === "string") ? (0, index_js_5.toUtf8Bytes)(_message) : _message);
        return await this.provider.send("personal_sign", [
            (0, index_js_5.hexlify)(message), this.address.toLowerCase()
        ]);
    }
    async signTypedData(domain, types, _value) {
        const value = deepCopy(_value);
        // Populate any ENS names (in-place)
        const populated = await index_js_3.TypedDataEncoder.resolveNames(domain, types, value, async (value) => {
            const address = await (0, index_js_2.resolveAddress)(value);
            (0, index_js_5.assertArgument)(address != null, "TypedData does not support null address", "value", value);
            return address;
        });
        return await this.provider.send("quai_signTypedData_v4", [
            this.address.toLowerCase(),
            JSON.stringify(index_js_3.TypedDataEncoder.getPayload(populated.domain, types, populated.value))
        ]);
    }
    async unlock(password) {
        return this.provider.send("personal_unlockAccount", [
            this.address.toLowerCase(), password, null
        ]);
    }
    // https://github.com/ethereum/wiki/wiki/JSON-RPC#quai_sign
    async _legacySignMessage(_message) {
        const message = ((typeof (_message) === "string") ? (0, index_js_5.toUtf8Bytes)(_message) : _message);
        return await this.provider.send("quai_sign", [
            this.address.toLowerCase(), (0, index_js_5.hexlify)(message)
        ]);
    }
}
exports.JsonRpcSigner = JsonRpcSigner;
/**
 *  The JsonRpcApiProvider is an abstract class and **MUST** be
 *  sub-classed.
 *
 *  It provides the base for all JSON-RPC-based Provider interaction.
 *
 *  Sub-classing Notes:
 *  - a sub-class MUST override _send
 *  - a sub-class MUST call the `_start()` method once connected
 */
class JsonRpcApiProvider extends abstract_provider_js_1.AbstractProvider {
    #options;
    // The next ID to use for the JSON-RPC ID field
    #nextId;
    // Payloads are queued and triggered in batches using the drainTimer
    #payloads;
    #drainTimer;
    #notReady;
    #network;
    #pendingDetectNetwork;
    initPromise;
    #scheduleDrain() {
        if (this.#drainTimer) {
            return;
        }
        // If we aren't using batching, no harm in sending it immediately
        const stallTime = (this._getOption("batchMaxCount") === 1) ? 0 : this._getOption("batchStallTime");
        this.#drainTimer = setTimeout(() => {
            this.#drainTimer = null;
            const payloads = this.#payloads;
            this.#payloads = [];
            while (payloads.length) {
                // Create payload batches that satisfy our batch constraints
                const batch = [(payloads.shift())];
                while (payloads.length) {
                    if (batch.length === this.#options.batchMaxCount) {
                        break;
                    }
                    batch.push((payloads.shift()));
                    const bytes = JSON.stringify(batch.map((p) => p.payload));
                    if (bytes.length > this.#options.batchMaxSize) {
                        payloads.unshift((batch.pop()));
                        break;
                    }
                }
                // Process the result to each payload
                (async () => {
                    const payloadMap = new Map();
                    for (let i = 0; i < batch.length; i++) {
                        if (!payloadMap.has(batch[i].shard)) {
                            if (batch[i].payload != null) {
                                payloadMap.set(batch[i].shard, [batch[i].payload]);
                            }
                            ;
                        }
                        else {
                            payloadMap.get(batch[i].shard)?.push(batch[i].payload);
                        }
                    }
                    let rawResult = [];
                    await Promise.all(Array.from(payloadMap).map(async ([key, value]) => {
                        const payload = value.length === 1 ? value[0] : value;
                        const shard = key;
                        this.emit("debug", { action: "sendRpcPayload", payload });
                        rawResult.push(await this._send(payload, shard));
                        this.emit("debug", { action: "receiveRpcResult", payload });
                    }));
                    const result = rawResult.flat();
                    try {
                        // Process results in batch order
                        for (const { resolve, reject, payload } of batch) {
                            if (this.destroyed) {
                                reject((0, index_js_5.makeError)("provider destroyed; cancelled request", "UNSUPPORTED_OPERATION", { operation: payload.method }));
                                continue;
                            }
                            // Find the matching result
                            const resp = result.filter((r) => (r.id === payload.id))[0];
                            // No result; the node failed us in unexpected ways
                            if (resp == null) {
                                const error = (0, index_js_5.makeError)("missing response for request", "BAD_DATA", {
                                    value: result, info: { payload }
                                });
                                this.emit("error", error);
                                reject(error);
                                continue;
                            }
                            // The response is an error
                            if ("error" in resp) {
                                reject(this.getRpcError(payload, resp));
                                continue;
                            }
                            // All good; send the result
                            resolve(resp.result);
                        }
                    }
                    catch (error) {
                        this.emit("debug", { action: "receiveRpcError", error });
                        for (const { reject } of batch) {
                            // @TODO: augment the error with the payload
                            reject(error);
                        }
                    }
                })();
            }
        }, stallTime);
    }
    constructor(network, options) {
        super(network, options);
        this.#nextId = 1;
        this.#options = Object.assign({}, defaultOptions, options || {});
        this.#payloads = [];
        this.#drainTimer = null;
        this.#network = null;
        this.#pendingDetectNetwork = null;
        {
            let resolve = null;
            const promise = new Promise((_resolve) => {
                resolve = _resolve;
            });
            this.#notReady = { promise, resolve };
        }
        const staticNetwork = this._getOption("staticNetwork");
        if (typeof (staticNetwork) === "boolean") {
            (0, index_js_5.assertArgument)(!staticNetwork || network !== "any", "staticNetwork cannot be used on special network 'any'", "options", options);
            if (staticNetwork && network != null) {
                this.#network = network_js_1.Network.from(network);
            }
        }
        else if (staticNetwork) {
            // Make sure any static network is compatbile with the provided netwrok
            (0, index_js_5.assertArgument)(network == null || staticNetwork.matches(network), "staticNetwork MUST match network object", "options", options);
            this.#network = staticNetwork;
        }
    }
    /**
     *  Returns the value associated with the option %%key%%.
     *
     *  Sub-classes can use this to inquire about configuration options.
     */
    _getOption(key) {
        return this.#options[key];
    }
    /**
     *  Gets the [[Network]] this provider has committed to. On each call, the network
     *  is detected, and if it has changed, the call will reject.
     */
    get _network() {
        (0, index_js_5.assert)(this.#network, "network is not available yet", "NETWORK_ERROR");
        return this.#network;
    }
    /**
     *  Resolves to the non-normalized value by performing %%req%%.
     *
     *  Sub-classes may override this to modify behavior of actions,
     *  and should generally call ``super._perform`` as a fallback.
     */
    async _perform(req) {
        // Legacy networks do not like the type field being passed along (which
        // is fair), so we delete type if it is 0 and a non-EIP-1559 network
        await this.initPromise;
        if (req.method === "call" || req.method === "estimateGas") {
            let tx = req.transaction;
            if (tx && tx.type != null && (0, index_js_5.getBigInt)(tx.type)) {
                // If there are no EIP-1559 properties, it might be non-EIP-a559
                if (tx.maxFeePerGas == null && tx.maxPriorityFeePerGas == null) {
                    const feeData = await this.getFeeData(req.shard);
                    if (feeData.maxFeePerGas == null && feeData.maxPriorityFeePerGas == null) {
                        // Network doesn't know about EIP-1559 (and hence type)
                        req = Object.assign({}, req, {
                            transaction: Object.assign({}, tx, { type: undefined })
                        });
                    }
                }
            }
        }
        const request = this.getRpcRequest(req);
        if (request != null) {
            return await this.send(request.method, request.args, req.shard);
        }
        return super._perform(req);
    }
    /**
     *  Sub-classes may override this; it detects the *actual* network that
     *  we are **currently** connected to.
     *
     *  Keep in mind that [[send]] may only be used once [[ready]], otherwise the
     *  _send primitive must be used instead.
     */
    async _detectNetwork() {
        const network = this._getOption("staticNetwork");
        if (network) {
            if (network === true) {
                if (this.#network) {
                    return this.#network;
                }
            }
            else {
                return network;
            }
        }
        if (this.#pendingDetectNetwork) {
            return await this.#pendingDetectNetwork;
        }
        // If we are ready, use ``send``, which enabled requests to be batched
        if (this.ready) {
            this.#pendingDetectNetwork = (async () => {
                try {
                    const result = network_js_1.Network.from((0, index_js_5.getBigInt)(await this.send("quai_chainId", [])));
                    this.#pendingDetectNetwork = null;
                    return result;
                }
                catch (error) {
                    this.#pendingDetectNetwork = null;
                    throw error;
                }
            })();
            return await this.#pendingDetectNetwork;
        }
        // We are not ready yet; use the primitive _send
        this.#pendingDetectNetwork = (async () => {
            const payload = {
                id: this.#nextId++, method: "quai_chainId", params: [], jsonrpc: "2.0"
            };
            this.emit("debug", { action: "sendRpcPayload", payload });
            let result;
            try {
                result = (await this._send(payload))[0];
                this.#pendingDetectNetwork = null;
            }
            catch (error) {
                this.#pendingDetectNetwork = null;
                this.emit("debug", { action: "receiveRpcError", error });
                throw error;
            }
            this.emit("debug", { action: "receiveRpcResult", result });
            if ("result" in result) {
                return network_js_1.Network.from((0, index_js_5.getBigInt)(result.result));
            }
            throw this.getRpcError(payload, result);
        })();
        return await this.#pendingDetectNetwork;
    }
    /**
     *  Sub-classes **MUST** call this. Until [[_start]] has been called, no calls
     *  will be passed to [[_send]] from [[send]]. If it is overridden, then
     *  ``super._start()`` **MUST** be called.
     *
     *  Calling it multiple times is safe and has no effect.
     */
    _start() {
        if (this.#notReady == null || this.#notReady.resolve == null) {
            return;
        }
        this.#notReady.resolve();
        this.#notReady = null;
        (async () => {
            // Bootstrap the network
            while (this.#network == null && !this.destroyed) {
                try {
                    this.#network = await this._detectNetwork();
                }
                catch (error) {
                    if (this.destroyed) {
                        break;
                    }
                    console.log("JsonRpcProvider failed to detect network and cannot start up; retry in 1s (perhaps the URL is wrong or the node is not started)");
                    this.emit("error", (0, index_js_5.makeError)("failed to bootstrap network detection", "NETWORK_ERROR", { event: "initial-network-discovery", info: { error } }));
                    await stall(1000);
                }
            }
            // Start dispatching requests
            this.#scheduleDrain();
        })();
    }
    /**
     *  Resolves once the [[_start]] has been called. This can be used in
     *  sub-classes to defer sending data until the connection has been
     *  established.
     */
    async _waitUntilReady() {
        if (this.#notReady == null) {
            return;
        }
        return await this.#notReady.promise;
    }
    /**
     *  Return a Subscriber that will manage the %%sub%%.
     *
     *  Sub-classes may override this to modify the behavior of
     *  subscription management.
     */
    _getSubscriber(sub) {
        // Pending Filters aren't availble via polling
        if (sub.type === "pending") {
            return new subscriber_filterid_js_1.FilterIdPendingSubscriber(this);
        }
        if (sub.type === "event") {
            return new subscriber_filterid_js_1.FilterIdEventSubscriber(this, sub.filter);
        }
        // Orphaned Logs are handled automatically, by the filter, since
        // logs with removed are emitted by it
        if (sub.type === "orphan" && sub.filter.orphan === "drop-log") {
            return new abstract_provider_js_1.UnmanagedSubscriber("orphan");
        }
        return super._getSubscriber(sub);
    }
    /**
     *  Returns true only if the [[_start]] has been called.
     */
    get ready() { return this.#notReady == null; }
    /**
     *  Returns %%tx%% as a normalized JSON-RPC transaction request,
     *  which has all values hexlified and any numeric values converted
     *  to Quantity values.
     */
    getRpcTransaction(tx) {
        const result = {};
        // JSON-RPC now requires numeric values to be "quantity" values
        ["chainId", "gasLimit", "gasPrice", "type", "maxFeePerGas", "maxPriorityFeePerGas", "nonce", "value"].forEach((key) => {
            if (tx[key] == null) {
                return;
            }
            let dstKey = key;
            if (key === "gasLimit") {
                dstKey = "gas";
            }
            result[dstKey] = (0, index_js_5.toQuantity)((0, index_js_5.getBigInt)(tx[key], `tx.${key}`));
        });
        // Make sure addresses and data are lowercase
        ["from", "to", "data"].forEach((key) => {
            if (tx[key] == null) {
                return;
            }
            result[key] = (0, index_js_5.hexlify)(tx[key]);
        });
        // Normalize the access list object
        if (tx.accessList) {
            result["accessList"] = (0, index_js_4.accessListify)(tx.accessList);
        }
        return result;
    }
    /**
     *  Returns the request method and arguments required to perform
     *  %%req%%.
     */
    getRpcRequest(req) {
        switch (req.method) {
            case "chainId":
                return { method: "quai_chainId", args: [] };
            case "getBlockNumber":
                return { method: "quai_blockNumber", args: [] };
            case "getGasPrice":
                return {
                    method: "quai_baseFee",
                    args: [req.txType]
                };
            case "getMaxPriorityFeePerGas":
                return { method: "quai_maxPriorityFeePerGas", args: [] };
            case "getBalance":
                return {
                    method: "quai_getBalance",
                    args: [getLowerCase(req.address), req.blockTag]
                };
            case "getTransactionCount":
                return {
                    method: "quai_getTransactionCount",
                    args: [getLowerCase(req.address), req.blockTag]
                };
            case "getCode":
                return {
                    method: "quai_getCode",
                    args: [getLowerCase(req.address), req.blockTag]
                };
            case "getStorage":
                return {
                    method: "quai_getStorageAt",
                    args: [
                        getLowerCase(req.address),
                        ("0x" + req.position.toString(16)),
                        req.blockTag
                    ]
                };
            case "broadcastTransaction":
                return {
                    method: "quai_sendRawTransaction",
                    args: [req.signedTransaction]
                };
            case "getBlock":
                if ("blockTag" in req) {
                    return {
                        method: "quai_getBlockByNumber",
                        args: [req.blockTag, !!req.includeTransactions]
                    };
                }
                else if ("blockHash" in req) {
                    return {
                        method: "quai_getBlockByHash",
                        args: [req.blockHash, !!req.includeTransactions]
                    };
                }
                break;
            case "getTransaction":
                return {
                    method: "quai_getTransactionByHash",
                    args: [req.hash]
                };
            case "getTransactionReceipt":
                return {
                    method: "quai_getTransactionReceipt",
                    args: [req.hash]
                };
            case "call":
                return {
                    method: "quai_call",
                    args: [this.getRpcTransaction(req.transaction), req.blockTag]
                };
            case "estimateGas": {
                return {
                    method: "quai_estimateGas",
                    args: [this.getRpcTransaction(req.transaction)]
                };
            }
            case "getRunningLocations": {
                return {
                    method: "quai_listRunningChains",
                    args: []
                };
            }
            case "getProtocolTrieExpansionCount": {
                return {
                    method: "quai_getProtocolExpansionNumber",
                    args: []
                };
            }
            case "getQiRateAtBlock": {
                return {
                    method: "quai_qiRateAtBlock",
                    args: [req.blockTag, req.amt]
                };
            }
            case "getQuaiRateAtBlock": {
                return {
                    method: "quai_quaiRateAtBlock",
                    args: [req.blockTag, req.amt]
                };
            }
            case "getLogs":
                if (req.filter && req.filter.address != null) {
                    if (Array.isArray(req.filter.address)) {
                        req.filter.address = req.filter.address.map(getLowerCase);
                    }
                    else {
                        req.filter.address = getLowerCase(req.filter.address);
                    }
                }
                return { method: "quai_getLogs", args: [req.filter] };
        }
        return null;
    }
    /**
     *  Returns an quais-style Error for the given JSON-RPC error
     *  %%payload%%, coalescing the various strings and error shapes
     *  that different nodes return, coercing them into a machine-readable
     *  standardized error.
     */
    getRpcError(payload, _error) {
        const { method } = payload;
        const { error } = _error;
        if (method === "quai_estimateGas" && error.message) {
            const msg = error.message;
            if (!msg.match(/revert/i) && msg.match(/insufficient funds/i)) {
                return (0, index_js_5.makeError)("insufficient funds", "INSUFFICIENT_FUNDS", {
                    transaction: (payload.params[0]),
                    info: { payload, error }
                });
            }
        }
        if (method === "quai_call" || method === "quai_estimateGas") {
            const result = spelunkData(error);
            const e = index_js_1.AbiCoder.getBuiltinCallException((method === "quai_call") ? "call" : "estimateGas", (payload.params[0]), (result ? result.data : null));
            e.info = { error, payload };
            return e;
        }
        // Only estimateGas and call can return arbitrary contract-defined text, so now we
        // we can process text safely.
        const message = JSON.stringify(spelunkMessage(error));
        if (typeof (error.message) === "string" && error.message.match(/user denied|quais-user-denied/i)) {
            const actionMap = {
                quai_sign: "signMessage",
                personal_sign: "signMessage",
                quai_signTypedData_v4: "signTypedData",
                quai_signTransaction: "signTransaction",
                quai_sendTransaction: "sendTransaction",
                quai_requestAccounts: "requestAccess",
                wallet_requestAccounts: "requestAccess",
            };
            return (0, index_js_5.makeError)(`user rejected action`, "ACTION_REJECTED", {
                action: (actionMap[method] || "unknown"),
                reason: "rejected",
                info: { payload, error }
            });
        }
        if (method === "quai_sendRawTransaction" || method === "quai_sendTransaction") {
            const transaction = (payload.params[0]);
            if (message.match(/insufficient funds|base fee exceeds gas limit/i)) {
                return (0, index_js_5.makeError)("insufficient funds for intrinsic transaction cost", "INSUFFICIENT_FUNDS", {
                    transaction, info: { error }
                });
            }
            if (message.match(/nonce/i) && message.match(/too low/i)) {
                return (0, index_js_5.makeError)("nonce has already been used", "NONCE_EXPIRED", { transaction, info: { error } });
            }
            // "replacement transaction underpriced"
            if (message.match(/replacement transaction/i) && message.match(/underpriced/i)) {
                return (0, index_js_5.makeError)("replacement fee too low", "REPLACEMENT_UNDERPRICED", { transaction, info: { error } });
            }
            if (message.match(/only replay-protected/i)) {
                return (0, index_js_5.makeError)("legacy pre-eip-155 transactions not supported", "UNSUPPORTED_OPERATION", {
                    operation: method, info: { transaction, info: { error } }
                });
            }
        }
        let unsupported = !!message.match(/the method .* does not exist/i);
        if (!unsupported) {
            if (error && error.details && error.details.startsWith("Unauthorized method:")) {
                unsupported = true;
            }
        }
        if (unsupported) {
            return (0, index_js_5.makeError)("unsupported operation", "UNSUPPORTED_OPERATION", {
                operation: payload.method, info: { error, payload }
            });
        }
        return (0, index_js_5.makeError)("could not coalesce error", "UNKNOWN_ERROR", { error, payload });
    }
    /**
     *  Requests the %%method%% with %%params%% via the JSON-RPC protocol
     *  over the underlying channel. This can be used to call methods
     *  on the backend that do not have a high-level API within the Provider
     *  API.
     *
     *  This method queues requests according to the batch constraints
     *  in the options, assigns the request a unique ID.
     *
     *  **Do NOT override** this method in sub-classes; instead
     *  override [[_send]] or force the options values in the
     *  call to the constructor to modify this method's behavior.
     */
    send(method, params, shard) {
        // @TODO: cache chainId?? purge on switch_networks
        // We have been destroyed; no operations are supported anymore
        if (this.destroyed) {
            return Promise.reject((0, index_js_5.makeError)("provider destroyed; cancelled request", "UNSUPPORTED_OPERATION", { operation: method }));
        }
        const id = this.#nextId++;
        const promise = new Promise((resolve, reject) => {
            this.#payloads.push({
                resolve, reject,
                payload: { method, params, id, jsonrpc: "2.0" },
                shard: shard
            });
        });
        // If there is not a pending drainTimer, set one
        this.#scheduleDrain();
        return promise;
    }
    /**
     *  Resolves to the [[Signer]] account for  %%address%% managed by
     *  the client.
     *
     *  If the %%address%% is a number, it is used as an index in the
     *  the accounts from [[listAccounts]].
     *
     *  This can only be used on clients which manage accounts (such as
     *  Geth with imported account or MetaMask).
     *
     *  Throws if the account doesn't exist.
     */
    // Works only if using a local node or browser wallet for this, otherwise cannot get accounts
    async getSigner(address) {
        if (address == null) {
            address = 0;
        }
        const accountsPromise = this.send("quai_accounts", []);
        // Account index
        if (typeof (address) === "number") {
            const accounts = (await accountsPromise);
            if (address >= accounts.length) {
                throw new Error("no such account");
            }
            return new JsonRpcSigner(this, accounts[address]);
        }
        const { accounts } = await (0, index_js_5.resolveProperties)({
            network: this.getNetwork(),
            accounts: accountsPromise
        });
        // Account address
        address = (0, index_js_2.getAddress)(address);
        for (const account of accounts) {
            if ((0, index_js_2.getAddress)(account) === address) {
                return new JsonRpcSigner(this, address);
            }
        }
        throw new Error("invalid account");
    }
    async listAccounts() {
        const accounts = await this.send("quai_accounts", []);
        return accounts.map((a) => new JsonRpcSigner(this, a));
    }
    destroy() {
        // Stop processing requests
        if (this.#drainTimer) {
            clearTimeout(this.#drainTimer);
            this.#drainTimer = null;
        }
        // Cancel all pending requests
        for (const { payload, reject } of this.#payloads) {
            reject((0, index_js_5.makeError)("provider destroyed; cancelled request", "UNSUPPORTED_OPERATION", { operation: payload.method }));
        }
        this.#payloads = [];
        // Parent clean-up
        super.destroy();
    }
}
exports.JsonRpcApiProvider = JsonRpcApiProvider;
/**
 *  The JsonRpcProvider is one of the most common Providers,
 *  which performs all operations over HTTP (or HTTPS) requests.
 *
 *  Events are processed by polling the backend for the current block
 *  number; when it advances, all block-base events are then checked
 *  for updates.
 */
class JsonRpcProvider extends JsonRpcApiProvider {
    constructor(urls, network, options) {
        if (urls == null) {
            urls = ["http:/\/localhost:8545"];
        }
        super(network, options);
        if (Array.isArray(urls)) {
            this.initPromise = this.initUrlMap(urls);
        }
        else if (typeof urls === "string") {
            this.initPromise = this.initUrlMap([urls]);
        }
        else {
            this.initPromise = this.initUrlMap(urls.clone());
        }
    }
    _getSubscriber(sub) {
        const subscriber = super._getSubscriber(sub);
        return subscriber;
    }
    _getConnection(shard) {
        const connection = this.connect[this.connect.length - 1].clone();
        if (typeof shard === "string") {
            const shardBytes = this.shardBytes(shard);
            connection.url = this._urlMap.get(shardBytes) ?? connection.url;
        }
        return connection;
    }
    async send(method, params, shard) {
        // All requests are over HTTP, so we can just start handling requests
        // We do this here rather than the constructor so that we don't send any
        // requests to the network (i.e. quai_chainId) until we absolutely have to.
        //        await this.initPromise;
        await this._start();
        return await super.send(method, params, shard);
    }
    async _send(payload, shard) {
        // Configure a POST connection for the requested method
        const request = this._getConnection(shard);
        request.body = JSON.stringify(payload);
        request.setHeader("content-type", "application/json");
        const response = await request.send();
        response.assertOk();
        let resp = response.bodyJson;
        if (!Array.isArray(resp)) {
            resp = [resp];
        }
        return resp;
    }
}
exports.JsonRpcProvider = JsonRpcProvider;
function spelunkData(value) {
    if (value == null) {
        return null;
    }
    // These *are* the droids we're looking for.
    if (typeof (value.message) === "string" && value.message.match(/revert/i) && (0, index_js_5.isHexString)(value.data)) {
        return { message: value.message, data: value.data };
    }
    // Spelunk further...
    if (typeof (value) === "object") {
        for (const key in value) {
            const result = spelunkData(value[key]);
            if (result) {
                return result;
            }
        }
        return null;
    }
    // Might be a JSON string we can further descend...
    if (typeof (value) === "string") {
        try {
            return spelunkData(JSON.parse(value));
        }
        catch (error) { }
    }
    return null;
}
function _spelunkMessage(value, result) {
    if (value == null) {
        return;
    }
    // These *are* the droids we're looking for.
    if (typeof (value.message) === "string") {
        result.push(value.message);
    }
    // Spelunk further...
    if (typeof (value) === "object") {
        for (const key in value) {
            _spelunkMessage(value[key], result);
        }
    }
    // Might be a JSON string we can further descend...
    if (typeof (value) === "string") {
        try {
            return _spelunkMessage(JSON.parse(value), result);
        }
        catch (error) { }
    }
}
function spelunkMessage(value) {
    const result = [];
    _spelunkMessage(value, result);
    return result;
}
//# sourceMappingURL=provider-jsonrpc.js.map