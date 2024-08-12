/**
 * // SPDX-License-Identifier: MIT pragma solidity ^0.8.0;
 *
 * Contract SimpleStorage { uint256 private storedValue;
 *
 * ```
 * event ValueSet(uint256 value, address indexed sender);
 *
 * function set(uint256 value) public {
 *     storedValue = value;
 *     emit ValueSet(value, msg.sender);
 * }
 *
 * function get() public view returns (uint256) {
 *     uint256 value = storedValue;
 *     return value;
 * }
 * ```
 *
 * }
 */

const SimpleStorageContract = {
    abi: [
        {
            anonymous: false,
            inputs: [
                {
                    indexed: false,
                    internalType: 'uint256',
                    name: 'value',
                    type: 'uint256',
                },
                {
                    indexed: true,
                    internalType: 'address',
                    name: 'sender',
                    type: 'address',
                },
            ],
            name: 'ValueSet',
            type: 'event',
        },
        {
            inputs: [],
            name: 'get',
            outputs: [
                {
                    internalType: 'uint256',
                    name: '',
                    type: 'uint256',
                },
            ],
            stateMutability: 'view',
            type: 'function',
        },
        {
            inputs: [
                {
                    internalType: 'uint256',
                    name: 'value',
                    type: 'uint256',
                },
            ],
            name: 'set',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
        },
    ],
    bytecode:
        '608060405234801561001057600080fd5b506101a4806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c806360fe47b11461003b5780636d4ce63c14610057575b600080fd5b61005560048036038101906100509190610117565b610075565b005b61005f6100cd565b60405161006c9190610153565b60405180910390f35b806000819055503373ffffffffffffffffffffffffffffffffffffffff167ff421846e535e82c1fbd6ac49ea86e258f1940223db04456b26480f6f2db9f6a7826040516100c29190610153565b60405180910390a250565b60008060005490508091505090565b600080fd5b6000819050919050565b6100f4816100e1565b81146100ff57600080fd5b50565b600081359050610111816100eb565b92915050565b60006020828403121561012d5761012c6100dc565b5b600061013b84828501610102565b91505092915050565b61014d816100e1565b82525050565b60006020820190506101686000830184610144565b9291505056fea26469706673582212201dd5b83145448313aa02435965c7540ab7de4cf6e943b753d76639f61bb077c164736f6c63430008130033',
};

export default SimpleStorageContract;
