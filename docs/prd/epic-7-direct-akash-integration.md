# Epic 7: Direct Akash Integration & Economic Monitoring

**Goal:** Track peer node revenue, purchase AKT tokens, and automatically pay Akash Network hosting costs via direct Cosmos transactions, proving economic self-sustainability.

**Key Innovation:** **Direct Cosmos SDK integration** (not ILP token swapping). Revenue earned in USDC/ETH on Base is tracked in USD, converted to AKT via exchange (manual or API), and paid directly to Akash escrow using native Cosmos transactions. This eliminates the complexity of ILP liquidity pools, DEX integration, and cross-chain bridges.

**Architecture Context:** This epic completes the economic loop: peers earn revenue from subscriptions → track earnings in USD → buy AKT tokens → pay Akash hosting → continue operating. The goal is to prove that a peer node can be **economically self-sustaining** (revenue > costs) within 30 days of operation.

---

## Story 7.1: Economic Monitor Service

**As a** peer operator,
**I want** real-time tracking of revenue and expenses,
**so that** I can monitor economic health.

**Acceptance Criteria:**
1. Create economic monitor: `packages/app-dassie/src/economic/monitor.ts`
2. Track revenue sources:
   - Subscription fees (from REQ payments)
   - Routing fees (from ILP packet forwarding)
   - Content fees (from paid EVENT deliveries)
3. Subscribe to Dassie balance changes:
   ```typescript
   const balanceSignal = reactor.use(BalanceSignal);
   sig.readAndTrack(balanceSignal); // React to balance changes
   ```
4. Calculate USD equivalent:
   - Query CoinGecko API for ETH/USD, USDC/USD rates
   - Convert Base channel balances to USD
   - Cache prices (update every 5 minutes)
5. Store economic snapshots:
   ```sql
   CREATE TABLE economic_snapshots (
     timestamp TIMESTAMPTZ PRIMARY KEY,
     revenue_usd NUMERIC(12,2),
     subscription_revenue_usd NUMERIC(12,2),
     routing_revenue_usd NUMERIC(12,2),
     expenses_usd NUMERIC(12,2),
     akash_cost_usd NUMERIC(12,2),
     net_profit_usd NUMERIC(12,2),
     eth_balance BIGINT,
     usdc_balance BIGINT,
     akt_balance BIGINT
   );
   ```
6. Real-time metrics:
   - Current balance (ETH, USDC, AKT)
   - Daily revenue (USD)
   - Daily expenses (USD)
   - Net profit (USD)
   - Profitability percentage
7. Tests:
   - Track revenue from subscriptions
   - Convert to USD correctly
   - Store snapshots
   - Handle price API failures gracefully

**Dependencies:**
- Epic 5 complete (receiving subscription payments)

**Outputs:**
- Economic monitoring service
- USD revenue tracking
- Snapshot database

---

## Story 7.2: Akash Wallet Management

**As a** peer operator,
**I want** secure Akash wallet management,
**so that** I can pay for hosting programmatically.

**Acceptance Criteria:**
1. Create wallet module: `packages/app-dassie/src/akash/wallet.ts`
2. Wallet initialization:
   - Generate Akash wallet (Cosmos SDK, bech32 prefix: "akash")
   - Or import from mnemonic/private key
   - Store encrypted with password
3. Wallet operations:
   ```typescript
   class AkashWallet {
     async getAddress(): Promise<string>
     async getBalance(): Promise<{ amount: string; denom: string }[]>
     async sendTokens(recipient: string, amount: string): Promise<string>
     async queryEscrowBalance(leaseId: string): Promise<string>
   }
   ```
4. Connect to Akash RPC:
   - Use public RPC: https://rpc.akash.forbole.com:443
   - Or configurable custom RPC
   - Handle RPC failures (retry, fallback)
5. Security:
   - Private key never logged
   - Encrypted at rest
   - Require password/PIN for spending
6. Integration with CosmJS:
   - Use `@cosmjs/proto-signing`
   - Use `@cosmjs/stargate`
   - Support Akash-specific message types
7. Tests:
   - Generate wallet
   - Get balance from testnet
   - Send test transaction
   - Query escrow balance

**Dependencies:**
- None (standalone module)

**Outputs:**
- Akash wallet management
- Secure key storage
- Cosmos SDK integration

---

## Story 7.3: AKT Purchase Flow

**As a** peer operator,
**I want** to convert USD revenue to AKT tokens,
**so that** I can pay for Akash hosting.

**Acceptance Criteria:**
1. Manual purchase flow (MVP):
   - Dashboard shows: "Revenue: $125 USD, Need AKT: 200 AKT ($92)"
   - Button: "Buy AKT" → Opens exchange (Kraken, Coinbase)
   - Operator buys AKT manually
   - Operator sends to Akash wallet address
   - System detects balance increase
2. Purchase tracking:
   ```sql
   CREATE TABLE akt_purchases (
     id UUID PRIMARY KEY,
     usd_amount NUMERIC(12,2),
     akt_amount NUMERIC(12,2),
     akt_price_usd NUMERIC(8,4),
     exchange VARCHAR,
     tx_hash VARCHAR,
     purchased_at TIMESTAMPTZ
   );
   ```
3. Balance monitoring:
   - Query Akash wallet balance every 5 minutes
   - Detect incoming AKT transfers
   - Update dashboard in real-time
4. Price tracking:
   - Query AKT/USD price from CoinGecko
   - Display current price on dashboard
   - Calculate: "Revenue ($X) = Y AKT at current price"
5. Future: Automated API integration (Epic 10+)
   - Kraken API or Coinbase Advanced Trade
   - Automatic buy when revenue > threshold
   - Requires API keys and careful testing
6. Tests:
   - Track manual purchase
   - Detect balance increase
   - Calculate USD → AKT conversion
   - Handle price fluctuations

**Dependencies:**
- Story 7.1 complete (tracking USD revenue)
- Story 7.2 complete (Akash wallet)

**Outputs:**
- Manual AKT purchase workflow
- Purchase tracking
- Price monitoring

---

## Story 7.4: Automatic Akash Escrow Deposit

**As a** peer operator,
**I want** automatic deposits to Akash escrow,
**so that** my hosting continues without manual payments.

**Acceptance Criteria:**
1. Create escrow depositor: `packages/app-dassie/src/akash/escrow-depositor.ts`
2. Escrow deposit logic:
   ```typescript
   async function depositToEscrow() {
     // 1. Check Akash wallet balance
     const aktBalance = await wallet.getBalance();

     // 2. Check escrow balance
     const escrowBalance = await wallet.queryEscrowBalance(leaseId);

     // 3. Calculate needed deposit
     const dailyCost = 1.5; // ~1.5 AKT per day ($5/month)
     const targetDays = 30;  // Keep 30 days buffer
     const targetBalance = dailyCost * targetDays; // 45 AKT

     if (escrowBalance < targetBalance && aktBalance > 10) {
       const depositAmount = targetBalance - escrowBalance;

       // 4. Send deposit transaction
       const txHash = await wallet.sendTokens(
         escrowAddress,
         Math.floor(depositAmount * 1_000_000) // Convert to uakt
       );

       console.log(`Deposited ${depositAmount} AKT to escrow: ${txHash}`);
     }
   }
   ```
3. Scheduling:
   - Run daily (check escrow balance)
   - Run on startup (ensure hosting funded)
   - Run after AKT purchase detected
4. Thresholds (configurable):
   - `ESCROW_MIN_DAYS`: 7 days (warning threshold)
   - `ESCROW_TARGET_DAYS`: 30 days (auto-deposit target)
   - `WALLET_MIN_BALANCE`: 10 AKT (don't drain wallet completely)
5. Alerts:
   - Escrow < 7 days → WARNING
   - Escrow < 3 days → CRITICAL
   - Wallet < 10 AKT → Need to buy more AKT
6. Transaction logging:
   ```sql
   CREATE TABLE escrow_deposits (
     id UUID PRIMARY KEY,
     amount_akt NUMERIC(12,2),
     escrow_address VARCHAR,
     tx_hash VARCHAR,
     deposited_at TIMESTAMPTZ,
     new_balance_akt NUMERIC(12,2)
   );
   ```
7. Tests:
   - Deposit to escrow (testnet)
   - Threshold detection
   - Alert triggering
   - Don't overdrain wallet

**Dependencies:**
- Story 7.2 complete (wallet management)

**Outputs:**
- Automated escrow deposit system
- Alert thresholds
- Transaction logging

**Dev Notes:**
- This is **scripted automation** (deterministic rules: if balance < X, deposit Y)
- NOT autonomous agents (AI-driven strategic decisions)
- Future Epic 10+: Add AI optimization of deposit timing, amounts, etc.

---

## Story 7.5: Profitability Dashboard

**As a** peer operator,
**I want** a dashboard showing economic health,
**so that** I can monitor self-sustainability.

**Acceptance Criteria:**
1. Dashboard page: `/dashboard/economics`
2. Key metrics displayed:
   - **Status:** ✅ Profitable / ⚠️ Break-even / ❌ Losing Money
   - **Today:** Revenue, Expenses, Profit
   - **This Month:** Revenue, Expenses, Profit, Profitability %
   - **All Time:** Total revenue, total expenses, net profit
3. Revenue breakdown:
   - Subscription fees (primary)
   - Routing fees (secondary)
   - Content fees (if applicable)
   - Pie chart showing distribution
4. Expense breakdown:
   - Akash hosting costs
   - Gas fees (Base L2 settlements)
   - Other expenses
5. Balance overview:
   - ETH balance (Base)
   - USDC balance (Base)
   - AKT balance (Akash wallet)
   - AKT in escrow (Akash)
   - Days of hosting remaining
6. Charts:
   - 30-day revenue/expense trend (line chart)
   - Revenue sources (pie chart)
   - Profitability over time
7. Export data:
   - CSV export of economic snapshots
   - JSON API endpoint for programmatic access
8. Tests:
   - Dashboard renders correctly
   - Metrics calculate accurately
   - Charts display data
   - Export functionality works

**Dependencies:**
- Story 7.1 complete (economic monitor)
- Story 7.4 complete (escrow deposits)

**Outputs:**
- Economic dashboard UI
- Real-time profitability monitoring
- Data export functionality

---

## Story 7.6: 30-Day Self-Sustainability Validation

**As a** peer operator,
**I want** proof that my node can be self-sustaining,
**so that** I know the economic model works.

**Acceptance Criteria:**
1. Simulation script: `scripts/validate-sustainability.ts`
2. Simulation inputs:
   - Number of followers (who subscribe to me)
   - Number of follows (who I subscribe to)
   - Subscription price (msats per hour)
   - Akash hosting cost ($5/month)
   - Routing fee percentage (1%)
3. Simulation outputs:
   - Daily revenue (from subscriptions + routing)
   - Daily expenses (Akash + gas)
   - Daily profit
   - Break-even day (when cumulative profit > 0)
   - 30-day cumulative profit
4. Scenarios:
   - Pessimistic: 10 followers, 20 follows
   - Base: 50 followers, 30 follows
   - Optimistic: 200 followers, 50 follows
5. Validation targets:
   - Base case: Profitable by day 15
   - Pessimistic: Break-even by day 30
   - Optimistic: 300%+ ROI in 30 days
6. Report generation:
   ```markdown
   ## 30-Day Sustainability Report

   **Scenario:** Base Case
   - Followers: 50 (earning from)
   - Follows: 30 (paying for)

   **Revenue:**
   - Subscriptions: $3.60/day (50 × 5000 msats/hour × 24h)
   - Routing: $0.50/day (estimated)
   - **Total: $4.10/day**

   **Expenses:**
   - Akash: $0.17/day ($5/month)
   - Gas: $0.05/day (settlements)
   - **Total: $0.22/day**

   **Profit:**
   - Daily: $3.88
   - Monthly: $116.40
   - ROI: 2,328% annually

   **Break-Even:** Day 1 ✅
   ```
7. Integration with real node:
   - Compare simulation to actual performance
   - Validate assumptions
   - Tune pricing if needed

**Dependencies:**
- Story 7.5 complete (dashboard showing real metrics)

**Outputs:**
- Sustainability validation script
- Economic scenario reports
- Proof of profitability

---

## Epic 7 Summary

**Stories:** 7.1, 7.2, 7.3, 7.4, 7.5, 7.6 (6 stories)
**Timeline:** 2 weeks
**Output:** Complete economic loop from revenue → AKT purchase → Akash payment, with proof of self-sustainability

**Key Deliverables:**
- USD revenue tracking ✅
- Akash wallet management ✅
- Manual AKT purchase flow ✅
- Automated escrow deposits ✅
- Profitability dashboard ✅
- 30-day sustainability proof ✅

**Simplified from Original:**
- ❌ No multi-chain liquidity pools
- ❌ No ILP swap APIs
- ❌ No DEX integration
- ❌ No liquidity rebalancing
- ✅ Simple: Track USD, buy AKT, pay Akash

---
