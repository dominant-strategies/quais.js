import { isError } from '../utils/index.js';

import { PollingEventSubscriber } from './subscriber-polling.js';

import type { AbstractProvider, Subscriber } from './abstract-provider.js';
import type { Network } from './network.js';
import { getZoneFromEventFilter, type EventFilter } from './provider.js';
import type { JsonRpcApiProvider } from './provider-jsonrpc.js';
import { Zone } from '../constants/index.js';

/**
 * Deep copies an object.
 *
 * @param {any} obj - The object to copy.
 * @returns {any} A deep copy of the object.
 */
function copy(obj: any): any {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Some backends support subscribing to events using a Filter ID.
 *
 * When subscribing with this technique, the node issues a unique **Filter ID**. At this point the node dedicates
 * resources to the filter, so that periodic calls to follow up on the **Filter ID** will receive any events since the
 * last call.
 *
 * @category Providers
 */
export class FilterIdSubscriber implements Subscriber {
    #provider: JsonRpcApiProvider;

    #filterIdPromise: null | Promise<string>;
    #poller: (b: number) => Promise<void>;

    #running: boolean;

    #network: null | Network;

    #hault: boolean;

    protected zone: Zone;

    /**
     * @ignore Creates A new **FilterIdSubscriber** which will use {@link FilterIdSubscriber._subscribe | **_subscribe**}
     *   and {@link FilterIdSubscriber._emitResults | **_emitResults**} to setup the subscription and provide the event
     *   to the `provider`.
     * @param {JsonRpcApiProvider<any>} provider - The provider to use.
     */
    constructor(provider: JsonRpcApiProvider<any>, zone: Zone) {
        this.#provider = provider;

        this.#filterIdPromise = null;
        this.#poller = this.#poll.bind(this);

        this.#running = false;

        this.#network = null;

        this.#hault = false;

        this.zone = zone;
    }

    /**
     * Sub-classes **must** override this to begin the subscription.
     *
     * @ignore
     * @param {JsonRpcApiProvider} provider - The provider to use.
     * @returns {Promise<string>} A promise that resolves to the subscription ID.
     * @throws {Error} If the method is not overridden.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _subscribe(provider: JsonRpcApiProvider): Promise<string> {
        throw new Error('subclasses must override this');
    }

    /**
     * Sub-classes **must** override this to handle the events.
     *
     * @ignore
     * @param {AbstractProvider} provider - The provider to use.
     * @param {any[]} result - The results to handle.
     * @returns {Promise<void>} A promise that resolves when the results are handled.
     * @throws {Error} If the method is not overridden.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _emitResults(provider: AbstractProvider, result: Array<any>): Promise<void> {
        throw new Error('subclasses must override this');
    }

    /**
     * Sub-classes **must** override this to handle recovery on errors.
     *
     * @ignore
     * @param {AbstractProvider} provider - The provider to use.
     * @returns {Subscriber} The recovered subscriber.
     * @throws {Error} If the method is not overridden.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _recover(provider: AbstractProvider): Subscriber {
        throw new Error('subclasses must override this');
    }

    /**
     * Polls for new events.
     *
     * @ignore
     * @param {number} blockNumber - The block number to poll from.
     * @returns {Promise<void>} A promise that resolves when polling is complete.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async #poll(blockNumber: number): Promise<void> {
        try {
            // Subscribe if necessary
            if (this.#filterIdPromise == null) {
                this.#filterIdPromise = this._subscribe(this.#provider);
            }

            // Get the Filter ID
            let filterId: null | string = null;
            try {
                filterId = await this.#filterIdPromise;
            } catch (error) {
                if (!isError(error, 'UNSUPPORTED_OPERATION') || error.operation !== 'quai_newFilter') {
                    throw error;
                }
            }

            // The backend does not support Filter ID; downgrade to
            // polling
            if (filterId == null) {
                this.#filterIdPromise = null;
                this.#provider._recoverSubscriber(this, this._recover(this.#provider));
                return;
            }

            const network = await this.#provider.getNetwork();
            if (!this.#network) {
                this.#network = network;
            }

            if ((this.#network as Network).chainId !== network.chainId) {
                throw new Error('chain changed');
            }

            if (this.#hault) {
                return;
            }

            const result = await this.#provider.send('quai_getFilterChanges', [filterId]);
            await this._emitResults(this.#provider, result);
        } catch (error) {
            console.log('@TODO', error);
        }

        this.#provider.once('block', this.#poller, this.zone);
    }

    /**
     * Tears down the subscription.
     *
     * @ignore
     */
    #teardown(): void {
        const filterIdPromise = this.#filterIdPromise;
        if (filterIdPromise) {
            this.#filterIdPromise = null;
            filterIdPromise.then((filterId) => {
                this.#provider.send('quai_uninstallFilter', [filterId]);
            });
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

        this.#poll(-2);
    }

    /**
     * Stops the subscriber.
     */
    stop(): void {
        if (!this.#running) {
            return;
        }
        this.#running = false;

        this.#hault = true;
        this.#teardown();
        this.#provider.off('block', this.#poller, this.zone);
    }

    /**
     * Pauses the subscriber.
     *
     * @param {boolean} [dropWhilePaused] - Whether to drop the subscription while paused.
     */
    pause(dropWhilePaused?: boolean): void {
        if (dropWhilePaused) {
            this.#teardown();
        }
        this.#provider.off('block', this.#poller, this.zone);
    }

    /**
     * Resumes the subscriber.
     */
    resume(): void {
        this.start();
    }
}

/**
 * A **FilterIdSubscriber** for receiving contract events.
 *
 * @category Providers
 */
export class FilterIdEventSubscriber extends FilterIdSubscriber {
    #event: EventFilter;

    /**
     * @ignore Creates A new **FilterIdEventSubscriber** attached to `provider` listening for `filter`.
     * @param {JsonRpcApiProvider<any>} provider - The provider to use.
     * @param {EventFilter} filter - The event filter to use.
     */
    constructor(provider: JsonRpcApiProvider<any>, filter: EventFilter) {
        const zone = getZoneFromEventFilter(filter);
        if (zone == null) {
            throw new Error('Unable to determine zone for event filter');
        }
        super(provider, zone);
        this.#event = copy(filter);
    }

    /**
     * Recovers the subscriber.
     *
     * @ignore
     * @param {AbstractProvider<any>} provider - The provider to use.
     * @returns {Subscriber} The recovered subscriber.
     */
    _recover(provider: AbstractProvider<any>): Subscriber {
        return new PollingEventSubscriber(provider, this.#event);
    }

    /**
     * Subscribes to the event filter.
     *
     * @ignore
     * @param {JsonRpcApiProvider<any>} provider - The provider to use.
     * @returns {Promise<string>} A promise that resolves to the subscription ID.
     */
    async _subscribe(provider: JsonRpcApiProvider<any>): Promise<string> {
        const filterId = await provider.send('quai_newFilter', [this.#event]);
        return filterId;
    }

    /**
     * Emits the results of the event filter.
     *
     * @ignore
     * @param {JsonRpcApiProvider<any>} provider - The provider to use.
     * @param {any[]} results - The results to emit.
     * @returns {Promise<void>} A promise that resolves when the results are emitted.
     */
    async _emitResults(provider: JsonRpcApiProvider<any>, results: Array<any>): Promise<void> {
        for (const result of results) {
            provider.emit(this.#event, this.zone, provider._wrapLog(result, provider._network));
        }
    }
}

/**
 * A **FilterIdSubscriber** for receiving pending transactions events.
 *
 * @category Providers
 */
export class FilterIdPendingSubscriber extends FilterIdSubscriber {
    /**
     * Subscribes to the pending transactions filter.
     *
     * @ignore
     * @param {JsonRpcApiProvider<any>} provider - The provider to use.
     * @returns {Promise<string>} A promise that resolves to the subscription ID.
     */
    async _subscribe(provider: JsonRpcApiProvider<any>): Promise<string> {
        return await provider.send('quai_newPendingTransactionFilter', []);
    }

    /**
     * Emits the results of the pending transactions filter.
     *
     * @ignore
     * @param {JsonRpcApiProvider<any>} provider - The provider to use.
     * @param {any[]} results - The results to emit.
     * @returns {Promise<void>} A promise that resolves when the results are emitted.
     */
    async _emitResults(provider: JsonRpcApiProvider<any>, results: Array<any>): Promise<void> {
        for (const result of results) {
            provider.emit('pending', this.zone, result);
        }
    }
}
