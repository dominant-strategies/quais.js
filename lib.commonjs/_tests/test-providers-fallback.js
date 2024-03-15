"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockProvider = void 0;
const tslib_1 = require("tslib");
const assert_1 = tslib_1.__importDefault(require("assert"));
const index_js_1 = require("../index.js");
const network = index_js_1.Network.from("mainnet");
function stall(duration) {
    return new Promise((resolve) => { setTimeout(resolve, duration); });
}
class MockProvider extends index_js_1.AbstractProvider {
    _perform;
    constructor(perform) {
        super(network, { cacheTimeout: -1 });
        this._perform = perform;
    }
    async _detectNetwork() { return network; }
    async perform(req) {
        return await this._perform(req);
    }
}
exports.MockProvider = MockProvider;
describe("Test Fallback broadcast", function () {
    const txHash = "0xe9fb92945282cf04f7bb3027d690fdaab6d601c99a7cdd0a5eb41d1a5c0893d5";
    async function test(actions) {
        const tx = "0x00f8788223288202898504a817c8008504a817c800825208940aff86a125b29b25a9e418c2fb64f1753532c0ca88016345785d8a000080c001a0711d47f0f6828721f336430ca87277534d0134de5f04ce3629085f8d5371c129a061c4838dec40c296cfad6fe771d502c26e209089124e6f702c64353b3ca195c1";
        const providers = actions.map(({ timeout, error }) => {
            return new MockProvider(async (r) => {
                if (r.method === "getBlockNumber") {
                    return 1;
                }
                if (r.method === "broadcastTransaction") {
                    await stall(timeout);
                    if (error) {
                        throw error;
                    }
                    return txHash;
                }
                throw new Error(`unhandled method: ${r.method}`);
            });
        });
        ;
        const provider = new index_js_1.FallbackProvider(providers);
        return await provider.broadcastTransaction('0,1', tx);
    }
    it("picks late non-failed broadcasts", async function () {
        const result = await test([
            { timeout: 200, error: (0, index_js_1.makeError)("already seen", "UNKNOWN_ERROR") },
            { timeout: 4000, error: (0, index_js_1.makeError)("already seen", "UNKNOWN_ERROR") },
            { timeout: 400 },
        ]);
        (0, assert_1.default)(result.hash === txHash, "result.hash === txHash");
    });
    it("insufficient funds short-circuit broadcast", async function () {
        await assert_1.default.rejects(async function () {
            const result = await test([
                { timeout: 200, error: (0, index_js_1.makeError)("is broke", "INSUFFICIENT_FUNDS") },
                { timeout: 400, error: (0, index_js_1.makeError)("is broke", "INSUFFICIENT_FUNDS") },
                { timeout: 800 },
                { timeout: 1000 },
            ]);
            console.log(result);
        }, function (error) {
            (0, assert_1.default)((0, index_js_1.isError)(error, "INSUFFICIENT_FUNDS"));
            return true;
        });
    });
});
//# sourceMappingURL=test-providers-fallback.js.map