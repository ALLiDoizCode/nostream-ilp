# Requirements

## Functional Requirements

**Nostr Relay Core Functionality (Inherited from Nostream)**
- **FR1:** The system shall implement Nostr relay protocol supporting EVENT, REQ, CLOSE, and EOSE message types
- **FR2:** The system shall store Nostr events in PostgreSQL database with indexing by id, pubkey, kind, and tags
- **FR3:** The system shall support Nostr subscription filters (authors, kinds, tags, since, until, limit)
- **FR4:** The system shall broadcast events to active subscriptions matching filter criteria via WebSocket
- **FR5:** The system shall enforce configurable limits (max subscriptions, max filters, max event size)

**ILP Payment Integration (New - Replaces Nostream's Centralized Payments)**
- **FR6:** The system shall extract payment claims from Nostr EVENT message tags or metadata
- **FR7:** The system shall call Dassie ILP node RPC API via WebSocket to verify payment claim signatures off-chain
- **FR8:** The system shall reject events with invalid or insufficient payment claims
- **FR9:** The system shall support configurable pricing per Nostr operation (store event, deliver event, query)
- **FR10:** Nostream shall communicate with Dassie via WebSocket RPC for payment verification, balance queries, and settlement operations

**ILP Connector Functionality (Dassie Handles This)**
- **FR11:** Dassie node shall operate as an ILP connector, routing payments between peers
- **FR12:** Dassie node shall discover and peer with other ILP nodes using Bootstrap Node List (BNL) and Known Node List (KNL)
- **FR13:** Dassie node shall forward ILP packets to appropriate next-hop peers based on routing table
- **FR14:** Dassie node shall earn routing fees on forwarded payments (configurable percentage)
- **FR15:** Dassie node shall maintain liquidity balances across multiple settlement currencies (BTC, BASE, AKT, XRP)

**Multi-Blockchain Settlement (Dassie Settlement Modules)**
- **FR16:** Dassie node shall support payment channels on Bitcoin via Lightning Network
- **FR17:** Dassie node shall support payment channels on Ethereum Base L2 (via custom settlement module)
- **FR18:** Dassie node shall support payment channels on Akash/Cosmos (via CosmWasm contract)
- **FR19:** Dassie node shall support payment channels on XRP Ledger (using native payment channels)
- **FR20:** Dassie node shall implement settlement scheme plugins following SettlementSchemeModule interface for each blockchain

**Akash Provider Payment (Economic Monitor - New Component)**
- **FR21:** Economic monitor shall query Dassie for total AKT balance from claimed payment channels
- **FR22:** Economic monitor shall automatically deposit AKT into Akash escrow account when balance threshold reached
- **FR23:** Economic monitor shall track Akash hosting costs (compute, bandwidth, storage) from provider billing API
- **FR24:** Economic monitor shall maintain minimum AKT balance in escrow to ensure continuous hosting (7-day buffer)
- **FR25:** Economic monitor shall alert operators if revenue falls below hosting costs for 3 consecutive days

**Economic Monitoring (New Component)**
- **FR26:** Economic monitor shall track revenue from user payments via Dassie API (per currency)
- **FR27:** Economic monitor shall track revenue from routing fees via Dassie API
- **FR28:** Economic monitor shall track expenses paid to Akash provider
- **FR29:** Economic monitor shall calculate net profitability (revenue minus expenses) in real-time
- **FR30:** Economic monitor shall expose economic metrics via HTTP API and web dashboard

**Inter-Process Communication**
- **FR31:** Nostream shall expose HTTP REST API endpoint for Dassie to query relay status and metrics (optional)
- **FR32:** Dassie shall expose WebSocket RPC API at /rpc for Nostream to call (queries, mutations, subscriptions)
- **FR33:** Economic monitor shall use Dassie's WebSocket RPC to query balances, routing stats, and trigger settlements
- **FR34:** All inter-process communication shall use localhost (127.0.0.1) WebSocket connections for security
- **FR35:** Dassie RPC shall use authentication via session tokens or dev tokens (environment variable)

## Non-Functional Requirements

**Performance**
- **NFR1:** The system shall handle at least 1,000 Nostr events per second (Nostream capability)
- **NFR2:** Payment verification via Dassie RPC shall complete in under 10ms (localhost WebSocket RPC call + signature verification)
- **NFR3:** ILP packet forwarding shall have latency under 50ms (excluding network)
- **NFR4:** Nostream shall support at least 10,000 concurrent WebSocket connections (Nostr clients)

**Reliability**
- **NFR5:** Both processes (Nostream + Dassie) shall persist state to survive crashes
- **NFR6:** If Dassie process crashes, Nostream shall queue payment verifications and retry
- **NFR7:** If Nostream crashes, Dassie ILP connector functionality shall continue (separate concerns)
- **NFR8:** Both processes shall provide health check endpoints for Akash container orchestration

**Security**
- **NFR9:** Payment claim signatures shall be verified before accepting any service request
- **NFR10:** Nonce tracking shall prevent double-spending of payment claims
- **NFR11:** Rate limiting shall prevent DoS attacks on free operations
- **NFR12:** Inter-process API authentication shall use secure tokens (not exposed to internet)
- **NFR13:** Private keys shall be stored encrypted at rest

**Compatibility**
- **NFR14:** Nostream shall be compatible with standard Nostr clients (Damus, Amethyst, Snort, etc.)
- **NFR15:** Dassie shall interoperate with other Dassie/ILP nodes
- **NFR16:** Both processes shall run as Docker containers deployable via Akash SDL
- **NFR17:** System shall use Node.js 22.x and TypeScript

**Economic Viability**
- **NFR18:** The system shall achieve break-even (revenue ≥ expenses) within 30 days of deployment with 500+ users
- **NFR19:** The system shall maintain at least 7 days of Akash hosting cost reserves in AKT balance
- **NFR20:** The system shall automatically adjust pricing if profitability drops below 110% threshold

**Scalability**
- **NFR21:** Akash deployment shall cost less than $10/month for MVP (2 containers)
- **NFR22:** System shall support horizontal scaling (multiple Nostream instances behind load balancer - future)

---
