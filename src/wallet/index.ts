/**
 * When interacting with Ethereum, it is necessary to use a private key authenticate actions by signing a payload.
 *
 * Wallets are the simplest way to expose the concept of an Externally Owner Account (EOA) as it wraps a private key and
 * supports high-level methods to sign common types of interaction and send transactions.
 *
 * The class most developers will want to use is [Wallet](../classes/Wallet), which can load a private key directly or
 * from any common wallet format.
 *
 * The [QuaiHDWallet](../classes/QuaiHDWallet) can be used when it is necessary to access low-level details of how an HD
 * wallets are derived, exported or imported.
 */

export { BaseWallet } from './base-wallet.js';

export type { SerializedHDWallet, NeuteredAddressInfo } from './hdwallet.js';

export { QuaiHDWallet } from './quai-hdwallet.js';

export {
    isKeystoreJson,
    decryptKeystoreJsonSync,
    decryptKeystoreJson,
    encryptKeystoreJson,
    encryptKeystoreJsonSync,
} from './json-keystore.js';

export { Mnemonic } from './mnemonic.js';

export { Wallet } from './wallet.js';

export type { KeystoreAccount, EncryptOptions } from './json-keystore.js';

export { QiHDWallet, SerializedQiHDWallet, QiAddressInfo, OutpointInfo, AddressStatus } from './qi-hdwallet.js';

export { HDNodeVoidWallet, HDNodeWallet } from './hdnodewallet.js';
