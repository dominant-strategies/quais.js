import assert from "assert";
import { FewestCoinSelector } from "../transaction/coinselector-fewest";
// Utility function to create UTXOs (adjust as necessary)
function createUTXOs(denominations) {
    return denominations.map(denomination => ({
        denomination,
        address: "test-address"
    }));
}
describe("FewestCoinSelector", function () {
    describe("Selecting valid UTXOs", function () {
        it("selects a single UTXO that exactly matches the target amount", function () {
            const selector = new FewestCoinSelector(createUTXOs([100n, 50n, 150n]));
            const result = selector.performSelection({ value: 150n, address: "test-address" });
            assert.strictEqual(result.inputs.length, 1);
            assert.strictEqual(result.inputs[0].denomination, 150n);
            assert.strictEqual(result.changeOutputs.length, 0);
        });
        it("selects multiple UTXOs whose combined value meets the target amount", function () {
            const selector = new FewestCoinSelector(createUTXOs([100n, 50n, 150n]));
            const result = selector.performSelection({ value: 200n, address: "test-address" });
            assert.strictEqual(result.inputs.length, 2);
            assert.strictEqual(result.changeOutputs.length, 0);
        });
        it("selects a single UTXO that is larger than the target amount, ensuring change is correctly calculated", function () {
            const selector = new FewestCoinSelector(createUTXOs([200n, 50n]));
            const result = selector.performSelection({ value: 150n, address: "test-address" });
            assert.strictEqual(result.inputs.length, 1);
            assert.strictEqual(result.inputs[0].denomination, 200n);
            assert.strictEqual(result.changeOutputs.length, 1);
            assert.strictEqual(result.changeOutputs[0].denomination, 50n);
        });
        it("selects multiple UTXOs where the total exceeds the target amount, ensuring change is correctly calculated", function () {
            const selector = new FewestCoinSelector(createUTXOs([100n, 100n, 50n]));
            const result = selector.performSelection({ value: 200n, address: "test-address" });
            assert.strictEqual(result.inputs.length, 2);
            assert.strictEqual(result.changeOutputs.length, 1);
            assert.strictEqual(result.changeOutputs[0].denomination, 50n);
        });
    });
    describe("Selecting valid UTXOs", function () {
        it("throws an error when there are insufficient funds", function () {
            const selector = new FewestCoinSelector(createUTXOs([50n, 50n]));
            assert.throws(() => selector.performSelection({ value: 150n, address: "test-address" }), /Insufficient funds/);
        });
        it("throws an error when no UTXOs are available", function () {
            const selector = new FewestCoinSelector([]);
            assert.throws(() => selector.performSelection({ value: 100n, address: "test-address" }), /No UTXOs available/);
        });
        it("throws an error when the target amount is negative", function () {
            const selector = new FewestCoinSelector(createUTXOs([100n, 100n]));
            assert.throws(() => selector.performSelection({ value: -100n, address: "test-address" }), /Target amount must be greater than 0/);
        });
    });
});
//# sourceMappingURL=test-utxo-coinselection.js.map