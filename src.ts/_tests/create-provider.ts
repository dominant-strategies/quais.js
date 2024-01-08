import {
    FallbackProvider,
    isError,
} from "../index.js";

import type { AbstractProvider } from "../index.js";

interface ProviderCreator {
    name: string;
    networks: Array<string>;
    create: (network: string) => null | AbstractProvider;
};

const ethNetworks = [ "default", "mainnet" ];

const ProviderCreators: Array<ProviderCreator> = [
    {
        name: "FallbackProvider",
        networks: ethNetworks,
        create: function(network: string) {
            const providers: Array<AbstractProvider> = [];
            for (const providerName of [ "JsonRpcProvider" ]) {
                const provider = getProvider(providerName, network);
                if (provider) { providers.push(provider); }
            }
            if (providers.length === 0) { throw new Error("UNSUPPORTED NETWORK"); }
            return new FallbackProvider(providers);
        }
    },
];

let setup = false;
const cleanup: Array<() => void> = [ ];
export function setupProviders(): void {
    after(function() {
        for (const func of cleanup) { func(); }
    });
    setup = true;
}

export const providerNames = Object.freeze(ProviderCreators.map((c) => (c.name)));

function getCreator(provider: string): null | ProviderCreator {
    const creators = ProviderCreators.filter((c) => (c.name === provider));
    if (creators.length === 1) { return creators[0]; }
    return null;
}

export function getProviderNetworks(provider: string): Array<string> {
    const creator = getCreator(provider);
    if (creator) { return creator.networks; }
    return [ ];
}

export function getProvider(provider: string, network: string): null | AbstractProvider {
    if (setup == false) { throw new Error("MUST CALL setupProviders in root context"); }
    console.log(`getProvider: ${ provider }.${ network }`);
    const creator = getCreator(provider);
    try {
        if (creator) {
            const provider = creator.create(network);
            if (provider) {
                cleanup.push(() => { provider.destroy(); });
            }
            return provider;
        }
    } catch (error) {
        if (!isError(error, "INVALID_ARGUMENT")) { throw error; }
    }
    return null;
}

export function checkProvider(provider: string, network: string): boolean {
    const creator = getCreator(provider);
    return (creator != null);
}

export function connect(network: string): AbstractProvider {
    const provider = getProvider("InfuraProvider", network);
    if (provider == null) { throw new Error(`could not connect to ${ network }`); }
    return provider;
}
