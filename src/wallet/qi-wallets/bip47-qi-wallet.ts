import { AbstractQiWallet } from './abstract-qi-wallet.js';
import { HDNodeWallet } from '../hdnodewallet.js';
import { AddressStatus, QiAddressInfo } from '../qi-hdwallet.js';
import { Zone } from '../../constants/index.js';
import { BIP32Factory } from '../bip32/bip32.js';
import ecc from '@bitcoinerlab/secp256k1';
import { type BIP32API, HDNodeBIP32Adapter } from '../bip32/types.js';
import { getBytes, hexlify } from '../../utils/index.js';
import { bs58check } from '../bip32/crypto.js';
import { PaymentCodePrivate, PaymentCodePublic, PC_VERSION } from '../payment-codes.js';
import { HARDENED_OFFSET, MAX_ADDRESS_DERIVATION_ATTEMPTS } from '../utils.js';
import { isValidAddressForZone } from '../utils.js';

export class Bip47QiWalletSelf extends AbstractQiWallet {
    private readonly root: HDNodeWallet;

    public constructor(root: HDNodeWallet) {
        super();
        this.root = root;
    }

    /**
     * Generates a BIP47 private payment code for the specified account. The payment code is created by combining the
     * account's public key and chain code.
     *
     * @private
     * @param {number} account - The account index for which to generate the private payment code.
     * @returns {Promise<PaymentCodePrivate>} A promise that resolves to the PaymentCodePrivate instance.
     */
    public getPaymentCodePrivate(account: number): PaymentCodePrivate {
        const bip32 = BIP32Factory(ecc) as BIP32API;

        const accountNode = this.root.deriveChild(account + HARDENED_OFFSET);

        // payment code array
        const pc = new Uint8Array(80);

        // set version + options
        pc.set([1, 0]);

        // set the public key
        const pubKey = accountNode.publicKey;
        pc.set(getBytes(pubKey), 2);

        // set the chain code
        const chainCode = accountNode.chainCode;
        pc.set(getBytes(chainCode), 35);

        const adapter = new HDNodeBIP32Adapter(accountNode);

        return new PaymentCodePrivate(adapter, ecc, bip32, pc);
    }

    public deriveNewAddress(zone: Zone, account: number = 0, senderPaymentCode: string): QiAddressInfo {
        const bip32 = BIP32Factory(ecc) as BIP32API;
        const buf = bs58check.decode(senderPaymentCode);
        const version = buf[0];
        if (version !== PC_VERSION) throw new Error('Invalid payment code version');

        const senderPCodePublic = new PaymentCodePublic(ecc, bip32, buf.slice(1));
        const walletPCodePrivate = this.getPaymentCodePrivate(account);

        const lastIndex = this.getLastDerivationIndex(zone, account);
        let addrIndex = lastIndex + 1;
        for (let attempts = 0; attempts < MAX_ADDRESS_DERIVATION_ATTEMPTS; attempts++) {
            const address = walletPCodePrivate.getPaymentAddress(senderPCodePublic, addrIndex);
            if (isValidAddressForZone(this.coinType, address, zone)) {
                this.saveLastDerivationIndex(zone, account, addrIndex);
                const pubkey = walletPCodePrivate.derivePaymentPublicKey(senderPCodePublic, addrIndex);
                const pcInfo: QiAddressInfo = {
                    address,
                    pubKey: hexlify(pubkey),
                    index: addrIndex,
                    account,
                    zone,
                    change: false,
                    status: AddressStatus.UNKNOWN,
                    derivationPath: senderPaymentCode,
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

export class Bip47QiWalletCounterparty extends AbstractQiWallet {
    // private readonly root: HDNodeWallet;
    private readonly selfBip47Wallet: Bip47QiWalletSelf;

    public constructor(selfBip47Wallet: Bip47QiWalletSelf) {
        super();
        this.selfBip47Wallet = selfBip47Wallet;
    }

    public deriveNewAddress(zone: Zone, account: number = 0, receiverPaymentCode: string): QiAddressInfo {
        const bip32 = BIP32Factory(ecc) as BIP32API;
        const buf = bs58check.decode(receiverPaymentCode);
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
                    derivationPath: receiverPaymentCode,
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
