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
export abstract class AbstractCoinSelector {
    #availableUXTOs: UTXO[];
    #spendOutputs: UTXO[];
    #changeOutputs: UTXO[];

    get availableUXTOs(): UTXO[] { return this.#availableUXTOs; }
    set availableUXTOs(value: UTXO[]) {
        this.#availableUXTOs = value.map((val: UTXO) => {
            const utxo = UTXO.from(val as UTXOLike);
            this._validateUTXO(utxo);
            return utxo;
        });
    }

    get spendOutputs(): UTXO[] { return this.#spendOutputs; }
    set spendOutputs(value: UTXO[]) {
        this.#spendOutputs = value.map((utxo: UTXO) => UTXO.from(utxo as UTXOLike));
    }

    get changeOutputs(): UTXO[] { return this.#changeOutputs; }
    set changeOutputs(value: UTXO[]) {
        this.#changeOutputs = value.map((utxo: UTXO) => UTXO.from(utxo as UTXOLike));
    }

    /**
     * Constructs a new AbstractCoinSelector instance with an empty UTXO array.
     */
    constructor(availableUXTOs: UTXOEntry[] = []) {
        this.#availableUXTOs = availableUXTOs.map((val: UTXOLike) => {
            const utxo = UTXO.from(val);
            this._validateUTXO(utxo);
            return utxo;
        });
        this.#spendOutputs = [];
        this.#changeOutputs = [];
    }

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
    protected _validateUTXO(utxo: UTXO): void {
        if (utxo.address == null) {
            throw new Error("UTXO address is required");
        }

        if (utxo.denomination == null) {
            throw new Error("UTXO denomination is required");
        }
    }



}
