// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleStorage2 {
    uint256 public value;

    function set(uint256 _value) public {
        value = _value;
    }

    function get() public view returns (uint256) {
        return value;
    }
}