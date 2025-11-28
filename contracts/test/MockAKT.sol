// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockAKT
 * @notice Mock ERC-20 token simulating Akash (AKT) token for testing purposes
 * @dev This contract is ONLY for testing CronosPaymentChannel.sol in local Hardhat environment.
 *      Real AKT token on Cronos uses 6 decimals (1 AKT = 1,000,000 uakt).
 *      Includes a public mint() function for test token distribution (not present in real AKT).
 */
contract MockAKT is ERC20 {
    /**
     * @notice Initializes MockAKT token and mints 1,000,000 AKT to deployer
     * @dev Initial supply: 1,000,000 * 10^6 = 1,000,000,000,000 base units
     */
    constructor() ERC20("Mock Akash Token", "AKT") {
        _mint(msg.sender, 1000000 * 10**6); // 1M AKT with 6 decimals
    }

    /**
     * @notice Returns 6 decimals to match real AKT token precision
     * @dev Overrides ERC20 default of 18 decimals
     * @return uint8 Number of decimals (6)
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @notice Mints test tokens to specified address
     * @dev Only for testing - real AKT token does not have public mint function
     * @param to Address to receive minted tokens
     * @param amount Amount of tokens to mint (in base units, 6 decimals)
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
