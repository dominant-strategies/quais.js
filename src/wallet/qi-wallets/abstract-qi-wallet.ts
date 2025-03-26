import { AddressStatus, OutpointInfo, QiAddressInfo } from '../index.js';
import { denominations } from '../../transaction/utxo.js';
import { Provider } from '../../providers/index.js';
import { AllowedCoinType, toShard, Zone } from '../../constants/index.js';
import { Outpoint } from '../../transaction/utxo.js';

/**
 * Represents a mapping of addresses to outpoints.
 */
type OutpointDeltaResponse = { [address: string]: Outpoint[] };

/**
 * Callback type for handling outpoint changes during scanning/syncing.
 */
type OutpointsCallback = (outpoints: OutpointDeltaResponse) => Promise<void>;

/**
 * Represents the result of checking address usage.
 */
interface AddressUseResult {
    isUsed: boolean;
    outpoints: Outpoint[];
}

/**
 * Represents a block reference with hash and number.
 */
interface BlockReference {
    hash: string;
    number: number;
}

export abstract class AbstractQiWallet {
    protected provider?: Provider;
    // coin type for bip44 derivation
    protected coinType: AllowedCoinType = 969;
    // map of address to address info
    protected addresses: Map<string, QiAddressInfo> = new Map();
    // last derivation indexes for each zone and account
    protected lastDerivationIndexes: Map<Zone, Map<number, number>> = new Map();
    // map of address to outpoint info
    protected availableOutpoints: Map<string, OutpointInfo> = new Map();

    protected gapLimit: number = 5;

    constructor(gapLimit: number) {
        this.gapLimit = gapLimit;
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
     * Sets the provider for the wallet.
     *
     * @param {Provider} provider - The provider to use for blockchain interactions
     */
    public setProvider(provider: Provider): void {
        this.provider = provider;
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
            const key = `${outpointInfo.outpoint.txhash}:${outpointInfo.outpoint.index}`;
            this.availableOutpoints.set(key, outpointInfo);
        }
        // mark each address as used
        for (const outpointInfo of outpointInfos) {
            const address = outpointInfo.address;
            const addressInfo = this.getAddressInfo(address);
            if (addressInfo) {
                addressInfo.status = AddressStatus.USED;
            }
        }
    }

    /**
     * Exports all addresses from the wallet.
     *
     * @returns {QiAddressInfo[]} Array of all address information stored in the wallet
     */
    public exportAllAddresses(): QiAddressInfo[] {
        return Array.from(this.addresses.values());
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
     * Imports address information into the wallet.
     *
     * @param {QiAddressInfo} addressInfo - The address information to import
     */
    public importAddressInfo(addressInfo: QiAddressInfo): void {
        // Save the address info
        this.saveQiAddressInfo(addressInfo);

        // Update last derivation index if needed
        const currentLastIndex = this.getLastDerivationIndex(addressInfo.zone, addressInfo.account);
        if (addressInfo.index > currentLastIndex) {
            this.saveLastDerivationIndex(addressInfo.zone, addressInfo.account, addressInfo.index);
        }
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
        const outpoints = this.getOutpoints(zone);
        return outpoints
            .filter((utxo) => utxo.outpoint.lock === 0 || currentBlock! >= utxo.outpoint.lock!)
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

    public getAddressesForAccount(account: number): QiAddressInfo[] {
        return Array.from(this.addresses.values()).filter((addr) => addr.account === account);
    }

    public getAddressInfo(address: string): QiAddressInfo | null {
        return this.addresses.get(address) ?? null;
    }

    public setAddresses(addresses: QiAddressInfo[]): void {
        this.addresses.clear();
        for (const address of addresses) {
            this.addresses.set(address.address, address);
        }
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
     * Scans the blockchain for addresses and their outpoints related to this wallet in a specific zone. This performs a
     * full scan, which may reset the wallet state for the given zone.
     *
     * @param {Zone} zone - The zone to scan
     * @param {number} [account=0] - The account to scan. Default is `0`
     * @returns {Promise<void>} A promise that resolves when the scan is complete
     */
    public async scan(zone: Zone, account: number = 0): Promise<void> {
        this.validateZone(zone);

        // Reset state for this zone before scanning
        this.resetWalletState(zone);

        // Perform the actual scan
        await this._scanAddresses(zone, account, true);
    }

    /**
     * Synchronizes the wallet's state with the blockchain for addresses in a specific zone. Unlike scan, this does not
     * reset wallet state but incrementally updates it.
     *
     * @param {Zone} zone - The zone to synchronize
     * @param {number} [account=0] - The account to synchronize. Default is `0`
     * @param {OutpointsCallback} [onOutpointsCreated] - Optional callback for created outpoints
     * @param {OutpointsCallback} [onOutpointsDeleted] - Optional callback for deleted outpoints
     * @returns {Promise<void>} A promise that resolves when the sync is complete
     */
    public async sync(
        zone: Zone,
        account: number = 0,
        onOutpointsCreated?: OutpointsCallback,
        onOutpointsDeleted?: OutpointsCallback,
    ): Promise<void> {
        this.validateZone(zone);
        await this._scanAddresses(zone, account, false, onOutpointsCreated, onOutpointsDeleted);
    }

    /**
     * Resets the wallet state for a specific zone by clearing outpoints and resetting address statuses. This resets all
     * address status to UNKNOWN and sets lastSyncedBlock to null for addresses in the zone.
     *
     * @param {Zone} zone - The zone to reset state for
     * @protected
     */
    protected resetWalletState(zone: Zone): void {
        // Clear outpoints for the specified zone
        const outpointKeysToDelete: string[] = [];

        this.availableOutpoints.forEach((outpointInfo, key) => {
            if (outpointInfo.zone === zone) {
                outpointKeysToDelete.push(key);
            }
        });

        for (const key of outpointKeysToDelete) {
            this.availableOutpoints.delete(key);
        }

        // Reset status and lastSyncedBlock for all addresses in this zone
        const addressesInZone = this.getAddressesInZone(zone);
        for (const address of addressesInZone) {
            // Create updated address with reset status and lastSyncedBlock
            const updatedAddress: QiAddressInfo = {
                ...address,
                status: AddressStatus.UNKNOWN,
                lastSyncedBlock: null,
            };

            // Update in the addresses map
            this.addresses.set(address.address, updatedAddress);
        }
    }

    /**
     * Protected method that scans addresses in the wallet for the specified zone and account. This implementation
     * provides a generic scanning approach for a single derivation path.
     *
     * @param {Zone} zone - The zone to scan
     * @param {number} account - The account number
     * @param {boolean} resetState - Whether this is a full scan (true) or an incremental sync (false)
     * @param {OutpointsCallback} [onOutpointsCreated] - Optional callback for created outpoints
     * @param {OutpointsCallback} [onOutpointsDeleted] - Optional callback for deleted outpoints
     * @returns {Promise<void>} A promise that resolves when the scan is complete
     * @protected
     */
    protected async _scanAddresses(
        zone: Zone,
        account: number,
        resetState: boolean,
        onOutpointsCreated?: OutpointsCallback,
        onOutpointsDeleted?: OutpointsCallback,
    ): Promise<void> {
        this.requireProvider();

        // Get the current block information
        const currentBlock = await this.getCurrentBlock(zone);

        // Get addresses for this zone and account
        const zoneAddresses = this.getAddressesInZone(zone).filter((addr) => addr.account === account);

        // Separate previously synced addresses from unsynced addresses
        const syncedAddresses: QiAddressInfo[] = [];
        const unsyncedAddresses: QiAddressInfo[] = [];

        for (const addr of zoneAddresses) {
            if (addr.lastSyncedBlock !== null && !resetState) {
                syncedAddresses.push(addr);
            } else {
                unsyncedAddresses.push(addr);
            }
        }

        // Track created and deleted outpoints for callbacks
        const createdOutpoints: OutpointDeltaResponse = {};
        const deletedOutpoints: OutpointDeltaResponse = {};

        // Process previously synced addresses - get outpoint deltas
        if (syncedAddresses.length > 0) {
            await this.processSyncedAddresses(syncedAddresses, currentBlock, createdOutpoints, deletedOutpoints);
        }

        // Process unsynced addresses - check if they've been used
        await this.processUnsyncedAddresses(unsyncedAddresses, currentBlock, createdOutpoints);

        // Generate new addresses up to gap limit if needed
        const consecutiveUnusedCount = this.countConsecutiveUnusedAddresses(zoneAddresses);
        await this.generateAddressesToGapLimit(zone, account, currentBlock, consecutiveUnusedCount, createdOutpoints);

        // Execute callbacks for created and deleted outpoints
        await this.executeOutpointCallbacks(createdOutpoints, deletedOutpoints, onOutpointsCreated, onOutpointsDeleted);
    }

    /**
     * Gets the current block information for a zone.
     *
     * @private
     * @param {Zone} zone - The zone to get the current block for
     * @returns {Promise<BlockReference>} The current block hash and number
     */
    private async getCurrentBlock(zone: Zone): Promise<BlockReference> {
        const block = await this.provider!.getBlock(toShard(zone), 'latest');
        if (!block) {
            throw new Error(`Failed to get latest block for zone ${zone}`);
        }
        return {
            hash: block.hash,
            number: block.woHeader.number,
        };
    }

    /**
     * Processes previously synced addresses to check for changes since last sync.
     *
     * @private
     * @param {QiAddressInfo[]} syncedAddresses - Addresses that have been previously synced
     * @param {BlockReference} currentBlock - Current block information
     * @param {OutpointDeltaResponse} createdOutpoints - Map to track created outpoints
     * @param {OutpointDeltaResponse} deletedOutpoints - Map to track deleted outpoints
     * @returns {Promise<void>}
     */
    private async processSyncedAddresses(
        syncedAddresses: QiAddressInfo[],
        currentBlock: BlockReference,
        createdOutpoints: OutpointDeltaResponse,
        deletedOutpoints: OutpointDeltaResponse,
    ): Promise<void> {
        // Group addresses by last synced block hash to batch queries
        const addressesByBlockHash: Map<string, string[]> = new Map();

        for (const addr of syncedAddresses) {
            if (!addr.lastSyncedBlock?.hash) continue;

            const blockHash = addr.lastSyncedBlock.hash;
            if (!addressesByBlockHash.has(blockHash)) {
                addressesByBlockHash.set(blockHash, []);
            }
            addressesByBlockHash.get(blockHash)!.push(addr.address);
        }

        // Process each batch of addresses with the same last synced block
        for (const [blockHash, addresses] of addressesByBlockHash.entries()) {
            // Get outpoint deltas for this batch
            const deltas = await this.provider!.getOutpointDeltas(addresses, blockHash);

            // Process each address's deltas
            for (const [address, delta] of Object.entries(deltas)) {
                const addressInfo = this.addresses.get(address);
                if (!addressInfo) continue;

                // Update address status and last synced block
                const updatedAddressInfo = {
                    ...addressInfo,
                    lastSyncedBlock: {
                        hash: currentBlock.hash,
                        number: currentBlock.number,
                    },
                };

                // Handle created outpoints
                if (delta.created && delta.created.length > 0) {
                    // Import the new outpoints
                    this.importOutpoints(
                        delta.created.map((outpoint) => ({
                            outpoint,
                            address,
                            zone: addressInfo.zone,
                            account: addressInfo.account,
                            derivationPath: addressInfo.derivationPath,
                        })),
                    );

                    // Track for callback
                    createdOutpoints[address] = delta.created;

                    // Set address as used
                    updatedAddressInfo.status = AddressStatus.USED;
                }

                // Handle deleted outpoints
                if (delta.deleted && delta.deleted.length > 0) {
                    // Remove outpoints from our mapping
                    for (const outpoint of delta.deleted) {
                        const key = `${outpoint.txhash}:${outpoint.index}`;
                        this.availableOutpoints.delete(key);
                    }

                    // Track for callback
                    deletedOutpoints[address] = delta.deleted;
                }

                // Update address in wallet
                this.addresses.set(address, updatedAddressInfo);
            }
        }
    }

    /**
     * Processes unsynced addresses to check if they have been used.
     *
     * @private
     * @param {QiAddressInfo[]} unsyncedAddresses - Addresses that have not been previously synced
     * @param {BlockReference} currentBlock - Current block information
     * @param {OutpointDeltaResponse} createdOutpoints - Map to track created outpoints
     * @returns {Promise<void>}
     */
    private async processUnsyncedAddresses(
        unsyncedAddresses: QiAddressInfo[],
        currentBlock: BlockReference,
        createdOutpoints: OutpointDeltaResponse,
    ): Promise<void> {
        const batchSize = 10; // Process in batches to avoid overwhelming the provider

        for (let i = 0; i < unsyncedAddresses.length; i += batchSize) {
            const batch = unsyncedAddresses.slice(i, i + batchSize);
            const checkPromises = batch.map((addr) => this.checkAddressUse(addr.address));
            const results = await Promise.all(checkPromises);

            for (let j = 0; j < batch.length; j++) {
                const addr = batch[j];
                const { isUsed, outpoints } = results[j];

                // Update address status
                const updatedAddr = {
                    ...addr,
                    status: isUsed ? AddressStatus.USED : AddressStatus.UNUSED,
                    lastSyncedBlock: {
                        hash: currentBlock.hash,
                        number: currentBlock.number,
                    },
                };
                // Import outpoints if found
                if (outpoints.length > 0) {
                    this.importOutpoints(
                        outpoints.map((outpoint) => ({
                            outpoint,
                            address: addr.address,
                            zone: addr.zone,
                            account: addr.account,
                            derivationPath: addr.derivationPath,
                        })),
                    );

                    // Track for callback
                    createdOutpoints[addr.address] = outpoints;
                }

                // Update address in wallet
                this.addresses.set(addr.address, updatedAddr);
            }

            // Yield to event loop to avoid blocking
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    /**
     * Counts the number of consecutive unused addresses in the provided list.
     *
     * @private
     * @param {QiAddressInfo[]} addresses - The addresses to check
     * @returns {number} The count of consecutive unused addresses at the end of the list
     */
    private countConsecutiveUnusedAddresses(addresses: QiAddressInfo[]): number {
        let count = 0;
        // Sort by index in ascending order to check oldest to newest
        const sortedAddresses = [...addresses].sort((a, b) => a.index - b.index);

        // Start from the end to count consecutive unused addresses in reverse
        for (let i = sortedAddresses.length - 1; i >= 0; i--) {
            if (sortedAddresses[i].status === AddressStatus.UNUSED) {
                count++;
            } else {
                break;
            }
        }

        return count;
    }

    /**
     * Generates new addresses up to the gap limit.
     *
     * @private
     * @param {Zone} zone - The zone to generate addresses for
     * @param {number} account - The account to generate addresses for
     * @param {BlockReference} currentBlock - Current block information
     * @param {number} currentUnusedCount - Current count of consecutive unused addresses
     * @param {OutpointDeltaResponse} createdOutpoints - Map to track created outpoints
     * @returns {Promise<void>}
     */
    private async generateAddressesToGapLimit(
        zone: Zone,
        account: number,
        currentBlock: BlockReference,
        currentUnusedCount: number,
        createdOutpoints: OutpointDeltaResponse,
    ): Promise<void> {
        let consecutiveUnused = currentUnusedCount;

        while (consecutiveUnused < this.gapLimit) {
            // Generate new address
            const newAddr = this.deriveNewAddress(zone, account);

            // Check if it's being used
            const { isUsed, outpoints } = await this.checkAddressUse(newAddr.address);

            // Update status
            newAddr.status = isUsed ? AddressStatus.USED : AddressStatus.UNUSED;
            newAddr.lastSyncedBlock = {
                hash: currentBlock.hash,
                number: currentBlock.number,
            };

            // Import outpoints if found
            if (outpoints.length > 0) {
                this.importOutpoints(
                    outpoints.map((outpoint) => ({
                        outpoint,
                        address: newAddr.address,
                        zone: newAddr.zone,
                        account: newAddr.account,
                        derivationPath: newAddr.derivationPath,
                    })),
                );

                // Track for callback
                createdOutpoints[newAddr.address] = outpoints;
            }

            // Save the new address
            this.addresses.set(newAddr.address, newAddr);

            // Update consecutive unused count
            if (newAddr.status === AddressStatus.USED) {
                consecutiveUnused = 0;
            } else {
                consecutiveUnused++;
            }

            // Stop if we've reached the gap limit
            if (consecutiveUnused >= this.gapLimit) {
                break;
            }

            // Yield to event loop
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    /**
     * Executes the callback functions for created and deleted outpoints.
     *
     * @private
     * @param {OutpointDeltaResponse} createdOutpoints - Map of created outpoints by address
     * @param {OutpointDeltaResponse} deletedOutpoints - Map of deleted outpoints by address
     * @param {OutpointsCallback} [onCreated] - Callback for created outpoints
     * @param {OutpointsCallback} [onDeleted] - Callback for deleted outpoints
     * @returns {Promise<void>}
     */
    private async executeOutpointCallbacks(
        createdOutpoints: OutpointDeltaResponse,
        deletedOutpoints: OutpointDeltaResponse,
        onCreated?: OutpointsCallback,
        onDeleted?: OutpointsCallback,
    ): Promise<void> {
        const executeCreated = async () => {
            if (onCreated && Object.keys(createdOutpoints).length > 0) {
                try {
                    await onCreated(createdOutpoints);
                } catch (error: any) {
                    console.error(`Error in onOutpointsCreated callback: ${error.message}`);
                }
            }
        };

        const executeDeleted = async () => {
            if (onDeleted && Object.keys(deletedOutpoints).length > 0) {
                try {
                    await onDeleted(deletedOutpoints);
                } catch (error: any) {
                    console.error(`Error in onOutpointsDeleted callback: ${error.message}`);
                }
            }
        };

        await Promise.all([executeCreated(), executeDeleted()]);
    }

    /**
     * Optional address use checker function that can be implemented by child classes. This allows extending the address
     * use detection beyond just checking for outpoints.
     */
    protected addressUseChecker?: (address: string) => Promise<boolean>;

    /**
     * Sets an external function to check if an address has been used. This extends the address use detection beyond
     * just checking for outpoints.
     *
     * @param {(address: string) => Promise<boolean>} checker - Function that returns true if address is used
     */
    public setAddressUseChecker(checker: (address: string) => Promise<boolean>): void {
        this.addressUseChecker = checker;
    }

    /**
     * Checks if an address has been used and retrieves its outpoints.
     *
     * @param {string} address - The address to check
     * @returns {Promise<AddressUseResult>} Whether the address is used and its outpoints
     * @protected
     */
    protected async checkAddressUse(address: string): Promise<AddressUseResult> {
        try {
            const outpoints = await this.provider!.getOutpointsByAddress(address);
            let isUsed = outpoints.length > 0;

            // If no outpoints found but we have an external checker, use it
            if (!isUsed && this.addressUseChecker) {
                isUsed = await this.addressUseChecker(address);
            }

            return { isUsed, outpoints };
        } catch (error) {
            console.error(`Error checking address use for ${address}:`, error);
            throw new Error(`Failed to check address use: ${error}`);
        }
    }
}
