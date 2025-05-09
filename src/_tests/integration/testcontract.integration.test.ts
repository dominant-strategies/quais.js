import assert from 'assert';

import { getProvider, setupProviders } from './create-provider.js';

import { Contract, ContractFactory, ContractRunner, isError, Typed } from '../../index.js';
import TestContract from './contracts/TestContract.js';
import TypedContract from './contracts/TypedContract.js';
import { quais } from '../../index.js';

setupProviders();

describe('Test Contract', function () {
    const provider = new quais.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new quais.Wallet(process.env.CYPRUS1_PRIVKEY_1!, provider);
    const abi = TestContract.abi;
    const bytecode = TestContract.bytecode;
    let contract: Contract;
    let addr: string;
    before(async function () {
        this.timeout(100000);
        const factory = new ContractFactory(abi, bytecode, wallet as ContractRunner, TestContract.IPFSHash);
        contract = (await factory.deploy()) as Contract;
        addr = await contract.getAddress();
        console.log('waiting for contract deployment');
        await contract.waitForDeployment();
    });

    it('tests contract calls', async function () {
        this.timeout(10000);

        assert.equal(await contract.testCallAdd(4, 5), BigInt(9), 'testCallAdd(4, 5)');
        assert.equal(await contract.testCallAdd(6, 0), BigInt(6), 'testCallAdd(6, 0)');
    });

    //Awaiting Quai subscrigbe functionality

    // it("tests events", async function() {
    //     this.timeout(60000);

    //     assert.ok(provider)

    //     const vUint256 = 42;
    //     const vAddrName = "quais.eth";
    //     const vAddr = "0x228568EA92aC5Bc281c1E30b1893735c60a139F1";
    //     const vString = "Hello";
    //     const vBytes = "0x12345678";

    //     let hash: null | string = null;

    //     // Test running a listener for a specific event
    //     const specificEvent = new Promise((resolve, reject) => {
    //         contract.on("EventUint256", async (value, event) => {
    //             // Triggered by someone else
    //             if (hash == null || hash !== event.log.transactionHash) { return; }

    //             try {
    //                 assert.equal(event.filter, "EventUint256", "event.filter");
    //                 assert.equal(event.fragment.name, "EventUint256", "event.fragment.name");
    //                 assert.equal(event.log.address, addr, "event.log.address");
    //                 assert.equal(event.args.length, 1, "event.args.length");
    //                 assert.equal(event.args[0], BigInt(42), "event.args[0]");

    //                 const count = await contract.listenerCount("EventUint256");
    //                 await event.removeListener();
    //                 assert.equal(await contract.listenerCount("EventUint256"), count - 1, "decrement event count");

    //                 resolve(null);
    //             } catch (e) {
    //                 event.removeListener();
    //                 reject(e);
    //             }
    //         });
    //     });

    //     // Test running a listener on all (i.e. "*") events
    //     const allEvents = new Promise((resolve, reject) => {
    //         const waitingFor: Record<string, any> = {
    //             EventUint256: vUint256,
    //             EventAddress: vAddr,
    //             EventString: vString,
    //             EventBytes: vBytes
    //         };

    //         contract.on("*", (event: ContractEventPayload) => {
    //             // Triggered by someone else
    //             if (hash == null || hash !== event.log.transactionHash) { return; }
    //             try {
    //                 const name = event.eventName;

    //                 assert.equal(event.args[0], waitingFor[name], `${ name }`);
    //                 delete waitingFor[name];

    //                 if (Object.keys(waitingFor).length === 0) {
    //                     event.removeListener();
    //                     resolve(null);
    //                 }

    //             } catch (error) {
    //                 reject(error);
    //             }
    //         });

    //     });

    //     // Send a transaction to trigger some events
    //     const tx = await contractSigner.testEvent(vUint256, vAddr, vString, vBytes);
    //     hash = tx.hash;

    //     const checkEvent = (filter: ContractEventName, event: EventLog | Log) => {
    //         const values: Record<string, any> = {
    //             EventUint256: vUint256,
    //             EventString: vString,
    //             EventAddress: vAddr,
    //             EventBytes: vBytes
    //         };

    //         assert.ok(event instanceof EventLog, `queryFilter(${ filter }):isEventLog`);

    //         const name = event.eventName;

    //         assert.equal(event.address, addr, `queryFilter(${ filter }):address`);
    //         assert.equal(event.args[0], values[name], `queryFilter(${ filter }):args[0]`);
    //     };

    //     const checkEventFilter = async (filter: ContractEventName) => {
    //         const events = (await contract.queryFilter(filter, -10)).filter((e) => (e.transactionHash === hash));
    //         assert.equal(events.length, 1, `queryFilter(${ filter }).length`);
    //         checkEvent(filter, events[0]);
    //         return events[0];
    //     };

    //     const receipt = await tx.wait();

    //     // Check the logs in the receipt
    //     for (const log of receipt.logs) { checkEvent("receipt", log); }

    //     // Various options for queryFilter
    //     await checkEventFilter("EventUint256");
    //     await checkEventFilter([ "EventUint256" ]);
    //     await checkEventFilter([ [ "EventUint256" ] ]);
    //     await checkEventFilter("EventUint256(uint)");
    //     await checkEventFilter([ "EventUint256(uint)" ]);
    //     await checkEventFilter([ [ "EventUint256(uint)" ] ]);
    //     await checkEventFilter([ [ "EventUint256", "EventUint256(uint)" ] ]);
    //     await checkEventFilter("0x85c55bbb820e6d71c71f4894e57751de334b38c421f9c170b0e66d32eafea337");

    //     // Query by Event
    //     await checkEventFilter(contract.filters.EventUint256);

    //     // Query by Deferred Topic Filter; address
    //     await checkEventFilter(contract.filters.EventUint256(vUint256));

    //     // Query by Deferred Topic Filter; address
    //     await checkEventFilter(contract.filters.EventAddress(vAddr));

    //     // Query by Deferred Topic Filter; ENS name => address
    //     await checkEventFilter(contract.filters.EventAddress(vAddrName));

    //     // Multiple Methods
    //     {
    //         const filter = [ [ "EventUint256", "EventString" ] ];
    //         const events = (await contract.queryFilter(filter, -10)).filter((e) => (e.transactionHash === hash));
    //         assert.equal(events.length, 2, `queryFilter(${ filter }).length`);

    //         for (const event of events) { checkEvent(filter, event); }
    //     }

    //     await specificEvent;
    //     await allEvents;
    // });

    it('tests the _in_ operator for functions', function () {
        const contract = new Contract(addr, abi);

        assert.equal('testCallAdd' in contract, true, 'has(testCallAdd)');
        assert.equal('nonExist' in contract, false, 'has(nonExist)');

        {
            const sig = 'function testCallAdd(uint256 a, uint256 b) pure returns (uint256 result)';
            assert.equal(sig in contract, true, `has(${sig})`);
            assert.equal('function nonExist()' in contract, false, 'has(function nonExist())');
        }

        assert.equal('0xf24684e5' in contract, true, 'has(0xf24684e5)');
        assert.equal('0xbad01234' in contract, false, 'has(0xbad01234)');
    });

    it('tests the _in_ operator for events', function () {
        const contract = new Contract(addr, abi);

        assert.equal('EventUint256' in contract.filters, true, 'has(EventUint256)');
        assert.equal('NonExist' in contract.filters, false, 'has(NonExist)');

        {
            const sig = 'event EventUint256(uint256 indexed value)';
            assert.equal(sig in contract.filters, true, `has(${sig})`);
            assert.equal('event NonExist()' in contract.filters, false, 'has(event NonExist())');
        }

        {
            const hash = '0x85c55bbb820e6d71c71f4894e57751de334b38c421f9c170b0e66d32eafea337';
            const badHash = '0xbad01234567890ffbad01234567890ffbad01234567890ffbad01234567890ff';
            assert.equal(hash in contract.filters, true, `has(${hash})`);
            assert.equal(badHash in contract.filters, false, `has(${badHash})`);
        }
    });
});

describe('Test Typed Contract Interaction', function () {
    const tests: Array<{ types: Array<string>; valueFunc: (t: string) => any }> = [
        {
            types: [
                'uint8',
                'uint16',
                'uint24',
                'uint32',
                'uint40',
                'uint48',
                'uint56',
                'uint64',
                'uint72',
                'uint80',
                'uint88',
                'uint96',
                'uint104',
                'uint112',
                'uint120',
                'uint128',
                'uint136',
                'uint144',
                'uint152',
                'uint160',
                'uint168',
                'uint176',
                'uint184',
                'uint192',
                'uint200',
                'uint208',
                'uint216',
                'uint224',
                'uint232',
                'uint240',
                'uint248',
                'uint256',
                'int8',
                'int16',
                'int24',
                'int32',
                'int40',
                'int48',
                'int56',
                'int64',
                'int72',
                'int80',
                'int88',
                'int96',
                'int104',
                'int112',
                'int120',
                'int128',
                'int136',
                'int144',
                'int152',
                'int160',
                'int168',
                'int176',
                'int184',
                'int192',
                'int200',
                'int208',
                'int216',
                'int224',
                'int232',
                'int240',
                'int248',
                'int256',
            ],
            // TODO: `type` is not used, remove or re-write
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            valueFunc: (type: string) => {
                return 42;
            },
        },
        {
            types: [
                'bytes1',
                'bytes2',
                'bytes3',
                'bytes4',
                'bytes5',
                'bytes6',
                'bytes7',
                'bytes8',
                'bytes9',
                'bytes10',
                'bytes11',
                'bytes12',
                'bytes13',
                'bytes14',
                'bytes15',
                'bytes16',
                'bytes17',
                'bytes18',
                'bytes19',
                'bytes20',
                'bytes21',
                'bytes22',
                'bytes23',
                'bytes24',
                'bytes25',
                'bytes26',
                'bytes27',
                'bytes28',
                'bytes29',
                'bytes30',
                'bytes31',
                'bytes32',
                'bytes',
            ],
            valueFunc: (type: string) => {
                const length = type.substring(5);
                if (length) {
                    const value = new Uint8Array(parseInt(length));
                    value.fill(42);
                    return value;
                }
                return '0x123456';
            },
        },
        {
            types: ['bool'],
            // TODO: `type` is not used, remove or re-write
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            valueFunc: (type: string) => {
                return true;
            },
        },
        {
            types: ['address'],
            // TODO: `type` is not used, remove or re-write
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            valueFunc: (type: string) => {
                return '0x643aA0A61eADCC9Cc202D1915D942d35D005400C';
            },
        },
        {
            types: ['string'],
            // TODO: `type` is not used, remove or re-write
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            valueFunc: (type: string) => {
                return 'someString';
            },
        },
    ];

    const abi = TypedContract.abi;
    const provider = new quais.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new quais.Wallet(process.env.CYPRUS1_PRIVKEY_1!, provider);
    const bytecode = TypedContract.bytecode;
    let contract: Contract;
    before(async function () {
        this.timeout(120000);
        const factory = new ContractFactory(abi, bytecode, wallet as ContractRunner);
        contract = (await factory.deploy()) as Contract;
        console.log('waiting for contract deployment');
        await contract.waitForDeployment();
    });

    for (const { types, valueFunc } of tests) {
        for (const type of types) {
            const value = valueFunc(type);

            it(`tests typed value: Typed.from(${type})`, async function () {
                this.timeout(10000);

                const v = Typed.from(type, value);
                const result = await contract.testTyped(v);
                assert.equal(result, type);
            });

            it(`tests typed value: Typed.${type}()`, async function () {
                this.timeout(10000);

                const v = (<any>Typed)[type](value);
                const result = await contract.testTyped(v);
                assert.equal(result, type);
            });
        }
    }
});

type TestContractFallbackResult =
    | {
          data: string;
      }
    | {
          error: string;
      };

type TestContractFallback = {
    name: string;
    address: string;
    abi: Array<string>;
    sendNone: TestContractFallbackResult;
    sendData: TestContractFallbackResult;
    sendValue: TestContractFallbackResult;
    sendDataAndValue: TestContractFallbackResult;
};

describe('Test Contract Fallback', function () {
    const tests: Array<TestContractFallback> = [
        {
            name: 'none',
            address: '0x0CcdacE3D8353FeD9B87a2D63c40452923CcDAE5',
            abi: [],
            sendNone: { error: 'no fallback' },
            sendData: { error: 'no fallback' },
            sendValue: { error: 'no fallback' },
            sendDataAndValue: { error: 'no fallback' },
        },
        {
            name: 'non-payable fallback',
            address: '0x3F10193F79A639b11eC9d2AB42A25A4a905a8870',
            abi: ['fallback()'],
            sendNone: { data: '0x' },
            sendData: { data: '0x1234' },
            sendValue: { error: 'overrides.value' },
            sendDataAndValue: { error: 'overrides.value' },
        },
        {
            name: 'payable fallback',
            address: '0xe2de6B97C5eB9Fee8a47ca6c0fa642331E0B6330',
            abi: ['fallback() payable'],
            sendNone: { data: '0x' },
            sendData: { data: '0x1234' },
            sendValue: { data: '0x' },
            sendDataAndValue: { data: '0x1234' },
        },
        {
            name: 'receive-only',
            address: '0xF8F2AfbBE37F6a4520e4Db7F99495655aa31229b',
            abi: ['receive()'],
            sendNone: { data: '0x' },
            sendData: { error: 'overrides.data' },
            sendValue: { data: '0x' },
            sendDataAndValue: { error: 'overrides.data' },
        },
        {
            name: 'receive and payable fallback',
            address: '0x7d97CA5D9deA1Cd0364f1D493252006A3c4e18a0',
            abi: ['fallback() payable', 'receive()'],
            sendNone: { data: '0x' },
            sendData: { data: '0x1234' },
            sendValue: { data: '0x' },
            sendDataAndValue: { data: '0x1234' },
        },
        {
            name: 'receive and non-payable fallback',
            address: '0x5B59D934f0D22b15e73b5d6b9Ae83486B70dF67e',
            abi: ['fallback()', 'receive()'],
            sendNone: { data: '0x' },
            sendData: { data: '0x' },
            sendValue: { data: '0x' },
            sendDataAndValue: { error: 'overrides' },
        },
    ];

    const provider = getProvider('InfuraProvider', 'goerli');

    const testGroups: Array<{ group: 'sendNone' | 'sendData' | 'sendValue' | 'sendDataAndValue'; tx: any }> = [
        {
            group: 'sendNone',
            tx: {},
        },
        {
            group: 'sendData',
            tx: { data: '0x1234' },
        },
        {
            group: 'sendValue',
            tx: { value: 123 },
        },
        {
            group: 'sendDataAndValue',
            tx: { data: '0x1234', value: 123 },
        },
    ];

    for (const { group, tx } of testGroups) {
        for (const test of tests) {
            const { name, address, abi } = test;
            const send = test[group];

            const contract = new Contract(address, abi, provider as ContractRunner);
            it(`test contract fallback checks: ${group} - ${name}`, async function () {
                const func = async function () {
                    if (abi.length === 0) {
                        throw new Error('no fallback');
                    }
                    assert.ok(contract.fallback);
                    return await contract.fallback.populateTransaction(tx);
                };

                if ('data' in send) {
                    await func();
                    //const result = await func();
                    //@TODO: Test for the correct populated tx
                    //console.log(result);
                    assert.ok(true);
                } else {
                    await assert.rejects(func, function (error: any) {
                        if (error.message === send.error) {
                            return true;
                        }
                        if (isError(error, 'INVALID_ARGUMENT')) {
                            return error.argument === send.error;
                        }
                        console.log('EE', error);
                        return true;
                    });
                }
            });
        }
    }
});
