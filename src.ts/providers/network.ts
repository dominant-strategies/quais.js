/**
 *  A **Network** encapsulates the various properties required to
 *  interact with a specific chain.
 *
 *  @_subsection: api/providers:Networks  [networks]
 */

import { getBigInt, assert, assertArgument } from "../utils/index.js";

import {
    EnsPlugin, FetchUrlFeeDataNetworkPlugin, GasCostPlugin
} from "./plugins-network.js";

import type { BigNumberish } from "../utils/index.js";

import type { NetworkPlugin } from "./plugins-network.js";


/**
 *  A Networkish can be used to allude to a Network, by specifing:
 *  - a [Network](../classes/Network) object
 *  - a well-known (or registered) network name
 *  - a well-known (or registered) chain ID
 *  - an object with sufficient details to describe a network
 * 
 *  @category Providers
 */
export type Networkish = Network | number | bigint | string | {
    name?: string,
    chainId?: number,
    //layerOneConnection?: Provider,
    ensAddress?: string,
    ensNetwork?: number
};

const Networks: Map<string | bigint, () => Network> = new Map();


/**
 *  A **Network** provides access to a chain's properties and allows
 *  for plug-ins to extend functionality.
 * 
 *  @category Providers
 */
export class Network {
    #name: string;
    #chainId: bigint;

    #plugins: Map<string, NetworkPlugin>;

    /**
     *  Creates a new **Network** for `name` and `chainId`.
     */
    constructor(name: string, chainId: BigNumberish) {
        this.#name = name;
        this.#chainId = getBigInt(chainId);
        this.#plugins = new Map();
    }

    /**
     *  Returns a JSON-compatible representation of a Network.
     */
    toJSON(): any {
        return { name: this.name, chainId: String(this.chainId) };
    }

    /**
     *  The network common name.
     *
     *  This is the canonical name, as networks migh have multiple
     *  names.
     */
    get name(): string { return this.#name; }
    set name(value: string) { this.#name =  value; }

    /**
     *  The network chain ID.
     */
    get chainId(): bigint { return this.#chainId; }
    set chainId(value: BigNumberish) { this.#chainId = getBigInt(value, "chainId"); }

    /**
     *  Returns true if `other` matches this network. Any chain ID
     *  must match, and if no chain ID is present, the name must match.
     *
     *  This method does not currently check for additional properties,
     *  such as ENS address or plug-in compatibility.
     * 
     *  @param { Networkish } other - The network to compare.
     *  @returns { boolean } True if the networks match.
     */
    matches(other: Networkish): boolean {
        if (other == null) { return false; }

        if (typeof(other) === "string") {
            try {
                return (this.chainId === getBigInt(other));
            } catch (error) { }
            return (this.name === other);
        }

        if (typeof(other) === "number" || typeof(other) === "bigint") {
            try {
                return (this.chainId === getBigInt(other));
            } catch (error) { }
            return false;
        }

        if (typeof(other) === "object") {
            if (other.chainId != null) {
                try {
                    return (this.chainId === getBigInt(other.chainId));
                } catch (error) { }
                return false;
            }
            if (other.name != null) {
                return (this.name === other.name);
            }
            return false;
        }

        return false;
    }

    /**
     *  Returns the list of plugins currently attached to this Network.
     */
    get plugins(): Array<NetworkPlugin> {
        return Array.from(this.#plugins.values());
    }

    /**
     *  Attach a new `plugin` to this Network. The network name
     *  must be unique, excluding any fragment.
     * 
     *  @param {NetworkPlugin} plugin - The plugin to attach.
     *  @returns {this} This Network instance.
     */
    attachPlugin(plugin: NetworkPlugin): this {
        if (this.#plugins.get(plugin.name)) {
            throw new Error(`cannot replace existing plugin: ${ plugin.name } `);
        }
        this.#plugins.set(plugin.name, plugin.clone());
        return this;
    }

    /**
     *  Return the plugin, if any, matching `name` exactly. Plugins
     *  with fragments will not be returned unless `name` includes
     *  a fragment.
     * 
     *  @param {string} name - The name of the plugin to get.
     *  @returns {NetworkPlugin | null} The plugin, or null if not found.
     */
    getPlugin<T extends NetworkPlugin = NetworkPlugin>(name: string): null | T {
        return <T>(this.#plugins.get(name)) || null;
    }

    /**
     *  Gets a list of all plugins that match `name`, with otr without
     *  a fragment.
     * 
     *  @param {string} basename - The base name of the plugin.
     *  @returns {Array<NetworkPlugin>} The list of plugins.
     */
    getPlugins<T extends NetworkPlugin = NetworkPlugin>(basename: string): Array<T> {
        return <Array<T>>(this.plugins.filter((p) => (p.name.split("#")[0] === basename)));
    }

    /**
     *  Create a copy of this Network.
     */
    clone(): Network {
        const clone = new Network(this.name, this.chainId);
        this.plugins.forEach((plugin) => {
            clone.attachPlugin(plugin.clone());
        });
        return clone;
    }

