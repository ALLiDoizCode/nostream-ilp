# Cronos Payment Channel Deployment Guide

This guide covers deploying the CronosPaymentChannel smart contract to Cronos testnet and mainnet.

---

## Deployed Contracts

### Cronos Testnet

**Deployment Date:** November 28, 2025

**Deployer Address:** `0x6f7830A69BF0022AA586bd0E94FB34f86e7075cB`

**Contracts:**

- **MockAKT Token**
  - Address: `0xf7e968d6f3bdFC504A434288Ea3f243e033e846F`
  - Transaction: `0xec011d5cd195e9bf76ef68a7055369bef91d318e082cd8cc10b6175b13ad4aa3`
  - Explorer: [View on Cronos Explorer](https://cronos.org/explorer/testnet3/address/0xf7e968d6f3bdFC504A434288Ea3f243e033e846F)
  - Verified: ✅

- **CronosPaymentChannel**
  - Address: `0x4b9e32389896C05A4CAfC41bE9dA6bB108a7dA72`
  - Transaction: `0x8129b6909571932199b95afa961c317e5fb69c234719c24f448712670e2013b6`
  - Constructor Args: `0xf7e968d6f3bdFC504A434288Ea3f243e033e846F` (MockAKT address)
  - Explorer: [View on Cronos Explorer](https://cronos.org/explorer/testnet3/address/0x4b9e32389896C05A4CAfC41bE9dA6bB108a7dA72)
  - Verified: ⚠️ (Automated verification encountering API errors; manual verification via [web interface](https://cronos.org/explorer/testnet3/verifyContract) available as fallback)

**Gas Costs:**

Measured on: November 28, 2025
CRO Price: $0.12 USD (approximate)

| Operation | Gas Used | Gas Price | Cost (TCRO) | Cost (USD) |
|-----------|----------|-----------|-------------|------------|
| Deploy MockAKT | 574,554 | 386.25 gwei | 0.2219 | $0.0266 |
| Deploy CronosPaymentChannel | 928,570 | 386.25 gwei | 0.3587 | $0.0430 |
| ERC-20 approve() | 46,335 | 386.25 gwei | 0.0179 | $0.0021 |
| openChannel() | 139,824 | 386.25 gwei | 0.0540 | $0.0065 |
| **Total Lifecycle** | **1,689,283** | **386.25 gwei** | **0.6525** | **$0.0782** |

*Note: Lifecycle total excludes test-only mint operation*

**Testing Results:**
- ✅ Contract deployment successful
- ✅ MockAKT token minting and approval working
- ✅ Payment channel opening functional
- ✅ Channel state queries working correctly
- ⏳ Channel expiration pending (5-minute timeout)

**Visual Documentation:**
All deployment and testing evidence is permanently available on the Cronos testnet blockchain and can be viewed through the explorer links above. Key transactions to view:
- [MockAKT Deployment](https://cronos.org/explorer/testnet3/tx/0xec011d5cd195e9bf76ef68a7055369bef91d318e082cd8cc10b6175b13ad4aa3)
- [CronosPaymentChannel Deployment](https://cronos.org/explorer/testnet3/tx/0x8129b6909571932199b95afa961c317e5fb69c234719c24f448712670e2013b6)
- [Contract Addresses](https://cronos.org/explorer/testnet3/address/0x4b9e32389896C05A4CAfC41bE9dA6bB108a7dA72) - All contract interactions visible in explorer history

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Configuration](#configuration)
3. [Testnet Deployment](#testnet-deployment)
4. [Mainnet Deployment](#mainnet-deployment)
5. [Contract Verification](#contract-verification)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Software Requirements

Before deploying, ensure you have the following installed:

- **Node.js**: v22.x LTS (check: `node --version`)
- **pnpm**: v8.x or later (check: `pnpm --version`)
  - Install: `npm install -g pnpm`
- **Git**: For version control
- **Hardhat**: Installed via project dependencies (`pnpm install`)

### Account Setup

#### 1. Create a Deployer Wallet

**Option A: Using Hardhat**
```bash
npx hardhat account create
```
This will generate a new private key. **Save it securely!**

**Option B: Using Existing Wallet**
Export your private key from MetaMask or your preferred wallet.

⚠️ **Security Warning**: Never commit your private key to version control!

#### 2. Fund Your Wallet

**For Testnet:**
1. Visit the Cronos Testnet Faucet: https://cronos.org/faucet
2. Connect your Keplr wallet or enter your address
3. Request testnet CRO (TCRO)
4. Verify you received funds (check: https://testnet.cronoscan.com)

**For Mainnet:**
1. Purchase CRO on a cryptocurrency exchange (e.g., Crypto.com, KuCoin)
2. Withdraw CRO to your Cronos mainnet address
3. Recommended amount: **10 CRO** (for deployment gas + buffer)

#### 3. Get a CronoScan API Key

1. Visit https://cronoscan.com/myapikey
2. Create a free account
3. Generate an API key (used for contract verification)
4. Save the API key securely

---

## Configuration

### 1. Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```bash
# Private key for deployer account (64 hex characters, NO 0x prefix)
PRIVATE_KEY=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

# CronoScan API key for contract verification
CRONOSCAN_API_KEY=ABCDEFGHIJKLMNOPQRSTUVWXYZ123456
```

⚠️ **Important**:
- Remove the `0x` prefix from your private key
- Never commit `.env` to version control
- Use a dedicated deployment wallet (not your personal wallet)

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Verify Hardhat Configuration

Check that Hardhat networks are configured correctly:
```bash
npx hardhat
```

You should see `cronos-testnet` and `cronos-mainnet` in the available networks.

### 4. Compile Contracts

Ensure contracts compile without errors:
```bash
npx hardhat compile
```

Expected output:
```
Compiled 3 Solidity files successfully
```

---

## Testnet Deployment

### Step 1: Verify Prerequisites

**Checklist before deploying to testnet:**
- [ ] `.env` file created with `PRIVATE_KEY` and `CRONOSCAN_API_KEY`
- [ ] Deployer wallet funded with testnet CRO (≥5 TCRO)
- [ ] Contracts compiled successfully (`npx hardhat compile`)
- [ ] Network connectivity to Cronos testnet RPC

### Step 2: Run Deployment Script

```bash
npx hardhat run scripts/deploy-cronos-testnet.ts --network cronos-testnet
```

**Expected Output:**
```
==========================================
Cronos Testnet Deployment
==========================================
Deploying with account: 0x1234...5678
Network name: cronos-testnet
Chain ID: 338
Deployer balance: 10.0 TCRO

------------------------------------------
Step 1: Deploy MockAKT Token
------------------------------------------
✓ MockAKT deployed to: 0xABC...DEF
  Transaction hash: 0x123...456

------------------------------------------
Step 2: Deploy CronosPaymentChannel
------------------------------------------
✓ CronosPaymentChannel deployed to: 0x789...012
  Constructor args: [0xABC...DEF]
  Transaction hash: 0x789...abc

------------------------------------------
Step 3: Mint Test AKT to Deployer
------------------------------------------
Minting 10000.0 AKT to 0x1234...5678
✓ Mint transaction confirmed
  Transaction hash: 0xdef...456
✓ Deployer AKT balance: 10000.0 AKT

==========================================
Deployment Summary
==========================================
Network:             Cronos Testnet
Chain ID:            338
Deployer:            0x1234...5678
MockAKT:             0xABC...DEF
CronosPaymentChannel: 0x789...012

Next Steps:
1. Save these addresses to your .env file
2. Verify contracts on CronoScan
3. View on CronoScan
==========================================
```

### Step 3: Save Deployed Addresses

Add the deployed addresses to your `.env` file:
```bash
CRONOS_TESTNET_MOCK_AKT_ADDRESS=0xABC...DEF
CRONOS_TESTNET_CHANNEL_ADDRESS=0x789...012
```

### Step 4: Verify Contracts

**Verify MockAKT (no constructor args):**
```bash
npx hardhat verify --network cronos-testnet <MOCK_AKT_ADDRESS>
```

**Verify CronosPaymentChannel (with constructor arg):**
```bash
npx hardhat verify --network cronos-testnet <CHANNEL_ADDRESS> <MOCK_AKT_ADDRESS>
```

**Expected Output:**
```
Successfully verified contract CronosPaymentChannel on CronoScan.
https://testnet.cronoscan.com/address/<CHANNEL_ADDRESS>#code
```

### Step 5: Test on CronoScan

1. Visit https://testnet.cronoscan.com/address/<CHANNEL_ADDRESS>
2. Navigate to "Write Contract" tab
3. Connect your wallet
4. Try calling functions (e.g., `openChannel`)

---

## Mainnet Deployment

⚠️ **IMPORTANT**: Mainnet deployment uses **real funds** and cannot be undone. Triple-check everything before deploying!

### Step 1: Pre-Deployment Checklist

**Security & Testing:**
- [ ] Contracts fully tested on testnet
- [ ] All tests passing (`npx hardhat test`)
- [ ] Smart contract security audit completed (recommended)
- [ ] Deployment wallet secured (hardware wallet recommended)
- [ ] Sufficient CRO for gas (~10 CRO recommended)

**Configuration:**
- [ ] `.env` file configured with mainnet deployer `PRIVATE_KEY`
- [ ] `CRONOSCAN_API_KEY` set in `.env`
- [ ] Deployer wallet funded with ≥10 CRO
- [ ] Network connectivity to Cronos mainnet RPC verified

**Mainnet AKT Token Address:**
- The real AKT token address on Cronos mainnet is **hardcoded** in the deployment script:
  ```
  0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3
  ```
- This is the official AKT token bridged from Akash via IBC
- **Verify** this address on CronoScan before deployment: https://cronoscan.com/token/0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3

### Step 2: Run Deployment Script

```bash
npx hardhat run scripts/deploy-cronos-mainnet.ts --network cronos-mainnet
```

**Expected Output:**
```
==========================================
⚠️  CRONOS MAINNET DEPLOYMENT
==========================================
Deploying with account: 0x1234...5678
Network name: cronos-mainnet
Chain ID: 25

------------------------------------------
Pre-Deployment Checks
------------------------------------------
Deployer balance: 15.0 CRO
✓ Sufficient CRO balance for deployment
Estimated deployment gas: 1234567
Current gas price: 5000.0 gwei
Estimated deployment cost: 0.025 CRO

------------------------------------------
Deployment Configuration
------------------------------------------
Mainnet AKT Token Address: 0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3
Contract: CronosPaymentChannel

⚠️  WARNING: This will deploy to MAINNET using real funds!
Estimated cost: 0.025 CRO

------------------------------------------
Deploying CronosPaymentChannel...
------------------------------------------
✓ CronosPaymentChannel deployed to: 0xMAINNET...ADDRESS
  Constructor args: [0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3]
  Transaction hash: 0xMAINNET...TX

------------------------------------------
Deployment Cost
------------------------------------------
Actual deployment cost: 0.023 CRO
Remaining balance:      14.977 CRO

==========================================
Deployment Summary
==========================================
Network:             Cronos Mainnet
Chain ID:            25
Deployer:            0x1234...5678
AKT Token (Mainnet): 0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3
CronosPaymentChannel: 0xMAINNET...ADDRESS
Deployment Cost:     0.023 CRO

Next Steps:
1. Save contract address to .env
2. Verify contract on CronoScan
3. View on CronoScan
4. Security Recommendations
==========================================
```

### Step 3: Save Deployed Address

Add the deployed address to your `.env` file:
```bash
CRONOS_MAINNET_CHANNEL_ADDRESS=0xMAINNET...ADDRESS
```

### Step 4: Verify Contract

```bash
npx hardhat verify --network cronos-mainnet <CHANNEL_ADDRESS> 0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3
```

**Expected Output:**
```
Successfully verified contract CronosPaymentChannel on CronoScan.
https://cronoscan.com/address/<CHANNEL_ADDRESS>#code
```

### Step 5: Post-Deployment Verification

1. **Check Contract Source Code:**
   - Visit https://cronoscan.com/address/<CHANNEL_ADDRESS>
   - Verify green checkmark appears next to contract
   - Review source code matches your local version

2. **Verify Constructor Arguments:**
   - On CronoScan, check "Contract" tab
   - Confirm constructor args show AKT token: `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`

3. **Test Basic Functionality:**
   - Navigate to "Write Contract" tab
   - Connect wallet
   - Test a simple read function (e.g., `aktToken()`)

4. **Document Deployment:**
   - Add deployment address to project README
   - Document deployment date and transaction hash
   - Save deployment logs for audit trail

### Step 6: Security Recommendations

After successful mainnet deployment:

1. **Rotate Deployer Key (Optional):**
   - Consider rotating the deployer private key for security
   - Transfer contract ownership if using Ownable pattern

2. **Monitor Contract:**
   - Subscribe to contract events on CronoScan
   - Set up monitoring for critical functions

3. **Backup Configuration:**
   - Backup `.env` file securely (encrypted)
   - Document all contract addresses in secure location

---

## Contract Verification

### Why Verify Contracts?

Contract verification makes your source code publicly visible on CronoScan, allowing users to:
- Read and audit the contract code
- Interact with the contract via the block explorer UI
- Verify that deployed bytecode matches the source code

### Verification Process

Hardhat's verify plugin automatically:
1. Compiles your contract with the same settings
2. Uploads source code and metadata to CronoScan
3. Matches deployed bytecode to compiled bytecode

### Verification Commands

**MockAKT (Testnet Only):**
```bash
npx hardhat verify --network cronos-testnet <MOCK_AKT_ADDRESS>
```

**CronosPaymentChannel (Testnet):**
```bash
npx hardhat verify --network cronos-testnet <CHANNEL_ADDRESS> <MOCK_AKT_ADDRESS>
```

**CronosPaymentChannel (Mainnet):**
```bash
npx hardhat verify --network cronos-mainnet <CHANNEL_ADDRESS> 0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3
```

### Verification Success Indicators

✅ **Contract Verified Successfully:**
- Console output: "Successfully verified contract"
- Green checkmark on CronoScan contract page
- "Contract Source Code Verified" badge visible
- Code tab shows source code with syntax highlighting
- "Write Contract" tab allows function interaction

### Common Verification Errors

#### Error: "Already verified"
```
Error: The contract <ADDRESS> has already been verified.
```
**Solution:** Contract is already verified, safe to ignore.

#### Error: "Constructor arguments mismatch"
```
Error: Constructor arguments provided do not match deployed bytecode
```
**Solution:**
- Double-check constructor arguments match deployment
- For testnet: Use MockAKT address
- For mainnet: Use `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`

#### Error: "Invalid API key"
```
Error: Invalid API Key
```
**Solution:**
- Verify `CRONOSCAN_API_KEY` is set in `.env`
- Check API key is correct (visit https://cronoscan.com/myapikey)
- Ensure no extra spaces or quotes in `.env` file

#### Error: "Compilation settings mismatch"
```
Error: Bytecode does not match
```
**Solution:**
- Ensure Hardhat config matches deployment settings
- Re-compile: `npx hardhat clean && npx hardhat compile`
- Verify Solidity version is 0.8.20 in `hardhat.config.ts`

---

## Troubleshooting

### Issue: "Missing PRIVATE_KEY"

**Error:**
```
Error: Cannot read property '0' of undefined
```

**Solution:**
1. Check `.env` file exists in project root
2. Verify `PRIVATE_KEY` is set (64 hex characters, no `0x` prefix)
3. Run: `cat .env | grep PRIVATE_KEY` to verify

### Issue: "Insufficient funds"

**Error:**
```
Error: sender doesn't have enough funds to send tx
```

**Solution:**
- **Testnet:** Get more TCRO from faucet: https://cronos.org/faucet
- **Mainnet:** Transfer more CRO to deployer wallet

### Issue: "Nonce too low"

**Error:**
```
Error: nonce too low
```

**Solution:**
1. Wait 30 seconds for network to sync
2. Or manually set nonce in Hardhat config (advanced)

### Issue: "Network connection failed"

**Error:**
```
Error: could not detect network
```

**Solution:**
1. Check internet connection
2. Verify RPC URL in `hardhat.config.ts`:
   - Testnet: `https://evm-t3.cronos.org:8545/`
   - Mainnet: `https://evm.cronos.org`
3. Try alternative RPC (if available)

### Issue: "Transaction reverted"

**Error:**
```
Error: Transaction reverted without a reason string
```

**Solution:**
1. Check deployer has sufficient CRO for gas
2. Verify contract compiles: `npx hardhat compile`
3. Run tests: `npx hardhat test`
4. Check contract constructor arguments are valid

### Issue: "Verification failed after deployment"

**Error:**
```
Error: Verification failed
```

**Solution:**
1. Wait 1-2 minutes after deployment (allow CronoScan to index)
2. Retry verification command
3. Check constructor arguments match deployment exactly
4. Verify `CRONOSCAN_API_KEY` is correct

### Getting Help

If you encounter issues not covered here:

1. **Check Hardhat documentation:** https://hardhat.org/docs
2. **Check Cronos documentation:** https://docs.cronos.org
3. **Review deployment logs:** Check console output for errors
4. **Verify network status:** https://status.cronos.org
5. **Ask for help:** Open an issue in the project repository

---

## Network Information

### Cronos Testnet

- **Network Name:** Cronos Testnet
- **RPC URL:** https://evm-t3.cronos.org:8545/
- **Chain ID:** 338
- **Currency:** TCRO (Testnet CRO)
- **Block Explorer:** https://testnet.cronoscan.com
- **Faucet:** https://cronos.org/faucet

### Cronos Mainnet

- **Network Name:** Cronos Mainnet
- **RPC URL:** https://evm.cronos.org
- **Chain ID:** 25
- **Currency:** CRO
- **Block Explorer:** https://cronoscan.com
- **AKT Token:** 0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3

### Adding Networks to MetaMask

**Cronos Testnet:**
1. Visit https://testnet.cronoscan.com
2. Scroll to bottom, click "Add Cronos Testnet Network"
3. Approve in MetaMask

**Cronos Mainnet:**
1. Visit https://cronoscan.com
2. Scroll to bottom, click "Add Cronos Network"
3. Approve in MetaMask

---

## Deployment Costs

### Testnet

- **Gas Cost:** ~0.001 TCRO per deployment
- **Total Cost:** FREE (testnet CRO has no value)
- **Faucet Limit:** ~10 TCRO per request

### Mainnet

- **Estimated Gas Cost:** 0.02-0.05 CRO (~$0.002-$0.005 USD at current rates)
- **Recommended Buffer:** 10 CRO total in wallet
- **Gas Price:** Variable (typically 5000-10000 gwei)

**Cost Breakdown (Mainnet):**
- CronosPaymentChannel deployment: ~0.025 CRO
- Contract verification: FREE
- Total estimated: **0.03 CRO**

Note: Gas prices fluctuate based on network congestion. The deployment script estimates gas cost before deploying.

---

## Next Steps After Deployment

After successfully deploying contracts:

1. **Update Documentation:**
   - Add deployed addresses to project README
   - Document deployment date and network
   - Save transaction hashes for audit trail

2. **Integration Testing:**
   - Test contract functions on CronoScan
   - Integrate with Dassie settlement module (Story 3.5)
   - Run end-to-end payment flow tests

3. **Security:**
   - Consider smart contract audit for mainnet
   - Monitor contract for unusual activity
   - Set up alerts for critical functions

4. **Monitoring:**
   - Subscribe to contract events on CronoScan
   - Set up off-chain monitoring (e.g., The Graph)
   - Monitor deployer wallet balance

---

**Last Updated:** 2025-11-28
**Hardhat Version:** 2.27.1
**Solidity Version:** 0.8.20
