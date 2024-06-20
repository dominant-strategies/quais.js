import { assert, isHexString } from '../utils/index.js';

import type { AbstractProvider, Subscriber } from './abstract-provider.js';
import type { EventFilter, OrphanFilter, ProviderEvent } from './provider.js';

/**
 * Deep copies an object.
 *
 * @param {any} obj - The object to copy.
 * @returns {any} The copied object.
 */
function copy(obj: any): any {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Return the polling subscriber for common events.
 *
 * @param {AbstractProvider} provider - The provider to attach the subscriber to.
 * @param {ProviderEvent} event - The event to subscribe to.
 * @returns {Subscriber} The polling subscriber.
 * @throws {Error} If the event is unsupported.
 * @category Providers
 */
export function getPollingSubscriber(provider: AbstractProvider, event: ProviderEvent): Subscriber {
    if (event === 'block') {
        return new PollingBlockSubscriber(provider);
    }
    if (isHexString(event, 32)) {
        return new PollingTransactionSubscriber(provider, event);
    }

    assert(false, 'unsupported polling event', 'UNSUPPORTED_OPERATION', {
        operation: 'getPollingSubscriber',
        info: { event },
    });
}

/**
 * A **PollingBlockSubscriber** polls at a regular interval for a change in the block number.
 *
 * @category Providers
 */
export class PollingBlockSubscriber implements Subscriber {
    #provider: AbstractProvider;
    #poller: null | number;
    #interval: number;

    // The most recent block we have scanned for events. The value -2
    // indicates we still need to fetch an initial block number
    #blockNumber: number;

    /**
     * Create a new **PollingBlockSubscriber** attached to `provider`.
     * @ignore
     */
    constructor(provider: AbstractProvider) {
        this.#provider = provider;
        this.#poller = null;
        this.#interval = 4000;
        this.#blockNumber = -2;
    }

    /**
     * The polling interval.
     *
     * @returns {number} The current polling interval.
     */
    get pollingInterval(): number {
        return this.#interval;
    }

    /**
     * Sets the polling interval.
     *
     * @param {number} value - The new polling interval.
     */
    set pollingInterval(value: number) {
        this.#interval = value;
    }

    /**
     * Polls for new blocks.
     *
     * @returns {Promise<void>} A promise that resolves when polling is complete.
     * @ignore
     */
    async #poll(): Promise<void> {
        try {
            const blockNumber = await this.#provider.getBlockNumber();

            // Bootstrap poll to setup our initial block number
            if (this.#blockNumber === -2) {
                this.#blockNumber = blockNumber;
                return;
            }

            // @TODO: Put a cap on the maximum number of events per loop?

            if (blockNumber !== this.#blockNumber) {
                for (let b = this.#blockNumber + 1; b <= blockNumber; b++) {
                    // We have been stopped
                    if (this.#poller == null) {
                        return;
                    }

                    await this.#provider.emit('block', b);
                }

                this.#blockNumber = blockNumber;
            }
        } catch (error) {
            // @TODO: Minor bump, add an "error" event to let subscribers
            //        know things went awry.
        }

        // We have been stopped
        if (this.#poller == null) {
            return;
        }

        this.#poller = this.#provider._setTimeout(this.#poll.bind(this), this.#interval);
    }

    /**
     * Starts the polling process.
     */
    start(): void {
        if (this.#poller) {
            return;
        }
        this.#poller = this.#provider._setTimeout(this.#poll.bind(this), this.#interval);
        this.#poll();
    }

    /**
     * Stops the polling process.
     */
    stop(): void {
        if (!this.#poller) {
            return;
        }
        this.#provider._clearTimeout(this.#poller);
        this.#poller = null;
    }

    /**
     * Pauses the polling process.
     *
     * @param {boolean} [dropWhilePaused] - Whether to drop the block number while paused.
     */
    pause(dropWhilePaused?: boolean): void {
        this.stop();
        if (dropWhilePaused) {
            this.#blockNumber = -2;
        }
    }

    /**
     * Resumes the polling process.
     */
    resume(): void {
        this.start();
    }
}

/**
 * An **OnBlockSubscriber** can be sub-classed, with a {@link OnBlockSubscriber._poll | **_poll**} implementation which
 * will be called on every new block.
 *
 * @category Providers
 */
export class OnBlockSubscriber implements Subscriber {
    #provider: AbstractProvider;
    #poll: (b: number) => void;
    #running: boolean;

    /**
     * Create a new **OnBlockSubscriber** attached to `provider`.
     * @ignore
     */
    constructor(provider: AbstractProvider) {
        this.#provider = provider;
        this.#running = false;
        this.#poll = (blockNumber: number) => {
            this._poll(blockNumber, this.#provider);
        };
    }

    /**
     * Called on every new block.
     *
     * @param {number} blockNumber - The block number.
     * @param {AbstractProvider} provider - The provider.
     * @returns {Promise<void>} A promise that resolves when the poll is complete.
     * @throws {Error} If the method is not overridden by a subclass.
     */
    async _poll(blockNumber: number, provider: AbstractProvider): Promise<void> {
        throw new Error('sub-classes must override this');
    }

    /**
     * Starts the subscriber.
     */
    start(): void {
        if (this.#running) {
            return;
        }
        this.#running = true;

        this.#poll(-2);
        this.#provider.on('block', this.#poll);
    }

    /**
     * Stops the subscriber.
     */
    stop(): void {
        if (!this.#running) {
            return;
        }
        this.#running = false;

        this.#provider.off('block', this.#poll);
    }

    /**
     * Pauses the subscriber.
     *
     * @param {boolean} [dropWhilePaused] - Whether to drop the block number while paused.
     */
    pause(dropWhilePaused?: boolean): void {
        this.stop();
    }

    /**
     * Resumes the subscriber.
     */
    resume(): void {
        this.start();
    }
}

/**
 * @ignore
 */
export class PollingOrphanSubscriber extends OnBlockSubscriber {
    #filter: OrphanFilter;

    /**
     * Create a new **PollingOrphanSubscriber** attached to `provider`, listening for `filter`.
     * @ignore
     */
    constructor(provider: AbstractProvider, filter: OrphanFilter) {
        super(provider);
        this.#filter = copy(filter);
    }

    /**
     * Polls for orphaned blocks.
     *
     * @param {number} blockNumber - The block number.
     * @param {AbstractProvider} provider - The provider.
     * @returns {Promise<void>} A promise that resolves when the poll is complete.
     * @throws {Error} If the method is not implemented.
     */
    async _poll(blockNumber: number, provider: AbstractProvider): Promise<void> {
        throw new Error('@TODO');
        console.log(this.#filter);
    }
}

/**
 * A **PollingTransactionSubscriber** will poll for a given transaction hash for its receipt.
 *
 * @category Providers
 */
export class PollingTransactionSubscriber extends OnBlockSubscriber {
    #hash: string;

    /**
     * Create a new **PollingTransactionSubscriber** attached to `provider`, listening for `hash`.
     * @ignore
     */
    constructor(provider: AbstractProvider, hash: string) {
        super(provider);
        this.#hash = hash;
    }

    /**
     * Polls for the transaction receipt.
     *
     * @param {number} blockNumber - The block number.
     * @param {AbstractProvider} provider - The provider.
     * @returns {Promise<void>} A promise that resolves when the poll is complete.
     */
    async _poll(blockNumber: number, provider: AbstractProvider): Promise<void> {
        const tx = await provider.getTransactionReceipt(this.#hash);
        if (tx) {
            provider.emit(this.#hash, tx);
        }
    }
}

/**
 * A **PollingEventSubscriber** will poll for a given filter for its logs.
 *
 * @category Providers
 */
export class PollingEventSubscriber implements Subscriber {
    #provider: AbstractProvider;
    #filter: EventFilter;
    #poller: (b: number) => void;
    #running: boolean;
    #blockNumber: number;

    /**
     * Create a new **PollingEventSubscriber** attached to `provider`, listening for `filter`.
     * @ignore
     */
    constructor(provider: AbstractProvider, filter: EventFilter) {
        this.#provider = provider;
        this.#filter = copy(filter);
        this.#poller = this.#poll.bind(this);
        this.#running = false;
        this.#blockNumber = -2;
    }

    /**
     * Polls for logs based on the filter.
     *
     * @param {number} blockNumber - The block number.
     * @returns {Promise<void>} A promise that resolves when the poll is complete.
     * @ignore
     */
    async #poll(blockNumber: number): Promise<void> {
        // The initial block hasn't been determined yet
        if (this.#blockNumber === -2) {
            return;
        }

        const filter = copy(this.#filter);
        filter.fromBlock = this.#blockNumber + 1;
        filter.toBlock = blockNumber;

        const logs = await this.#provider.getLogs(filter);

        // No logs could just mean the node has not indexed them yet,
        // so we keep a sliding window of 60 blocks to keep scanning
        if (logs.length === 0) {
            if (this.#blockNumber < blockNumber - 60) {
                this.#blockNumber = blockNumber - 60;
            }
            return;
        }

        for (const log of logs) {
            this.#provider.emit(this.#filter, log);

            // Only advance the block number when logs were found to
            // account for networks (like BNB and Polygon) which may
            // sacrifice event consistency for block event speed
            this.#blockNumber = log.blockNumber;
        }
    }

    /**
     * Starts the subscriber.
     */
    start(): void {
        if (this.#running) {
            return;
        }
        this.#running = true;

        if (this.#blockNumber === -2) {
            this.#provider.getBlockNumber().then((blockNumber) => {
                this.#blockNumber = blockNumber;
            });
        }
        this.#provider.on('block', this.#poller);
    }

    /**
     * Stops the subscriber.
     */
    stop(): void {
        if (!this.#running) {
            return;
        }
        this.#running = false;

        this.#provider.off('block', this.#poller);
    }

    /**
     * Pauses the subscriber.
     *
     * @param {boolean} [dropWhilePaused] - Whether to drop the block number while paused.
     */
    pause(dropWhilePaused?: boolean): void {
        this.stop();
        if (dropWhilePaused) {
            this.#blockNumber = -2;
        }
    }

    /**
     * Resumes the subscriber.
     */
    resume(): void {
        this.start();
    }
}
