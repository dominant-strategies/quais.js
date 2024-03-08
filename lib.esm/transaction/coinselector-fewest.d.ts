import { AbstractCoinSelector, SelectedCoinsResult, SpendTarget } from "./abstract-coinselector.js";
/**
 * The FewestCoinSelector class provides a coin selection algorithm that selects
 * the fewest UTXOs required to meet the target amount. This algorithm is useful
 * for minimizing the size of the transaction and the fees associated with it.
 *
 * This class is a sub-class of [[AbstractCoinSelector]] and implements the
 * [[performSelection]] method to provide the actual coin selection logic.
 */
export declare class FewestCoinSelector extends AbstractCoinSelector {
    /**
     * The largest first coin selection algorithm.
     *
     * This algorithm selects the largest UTXOs first, and continues to select UTXOs until the
     * target amount is reached. If the total value of the selected UTXOs is greater than the
     * target amount, the remaining value is returned as a change output.
     * @param target The target amount to select UTXOs for.
     */
    performSelection(target: SpendTarget): SelectedCoinsResult;
}
//# sourceMappingURL=coinselector-fewest.d.ts.map