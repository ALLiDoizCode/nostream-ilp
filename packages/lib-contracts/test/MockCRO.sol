// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockCRO
 * @notice Mock ERC-20 token simulating Cronos (CRO) for testing purposes
 * @dev This contract is ONLY for testing MultiTokenPaymentChannelFactory.sol in local Hardhat environment.
 *      Real CRO token uses 18 decimals (standard ERC-20).
 *      Includes a public mint() function for test token distribution (not present in real CRO).
 */
contract MockCRO is ERC20 {
    /**
     * @notice Initializes MockCRO token and mints 1,000,000 CRO to deployer
     * @dev Initial supply: 1,000,000 * 10^18 base units (18 decimals)
     */
    constructor() ERC20("Mock Cronos", "CRO") {
        _mint(msg.sender, 1000000 * 10**18); // 1M CRO with 18 decimals
    }

    /**
     * @notice Mints test tokens to specified address
     * @dev Only for testing - real CRO token does not have public mint function
     * @param to Address to receive minted tokens
     * @param amount Amount of tokens to mint (in base units, 18 decimals)
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
