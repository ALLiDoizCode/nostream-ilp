# Epic 7: ILP Connector Revenue Optimization

**Goal:** Configure Dassie as ILP connector, establish peer relationships, route payments, and earn routing fees to supplement user payment revenue. This epic makes the relay economically stronger by diversifying revenue beyond Nostr users.

## Story 7.1: Configure Dassie as Public ILP Connector

**As a** developer,
**I want** Dassie configured to accept peering requests,
**so that** other ILP nodes can route payments through it.

**Acceptance Criteria:**
1. Dassie configuration: `CONNECTOR_MODE=true`
2. Dassie advertises on ILP network (if public BNL exists)
3. Accepts incoming peering requests
4. Establishes payment channels with requesting peers
5. Configurable max peers (default: 10)
6. Peers listed in Dassie's Known Node List (KNL)
7. Integration test: External ILP node peers with relay's Dassie

## Story 7.2: Implement Routing Fee Configuration

**As a** developer,
**I want** configurable routing fees,
**so that** the relay earns from forwarded payments.

**Acceptance Criteria:**
1. Configuration: `ROUTING_FEE_PERCENTAGE` (default 0.001 = 0.1%)
2. Configuration: `ROUTING_FEE_MINIMUM_SATS` (default 1)
3. Dassie deducts fee from forwarded ILP packets
4. Fee tracked in internal ledger: `Cr. <currency>:revenue/routing-fees`
5. Fee visible to peers (published in peering metadata)
6. Economic monitor queries routing fees: `GET /api/routing-stats`
7. Integration test validates fee deduction on routed payment

## Story 7.3: Establish Peering with Liquidity Providers

**As a** developer,
**I want** Dassie to peer with ILP nodes providing liquidity,
**so that** cross-currency conversion is possible (BTC → AKT, etc.).

**Acceptance Criteria:**
1. Identify 2-3 ILP connectors providing BTC ↔ AKT liquidity
2. Dassie sends peering requests to these connectors
3. Establishes payment channels with liquidity providers
4. Deposits liquidity (small amounts for testing: 10,000 sats BTC, 100 AKT)
5. Validates routing paths available: BTC → Connector → AKT
6. Tests currency conversion: Send BTC, receive AKT
7. Documentation: How to find and peer with ILP connectors

## Story 7.4: Verify Routing Statistics RPC

**As a** developer,
**I want** to confirm routing statistics are accessible via RPC,
**so that** economic monitor can track connector revenue.

**Acceptance Criteria:**
1. RPC endpoint `payment.getRoutingStats` already added in Story 2.8
2. Verify it queries Dassie internal ledger correctly:
   - Queries `<currency>:revenue/routing-fees` accounts
   - Calculates 24h and 7d payment counts from ledger history
   - Counts active peers from peer state
3. Integration test validates accurate reporting:
   - Route test payment through relay
   - Verify routing fee appears in stats
   - Verify fee amount is correct (0.1% of routed payment)

## Story 7.5: Add Routing Revenue to Dashboard

**As an** operator,
**I want** dashboard showing routing revenue separately from user payments,
**so that** I can see revenue source breakdown.

**Acceptance Criteria:**
1. Dashboard displays routing statistics:
   - Payments routed (24h, 7d, 30d)
   - Routing fees earned (per currency)
   - Percentage of total revenue from routing
2. Chart: User payments vs. routing fees over time
3. Shows active peer connections
4. Displays top peers by routing volume
5. Integration test validates dashboard data

## Story 7.6: Optimize Liquidity Distribution

**As a** developer,
**I want** Dassie to maintain balanced liquidity across currencies,
**so that** routing capacity is maximized.

**Acceptance Criteria:**
1. Liquidity monitor checks balances hourly
2. If currency balance too low (< min threshold):
   - Convert from AKT or high-balance currency
   - Replenish to target balance
3. If currency balance too high (> max threshold):
   - Convert to AKT (what Akash needs)
4. Rebalancing logged and tracked in expenses
5. Configurable thresholds per currency
6. Integration test validates rebalancing

---
