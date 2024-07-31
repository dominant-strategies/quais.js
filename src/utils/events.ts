/**
 * Events allow for applications to use the observer pattern, which allows subscribing and publishing events, outside
 * the normal execution paths.
 */
import { Zone } from '../constants/zones.js';
import { defineProperties } from './properties.js';

/**
 * A callback function called when a an event is triggered.
 *
 * @category Utils
 */
export type Listener = (...args: Array<any>) => void;

/**
 * An **EventEmitterable** behaves similar to an EventEmitter except provides async access to its methods.
 *
 * An EventEmitter implements the observer pattern.
 *
 * @category Utils
 */
export interface EventEmitterable<T> {
    /**
     * Registers a `listener` that is called whenever the `event` occurs until unregistered.
     */
    on(event: T, listener: Listener, zone?: Zone): Promise<this>;

    /**
     * Registers a `listener` that is called the next time `event` occurs.
     */
    once(event: T, listener: Listener, zone?: Zone): Promise<this>;

    /**
     * Triggers each listener for `event` with the `args`.
     */
    emit(event: T, zone?: Zone, ...args: Array<any>): Promise<boolean>;

    /**
     * Resolves to the number of listeners for `event`.
     */
    listenerCount(event?: T): Promise<number>;

    /**
     * Resolves to the listeners for `event`.
     */
    listeners(event?: T): Promise<Array<Listener>>;

    /**
     * Unregister the `listener` for `event`. If `listener` is unspecified, all listeners are unregistered.
     */
    off(event: T, listener?: Listener, zone?: Zone): Promise<this>;

    /**
     * Unregister all listeners for `event`.
     */
    removeAllListeners(event?: T): Promise<this>;

    /**
     * Alias for {@link EventEmitterable.on | **on**}.
     */
    addListener(event: T, listener: Listener, zone?: Zone): Promise<this>;

    /**
     * Alias for {@link EventEmitterable.off | **off**}.
     */
    removeListener(event: T, listener: Listener, zone?: Zone): Promise<this>;
}

/**
 * When an {@link EventEmitterable | **EventEmitterable**} triggers a Listener, the callback always ahas one additional
 * argument passed, which is an **EventPayload**.
 *
 * @category Utils
 */
export class EventPayload<T> {
    /**
     * The event filter.
     */
    readonly filter!: T;

    /**
     * The **EventEmitterable**.
     */
    readonly emitter!: EventEmitterable<T>;

    readonly #listener: null | Listener;

    /**
     * Create a new **EventPayload** for `emitter` with the `listener` and for `filter`.
     */
    constructor(emitter: EventEmitterable<T>, listener: null | Listener, filter: T) {
        this.#listener = listener;
        defineProperties<EventPayload<any>>(this, { emitter, filter });
    }

    /**
     * Unregister the triggered listener for future events.
     */
    async removeListener(): Promise<void> {
        if (this.#listener == null) {
            return;
        }
        await this.emitter.off(this.filter, this.#listener);
    }
}
