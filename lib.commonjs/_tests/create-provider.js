"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connect = exports.checkProvider = exports.getProvider = exports.getProviderNetworks = exports.providerNames = exports.setupProviders = void 0;
const tslib_1 = require("tslib");
const index_js_1 = require("../index.js");
const dotenv_1 = tslib_1.__importDefault(require("dotenv"));
dotenv_1.default.config();
;
const quaiNetworks = ["colosseum"];
const ProviderCreators = [
    {
        name: "JsonRpcProvider",
        networks: quaiNetworks,
        create: function (network) {
            return new index_js_1.JsonRpcProvider(process.env.RPC_URL, network);
        }
    },
];
let setup = false;
const cleanup = [];
function setupProviders() {
    after(function () {
        for (const func of cleanup) {
            func();
        }
    });
    setup = true;
}
exports.setupProviders = setupProviders;
exports.providerNames = Object.freeze(ProviderCreators.map((c) => (c.name)));
function getCreator(provider) {
    const creators = ProviderCreators.filter((c) => (c.name === provider));
    if (creators.length === 1) {
        return creators[0];
    }
    return null;
}
function getProviderNetworks(provider) {
    const creator = getCreator(provider);
    if (creator) {
        return creator.networks;
    }
    return [];
}
exports.getProviderNetworks = getProviderNetworks;
function getProvider(provider, network) {
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
        if (!(0, index_js_1.isError)(error, "INVALID_ARGUMENT")) {
            throw error;
        }
    }
    return null;
}
exports.getProvider = getProvider;
function checkProvider(provider, network) {
    const creator = getCreator(provider);
    return (creator != null);
}
exports.checkProvider = checkProvider;
function connect(network) {
    const provider = getProvider("JsonRpcProvider", network);
    if (provider == null) {
        throw new Error(`could not connect to ${network}`);
    }
    return provider;
}
exports.connect = connect;
//# sourceMappingURL=create-provider.js.map