# Epic 1: Nostream Fork & ILP Integration

**Goal:** Fork Nostream repository, remove centralized payment processors, and integrate with Dassie ILP node via HTTP API for payment claim verification. This epic establishes the foundation by replacing Nostream's centralized Lightning payments with decentralized ILP payments.

## Story 1.1: Fork Nostream and Remove Centralized Payments

**As a** developer,
**I want** a forked Nostream repository with centralized payment processors removed,
**so that** I have a clean foundation for ILP integration.

**Acceptance Criteria:**
1. Nostream repository forked to project GitHub: `nostream-ilp`
2. Remove payment processor integrations: ZEBEDEE, Nodeless, OpenNode, LNbits code removed
3. Remove payment processor database tables and migrations
4. Remove payment processor environment variables from config
5. Update README with project description (ILP-enabled relay)
6. Preserve Nostr relay functionality (all tests still pass)
7. Development environment runs: `npm install && npm run dev`

## Story 1.2: Create Dassie RPC Client for Nostream

**As a** developer,
**I want** a WebSocket RPC client for calling Dassie ILP node,
**so that** Nostream can verify payment claims and query balances.

**Acceptance Criteria:**
1. New module created: `src/integrations/dassie-rpc-client.ts`
2. Uses @trpc/client to connect to Dassie RPC:
   ```typescript
   import { createTRPCProxyClient, createWSClient } from '@trpc/client'
   import type { AppRouter } from '@dassie/app-dassie'

   const wsClient = createWSClient({
     url: process.env.DASSIE_RPC_URL || 'ws://localhost/rpc'
   })

   export const dassieRpc = createTRPCProxyClient<AppRouter>({
     transport: wsClient
   })
   ```
3. Wrapper methods for common operations:
   - `getBalances() -> Promise<CurrencyBalances>` (wraps `ledgers.getList`)
   - `subscribeToBalance(callback)` (wraps `general.subscribeBalance`)
   - `verifyPaymentClaim(claim)` (calls new `payment.verifyPaymentClaim`)
   - `convertToAKT(currency, amount)` (calls new `payment.convertToAKT`)
   - `claimChannels(currency?)` (calls new `payment.claimAllChannels`)
   - `getRoutingStats()` (calls new `payment.getRoutingStats`)
4. WebSocket reconnection logic (auto-reconnect on disconnect)
5. Error handling with typed error responses
6. Unit tests with mocked RPC responses
7. Integration test against real Dassie node

## Story 1.3: Define Payment Claim Format for Nostr Events

**As a** developer,
**I want** a standard format for payment claims in Nostr events,
**so that** clients know how to attach ILP payments.

**Acceptance Criteria:**
1. Documentation created: `docs/payment-extension.md`
2. Payment claim format defined in Nostr event tags:
   ```json
   {
     "tags": [
       ["payment", "ilp", "<channel_id>", "<amount_sats>", "<nonce>", "<signature>", "<currency>"]
     ]
   }
   ```
3. TypeScript interface created:
   ```typescript
   interface ILPPaymentClaim {
     channelId: string
     amountSats: number
     nonce: number
     signature: string  // hex-encoded
     currency: 'BTC' | 'BASE' | 'AKT' | 'XRP'
   }
   ```
4. Parser function: `extractPaymentClaim(event: NostrEvent) -> ILPPaymentClaim | null`
5. Validation function: `validateClaimFormat(claim) -> boolean`
6. Example events with payment claims in documentation
7. Unit tests for parsing valid and invalid claims

## Story 1.4: Implement Payment Verification in EVENT Handler

**As a** developer,
**I want** Nostream to verify payment claims before storing events,
**so that** only paid events are accepted.

**Acceptance Criteria:**
1. Modify EVENT handler in Nostream (`src/handlers/event-message-handler.ts` or similar)
2. Extract payment claim from event tags
3. Call Dassie RPC to verify claim: `await dassieRpc.payment.verifyPaymentClaim.mutate(claim)`
4. If verification fails, send OK response: `["OK", event_id, false, "payment-required: 10 sats"]`
5. If amount insufficient, send OK with required amount: `["OK", event_id, false, "insufficient-payment: need 10 sats, got 5"]`
6. If verification succeeds, proceed with existing Nostream event storage
7. Log all payment verifications (success and failure)
8. Integration test: Client sends EVENT with valid claim → stored, invalid claim → rejected

## Story 1.5: Add Pricing Configuration

**As an** operator,
**I want** configurable pricing for relay operations,
**so that** I can set costs appropriate for economic sustainability.

**Acceptance Criteria:**
1. Environment variables added:
   - `PRICING_STORE_EVENT` (default: 10 sats)
   - `PRICING_DELIVER_EVENT` (default: 1 sat)
   - `PRICING_QUERY` (default: 5 sats)
   - `PRICING_FREE_TIER_EVENTS` (default: 0, set to e.g., 100 for free trial)
2. Pricing exposed in NIP-11 relay information document:
   ```json
   {
     "name": "Self-Sustaining Relay",
     "payments_url": "https://docs.example.com/payments",
     "fees": {
       "admission": [{ "amount": 10, "unit": "sat" }],
       "publication": [{ "amount": 10, "unit": "sat" }]
     }
   }
   ```
3. `calculateRequiredPayment(operation, event) -> number` function
4. Different pricing tiers by event kind (optional, configurable)
5. Documentation explaining pricing model
6. Unit tests for pricing calculations

## Story 1.6: Implement Free Tier / Grace Period

**As a** developer,
**I want** optional free tier for new users,
**so that** users can try the relay before committing to payments.

**Acceptance Criteria:**
1. Configuration: `FREE_TIER_EVENTS` (default: 0, disabled)
2. Track events stored per pubkey in database
3. If user's event count < FREE_TIER_EVENTS, allow without payment
4. After threshold, require payment for all events
5. Send NOTICE to client when approaching limit: "10 free events remaining"
6. Free tier configurable per pubkey (whitelist option)
7. Integration test validates free tier behavior

## Story 1.7: Add Inter-Process Health Checks

**As an** operator,
**I want** Nostream to monitor Dassie availability,
**so that** I'm alerted if ILP node is down.

**Acceptance Criteria:**
1. Nostream monitors Dassie RPC WebSocket connection state
2. Uses tRPC WebSocket client's built-in reconnection logic
3. If Dassie WebSocket disconnects:
   - Log ERROR: "Dassie RPC connection lost"
   - Set relay to degraded mode (accept events without payment, queue for later verification)
   - Send NOTICE to clients: "Payment verification temporarily unavailable"
4. When WebSocket reconnects:
   - Log INFO: "Dassie RPC reconnected"
   - Resume normal payment verification
   - Process queued payment verifications
5. Can also ping Dassie HTTP health endpoint: GET `http://dassie/health` for liveness check
6. Health status exposed in Nostream's health endpoint
7. Integration test: Kill Dassie, verify Nostream handles gracefully and reconnects

## Story 1.8: Create Unified Dashboard

**As an** operator,
**I want** a single dashboard showing Nostream and Dassie status,
**so that** I can monitor the entire system in one place.

**Acceptance Criteria:**
1. Dashboard created: `packages/dashboard/` (new package in Nostream fork)
2. Backend aggregates data from:
   - Nostream database: Relay stats (events, subscriptions, clients)
   - Dassie RPC subscriptions: Real-time balance updates, ledger account changes, routing stats
3. Uses Dassie RPC subscriptions for real-time updates:
   - `dassie.general.subscribeBalance.subscribe(...)` for total balance
   - `dassie.debug.subscribeToLedgerAccount.subscribe({ path: 'akt:revenue/nostr-events' }, ...)` for revenue tracking
   - `dassie.debug.subscribeRoutingTable.subscribe(...)` for routing changes
4. Dashboard displays:
   - Relay status: Events stored, active subscriptions, connected clients
   - Payment status: Active channels, balances per currency (live updates)
   - Connector status: Payments routed, routing fees earned, peers connected
5. Real-time updates via Dassie RPC subscriptions (WebSocket push, not polling)
6. Responsive web UI (works on mobile)
7. Deployed as part of Nostream container
8. Integration test validates dashboard data accuracy and real-time updates

---
