module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
    parserOptions: {
        project: './tsconfig.base.json',
    },
    rules: {
        '@typescript-eslint/no-explicit-any': 'off',
    },
};
