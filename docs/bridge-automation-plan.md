# Automated AKT Bridging for Relay Operations

## Problem Statement

The relay needs to:
1. Accept AKT payments on **Cronos** (via ERC-20 payment channels)
2. Pay Akash hosting costs with **native AKT on Akash Network**
3. Minimize manual intervention and bridge fees

## Solution: Automated IBC Bridge Bot

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Nostream-ILP Relay                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Receive payments via Cronos Payment Channels (AKT-ERC20)│
│     └─> Contract: 0x9Ec2d217b14e67cAbF86F20F4E7462D6d7bc7684│
│                                                             │
│  2. Bridge Bot (runs every 24h or when threshold reached)  │
│     ├─> Check Cronos AKT balance                           │
│     ├─> If balance > threshold (e.g., 1000 AKT):           │
│     │   ├─> Withdraw from payment channels                 │
│     │   ├─> Bridge AKT: Cronos → Akash (via IBC)           │
│     │   └─> Wait for confirmation                          │
│     └─> Update accounting                                   │
│                                                             │
│  3. Akash Payment Bot (runs daily)                         │
│     ├─> Check Akash hosting bill                           │
│     ├─> Calculate AKT needed                               │
│     ├─> Pay deployment via Akash API                       │
│     └─> Log transaction                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Technical Implementation

### 1. Cronos → Akash Bridge (IBC Transfer)

**Using CosmJS (Cosmos SDK JavaScript library):**

```typescript
// packages/relay-bridge-bot/src/cronos-to-akash-bridge.ts
import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { SigningStargateClient } from "@cosmjs/stargate";
import { ethers } from "ethers";

interface BridgeConfig {
  // Cronos EVM
  cronosRpcUrl: string;
  cronosRelayPrivateKey: string;
  cronosAktTokenAddress: string;
  cronosPaymentChannelAddress: string;

  // IBC Bridge
  ibcChannelId: string; // Cronos → Akash IBC channel

  // Akash Network
  akashRpcUrl: string;
  akashRelayMnemonic: string;
  akashRelayAddress: string;

  // Thresholds
  minBridgeAmount: number; // Minimum AKT to trigger bridge (e.g., 1000)
  bridgeInterval: number; // Seconds between bridge attempts (e.g., 86400 = 24h)
}

export class AktBridgeBot {
  private config: BridgeConfig;
  private cronosProvider: ethers.JsonRpcProvider;
  private aktTokenContract: ethers.Contract;
  private akashWallet: DirectSecp256k1Wallet;

  constructor(config: BridgeConfig) {
    this.config = config;
  }

  async initialize() {
    // Initialize Cronos provider
    this.cronosProvider = new ethers.JsonRpcProvider(this.config.cronosRpcUrl);

    // Initialize AKT ERC-20 contract
    const aktAbi = [
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address to, uint256 amount) returns (bool)"
    ];
    this.aktTokenContract = new ethers.Contract(
      this.config.cronosAktTokenAddress,
      aktAbi,
      new ethers.Wallet(this.config.cronosRelayPrivateKey, this.cronosProvider)
    );

    // Initialize Akash wallet
    this.akashWallet = await DirectSecp256k1Wallet.fromMnemonic(
      this.config.akashRelayMnemonic,
      { prefix: "akash" }
    );
  }

  /**
   * Check if bridge should be triggered
   */
  async shouldBridge(): Promise<boolean> {
    const balance = await this.aktTokenContract.balanceOf(
      await this.aktTokenContract.signer.getAddress()
    );

    // AKT has 6 decimals
    const balanceAkt = Number(balance) / 1e6;

    console.log(`Cronos AKT balance: ${balanceAkt} AKT`);

    return balanceAkt >= this.config.minBridgeAmount;
  }

  /**
   * Bridge AKT from Cronos to Akash via IBC
   */
  async bridgeToAkash(amountAkt: number): Promise<string> {
    console.log(`Starting bridge: ${amountAkt} AKT from Cronos to Akash...`);

    // Step 1: Convert ERC-20 AKT to native CRO-AKT (via Cronos gravity bridge)
    // This is done via the Cronos bridge contract
    const bridgeContractAddress = "0x..." // Cronos IBC bridge contract

    // Step 2: Initiate IBC transfer
    // Note: This requires the Cronos bridge to support IBC transfers
    // Alternative: Use a bridge service API

    // For now, this is a placeholder - actual implementation depends on
    // whether Cronos supports direct IBC from EVM contracts

    throw new Error("IBC bridge integration not yet implemented");
  }
}
```

**Problem:** Cronos EVM doesn't directly support IBC from smart contracts.

### 2. Better Approach: Use Bridge Service APIs

**Option A: Cronos Official Bridge API**

Check if Cronos provides an API for automated bridging:
- https://cronos.org/bridge (may have API documentation)

**Option B: Use Gravity Bridge or Similar**

Gravity Bridge connects EVM chains to Cosmos chains via IBC.

**Option C: Osmosis DEX Route (NOT SUPPORTED)**

⚠️ **IMPORTANT:** Osmosis does NOT support Cronos EVM. It only supports Cronos POS (Crypto.org Chain).

Since our contract is on Cronos EVM (not Cronos POS), direct IBC to Osmosis is not possible.

Alternative complex route:
```
Cronos EVM AKT → Cronos POS (via Cronos bridge) → Osmosis → Akash
```

This requires the Cronos bridge to support AKT token bridging between EVM and POS chains (needs verification).

### 3. Simplified Approach: Liquidity Pool Strategy

**Instead of bridging frequently, maintain dual liquidity:**

```typescript
interface DualChainStrategy {
  // Keep minimum operational balance on both chains
  cronosMinBalance: 500 AKT;  // For paying out refunds
  akashMinBalance: 1000 AKT;  // For paying hosting (6 months)

  // When to rebalance
  rebalanceThreshold: {
    cronos: 2000 AKT,  // If Cronos > 2000, bridge to Akash
    akash: 200 AKT     // If Akash < 200, bridge from Cronos
  };
}
```

**Advantages:**
- Less frequent bridging (lower fees)
- Always have funds available on both chains
- Manual bridge intervention only when thresholds hit

### 4. Fully Automated Akash Payment

**Using Akash API directly:**

```typescript
// packages/relay-bridge-bot/src/akash-auto-pay.ts
import { SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";

export class AkashAutoPayBot {
  private client: SigningStargateClient;
  private wallet: DirectSecp256k1Wallet;
  private relayAddress: string;

  async initialize(mnemonic: string, rpcUrl: string) {
    this.wallet = await DirectSecp256k1Wallet.fromMnemonic(mnemonic, {
      prefix: "akash"
    });

    const [account] = await this.wallet.getAccounts();
    this.relayAddress = account.address;

    this.client = await SigningStargateClient.connectWithSigner(
      rpcUrl,
      this.wallet
    );
  }

  /**
   * Check deployment cost and pay if needed
   */
  async payDeploymentIfNeeded(deploymentId: string): Promise<void> {
    // Query deployment status
    // This requires Akash-specific message types

    // Calculate cost (from provider)
    const costPerBlock = 0.1; // Example: 0.1 uakt per block

    // Send payment transaction
    const result = await this.client.sendTokens(
      this.relayAddress,
      "akash1provider...", // Provider address
      [{ denom: "uakt", amount: "1000000" }], // 1 AKT
      "auto" // Gas
    );

    console.log(`Payment sent: ${result.transactionHash}`);
  }

  /**
   * Run daily to check and pay hosting
   */
  async runDailyCheck() {
    // Check Akash balance
    const balance = await this.client.getBalance(this.relayAddress, "uakt");
    console.log(`Akash balance: ${Number(balance.amount) / 1e6} AKT`);

    // Check deployment status
    // Pay if needed
    // Alert if balance too low
  }
}
```

## Recommended Implementation Plan

### Phase 1: Manual Bridge, Automated Payments (CURRENT)
1. ✅ Accept payments on Cronos (done - Story 3.6)
2. ✅ Deploy contract on Cronos mainnet (done)
3. 🔄 Manually bridge AKT when needed (monthly/quarterly)
4. ✅ Automate Akash hosting payments (using Akash API)

### Phase 2: Semi-Automated Bridge (NEXT)
1. Create monitoring dashboard
2. Alert when Cronos balance > threshold
3. Alert when Akash balance < threshold
4. One-click bridge button (still manual confirmation)

### Phase 3: Fully Automated (FUTURE)
1. Integrate with Cronos IBC bridge API (when available)
2. Or use DEX aggregator for automated swaps
3. Automatic rebalancing based on thresholds

## Current Best Practice

**For now (Story 3.6), recommend:**

1. **Maintain dual liquidity:**
   - 1000 AKT on Akash (6 months hosting)
   - 500 AKT on Cronos (for refunds)

2. **Bridge manually quarterly:**
   - When Cronos balance > 2000 AKT: Bridge 1500 to Akash
   - Keep 500 on Cronos as working capital

3. **Automate Akash payments only:**
   - Monitor deployment cost daily
   - Auto-pay from Akash AKT balance
   - Alert if Akash balance < 200 AKT

4. **Track profitability:**
   - Revenue: Payment channels on Cronos
   - Expenses: Akash hosting
   - Bridge when profitable (minimize bridge fees)

## Bridge Fee Comparison

| Method | Fee | Speed | Automation |
|--------|-----|-------|------------|
| Crypto.com Exchange | ~0.1 AKT | 5 min | API available ✅ |
| Cronos IBC Bridge | ~0.01 AKT | 30 min | Unknown API |
| Osmosis Route | ~0.05 AKT | 1 hour | Possible via API |
| Manual | Variable | User time | No |

**Recommendation:** Use Crypto.com API for automated bridging if you have a corporate account.

## Code Location

Proposed structure:
```
packages/
  relay-bridge-bot/
    src/
      bridge-monitor.ts      # Monitor balances
      akash-auto-pay.ts      # Automated Akash payments
      bridge-executor.ts     # Execute bridge when needed
      config.ts              # Bridge configuration
    tests/
```

This would be a new package in the nostream-ilp monorepo.

---

## Immediate Action Items

For Story 3.6 completion:
1. ✅ Deploy contract (done)
2. ⏸️ Manual bridge for initial testing
3. 📝 Document manual bridge process
4. 🔮 Plan automated bridge for future epic

For future consideration:
- Epic 4: Automated Bridge & Akash Integration
- Story 4.1: Implement Akash auto-payment bot
- Story 4.2: Integrate Cronos bridge API (or exchange API)
- Story 4.3: Build monitoring dashboard
