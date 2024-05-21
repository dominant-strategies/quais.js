/**
 * Explain HD Wallets..
 *
 * @section api/wallet:HD Wallets  [hd-wallets]
 */
import { SigningKey } from "../crypto/index.js";
import { Mnemonic } from "./mnemonic.js";
import type { Provider } from "../providers/index.js";
import { HDWallet, AddressInfo} from "./hdwallet.js";
import { QUAI_COIN_TYPE } from '../constants/index.js';


// keeps track of the addresses and outpoints for a given shard (zone)
type ShardWalletData = {
    addressesInfo: AddressInfo[];
}

/**
 * An **QuaiHDWallet** is a [Signer](../interfaces/Signer) backed by the private key derived from an HD Node using the
 * [BIP-32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) stantard.
 *
 * An HD Node forms a hierarchal structure with each HD Node having a private key and the ability to derive child HD
 * Nodes, defined by a path indicating the index of each child.
 *
 * @category Wallet
 */
export class QuaiHDWallet extends HDWallet {

    /**
     *  The Quai cointype.
     */
    readonly coinType: number = QUAI_COIN_TYPE;

    /**
     * Map of shard name (zone) to shardWalletData
     * shardWalletData contains the private keys, addresses and derive indexes for the shard
     * that are known to the wallet
     */
    #shardWalletsMap: Map<string, ShardWalletData> = new Map();

    get shardWalletsMap(): Map<string, ShardWalletData> {
        return this.#shardWalletsMap;
    }

    set shardWallets(shardWallets: Map<string, ShardWalletData>) {
        this.#shardWalletsMap = shardWallets;
    }    
    
    constructor(guard: any, signingKey: SigningKey, accountFingerprint: string, chainCode: string, path: null | string, index: number, depth: number, mnemonic: null | Mnemonic, provider: null | Provider) {
        super(guard, signingKey, accountFingerprint, chainCode, path, index, depth, mnemonic, provider);
    }

    async getAddress(zone: string): Promise<string> {
        let index = 0;
        let shardWalletData: ShardWalletData | undefined = this.#shardWalletsMap.get(zone);
        if (shardWalletData) {
            const pos = shardWalletData.addressesInfo.length;
            index = shardWalletData!.addressesInfo[pos-1].index + 1;
        } else {
            shardWalletData = {addressesInfo: []};
            this.#shardWalletsMap.set(zone, shardWalletData);
        }

        const addressInfo = this.deriveAddress(index, zone, "Quai");
        shardWalletData.addressesInfo.push(addressInfo);
        return addressInfo.address;
    }
}
