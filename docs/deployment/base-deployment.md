# Base Mainnet Deployment Guide

**Story:** 4.2 - Deploy Multi-Token Factory to Base Mainnet
**Date:** 2025-12-05
**Network:** Base Mainnet (Chain ID: 8453)

---

## Overview

This document details the deployment of **MultiTokenPaymentChannelFactory** to Base L2 mainnet, enabling payment channels with native ETH and USDC tokens.

### Deployed Contract

- **Contract Name:** MultiTokenPaymentChannelFactory
- **Address:** `0xf7e968d6f3bdFC504A434288Ea3f243e033e846F`
- **BaseScan:** https://basescan.org/address/0xf7e968d6f3bdFC504A434288Ea3f243e033e846F#code
- **Network:** Base Mainnet (8453)
- **Verification Status:** ✅ Verified

---

## Prerequisites

### Required Tools

```bash
# Install dependencies
pnpm install

# Verify Hardhat installation
npx hardhat --version
```

### Required Accounts & Keys

1. **Deployer Wallet**
   - Funded with ≥0.005 ETH on Base mainnet
   - Private key stored in `.env` as `PRIVATE_KEY`
   - **⚠️ Never commit `.env` to version control**

2. **BaseScan API Key**
   - Create free account: https://basescan.org
   - Generate API key: Account Settings → API-KEYs
   - Store in `.env` as `BASESCAN_API_KEY`

### Funding the Deployer

**Option 1: Bridge from Ethereum**
```bash
# Visit official Base bridge
https://bridge.base.org

# Bridge at least 0.005 ETH to cover:
# - Deployment: ~0.0014 ETH
# - Testing: ~0.0005 ETH
# - Buffer: ~0.0031 ETH
```

**Option 2: Purchase on Base**
- Use centralized exchange with Base withdrawals (Coinbase, Binance)
- Direct deposit to Base network

---

## Deployment Steps

### Step 1: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env and set:
PRIVATE_KEY=your_64_character_hex_private_key
BASESCAN_API_KEY=your_basescan_api_key
BASE_RPC_URL=https://mainnet.base.org
```

### Step 2: Verify Network Configuration

```bash
# Check Hardhat can connect to Base
npx hardhat console --network base

# Should compile successfully and connect
# Press Ctrl+C to exit
```

### Step 3: Check Deployer Balance

```bash
# Verify wallet has sufficient ETH
npx hardhat run scripts/check-balance.ts --network base

# Expected output:
# ✅ Sufficient balance for deployment
# Balance: 0.005 ETH (or more)
```

### Step 4: Deploy Factory Contract

```bash
# Deploy to Base mainnet
npx hardhat run scripts/deploy-base-factory.ts --network base
```

**Expected Output:**
```
Deploying MultiTokenPaymentChannelFactory to Base Mainnet...

Deploying with account: 0x6f7830A69BF0022AA586bd0E94FB34f86e7075cB
Account balance: 0.005 ETH

Deploying contract...

✅ MultiTokenPaymentChannelFactory deployed to: 0xf7e968d6f3bdFC504A434288Ea3f243e033e846F
Transaction hash: 0x4c4d9bbfecc6df67e5359c0b6cc4c8588df96f7c0f03df31c4a7588fbf9b0c6d
Gas used: 1173394
Gas price: 0.0012 gwei
Total cost: 0.0000014080728 ETH

📋 Deployment Info: {
  "network": "base-mainnet",
  "chainId": 8453,
  "contractAddress": "0xf7e968d6f3bdFC504A434288Ea3f243e033e846F",
  "txHash": "0x4c4d9bbfecc6df67e5359c0b6cc4c8588df96f7c0f03df31c4a7588fbf9b0c6d",
  "timestamp": "2025-12-05T05:58:02.502Z",
  "deployer": "0x6f7830A69BF0022AA586bd0E94FB34f86e7075cB"
}
```

**Deployment saved to:** `deployments/base-mainnet.json`

### Step 5: Verify on BaseScan

```bash
# Verify contract source code
npx hardhat verify --network base 0xf7e968d6f3bdFC504A434288Ea3f243e033e846F
```

**Expected Output:**
```
Successfully submitted source code for contract
contracts/MultiTokenPaymentChannelFactory.sol:MultiTokenPaymentChannelFactory at 0xf7e968d6f3bdFC504A434288Ea3f243e033e846F
for verification on the block explorer. Waiting for verification result...

Successfully verified contract MultiTokenPaymentChannelFactory on the block explorer.
https://basescan.org/address/0xf7e968d6f3bdFC504A434288Ea3f243e033e846F#code
```

### Step 6: Update Configuration

```bash
# Update .env with deployed address
echo "BASE_MAINNET_FACTORY_ADDRESS=0xf7e968d6f3bdFC504A434288Ea3f243e033e846F" >> .env
```

---

## Gas Cost Analysis

### Deployment Costs (Actual)

| Operation | Gas Used | Gas Price | ETH Cost | USD Cost* |
|-----------|----------|-----------|----------|-----------|
| Deploy Factory | 1,173,394 | 0.0012 gwei | 0.00000141 ETH | $0.0042 |

*Assuming ETH = $3,000 USD

### Channel Operation Costs (Measured)

| Operation | Gas Used | Gas Price | ETH Cost | USD Cost* |
|-----------|----------|-----------|----------|-----------|
| openChannel (ETH) | 121,277 | 0.0012 gwei | 0.00000015 ETH | $0.000437 |
| topUpChannel (ETH) | 36,158 | 0.0012 gwei | 0.00000004 ETH | $0.000130 |
| closeChannel (ETH) | 129,089 | 0.0012 gwei | 0.00000016 ETH | $0.000465 |

**Channel Lifecycle Cost (open + close):** $0.000902 USD ✅

**✅ AC 3 VALIDATION:** All operations <$0.01 per channel lifecycle (PASS)

---

## Supported Tokens

### Native ETH

- **Address:** `0x0000000000000000000000000000000000000000` (address(0) convention)
- **Symbol:** ETH
- **Decimals:** 18
- **Type:** Native Base L2 currency
- **Usage:** Send as `msg.value` in `openChannel()` and `topUpChannel()`

### USDC (Circle)

- **Address:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Symbol:** USDC
- **Decimals:** 6
- **Type:** ERC-20 (Official Circle USD Coin)
- **Verification:** https://basescan.org/address/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
- **Usage:** Requires `approve(factoryAddress, amount)` before `openChannel()`

**Token Configuration File:** `src/config/base-tokens.yaml`

---

## Usage Examples

### Open ETH Channel

```solidity
// Open channel with 0.001 ETH
uint256 expiration = block.timestamp + 3600; // 1 hour
bytes32 channelId = factory.openChannel{value: 0.001 ether}(
    address(0),           // tokenAddress (ETH)
    recipientAddress,     // recipient
    0.001 ether,          // amount
    expiration            // expiration timestamp
);
```

### Open USDC Channel

```solidity
// Approve USDC spending
IERC20 usdc = IERC20(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913);
usdc.approve(factoryAddress, 10_000000); // 10 USDC (6 decimals)

// Open channel with 10 USDC
bytes32 channelId = factory.openChannel(
    0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, // tokenAddress (USDC)
    recipientAddress,                           // recipient
    10_000000,                                  // amount (10 USDC)
    expiration                                  // expiration timestamp
);
```

### Top-Up Channel

```solidity
// Top-up ETH channel
factory.topUpChannel{value: 0.0005 ether}(channelId, 0.0005 ether);

// Top-up USDC channel (requires prior approval)
factory.topUpChannel(channelId, 5_000000); // Add 5 USDC
```

### Close Channel

```solidity
// Create signed claim
bytes32 messageHash = keccak256(abi.encodePacked(channelId, claimAmount, nonce));
bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
bytes memory signature = sender.sign(ethSignedMessageHash);

// Close channel
factory.closeChannel(channelId, claimAmount, nonce, signature);
```

---

## Security Considerations

### Deployment Security

1. **Private Key Protection**
   - ✅ Never commit `.env` to version control
   - ✅ Use environment variables for CI/CD
   - ⚠️ Consider hardware wallet for large deployments
   - ✅ Rotate keys after deployment if exposed

2. **Contract Verification**
   - ✅ Source code verified on BaseScan
   - ✅ Compilation settings match exactly
   - ✅ Users can inspect contract before use

### Operational Security

1. **Token Address Validation**
   - ✅ USDC address verified: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
   - ✅ Cross-referenced with Circle documentation
   - ✅ BaseScan verification: ✅ Verified Contract

2. **Reentrancy Protection**
   - ✅ `closeChannel()` uses OpenZeppelin `ReentrancyGuard`
   - ✅ State updates before external calls
   - ✅ No known vulnerabilities

3. **Signature Verification**
   - ✅ ECDSA signature recovery via OpenZeppelin
   - ✅ Nonce-based replay protection
   - ✅ Message hash includes channel ID, amount, nonce

### Production Recommendations

1. **Before Large-Scale Use**
   - Consider professional security audit
   - Test thoroughly with small amounts
   - Monitor contract for unusual activity

2. **Operational Monitoring**
   - Watch BaseScan for contract events
   - Set up alerts for large transactions
   - Track gas price fluctuations

3. **Upgrade Path**
   - Contract is NOT upgradeable (immutable deployment)
   - Future versions require new deployment
   - Plan migration strategy if changes needed

---

## Troubleshooting

### Deployment Fails

**Error:** `Insufficient balance`
```bash
# Check balance
npx hardhat run scripts/check-balance.ts --network base

# Bridge more ETH via https://bridge.base.org
```

**Error:** `execution reverted`
```bash
# Verify Hardhat config is correct
# Check hardhat.config.ts has base network defined
# Verify RPC URL is accessible: https://mainnet.base.org
```

### Verification Fails

**Error:** `Invalid API key`
```bash
# Verify BASESCAN_API_KEY in .env
# Generate new key at https://basescan.org/myapikey
```

**Error:** `Already verified`
```bash
# Contract is already verified - no action needed
# View at: https://basescan.org/address/0xf7e968d6f3bdFC504A434288Ea3f243e033e846F
```

### Transaction Reverts

**Error:** `ChannelExpired`
- Expiration timestamp must be in the future
- Use `block.timestamp + duration` (e.g., `+ 3600` for 1 hour)

**Error:** `InvalidSignature`
- Verify signature format: `keccak256(abi.encodePacked(channelId, claimAmount, nonce))`
- Must call `messageHash.toEthSignedMessageHash()` before signing
- Ensure signer matches channel sender

**Error:** `InsufficientBalance`
- For ETH: Ensure `msg.value == amount`
- For USDC: Call `approve()` before `openChannel()`
- Verify token balance before transaction

---

## Monitoring & Maintenance

### Key Metrics to Track

1. **Contract Events**
   - `ChannelOpened` - New channels created
   - `ChannelClosed` - Successful channel closures
   - `ChannelToppedUp` - Channel balance increases

2. **Gas Prices**
   - Base gas tracker: https://basescan.org/gastracker
   - Average: ~0.001 gwei (very low)
   - Peak times: May increase 2-5x

3. **Token Prices**
   - ETH/USD for cost calculations
   - USDC should remain stable at $1.00

### Useful Commands

```bash
# Check factory contract state
npx hardhat console --network base
> const factory = await ethers.getContractAt("MultiTokenPaymentChannelFactory", "0xf7e968d6f3bdFC504A434288Ea3f243e033e846F")
> const channel = await factory.getChannel(channelId)

# View channel on BaseScan
https://basescan.org/address/0xf7e968d6f3bdFC504A434288Ea3f243e033e846F#readContract

# Monitor events
https://basescan.org/address/0xf7e968d6f3bdFC504A434288Ea3f243e033e846F#events
```

---

## Next Steps

1. **Story 4.3:** Integrate with Dassie settlement module
2. **Epic 5+:** BTP-NIPs protocol implementation
3. **Production:** Security audit before large-scale use

---

## References

- **Base Documentation:** https://docs.base.org
- **BaseScan:** https://basescan.org
- **Bridge:** https://bridge.base.org
- **Story 4.1:** MultiTokenPaymentChannelFactory implementation
- **Story 4.2:** Base mainnet deployment (this document)

---

*Last Updated: 2025-12-05*
*Deployed by: Claude Code (Sonnet 4.5)*
*Story Status: Ready for Review*
