/* eslint-disable @typescript-eslint/no-unused-vars */
import {
    Provider,
    Network,
    TransactionResponse,
    Block,
    BlockTag,
    ProviderEvent,
    TransactionReceipt,
    Log,
    FeeData,
} from '../../providers/index.js';
import { AddressLike } from '../../address/index.js';
import { Shard, Zone } from '../../constants/index.js';
import { Listener, EventPayload, EventEmitterable, getBytes } from '../../utils/index.js';
import { Outpoint, OutpointDeltas } from '../../transaction/utxo.js';
import { AccessList, QiTransaction, QuaiTransaction } from '../../transaction/index.js';
import { WorkObjectLike } from '../../transaction/work-object.js';
import { QiPerformActionTransaction } from '../../providers/abstract-provider.js';
import { txpoolContentResponse, txpoolInspectResponse } from '../../providers/txpool.js';
import { QiTransactionResponse } from '../../providers/provider.js';
import { decodeProtoTransaction } from '../../encoding/index.js';
import { QiTransactionResponseParams } from '../../providers/formatting.js';

export class MockProvider implements Provider {
    private _network: Network = Network.from(BigInt(1));
    private _blockNumber: number = 1000;
    private _transactions: Map<string, TransactionResponse> = new Map();
    private _blocks: Map<string, Block> = new Map();
    private _balances: Map<string, bigint> = new Map();
    private _lockedBalances: Map<string, bigint> = new Map();
    private _outpoints: Map<string, Array<Outpoint>> = new Map();
    private _eventHandlers: Map<
        string,
        Array<{
            listener: Listener;
            once: boolean;
            zone?: Zone;
        }>
    > = new Map();

    // Required by Provider interface but not used in QiHDWallet tests
    provider = this;

    constructor(config?: { network?: bigint; blockNumber?: number }) {
        if (config?.network) this._network = Network.from(config.network);
        if (config?.blockNumber) this._blockNumber = config.blockNumber;
    }

    // Helper methods to set up test state
    public setBalance(address: string, balance: bigint): void {
        this._balances.set(address.toLowerCase(), balance);
    }

    public setTransaction(hash: string, tx: TransactionResponse): void {
        this._transactions.set(hash.toLowerCase(), tx);
    }

    public setOutpoints(address: string, outpoints: Array<Outpoint>): void {
        this._outpoints.set(address.toLowerCase(), outpoints);
    }

    // Implementation of Provider interface methods
    async getNetwork(): Promise<Network> {
        return this._network;
    }

    public setBlock(key: string, block: Block): void {
        this._blocks.set(key, block);
    }

    async getBlock(shard: Shard, blockHashOrBlockTag: BlockTag | string, prefetchTxs?: boolean): Promise<null | Block> {
        if (typeof blockHashOrBlockTag === 'string') {
            return this._blocks.get(blockHashOrBlockTag) ?? null;
        }
        // Handle block tag (latest, pending, etc.)
        throw new Error('Method not implemented.');
    }

    async getBlockNumber(shard: Shard): Promise<number> {
        return this._blockNumber;
    }

    async getBalance(address: AddressLike, blockTag?: BlockTag): Promise<bigint> {
        return this._balances.get(address.toString().toLowerCase()) ?? BigInt(0);
    }

    async broadcastTransaction(zone: Zone, signedTx: string, from?: AddressLike): Promise<TransactionResponse> {
        // Simulate transaction broadcast
        const type = decodeProtoTransaction(getBytes(signedTx)).type;

        const tx = type == 2 ? QiTransaction.from(signedTx) : QuaiTransaction.from(signedTx);
        const txObj = tx.toJSON();

        if (type == 2) {
            return new QiTransactionResponse(txObj as QiTransactionResponseParams, this);
        }

        // TODO: Implement _wrapTransactionResponse for QuaiTransactionResponse
        throw new Error('Broadcast transaction not implemented for Quai');
    }

    async getOutpointDeltas(): Promise<OutpointDeltas> {
        // TODO: Implement
        throw new Error('Method not implemented.');
    }

    async getOutpointsByAddress(address: AddressLike): Promise<Array<Outpoint>> {
        return this._outpoints.get(address.toString().toLowerCase()) ?? [];
    }

    async estimateFeeForQi(tx: QiPerformActionTransaction): Promise<bigint> {
        // Return a mock fee for testing
        return BigInt(1000);
    }

    async on(event: ProviderEvent, listener: Listener, zone?: Zone): Promise<this> {
        const eventKey = this._getEventKey(event, zone);
        if (!this._eventHandlers.has(eventKey)) {
            this._eventHandlers.set(eventKey, []);
        }
        this._eventHandlers.get(eventKey)!.push({ listener, once: false, zone });
        return this;
    }

    async once(event: ProviderEvent, listener: Listener, zone?: Zone): Promise<this> {
        const eventKey = this._getEventKey(event, zone);
        if (!this._eventHandlers.has(eventKey)) {
            this._eventHandlers.set(eventKey, []);
        }
        this._eventHandlers.get(eventKey)!.push({ listener, once: true, zone });
        return this;
    }

    async emit(event: ProviderEvent, zone?: Zone, ...args: Array<any>): Promise<boolean> {
        const eventKey = this._getEventKey(event, zone);
        const handlers = this._eventHandlers.get(eventKey);
        if (!handlers || handlers.length === 0) {
            return false;
        }

        const payload = new EventPayload<ProviderEvent>(this as EventEmitterable<ProviderEvent>, null, event);

        const remainingHandlers = handlers.filter(({ listener, once }) => {
            try {
                listener.call(this, ...args, payload);
                return !once;
            } catch (error) {
                console.error('Error in event handler:', error);
                return true;
            }
        });

        this._eventHandlers.set(eventKey, remainingHandlers);
        return true;
    }

    async listenerCount(event?: ProviderEvent): Promise<number> {
        if (!event) {
            // Sum up all listeners across all events
            return Array.from(this._eventHandlers.values()).reduce((sum, handlers) => sum + handlers.length, 0);
        }
        const handlers = this._eventHandlers.get(this._getEventKey(event));
        return handlers?.length ?? 0;
    }

    async listeners(event?: ProviderEvent): Promise<Array<Listener>> {
        if (!event) {
            // Get all listeners across all events
            return Array.from(this._eventHandlers.values())
                .flat()
                .map(({ listener }) => listener);
        }
        const handlers = this._eventHandlers.get(this._getEventKey(event));
        return handlers?.map(({ listener }) => listener) ?? [];
    }

    async off(event: ProviderEvent, listener?: Listener, zone?: Zone): Promise<this> {
        const eventKey = this._getEventKey(event, zone);
        if (!listener) {
            // Remove all listeners for this event
            this._eventHandlers.delete(eventKey);
        } else {
            const handlers = this._eventHandlers.get(eventKey);
            if (handlers) {
                const remainingHandlers = handlers.filter((h) => h.listener !== listener);
                this._eventHandlers.set(eventKey, remainingHandlers);
            }
        }
        return this;
    }

    async removeAllListeners(event?: ProviderEvent): Promise<this> {
        if (!event) {
            this._eventHandlers.clear();
        } else {
            this._eventHandlers.delete(this._getEventKey(event));
        }
        return this;
    }

    async addListener(event: ProviderEvent, listener: Listener, zone?: Zone): Promise<this> {
        return this.on(event, listener, zone);
    }

    async removeListener(event: ProviderEvent, listener: Listener, zone?: Zone): Promise<this> {
        return this.off(event, listener, zone);
    }

    // Helper method to create consistent event keys
    private _getEventKey(event: ProviderEvent, zone?: Zone): string {
        if (typeof event === 'string') {
            return zone ? `${event}:${zone}` : event;
        }

        if ('orphan' in event) {
            return zone ? `orphan:${zone}` : 'orphan';
        }
        if ('transaction' in event) {
            return zone ? `transaction:${event.transaction}:${zone}` : `transaction:${event.transaction}`;
        }
        if ('qiTransaction' in event) {
            return zone ? `qiTransaction:${event.qiTransaction}:${zone}` : `qiTransaction:${event.qiTransaction}`;
        }
        if ('filter' in event) {
            return zone ? `filter:${JSON.stringify(event.filter)}:${zone}` : `filter:${JSON.stringify(event.filter)}`;
        }

        return JSON.stringify(event);
    }

    // Stub implementations for other required methods
    destroy(): void {
        // No-op for mock
    }

    async getFeeData(_zone: Zone, _txType: boolean): Promise<FeeData> {
        throw new Error('Method not implemented.');
    }

    async getPendingHeader(): Promise<WorkObjectLike> {
        throw new Error('Method not implemented.');
    }

    public setLockedBalance(address: AddressLike, balance: bigint): void {
        this._lockedBalances.set(address.toString().toLowerCase(), balance);
    }

    async getLockedBalance(address: AddressLike): Promise<bigint> {
        return this._lockedBalances.get(address.toString().toLowerCase()) ?? BigInt(0);
    }
    async getTransactionCount(): Promise<number> {
        throw new Error('getTransactionCount: Method not implemented.');
    }
    async getCode(): Promise<string> {
        throw new Error('getCode: Method not implemented.');
    }
    async getStorage(): Promise<string> {
        throw new Error('getStorage: Method not implemented.');
    }
    async estimateGas(): Promise<bigint> {
        throw new Error('estimateGas: Method not implemented.');
    }
    async createAccessList(): Promise<AccessList> {
        throw new Error('createAccessList: Method not implemented.');
    }
    async call(): Promise<string> {
        throw new Error('call: Method not implemented.');
    }
    async getTransaction(): Promise<null | TransactionResponse> {
        throw new Error('getTransaction: Method not implemented.');
    }
    async getTransactionReceipt(): Promise<null | TransactionReceipt> {
        throw new Error('getTransactionReceipt: Method not implemented.');
    }
    async getTransactionResult(): Promise<null | string> {
        throw new Error('getTransactionResult: Method not implemented.');
    }
    async getLogs(): Promise<Array<Log>> {
        throw new Error('getLogs: Method not implemented.');
    }
    async waitForTransaction(): Promise<null | TransactionReceipt> {
        throw new Error('waitForTransaction: Method not implemented.');
    }
    async waitForBlock(): Promise<Block> {
        throw new Error('waitForBlock: Method not implemented.');
    }
    async getProtocolExpansionNumber(): Promise<number> {
        throw new Error('getProtocolExpansionNumber: Method not implemented.');
    }
    async getTxPoolContent(zone: Zone): Promise<txpoolContentResponse> {
        throw new Error('getTxPoolContent: Method not implemented.');
    }
    async txPoolInspect(zone: Zone): Promise<txpoolInspectResponse> {
        throw new Error('txPoolInspect: Method not implemented.');
    }
    async getQiRateAtBlock(): Promise<bigint> {
        throw new Error('getQiRateAtBlock: Method not implemented.');
    }
    async getLatestQiRate(): Promise<bigint> {
        throw new Error('getLatestQiRate: Method not implemented.');
    }
    async getQuaiRateAtBlock(): Promise<bigint> {
        throw new Error('getQuaiRateAtBlock: Method not implemented.');
    }
    async getLatestQuaiRate(): Promise<bigint> {
        throw new Error('getLatestQuaiRate: Method not implemented.');
    }
}
