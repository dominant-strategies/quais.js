import { Zone } from '../constants/zones.js';
import { getNumber } from '../utils/index.js';
import type { Subscriber } from './abstract-provider.js';
import type { Provider } from './provider.js';

/**
 * Interface for Connection RPC Provider.
 *
 * @category Providers
 * @interface
 */
export interface ConnectionRpcProvider extends Provider {
    /**
     * Subscribe to a specific event.
     *
     * @ignore
     * @param {any[]} param - The parameters for the subscription.
     * @param {function(any): void} processFunc - The function to process the result.
     * @returns {number} The subscription ID.
     */
    _subscribe(param: Array<any>, processFunc: (result: any) => void): number;

    /**
     * Unsubscribe from a specific event.
     *
     * @ignore
     * @param {number} filterId - The subscription ID to unsubscribe.
     * @returns {void}
     */
    _unsubscribe(filterId: number): void;
}

/**
 * Class for subscribing to block connections.
 *
 * @category Providers
 * @class
 * @implements {Subscriber}
 */
export class BlockConnectionSubscriber implements Subscriber {
    #provider: ConnectionRpcProvider;
    #blockNumber: number;
    #running: boolean;
    #filterId: null | number;
    #zone: Zone;

    /**
     * @ignore
     * @class
     * @param {ConnectionRpcProvider} provider - The provider for the connection.
     */
    constructor(provider: ConnectionRpcProvider, zone: Zone) {
        this.#provider = provider;
        this.#blockNumber = -2;
        this.#running = false;
        this.#filterId = null;
        this.#zone = zone;
    }

    /**
     * Start the block connection subscription.
     *
     * @returns {void}
     */
    start(): void {
        if (this.#running) {
            return;
        }
        this.#running = true;

        this.#filterId = this.#provider._subscribe(['newHeads'], (result: any) => {
            const blockNumber = getNumber(result.number);
            const initial = this.#blockNumber === -2 ? blockNumber : this.#blockNumber + 1;
            for (let b = initial; b <= blockNumber; b++) {
                this.#provider.emit('block', this.#zone, b);
            }
            this.#blockNumber = blockNumber;
        });
    }

    /**
     * Stop the block connection subscription.
     *
     * @returns {void}
     */
    stop(): void {
        if (!this.#running) {
            return;
        }
        this.#running = false;

        if (this.#filterId != null) {
            this.#provider._unsubscribe(this.#filterId);
            this.#filterId = null;
        }
    }

    /**
     * Pause the block connection subscription.
     *
     * @param {boolean} [dropWhilePaused=false] - Whether to drop blocks while paused. Default is `false`
     * @returns {void}
     */
    pause(dropWhilePaused?: boolean): void {
        if (dropWhilePaused) {
            this.#blockNumber = -2;
        }
        this.stop();
    }

    /**
     * Resume the block connection subscription.
     *
     * @returns {void}
     */
    resume(): void {
        this.start();
    }
}
