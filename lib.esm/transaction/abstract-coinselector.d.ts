import { UTXO, UTXOEntry, UTXOLike } from "./utxo.js";
export type SpendTarget = {
    address: string;
    value: bigint;
};
export type SelectedCoinsResult = {
    inputs: UTXO[];
    spendOutputs: UTXO[];
    changeOutputs: UTXO[];
};
/**
 * An **AbstractCoinSelector** provides a base class for other sub-classes to
 * implement the functionality for selecting UTXOs for a spend and to properly
 * handle spend and change outputs.
 *
 * This class is abstract and should not be used directly. Sub-classes should
 * implement the [[performSelection]] method to provide the actual coin
 * selection logic.
 *
 * @abstract
 */
export declare abstract class AbstractCoinSelector {
    #private;
    get availableUXTOs(): UTXO[];
    set availableUXTOs(value: UTXOLike[]);
    get spendOutputs(): UTXO[];
    set spendOutputs(value: UTXOLike[]);
    get changeOutputs(): UTXO[];
    set changeOutputs(value: UTXOLike[]);
    /**
     * Constructs a new AbstractCoinSelector instance with an empty UTXO array.
     */
    constructor(availableUXTOs?: UTXOEntry[]);
    /**
     * This method should be implemented by sub-classes to provide the actual
     * coin selection logic. It should select UTXOs from the available UTXOs
     * that sum to the target amount and return the selected UTXOs as well as
     * the spend and change outputs.
     * @param target The target amount to select UTXOs for.
     */
    abstract performSelection(target: SpendTarget): SelectedCoinsResult;
    /**
     * Validates the provided UTXO instance. In order to be valid for coin
     * selection, the UTXO must have a valid address and denomination.
     * @param utxo The UTXO instance to validate.
     * @throws An error if the UTXO instance is invalid.
     */
    protected _validateUTXO(utxo: UTXO): void;
}
//# sourceMappingURL=abstract-coinselector.d.ts.map