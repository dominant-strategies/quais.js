"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const assert_1 = tslib_1.__importDefault(require("assert"));
const coinselector_fewest_1 = require("../transaction/coinselector-fewest");
const utxo_1 = require("../transaction/utxo");
const TEST_SPEND_ADDRESS = "0x00539bc2CE3eD0FD039c582CB700EF5398bB0491";
const TEST_RECEIVE_ADDRESS = "0x02b9B1D30B6cCdc7d908B82739ce891463c3FA19";
// Utility function to create UTXOs (adjust as necessary)
function createUTXOs(denominations) {
    return denominations.map(denomination => ({
        denomination,
        address: TEST_SPEND_ADDRESS
    }));
}
describe("FewestCoinSelector", function () {
    describe("Selecting valid UTXOs", function () {
        it("selects a single UTXO that exactly matches the target amount", function () {
            const availableUTXOs = createUTXOs([utxo_1.denominations[1], utxo_1.denominations[2], utxo_1.denominations[3]]); // .065 Qi
            const targetSpend = { value: utxo_1.denominations[3], address: TEST_RECEIVE_ADDRESS }; // .05 Qi
            const selector = new coinselector_fewest_1.FewestCoinSelector(availableUTXOs);
            const result = selector.performSelection(targetSpend);
            // A single 0.05 Qi UTXO should have been selected
            assert_1.default.strictEqual(result.inputs.length, 1);
            assert_1.default.strictEqual(result.inputs[0].denomination, utxo_1.denominations[3]);
            // A single new 0.05 Qi UTXO should have been outputed
            assert_1.default.strictEqual(result.spendOutputs.length, 1);
            assert_1.default.strictEqual(result.spendOutputs[0].denomination, utxo_1.denominations[3]);
            // No change should be returned
            assert_1.default.strictEqual(result.changeOutputs.length, 0);
        });
        it("selects multiple UTXOs whose combined value meets the target amount", function () {
            const availableUTXOs = createUTXOs([utxo_1.denominations[1], utxo_1.denominations[2], utxo_1.denominations[2], utxo_1.denominations[3]]); // .075 Qi
            const targetSpend = { value: utxo_1.denominations[2] + utxo_1.denominations[3], address: TEST_RECEIVE_ADDRESS }; // .06 Qi
            const selector = new coinselector_fewest_1.FewestCoinSelector(availableUTXOs);
            const result = selector.performSelection(targetSpend);
            // 2 UTXOs should have been selected for a total of .06 Qi
            assert_1.default.strictEqual(result.inputs.length, 2);
            const inputValue = result.inputs[0].denomination + result.inputs[1].denomination;
            assert_1.default.strictEqual(inputValue, utxo_1.denominations[2] + utxo_1.denominations[3]);
            // 2 new UTxOs should have been outputed for a total of .06 Qi
            assert_1.default.strictEqual(result.spendOutputs.length, 2);
            const spendValue = result.spendOutputs[0].denomination + result.spendOutputs[1].denomination;
            assert_1.default.strictEqual(spendValue, utxo_1.denominations[2] + utxo_1.denominations[3]);
            // No change should be returned
            assert_1.default.strictEqual(result.changeOutputs.length, 0);
        });
        it("selects a single UTXO that is larger than the target amount, ensuring change is correctly calculated", function () {
            const availableUTXOs = createUTXOs([utxo_1.denominations[2], utxo_1.denominations[4]]); // .11 Qi
            const targetSpend = { value: utxo_1.denominations[3], address: TEST_RECEIVE_ADDRESS }; // .05 Qi
            const selector = new coinselector_fewest_1.FewestCoinSelector(availableUTXOs);
            const result = selector.performSelection(targetSpend);
            // A single 0.1 Qi UTXO should have been selected
            assert_1.default.strictEqual(result.inputs.length, 1);
            assert_1.default.strictEqual(result.inputs[0].denomination, utxo_1.denominations[4]);
            // A single new 0.05 Qi UTXO should have been outputed
            assert_1.default.strictEqual(result.spendOutputs.length, 1);
            assert_1.default.strictEqual(result.spendOutputs[0].denomination, utxo_1.denominations[3]);
            // 0.05 Qi should be returned in change
            assert_1.default.strictEqual(result.changeOutputs.length, 1);
            assert_1.default.strictEqual(result.changeOutputs[0].denomination, utxo_1.denominations[3]);
        });
        it("selects multiple UTXOs where the total exceeds the target amount, ensuring change is correctly calculated", function () {
            const availableUTXOs = createUTXOs([
                utxo_1.denominations[2],
                utxo_1.denominations[4],
                utxo_1.denominations[4],
                utxo_1.denominations[4],
                utxo_1.denominations[5]
            ]); // .56 Qi
            const targetSpend = { value: utxo_1.denominations[6], address: TEST_RECEIVE_ADDRESS }; // .5 Qi
            const selector = new coinselector_fewest_1.FewestCoinSelector(availableUTXOs);
            const result = selector.performSelection(targetSpend);
            // 4 UTXOs should have been selected for a total of .55 Qi
            assert_1.default.strictEqual(result.inputs.length, 4);
            const inputValue = result.inputs[0].denomination + result.inputs[1].denomination + result.inputs[2].denomination + result.inputs[3].denomination;
            assert_1.default.strictEqual(inputValue, utxo_1.denominations[4] + utxo_1.denominations[4] + utxo_1.denominations[4] + utxo_1.denominations[5]);
            // A single new 0.5 Qi UTXO should have been outputed 
            assert_1.default.strictEqual(result.spendOutputs.length, 1);
            assert_1.default.strictEqual(result.spendOutputs[0].denomination, utxo_1.denominations[6]);
            // 0.05 Qi should be returned in change
            assert_1.default.strictEqual(result.changeOutputs.length, 1);
            assert_1.default.strictEqual(result.changeOutputs[0].denomination, utxo_1.denominations[3]);
        });
    });
    describe("Selecting valid UTXOs", function () {
        it("throws an error when there are insufficient funds", function () {
            const selector = new coinselector_fewest_1.FewestCoinSelector(createUTXOs([utxo_1.denominations[0], utxo_1.denominations[0]]));
            assert_1.default.throws(() => selector.performSelection({ value: utxo_1.denominations[3], address: TEST_RECEIVE_ADDRESS }), /Insufficient funds/);
        });
        it("throws an error when no UTXOs are available", function () {
            const selector = new coinselector_fewest_1.FewestCoinSelector([]);
            assert_1.default.throws(() => selector.performSelection({ value: utxo_1.denominations[2], address: TEST_RECEIVE_ADDRESS }), /No UTXOs available/);
        });
        it("throws an error when the target amount is negative", function () {
            const selector = new coinselector_fewest_1.FewestCoinSelector(createUTXOs([utxo_1.denominations[2], utxo_1.denominations[2]]));
            assert_1.default.throws(() => selector.performSelection({ value: -utxo_1.denominations[1], address: TEST_RECEIVE_ADDRESS }), /Target amount must be greater than 0/);
        });
    });
});
//# sourceMappingURL=test-utxo-coinselection.js.map