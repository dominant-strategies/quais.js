/**
 * Property helper functions.
 */

function checkType(value: any, type: string, name: string): void {
    const types = type.split('|').map((t) => t.trim());
    for (let i = 0; i < types.length; i++) {
        switch (type) {
            case 'any':
                return;
            case 'bigint':
            case 'boolean':
            case 'number':
            case 'string':
                if (typeof value === type) {
                    return;
                }
        }
    }

    const error: any = new Error(`invalid value for type ${type}`);
    error.code = 'INVALID_ARGUMENT';
    error.argument = `value.${name}`;
    error.value = value;

    throw error;
}

/**
 * Resolves to a new object that is a copy of `value`, but with all values resolved.
 *
 * @category Utils
 * @param {Object} value - The object to resolve.
 * @returns {Promise<Object>} The resolved object.
 */
export async function resolveProperties<T>(value: { [P in keyof T]: T[P] | Promise<T[P]> }): Promise<T> {
    const keys = Object.keys(value);
    const results = await Promise.all(keys.map((k) => Promise.resolve(value[<keyof T>k])));
    return results.reduce(
        (accum: any, v, index) => {
            accum[keys[index]] = v;
            return accum;
        },
        <{ [P in keyof T]: T[P] }>{},
    );
}

// Crawl up the constructor chain to find a static method
export function getStatic<T>(ctor: any, key: string): T | null {
    for (let i = 0; i < 32; i++) {
        if (ctor[key]) {
            return ctor[key];
        }
        if (!ctor.prototype || typeof ctor.prototype !== 'object') {
            break;
        }
        ctor = Object.getPrototypeOf(ctor.prototype).constructor;
    }
    return null;
}

/**
 * Assigns the `values` to `target` as read-only values.
 *
 * It `types` is specified, the values are checked.
 *
 * @category Utils
 * @param {Object} target - The target object to assign to.
 * @param {Object} values - The values to assign.
 * @param {Object} types - The types to check.
 */
export function defineProperties<T>(
    target: T,
    values: { [K in keyof T]?: T[K] },
    types?: { [K in keyof T]?: string },
): void {
    for (const key in values) {
        const value = values[key];

        const type = types ? types[key] : null;
        if (type) {
            checkType(value, type, key);
        }

        Object.defineProperty(target, key, { enumerable: true, value, writable: false });
    }
}
