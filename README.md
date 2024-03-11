# The quais Project 6.8.1

[![npm (tag)](https://img.shields.io/npm/v/quais)](https://www.npmjs.com/package/quais)
[![CI Tests](https://github.com/quais-io/quais.js/actions/workflows/test-ci.yml/badge.svg?branch=main)](https://github.com/quais-io/quais.js/actions/workflows/test-ci.yml)
![npm bundle size (version)](https://img.shields.io/bundlephobia/minzip/quais)
![npm (downloads)](https://img.shields.io/npm/dm/quais)
[![GitPOAP Badge](https://public-api.gitpoap.io/v1/repo/quais-io/quais.js/badge)](https://www.gitpoap.io/gh/quais-io/quais.js)
[![Twitter Follow](https://img.shields.io/twitter/follow/ricmoo?style=social)](https://twitter.com/ricmoo)

---

A complete, compact and simple library for Ethereum and ilk, written
in [TypeScript](https://www.typescriptlang.org).

**Features**

- Keep your private keys in your client, **safe** and sound
- Import and export **JSON wallets** (Geth, Parity and crowdsale)
- Import and export BIP 39 **mnemonic phrases** (12 word backup phrases) and **HD Wallets** (English as well as Czech, French, Italian, Japanese, Korean, Simplified Chinese, Spanish, Traditional Chinese)
- Meta-classes create JavaScript objects from any contract ABI, including **ABIv2** and **Human-Readable ABI**
- Connect to Ethereum nodes over [JSON-RPC](https://github.com/ethereum/wiki/wiki/JSON-RPC), [INFURA](https://infura.io), [quaiscan](https://quaiscan.io), [Alchemy](https://alchemyapi.io), [Ankr](https://ankr.com) or [MetaMask](https://metamask.io)
- **ENS names** are first-class citizens; they can be used anywhere an Ethereum addresses can be used
- **Small** (~144kb compressed; 460kb uncompressed)
- **Tree-shaking** focused; include only what you need during bundling
- **Complete** functionality for all your Ethereum desires
- Extensive [documentation](https://docs.quais.org/v6/)
- Large collection of **test cases** which are maintained and added to
- Fully written in **TypeScript**, with strict types for security and safety
- **MIT License** (including ALL dependencies); completely open source to do with as you please

## Keep Updated

For advisories and important notices, follow [@quaisproject](https://twitter.com/quaisproject)
on Twitter (low-traffic, non-marketing, important information only) as well as watch this GitHub project.

For more general news, discussions, and feedback, follow or DM me,
[@ricmoo](https://twitter.com/ricmoo) on Twitter or on the
[quais Discord](https://discord.gg/qYtSscGYYc).

For the latest changes, see the
[CHANGELOG](https://github.com/quais-io/quais.js/blob/main/CHANGELOG.md).

**Summaries**

- [August 2023](https://blog.ricmoo.com/highlights-quais-js-august-2023-fb68354c576c)
- [September 2022](https://blog.ricmoo.com/highlights-quais-js-september-2022-d7bda0fc37ed)
- [June 2022](https://blog.ricmoo.com/highlights-quais-js-june-2022-f5328932e35d)
- [March 2022](https://blog.ricmoo.com/highlights-quais-js-march-2022-f511fe1e88a1)
- [December 2021](https://blog.ricmoo.com/highlights-quais-js-december-2021-dc1adb779d1a)
- [September 2021](https://blog.ricmoo.com/highlights-quais-js-september-2021-1bf7cb47d348)
- [May 2021](https://blog.ricmoo.com/highlights-quais-js-may-2021-2826e858277d)
- [March 2021](https://blog.ricmoo.com/highlights-quais-js-march-2021-173d3a545b8d)
- [December 2020](https://blog.ricmoo.com/highlights-quais-js-december-2020-2e2db8bc800a)

## Installing

**NodeJS**

```
/home/ricmoo/some_project> npm install quais
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
    git clone https://github.com/dominant-strategies/quais-6.js.git
    cd quais-6.js
    ```

2. Install dependencies.

    ``` bash
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

Browse the [documentation](https://docs.quais.org) online:

- [Getting Started](https://docs.quais.org/v6/getting-started/)
- [Full API Documentation](https://docs.quais.org/v6/api/)
- [Various Ethereum Articles](https://blog.ricmoo.com/)

## Providers

quais works closely with an ever-growing list of third-party providers
to ensure getting started is quick and easy, by providing default keys
to each service.

These built-in keys mean you can use `quais.getDefaultProvider()` and
start developing right away.

However, the API keys provided to quais are also shared and are
intentionally throttled to encourage developers to eventually get
their own keys, which unlock many other features, such as faster
responses, more capacity, analytics and other features like archival
data.

When you are ready to sign up and start using for your own keys, please
check out the [Provider API Keys](https://docs.quais.org/v5/api-keys/) in
the documentation.

A special thanks to these services for providing community resources:

- [Ankr](https://www.ankr.com/)
- [QuickNode](https://www.quicknode.com/)
- [quaiscan](https://quaiscan.io/)
- [INFURA](https://infura.io/)
- [Alchemy](https://dashboard.alchemyapi.io/signup?referral=55a35117-028e-4b7c-9e47-e275ad0acc6d)

## Extension Packages

The `quais` package only includes the most common and most core
functionality to interact with Ethereum. There are many other
packages designed to further enhance the functionality and experience.

- [MulticallProvider](https://github.com/quais-io/ext-provider-multicall) - A Provider which bundles multiple call requests into a single `call` to reduce latency and backend request capacity
- [MulticoinPlugin](https://github.com/quais-io/ext-provider-plugin-multicoin) - A Provider plugin to expand the support of ENS coin types
- [GanaceProvider](https://github.com/quais-io/ext-provider-ganache) - A Provider for in-memory node instances, for fast debugging, testing and simulating blockchain operations
- [Optimism Utilities](https://github.com/quais-io/ext-utils-optimism) - A collection of Optimism utilities
- [LedgerSigner](https://github.com/quais-io/ext-signer-ledger) - A Signer to interact directly with Ledger Hardware Wallets

## License

MIT License (including **all** dependencies).
