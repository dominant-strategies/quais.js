import { bigIntAbs } from "../utils/maths.js";
import { AbstractCoinSelector, SelectedCoinsResult, SpendTarget } from "./abstract-coinselector.js";
import { UTXO, denominate } from "./utxo.js";


/**
 * The FewestCoinSelector class provides a coin selection algorithm that selects
 * the fewest UTXOs required to meet the target amount. This algorithm is useful
 * for minimizing the size of the transaction and the fees associated with it.
 * 
 * This class is a sub-class of [[AbstractCoinSelector]] and implements the
 * [[performSelection]] method to provide the actual coin selection logic.
 */
export class FewestCoinSelector extends AbstractCoinSelector {

    /**
     * The largest first coin selection algorithm.
     * 
     * This algorithm selects the largest UTXOs first, and continues to select UTXOs until the
     * target amount is reached. If the total value of the selected UTXOs is greater than the
     * target amount, the remaining value is returned as a change output.
     * @param target The target amount to select UTXOs for.
     */
    performSelection(target: SpendTarget): SelectedCoinsResult {
        if (target.value <= BigInt(0)) {
            throw new Error("Target amount must be greater than 0");
        }

        if (this.availableUXTOs.length === 0) {
            throw new Error("No UTXOs available");
        }

        // Sort UTXOs in descending order based on their denomination
        const sortedUTXOs = this.availableUXTOs.sort((a, b) => {
            const diff = (b.denomination ?? BigInt(0)) - (a.denomination ?? BigInt(0));
            return diff > 0 ? 1 : diff < 0 ? -1 : 0;
        });

        let totalValue = BigInt(0);
        const selectedUTXOs: UTXO[] = [];

        // Get UTXOs that meets or exceeds the target value
        const UTXOsEqualOrGreaterThanTarget = sortedUTXOs.filter(utxo => utxo.denomination && utxo.denomination >= target.value);

        if (UTXOsEqualOrGreaterThanTarget.length > 0) {
            // Find the smallest UTXO that meets or exceeds the target value
            const optimalUTXO = UTXOsEqualOrGreaterThanTarget.reduce((minDenominationUTXO, currentUTXO) => {
                if (!currentUTXO.denomination) return minDenominationUTXO;
                return currentUTXO.denomination < minDenominationUTXO.denomination! ? currentUTXO : minDenominationUTXO;
            }, UTXOsEqualOrGreaterThanTarget[0]); // Initialize with the first UTXO in the list

            selectedUTXOs.push(optimalUTXO);
            totalValue += optimalUTXO.denomination!;
        } else {
            // If no single UTXO meets or exceeds the target, aggregate smaller denominations
            // until the target is met/exceeded or there are no more UTXOs to aggregate
            while (sortedUTXOs.length > 0 && totalValue < target.value) {
                const nextOptimalUTXO = sortedUTXOs.reduce<UTXO>((closest, utxo) => {
                    if (!utxo.denomination) return closest;

                    // Prioritize UTXOs that bring totalValue closer to target.value
                    const absThisDiff = bigIntAbs(target.value - (totalValue + utxo.denomination));
                    const currentClosestDiff = closest && closest.denomination
                        ? bigIntAbs(target.value - (totalValue + closest.denomination))
                        : BigInt(Infinity);

                    return absThisDiff < currentClosestDiff ? utxo : closest;

                }, sortedUTXOs[0]);

                // Add the selected UTXO to the selection and update totalValue
                selectedUTXOs.push(nextOptimalUTXO);
                totalValue += nextOptimalUTXO.denomination!;

                // Remove the selected UTXO from the list of available UTXOs
                const index = sortedUTXOs.findIndex(utxo => utxo.denomination === nextOptimalUTXO.denomination && utxo.address === nextOptimalUTXO.address);
                sortedUTXOs.splice(index, 1);
            }
        }

        // Check if the selected UTXOs meet or exceed the target amount
        if (totalValue < target.value) {
            throw new Error("Insufficient funds");
        }

        // Break down the total spend into properly denominatated UTXOs
        const spendDenominations = denominate(target.value);
        this.spendOutputs = spendDenominations.map(denomination => {
            const utxo = new UTXO();
            utxo.denomination = denomination;
            utxo.address = target.address;
            return utxo;
        });

        // Calculate change to be returned
        const change = totalValue - target.value;

        // If there's change, break it down into properly denominatated UTXOs
        if (change > BigInt(0)) {
            const changeDenominations = denominate(change);
            this.changeOutputs = changeDenominations.map(denomination => {
                const utxo = new UTXO();
                utxo.denomination = denomination;
                // We do not have access to change addresses here so leave it null
                return utxo;
            });
        } else {
            this.changeOutputs = [];
        }

        return {
            inputs: selectedUTXOs,
            spendOutputs: this.spendOutputs,
            changeOutputs: this.changeOutputs,
        };
    }

}
