import { Bip47QiWalletSelf } from './bip47-self-qi-wallet.js';
import { Bip47QiWalletCounterparty } from './bip47-counterparty-qi-wallet.js';
import { HDNodeWallet } from '../hdnodewallet.js';
import { QiAddressInfo } from '../qi-hdwallet.js';
import { Zone } from '../../constants/index.js';

/**
 * Represents a BIP47 payment channel between two parties, managing both sending and receiving addresses for a specific
 * payment code pair.
 */
export class PaymentChannel {
    #selfWallet: Bip47QiWalletSelf;
    #counterpartyWallet: Bip47QiWalletCounterparty;
    #counterpartyPaymentCode: string;

    constructor(root: HDNodeWallet, counterpartyPaymentCode: string) {
        this.#counterpartyPaymentCode = counterpartyPaymentCode;
        this.#selfWallet = new Bip47QiWalletSelf(root, counterpartyPaymentCode);
        this.#counterpartyWallet = new Bip47QiWalletCounterparty(this.#selfWallet, counterpartyPaymentCode);
    }

    /**
     * Gets the self wallet instance used for receiving payments
     */
    get selfWallet(): Readonly<Bip47QiWalletSelf> {
        return this.#selfWallet;
    }

    /**
     * Gets the counterparty wallet instance used for sending payments
     */
    get counterpartyWallet(): Readonly<Bip47QiWalletCounterparty> {
        return this.#counterpartyWallet;
    }

    /**
     * Gets the counterparty's payment code
     */
    get counterpartyPaymentCode(): Readonly<string> {
        return this.#counterpartyPaymentCode;
    }

    /**
     * Gets the address info for a given receiving address
     *
     * @param address - The receiving address to get the info for
     * @returns The address info or null if not found
     */
    public getReceivingAddressInfo(address: string): QiAddressInfo | null {
        return this.#selfWallet.getAddressInfo(address);
    }

    public getReceivingAddressesForAccount(account: number): QiAddressInfo[] {
        return this.#selfWallet.getAddressesForAccount(account);
    }

    public getNextReceivingAddress(zone: Zone, account: number = 0): QiAddressInfo {
        const reusable = this.#selfWallet.getReusableAddress(zone, account);
        if (reusable) return reusable;
        return this.#selfWallet.deriveNewAddress(zone, account);
    }

    public getNextSendingAddress(zone: Zone, account: number = 0, exclude?: Set<string>): QiAddressInfo {
        // Reuse an existing UNUSED or ATTEMPTED_USE address before deriving a new one
        // to avoid gaps in the derivation sequence that could exceed the gap limit
        const reusable = this.#counterpartyWallet.getReusableAddress(zone, account, exclude);
        if (reusable) return reusable;
        return this.#counterpartyWallet.deriveNewAddress(zone, account);
    }
}
