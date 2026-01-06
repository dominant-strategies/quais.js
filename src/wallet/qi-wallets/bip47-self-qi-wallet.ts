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

/**
 * Generates a BIP47 private payment code for the specified account. The payment code is created by combining the
 * account's public key and chain code.
 *
 * @param {HDNodeWallet} root - The root HD node to derive from
 * @param {number} account - The account index for which to generate the private payment code.
 * @returns {PaymentCodePrivate} The PaymentCodePrivate instance.
 */
export function generatePaymentCodePrivate(root: HDNodeWallet, account: number, bip32?: BIP32API): PaymentCodePrivate {
    const bip32Instance = bip32 ?? (BIP32Factory(ecc) as BIP32API);
    const accountNode = root.deriveChild(account + HARDENED_OFFSET);

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
    return new PaymentCodePrivate(adapter, ecc, bip32Instance, pc);
}

/**
 * Derives a private key from a BIP47 payment code for a specific index and account. This function implements the BIP47
 * specification for deriving private keys from payment codes.
 *
 * @param {HDNodeWallet} root - The root HD node to derive from
 * @param {string} counterPartyPaymentCode - The Base58Check encoded payment code of the counterparty
 * @param {number} index - The index to use for key derivation
 * @param {number} account - The account index to use for derivation
 * @returns {string} The derived private key as a hex string
 * @throws {Error} If the payment code version is invalid
 */
export function getPrivateKeyFromPaymentCode(
    root: HDNodeWallet,
    counterPartyPaymentCode: string,
    index: number,
    account: number,
): string {
    const bip32 = BIP32Factory(ecc);
    const buf = bs58check.decode(counterPartyPaymentCode);
    const version = buf[0];
    if (version !== PC_VERSION) throw new Error('Invalid payment code version');

    const counterpartyPCodePublic = new PaymentCodePublic(ecc, bip32, buf.slice(1));
    const paymentCodePrivate = generatePaymentCodePrivate(root, account);
    const paymentPrivateKey = paymentCodePrivate.derivePaymentPrivateKey(counterpartyPCodePublic, index);
    return hexlify(paymentPrivateKey);
}

export class Bip47QiWalletSelf extends AbstractQiWallet {
    private readonly root: HDNodeWallet;
    private readonly counterpartyPaymentCode: string;
    private static readonly DEFAULT_GAP_LIMIT = 5;

    // Cached instances for performance - these are expensive to create
    private readonly bip32: BIP32API;
    private readonly senderPCodePublic: PaymentCodePublic;
    private readonly paymentCodePrivateCache: Map<number, PaymentCodePrivate> = new Map();

    public constructor(root: HDNodeWallet, counterpartyPaymentCode: string) {
        super(Bip47QiWalletSelf.DEFAULT_GAP_LIMIT);
        this.root = root;
        this.counterpartyPaymentCode = counterpartyPaymentCode;

        // Pre-compute expensive cryptographic objects once
        this.bip32 = BIP32Factory(ecc) as BIP32API;
        const buf = bs58check.decode(counterpartyPaymentCode);
        const version = buf[0];
        if (version !== PC_VERSION) throw new Error('Invalid payment code version');
        this.senderPCodePublic = new PaymentCodePublic(ecc, this.bip32, buf.slice(1));
    }

    /**
     * Generates a BIP47 private payment code for the specified account. The payment code is created by combining the
     * account's public key and chain code. Results are cached for performance.
     *
     * @private
     * @param {number} account - The account index for which to generate the private payment code.
     * @returns {PaymentCodePrivate} The PaymentCodePrivate instance.
     */
    public getPaymentCodePrivate(account: number = 0): PaymentCodePrivate {
        let cached = this.paymentCodePrivateCache.get(account);
        if (!cached) {
            cached = generatePaymentCodePrivate(this.root, account, this.bip32);
            this.paymentCodePrivateCache.set(account, cached);
        }
        return cached;
    }

    /**
     * Derives a new BIP47 receiving address for a specific zone and account using the sender's payment code. This
     * method follows the BIP47 specification for deriving payment addresses from a notification transaction.
     *
     * @param {Zone} zone - The zone to derive the address for
     * @param {number} [account=0] - The account index to use for derivation. Default is `0`
     * @returns {QiAddressInfo} Information about the newly derived address including:
     *
     *   - The derived address
     *   - Public key
     *   - Derivation index
     *   - Account number
     *   - Zone
     *   - Status and other metadata
     *
     * @throws {Error} If unable to derive a valid address for the zone after maximum attempts
     */
    public deriveNewAddress(zone: Zone, account: number = 0): QiAddressInfo {
        const walletPCodePrivate = this.getPaymentCodePrivate(account);

        const lastIndex = this.getLastDerivationIndex(zone, account);
        let addrIndex = lastIndex + 1;

        for (let attempts = 0; attempts < MAX_ADDRESS_DERIVATION_ATTEMPTS; attempts++) {
            const address = walletPCodePrivate.getPaymentAddress(this.senderPCodePublic, addrIndex);
            if (isValidAddressForZone(this.coinType, address, zone)) {
                this.saveLastDerivationIndex(zone, account, addrIndex);
                const pubkey = walletPCodePrivate.derivePaymentPublicKey(this.senderPCodePublic, addrIndex);
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
}
