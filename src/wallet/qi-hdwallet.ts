import { AbstractHDWallet, NeuteredAddressInfo, SerializedHDWallet } from './hdwallet';
import { HDNodeWallet } from './hdnodewallet';
import { QiTransactionRequest, Provider, TransactionResponse } from '../providers/index.js';
import { computeAddress } from '../address/index.js';
import { getBytes, hexlify } from '../utils/index.js';
import { TransactionLike, QiTransaction, TxInput } from '../transaction/index.js';
import { MuSigFactory } from '@brandonblack/musig';
import { schnorr } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { musigCrypto } from '../crypto/index.js';
import { Outpoint } from '../transaction/utxo.js';
import { getZoneForAddress } from '../utils/index.js';
import { AllowedCoinType, Zone } from '../constants/index.js';
import { Mnemonic } from './mnemonic.js';

type OutpointInfo = {
    outpoint: Outpoint;
    address: string;
    zone: Zone;
    account?: number;
};

interface SerializedQiHDWallet extends SerializedHDWallet {
    outpoints: OutpointInfo[];
    changeAddresses: NeuteredAddressInfo[];
    gapAddresses: NeuteredAddressInfo[];
    gapChangeAddresses: NeuteredAddressInfo[];
}

export class QiHDWallet extends AbstractHDWallet {
    protected static _version: number = 1;

    protected static _GAP_LIMIT: number = 20;

    protected static _coinType: AllowedCoinType = 969;

    // Map of change addresses to address info
    protected _changeAddresses: Map<string, NeuteredAddressInfo> = new Map();

    // Array of gap addresses
    protected _gapChangeAddresses: NeuteredAddressInfo[] = [];

    // Array of gap change addresses
    protected _gapAddresses: NeuteredAddressInfo[] = [];

    protected _outpoints: OutpointInfo[] = [];

    private constructor(root: HDNodeWallet, provider?: Provider) {
        super(root, provider);
    }

    /**
     * Retrieves the next change address for the specified account and zone.
     *
     * @param {number} account - The index of the account for which to retrieve the next change address.
     * @param {Zone} zone - The zone in which to retrieve the next change address.
     *
     * @returns {NeuteredAddressInfo} The next change neutered address information.
     */
    public getNextChangeAddress(account: number, zone: Zone): NeuteredAddressInfo {
        return this._getNextAddress(account, zone, true, this._changeAddresses);
    }

    public importOutpoints(outpoints: OutpointInfo[]): void {
        this.validateOutpointInfo(outpoints);
        this._outpoints.push(...outpoints);
    }

    public getOutpoints(zone: Zone): OutpointInfo[] {
        this.validateZone(zone);
        return this._outpoints.filter((outpoint) => outpoint.zone === zone);
    }

    /**
     * Signs a Qi transaction and returns the serialized transaction
     *
     * @param {QiTransactionRequest} tx - The transaction to sign.
     *
     * @returns {Promise<string>} The serialized transaction.
     * @throws {Error} If the UTXO transaction is invalid.
     */
    public async signTransaction(tx: QiTransactionRequest): Promise<string> {
        const txobj = QiTransaction.from(<TransactionLike>tx);
        if (!txobj.txInputs || txobj.txInputs.length == 0 || !txobj.txOutputs)
            throw new Error('Invalid UTXO transaction, missing inputs or outputs');

        const hash = keccak_256(txobj.unsignedSerialized);

        let signature: string;

        if (txobj.txInputs.length == 1) {
            signature = this.createSchnorrSignature(txobj.txInputs[0], hash);
        } else {
            signature = this.createMuSigSignature(txobj, hash);
        }

        txobj.signature = signature;
        return txobj.serialized;
    }

    public async sendTransaction(tx: QiTransactionRequest): Promise<TransactionResponse> {
        if (!this.provider) {
            throw new Error('Provider is not set');
        }
        if (!tx.inputs || tx.inputs.length === 0) {
            throw new Error('Transaction has no inputs');
        }
        const input = tx.inputs[0];
        const address = computeAddress(input.pubkey);
        const shard = getZoneForAddress(address);
        if (!shard) {
            throw new Error(`Address ${address} not found in any shard`);
        }

        // verify all inputs are from the same shard
        if (tx.inputs.some((input) => getZoneForAddress(computeAddress(input.pubkey)) !== shard)) {
            throw new Error('All inputs must be from the same shard');
        }

        const signedTx = await this.signTransaction(tx);

        return await this.provider.broadcastTransaction(shard, signedTx);
    }

    // createSchnorrSignature returns a schnorr signature for the given message and private key
    private createSchnorrSignature(input: TxInput, hash: Uint8Array): string {
        const privKey = this.derivePrivateKeyForInput(input);
        const signature = schnorr.sign(hash, getBytes(privKey));
        return hexlify(signature);
    }

    // createMuSigSignature returns a MuSig signature for the given message
    // and private keys corresponding to the input addresses
    private createMuSigSignature(tx: QiTransaction, hash: Uint8Array): string {
        const musig = MuSigFactory(musigCrypto);

        // Collect private keys corresponding to the pubkeys found on the inputs
        const privKeysSet = new Set<string>();
        tx.txInputs!.forEach((input) => {
            const privKey = this.derivePrivateKeyForInput(input);
            privKeysSet.add(privKey);
        });
        const privKeys = Array.from(privKeysSet);

        // Create an array of public keys corresponding to the private keys for musig aggregation
        const pubKeys: Uint8Array[] = privKeys
            .map((privKey) => musigCrypto.getPublicKey(getBytes(privKey!), true))
            .filter((pubKey) => pubKey !== null) as Uint8Array[];

        // Generate nonces for each public key
        const nonces = pubKeys.map((pk) => musig.nonceGen({ publicKey: getBytes(pk!) }));
        const aggNonce = musig.nonceAgg(nonces);

        const signingSession = musig.startSigningSession(aggNonce, hash, pubKeys);

        // Create partial signatures for each private key
        const partialSignatures = privKeys.map((sk, index) =>
            musig.partialSign({
                secretKey: getBytes(sk || ''),
                publicNonce: nonces[index],
                sessionKey: signingSession,
                verify: true,
            }),
        );

        // Aggregate the partial signatures into a final aggregated signature
        const finalSignature = musig.signAgg(partialSignatures, signingSession);

        return hexlify(finalSignature);
    }

    // Helper method that returns the private key for the public key
    private derivePrivateKeyForInput(input: TxInput): string {
        if (!input.pubkey) throw new Error('Missing public key for input');
        const address = computeAddress(input.pubkey);
        // get address info
        const addressInfo = this.getAddressInfo(address);
        if (!addressInfo) throw new Error(`Address not found: ${address}`);
        // derive an HDNode for the address and get the private key
        const changeIndex = addressInfo.change ? 1 : 0;
        const addressNode = this._root
            .deriveChild(addressInfo.account)
            .deriveChild(changeIndex)
            .deriveChild(addressInfo.index);
        return addressNode.privateKey;
    }

    /**
     * Scans the specified zone for addresses with unspent outputs. Starting at index 0, it will generate new addresses
     * until the gap limit is reached for both gap and change addresses.
     *
     * @param {Zone} zone - The zone in which to scan for addresses.
     * @param {number} [account=0] - The index of the account to scan. Defaults to 0. Default is `0` Default is `0`
     *
     * @returns {Promise<void>} A promise that resolves when the scan is complete.
     * @throws {Error} If the zone is invalid.
     */
    public async scan(zone: Zone, account: number = 0): Promise<void> {
        this.validateZone(zone);
        // flush the existing addresses and outpoints
        this._addresses = new Map();
        this._changeAddresses = new Map();
        this._gapAddresses = [];
        this._gapChangeAddresses = [];
        this._outpoints = [];

        await this._scan(zone, account);
    }

    /**
     * Scans the specified zone for addresses with unspent outputs. Starting at the last address index, it will generate
     * new addresses until the gap limit is reached for both gap and change addresses. If no account is specified, it
     * will scan all accounts known to the wallet.
     *
     * @param {Zone} zone - The zone in which to sync addresses.
     * @param {number} [account] - The index of the account to sync. If not specified, all accounts will be scanned.
     *
     * @returns {Promise<void>} A promise that resolves when the sync is complete.
     * @throws {Error} If the zone is invalid.
     */
    public async sync(zone: Zone, account?: number): Promise<void> {
        this.validateZone(zone);
        // if no account is specified, scan all accounts.
        if (account === undefined) {
            const addressInfos = Array.from(this._addresses.values());
            const accounts = addressInfos.reduce<number[]>((unique, info) => {
                if (!unique.includes(info.account)) {
                    unique.push(info.account);
                }
                return unique;
            }, []);

            for (const acc of accounts) {
                await this._scan(zone, acc);
            }
        } else {
            await this._scan(zone, account);
        }
        return;
    }

    /**
     * Internal method to scan the specified zone for addresses with unspent outputs. This method handles the actual
     * scanning logic, generating new addresses until the gap limit is reached for both gap and change addresses.
     *
     * @param {Zone} zone - The zone in which to scan for addresses.
     * @param {number} [account=0] - The index of the account to scan. Defaults to 0. Default is `0` Default is `0`
     *
     * @returns {Promise<void>} A promise that resolves when the scan is complete.
     * @throws {Error} If the provider is not set.
     */
    private async _scan(zone: Zone, account: number = 0): Promise<void> {
        if (!this.provider) throw new Error('Provider not set');

        let gapAddressesCount = 0;
        let changeGapAddressesCount = 0;

        while (gapAddressesCount < QiHDWallet._GAP_LIMIT || changeGapAddressesCount < QiHDWallet._GAP_LIMIT) {
            [gapAddressesCount, changeGapAddressesCount] = await Promise.all([
                gapAddressesCount < QiHDWallet._GAP_LIMIT
                    ? this.scanAddress(zone, account, false, gapAddressesCount)
                    : gapAddressesCount,
                changeGapAddressesCount < QiHDWallet._GAP_LIMIT
                    ? this.scanAddress(zone, account, true, changeGapAddressesCount)
                    : changeGapAddressesCount,
            ]);
        }
    }

    /**
     * Scans for the next address in the specified zone and account, checking for associated outpoints, and updates the
     * address count and gap addresses accordingly.
     *
     * @param {Zone} zone - The zone in which the address is being scanned.
     * @param {number} account - The index of the account for which the address is being scanned.
     * @param {boolean} isChange - A flag indicating whether the address is a change address.
     * @param {number} addressesCount - The current count of addresses scanned.
     *
     * @returns {Promise<number>} A promise that resolves to the updated address count.
     * @throws {Error} If an error occurs during the address scanning or outpoints retrieval process.
     */
    private async scanAddress(zone: Zone, account: number, isChange: boolean, addressesCount: number): Promise<number> {
        const addressMap = isChange ? this._changeAddresses : this._addresses;
        const addressInfo = this._getNextAddress(account, zone, isChange, addressMap);
        const outpoints = await this.getOutpointsByAddress(addressInfo.address);
        if (outpoints.length > 0) {
            this.importOutpoints(
                outpoints.map((outpoint) => ({
                    outpoint,
                    address: addressInfo.address,
                    zone,
                    account,
                })),
            );
            addressesCount = 0;
            isChange ? (this._gapChangeAddresses = []) : (this._gapAddresses = []);
        } else {
            addressesCount++;
            isChange ? this._gapChangeAddresses.push(addressInfo) : this._gapAddresses.push(addressInfo);
        }
        return addressesCount;
    }

    // getOutpointsByAddress queries the network node for the outpoints of the specified address
    private async getOutpointsByAddress(address: string): Promise<Outpoint[]> {
        try {
            const outpointsMap = await this.provider!.getOutpointsByAddress(address);
            if (!outpointsMap) {
                return [];
            }
            return Object.values(outpointsMap) as Outpoint[];
        } catch (error) {
            throw new Error(`Failed to get outpoints for address: ${address} - error: ${error}`);
        }
    }

    public getChangeAddressesForZone(zone: Zone): NeuteredAddressInfo[] {
        this.validateZone(zone);
        const changeAddresses = this._changeAddresses.values();
        return Array.from(changeAddresses).filter((addressInfo) => addressInfo.zone === zone);
    }

    public getGapAddressesForZone(zone: Zone): NeuteredAddressInfo[] {
        this.validateZone(zone);
        const gapAddresses = this._gapAddresses.filter((addressInfo) => addressInfo.zone === zone);
        return gapAddresses;
    }

    public getGapChangeAddressesForZone(zone: Zone): NeuteredAddressInfo[] {
        this.validateZone(zone);
        const gapChangeAddresses = this._gapChangeAddresses.filter((addressInfo) => addressInfo.zone === zone);
        return gapChangeAddresses;
    }

    /**
     * Signs a message using the private key associated with the given address.
     *
     * @param {string} address - The address for which the message is to be signed.
     * @param {string | Uint8Array} message - The message to be signed, either as a string or Uint8Array.
     *
     * @returns {Promise<string>} A promise that resolves to the signature of the message in hexadecimal string format.
     * @throws {Error} If the address does not correspond to a valid HD node or if signing fails.
     */
    public async signMessage(address: string, message: string | Uint8Array): Promise<string> {
        const addrNode = this._getHDNodeForAddress(address);
        const privKey = addrNode.privateKey;
        const digest = keccak_256(message);
        const signature = schnorr.sign(digest, getBytes(privKey));
        return hexlify(signature);
    }

    /**
     * Serializes the HD wallet state into a format suitable for storage or transmission.
     *
     * @returns {SerializedQiHDWallet} An object representing the serialized state of the HD wallet, including
     *   outpoints, change addresses, gap addresses, and other inherited properties.
     */
    public serialize(): SerializedQiHDWallet {
        const hdwalletSerialized = super.serialize();
        return {
            outpoints: this._outpoints,
            changeAddresses: Array.from(this._changeAddresses.values()),
            gapAddresses: this._gapAddresses,
            gapChangeAddresses: this._gapChangeAddresses,
            ...hdwalletSerialized,
        };
    }

    /**
     * Deserializes a serialized QiHDWallet object and reconstructs the wallet instance.
     *
     * @param {SerializedQiHDWallet} serialized - The serialized object representing the state of a QiHDWallet.
     *
     * @returns {Promise<QiHDWallet>} A promise that resolves to a reconstructed QiHDWallet instance.
     * @throws {Error} If the serialized data is invalid or if any addresses in the gap addresses or gap change
     *   addresses do not exist in the wallet.
     */
    public static async deserialize(serialized: SerializedQiHDWallet): Promise<QiHDWallet> {
        super.validateSerializedWallet(serialized);
        // create the wallet instance
        const mnemonic = Mnemonic.fromPhrase(serialized.phrase);
        const path = (this as any).parentPath(serialized.coinType);
        const root = HDNodeWallet.fromMnemonic(mnemonic, path);
        const wallet = new this(root);

        // import the addresses
        wallet.importSerializedAddresses(wallet._addresses, serialized.addresses);
        // import the change addresses
        wallet.importSerializedAddresses(wallet._changeAddresses, serialized.changeAddresses);

        // import the gap addresses, verifying they already exist in the wallet
        for (const gapAddressInfo of serialized.gapAddresses) {
            const gapAddress = gapAddressInfo.address;
            if (!wallet._addresses.has(gapAddress)) {
                throw new Error(`Address ${gapAddress} not found in wallet`);
            }
            wallet._gapAddresses.push(gapAddressInfo);
        }
        // import the gap change addresses, verifying they already exist in the wallet
        for (const gapChangeAddressInfo of serialized.gapChangeAddresses) {
            const gapChangeAddress = gapChangeAddressInfo.address;
            if (!wallet._changeAddresses.has(gapChangeAddress)) {
                throw new Error(`Address ${gapChangeAddress} not found in wallet`);
            }
            wallet._gapChangeAddresses.push(gapChangeAddressInfo);
        }

        // validate the outpoints and import them
        wallet.validateOutpointInfo(serialized.outpoints);
        wallet._outpoints.push(...serialized.outpoints);
        return wallet;
    }

    /**
     * Validates an array of OutpointInfo objects.
     *
     * This method checks the validity of each OutpointInfo object by performing the following validations:
     *
     * - Validates the zone using the `validateZone` method.
     * - Checks if the address exists in the wallet.
     * - Checks if the account (if provided) exists in the wallet.
     * - Validates the Outpoint by ensuring that `Txhash`, `Index`, and `Denomination` are not null.
     *
     * @private
     * @param {OutpointInfo[]} outpointInfo - An array of OutpointInfo objects to be validated.
     * @throws {Error} If any of the validations fail, an error is thrown with a descriptive message.
     */
    private validateOutpointInfo(outpointInfo: OutpointInfo[]): void {
        outpointInfo.forEach((info) => {
            // validate zone
            this.validateZone(info.zone);
            // validate address and account
            const addressInfo = this.getAddressInfo(info.address);
            if (!addressInfo) {
                throw new Error(`Address ${info.address} not found in wallet`);
            }
            if (info.account !== undefined && info.account !== addressInfo.account) {
                throw new Error(`Account ${info.account} not found for address ${info.address}`);
            }
            // validate Outpoint
            if (info.outpoint.txhash == null || info.outpoint.index == null || info.outpoint.denomination == null) {
                throw new Error(`Invalid Outpoint: ${JSON.stringify(info)} `);
            }
        });
    }
}
