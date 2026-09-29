# Safe adapter artifact provenance

Release: @safe-global/safe-contracts@1.4.1.
Source commit: bf943f80fec5ac647159d26161446ac5d716a294.

The embedded SafeProxy creation bytecode is copied verbatim from the npm release;
runtime hashes are pinned for Safe, SafeProxyFactory, CompatibilityFallbackHandler,
MultiSendCallOnly and SafeProxy. No source recompilation or wallet modification.
Ethereum deployment addresses are not assumed valid on Quai. All addresses come
from the integrating host's verified manifest.

Tarball: https://registry.npmjs.org/@safe-global/safe-contracts/-/safe-contracts-1.4.1.tgz
Integrity: sha512-fP1jewywSwsIniM04NsqPyVRFKPMAuirC3ftA/TA4X3Zc5EnwQp/UCJUU2PL/37/z/jMo8UUaJ+pnFNWmMU7dQ==

| Contract                     | Runtime keccak256                                                    |
| ---------------------------- | -------------------------------------------------------------------- |
| Safe                         | `0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4` |
| SafeProxyFactory             | `0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317` |
| CompatibilityFallbackHandler | `0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9` |
| SafeProxy                    | `0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c` |
| MultiSendCallOnly            | `0xecd5bd14a08c5d2122379900b2f272bdf107a7e92423c10dd5fe3254386c9939` |

Original package and bytecode license: [LGPL-3.0-only](SAFE-LICENSE).
[Source](https://github.com/safe-global/safe-smart-account/tree/bf943f80fec5ac647159d26161446ac5d716a294),
[published deployments](https://github.com/safe-global/safe-deployments/tree/main/src/assets/v1.4.1).
The upstream audit does not cover this adapter or the native Quai integration.

## Quai receiving proxy and active mainnet deployment

The `quai-receive-v1` proxy and factory are pinned to the Quai Safe source release
[`3118d29cf075e684dfeb6725256f3ba408234e7d`](https://github.com/dominant-strategies/safe-smart-account/tree/3118d29cf075e684dfeb6725256f3ba408234e7d/scripts/quai).
That release adds a direct native-QUAI receive path to the proxy. Its creation
code, proxy runtime hash, and factory runtime hash are in
`src/smart-account/quai-safe-artifacts.ts`. The separate upstream Safe 1.4.1
singleton, handler, and MultiSendCallOnly hashes above remain unchanged.

`QUAI_SAFE_MAINNET_V5` is an explicit, opt-in reference for the confirmed Quai
mainnet deployment on chain ID 9. The SDK does not select it automatically.

| Component | Address | Runtime hash |
| --- | --- | --- |
| Quai Safe Proxy Factory | `0x000Bc4389f61f2D14640998598016B4eb61aAE55` | `0x1fa056fbb78fa885561f63ad90ddefa7f3347a7482ce223e1b58a6f3e28f67b6` |
| Safe 1.4.1 singleton | `0x000D12E41552467e77C6396489293C296052f61C` | `0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4` |
| CompatibilityFallbackHandler | `0x00271147Cf2C690987531aBe1eE0687869168772` | `0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9` |
| MultiSendCallOnly | `0x003e3E3d021b11eBB1c77D9314DfaEF0B68D2198` | `0xecd5bd14a08c5d2122379900b2f272bdf107a7e92423c10dd5fe3254386c9939` |

The proxy runtime hash is
`0x9700e0d224b2a96ebcd150bd8259e72248eaf0a2d2abcdbee3898a36f652e3b1`.
The factory's `proxyCreationCode()` hashes to
`0x1b4a723eb3daf1684384e2eee0dbf4409ae5ebc4c7f3322405a368c86d465ccd`.
These values were checked against the live Quai RPC on September 29, 2026.
To repeat that read-only check after building the package, run
`npm run verify:quai:mainnet`.
