// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ERC20Stablecoin
 * @notice ERC20 stablecoin implementation for testing and development purposes
 */
contract ERC20Stablecoin is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {
        // Mint initial supply to deployer
        _mint(msg.sender, 1000000 * 10**decimals());
    }
    
    /**
     * @notice Mint tokens to an address
     * @param to Address to mint to
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

