import { AbstractQiWallet } from './abstract-qi-wallet.js';
import { AddressStatus, QiAddressInfo } from '../qi-hdwallet.js';
import { BIP44 } from '../bip44/bip44.js';
import { Zone } from '../../constants/index.js';
import { HDNodeWallet } from '../hdnodewallet.js';
import { getZoneForAddress } from '../../utils/index.js';
import { isQiAddress } from '../../address/index.js';

export class Bip44QiWallet extends AbstractQiWallet {
    private readonly bip44: BIP44;
    private readonly isChange: boolean;

    constructor(bip44: BIP44, isChange: boolean) {
        super();
        this.bip44 = bip44;
        this.isChange = isChange;
    }

    public deriveNewAddress(zone: Zone, account: number = 0): QiAddressInfo {
        const index = this.getLastDerivationIndex(zone, account) + 1;
        const hdNode = this.bip44.deriveNextAddressNode(account, index, zone, this.isChange);
        const newIndex = hdNode.index;
        this.saveLastDerivationIndex(zone, account, newIndex);
        const qiAddressInfo: QiAddressInfo = {
            address: hdNode.address,
            pubKey: hdNode.publicKey,
            index: newIndex,
            account,
            zone,
            change: this.isChange,
            status: AddressStatus.UNKNOWN,
            derivationPath: this.isChange ? 'BIP44:change' : 'BIP44:external',
            lastSyncedBlock: null,
        };
        this.saveQiAddressInfo(qiAddressInfo);
        return qiAddressInfo;
    }

    public getAddressNode(account: number, index: number): HDNodeWallet {
        return this.bip44._getAddressNode(account, this.isChange, index);
    }

    public addAddress(account: number, addressIndex: number): QiAddressInfo {
        const derivationPath = this.isChange ? 'BIP44:change' : 'BIP44:external';
        // check if the index is already in use
        if (this.getAddressessForAccount(account).some((addr) => addr.index === addressIndex)) {
            throw new Error(
                `Address index ${addressIndex} already exists in wallet under account ${account} and derivation path ${derivationPath}`,
            );
        }

        const addressNode = this.getAddressNode(account, addressIndex);
        const zone = getZoneForAddress(addressNode.address);
        if (!zone) {
            throw new Error(`Failed to derive a Qi valid address zone for the index ${addressIndex}`);
        }

        if (!isQiAddress(addressNode.address)) {
            throw new Error(`Address ${addressNode.address} is not a valid Qi address`);
        }

        const qiAddressInfo: QiAddressInfo = {
            address: addressNode.address,
            pubKey: addressNode.publicKey,
            index: addressIndex,
            account,
            zone,
            change: this.isChange,
            status: AddressStatus.UNKNOWN,
            derivationPath: derivationPath,
            lastSyncedBlock: null,
        };
        this.saveQiAddressInfo(qiAddressInfo);
        return qiAddressInfo;
    }

    public scan(): void {
        //! TODO: Implement this
    }

    public sync(): void {
        //! TODO: Implement this
    }
}
