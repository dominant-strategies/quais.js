module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'jsdoc'],
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
    parserOptions: {
        project: './tsconfig.base.json',
    },
    rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'jsdoc/check-access': 1, // Recommended
        'jsdoc/check-alignment': 1, // Recommended
        'jsdoc/check-indentation': 1,
        'jsdoc/check-line-alignment': 1,
        'jsdoc/check-param-names': 1, // Recommended
        'jsdoc/check-property-names': 1, // Recommended
        'jsdoc/check-syntax': 1,
        'jsdoc/check-types': 1, // Recommended
        'jsdoc/check-values': 1, // Recommended
        'jsdoc/empty-tags': 1, // Recommended
        'jsdoc/implements-on-classes': 1, // Recommended
        'jsdoc/informative-docs': 1,
        'jsdoc/match-description': 1,
        'jsdoc/multiline-blocks': 1, // Recommended
        'jsdoc/no-bad-blocks': 1,
        'jsdoc/no-blank-block-descriptions': 1,
        'jsdoc/no-defaults': 1,
        'jsdoc/no-multi-asterisks': 1, // Recommended
        'jsdoc/no-types': 1,
        'jsdoc/no-undefined-types': 1, // Recommended
        'jsdoc/require-asterisk-prefix': 1,
        'jsdoc/require-description': 1,
        'jsdoc/require-description-complete-sentence': 1,
        'jsdoc/require-hyphen-before-param-description': 1,
        'jsdoc/require-jsdoc': 1, // Recommended
        'jsdoc/require-param': 1, // Recommended
        'jsdoc/require-param-description': 1, // Recommended
        'jsdoc/require-param-name': 1, // Recommended
        'jsdoc/require-property': 1, // Recommended
        'jsdoc/require-property-description': 1, // Recommended
        'jsdoc/require-property-name': 1, // Recommended
        'jsdoc/require-property-type': 1, // Recommended
        'jsdoc/require-returns': 1, // Recommended
        'jsdoc/require-returns-check': 1, // Recommended
        'jsdoc/require-returns-description': 1, // Recommended
        'jsdoc/require-throws': 1,
        'jsdoc/require-yields': 1, // Recommended
        'jsdoc/require-yields-check': 1, // Recommended
        'jsdoc/valid-types': 1, // Recommended
    },
};
