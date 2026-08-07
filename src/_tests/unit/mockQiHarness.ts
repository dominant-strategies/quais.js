import http, { IncomingMessage, ServerResponse } from 'http';
import { AddressLike } from '../../address/index.js';
import { Shard, Zone } from '../../constants/index.js';
import { Network, JsonRpcProvider, Block, BlockTag } from '../../providers/index.js';
import type { BlockParams } from '../../providers/formatting.js';
import { Outpoint, OutpointDeltas } from '../../transaction/utxo.js';
import { MockProvider } from './mockProvider.js';
import { createHash } from 'crypto';

type RandomOutpointOptions = {
    count: number;
    seed?: number;
    denominationIndexes?: number[];
    lockProbability?: number;
    maxLockBlockOffset?: number;
};

type MockBlockOptions = {
    hash?: string;
    parentHash?: string;
    timestamp?: number;
    primeTerminusNumber?: number;
};

type JsonRpcPayload = {
    id: number | string | null;
    jsonrpc: string;
    method: string;
    params?: any[];
};

const ZERO_HASH = '0x' + '00'.repeat(32);
const ZERO_DATA = '0x';
const ZERO_ADDRESS = '0x' + '00'.repeat(20);

function bigintJsonReplacer(_key: string, value: unknown): unknown {
    return typeof value === 'bigint' ? value.toString() : value;
}

function normalizeAddress(address: string): string {
    return address.toLowerCase();
}

function toQuantity(value: number | bigint): string {
    return `0x${BigInt(value).toString(16)}`;
}

function hashLabel(label: string): string {
    return `0x${createHash('sha256').update(label).digest('hex')}`;
}

function cloneOutpoints(outpoints: Outpoint[]): Outpoint[] {
    return outpoints.map((outpoint) => ({ ...outpoint }));
}

function cloneOutpointMap(source: Map<string, Outpoint[]>): Map<string, Outpoint[]> {
    const snapshot = new Map<string, Outpoint[]>();
    source.forEach((outpoints, address) => {
        snapshot.set(address, cloneOutpoints(outpoints));
    });
    return snapshot;
}

function outpointKey(outpoint: Outpoint): string {
    return `${outpoint.txhash}:${outpoint.index}`;
}

function makeMulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function createMockBlockParams(zone: Zone, blockNumber: number, options: MockBlockOptions = {}): BlockParams {
    const hash = options.hash ?? hashLabel(`mock-block:${zone}:${blockNumber}`);
    const parentHash =
        options.parentHash ?? (blockNumber <= 0 ? ZERO_HASH : hashLabel(`mock-block:${zone}:${blockNumber - 1}`));
    const timestamp = options.timestamp ?? 1_700_000_000 + blockNumber;

    return {
        outboundEtxs: [],
        hash,
        header: {
            avgTxFees: 0n,
            baseFeePerGas: 0n,
            conversionFlowAmount: 0n,
            efficiencyScore: 0n,
            etxEligibleSlices: ZERO_DATA,
            etxRollupRoot: ZERO_HASH,
            etxSetRoot: ZERO_HASH,
            evmRoot: ZERO_HASH,
            exchangeRate: 0n,
            expansionNumber: 0,
            extraData: ZERO_DATA,
            gasLimit: 0n,
            gasUsed: 0n,
            interlinkRootHash: ZERO_HASH,
            kQuaiDiscount: 0n,
            manifestHash: [],
            minerDifficulty: 0n,
            number: [0, 0, blockNumber],
            outboundEtxsRoot: ZERO_HASH,
            parentDeltaEntropy: [0n, 0n, 0n],
            parentEntropy: [0n, 0n, 0n],
            parentHash: [parentHash, parentHash, parentHash],
            parentUncledDeltaEntropy: [0n, 0n, 0n],
            primeStateRoot: ZERO_HASH,
            primeTerminusHash: ZERO_HASH,
            quaiStateSize: 0n,
            receiptsRoot: ZERO_HASH,
            size: 0n,
            stateLimit: 0n,
            stateUsed: 0n,
            thresholdCount: 0n,
            totalFees: 0n,
            transactionsRoot: ZERO_HASH,
            uncleHash: ZERO_HASH,
            uncledEntropy: 0n,
            utxoRoot: ZERO_HASH,
        },
        interlinkHashes: [],
        size: 0n,
        subManifest: [],
        totalEntropy: 0n,
        transactions: [],
        uncles: [],
        woHeader: {
            primaryCoinbase: ZERO_ADDRESS,
            difficulty: '0',
            headerHash: hash,
            location: zone,
            mixHash: ZERO_HASH,
            nonce: ZERO_DATA,
            number: blockNumber,
            parentHash,
            timestamp: timestamp.toString(),
            txHash: ZERO_HASH,
            lock: 0,
        },
        workShares: [],
    };
}

export class MockQiChainState {
    public readonly network: Network;
    public readonly zone: Zone;

    private blockNumber: number;
    private latestBlockHash: string;
    private blocksByHash: Map<string, BlockParams> = new Map();
    private blocksByNumber: Map<number, BlockParams> = new Map();
    private outpointsByAddress: Map<string, Outpoint[]> = new Map();
    private lockedBalances: Map<string, bigint> = new Map();
    private spendableBalances: Map<string, bigint> = new Map();
    private outpointSnapshotsByHash: Map<string, Map<string, Outpoint[]>> = new Map();
    private transactionsByHash: Map<string, any> = new Map();
    private feeBySerializedTx: Map<string, bigint> = new Map();
    private signedTransactions: string[] = [];

    constructor(options: { chainId?: bigint; zone?: Zone; blockNumber?: number } = {}) {
        this.network = Network.from(options.chainId ?? 1n);
        this.zone = options.zone ?? Zone.Cyprus1;
        this.blockNumber = options.blockNumber ?? 1;

        const block = createMockBlockParams(this.zone, this.blockNumber);
        this.latestBlockHash = block.hash;
        this.setBlock(block);
        this.captureSnapshot(block.hash);
    }

    public getLatestBlockNumber(): number {
        return this.blockNumber;
    }

    public getLatestBlockHash(): string {
        return this.latestBlockHash;
    }

    public setBlock(block: BlockParams): void {
        this.blocksByHash.set(block.hash, block);
        this.blocksByNumber.set(block.woHeader.number, block);
        if (block.woHeader.number >= this.blockNumber) {
            this.blockNumber = block.woHeader.number;
            this.latestBlockHash = block.hash;
        }
    }

    public mineBlock(options: MockBlockOptions = {}): BlockParams {
        const nextBlockNumber = this.blockNumber + 1;
        const block = createMockBlockParams(this.zone, nextBlockNumber, {
            parentHash: this.latestBlockHash,
            ...options,
        });
        this.setBlock(block);
        this.captureSnapshot(block.hash);
        return block;
    }

    public setOutpoints(address: string, outpoints: Outpoint[]): void {
        this.outpointsByAddress.set(normalizeAddress(address), cloneOutpoints(outpoints));
    }

    public addOutpoints(address: string, outpoints: Outpoint[]): void {
        const key = normalizeAddress(address);
        const existing = this.outpointsByAddress.get(key) ?? [];
        this.outpointsByAddress.set(key, [...existing, ...cloneOutpoints(outpoints)]);
    }

    public replaceOutpoints(address: string, outpoints: Outpoint[]): void {
        this.setOutpoints(address, outpoints);
    }

    public seedRandomOutpoints(address: string, options: RandomOutpointOptions): Outpoint[] {
        const outpoints = this.generateRandomOutpoints(address, options);
        this.setOutpoints(address, outpoints);
        return outpoints;
    }

    public generateRandomOutpoints(address: string, options: RandomOutpointOptions): Outpoint[] {
        const rng = makeMulberry32(options.seed ?? Date.now());
        const denominationIndexes = options.denominationIndexes ?? [0, 1, 2, 3, 4, 5, 6];
        const lockProbability = options.lockProbability ?? 0;
        const maxLockBlockOffset = options.maxLockBlockOffset ?? 12;

        return Array.from({ length: options.count }, (_, index) => {
            const denomination = denominationIndexes[Math.floor(rng() * Math.max(denominationIndexes.length, 1))] ?? 0;
            const shouldLock = rng() < lockProbability;
            return {
                txhash: hashLabel(`mock-outpoint:${address}:${this.blockNumber}:${index}:${rng()}`),
                index,
                denomination,
                lock: shouldLock ? this.blockNumber + 1 + Math.floor(rng() * Math.max(maxLockBlockOffset, 1)) : 0,
            };
        });
    }

    public spendOutpoint(address: string, txhash: string, index: number): void {
        const key = normalizeAddress(address);
        const remaining = (this.outpointsByAddress.get(key) ?? []).filter(
            (outpoint) => !(outpoint.txhash === txhash && outpoint.index === index),
        );
        this.outpointsByAddress.set(key, remaining);
    }

    public spendOutpoints(address: string, outpoints: Outpoint[]): void {
        const spentKeys = new Set(outpoints.map(outpointKey));
        const key = normalizeAddress(address);
        const remaining = (this.outpointsByAddress.get(key) ?? []).filter(
            (outpoint) => !spentKeys.has(outpointKey(outpoint)),
        );
        this.outpointsByAddress.set(key, remaining);
    }

    public aggregateOutpoints(
        address: string,
        outputCount: number,
        options: Omit<RandomOutpointOptions, 'count'> = {},
    ): Outpoint[] {
        const aggregated = this.seedRandomOutpoints(address, {
            ...options,
            count: outputCount,
        });
        return aggregated;
    }

    public setBalance(address: string, balance: bigint): void {
        this.spendableBalances.set(normalizeAddress(address), balance);
    }

    public setLockedBalance(address: string, balance: bigint): void {
        this.lockedBalances.set(normalizeAddress(address), balance);
    }

    public getBalance(address: AddressLike): bigint {
        return this.spendableBalances.get(normalizeAddress(address.toString())) ?? 0n;
    }

    public getLockedBalance(address: AddressLike): bigint {
        return this.lockedBalances.get(normalizeAddress(address.toString())) ?? 0n;
    }

    public getOutpoints(address: AddressLike): Outpoint[] {
        return cloneOutpoints(this.outpointsByAddress.get(normalizeAddress(address.toString())) ?? []);
    }

    public getOutpointCount(address: AddressLike): number {
        return this.getOutpoints(address).length;
    }

    public getBlock(blockHashOrTag: BlockTag | string): BlockParams | null {
        if (blockHashOrTag === 'latest') {
            return this.blocksByHash.get(this.latestBlockHash) ?? null;
        }

        if (typeof blockHashOrTag === 'number') {
            return this.blocksByNumber.get(blockHashOrTag) ?? null;
        }

        if (typeof blockHashOrTag === 'bigint') {
            return this.blocksByNumber.get(Number(blockHashOrTag)) ?? null;
        }

        if (typeof blockHashOrTag === 'string' && blockHashOrTag.startsWith('0x')) {
            const maybeNumber = Number.parseInt(blockHashOrTag, 16);
            if (!Number.isNaN(maybeNumber) && this.blocksByNumber.has(maybeNumber)) {
                return this.blocksByNumber.get(maybeNumber) ?? null;
            }
        }

        return this.blocksByHash.get(String(blockHashOrTag)) ?? null;
    }

    public getOutpointDeltas(addresses: string[], startHash: string, endHash?: string): OutpointDeltas {
        const startSnapshot = this.outpointSnapshotsByHash.get(startHash);
        if (!startSnapshot) {
            throw new Error(`Unknown start block hash: ${startHash}`);
        }

        const resolvedEndHash = !endHash || endHash === 'latest' ? this.latestBlockHash : endHash;
        const endSnapshot = this.outpointSnapshotsByHash.get(resolvedEndHash);
        if (!endSnapshot) {
            throw new Error(`Unknown end block hash: ${resolvedEndHash}`);
        }

        const deltas: OutpointDeltas = {};

        for (const address of addresses) {
            const key = normalizeAddress(address);
            const startOutpoints = startSnapshot.get(key) ?? [];
            const endOutpoints = endSnapshot.get(key) ?? [];

            const startKeys = new Map(startOutpoints.map((outpoint) => [outpointKey(outpoint), outpoint]));
            const endKeys = new Map(endOutpoints.map((outpoint) => [outpointKey(outpoint), outpoint]));

            const created = endOutpoints.filter((outpoint) => !startKeys.has(outpointKey(outpoint)));
            const deleted = startOutpoints.filter((outpoint) => !endKeys.has(outpointKey(outpoint)));

            deltas[address] = {
                created,
                deleted,
            };
        }

        return deltas;
    }

    public recordSignedTransaction(signedTransaction: string): void {
        this.signedTransactions.push(signedTransaction);
    }

    public getSignedTransactions(): string[] {
        return [...this.signedTransactions];
    }

    public setEstimateFeeForQi(serializedInput: string, fee: bigint): void {
        this.feeBySerializedTx.set(serializedInput, fee);
    }

    public getEstimateFeeForQi(serializedInput: string): bigint {
        return this.feeBySerializedTx.get(serializedInput) ?? 0n;
    }

    public setTransaction(hash: string, tx: any): void {
        this.transactionsByHash.set(hash.toLowerCase(), tx);
    }

    public getTransaction(hash: string): any | null {
        return this.transactionsByHash.get(hash.toLowerCase()) ?? null;
    }

    public createProvider(): MockQiProvider {
        return new MockQiProvider(this);
    }

    public createJsonRpcProvider(url: string): JsonRpcProvider {
        return new JsonRpcProvider(url, this.network, { usePathing: false, cacheTimeout: -1 });
    }

    private captureSnapshot(blockHash: string): void {
        this.outpointSnapshotsByHash.set(blockHash, cloneOutpointMap(this.outpointsByAddress));
    }
}

export class MockQiProvider extends MockProvider {
    constructor(private readonly state: MockQiChainState) {
        super({ network: state.network.chainId, blockNumber: state.getLatestBlockNumber() });
        this.setNetwork(state.network);
    }

    override async getNetwork(): Promise<Network> {
        return this.state.network;
    }

    override async getBalance(address: AddressLike, blockTag?: BlockTag): Promise<bigint> {
        void blockTag;
        return this.state.getBalance(address);
    }

    override async getLockedBalance(address: AddressLike): Promise<bigint> {
        return this.state.getLockedBalance(address);
    }

    override async getBlock(
        shard: Shard,
        blockHashOrBlockTag: BlockTag | string,
        prefetchTxs?: boolean,
    ): Promise<null | Block> {
        void shard;
        void prefetchTxs;
        const block = this.state.getBlock(blockHashOrBlockTag);
        return block ? new Block(block, this) : null;
    }

    override async getBlockNumber(shard: Shard): Promise<number> {
        void shard;
        return this.state.getLatestBlockNumber();
    }

    override async getOutpointsByAddress(address: AddressLike): Promise<Array<Outpoint>> {
        return this.state.getOutpoints(address);
    }

    override async getOutpointsByAddresses(addresses: string[]): Promise<Map<string, Outpoint[]>> {
        const results = new Map<string, Outpoint[]>();
        for (const address of addresses) {
            results.set(address, this.state.getOutpoints(address));
        }
        return results;
    }

    override async getOutpointDeltas(
        addresses: string[],
        startHash: string,
        endHash?: string,
    ): Promise<OutpointDeltas> {
        return this.state.getOutpointDeltas(addresses, startHash, endHash);
    }
}

export class MockQiRpcServer {
    private server: http.Server | null = null;
    private port: number | null = null;

    constructor(private readonly state: MockQiChainState) {}

    public get url(): string {
        if (this.port == null) {
            throw new Error('MockQiRpcServer is not listening yet');
        }
        return `http://127.0.0.1:${this.port}`;
    }

    public async listen(port = 0): Promise<string> {
        if (this.server) return this.url;

        this.server = http.createServer(async (req, res) => this.handleRequest(req, res));
        await new Promise<void>((resolve, reject) => {
            this.server!.once('error', reject);
            this.server!.listen(port, () => resolve());
        });

        const address = this.server.address();
        if (!address || typeof address === 'string') {
            throw new Error('Failed to determine mock RPC server address');
        }

        this.port = address.port;
        return this.url;
    }

    public async close(): Promise<void> {
        if (!this.server) return;

        await new Promise<void>((resolve, reject) => {
            this.server!.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });

        this.server = null;
        this.port = null;
    }

    private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (req.method !== 'POST') {
            this.respond(res, 405, { error: 'Method not allowed' });
            return;
        }

        const body = await this.readBody(req);
        const payload = JSON.parse(body) as JsonRpcPayload | JsonRpcPayload[];

        if (Array.isArray(payload)) {
            const responses = payload.map((item) => this.handlePayload(item));
            this.respondJson(res, responses);
            return;
        }

        this.respondJson(res, this.handlePayload(payload));
    }

    private handlePayload(payload: JsonRpcPayload): any {
        try {
            const result = this.handleMethod(payload.method, payload.params ?? []);
            return {
                jsonrpc: '2.0',
                id: payload.id,
                result,
            };
        } catch (error: any) {
            return {
                jsonrpc: '2.0',
                id: payload.id,
                error: {
                    code: -32000,
                    message: error?.message ?? String(error),
                },
            };
        }
    }

    private handleMethod(method: string, params: any[]): any {
        switch (method) {
            case 'quai_chainId':
                return toQuantity(this.state.network.chainId);
            case 'quai_blockNumber':
                return toQuantity(this.state.getLatestBlockNumber());
            case 'quai_getBlockByNumber':
                return this.state.getBlock(params[0]) ?? null;
            case 'quai_getBlockByHash':
                return this.state.getBlock(params[0]) ?? null;
            case 'quai_getBalance':
                return this.state.getBalance(params[0]).toString();
            case 'quai_getLockedBalance':
                return this.state.getLockedBalance(params[0]).toString();
            case 'quai_getOutpointsByAddress':
                return this.state.getOutpoints(params[0]);
            case 'quai_getOutpointDeltasForAddressesInRange':
                return this.state.getOutpointDeltas(params[0], params[1], params[2]);
            case 'quai_estimateFeeForQi':
                return this.state.getEstimateFeeForQi(JSON.stringify(params[0], bigintJsonReplacer)).toString();
            case 'quai_getTransactionByHash':
                return this.state.getTransaction(params[0]);
            case 'quai_sendRawTransaction':
                this.state.recordSignedTransaction(params[0]);
                return hashLabel(`mock-broadcast:${params[0]}`);
            default:
                throw new Error(`Unsupported mock RPC method: ${method}`);
        }
    }

    private async readBody(req: IncomingMessage): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const chunks: Buffer[] = [];
            req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            req.on('error', reject);
        });
    }

    private respondJson(res: ServerResponse, payload: any): void {
        const body = JSON.stringify(payload, bigintJsonReplacer);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(body);
    }

    private respond(res: ServerResponse, statusCode: number, payload: any): void {
        res.writeHead(statusCode, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
    }
}

export async function createWalletBackedHarness(
    options: {
        zone?: Zone;
        chainId?: bigint;
        blockNumber?: number;
    } = {},
): Promise<{
    state: MockQiChainState;
    provider: MockQiProvider;
    server: MockQiRpcServer;
}> {
    const state = new MockQiChainState(options);
    return {
        state,
        provider: state.createProvider(),
        server: new MockQiRpcServer(state),
    };
}
