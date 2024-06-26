# Quais Javascript SDK

[![npm (tag)](https://img.shields.io/npm/v/quais)](https://www.npmjs.com/package/quais)
![npm bundle size (version)](https://img.shields.io/bundlephobia/minzip/quais)
![npm (downloads)](https://img.shields.io/npm/dm/quais)

---

**This library is still under development and not ready for production use.**

A complete, compact and simple library for Quai and Qi, written
in [TypeScript](https://www.typescriptlang.org).

**Features**

-   Keep your private keys in your client, **safe** and sound
-   Import and export BIP 39 **mnemonic phrases** (12 word backup phrases) and **HD Wallets** (English as well as Czech, French, Italian, Japanese, Korean, Simplified Chinese, Spanish, Traditional Chinese)
-   Meta-classes create JavaScript objects from any contract ABI, including **ABIv2** and **Human-Readable ABI**
-   Connect to Quai nodes over [JSON-RPC](https://qu.ai/docs/develop/apis/json-rpc-api/), [quaiscan](https://quaiscan.io), or [Pelagus](https://pelaguswallet.io)
-   **Small** (~136kb compressed; 460kb uncompressed)
-   **Tree-shaking** focused; include only what you need during bundling
-   **Complete** functionality for all your Quai desires
-   Extensive documentation **coming soon**
-   Large collection of **test cases** which are maintained and added to
-   Fully written in **TypeScript**, with strict types for security and safety
-   **MIT License** (including ALL dependencies); completely open source to do with as you please

**Versions**

-   [0.1.17](https://www.npmjs.com/package/quais/v/0.1.17): Full support for Quai Network's Iron Age Testnet.
-   [1.0.0-alpha](https://www.npmjs.com/package/quais/v/1.0.0-alpha.5): Full support for Quai Network's Golden Age Testnet.

## Keep Updated

For advisories and important notices, follow [@quainetwork](https://twitter.com/quainetwork)
on Twitter as well as watch this GitHub project.

For more general news, discussions, and feedback, join the
[Quai Developer Discord](https://discord.gg/s8y8asPwNC).

## Installing

**NodeJS**

```
/home/some_project> npm install quais
```

**Browser (ESM)**

The bundled library is available in the `./dist/` folder in this repo.

```
<script type="module">
    import { quais } from "./dist/quais.min.js";
</script>
```

### Using Local Version as Dependency in Other Projects

For developers looking to contribute to quais or integrate it into their projects with local modifications, setting up a local development environment is essential. This section guides you through the process of building quais and linking it to another project on your machine using npm link.

**Prepare quais for Symbolic Linking**

1. Clone the quais repository and navigate into it.

    ```bash
    git clone https://github.com/dominant-strategies/quais.js.git
    cd quais.js
    ```

2. Install dependencies.

    ```bash
    npm install
    ```

3. Create a global symbolic link for quais. This makes the quais package available to link in any other project. Whenever a local change is made to quais that you want to test in another project, you must run this command again to update the symbolic link.

    ```bash
    npm run update-symlink
    ```

    _Caution - The `update-symlink` command updates the globally available symbolic link to the build of the current branch you are on when the command is run. This can potentially lead to incompatible version usage if quais is linked to multiple projects locally._

**Linking quais to Another Project**

After setting up quais for local development, you can link it to another project to test changes or develop features that depend on quais.

1. Navigate to your project.
    ```bash
    cd path/to/your/project
    ```
2. Link the globally linked quais package to your project. This replaces the npm-installed quais package with the symlinked version.
    ```bash
    npm link quais
    ```
3. Build your project: Depending on your project's setup, you may need to rebuild it to ensure that the linked quais library is correctly integrated.
   npm run build

**Testing Changes**

With quais linked to your project, any changes made to the quais library can be immediately tested within the context of your project. Remember to rebuild quais (`npm run update-symlink`) after making changes to ensure they are reflected in your project.

**Reverting to the Published Package**

If you need to revert back to the official quais package published on npm, you can unlink quais and reinstall the package.

1. Unlink quais by removing the symlink.

    ```bash
    npm unlink quais
    ```

2. Reinstall quais: Install the quais package from npm to use the published version.
    ```bash
    npm install quais
    ```

## Documentation

Documentation for the Quais SDK is under heavy development and will be updated often soon. In the meantime, please refer to the reference material below:

-   [Quais Javascript SDK Documentation](https://dominantstrategies.mintlify.app/static)
-   [Quai Network JSON RPC Docs](https://qu.ai/docs/develop/apis/json-rpc-api/)

## Extension Packages

The `quais` package only includes the most common and most core
functionality to interact with Quai Network. There are many other
packages designed to further enhance the functionality and experience.

-   [QuaisPolling](https://npmjs.com/package/quais-polling) - A package to poll Quai Network for events and logs
-   [MulticallProvider](https://github.com/ethers-io/ext-provider-multicall) - A Provider which bundles multiple call requests into a single `call` to reduce latency and backend request capacity

## License

MIT License (including **all** dependencies).
