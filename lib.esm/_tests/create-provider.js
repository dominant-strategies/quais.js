import { isError, JsonRpcProvider, } from "../index.js";
import dotenv from "dotenv";
dotenv.config();
;
const quaiNetworks = ["colosseum"];
const ProviderCreators = [
    {
        name: "JsonRpcProvider",
        networks: quaiNetworks,
        create: function (network) {
            return new JsonRpcProvider(process.env.RPC_URL, network);
        }
    },
];
let setup = false;
const cleanup = [];
export function setupProviders() {
    after(function () {
        for (const func of cleanup) {
            func();
        }
    });
    setup = true;
}
export const providerNames = Object.freeze(ProviderCreators.map((c) => (c.name)));
function getCreator(provider) {
    const creators = ProviderCreators.filter((c) => (c.name === provider));
    if (creators.length === 1) {
        return creators[0];
    }
    return null;
}
export function getProviderNetworks(provider) {
    const creator = getCreator(provider);
    if (creator) {
        return creator.networks;
    }
    return [];
}
export function getProvider(provider, network) {
    if (setup == false) {
        throw new Error("MUST CALL setupProviders in root context");
    }
    const creator = getCreator(provider);
    try {
        if (creator) {
            const provider = creator.create(network);
            if (provider) {
                cleanup.push(() => { provider.destroy(); });
            }
            return provider;
        }
    }
    catch (error) {
        if (!isError(error, "INVALID_ARGUMENT")) {
            throw error;
        }
    }
    return null;
}
export function checkProvider(provider, network) {
    const creator = getCreator(provider);
    return (creator != null);
}
export function connect(network) {
    const provider = getProvider("JsonRpcProvider", network);
    if (provider == null) {
        throw new Error(`could not connect to ${network}`);
    }
    return provider;
}
//# sourceMappingURL=create-provider.js.map