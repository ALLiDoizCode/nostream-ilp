# Epic 4: ILP Liquidity Connector & Self-Sustainability

**Goal:** Build a multi-chain ILP liquidity connector that enables relays to swap between any supported tokens (AKT, CRO, USDC, BTC, ETH, XRP) and automatically pay for Akash hosting. This epic transforms the relay into both a payment receiver AND a liquidity provider, proving economic self-sustainability through user payments + routing fees.

**Key Innovation:** Multi-token payment channel factory contract allows users to pay in ANY ERC-20 token on Cronos/Base, not just AKT. Combined with ILP routing, this enables true multi-chain liquidity.

---

## Story 4.1: Create Multi-Token Payment Channel Factory Contract

**As a** developer,
**I want** a payment channel factory that supports any ERC-20 token,
**so that** users can open channels with AKT, CRO, USDC, or any token on Cronos/Base.

**Acceptance Criteria:**
1. New contract created: `contracts/MultiTokenPaymentChannelFactory.sol`
2. Contract supports dynamic token selection per channel:
   ```solidity
   function openChannel(
       address tokenAddress,  // Any ERC-20 token
       address recipient,
       uint256 amount,
       uint256 expiration
   ) external returns (bytes32 channelId)
   ```
3. Channel struct includes token address:
   ```solidity
   struct Channel {
       address sender;
       address recipient;
       address token;         // ← NEW: Dynamic per channel
       uint256 balance;
       uint256 highestNonce;
       uint256 expiration;
       bool isClosed;
   }
   ```
4. `closeChannel()` and `expireChannel()` handle token-specific transfers:
   - Use `IERC20(channel.token).transfer()` instead of hardcoded token
5. Support for native ETH channels (special case: `address(0)` = ETH)
6. Comprehensive test suite:
   - Test with multiple ERC-20 tokens (MockAKT, MockUSDC, MockCRO)
   - Test with native ETH
   - Test multiple simultaneous channels with different tokens
   - Test that channels are isolated (AKT channel can't claim USDC)
7. Gas optimization: Similar costs to single-token contract
8. Security: Validate token address is contract (prevent EOA addresses)
9. Events include token address for indexing:
   ```solidity
   event ChannelOpened(
       bytes32 indexed channelId,
       address indexed sender,
       address indexed recipient,
       address token,      // ← NEW
       uint256 balance,
       uint256 expiration
   )
   ```

**Testing Requirements:**
- Unit tests: >90% coverage
- Test multiple tokens simultaneously
- Test native ETH fallback
- Gas cost comparison vs single-token contract (<10% overhead)

**Dependencies:**
- Epic 3 complete (CronosPaymentChannel as reference) ✅

**Outputs:**
- Multi-token factory contract (Solidity)
- Test suite with multiple token mocks
- Deployment script for Cronos + Base
- Documentation on supported token standards

---

## Story 4.2: Deploy Multi-Token Factory to EVM Chains (Cronos, Base, Arbitrum)

**As a** developer,
**I want** MultiTokenPaymentChannelFactory deployed to multiple EVM production networks,
**so that** users can open payment channels with any supported token on any supported chain.

**Acceptance Criteria:**
1. Deploy to **Cronos Mainnet** (ChainID: 25):
   - Contract: `MultiTokenPaymentChannelFactory.sol`
   - Verify on CronoScan
   - Test with: AKT, USDC, CRO (wrapped as ERC-20)
   - Document address: `CRONOS_MULTI_TOKEN_FACTORY_ADDRESS`
2. Deploy to **Base Mainnet** (ChainID: 8453):
   - Same factory contract (identical bytecode)
   - Verify on BaseScan
   - Test with: ETH, USDC, other Base tokens
   - Document address: `BASE_MULTI_TOKEN_FACTORY_ADDRESS`
3. Deploy to **Arbitrum One** (ChainID: 42161) - Optional but recommended:
   - Same factory contract
   - Verify on Arbiscan
   - Test with: ETH, USDC, ARB
   - Document address: `ARBITRUM_MULTI_TOKEN_FACTORY_ADDRESS`
4. Create per-chain token whitelist configuration:
   ```yaml
   # config/token-whitelists.yaml
   cronos:
     - address: "0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3"
       symbol: "AKT"
       decimals: 6
     - address: "0x..." # USDC on Cronos
       symbol: "USDC"
       decimals: 6
   base:
     - address: "0x..." # USDC on Base
       symbol: "USDC"
       decimals: 6
     - address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" # Native ETH
       symbol: "ETH"
       decimals: 18
   ```
5. Gas cost validation on each chain: <$0.02 per channel
6. Integration test: Open channels with 3 different tokens on each chain
7. Update .env.example with all factory addresses
8. Document EVM compatibility:
   - Note: Same contract works on ANY EVM chain (Polygon, Optimism, BSC, etc.)
   - Future deployments: Just deploy to new chain, add to whitelist

**Dependencies:**
- Story 4.1 complete (factory contract built and tested)
- Deployer wallet funded on Cronos, Base, and Arbitrum mainnets

**Outputs:**
- Deployed factory addresses (3+ chains)
- Verified contracts on all block explorers
- Per-chain token whitelist configuration
- Multi-chain deployment documentation

**Note:** The factory contract is **chain-agnostic** - the SAME Solidity code works on Ethereum, Cronos, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche, and any other EVM-compatible chain. Only the deployment addresses and token addresses differ per chain.

---

## Story 4.3: Update Dassie Settlement Modules for Multi-Token Support

**As a** developer,
**I want** Dassie settlement modules to handle any token from the factory,
**so that** payment verification works for all ERC-20 channels.

**Acceptance Criteria:**
1. Update `cronos-mainnet.ts` settlement module:
   - Remove hardcoded `aktTokenAddress`
   - Add support for dynamic token addresses
   - Query factory contract for channel details (includes token)
2. Update `base-mainnet.ts` settlement module (similar changes)
3. Add token metadata cache:
   - Cache token decimals, symbol, name
   - Avoid repeated RPC calls for same token
4. Update payment verification logic:
   - Verify claim signature (unchanged)
   - Verify token balance in channel (token-specific)
   - Convert amounts to USD equivalent for accounting
5. Add token price oracle integration:
   - CoinGecko API for AKT, CRO, USDC, ETH prices
   - Cache prices (update every 5 minutes)
   - Fallback to hardcoded rates if API fails
6. Test with multiple token types:
   - AKT channel → verify payment
   - USDC channel → verify payment
   - CRO channel → verify payment
7. Integration test validates multi-token payment verification

**Dependencies:**
- Story 4.2 complete (factory deployed)
- Dassie cronos-mainnet module from Story 3.7

**Outputs:**
- Updated settlement modules with multi-token support
- Token price oracle service
- Token metadata cache

---

## Story 4.4: Configure Dassie as Multi-Chain Liquidity Connector

**As a** developer,
**I want** Dassie configured to provide liquidity across all supported chains,
**so that** relays can swap between any supported assets via ILP.

**Acceptance Criteria:**
1. Enable all settlement modules in Dassie configuration:
   - ✅ Lightning Network (BTC)
   - ✅ Cronos Mainnet (multi-token via factory)
   - ✅ Base Mainnet (multi-token via factory)
   - ✅ XRP Ledger
   - ✅ Akash Network (native AKT)
2. Configure initial liquidity pools (minimum viable):
   - Lightning BTC: 0.01 BTC (~$1,000)
   - Cronos AKT: 1,000 AKT (~$500)
   - Cronos USDC: $500
   - Cronos CRO: 1,000 CRO (~$120)
   - Base ETH: 0.2 ETH (~$700)
   - Akash AKT: 2,000 AKT (~$1,000)
   - **Total:** ~$3,820 initial capital
3. Set minimum reserve levels (don't drain pools completely):
   - Each pool: Keep 20% minimum reserve
   - Alert when pool < 30% of target
4. Configure routing fee structure:
   - Same asset, different chain: 1% (e.g., Cronos AKT → Akash AKT)
   - Different assets, same ecosystem: 2% (e.g., AKT → CRO)
   - Cross-ecosystem: 2.5% (e.g., BTC → AKT)
5. Test Dassie can route between all pairs:
   - Cronos AKT → Akash AKT ✅
   - Lightning BTC → Akash AKT ✅
   - Base ETH → Cronos USDC ✅
   - XRP → Cronos CRO ✅
6. Document liquidity pool addresses and initial balances
7. Create monitoring dashboard showing pool levels

**Dependencies:**
- Story 4.3 complete (multi-token settlement modules)
- Epic 2 complete (all settlement modules exist)
- Epic 3 complete (Cronos integration)

**Outputs:**
- Dassie configuration with all modules enabled
- Liquidity pool initialization documentation
- Pool monitoring dashboard

---

## Story 4.5: Implement Direct ILP Swap Quote API

**As a** relay operator,
**I want** to request swap quotes via API,
**so that** I can see costs before executing swaps.

**Acceptance Criteria:**
1. REST API endpoint created: `POST /api/swap/quote`
2. Request format:
   ```json
   {
     "sourceLedger": "akt+cronos-mainnet+akt",
     "destinationLedger": "akt+akash-mainnet+akt",
     "sourceAmount": "100000000",
     "destinationAddress": "akash1youraddress"
   }
   ```
3. Response format:
   ```json
   {
     "quoteId": "uuid",
     "sourceLedger": "akt+cronos-mainnet+akt",
     "sourceAmount": "100000000",
     "destinationLedger": "akt+akash-mainnet+akt",
     "destinationAmount": "99000000",
     "fee": "1000000",
     "feePercent": 1.0,
     "exchangeRate": 0.99,
     "ilpAddress": "ilp.connector.yourrelay.com.akash.uakt",
     "expiresAt": "2025-12-01T12:05:00Z",
     "estimatedTime": "60s"
   }
   ```
4. Quote validation:
   - Check liquidity available on destination ledger
   - Verify source ledger is supported
   - Validate amount > minimum swap size (e.g., $1 equivalent)
   - Validate amount < maximum swap size (e.g., $10,000 equivalent)
5. Quote expiration: 5 minutes (prevent stale rates)
6. Store quotes in database for tracking
7. Rate limiting: Max 10 quotes per IP per minute
8. Integration test: Request quotes for all supported pairs

**Dependencies:**
- Story 4.4 complete (liquidity pools configured)

**Outputs:**
- Swap quote API endpoint
- Quote validation logic
- API documentation

---

## Story 4.6: Implement Multi-Chain Swap Execution via ILP

**As a** relay operator,
**I want** to execute swaps by sending ILP payments,
**so that** I can convert revenue to AKT for hosting payments.

**Acceptance Criteria:**
1. Dassie listens for incoming ILP payments with swap metadata
2. Swap metadata format (in ILP packet):
   ```json
   {
     "type": "swap",
     "quoteId": "uuid-from-quote-api",
     "destinationLedger": "akt+akash-mainnet+akt",
     "destinationAddress": "akash1recipient"
   }
   ```
3. Swap execution flow:
   - Receive ILP payment on source ledger (e.g., Cronos AKT)
   - Validate quote is still valid (not expired)
   - Check liquidity on destination ledger
   - Send destination amount via appropriate settlement module
   - Update accounting (debit source pool, credit dest pool)
4. Atomic guarantees:
   - If destination send fails → refund source payment ✅
   - If destination succeeds → source payment confirmed ✅
   - No partial failures (ILP conditions enforce this)
5. Transaction logging:
   ```sql
   CREATE TABLE swap_transactions (
     id UUID PRIMARY KEY,
     quote_id UUID,
     source_ledger VARCHAR,
     source_amount BIGINT,
     dest_ledger VARCHAR,
     dest_amount BIGINT,
     fee_amount BIGINT,
     status VARCHAR, -- pending, completed, failed, refunded
     ilp_packet_hash VARCHAR,
     source_tx_hash VARCHAR,
     dest_tx_hash VARCHAR,
     created_at TIMESTAMPTZ,
     completed_at TIMESTAMPTZ
   );
   ```
6. Handle edge cases:
   - Insufficient destination liquidity → reject with clear error
   - Invalid quote → reject
   - Network failure → retry logic with timeout
7. Integration tests:
   - Test successful swap: Lightning BTC → Akash AKT
   - Test failed swap: Insufficient liquidity → refund
   - Test expired quote → rejection
8. Performance: <60 seconds for successful swap

**Dependencies:**
- Story 4.5 complete (quote API working)
- All settlement modules operational

**Outputs:**
- Swap execution engine
- Transaction logging system
- Integration tests for all swap pairs

---

## Story 4.7: Add Liquidity Pool Management & Rebalancing

**As a** connector operator,
**I want** monitoring and alerts for liquidity pools,
**so that** I can rebalance before running out of liquidity.

**Acceptance Criteria:**
1. Pool monitoring service:
   - Tracks balance on each ledger
   - Calculates utilization percentage
   - Identifies which pools need rebalancing
2. Alert conditions:
   - Pool < 30% of target → WARNING
   - Pool < 20% of target → CRITICAL
   - Pool imbalance > 2x (one pool too high, another too low) → REBALANCE
3. Rebalancing recommendations:
   - Which pools to drain
   - Which pools to fill
   - Recommended bridge amount
   - Estimated bridge cost
4. Manual rebalancing workflow:
   - Dashboard shows rebalance recommendations
   - Operator clicks "Execute Rebalance"
   - Script generated for manual bridge (via exchange)
5. Future: Automated rebalancing hooks (placeholder for Epic 7)
6. Pool statistics:
   - Total value locked (TVL) across all pools
   - Swap volume per pool (last 24h, 7d, 30d)
   - Fee revenue per pool
   - Return on liquidity (fees / capital locked)
7. Dashboard visualization:
   - Bar chart: Current vs target liquidity per pool
   - Line chart: Pool balances over time
   - Alert panel: Active warnings/recommendations

**Dependencies:**
- Story 4.6 complete (swaps operational)

**Outputs:**
- Pool monitoring service
- Rebalancing recommendation engine
- Pool management dashboard

---

## Story 4.8: Create Economic Monitor Service in Nostream

**As a** developer,
**I want** an economic monitoring service in Nostream,
**so that** revenue and expenses are tracked continuously.

**Acceptance Criteria:**
1. Service created: `src/services/economic-monitor.ts` (in Nostream fork)
2. Runs as background service in Nostream process
3. Subscribes to Dassie RPC for real-time updates:
   - `dassie.general.subscribeBalance.subscribe(...)` for balance changes
   - `dassie.debug.subscribeToLedgerAccount.subscribe({ path: 'akt:revenue/nostr-events' }, ...)` for revenue
4. Queries Dassie RPC hourly for full state:
   - `await dassie.ledgers.getList.query()` for multi-currency balances
   - `await dassie.payment.getRoutingStats.query()` for connector fees
5. Stores economic snapshots in PostgreSQL:
   ```sql
   CREATE TABLE economic_snapshots (
     timestamp TIMESTAMPTZ PRIMARY KEY,
     revenue_btc BIGINT,
     revenue_base BIGINT,
     revenue_akt BIGINT,
     revenue_xrp BIGINT,
     routing_fees_total BIGINT,
     swap_fees_total BIGINT,
     akash_expenses BIGINT,
     net_profit BIGINT,
     akt_balance BIGINT
   );
   ```
6. Calculates metrics: total revenue (user payments + routing fees + swap fees), expenses, profit
7. Logs economic status daily
8. Integration test validates snapshot creation and real-time updates

**Dependencies:**
- Story 4.7 complete (liquidity pools operational and tested)

**Outputs:**
- Economic monitoring service
- Database schema for snapshots
- Real-time tracking system

---

## Story 4.9: Integrate with Akash Provider Billing

**As a** developer,
**I want** automatic retrieval of Akash hosting costs,
**so that** expense tracking is accurate.

**Acceptance Criteria:**
1. Akash provider client created: `src/integrations/akash-client.ts` (in Nostream)
2. Queries Akash provider API for lease billing (if API exists) OR
3. Manually configured expense estimate: `AKASH_MONTHLY_COST_AKT` environment variable
4. Updates economic_snapshots with Akash expenses
5. Runs daily
6. Fallback: If API unavailable, use configured estimate
7. Documentation on finding Akash provider billing API

**Dependencies:**
- Story 4.8 complete (economic monitor running)

**Outputs:**
- Akash billing integration client
- Expense tracking in database

---

## Story 4.10: Implement Automatic Akash Escrow Deposit

**As a** developer,
**I want** automatic deposits to Akash escrow when AKT balance is sufficient,
**so that** hosting continues without manual intervention.

**Acceptance Criteria:**
1. Economic monitor checks Akash AKT balance daily
2. If Cronos AKT balance > threshold, automatically swap to Akash AKT:
   - Use swap API from Story 4.5 (get quote)
   - Execute swap via ILP (Story 4.6)
   - Receive native AKT on Akash
3. If `akash_akt_balance > AKASH_PAYMENT_THRESHOLD_AKT` (default 1000 AKT):
   - Calculate escrow deposit: `ESCROW_MIN_DAYS` × daily costs (default 7-30 days)
   - Execute Cosmos transaction: Transfer AKT to Akash escrow account
   - Log transaction hash and amount
4. Queries Akash escrow balance after deposit (verify success)
5. Updates economic tracking with expense
6. Alerts if escrow balance < 3 days of costs (critical)
7. Integration test with Akash testnet:
   - Simulate Cronos AKT revenue
   - Auto-swap to Akash
   - Auto-pay escrow
   - Verify end-to-end flow

**Dependencies:**
- Story 4.6 complete (swap execution working)
- Story 4.9 complete (Akash billing integration)

**Outputs:**
- Automated Akash payment system
- End-to-end revenue → hosting payment flow

---

## Story 4.11: Create Profitability Dashboard

**As an** operator,
**I want** a dashboard showing relay's economic health,
**so that** I can monitor self-sustainability.

**Acceptance Criteria:**
1. Dashboard page added to existing unified dashboard: `/dashboard#economics`
2. Displays:
   - **Status**: ✅ Profitable or ❌ Losing Money
   - **Daily P&L**: Revenue, expenses, profit (today)
   - **30-day trends**: Chart showing revenue/expenses over time
   - **Currency breakdown**: Revenue per currency (BTC, BASE, AKT, XRP, etc.)
   - **Revenue sources**: User payments vs. routing fees vs. swap fees (pie chart)
   - **Liquidity pools**: Current balance vs target per ledger
   - **Swap activity**: Recent swaps, volume, fees earned
   - **Akash costs**: Current monthly cost, escrow balance, days remaining
   - **Profitability margin**: Percentage (revenue / expenses × 100)
   - **Break-even date**: When cumulative profit > 0
3. Real-time updates (refresh every 60 seconds)
4. Export data (CSV, JSON)
5. Integration test validates dashboard accuracy

**Dependencies:**
- Story 4.10 complete (full automation working)

**Outputs:**
- Comprehensive economic dashboard
- Real-time profitability monitoring

---

## Story 4.12: Add Economic Alerts

**As an** operator,
**I want** alerts when economic sustainability is at risk,
**so that** I can intervene before shutdown.

**Acceptance Criteria:**
1. Alert conditions:
   - Revenue < expenses for 3 consecutive days
   - AKT balance < 7 days of hosting costs
   - Akash escrow balance < 3 days of costs
   - Profitability < 110% target
   - Any liquidity pool < 20% of target (CRITICAL)
   - Swap failure rate > 5% (quality issue)
2. Alerts logged at ERROR level
3. Alerts sent via webhook (if configured): POST to `ALERT_WEBHOOK_URL`
4. Alert cooldown: Max 1 alert per condition per 24 hours
5. Alert includes: Condition, current metrics, recommended action
6. Integration test triggers alerts by simulating low revenue

**Dependencies:**
- Story 4.11 complete (dashboard showing metrics)

**Outputs:**
- Economic alerting system
- Webhook integration

---

## Story 4.13: Implement 30-Day Self-Sustainability Simulation

**As a** developer,
**I want** a simulation proving relay self-sustainability,
**so that** we validate the economic model before production.

**Acceptance Criteria:**
1. Simulation script: `scripts/simulate-economics.ts`
2. Simulates 30 days of operation:
   - **User payments**: 500 users × 50 events/day × 10 sats = 25,000 events/day
   - **Swap revenue**: 10 relays × 2 swaps/month × 1% fee on $100 = $20/month
   - **Routing fees**: 1,000 routed ILP payments/day × 0.1% = additional revenue
   - **Akash costs**: 133 AKT/day (~$4,000/month estimate)
3. Multi-revenue stream model:
   - User event payments (primary)
   - Swap fees (secondary)
   - ILP routing fees (tertiary)
4. Outputs:
   - Daily revenue breakdown (user + swap + routing)
   - Daily expenses (Akash hosting)
   - Daily profit
   - Cumulative profit over 30 days
   - Break-even day (when cumulative > 0)
5. Test validates: **Total revenue > 110% of expenses by day 30**
6. Generates report with:
   - Charts (revenue/expenses trends)
   - Revenue source breakdown
   - Profitability projections
   - Sensitivity analysis (what if user count drops 50%?)

**Dependencies:**
- Story 4.12 complete (all monitoring operational)

**Outputs:**
- Economic simulation script
- 30-day sustainability report
- Sensitivity analysis documentation

---
