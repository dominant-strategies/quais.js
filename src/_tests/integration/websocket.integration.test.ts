import assert from 'assert';
import { WebSocketProvider, Zone } from '../../index.js';
import dotenv from 'dotenv';

dotenv.config();

describe('WebSocketProvider Integration Tests', function () {
    this.timeout(120000);

    const provider = new WebSocketProvider(process.env.WS_RPC_URL!);

    it('should connect to the WebSocket successfully', async function () {
        assert(provider.websocket.length > 0, 'WebSocket connection should be established');
    });

    it('should subscribe and receive new block events', async function () {
        let blockNumber: number | null = null;
        provider.once(
            'block',
            (newBlock) => {
                console.log(`Received new block: ${JSON.stringify(newBlock, null, 2)}`);
                blockNumber = newBlock;
            },
            Zone.Cyprus1,
        );

        // This test assumes that a new block will be mined during the test execution
        // Wait for a reasonable amount of time for a new block to be received
        await new Promise<void>((resolve, reject) => {
            let attempts = 0;
            const checkBlock = () => {
                if (blockNumber !== null) {
                    resolve();
                } else if (attempts > 10) {
                    reject(new Error('No block event received'));
                } else {
                    attempts++;
                    console.log(`Waiting for new block event via web socket...(attempt ${attempts})`);
                    setTimeout(checkBlock, 5000);
                }
            };
            checkBlock();
        });

        assert(blockNumber !== null, 'Block number should be received from WebSocket');
    });

    it('should close all ws connections', async function () {
        await provider.destroy();
        assert(provider.websocket.length === 0, 'WebSocket connection should be closed after destroy()');
    });
});
