import { AddressStatus, OutpointInfo, QiAddressInfo } from '../index.js';
import { denominations } from '../../transaction/utxo.js';
import { Provider } from '../../providers/index.js';
import { AllowedCoinType, toShard, Zone } from '../../constants/index.js';
import { Outpoint } from '../../transaction/utxo.js';

/**
 * Represents a mapping of addresses to outpoints.
 */
type OutpointDeltaResponse = { [address: string]: OutpointInfo[] };

/**
 * Callback type for handling outpoint changes during scanning/syncing.
 */
type OutpointsCallback = (outpoints: OutpointDeltaResponse) => Promise<void>;

/**
 * Represents the result of checking address usage.
 */
export interface AddressUseResult {
    isUsed: boolean;
    outpoints: Outpoint[];
}

/**
 * Represents a block reference with hash and number.
 */
export interface BlockReference {
    hash: string;
    number: number;
}

/**
 * Represents a mapping of addresses to outpoints for callbacks.
 */
export type OutpointDeltaResponseType = { [address: string]: OutpointInfo[] };

/**
 * Default retry configuration for RPC calls.
 */
const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
};

/**
 * Checks if an error is a retryable server error (5xx status codes or network errors).
 *
 * @param {unknown} error - The error to check
 * @returns {boolean} True if the error is retryable
 */
function isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        // Check for 5xx status codes
        if (/50[0-4]|gateway|timeout|unavailable|overloaded/i.test(message)) {
            return true;
        }
        // Check for network errors
        if (/network|econnreset|econnrefused|etimedout|socket/i.test(message)) {
            return true;
        }
    }
    return false;
}

/**
 * Executes an async function with exponential backoff retry logic for transient errors.
 *
 * @template T
 * @param {() => Promise<T>} fn - The async function to execute
 * @param {string} operationName - Name of the operation for logging
 * @param {typeof DEFAULT_RETRY_CONFIG} [config] - Optional retry configuration
 * @returns {Promise<T>} The result of the function
 * @throws {Error} The last error if all retries fail
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    operationName: string,
    config = DEFAULT_RETRY_CONFIG,
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Don't retry if it's not a retryable error or we've exhausted retries
            if (!isRetryableError(error) || attempt === config.maxRetries) {
                throw lastError;
            }

            // Calculate delay with exponential backoff and jitter
            const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
            const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
            const delay = Math.min(exponentialDelay + jitter, config.maxDelayMs);

            console.warn(
                `${operationName} failed (attempt ${attempt + 1}/${config.maxRetries + 1}): ${lastError.message}. ` +
                    `Retrying in ${Math.round(delay)}ms...`,
            );

            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    // This should never be reached due to the throw in the loop, but TypeScript needs it
    throw lastError ?? new Error(`${operationName} failed after ${config.maxRetries + 1} attempts`);
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
        const scanStart = Date.now();
        const walletType = this.constructor.name;

        // Get the current block information
        let stepStart = Date.now();
        const currentBlock = await this.getCurrentBlock(zone);
        console.log(`[_scanAddresses ${walletType}] getCurrentBlock: ${Date.now() - stepStart}ms`);

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

        console.log(
            `[_scanAddresses ${walletType}] syncedAddresses: ${syncedAddresses.length}, unsyncedAddresses: ${unsyncedAddresses.length}`,
        );

        // Track created and deleted outpoints for callbacks
        const createdOutpoints: OutpointDeltaResponse = {};
        const deletedOutpoints: OutpointDeltaResponse = {};

        // Process previously synced addresses - get outpoint deltas
        if (syncedAddresses.length > 0) {
            stepStart = Date.now();
            await this.processSyncedAddresses(syncedAddresses, currentBlock, createdOutpoints, deletedOutpoints);
            console.log(
                `[_scanAddresses ${walletType}] processSyncedAddresses (${syncedAddresses.length} addrs): ${Date.now() - stepStart}ms`,
            );
        }

        // Process unsynced addresses - check if they've been used
        stepStart = Date.now();
        await this.processUnsyncedAddresses(unsyncedAddresses, currentBlock, createdOutpoints);
        console.log(
            `[_scanAddresses ${walletType}] processUnsyncedAddresses (${unsyncedAddresses.length} addrs): ${Date.now() - stepStart}ms`,
        );

        // Generate new addresses up to gap limit if needed
        stepStart = Date.now();
        const consecutiveUnusedCount = this.countConsecutiveUnusedAddresses(zoneAddresses);
        await this.generateAddressesToGapLimit(zone, account, currentBlock, consecutiveUnusedCount, createdOutpoints);
        console.log(`[_scanAddresses ${walletType}] generateAddressesToGapLimit: ${Date.now() - stepStart}ms`);

        // Execute callbacks for created and deleted outpoints
        stepStart = Date.now();
        await this.executeOutpointCallbacks(createdOutpoints, deletedOutpoints, onOutpointsCreated, onOutpointsDeleted);
        console.log(`[_scanAddresses ${walletType}] executeOutpointCallbacks: ${Date.now() - stepStart}ms`);

        console.log(`[_scanAddresses ${walletType}] TOTAL: ${Date.now() - scanStart}ms`);
    }

    /**
     * Gets the current block information for a zone.
     *
     * @private
     * @param {Zone} zone - The zone to get the current block for
     * @returns {Promise<BlockReference>} The current block hash and number
     */
    private async getCurrentBlock(zone: Zone): Promise<BlockReference> {
        const block = await retryWithBackoff(
            () => this.provider!.getBlock(toShard(zone), 'latest'),
            `getBlock(${zone})`,
        );
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
        const methodStart = Date.now();
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

        console.log(`[processSyncedAddresses] Grouped into ${addressesByBlockHash.size} batches by block hash`);

        let batchIndex = 0;
        // Process each batch of addresses with the same last synced block
        for (const [blockHash, addresses] of addressesByBlockHash.entries()) {
            const batchStart = Date.now();
            // Get outpoint deltas for this batch with retry logic
            const deltas = await retryWithBackoff(
                () => this.provider!.getOutpointDeltas(addresses, blockHash),
                `getOutpointDeltas(${addresses.length} addresses)`,
            );
            console.log(
                `[processSyncedAddresses] Batch ${++batchIndex}/${addressesByBlockHash.size}: getOutpointDeltas for ${addresses.length} addresses took ${Date.now() - batchStart}ms`,
            );

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
                    const outpointInfos = delta.created.map((outpoint) => ({
                        outpoint,
                        address,
                        zone: addressInfo.zone,
                        account: addressInfo.account,
                        derivationPath: addressInfo.derivationPath,
                    }));
                    this.importOutpoints(outpointInfos);

                    // Track for callback
                    createdOutpoints[address] = outpointInfos;

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
                    deletedOutpoints[address] = delta.deleted.map((outpoint) => ({
                        outpoint,
                        address,
                        zone: addressInfo.zone,
                        account: addressInfo.account,
                        derivationPath: addressInfo.derivationPath,
                    }));
                }

                // Update address in wallet
                this.addresses.set(address, updatedAddressInfo);
            }
        }
        console.log(`[processSyncedAddresses] TOTAL: ${Date.now() - methodStart}ms`);
    }

    /**
     * Processes unsynced addresses to check if they have been used. Uses batch JSON-RPC requests for efficiency (up to
     * 10,000 addresses per batch).
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
        if (unsyncedAddresses.length === 0) return;

        const methodStart = Date.now();
        // Process in large batches - the provider will send as a single JSON-RPC batch request
        const batchSize = 10000;
        let batchIndex = 0;
        const totalBatches = Math.ceil(unsyncedAddresses.length / batchSize);

        for (let i = 0; i < unsyncedAddresses.length; i += batchSize) {
            const batchStart = Date.now();
            const batch = unsyncedAddresses.slice(i, i + batchSize);
            const addressStrings = batch.map((addr) => addr.address);

            // Use batch method for single JSON-RPC request
            const results = await this.checkAddressesUse(addressStrings);
            console.log(
                `[processUnsyncedAddresses] Batch ${++batchIndex}/${totalBatches}: checkAddressesUse for ${batch.length} addresses took ${Date.now() - batchStart}ms`,
            );

            // Process all results
            for (const addr of batch) {
                const result = results.get(addr.address);
                if (!result) continue;

                const { isUsed, outpoints } = result;

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
                    const outpointInfos = outpoints.map((outpoint) => ({
                        outpoint,
                        address: addr.address,
                        zone: addr.zone,
                        account: addr.account,
                        derivationPath: addr.derivationPath,
                    }));
                    this.importOutpoints(outpointInfos);

                    // Track for callback
                    createdOutpoints[addr.address] = outpointInfos;
                }

                // Update address in wallet
                this.addresses.set(addr.address, updatedAddr);
            }
        }
        console.log(`[processUnsyncedAddresses] TOTAL: ${Date.now() - methodStart}ms`);
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
     * Generates new addresses up to the gap limit. Pre-generates addresses in batches and checks them with batch RPC
     * requests for efficiency.
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

        // Generate addresses needed to reach gap limit, plus a small buffer
        // Keep batch size small to avoid blocking the event loop with key derivation
        // (crypto operations are CPU-intensive)
        const batchMultiplier = 2;

        while (consecutiveUnused < this.gapLimit) {
            // Generate just enough addresses to potentially reach the gap limit
            // plus a small buffer to reduce RPC round-trips
            const addressesNeeded = this.gapLimit - consecutiveUnused;
            const addressesToGenerate = Math.max(addressesNeeded, this.gapLimit) * batchMultiplier;
            const newAddresses: QiAddressInfo[] = [];

            for (let i = 0; i < addressesToGenerate; i++) {
                newAddresses.push(this.deriveNewAddress(zone, account));
            }

            // Batch check all addresses at once
            const addressStrings = newAddresses.map((addr) => addr.address);
            const results = await this.checkAddressesUse(addressStrings);

            // Process results in order
            for (const newAddr of newAddresses) {
                const result = results.get(newAddr.address);
                if (!result) continue;

                const { isUsed, outpoints } = result;

                // Update status
                newAddr.status = isUsed ? AddressStatus.USED : AddressStatus.UNUSED;
                newAddr.lastSyncedBlock = {
                    hash: currentBlock.hash,
                    number: currentBlock.number,
                };

                // Import outpoints if found
                if (outpoints.length > 0) {
                    const outpointInfos = outpoints.map((outpoint) => ({
                        outpoint,
                        address: newAddr.address,
                        zone: newAddr.zone,
                        account: newAddr.account,
                        derivationPath: newAddr.derivationPath,
                    }));
                    this.importOutpoints(outpointInfos);

                    // Track for callback
                    createdOutpoints[newAddr.address] = outpointInfos;
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
                    return;
                }
            }
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

    /**
     * Batch check multiple addresses for usage and retrieve their outpoints. Uses JSON-RPC batch requests for
     * efficiency. Automatically splits into multiple batches if more than 10,000 addresses are provided.
     *
     * @param {string[]} addresses - The addresses to check
     * @returns {Promise<Map<string, AddressUseResult>>} Map of address to usage result
     * @protected
     */
    protected async checkAddressesUse(addresses: string[]): Promise<Map<string, AddressUseResult>> {
        if (addresses.length === 0) {
            return new Map();
        }

        try {
            const results = new Map<string, AddressUseResult>();
            const maxBatchSize = 10000;

            // Split into batches of 10k if needed
            for (let i = 0; i < addresses.length; i += maxBatchSize) {
                const batch = addresses.slice(i, i + maxBatchSize);
                const outpointsMap = await retryWithBackoff(
                    () => this.provider!.getOutpointsByAddresses(batch),
                    `getOutpointsByAddresses(${batch.length} addresses)`,
                );

                // Process results and check with external checker if needed
                for (const address of batch) {
                    const outpoints = outpointsMap.get(address) ?? [];
                    let isUsed = outpoints.length > 0;

                    // If no outpoints found but we have an external checker, use it
                    if (!isUsed && this.addressUseChecker) {
                        isUsed = await this.addressUseChecker(address);
                    }

                    results.set(address, { isUsed, outpoints });
                }
            }

            return results;
        } catch (error) {
            console.error(`Error batch checking addresses:`, error);
            throw new Error(`Failed to batch check addresses: ${error}`);
        }
    }

    // ================================
    // Consolidated Scan Helper Methods
    // ================================

    /**
     * Prepares the wallet for a consolidated scan by resetting state and returning all addresses that need to be
     * checked.
     *
     * @param {Zone} zone - The zone to prepare for scanning
     * @param {number} account - The account number
     * @param {boolean} resetState - Whether to reset wallet state
     * @returns {QiAddressInfo[]} Array of addresses that need to be checked
     */
    public prepareForScan(zone: Zone, account: number, resetState: boolean): QiAddressInfo[] {
        this.validateZone(zone);

        if (resetState) {
            this.resetWalletState(zone);
        }

        // Get addresses for this zone and account
        return this.getAddressesInZone(zone).filter((addr) => addr.account === account);
    }

    /**
     * Applies pre-fetched outpoint results to addresses in this wallet.
     *
     * @param {Map<string, AddressUseResult>} results - Map of address to outpoint results
     * @param {BlockReference} currentBlock - Current block reference
     * @param {OutpointDeltaResponse} createdOutpoints - Map to track created outpoints
     */
    public applyOutpointResults(
        results: Map<string, AddressUseResult>,
        currentBlock: BlockReference,
        createdOutpoints: OutpointDeltaResponse,
    ): void {
        for (const [address, result] of results) {
            const addressInfo = this.addresses.get(address);
            if (!addressInfo) continue;

            const { isUsed, outpoints } = result;

            // Update address status
            const updatedAddr: QiAddressInfo = {
                ...addressInfo,
                status: isUsed ? AddressStatus.USED : AddressStatus.UNUSED,
                lastSyncedBlock: {
                    hash: currentBlock.hash,
                    number: currentBlock.number,
                },
            };

            // Import outpoints if found
            if (outpoints.length > 0) {
                const outpointInfos = outpoints.map((outpoint) => ({
                    outpoint,
                    address: addressInfo.address,
                    zone: addressInfo.zone,
                    account: addressInfo.account,
                    derivationPath: addressInfo.derivationPath,
                }));
                this.importOutpoints(outpointInfos);

                // Track for callback
                createdOutpoints[addressInfo.address] = outpointInfos;
            }

            // Update address in wallet
            this.addresses.set(address, updatedAddr);
        }
    }

    /**
     * Derives a batch of new addresses for gap limit scanning.
     *
     * @param {Zone} zone - The zone to derive addresses for
     * @param {number} account - The account number
     * @param {number} count - Number of addresses to derive
     * @returns {QiAddressInfo[]} Array of newly derived addresses
     */
    public deriveAddressBatch(zone: Zone, account: number, count: number): QiAddressInfo[] {
        const newAddresses: QiAddressInfo[] = [];
        for (let i = 0; i < count; i++) {
            newAddresses.push(this.deriveNewAddress(zone, account));
        }
        return newAddresses;
    }

    /**
     * Gets the current gap limit status for this wallet in a zone.
     *
     * @param {Zone} zone - The zone to check
     * @param {number} account - The account number
     * @returns {{ consecutiveUnused: number; needsMore: boolean; addressesToGenerate: number }}
     */
    public getGapLimitStatus(
        zone: Zone,
        account: number,
    ): {
        consecutiveUnused: number;
        needsMore: boolean;
        addressesToGenerate: number;
    } {
        const addresses = this.getAddressesInZone(zone).filter((addr) => addr.account === account);
        const consecutiveUnused = this.countConsecutiveUnusedAddresses(addresses);
        const needsMore = consecutiveUnused < this.gapLimit;
        const addressesNeeded = this.gapLimit - consecutiveUnused;
        // Generate at least gapLimit addresses, with a multiplier for efficiency
        const addressesToGenerate = needsMore ? Math.max(addressesNeeded, this.gapLimit) * 2 : 0;

        return { consecutiveUnused, needsMore, addressesToGenerate };
    }

    /**
     * Applies results to newly derived addresses and updates gap limit tracking.
     *
     * @param {QiAddressInfo[]} newAddresses - The newly derived addresses
     * @param {Map<string, AddressUseResult>} results - Map of address to outpoint results
     * @param {BlockReference} currentBlock - Current block reference
     * @param {OutpointDeltaResponse} createdOutpoints - Map to track created outpoints
     * @returns {{ reachedGapLimit: boolean; consecutiveUnused: number }}
     */
    public applyNewAddressResults(
        newAddresses: QiAddressInfo[],
        results: Map<string, AddressUseResult>,
        currentBlock: BlockReference,
        createdOutpoints: OutpointDeltaResponse,
    ): { reachedGapLimit: boolean; consecutiveUnused: number } {
        // Get current consecutive unused count
        const existingAddresses = this.getAddressesInZone(newAddresses[0]?.zone ?? Zone.Cyprus1).filter(
            (addr) => addr.account === (newAddresses[0]?.account ?? 0),
        );
        let consecutiveUnused = this.countConsecutiveUnusedAddresses(existingAddresses);

        for (const newAddr of newAddresses) {
            const result = results.get(newAddr.address);
            if (!result) continue;

            const { isUsed, outpoints } = result;

            // Update status
            newAddr.status = isUsed ? AddressStatus.USED : AddressStatus.UNUSED;
            newAddr.lastSyncedBlock = {
                hash: currentBlock.hash,
                number: currentBlock.number,
            };

            // Import outpoints if found
            if (outpoints.length > 0) {
                const outpointInfos = outpoints.map((outpoint) => ({
                    outpoint,
                    address: newAddr.address,
                    zone: newAddr.zone,
                    account: newAddr.account,
                    derivationPath: newAddr.derivationPath,
                }));
                this.importOutpoints(outpointInfos);

                // Track for callback
                createdOutpoints[newAddr.address] = outpointInfos;
            }

            // Save the new address
            this.addresses.set(newAddr.address, newAddr);

            // Update consecutive unused count
            if (newAddr.status === AddressStatus.USED) {
                consecutiveUnused = 0;
            } else {
                consecutiveUnused++;
            }

            // Check if we've reached the gap limit
            if (consecutiveUnused >= this.gapLimit) {
                return { reachedGapLimit: true, consecutiveUnused };
            }
        }

        return { reachedGapLimit: consecutiveUnused >= this.gapLimit, consecutiveUnused };
    }

    /**
     * Gets the gap limit for this wallet.
     */
    public getGapLimit(): number {
        return this.gapLimit;
    }
}
