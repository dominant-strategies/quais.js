import { AbstractProviderPlugin } from './abstract-provider.js';
import { defineProperties } from '../utils/index.js';

import type { AbstractProvider, PerformActionRequest } from './abstract-provider.js';

export const PluginIdFallbackProvider = 'org.quais.plugins.provider.QualifiedPlugin';

export class CheckQualifiedPlugin implements AbstractProviderPlugin {
    declare name: string;

    constructor() {
        defineProperties<CheckQualifiedPlugin>(this, { name: PluginIdFallbackProvider });
    }

    // TODO: `provider` is not used, remove?
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    connect(provider: AbstractProvider): CheckQualifiedPlugin {
        return this;
    }

    // Retruns true if this value should be considered qualified for inclusion in the quorum.
    // TODO: `action` and `result` are not used, remove?
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isQualified(action: PerformActionRequest, result: any): boolean {
        return true;
    }
}

export class PossiblyPrunedTransactionPlugin extends CheckQualifiedPlugin {
    isQualified(action: PerformActionRequest, result: any): boolean {
        if (action.method === 'getTransaction' || action.method === 'getTransactionReceipt') {
            if (result == null) {
                return false;
            }
        }
        return super.isQualified(action, result);
    }
}
