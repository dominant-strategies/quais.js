import { isError, JsonRpcProvider } from '../index.js';

import type { AbstractProvider } from '../index.js';
import dotenv from 'dotenv';
dotenv.config();

interface ProviderCreator {
    name: string;
    networks: Array<string>;
    create: (network: string) => null | AbstractProvider;
}

const quaiNetworks = ['colosseum'];

const ProviderCreators: Array<ProviderCreator> = [
    {
        name: 'JsonRpcProvider',
        networks: quaiNetworks,
        create: function (network: string) {
            return new JsonRpcProvider(process.env.RPC_URL, network);
        },
    },
];

let setup = false;
const cleanup: Array<() => void> = [];
export function setupProviders(): void {
    after(function () {
        for (const func of cleanup) {
            func();
        }
    });
    setup = true;
}

export const providerNames = Object.freeze(ProviderCreators.map((c) => c.name));

function getCreator(provider: string): null | ProviderCreator {
    const creators = ProviderCreators.filter((c) => c.name === provider);
    if (creators.length === 1) {
        return creators[0];
    }
    return null;
}

export function getProviderNetworks(provider: string): Array<string> {
    const creator = getCreator(provider);
    if (creator) {
        return creator.networks;
    }
    return [];
}

export function getProvider(provider: string, network: string): null | AbstractProvider {
    if (setup == false) {
        throw new Error('MUST CALL setupProviders in root context');
    }
    const creator = getCreator(provider);
    try {
        if (creator) {
            const provider = creator.create(network);
            if (provider) {
                cleanup.push(() => {
                    provider.destroy();
                });
            }
            return provider;
        }
    } catch (error) {
        if (!isError(error, 'INVALID_ARGUMENT')) {
            throw error;
        }
    }
    return null;
}

export function checkProvider(provider: string, network: string): boolean {
    const creator = getCreator(provider);
    return creator != null;
}

export function connect(network: string): AbstractProvider {
    const provider = getProvider('JsonRpcProvider', network);
    if (provider == null) {
        throw new Error(`could not connect to ${network}`);
    }
    return provider;
}
