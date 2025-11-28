# Cronos Testnet Deployment Guide

**Research Date:** 2025-11-28
**Purpose:** Step-by-step instructions for deploying CronosPaymentChannel to Cronos testnet

---

## Prerequisites

**Required:**
- Node.js v18+ installed
- Hardhat project setup
- MetaMask wallet with Cronos testnet configured
- Test CRO tokens from faucet
- Private key with test funds

**Repositories:**
- Base payment channel: `/Users/jonathangreen/Documents/base-payment-channel`
- Modified contract: Create new branch

---

## Step 1: Configure Cronos Testnet in MetaMask

### Add Cronos Testnet Network

1. Open MetaMask
2. Click network dropdown → "Add Network" → "Add a network manually"
3. Enter details:
   - **Network Name:** Cronos Testnet
   - **RPC URL:** `https://evm-t3.cronos.org:8545/`
   - **Chain ID:** `338`
   - **Currency Symbol:** `TCRO`
   - **Block Explorer:** `https://testnet.cronoscan.com`

4. Click "Save"

### Get Test CRO from Faucet

1. Visit: https://cronos.org/faucet
2. Connect MetaMask (Cronos Testnet)
3. Enter your address (0x...)
4. Click "Request TCRO"
5. Wait 30 seconds for tokens to arrive
6. Verify balance in MetaMask

**Troubleshooting:**
- Daily limit reached? Request in Discord: #request-tcro-cronos channel
- Include your address and identity

---

## Step 2: Prepare Contract Files

### Create New Contract File

```bash
cd /Users/jonathangreen/Documents/base-payment-channel
cp contracts/BasePaymentChannel.sol contracts/CronosPaymentChannel.sol
```

### Modify Contract (see contract-modifications.md for details)

Key changes:
1. Add `import "@openzeppelin/contracts/token/ERC20/IERC20.sol";`
2. Add `IERC20 public immutable aktToken;`
3. Add constructor: `constructor(address _aktTokenAddress) { aktToken = IERC20(_aktTokenAddress); }`
4. Modify `openChannel()` to accept ERC-20 tokens
5. Modify `closeChannel()` and `expireChannel()` for ERC-20 transfers

---

## Step 3: Create Mock AKT Token (Testnet Only)

Since AKT may not be on Cronos testnet, deploy mock token:

**File:** `contracts/test/MockERC20.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockAKT is ERC20 {
    constructor() ERC20("Mock Akash Token", "AKT") {
        _mint(msg.sender, 1000000 * 10**6); // 1M AKT (6 decimals)
    }

    function decimals() public pure override returns (uint8) {
        return 6;  // AKT uses 6 decimals
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

---

## Step 4: Update Hardhat Configuration

**File:** `hardhat.config.ts`

```typescript
const config: HardhatUserConfig = {
    solidity: "0.8.20",
    networks: {
        "cronos-testnet": {
            url: "https://evm-t3.cronos.org:8545/",
            accounts: [process.env.PRIVATE_KEY!],
            chainId: 338,
        },
    },
    etherscan: {
        apiKey: {
            "cronos-testnet": process.env.CRONOSCAN_API_KEY || "placeholder",
        },
        customChains: [
            {
                network: "cronos-testnet",
                chainId: 338,
                urls: {
                    apiURL: "https://api-testnet.cronoscan.com/api",
                    browserURL: "https://testnet.cronoscan.com"
                }
            }
        ]
    }
};
```

**Update `.env`:**
```bash
PRIVATE_KEY=your_private_key_here
CRONOSCAN_API_KEY=get_from_cronoscan_com
```

---

## Step 5: Create Deployment Script

**File:** `scripts/deploy-cronos.ts`

```typescript
import { ethers } from "hardhat";

async function main() {
    console.log("Deploying to Cronos Testnet...");

    // Step 1: Deploy MockAKT token
    console.log("1. Deploying MockAKT token...");
    const MockAKT = await ethers.getContractFactory("MockAKT");
    const aktToken = await MockAKT.deploy();
    await aktToken.waitForDeployment();
    const aktAddress = await aktToken.getAddress();
    console.log("MockAKT deployed to:", aktAddress);

    // Step 2: Deploy CronosPaymentChannel
    console.log("2. Deploying CronosPaymentChannel...");
    const PaymentChannel = await ethers.getContractFactory("CronosPaymentChannel");
    const channel = await PaymentChannel.deploy(aktAddress);
    await channel.waitForDeployment();
    const channelAddress = await channel.getAddress();
    console.log("CronosPaymentChannel deployed to:", channelAddress);

    // Step 3: Verify configuration
    const configuredToken = await channel.aktToken();
    console.log("Configured AKT token:", configuredToken);

    if (configuredToken !== aktAddress) {
        throw new Error("Token address mismatch!");
    }

    // Step 4: Mint test AKT to deployer
    const [deployer] = await ethers.getSigners();
    const mintAmount = ethers.parseUnits("10000", 6); // 10,000 AKT
    await aktToken.mint(deployer.address, mintAmount);
    console.log("Minted 10,000 AKT to deployer");

    console.log("\n=== Deployment Summary ===");
    console.log("MockAKT:", aktAddress);
    console.log("CronosPaymentChannel:", channelAddress);
    console.log("Deployer balance:", await aktToken.balanceOf(deployer.address));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
```

---

## Step 6: Deploy to Testnet

```bash
npx hardhat run scripts/deploy-cronos.ts --network cronos-testnet
```

**Expected output:**
```
Deploying to Cronos Testnet...
1. Deploying MockAKT token...
MockAKT deployed to: 0x1234567890abcdef1234567890abcdef12345678
2. Deploying CronosPaymentChannel...
CronosPaymentChannel deployed to: 0xabcdef1234567890abcdef1234567890abcdef12
Configured AKT token: 0x1234567890abcdef1234567890abcdef12345678
Minted 10,000 AKT to deployer

=== Deployment Summary ===
MockAKT: 0x1234567890abcdef1234567890abcdef12345678
CronosPaymentChannel: 0xabcdef1234567890abcdef1234567890abcdef12
Deployer balance: 10000000000
```

**Save these addresses for testing!**

---

## Step 7: Verify Contracts on CronoScan

```bash
# Verify MockAKT
npx hardhat verify --network cronos-testnet <MOCK_AKT_ADDRESS>

# Verify CronosPaymentChannel
npx hardhat verify --network cronos-testnet <CHANNEL_ADDRESS> <MOCK_AKT_ADDRESS>
```

**Check verification:**
- Visit https://testnet.cronoscan.com/address/<address>
- Look for green checkmark ✅ "Contract Source Code Verified"

---

## Step 8: Test Channel Operations

**File:** `scripts/test-channel.ts`

```typescript
import { ethers } from "hardhat";

async function main() {
    const AKT_ADDRESS = "0x...";  // From deployment
    const CHANNEL_ADDRESS = "0x...";  // From deployment

    const [alice, bob] = await ethers.getSigners();

    const aktToken = await ethers.getContractAt("MockAKT", AKT_ADDRESS);
    const channel = await ethers.getContractAt("CronosPaymentChannel", CHANNEL_ADDRESS);

    console.log("Testing payment channel...");

    // 1. Mint AKT to Alice
    const amount = ethers.parseUnits("100", 6);
    await aktToken.mint(alice.address, amount);
    console.log("Minted 100 AKT to Alice");

    // 2. Approve channel to spend AKT
    await aktToken.connect(alice).approve(CHANNEL_ADDRESS, amount);
    console.log("Alice approved channel");

    // 3. Open channel
    const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    const tx = await channel.connect(alice).openChannel(bob.address, expiration, amount);
    const receipt = await tx.wait();

    const channelId = receipt.logs[0].topics[1];
    console.log("Channel opened:", channelId);

    // 4. Verify channel state
    const channelData = await channel.getChannel(channelId);
    console.log("Channel balance:", channelData.balance.toString());
    console.log("Recipient:", channelData.recipient);

    console.log("✅ Test successful!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
```

Run test:
```bash
npx hardhat run scripts/test-channel.ts --network cronos-testnet
```

---

## Step 9: Mainnet Deployment (When Ready)

### Use Real AKT Token

**AKT Address on Cronos Mainnet:** `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`

**File:** `scripts/deploy-cronos-mainnet.ts`

```typescript
import { ethers } from "hardhat";

async function main() {
    const AKT_TOKEN_ADDRESS = "0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3";

    console.log("Deploying to Cronos Mainnet...");
    console.log("Using AKT token:", AKT_TOKEN_ADDRESS);

    const PaymentChannel = await ethers.getContractFactory("CronosPaymentChannel");
    const channel = await PaymentChannel.deploy(AKT_TOKEN_ADDRESS);
    await channel.waitForDeployment();

    const address = await channel.getAddress();
    console.log("CronosPaymentChannel deployed to:", address);

    console.log("⚠️ Remember to verify on CronoScan!");
}
```

Deploy:
```bash
npx hardhat run scripts/deploy-cronos-mainnet.ts --network cronos-mainnet
```

---

## Troubleshooting

### "Insufficient funds for gas"

**Solution:**
- Get more TCRO from faucet
- Check balance: `await ethers.provider.getBalance(address)`

### "Nonce too high"

**Solution:**
```bash
# Reset MetaMask account
# Settings → Advanced → Clear activity tab data
```

### "Contract verification failed"

**Solution:**
- Ensure compiler version matches: `0.8.20`
- Check optimization settings
- Verify constructor arguments match

### "Transaction reverted"

**Check:**
- AKT approval before openChannel
- Sufficient AKT balance
- Expiration is in future
- Contract is not paused

---

## Next Steps After Deployment

1. **Integrate with Dassie:** Create settlement module for Cronos (similar to Story 2.6)
2. **Update Nostream relay:** Add Cronos payment processor
3. **Document for users:** How to bridge AKT to Cronos
4. **Monitor costs:** Track actual gas costs in production

---

## Mainnet Deployment Checklist

Before deploying to mainnet:

- [ ] Contract audited (or at least peer-reviewed)
- [ ] Full test coverage (>90%)
- [ ] Testnet testing complete (multiple channels opened/closed)
- [ ] Gas costs validated (<$0.01 per channel)
- [ ] AKT token address confirmed: `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`
- [ ] CRO tokens for deployment gas (>10 CRO recommended)
- [ ] Backup of private key
- [ ] Multisig or timelock for admin functions (if applicable)
- [ ] Monitoring/alerting setup
- [ ] Incident response plan

---

**Status:** ✅ COMPLETE
**Estimated time to deploy:** 1-2 hours (testnet), 30 minutes (mainnet)
