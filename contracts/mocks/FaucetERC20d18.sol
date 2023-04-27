// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ERC20d18.sol";

contract FaucetERC20d18 is ERC20d18, Ownable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 value
    ) ERC20d18(name, symbol) {
        if( value > 0 ){
            _mint(msg.sender, value);
        }
    }
    function mint(uint256 value) public onlyOwner {
        _mint(msg.sender, value);
    }
}
