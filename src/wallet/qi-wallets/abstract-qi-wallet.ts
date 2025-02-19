import { OutpointInfo, QiAddressInfo } from '../index.js';
import { denominations } from '../../transaction/utxo.js';
import { Provider } from '../../providers/index.js';
import { toShard, Zone } from '../../constants/index.js';

export abstract class AbstractQiWallet {
    protected provider?: Provider;
    // coin type for bip44 derivation
    protected coinType: number = 969;
    // map of address to address info
    protected addresses: Map<string, QiAddressInfo> = new Map();
    // last derivation indexes for each zone and account
    protected lastDerivationIndexes: Map<Zone, Map<number, number>> = new Map();
    // map of address to outpoint info
    protected availableOutpoints: Map<string, OutpointInfo> = new Map();

    public getAddressInfo(address: string): QiAddressInfo {
        const info = this.addresses.get(address);
        if (!info) {
            throw new Error(`Address ${address} not found in wallet`);
        }
        return info;
    }

    protected saveQiAddressInfo(addressInfo: QiAddressInfo): void {
        this.addresses.set(addressInfo.address, addressInfo);
    }

    /**
     * Gets the outpoints for the specified zone.
     *
     * @param {Zone} zone - The zone.
     * @returns {OutpointInfo[]} The outpoints for the zone.
     */
    public getOutpoints(zone: Zone): OutpointInfo[] {
        this.validateZone(zone);
        return Array.from(this.availableOutpoints.values()).filter((outpoint) => outpoint.zone === zone);
    }

    /**
     * Saves the last used derivation index for a specific zone and account.
     *
     * @param {Zone} zone - The zone for the derivation index
     * @param {number} account - The account number
     * @param {number} index - The derivation index to save
     */
    protected saveLastDerivationIndex(zone: Zone, account: number, index: number): void {
        if (!this.lastDerivationIndexes.has(zone)) {
            this.lastDerivationIndexes.set(zone, new Map());
        }
        this.lastDerivationIndexes.get(zone)!.set(account, index);
    }

    /**
     * Gets the last used derivation index for a specific zone and account.
     *
     * @param {Zone} zone - The zone for the derivation index
     * @param {number} account - The account number
     * @returns {number} The last derivation index that was used, or -1 if none exists
     */
    protected getLastDerivationIndex(zone: Zone, account: number): number {
        return this.lastDerivationIndexes.get(zone)?.get(account) ?? -1;
    }

    /**
     * Deletes an address and its associated info from the wallet.
     *
     * @param {string} address - The address to delete
     */
    protected deleteAddress(address: string): void {
        this.addresses.delete(address);
    }

    /**
     * Validates the zone.
     *
     * @param {Zone} zone - The zone.
     * @throws {Error} If the zone is invalid.
     */
    protected validateZone(zone: Zone): void {
        if (!Object.values(Zone).includes(zone)) {
            throw new Error(`Invalid zone: ${zone}`);
        }
    }
    /**
     * Validates that a provider is set and available.
     *
     * @throws {Error} If no provider is set
     */
    protected requireProvider(): void {
        if (!this.provider) {
            throw new Error('Provider is required but not set');
        }
    }

    /**
     * Validates that an address exists in the wallet and optionally belongs to a specific account.
     *
     * @param {string} address - The address to validate
     * @param {number} [account] - Optional account number to validate against
     * @throws {Error} If address is not found or does not match the specified account
     */
    private validateAddressAndAccount(address: string, account?: number): void {
        const addressInfo = this.getAddressInfo(address);
        if (!addressInfo) {
            throw new Error(`Address ${address} not found in wallet`);
        }
        if (account && account !== addressInfo.account) {
            throw new Error(`Address ${address} does not match account ${account}`);
        }
    }

    /**
     * Validates an outpoint's data structure and contents.
     *
     * @param {OutpointInfo} outpoint - The outpoint information to validate
     * @throws {Error} If the outpoint data is invalid
     */
    private validateOutpointInfo(outpoint: OutpointInfo): void {
        // validate zone
        this.validateZone(outpoint.zone);

        // validate address and account
        this.validateAddressAndAccount(outpoint.address, outpoint.account);

        // validate Outpoint
        if (
            outpoint.outpoint.txhash == null ||
            outpoint.outpoint.index == null ||
            outpoint.outpoint.denomination == null
        ) {
            throw new Error(`Invalid Outpoint: ${JSON.stringify(outpoint)} `);
        }
    }

    /**
     * Imports and validates a list of outpoints into the wallet.
     *
     * @param {OutpointInfo[]} outpointInfos - Array of outpoint information to import
     * @throws {Error} If any outpoint fails validation
     */
    public importOutpoints(outpointInfos: OutpointInfo[]): void {
        for (const outpointInfo of outpointInfos) {
            this.validateOutpointInfo(outpointInfo);
            this.availableOutpoints.set(outpointInfo.address, outpointInfo);
        }
    }

    /**
     * Exports all available outpoints from the wallet.
     *
     * @returns {OutpointInfo[]} Array of all outpoint information stored in the wallet
     */
    public exportOutpoints(): OutpointInfo[] {
        return Array.from(this.availableOutpoints.values());
    }

    /**
     * Gets the total balance (spendable + locked) for a specific zone.
     *
     * @param {Zone} zone - The zone to get the balance for
     * @param {number} [blockNumber] - Optional block number for balance calculation
     * @param {boolean} [useCachedOutpoints=false] - Whether to use cached outpoints instead of network query. Default
     *   is `false`
     * @returns {Promise<bigint>} The total balance in the zone
     */
    public async getTotalBalance(
        zone: Zone,
        blockNumber?: number,
        useCachedOutpoints: boolean = false,
    ): Promise<bigint> {
        const [spendable, locked] = await Promise.all([
            this.getSpendableBalance(zone, blockNumber, useCachedOutpoints),
            this.getLockedBalance(zone, blockNumber, useCachedOutpoints),
        ]);
        return spendable + locked;
    }

    /**
     * Gets the locked balance for a specific zone.
     *
     * @param {Zone} zone - The zone to get the locked balance for
     * @param {number} [blockNumber] - Optional block number for balance calculation
     * @param {boolean} [useCachedOutpoints=false] - Whether to use cached outpoints instead of network query. Default
     *   is `false`
     * @returns {Promise<bigint>} The locked balance in the zone
     */
    public async getLockedBalance(
        zone: Zone,
        blockNumber?: number,
        useCachedOutpoints: boolean = false,
    ): Promise<bigint> {
        this.requireProvider();
        this.validateZone(zone);

        if (useCachedOutpoints) {
            const currentBlock = blockNumber ?? (await this.provider!.getBlockNumber(toShard(zone)));
            return this.calculateCachedLockedBalance(zone, currentBlock);
        }
        return await this.fetchNetworkLockedBalance(zone);
    }

    /**
     * Calculates the locked balance from cached outpoints.
     *
     * @param {Zone} zone - The zone to calculate the balance for
     * @param {number} currentBlock - The current block number
     * @returns {bigint} The calculated locked balance
     */
    protected calculateCachedLockedBalance(zone: Zone, currentBlock: number): bigint {
        return this.getOutpoints(zone)
            .filter((utxo) => utxo.outpoint.lock && utxo.outpoint.lock >= currentBlock)
            .reduce((sum, utxo) => sum + denominations[utxo.outpoint.denomination], BigInt(0));
    }

    /**
     * Fetches the locked balance from the network.
     *
     * @param {Zone} zone - The zone to fetch the balance for
     * @returns {Promise<bigint>} The locked balance from the network
     */
    protected async fetchNetworkLockedBalance(zone: Zone): Promise<bigint> {
        const balancePromises = this.getAddressesInZone(zone).map((addr) =>
            this.provider!.getLockedBalance(addr.address),
        );
        const balances = await Promise.all(balancePromises);
        return balances.reduce((sum, balance) => sum + (balance ?? BigInt(0)), BigInt(0));
    }

    /**
     * Gets the spendable balance for a specific zone.
     *
     * @param {Zone} zone - The zone to get the spendable balance for
     * @param {number} [blockNumber] - Optional block number for balance calculation
     * @param {boolean} [useCachedOutpoints=false] - Whether to use cached outpoints instead of network query. Default
     *   is `false`
     * @returns {Promise<bigint>} The spendable balance in the zone
     */
    public async getSpendableBalance(
        zone: Zone,
        blockNumber?: number,
        useCachedOutpoints: boolean = false,
    ): Promise<bigint> {
        this.requireProvider();
        this.validateZone(zone);

        if (useCachedOutpoints) {
            const currentBlock = blockNumber ?? (await this.provider!.getBlockNumber(toShard(zone)));
            return this.calculateCachedSpendableBalance(zone, currentBlock);
        }
        return await this.fetchNetworkSpendableBalance(zone);
    }

    /**
     * Calculates the spendable balance from cached outpoints.
     *
     * @param {Zone} zone - The zone to calculate the balance for
     * @param {number} currentBlock - The current block number
     * @returns {bigint} The calculated spendable balance
     */
    protected calculateCachedSpendableBalance(zone: Zone, currentBlock: number): bigint {
        return this.getOutpoints(zone)
            .filter((utxo) => utxo.outpoint.lock !== 0 && currentBlock! < utxo.outpoint.lock!)
            .reduce((sum, utxo) => sum + denominations[utxo.outpoint.denomination], BigInt(0));
    }

    /**
     * Fetches the spendable balance from the network.
     *
     * @param {Zone} zone - The zone to fetch the balance for
     * @returns {Promise<bigint>} The spendable balance from the network
     */
    protected async fetchNetworkSpendableBalance(zone: Zone): Promise<bigint> {
        const balancePromises = this.getAddressesInZone(zone).map((addr) =>
            this.provider!.getBalance(addr.address, 'latest'),
        );
        const balances = await Promise.all(balancePromises);
        return balances.reduce((sum, balance) => sum + (balance ?? BigInt(0)), BigInt(0));
    }

    /**
     * Gets all addresses that belong to a specific zone.
     *
     * @param {Zone} zone - The zone to get addresses for
     * @returns {QiAddressInfo[]} Array of address information in the zone
     */
    public getAddressesInZone(zone: Zone): QiAddressInfo[] {
        return Array.from(this.addresses.values()).filter((addr) => addr.zone === zone);
    }

    public getAddressessForAccount(account: number): QiAddressInfo[] {
        return Array.from(this.addresses.values()).filter((addr) => addr.account === account);
    }

    /**
     * Derives a new address for a specific zone and optional account.
     *
     * @param {Zone} zone - The zone to derive the address for
     * @param {number} [account] - Optional account number to derive the address for
     * @returns {QiAddressInfo} Information about the newly derived address
     */
    abstract deriveNewAddress(zone: Zone, account?: number, paymentCode?: string): QiAddressInfo;

    /**
     * Scans the blockchain for transactions related to this wallet.
     */
    abstract scan(): void;

    /**
     * Synchronizes the wallet's state with the blockchain.
     */
    abstract sync(): void;
}
