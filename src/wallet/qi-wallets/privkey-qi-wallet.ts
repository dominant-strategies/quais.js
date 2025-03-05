import { AbstractQiWallet } from './abstract-qi-wallet.js';
import { isQiAddress } from '../../address/index.js';
import { computeAddress } from '../../address/index.js';
import { QiAddressInfo, AddressStatus } from '../qi-hdwallet.js';
import { getZoneForAddress, isHexString } from '../../utils/index.js';
import { SigningKey } from '../../crypto/index.js';
import { Zone } from '../../constants/zones.js';

export class PrivatekeyQiWallet extends AbstractQiWallet {
    public constructor() {
        super();
    }

    /**
     * Imports a private key and adds it to the wallet.
     *
     * @param {string} privateKey - The private key to import (hex string)
     * @returns {Promise<QiAddressInfo>} The address information for the imported key
     * @throws {Error} If the private key or derived address is invalid
     */
    public importPrivateKey(privateKey: string): QiAddressInfo {
        if (!isHexString(privateKey, 32)) {
            throw new Error(`Invalid private key format: must be 32-byte hex string (got ${privateKey})`);
        }

        const pubKey = SigningKey.computePublicKey(privateKey, true);
        const address = computeAddress(pubKey);

        // Validate address is for correct zone and ledger
        const addressZone = getZoneForAddress(address);
        if (!addressZone) {
            throw new Error(`Private key does not correspond to a valid address for any zone (got ${address})`);
        }
        if (!isQiAddress(address)) {
            throw new Error(`Private key does not correspond to a valid Qi address (got ${address})`);
        }

        if (this.addresses.has(address)) {
            throw new Error(`Address ${address} already exists in wallet`);
        }

        const addressInfo: QiAddressInfo = {
            pubKey,
            address,
            account: 0,
            index: -1,
            change: false,
            zone: addressZone,
            status: AddressStatus.UNUSED,
            derivationPath: privateKey, // Store private key in derivationPath
            lastSyncedBlock: null,
        };

        this.addresses.set(address, addressInfo);

        return addressInfo;
    }

    public getImportedAddresses(zone?: Zone): QiAddressInfo[] {
        if (zone !== undefined) {
            return [...this.addresses.values()].filter((info) => info.zone === zone);
        }
        return [...this.addresses.values()];
    }

    public getAddressesForAccount(account: number): QiAddressInfo[] {
        return [...this.addresses.values()].filter((info) => info.account === account);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public deriveNewAddress(zone: Zone, account: number = 0): QiAddressInfo {
        throw new Error('Not implemented');
    }

    public scan(): void {
        //! TODO: Implement this
    }

    public sync(): void {
        //! TODO: Implement this
    }
}
