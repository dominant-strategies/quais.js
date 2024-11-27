import { FewestCoinSelector } from './coinselector-fewest.js';
import { UTXO, denominate, denominations } from './utxo.js';

/**
 * The ConversionSelector class provides a coin selection algorithm that selects the fewest UTXOs required to meet the
 * target amount. This algorithm is useful for minimizing the size of the transaction and the fees associated with it.
 *
 * This class is a modified version of {@link FewestCoinSelector | **FewestCoinSelector** } and implements the
 * {@link FewestCoinSelector.createSpendOutputs | **createSpendOutputs** } method to provide the actual coin selection
 * logic.
 *
 * @category Transaction
 */
export class ConversionCoinSelector extends FewestCoinSelector {
    /**
     * Creates spend outputs based on the target amount and input denominations.
     *
     * @param {bigint} amount - The target amount to spend.
     * @returns {UTXO[]} The spend outputs.
     */
    protected override createSpendOutputs(amount: bigint): UTXO[] {
        // Spend outpoints are not limited to max input denomination
        const spendDenominations = denominate(amount);

        return spendDenominations.map((denominationValue) => {
            const utxo = new UTXO();
            utxo.denomination = denominations.indexOf(denominationValue);
            return utxo;
        });
    }
}
