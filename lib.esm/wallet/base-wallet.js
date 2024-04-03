import { getAddress, resolveAddress } from "../address/index.js";
import { hashMessage, TypedDataEncoder } from "../hash/index.js";
import { AbstractSigner } from "../providers/index.js";
import { computeAddress, Transaction } from "../transaction/index.js";
import { resolveProperties, assert, assertArgument } from "../utils/index.js";
// import { MuSigFactory } from "@brandonblack/musig"
// import { nobleCrypto } from "./musig-crypto.js";
// import { UTXOTransaction } from "../transaction/utxo.js";
// import { schnorr } from "@noble/curves/secp256k1";
/**
 *  The **BaseWallet** is a stream-lined implementation of a
 *  [[Signer]] that operates with a private key.
 *
 *  It is preferred to use the [[Wallet]] class, as it offers
 *  additional functionality and simplifies loading a variety
 *  of JSON formats, Mnemonic Phrases, etc.
 *
 *  This class may be of use for those attempting to implement
 *  a minimal Signer.
 */
export class BaseWallet extends AbstractSigner {
    /**
     *  The wallet address.
     */
    #address;
    #signingKey;
    /**
     *  Creates a new BaseWallet for %%privateKey%%, optionally
     *  connected to %%provider%%.
     *
     *  If %%provider%% is not specified, only offline methods can
     *  be used.
     */
    constructor(privateKey, provider) {
        super(provider);
        assertArgument(privateKey && typeof (privateKey.sign) === "function", "invalid private key", "privateKey", "[ REDACTED ]");
        this.#signingKey = privateKey;
        this.#address = computeAddress(this.signingKey.publicKey);
    }
    // Store private values behind getters to reduce visibility
    // in console.log
    /**
     * The address of this wallet.
     */
    get address() { return this.#address; }
    /**
     *  The [[SigningKey]] used for signing payloads.
     */
    get signingKey() { return this.#signingKey; }
    /**
     *  The private key for this wallet.
     */
    get privateKey() { return this.signingKey.privateKey; }
    async getAddress() { return this.#address; }
    connect(provider) {
        return new BaseWallet(this.#signingKey, provider);
    }
    async signTransaction(tx) {
        console.log("signTransaction");
        // Replace any Addressable or ENS name with an address
        const { to, from } = await resolveProperties({
            to: (tx.to ? resolveAddress(tx.to, this.provider) : undefined),
            from: (tx.from ? resolveAddress(tx.from, this.provider) : undefined)
        });
        if (to != null) {
            tx.to = to;
        }
        if (from != null) {
            tx.from = from;
        }
        if (tx.from != null) {
            assertArgument(getAddress((tx.from)) === this.#address, "transaction from address mismatch", "tx.from", tx.from);
<<<<<<< HEAD
            //            delete tx.from;
=======
            delete tx.from;
>>>>>>> ee35178e (utxohdwallet)
        }
        // Build the transaction
        const btx = Transaction.from(tx);
        btx.signature = this.signingKey.sign(btx.unsignedHash);
        return btx.serialized;
    }
    // async signUTXOTransaction(tx: UTXOTransaction, pk: Uint8Array): Promise<string> {
    //     const factory = MuSigFactory(nobleCrypto);
    //     //const transactionHash = tx.serialize()
    //     // Check if there is only one private key
    //     if (pk.length === 1) {
    //         // Single key scenario: Perform a simple Schnorr signature
    //         const publicKey = factory.getXOnlyPubkey(pk[0]);
    //         const signature = schnorr.sign(transactionHash, BigInt(pk[0]), publicKey); 
    //         // Attach the signature to the transaction
    //         transaction.signature = signature;
    //     }
    // }
    async signMessage(message) {
        return this.signMessageSync(message);
    }
    // @TODO: Add a secialized signTx and signTyped sync that enforces
    // all parameters are known?
    /**
     *  Returns the signature for %%message%% signed with this wallet.
     */
    signMessageSync(message) {
        return this.signingKey.sign(hashMessage(message)).serialized;
    }
    async signTypedData(domain, types, value) {
        // Populate any ENS names
        const populated = await TypedDataEncoder.resolveNames(domain, types, value, async (name) => {
            // @TODO: this should use resolveName; addresses don't
            //        need a provider
            assert(this.provider != null, "cannot resolve ENS names without a provider", "UNSUPPORTED_OPERATION", {
                operation: "resolveName",
                info: { name }
            });
            const address = await this.provider.resolveName(name);
            assert(address != null, "unconfigured ENS name", "UNCONFIGURED_NAME", {
                value: name
            });
            return address;
        });
        return this.signingKey.sign(TypedDataEncoder.hash(populated.domain, types, populated.value)).serialized;
    }
}
//# sourceMappingURL=base-wallet.js.map