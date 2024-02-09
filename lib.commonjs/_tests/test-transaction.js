"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const assert_1 = tslib_1.__importDefault(require("assert"));
const utils_js_1 = require("./utils.js");
const index_js_1 = require("../index.js");
const v8_1 = require("v8");
const BN_0 = BigInt(0);
describe("Tests Unsigned Transaction Serializing", function () {
    const tests = (0, utils_js_1.loadTests)("transactions");
    for (const test of tests) {
        // Unsupported parameters for EIP-155; i.e. unspecified chain ID
        if (!test.unsignedEip155) {
            continue;
        }
        it(`serialized unsigned EIP-155 transaction: ${test.name}`, function () {
            const txData = Object.assign({}, test.transaction, {
                type: 0,
                accessList: undefined,
                maxFeePerGas: undefined,
                maxPriorityFeePerGas: undefined
            });
            const tx = index_js_1.Transaction.from(txData);
            assert_1.default.equal(tx.unsignedSerialized, test.unsignedEip155, "unsignedEip155");
        });
    }
});
describe("Tests Signed Transaction Serializing", function () {
    const tests = (0, utils_js_1.loadTests)("transactions");
    for (const test of tests) {
        if (!test.unsignedEip155) {
            continue;
        }
        it(`serialized signed EIP-155 transaction: ${test.name}`, function () {
            const txData = Object.assign({}, test.transaction, {
                type: 0,
                accessList: [],
                maxFeePerGas: 0,
                maxPriorityFeePerGas: 0,
                signature: test.signatureEip155
            });
            // console.log('TXDATA: ', txData)
            const tx = index_js_1.Transaction.from(txData);
            // console.log('EXPECTED: ', test.signedEip155)
            // console.log("ACTUAL: ", tx.serialized)
            assert_1.default.equal(tx.serialized, test.signedEip155, "signedEip155");
        });
    }
});
function assertTxUint(actual, _expected, name) {
    const expected = (_expected != null ? BigInt(_expected) : null);
    assert_1.default.equal(actual, expected, name);
}
function assertTxEqual(actual, expected) {
    assert_1.default.equal(actual.to, expected.to, "to");
    assert_1.default.equal(actual.nonce, expected.nonce, "nonce");
    assertTxUint(actual.gasLimit, expected.gasLimit, "gasLimit");
    assertTxUint(actual.gasPrice, expected.gasPrice, "gasPrice");
    assertTxUint(actual.maxFeePerGas, expected.maxFeePerGas, "maxFeePerGas");
    assertTxUint(actual.maxPriorityFeePerGas, expected.maxPriorityFeePerGas, "maxPriorityFeePerGas");
    assert_1.default.equal(actual.data, expected.data, "data");
    assertTxUint(actual.value, expected.value, "value");
    if (expected.accessList) {
        assert_1.default.equal(JSON.stringify(actual.accessList), JSON.stringify(expected.accessList), "accessList");
    }
    else {
        assert_1.default.equal(actual.accessList, null, "accessList:!null");
    }
    assertTxUint(actual.chainId, expected.chainId, "chainId");
}
function addDefault(tx, key, defaultValue) {
    if (tx[key] == null) {
        tx[key] = defaultValue;
    }
}
function addDefaults(tx) {
    tx = Object.assign({}, tx);
    addDefault(tx, "nonce", 0);
    addDefault(tx, "gasLimit", BN_0);
    addDefault(tx, "maxFeePerGas", BN_0);
    addDefault(tx, "maxPriorityFeePerGas", BN_0);
    addDefault(tx, "value", 0);
    addDefault(tx, "data", "0x");
    addDefault(tx, "accessList", []);
    addDefault(tx, "chainId", BN_0);
    return tx;
}
describe("Tests Unsigned Transaction Parsing", function () {
    const tests = (0, utils_js_1.loadTests)("transactions");
    for (const test of tests) {
        if (!test.unsignedEip155) {
            continue;
        }
        it(`parses unsigned EIP-155 transaction: ${test.name}`, function () {
            const tx = index_js_1.Transaction.from(test.unsignedEip155);
            const expected = addDefaults(test.transaction);
            expected.maxFeePerGas = 0;
            expected.maxPriorityFeePerGas = 0;
            expected.accessList = [];
            assertTxEqual(tx, expected);
        });
    }
});
describe("Tests Signed Transaction Parsing", function () {
    const tests = (0, utils_js_1.loadTests)("transactions");
    for (const test of tests) {
        if (!test.unsignedEip155) {
            continue;
        }
        it(`parses signed EIP-155 transaction: ${test.name}`, function () {
            let tx = index_js_1.Transaction.from(test.signedEip155);
            console.log((0, v8_1.serialize)(tx));
            const expected = addDefaults(test.transaction);
            expected.maxFeePerGas = 0;
            expected.maxPriorityFeePerGas = 0;
            expected.accessList = [];
            for (let i = 0; i < 2; i++) {
                assertTxEqual(tx, expected);
                assert_1.default.ok(!!tx.signature, "signature:!null");
                assert_1.default.equal(tx.signature.r, test.signatureEip155.r, "signature.r");
                assert_1.default.equal(tx.signature.s, test.signatureEip155.s, "signature.s");
                tx = tx.clone();
            }
        });
    }
});
describe("Tests Transaction Parameters", function () {
    const badData = [
        {
            name: "accessList=0x09",
            data: "0x00c9010203040580070809",
            message: "invalid access list",
            argument: "accessList"
        },
        {
            name: "accessList=[0x09]",
            data: "0x00ca0102030405800708c109",
            message: "invalid address-slot set",
            argument: "accessList"
        },
        {
            name: "accessList=[0x09,0x10]",
            data: "0x00cb0102030405800708c20910",
            message: "invalid address-slot set",
            argument: "accessList"
        },
        {
            name: "accessList=[0x09,[HASH]] (bad address)",
            data: "0x00ed0102030405800708e4e309e1a024412927c99a717115f5308c0ebd11136659b3cb6291abb4a8f87e9856a12538",
            message: "invalid address",
            argument: "accessList"
        },
        {
            name: "accessList=[ADDR,[0x09]] (bad slot)",
            data: "0x00e10102030405800708d8d794939d33ff01840e9eeeb67525ec2f7035af41a4b1c109",
            message: "invalid slot",
            argument: "accessList"
        }
    ];
    for (const { name, data, argument, message } of badData) {
        it(`correctly fails on bad accessList: ${name}`, function () {
            assert_1.default.throws(() => {
                // The access list is a single value: 0x09 instead of
                // structured data
                const result = index_js_1.Transaction.from(data);
                console.log('Result: ', result);
            }, (error) => {
                return ((0, index_js_1.isError)(error, "INVALID_ARGUMENT") &&
                    error.argument === argument &&
                    (message == null || error.message.startsWith(message)));
            });
        });
    }
});
//# sourceMappingURL=test-transaction.js.map