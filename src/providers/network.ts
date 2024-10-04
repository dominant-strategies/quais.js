/**
 * A **Network** encapsulates the various properties required to interact with a specific chain.
 *
 * @category Providers
 */

import { getBigInt, assertArgument } from '../utils/index.js';

import type { BigNumberish } from '../utils/index.js';

/**
 * A Networkish can be used to allude to a Network, by specifying:
 *
 * - A {@link Network} object
 * - A well-known (or registered) network name
 * - A well-known (or registered) chain ID
 * - An object with sufficient details to describe a network
 *
 * @category Providers
 */
export type Networkish =
    | Network
    | number
    | bigint
    | string
    | {
          name?: string;
          chainId?: number;
      };

const Networks: Map<string | bigint, () => Network> = new Map();

/**
 * A **Network** provides access to a chain's properties and allows for plug-ins to extend functionality.
 *
 * @category Providers
 */
export class Network {
    #name: string;
    #chainId: bigint;

    /**
     * Creates a new **Network** for `name` and `chainId`.
     *
     * @param {string} name - The network name.
     * @param {BigNumberish} chainId - The network chain ID.
     */
    constructor(name: string, chainId: BigNumberish) {
        this.#name = name;
        this.#chainId = getBigInt(chainId);
    }

    /**
     * Returns a JSON-compatible representation of a Network.
     *
     * @returns {Object} The JSON representation of the network.
     */
    toJSON(): any {
        return { name: this.name, chainId: String(this.chainId) };
    }

    /**
     * The network common name.
     *
     * This is the canonical name, as networks might have multiple names.
     *
     * @returns {string} The network name.
     */
    get name(): string {
        return this.#name;
    }

    /**
     * Sets the network name.
     *
     * @param {string} value - The new network name.
     */
    set name(value: string) {
        this.#name = value;
    }

    /**
     * The network chain ID.
     *
     * @returns {bigint} The network chain ID.
     */
    get chainId(): bigint {
        return this.#chainId;
    }

    /**
     * Sets the network chain ID.
     *
     * @param {BigNumberish} value - The new network chain ID.
     */
    set chainId(value: BigNumberish) {
        this.#chainId = getBigInt(value, 'chainId');
    }

    /**
     * Returns true if `other` matches this network. Any chain ID must match, and if no chain ID is present, the name
     * must match.
     *
     * This method does not currently check for additional properties, such as plug-in compatibility.
     *
     * @ignore
     * @param {Networkish} other - The network to compare.
     * @returns {boolean} True if the networks match.
     */
    matches(other: Networkish): boolean {
        if (other == null) {
            return false;
        }

        if (typeof other === 'string') {
            try {
                return this.chainId === getBigInt(other);
                // eslint-disable-next-line no-empty
            } catch (error) {}
            return this.name === other;
        }

        if (typeof other === 'number' || typeof other === 'bigint') {
            try {
                return this.chainId === getBigInt(other);
                // eslint-disable-next-line no-empty
            } catch (error) {}
            return false;
        }

        if (typeof other === 'object') {
            if (other.chainId != null) {
                try {
                    return this.chainId === getBigInt(other.chainId);
                    // eslint-disable-next-line no-empty
                } catch (error) {}
                return false;
            }
            if (other.name != null) {
                return this.name === other.name;
            }
            return false;
        }

        return false;
    }

    /**
     * Create a copy of this Network.
     *
     * @returns {Network} A new Network instance.
     */
    clone(): Network {
        const clone = new Network(this.name, this.chainId);
        return clone;
    }

    /**
     * Returns a new Network for the `network` name or chainId.
     *
     * @param {Networkish} [network] - The network to get.
     * @returns {Network} The Network instance.
     * @throws {Error} If the network is invalid.
     */
    static from(network?: Networkish): Network {
        // Default network
        if (network == null) {
            return Network.from('mainnet');
        }

        // Canonical name or chain ID
        if (typeof network === 'number') {
            network = BigInt(network);
        }
        if (typeof network === 'string' || typeof network === 'bigint') {
            const networkFunc = Networks.get(network);
            if (networkFunc) {
                return networkFunc();
            }
            if (typeof network === 'bigint') {
                return new Network('unknown', network);
            }

            assertArgument(false, 'unknown network', 'network', network);
        }

        // Clonable with network-like abilities
        if (typeof (<Network>network).clone === 'function') {
            const clone = (<Network>network).clone();
            return clone;
        }

        // Networkish
        if (typeof network === 'object') {
            assertArgument(
                typeof network.name === 'string' && typeof network.chainId === 'number',
                'invalid network object name or chainId',
                'network',
                network,
            );

            const custom = new Network(<string>network.name, <number>network.chainId);

            return custom;
        }

        assertArgument(false, 'invalid network', 'network', network);
    }

    /**
     * Register `nameOrChainId` with a function which returns an instance of a Network representing that chain.
     *
     * @param {string | number | bigint} nameOrChainId - The name or chain ID to register.
     * @param {() => Network} networkFunc - The function to create the Network.
     * @throws {Error} If a network is already registered for `nameOrChainId`.
     */
    static register(nameOrChainId: string | number | bigint, networkFunc: () => Network): void {
        if (typeof nameOrChainId === 'number') {
            nameOrChainId = BigInt(nameOrChainId);
        }
        const existing = Networks.get(nameOrChainId);
        if (existing) {
            assertArgument(
                false,
                `conflicting network for ${JSON.stringify(existing.name)}`,
                'nameOrChainId',
                nameOrChainId,
            );
        }
        Networks.set(nameOrChainId, networkFunc);
    }
}
