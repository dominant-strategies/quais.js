import { AbstractQiWallet } from './abstract-qi-wallet.js';
import { AddressStatus, QiAddressInfo } from '../qi-hdwallet.js';
import { Zone } from '../../constants/index.js';
import { BIP32Factory } from '../bip32/bip32.js';
import ecc from '@bitcoinerlab/secp256k1';
import { type BIP32API } from '../bip32/types.js';
import { hexlify } from '../../utils/index.js';
import { bs58check } from '../bip32/crypto.js';
import { PaymentCodePublic, PC_VERSION } from '../payment-codes.js';
import { MAX_ADDRESS_DERIVATION_ATTEMPTS } from '../utils.js';
import { isValidAddressForZone } from '../utils.js';
import { Bip47QiWalletSelf } from './bip47-self-qi-wallet.js';

export class Bip47QiWalletCounterparty extends AbstractQiWallet {
    private readonly selfBip47Wallet: Bip47QiWalletSelf;
    private readonly counterpartyPaymentCode: string;

    public constructor(selfBip47Wallet: Bip47QiWalletSelf, counterpartyPaymentCode: string) {
        super();
        this.selfBip47Wallet = selfBip47Wallet;
        this.counterpartyPaymentCode = counterpartyPaymentCode;
    }

    /**
     * Derives a new BIP47 payment address for sending funds to a counterparty.
     *
     * @remarks
     * This method implements BIP-0047 payment code derivation for sending funds to a counterparty. It derives addresses
     * using the counterparty's payment code until finding one that matches the specified zone. The derivation follows
     * the path specified in BIP-0047 using the next unused index.
     * @param {Zone} zone - The zone to derive the address for
     * @param {number} [account=0] - The account index to use for derivation. Default is `0`
     * @param {string} receiverPaymentCode - The Base58Check encoded payment code of the receiver
     * @returns {QiAddressInfo} Information about the newly derived payment address
     * @throws {Error} If the payment code version is invalid
     * @throws {Error} If unable to derive a valid address for the zone after maximum attempts
     */
    public deriveNewAddress(zone: Zone, account: number = 0): QiAddressInfo {
        const bip32 = BIP32Factory(ecc) as BIP32API;
        const buf = bs58check.decode(this.counterpartyPaymentCode);
        const version = buf[0];
        if (version !== PC_VERSION) throw new Error('Invalid payment code version');

        const walletPCodePrivate = this.selfBip47Wallet.getPaymentCodePrivate(account);
        const receiverPCodePublic = new PaymentCodePublic(ecc, bip32, buf.slice(1));
        const lastIndex = this.getLastDerivationIndex(zone, account);

        let addrIndex = lastIndex + 1;
        for (let attempts = 0; attempts < MAX_ADDRESS_DERIVATION_ATTEMPTS; attempts++) {
            const address = receiverPCodePublic.getPaymentAddress(walletPCodePrivate, addrIndex);
            if (isValidAddressForZone(this.coinType, address, zone)) {
                this.saveLastDerivationIndex(zone, account, addrIndex);
                const pubkey = receiverPCodePublic.derivePaymentPublicKey(walletPCodePrivate, addrIndex);
                const pcInfo: QiAddressInfo = {
                    address,
                    pubKey: hexlify(pubkey),
                    index: addrIndex,
                    account,
                    zone,
                    change: false,
                    status: AddressStatus.UNKNOWN,
                    derivationPath: this.counterpartyPaymentCode,
                    lastSyncedBlock: null,
                };
                this.saveQiAddressInfo(pcInfo);
                return pcInfo;
            }
            addrIndex++;
        }

        throw new Error(
            `Failed to derive a valid address for the zone ${zone} after ${MAX_ADDRESS_DERIVATION_ATTEMPTS} attempts.`,
        );
    }

    public scan(): void {
        //! TODO: Implement this
    }

    public sync(): void {
        //! TODO: Implement this
    }
}
