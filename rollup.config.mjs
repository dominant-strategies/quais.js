import { nodeResolve } from '@rollup/plugin-node-resolve';

function onwarn(warning) {
    const ignoreCodes = ['CIRCULAR_DEPENDENCY', 'THIS_IS_UNDEFINED'];
    if (!ignoreCodes.includes(warning.code)) {
        console.error(`(!) ${warning.message}`);
    }
}

function getConfig(opts) {
    if (opts == null) {
        opts = {};
    }

    const file = `./dist/quais${opts.suffix || ''}.js`;
    const exportConditions = ['import', 'default'];
    const mainFields = ['module', 'main'];
    if (opts.browser) {
        mainFields.unshift('browser');
    }

    return {
        input: './lib/esm/index.js',
        output: {
            file,
            banner: "const __$G = (typeof globalThis !== 'undefined' ? globalThis: typeof window !== 'undefined' ? window: typeof global !== 'undefined' ? global: typeof self !== 'undefined' ? self: {});",
            name: opts.name || undefined,
            format: opts.format || 'esm',
            sourcemap: true,
            globals: {
                'google-protobuf': 'pb_1',
                '@bitcoinerlab/secp256k1': 'ecc',
            },
        },
        external: ['google-protobuf', '@bitcoinerlab/secp256k1'],
        context: '__$G',
        treeshake: true,
        onwarn,
        plugins: [
            nodeResolve({
                exportConditions,
                mainFields,
                modulesOnly: true,
                preferBuiltins: false,
            }),
        ],
    };
}

export default [
    getConfig({ browser: true }),
    getConfig({ browser: true, suffix: '.umd', format: 'umd', name: 'quais' }),
    {
        input: './lib/esm/wordlists/wordlists-extra.js',
        onwarn,
        output: {
            file: './dist/wordlists-extra.js',
            format: 'esm',
            sourcemap: true,
            globals: {
                'google-protobuf': 'pb_1',
                '@bitcoinerlab/secp256k1': 'ecc',
            },
        },
        external: ['google-protobuf', '@bitcoinerlab/secp256k1'],
        treeshake: true,
        plugins: [
            nodeResolve({
                exportConditions: ['default', 'module', 'import'],
                mainFields: ['browser', 'module', 'main'],
                modulesOnly: true,
                preferBuiltins: false,
            }),
        ],
    },
];
