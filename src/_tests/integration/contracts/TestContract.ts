const TestContract = {
    _format: 'hh-sol-artifact-1',
    contractName: 'TestContract',
    sourceName: 'contracts/Test.sol',
    abi: [
        {
            inputs: [
                {
                    internalType: 'uint256',
                    name: 'code',
                    type: 'uint256',
                },
                {
                    internalType: 'string',
                    name: 'message',
                    type: 'string',
                },
            ],
            name: 'CustomError1',
            type: 'error',
        },
        {
            anonymous: false,
            inputs: [
                {
                    indexed: true,
                    internalType: 'address',
                    name: 'value',
                    type: 'address',
                },
            ],
            name: 'EventAddress',
            type: 'event',
        },
        {
            anonymous: false,
            inputs: [
                {
                    indexed: false,
                    internalType: 'bytes',
                    name: 'value',
                    type: 'bytes',
                },
            ],
            name: 'EventBytes',
            type: 'event',
        },
        {
            anonymous: false,
            inputs: [
                {
                    indexed: false,
                    internalType: 'string',
                    name: 'value',
                    type: 'string',
                },
            ],
            name: 'EventString',
            type: 'event',
        },
        {
            anonymous: false,
            inputs: [
                {
                    indexed: true,
                    internalType: 'uint256',
                    name: 'value',
                    type: 'uint256',
                },
            ],
            name: 'EventUint256',
            type: 'event',
        },
        {
            inputs: [
                {
                    internalType: 'uint256',
                    name: 'a',
                    type: 'uint256',
                },
                {
                    internalType: 'uint256',
                    name: 'b',
                    type: 'uint256',
                },
            ],
            name: 'testCallAdd',
            outputs: [
                {
                    internalType: 'uint256',
                    name: 'result',
                    type: 'uint256',
                },
            ],
            stateMutability: 'pure',
            type: 'function',
        },
        {
            inputs: [
                {
                    internalType: 'bool',
                    name: 'pass',
                    type: 'bool',
                },
                {
                    internalType: 'uint256',
                    name: 'code',
                    type: 'uint256',
                },
                {
                    internalType: 'string',
                    name: 'message',
                    type: 'string',
                },
            ],
            name: 'testCustomError1',
            outputs: [
                {
                    internalType: 'uint256',
                    name: '',
                    type: 'uint256',
                },
            ],
            stateMutability: 'pure',
            type: 'function',
        },
        {
            inputs: [
                {
                    internalType: 'bool',
                    name: 'pass',
                    type: 'bool',
                },
                {
                    internalType: 'string',
                    name: 'message',
                    type: 'string',
                },
            ],
            name: 'testErrorString',
            outputs: [
                {
                    internalType: 'uint256',
                    name: '',
                    type: 'uint256',
                },
            ],
            stateMutability: 'pure',
            type: 'function',
        },
        {
            inputs: [
                {
                    internalType: 'uint256',
                    name: 'valueUint256',
                    type: 'uint256',
                },
                {
                    internalType: 'address',
                    name: 'valueAddress',
                    type: 'address',
                },
                {
                    internalType: 'string',
                    name: 'valueString',
                    type: 'string',
                },
                {
                    internalType: 'bytes',
                    name: 'valueBytes',
                    type: 'bytes',
                },
            ],
            name: 'testEvent',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
        },
        {
            inputs: [
                {
                    internalType: 'uint256',
                    name: 'code',
                    type: 'uint256',
                },
            ],
            name: 'testPanic',
            outputs: [
                {
                    internalType: 'uint256',
                    name: '',
                    type: 'uint256',
                },
            ],
            stateMutability: 'pure',
            type: 'function',
        },
    ],
    bytecode:
        '0x608060405234801561001057600080fd5b5061058d806100206000396000f3fe608060405234801561001057600080fd5b50600436106100675760003560e01c8063c8d6fda711610050578063c8d6fda7146100a4578063db734248146100b9578063f24684e5146100cc57600080fd5b80633da613681461006c578063b206699b14610091575b600080fd5b61007f61007a3660046102aa565b6100df565b60405190815260200160405180910390f35b61007f61009f366004610321565b61013a565b6100b76100b2366004610374565b610167565b005b61007f6100c7366004610419565b61024d565b61007f6100da366004610473565b610295565b6000816000036101365760405162461bcd60e51b815260206004820152601360248201527f50616e69633a20636f6465206973207a65726f0000000000000000000000000060448201526064015b60405180910390fd5b5090565b600082828561015d5760405162461bcd60e51b815260040161012d9291906104be565b5091949350505050565b60405186907f85c55bbb820e6d71c71f4894e57751de334b38c421f9c170b0e66d32eafea33790600090a260405173ffffffffffffffffffffffffffffffffffffffff8616907f52cb491081609a3d8c50cb8d5c1395de748f65789fc66e140e795decadd86c3090600090a27f7240e2f75cccc64acf37f699b7cc2726ccd9c0ed8afeafdbf7911af78d077bad84846040516102049291906104be565b60405180910390a17f06e852ba9138ee18ce13f482908b8634bc29d809282ea568cf505aca412b195e828260405161023d9291906104be565b60405180910390a1505050505050565b60008461028c578383836040517f180c751a00000000000000000000000000000000000000000000000000000000815260040161012d939291906104da565b50919392505050565b60006102a182846104fd565b90505b92915050565b6000602082840312156102bc57600080fd5b5035919050565b803580151581146102d357600080fd5b919050565b60008083601f8401126102ea57600080fd5b50813567ffffffffffffffff81111561030257600080fd5b60208301915083602082850101111561031a57600080fd5b9250929050565b60008060006040848603121561033657600080fd5b61033f846102c3565b9250602084013567ffffffffffffffff81111561035b57600080fd5b610367868287016102d8565b9497909650939450505050565b6000806000806000806080878903121561038d57600080fd5b86359550602087013573ffffffffffffffffffffffffffffffffffffffff811681146103b857600080fd5b9450604087013567ffffffffffffffff808211156103d557600080fd5b6103e18a838b016102d8565b909650945060608901359150808211156103fa57600080fd5b5061040789828a016102d8565b979a9699509497509295939492505050565b6000806000806060858703121561042f57600080fd5b610438856102c3565b935060208501359250604085013567ffffffffffffffff81111561045b57600080fd5b610467878288016102d8565b95989497509550505050565b6000806040838503121561048657600080fd5b50508035926020909101359150565b81835281816020850137506000828201602090810191909152601f909101601f19169091010190565b6020815260006104d2602083018486610495565b949350505050565b8381526040602082015260006104f4604083018486610495565b95945050505050565b808201808211156102a4577f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fdfea2646970667358221220aa52c22ce2f4a856b56d32ae58c6b41a9dba4c7aed43a0872ffa898f157e67b564736f6c637822302e382e31392d646576656c6f702b636f6d6d69742e63383866343066642e6d6f640053',
    deployedBytecode:
        '0x608060405234801561001057600080fd5b50600436106100675760003560e01c8063c8d6fda711610050578063c8d6fda7146100a4578063db734248146100b9578063f24684e5146100cc57600080fd5b80633da613681461006c578063b206699b14610091575b600080fd5b61007f61007a3660046102aa565b6100df565b60405190815260200160405180910390f35b61007f61009f366004610321565b61013a565b6100b76100b2366004610374565b610167565b005b61007f6100c7366004610419565b61024d565b61007f6100da366004610473565b610295565b6000816000036101365760405162461bcd60e51b815260206004820152601360248201527f50616e69633a20636f6465206973207a65726f0000000000000000000000000060448201526064015b60405180910390fd5b5090565b600082828561015d5760405162461bcd60e51b815260040161012d9291906104be565b5091949350505050565b60405186907f85c55bbb820e6d71c71f4894e57751de334b38c421f9c170b0e66d32eafea33790600090a260405173ffffffffffffffffffffffffffffffffffffffff8616907f52cb491081609a3d8c50cb8d5c1395de748f65789fc66e140e795decadd86c3090600090a27f7240e2f75cccc64acf37f699b7cc2726ccd9c0ed8afeafdbf7911af78d077bad84846040516102049291906104be565b60405180910390a17f06e852ba9138ee18ce13f482908b8634bc29d809282ea568cf505aca412b195e828260405161023d9291906104be565b60405180910390a1505050505050565b60008461028c578383836040517f180c751a00000000000000000000000000000000000000000000000000000000815260040161012d939291906104da565b50919392505050565b60006102a182846104fd565b90505b92915050565b6000602082840312156102bc57600080fd5b5035919050565b803580151581146102d357600080fd5b919050565b60008083601f8401126102ea57600080fd5b50813567ffffffffffffffff81111561030257600080fd5b60208301915083602082850101111561031a57600080fd5b9250929050565b60008060006040848603121561033657600080fd5b61033f846102c3565b9250602084013567ffffffffffffffff81111561035b57600080fd5b610367868287016102d8565b9497909650939450505050565b6000806000806000806080878903121561038d57600080fd5b86359550602087013573ffffffffffffffffffffffffffffffffffffffff811681146103b857600080fd5b9450604087013567ffffffffffffffff808211156103d557600080fd5b6103e18a838b016102d8565b909650945060608901359150808211156103fa57600080fd5b5061040789828a016102d8565b979a9699509497509295939492505050565b6000806000806060858703121561042f57600080fd5b610438856102c3565b935060208501359250604085013567ffffffffffffffff81111561045b57600080fd5b610467878288016102d8565b95989497509550505050565b6000806040838503121561048657600080fd5b50508035926020909101359150565b81835281816020850137506000828201602090810191909152601f909101601f19169091010190565b6020815260006104d2602083018486610495565b949350505050565b8381526040602082015260006104f4604083018486610495565b95945050505050565b808201808211156102a4577f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fdfea2646970667358221220aa52c22ce2f4a856b56d32ae58c6b41a9dba4c7aed43a0872ffa898f157e67b564736f6c637822302e382e31392d646576656c6f702b636f6d6d69742e63383866343066642e6d6f640053',
    linkReferences: {},
    deployedLinkReferences: {},
    IPFSHash: 'QmWDYwkacW9oDGegFsW3WiVeRZx2Ebp4bwwsHEUUrSHTsu',
};

export default TestContract;
