# Epic 4: Economic Monitoring & Self-Sustainability

**Goal:** Build revenue/expense tracking, profitability monitoring, and automatic Akash payment system to achieve relay self-sustainability. This epic proves the core value proposition: the relay pays for itself.

## Story 4.1: Create Economic Monitor Service in Nostream

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
     akash_expenses BIGINT,
     net_profit BIGINT,
     akt_balance BIGINT
   );
   ```
6. Calculates metrics: total revenue (AKT-equivalent), expenses, profit
7. Logs economic status daily
8. Integration test validates snapshot creation and real-time updates

## Story 4.2: Implement Automatic Currency Conversion to AKT

**As a** developer,
**I want** automatic conversion of non-AKT balances to AKT,
**so that** relay has AKT to pay Akash provider.

**Acceptance Criteria:**
1. Economic monitor checks if BTC/BASE/XRP balances > threshold (e.g., $10 equivalent)
2. Calls Dassie RPC: `await dassie.payment.convertToAKT.mutate({ fromCurrency: 'BTC', amount: 50000 })`
3. Dassie creates ILP payment to AKT connector (BTC → AKT conversion via routing)
4. Connector routes payment, relay receives AKT (tracked in ledger)
5. Conversion result returned via RPC, tracked in economic_snapshots
6. Runs daily or when non-AKT balance exceeds threshold
7. Handles conversion failures (retry, alert)
8. Integration test validates BTC → AKT conversion via local ILP connector

## Story 4.3: Integrate with Akash Provider Billing

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

## Story 4.4: Implement Automatic Akash Escrow Deposit

**As a** developer,
**I want** automatic deposits to Akash escrow when AKT balance is sufficient,
**so that** hosting continues without manual intervention.

**Acceptance Criteria:**
1. Economic monitor checks AKT balance daily
2. If `akt_balance > AKASH_PAYMENT_THRESHOLD_AKT` (default 1000 AKT):
   - Calculate escrow deposit: `ESCROW_MIN_DAYS` × daily costs (default 7-30 days)
   - Execute Cosmos transaction: Transfer AKT to Akash escrow account
   - Log transaction hash and amount
3. Queries Akash escrow balance after deposit (verify success)
4. Updates economic tracking with expense
5. Alerts if escrow balance < 3 days of costs (critical)
6. Integration test with Akash testnet (real escrow deposit)

## Story 4.5: Create Profitability Dashboard

**As an** operator,
**I want** a dashboard showing relay's economic health,
**so that** I can monitor self-sustainability.

**Acceptance Criteria:**
1. Dashboard page added to existing unified dashboard: `/dashboard#economics`
2. Displays:
   - **Status**: ✅ Profitable or ❌ Losing Money
   - **Daily P&L**: Revenue, expenses, profit (today)
   - **30-day trends**: Chart showing revenue/expenses over time
   - **Currency breakdown**: Revenue per currency (BTC, BASE, AKT, XRP)
   - **Revenue sources**: User payments vs. routing fees (pie chart)
   - **Akash costs**: Current monthly cost, escrow balance, days remaining
   - **Profitability margin**: Percentage (revenue / expenses × 100)
   - **Break-even date**: When cumulative profit > 0
3. Real-time updates (refresh every 60 seconds)
4. Export data (CSV, JSON)
5. Integration test validates dashboard accuracy

## Story 4.6: Add Economic Alerts

**As an** operator,
**I want** alerts when economic sustainability is at risk,
**so that** I can intervene before shutdown.

**Acceptance Criteria:**
1. Alert conditions:
   - Revenue < expenses for 3 consecutive days
   - AKT balance < 7 days of hosting costs
   - Akash escrow balance < 3 days of costs
   - Profitability < 110% target
2. Alerts logged at ERROR level
3. Alerts sent via webhook (if configured): POST to `ALERT_WEBHOOK_URL`
4. Alert cooldown: Max 1 alert per condition per 24 hours
5. Alert includes: Condition, current metrics, recommended action
6. Integration test triggers alerts by simulating low revenue

## Story 4.7: Implement 30-Day Self-Sustainability Simulation

**As a** developer,
**I want** a simulation proving relay self-sustainability,
**so that** we validate the economic model before production.

**Acceptance Criteria:**
1. Simulation script: `scripts/simulate-economics.ts`
2. Simulates 30 days of operation:
   - 500 users publishing 50 events/day each (25,000 events/day)
   - Each event costs 10 sats (~$0.001)
   - Relay routes 1,000 ILP payments/day (earns 0.1% fee)
   - Akash costs: 133 AKT/day (based on $5/month estimate)
3. Outputs:
   - Daily revenue (user payments + routing fees)
   - Daily expenses (Akash hosting)
   - Daily profit
   - Cumulative profit over 30 days
   - Break-even day (when cumulative > 0)
4. Test validates: Revenue > 110% of expenses by day 30
5. Generates report with charts and metrics

---
