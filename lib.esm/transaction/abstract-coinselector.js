import { UTXO } from "./utxo.js";
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
export class AbstractCoinSelector {
    #availableUXTOs;
    #spendOutputs;
    #changeOutputs;
    get availableUXTOs() { return this.#availableUXTOs; }
    set availableUXTOs(value) {
        this.#availableUXTOs = value.map((val) => {
            const utxo = UTXO.from(val);
            this._validateUTXO(utxo);
            return utxo;
        });
    }
    get spendOutputs() { return this.#spendOutputs; }
    set spendOutputs(value) {
        this.#spendOutputs = value.map((utxo) => UTXO.from(utxo));
    }
    get changeOutputs() { return this.#changeOutputs; }
    set changeOutputs(value) {
        this.#changeOutputs = value.map((utxo) => UTXO.from(utxo));
    }
    /**
     * Constructs a new AbstractCoinSelector instance with an empty UTXO array.
     */
    constructor(availableUXTOs = []) {
        this.#availableUXTOs = availableUXTOs.map((val) => {
            const utxo = UTXO.from(val);
            this._validateUTXO(utxo);
            return utxo;
        });
        this.#spendOutputs = [];
        this.#changeOutputs = [];
    }
    /**
     * Validates the provided UTXO instance. In order to be valid for coin
     * selection, the UTXO must have a valid address and denomination.
     * @param utxo The UTXO instance to validate.
     * @throws An error if the UTXO instance is invalid.
     */
    _validateUTXO(utxo) {
        if (utxo.address == null) {
            throw new Error("UTXO address is required");
        }
        if (utxo.denomination == null) {
            throw new Error("UTXO denomination is required");
        }
    }
}
//# sourceMappingURL=abstract-coinselector.js.map