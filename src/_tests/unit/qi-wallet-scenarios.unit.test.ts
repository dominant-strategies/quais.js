import assert from 'assert';
import { MuSigFactory } from '@brandonblack/musig';
import { schnorr } from '@noble/curves/secp256k1';
import {
    Mnemonic,
    QiHDWallet,
    QuaiHDWallet,
    QiTransaction,
    Zone,
    getBytes,
    hexlify,
    keccak256,
    musigCrypto,
    toUtf8Bytes,
} from '../../index.js';
import { Outpoint } from '../../transaction/utxo.js';
import { MockQiChainState } from './mockQiHarness.js';

const TEST_MNEMONIC = 'test test test test test test test test test test test junk';

async function deriveFirstReceivingAddress(mnemonicPhrase = TEST_MNEMONIC): Promise<string> {
    const wallet = QiHDWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonicPhrase));
    const { address } = await wallet.getNextAddress(0, Zone.Cyprus1);
    return address;
}

function createWallet(mnemonicPhrase = TEST_MNEMONIC): QiHDWallet {
    return QiHDWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonicPhrase));
}

function verifySchnorrSignature(signature: string, digest: Uint8Array, pubkey: string): boolean {
    return schnorr.verify(getBytes(signature), digest, getBytes(`0x${pubkey.slice(4)}`));
}

function verifyMuSigSignature(signature: string, digest: Uint8Array, publicKeys: string[]): boolean {
    const musig = MuSigFactory(musigCrypto);
    const aggPublicKeyObj = musig.keyAgg(publicKeys.map((pubkey) => getBytes(pubkey)));
    const aggPublicKey = hexlify(aggPublicKeyObj.aggPublicKey);
    const compressedPubKey = aggPublicKey.slice(0, -64);
    return verifySchnorrSignature(signature, digest, compressedPubKey);
}

describe('Qi wallet scenario framework', function () {
    this.timeout(120000);

    it('supports a fresh scan from a deterministic seeded state', async function () {
        const state = new MockQiChainState();
        const address = await deriveFirstReceivingAddress();
        const seededOutpoints = state.seedRandomOutpoints(address, {
            count: 6,
            seed: 101,
            denominationIndexes: [0, 1, 2, 3],
        });
        state.mineBlock();

        const wallet = createWallet();
        wallet.connect(state.createProvider());

        await wallet.scan(Zone.Cyprus1);

        assert.equal(wallet.getOutpoints(Zone.Cyprus1).length, seededOutpoints.length);
        assert.equal(wallet.getAddressesForZone(Zone.Cyprus1)[0].address, address);
    });

    it('supports reopen gap sync and merges newly discovered outpoints onto existing wallet state', async function () {
        const state = new MockQiChainState();
        const address = await deriveFirstReceivingAddress();
        const firstBatch = state.seedRandomOutpoints(address, {
            count: 2,
            seed: 202,
            denominationIndexes: [2, 3],
        });
        state.mineBlock();

        const wallet = createWallet();
        wallet.connect(state.createProvider());
        await wallet.scan(Zone.Cyprus1);

        const reopenedWallet = await QiHDWallet.deserialize(wallet.serialize());
        reopenedWallet.connect(state.createProvider());

        const secondBatch = state.generateRandomOutpoints(address, {
            count: 3,
            seed: 303,
            denominationIndexes: [4, 5],
        });
        state.addOutpoints(address, secondBatch);
        state.mineBlock();

        await reopenedWallet.gapSync(Zone.Cyprus1);

        const txhashes = reopenedWallet.getOutpoints(Zone.Cyprus1).map((outpoint) => outpoint.outpoint.txhash);
        for (const outpoint of firstBatch) {
            assert.ok(txhashes.includes(outpoint.txhash));
        }
        for (const outpoint of secondBatch) {
            assert.ok(txhashes.includes(outpoint.txhash));
        }
        assert.equal(reopenedWallet.getOutpoints(Zone.Cyprus1).length, firstBatch.length + secondBatch.length);
    });

    it('supports stale outpoint recovery through incremental sync deltas', async function () {
        const state = new MockQiChainState();
        const address = await deriveFirstReceivingAddress();
        const seededOutpoints = state.seedRandomOutpoints(address, {
            count: 4,
            seed: 404,
        });
        state.mineBlock();

        const wallet = createWallet();
        wallet.connect(state.createProvider());
        await wallet.scan(Zone.Cyprus1);
        assert.equal(wallet.getOutpoints(Zone.Cyprus1).length, 4);

        const spentOutpoints: Outpoint[] = seededOutpoints.slice(0, 2);
        state.spendOutpoints(address, spentOutpoints);
        state.mineBlock();

        await wallet.sync(Zone.Cyprus1);

        const remainingKeys = new Set(wallet.getOutpoints(Zone.Cyprus1).map((outpoint) => outpoint.outpoint.txhash));
        for (const spent of spentOutpoints) {
            assert.ok(!remainingKeys.has(spent.txhash));
        }
        assert.equal(wallet.getOutpoints(Zone.Cyprus1).length, seededOutpoints.length - spentOutpoints.length);
    });

    it('supports high-outpoint aggregation pressure scenarios', async function () {
        const state = new MockQiChainState();
        const address = await deriveFirstReceivingAddress();
        state.seedRandomOutpoints(address, {
            count: 5001,
            seed: 505,
            denominationIndexes: [0, 1, 2],
        });
        state.mineBlock();

        const wallet = createWallet();
        wallet.connect(state.createProvider());
        await wallet.scan(Zone.Cyprus1);

        assert.ok(wallet.getOutpoints(Zone.Cyprus1).length > 5000);

        state.aggregateOutpoints(address, 12, {
            seed: 606,
            denominationIndexes: [8, 9, 10],
        });
        state.mineBlock();

        await wallet.sync(Zone.Cyprus1);

        assert.equal(wallet.getOutpoints(Zone.Cyprus1).length, 12);
    });

    it('preserves payment channel lifecycle and addresses across serialization', async function () {
        const alice = createWallet();
        const bob = createWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release');

        const alicePaymentCode = alice.getPaymentCode(0);
        const bobPaymentCode = bob.getPaymentCode(0);

        alice.openChannel(bobPaymentCode);
        bob.openChannel(alicePaymentCode);

        const sendAddress = alice.getNextSendAddress(bobPaymentCode, Zone.Cyprus1);
        const receiveAddress = bob.getNextReceiveAddress(alicePaymentCode, Zone.Cyprus1);

        const restoredAlice = await QiHDWallet.deserialize(alice.serialize());
        const restoredBob = await QiHDWallet.deserialize(bob.serialize());

        assert.ok(restoredAlice.channelIsOpen(bobPaymentCode));
        assert.ok(restoredBob.channelIsOpen(alicePaymentCode));
        assert.deepEqual(restoredAlice.openChannels, [bobPaymentCode]);
        assert.deepEqual(restoredBob.openChannels, [alicePaymentCode]);
        assert.equal(restoredAlice.getPaymentChannelAddressesForZone(bobPaymentCode, Zone.Cyprus1).length, 0);
        assert.equal(
            restoredBob.getPaymentChannelAddressesForZone(alicePaymentCode, Zone.Cyprus1)[0].address,
            receiveAddress.address,
        );
        assert.equal(restoredAlice.serialize().senderPaymentCodeInfo[bobPaymentCode][0].address, sendAddress.address);
    });

    it('supports reopen gap sync for payment-channel receive addresses', async function () {
        const state = new MockQiChainState();
        const provider = state.createProvider();

        const alice = createWallet();
        const bob = createWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release');
        alice.connect(provider);
        bob.connect(provider);

        const alicePaymentCode = alice.getPaymentCode(0);
        const bobPaymentCode = bob.getPaymentCode(0);
        bob.openChannel(alicePaymentCode);
        alice.openChannel(bobPaymentCode);

        const firstReceive = bob.getNextReceiveAddress(alicePaymentCode, Zone.Cyprus1);
        const firstOutpoints = state.seedRandomOutpoints(firstReceive.address, {
            count: 2,
            seed: 707,
            denominationIndexes: [2, 3],
        });
        state.mineBlock();

        await bob.scan(Zone.Cyprus1);
        assert.equal(bob.getOutpoints(Zone.Cyprus1).length, firstOutpoints.length);

        const reopenedBob = await QiHDWallet.deserialize(bob.serialize());
        reopenedBob.connect(provider);

        const secondReceive = reopenedBob.getNextReceiveAddress(alicePaymentCode, Zone.Cyprus1);
        const secondOutpoints = state.seedRandomOutpoints(secondReceive.address, {
            count: 3,
            seed: 808,
            denominationIndexes: [4, 5],
        });
        state.mineBlock();

        await reopenedBob.gapSync(Zone.Cyprus1);

        const paymentChannelAddresses = reopenedBob.getPaymentChannelAddressesForZone(alicePaymentCode, Zone.Cyprus1);
        const txhashes = reopenedBob.getOutpoints(Zone.Cyprus1).map((outpoint) => outpoint.outpoint.txhash);

        assert.ok(paymentChannelAddresses.some((addressInfo) => addressInfo.address === firstReceive.address));
        assert.ok(paymentChannelAddresses.some((addressInfo) => addressInfo.address === secondReceive.address));
        for (const outpoint of [...firstOutpoints, ...secondOutpoints]) {
            assert.ok(txhashes.includes(outpoint.txhash));
        }
    });

    it('supports a deterministic send flow over an opened payment channel', async function () {
        const state = new MockQiChainState();
        const provider = state.createProvider();
        provider.setDefaultEstimateFeeForQi(10n);

        const alice = createWallet();
        const bob = createWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release');
        alice.connect(provider);
        bob.connect(provider);

        const aliceFundingInfo = await alice.getNextAddress(0, Zone.Cyprus1);
        const aliceFundingOutpoints = state.seedRandomOutpoints(aliceFundingInfo.address, {
            count: 1,
            seed: 909,
            denominationIndexes: [9],
        });
        alice.importOutpoints(
            aliceFundingOutpoints.map((outpoint) => ({
                outpoint,
                address: aliceFundingInfo.address,
                zone: aliceFundingInfo.zone,
                derivationPath: aliceFundingInfo.derivationPath,
                account: aliceFundingInfo.account,
            })),
        );
        state.mineBlock();

        const alicePaymentCode = alice.getPaymentCode(0);
        const bobPaymentCode = bob.getPaymentCode(0);
        alice.openChannel(bobPaymentCode);
        bob.openChannel(alicePaymentCode);

        const txResponse = await alice.sendTransaction(bobPaymentCode, 5000n, Zone.Cyprus1, Zone.Cyprus1);

        assert.ok(txResponse.hash);
        assert.ok(provider.getSignedTransaction().length > 0);
        assert.ok(alice.channelIsOpen(bobPaymentCode));
        assert.ok(bob.channelIsOpen(alicePaymentCode));
    });

    it('supports deterministic convertToQuai flow coverage', async function () {
        const state = new MockQiChainState();
        const provider = state.createProvider();
        provider.setDefaultEstimateFeeForQi(10n);

        const qiWallet = createWallet();
        qiWallet.connect(provider);

        const quaiWallet = QuaiHDWallet.fromMnemonic(Mnemonic.fromPhrase(TEST_MNEMONIC));
        const destination = quaiWallet.getNextAddressSync(0, Zone.Cyprus1);

        const fundingInfo = await qiWallet.getNextAddress(0, Zone.Cyprus1);
        const fundingOutpoints = state.seedRandomOutpoints(fundingInfo.address, {
            count: 1,
            seed: 1001,
            denominationIndexes: [9],
        });

        qiWallet.importOutpoints(
            fundingOutpoints.map((outpoint) => ({
                outpoint,
                address: fundingInfo.address,
                zone: fundingInfo.zone,
                derivationPath: fundingInfo.derivationPath,
                account: fundingInfo.account,
            })),
        );
        state.mineBlock();

        const response = await qiWallet.convertToQuai(destination.address, 5000n, {
            data: new Uint8Array([1, 2, 3]),
        });

        assert.ok(response.hash);
        assert.ok(provider.getSignedTransaction().length > 0);
    });

    it('supports direct signTransaction coverage for Schnorr and MuSig paths', async function () {
        const wallet = createWallet();
        const first = await wallet.getNextAddress(0, Zone.Cyprus1);
        const second = await wallet.getNextAddress(0, Zone.Cyprus1);

        wallet.importOutpoints([
            {
                outpoint: {
                    txhash: '0x' + '11'.repeat(32),
                    index: 0,
                    denomination: 8,
                    lock: 0,
                },
                address: first.address,
                zone: first.zone,
                derivationPath: first.derivationPath,
                account: first.account,
            },
            {
                outpoint: {
                    txhash: '0x' + '22'.repeat(32),
                    index: 0,
                    denomination: 8,
                    lock: 0,
                },
                address: second.address,
                zone: second.zone,
                derivationPath: second.derivationPath,
                account: second.account,
            },
        ]);

        const schnorrTx = new QiTransaction();
        schnorrTx.chainId = 1;
        schnorrTx.txInputs = [
            {
                txhash: '0x' + '11'.repeat(32),
                index: 0,
                pubkey: first.pubKey,
            },
        ];
        schnorrTx.txOutputs = [
            {
                address: first.address,
                denomination: 7,
            },
        ];

        const signedSingle = QiTransaction.from(await wallet.signTransaction(schnorrTx));
        assert.ok(
            verifySchnorrSignature(
                signedSingle.signature,
                getBytes(keccak256(schnorrTx.unsignedSerialized)),
                first.pubKey,
            ),
        );

        const musigTx = new QiTransaction();
        musigTx.chainId = 1;
        musigTx.txInputs = [
            {
                txhash: '0x' + '11'.repeat(32),
                index: 0,
                pubkey: first.pubKey,
            },
            {
                txhash: '0x' + '22'.repeat(32),
                index: 0,
                pubkey: second.pubKey,
            },
        ];
        musigTx.txOutputs = [
            {
                address: first.address,
                denomination: 8,
            },
            {
                address: second.address,
                denomination: 7,
            },
        ];

        const signedMulti = QiTransaction.from(await wallet.signTransaction(musigTx));
        assert.ok(
            verifyMuSigSignature(signedMulti.signature, getBytes(keccak256(musigTx.unsignedSerialized)), [
                first.pubKey,
                second.pubKey,
            ]),
        );
    });

    it('supports direct signMessage coverage', async function () {
        const wallet = createWallet();
        const addressInfo = await wallet.getNextAddress(0, Zone.Cyprus1);
        const message = 'hello qi wallet';

        const signature = await wallet.signMessage(addressInfo.address, message);
        const digest = getBytes(keccak256(getBytes(toUtf8Bytes(message))));

        assert.ok(verifySchnorrSignature(signature, digest, addressInfo.pubKey));
    });

    it('supports imported private-key lifecycle in wallet scenarios', async function () {
        const state = new MockQiChainState();
        const provider = state.createProvider();
        const wallet = createWallet();
        wallet.connect(provider);

        const imported = await wallet.importPrivateKey(
            '0x8e837f747a0c89fd339558f8aa34902a9d10505671ec99f150f75dcf5f0b3d79',
        );

        const outpoints = state.seedRandomOutpoints(imported.address, {
            count: 2,
            seed: 1111,
            denominationIndexes: [6, 7],
        });
        state.mineBlock();

        await wallet.sync(Zone.Cyprus1);

        assert.equal(wallet.getImportedAddresses().length, 1);
        assert.equal(wallet.getImportedAddresses(imported.zone).length, 1);
        assert.equal(
            wallet.getOutpoints(Zone.Cyprus1).filter((outpoint) => outpoint.address === imported.address).length,
            outpoints.length,
        );

        const restored = await QiHDWallet.deserialize(wallet.serialize());
        assert.equal(restored.getImportedAddresses().length, 1);
        assert.equal(restored.getImportedAddresses()[0].address, imported.address);
        assert.equal(restored.getAddressInfo(imported.address)?.address, imported.address);
    });

    it('tracks gap-address helpers across receive, change, and payment-channel flows', async function () {
        const wallet = createWallet();
        const bob = createWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release');

        const firstExternal = await wallet.getNextAddress(0, Zone.Cyprus1);
        const firstChange = await wallet.getNextChangeAddress(0, Zone.Cyprus1);
        const bobPaymentCode = bob.getPaymentCode(0);
        wallet.openChannel(bobPaymentCode);
        const firstReceiveAddress = wallet.getNextReceiveAddress(bobPaymentCode, Zone.Cyprus1);

        wallet.setAddressStatus(firstExternal.address, 'UNUSED' as any);
        wallet.setAddressStatus(firstChange.address, 'UNUSED' as any);
        wallet.setAddressStatus(firstReceiveAddress.address, 'UNUSED' as any);

        assert.ok(wallet.getAddressesForZone(Zone.Cyprus1).some((addr) => addr.address === firstExternal.address));
        assert.ok(wallet.getChangeAddressesForZone(Zone.Cyprus1).some((addr) => addr.address === firstChange.address));
        assert.ok(wallet.getGapAddressesForZone(Zone.Cyprus1).some((addr) => addr.address === firstExternal.address));
        assert.ok(
            wallet.getGapChangeAddressesForZone(Zone.Cyprus1).some((addr) => addr.address === firstChange.address),
        );
        assert.ok(
            wallet
                .getGapPaymentChannelAddressesForZone(bobPaymentCode, Zone.Cyprus1)
                .some((addr) => addr.address === firstReceiveAddress.address),
        );

        wallet.setAddressStatus(firstExternal.address, 'USED' as any);
        wallet.setAddressStatus(firstChange.address, 'ATTEMPTED_USE' as any);
        wallet.setAddressStatus(firstReceiveAddress.address, 'USED' as any);

        assert.ok(!wallet.getGapAddressesForZone(Zone.Cyprus1).some((addr) => addr.address === firstExternal.address));
        assert.ok(
            !wallet.getGapChangeAddressesForZone(Zone.Cyprus1).some((addr) => addr.address === firstChange.address),
        );
        assert.ok(
            !wallet
                .getGapPaymentChannelAddressesForZone(bobPaymentCode, Zone.Cyprus1)
                .some((addr) => addr.address === firstReceiveAddress.address),
        );
    });

    it('covers key negative validations on top-level Qi wallet methods', async function () {
        const state = new MockQiChainState();
        const wallet = createWallet();
        wallet.connect(state.createProvider());
        const bob = createWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release');
        const quaiWallet = QuaiHDWallet.fromMnemonic(Mnemonic.fromPhrase(TEST_MNEMONIC));
        const validQuaiAddress = quaiWallet.getNextAddressSync(0, Zone.Cyprus1).address;
        const bobPaymentCode = bob.getPaymentCode(0);

        await assert.rejects(async () => wallet.sendTransaction('not-a-payment-code', 1n, Zone.Cyprus1, Zone.Cyprus1), {
            message: 'Invalid payment code',
        });
        await assert.rejects(async () => wallet.sendTransaction(bobPaymentCode, 0n, Zone.Cyprus1, Zone.Cyprus1), {
            message: 'Amount must be greater than 0',
        });
        await assert.rejects(async () => wallet.convertToQuai('not-an-address', 1n), /Invalid zone for Quai address/);

        const qiAddress = (await wallet.getNextAddress(0, Zone.Cyprus1)).address;
        await assert.rejects(async () => wallet.convertToQuai(qiAddress, 1n), /Invalid Quai address/);
        await assert.rejects(async () => wallet.convertToQuai(validQuaiAddress, 0n), {
            message: 'Amount must be greater than 0',
        });

        assert.throws(() => wallet.openChannel('bad-code'), /Invalid payment code/);
        assert.equal(wallet.channelIsOpen(bobPaymentCode), false);
        assert.throws(() => wallet.getNextSendAddress(bobPaymentCode, Zone.Cyprus1), /not found in wallet/);
        assert.throws(() => wallet.getNextReceiveAddress(bobPaymentCode, Zone.Cyprus1), /not found in wallet/);
        assert.equal(wallet.setAddressStatus('0x' + '12'.repeat(20), 'USED' as any), false);
        assert.throws(() => wallet.getPrivateKey('0x' + '12'.repeat(20)), /Address not found/);
    });
});
