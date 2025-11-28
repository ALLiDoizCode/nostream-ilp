# Nostr-ILP Relay - Product Requirements Document (PRD)

## Goals and Background Context

### Goals

- **Enable self-sustaining Nostr relays** that earn revenue from micropayments and use it to pay for their own hosting on Akash Network
- **Marry Interledger Protocol (ILP) with Nostr** by embedding payment claims in Nostr events and enabling cross-ledger micropayment routing
- **Create economic sustainability for permissionless relay infrastructure** where relays operate profitably without donations or external funding
- **Support multi-blockchain payment acceptance** allowing users to pay in BTC, ETH (Base), AKT, or XRP with automatic conversion via ILP connectors
- **Enable relay-as-connector functionality** where relays route ILP payments between peers and earn routing fees to supplement user payment revenue
- **Deliver production-ready deployment on Akash** with automated SDL generation and economic monitoring

### Background Context

The Nostr protocol faces a fundamental sustainability problem: relays provide free storage and bandwidth for users, leading to either centralized corporate-run relays (censorship risk) or volunteer-run relays that eventually shut down due to costs. Previous monetization attempts (donations, subscriptions) have failed because:

1. **Micropayment economics don't work** - Credit card fees ($0.30) make per-event payments impossible
2. **Single-blockchain lock-in** - Users must hold specific tokens (e.g., Lightning sats) to use specific relays
3. **All-or-nothing pricing** - Subscriptions exclude casual users who don't want monthly commitment

The Interledger Protocol (ILP) solves these problems by enabling:
- **Cross-ledger routing** - Users pay in any cryptocurrency (BTC, ETH, BASE, XRP), relays receive preferred currency (AKT)
- **N-hop connector networks** - Payments route through intermediary connectors who provide liquidity and earn fees
- **Micropayment viability** - XRP-style payment channels enable satoshi-level payments with single settlement transaction

By integrating **Nostream** (production TypeScript Nostr relay) with **Dassie** (production ILP implementation) and deploying on **Akash** (decentralized compute marketplace), we create a **self-sustaining economic model**: relays earn more from user micropayments than they pay for Akash hosting, achieving financial independence.

### Existing Solutions We Build Upon

**Nostream** (https://github.com/cameri/nostream):
- Production-ready Nostr relay written in TypeScript
- PostgreSQL + Redis for storage and caching
- Supports NIPs 01, 02, 04, 09, 11, and many more
- Has payment integration (ZEBEDEE, Nodeless - we'll replace with ILP)
- **We fork this** and replace centralized payments with ILP

**Dassie** (https://github.com/justmoon/dassie):
- Production ILP implementation in TypeScript
- Connector functionality with routing and peer discovery
- Internal ledger with double-entry accounting
- Settlement scheme plugin architecture
- **We use this** for ILP routing and payment channels

### Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-01-24 | 0.1 | Initial greenfield PRD for Nostr-ILP relay project | Claude/User |
| 2025-01-24 | 0.2 | Updated to use Nostream (fork) + Dassie (integration) two-process architecture | Claude/User |
| 2025-01-24 | 0.3 | Updated to use Dassie's WebSocket RPC API instead of HTTP REST, leveraging existing tRPC infrastructure. Added Story 2.2 for RPC token authentication. | Claude/User |

---

## Requirements

### Functional Requirements

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

### Non-Functional Requirements

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

## User Interface Design Goals

### Overall UX Vision

The system provides a **standard Nostr relay experience** for end users (no UX changes) with an **operator dashboard** for monitoring economic health, payment channels, and deployment status.

### Key Interaction Paradigms

- **Nostr Client Compatibility:** Users connect with standard Nostr clients - no modifications required
- **Transparent Payments:** Payment claims embedded in Nostr event tags - clients may add this via plugins/extensions
- **Operator Dashboard:** Single web UI aggregating data from both Nostream and Dassie
- **API-First:** All functionality accessible via HTTP APIs

### Core Screens and Views

**Unified Operator Dashboard:**
- **Economic Overview:** Revenue (user payments + routing fees), expenses (Akash), profit/loss, runway
- **Nostr Relay Stats:** Events stored, subscriptions active, connected clients, bandwidth used
- **ILP Connector Stats:** Payments routed, routing fees earned, peer connections, liquidity per currency
- **Payment Channels:** Active channels (per blockchain), balances, pending settlements
- **Akash Deployment:** Resource usage, costs, escrow balance, days remaining

**Nostr Client (Standard - No Changes):**
- Users interact via standard Nostr protocol over WebSocket
- Payment-aware clients attach payment claims to EVENT messages
- Legacy clients without payment support may have limited access (configurable)

### Accessibility

**None** - Infrastructure product. Dashboard uses standard web accessibility.

### Branding

**Minimal** - Clean, functional dashboard. Focus on data clarity over aesthetics.

### Target Device and Platforms

**Server/Backend** - Two Docker containers on Akash Network
**Operator Dashboard** - Web responsive, accessible from any browser

---

## Technical Assumptions

### Repository Structure: Dual-Repo Approach

**Decision:** Maintain two separate repositories (forks), not a monorepo combining both.

**Rationale:**
- Nostream and Dassie are both large, mature projects
- Merging into single monorepo is complex and error-prone
- Easier to pull upstream updates from both projects
- Clear separation of concerns (Nostr vs. ILP)

**Repository structure:**
```
Repo 1: nostream-ilp (fork of Nostream)
- Fork of cameri/nostream
- Modifications: Replace payment processors with ILP API calls
- New: Economic monitor service
- New: Dassie API client

Repo 2: dassie (fork or use upstream)
- Fork of justmoon/dassie OR use upstream directly
- Additions: New settlement modules (BASE, Cosmos CosmWasm)
- Additions: API endpoints for Nostream to call
- Minor modifications: Economic reporting API
```

**Third repository for CosmWasm contract:**
```
Repo 3: cosmos-payment-channels
- Rust CosmWasm contract
- Payment channel implementation (open, claim, close)
- Deployment scripts for Akash/Cosmos testnet and mainnet
```

### Service Architecture: Two-Process Deployment

**Decision:** Deploy Nostream and Dassie as separate containers in single Akash SDL.

**Rationale:**
- **Faster development** - Modify each independently
- **Easier testing** - Test Nostream relay and Dassie ILP separately
- **Upstream updates** - Can pull Nostream or Dassie updates without merge conflicts
- **Reusability** - Same Dassie node could potentially serve multiple Nostream instances
- **Cost acceptable** - ~$4-8/month on Akash (still far cheaper than traditional VPS)

**Process communication:**
```
┌─────────────────────────────────────────────┐
│ Akash SDL Deployment                        │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │ Container 1: Nostream                  │ │
│  │ - Port 7777: Nostr WebSocket (public) │ │
│  │ - Port 8080: HTTP API (internal)      │ │
│  │ - PostgreSQL + Redis (embedded)       │ │
│  └────────────────────────────────────────┘ │
│         ↕ HTTP (localhost)                   │
│  ┌────────────────────────────────────────┐ │
│  │ Container 2: Dassie ILP Node           │ │
│  │ - Port 443: ILP connector (public)    │ │
│  │ - Port 7768: HTTP API (internal)      │ │
│  │ - SQLite database                      │ │
│  └────────────────────────────────────────┘ │
│         ↕ HTTP (localhost)                   │
│  ┌────────────────────────────────────────┐ │
│  │ Container 3: Economic Monitor          │ │
│  │ - Queries Nostream + Dassie APIs      │ │
│  │ - Pays Akash provider                 │ │
│  │ - Port 3000: Dashboard (public)       │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**Wait, that's 3 containers. Let me revise:**

**Simpler: 2 containers only**
```
Container 1: Nostream + Economic Monitor (combined)
  - Nostream relay functionality
  - Economic monitor runs as background service in same process
  - Queries Dassie API
  - Pays Akash provider

Container 2: Dassie ILP Node
  - ILP connector and routing
  - Payment channel management
  - Multi-blockchain settlement
  - API for Nostream to call
```

### Payment Flow Architecture

**User → Relay (Revenue Stream):**
```
1. User (Nostr client) connects to Nostream via WebSocket
2. User publishes EVENT with payment claim in tags:
   ["payment", "ilp", "<channel_id>", "<amount>", "<nonce>", "<signature>"]
3. Nostream extracts payment claim
4. Nostream calls Dassie RPC: await dassie.payment.verifyPaymentClaim.mutate({ channelId, amountSats, nonce, signature, currency })
5. Dassie verifies signature, checks nonce, validates amount
6. Dassie responds: { valid: true, amountSats: 10, currency: 'BTC' }
7. Nostream stores event in PostgreSQL and broadcasts to subscribers
8. Payment tracked in Dassie internal ledger
```

**Relay → Akash Provider (Expense Stream):**
```
1. Economic monitor (inside Nostream process) runs daily
2. Queries Dassie RPC: await dassie.ledgers.getList.query() → [{ id: 'btc', balance: 50000n }, ...]
3. Triggers conversion: await dassie.payment.convertToAKT.mutate({ fromCurrency: 'BTC', amount: 50000 })
   → Dassie creates ILP payment routing BTC → AKT via connectors
4. Claims channels: await dassie.payment.claimAllChannels.mutate() → Settles channels, receives AKT
5. Economic monitor receives AKT in wallet (queries balance via RPC)
6. Economic monitor deposits AKT to Akash escrow: Cosmos transaction
7. Akash provider draws from escrow based on usage
8. Economic monitor tracks: revenue earned vs. expenses paid
```

**Dassie as ILP Connector (Additional Revenue):**
```
1. Other ILP nodes peer with Dassie
2. Payments route through Dassie (NodeA → Dassie → NodeB)
3. Dassie deducts routing fee (0.1% of payment)
4. Routing fee tracked in revenue ledger accounts
5. Nostream economic monitor subscribes to routing fee updates via RPC
6. Routing fees supplement user payment revenue
```

### Inter-Process Communication: Dassie WebSocket RPC

**Nostream → Dassie RPC Calls:**
```typescript
// Connect to Dassie RPC
const dassie = createTRPCProxyClient<AppRouter>({
  transport: createWSClient({ url: 'ws://dassie:80/rpc' })
})

// Existing Dassie RPC endpoints we use:
await dassie.ledgers.getList.query()
  → [{ id: 'btc', balance: 50000n }, { id: 'akt', balance: 5000000n }, ...]

await dassie.general.subscribeBalance.subscribe(undefined, { onData: (balance) => { ... } })
  → Real-time total balance updates

await dassie.debug.getLedger.query()
  → All ledger accounts (for detailed revenue/expense breakdown)

await dassie.debug.subscribeToLedgerAccount.subscribe({ path: 'akt:revenue/nostr-events' }, ...)
  → Real-time updates when revenue account changes

// NEW RPC endpoints we need to add to Dassie:
await dassie.payment.verifyPaymentClaim.mutate({ channelId, amountSats, nonce, signature, currency })
  → { valid: boolean, reason?: string }

await dassie.payment.convertToAKT.mutate({ fromCurrency: 'BTC', amount: 50000 })
  → { aktReceived: number, conversionRate: number, fees: number }

await dassie.payment.claimAllChannels.mutate({ currency?: 'BTC' | 'BASE' | 'AKT' | 'XRP' })
  → { btc: number, base: number, akt: number, xrp: number }

await dassie.payment.getRoutingStats.query()
  → { paymentsRouted24h: number, routingFeesEarned: { btc, base, akt, xrp }, activePeers: number }
```

**Dassie → Nostream (Optional, via HTTP REST):**
```
GET http://nostream:8080/api/relay-stats
  Response: { eventsStored: number, subscriptions: number, clients: number }
```

### Akash Deployment Model

**Decision:** Deploy as 2 Docker containers via single Akash SDL.

**SDL Configuration:**
```yaml
version: "2.0"

services:
  # Service 1: Nostream Relay + Economic Monitor
  nostream:
    image: ghcr.io/your-org/nostream-ilp:latest
    env:
      # Nostream config
      - RELAY_NAME=Self-Sustaining Relay
      - RELAY_DESCRIPTION=ILP-powered micropayment relay
      - DB_HOST=localhost
      - DB_PORT=5432
      - REDIS_HOST=localhost
      - REDIS_PORT=6379
      # ILP integration - WebSocket RPC with token auth
      - DASSIE_RPC_URL=ws://dassie:80/rpc?token=REPLACE_WITH_32_CHAR_TOKEN
      # Pricing (in satoshis)
      - PRICING_STORE_EVENT=10
      - PRICING_DELIVER_EVENT=1
      - PRICING_QUERY=5
      # Akash payment
      - AKASH_PROVIDER_ADDRESS=akash1abc...
      - AKASH_ESCROW_MIN_DAYS=7
      - AKASH_PAYMENT_THRESHOLD_AKT=1000
    expose:
      - port: 7777  # Nostr WebSocket
        as: 80
        to:
          - global: true
      - port: 3000  # Dashboard
        as: 3000
        to:
          - global: true
    depends_on:
      - dassie

  # Service 2: Dassie ILP Node
  dassie:
    image: ghcr.io/your-org/dassie-node:latest
    env:
      - NODE_ENV=production
      - SETTLEMENT_CURRENCIES=BTC,BASE,AKT,XRP
      - ROUTING_FEE_PERCENTAGE=0.001  # 0.1% routing fee
      # RPC authentication - token for Nostream to connect
      - RPC_AUTH_TOKEN=REPLACE_WITH_32_CHAR_TOKEN  # Must match Nostream's token
      # Settlement module configs
      - BITCOIN_NETWORK=testnet
      - BASE_RPC_URL=https://sepolia.base.org
      - COSMOS_RPC_URL=https://rpc.testnet.akash.network
      - XRP_NETWORK=testnet
    expose:
      - port: 80    # RPC WebSocket (internal only - for Nostream)
      - port: 443   # ILP connector (public - for peering)
        as: 443
        to:
          - global: true

profiles:
  compute:
    nostream:
      resources:
        cpu:
          units: 0.5
        memory:
          size: 1.5Gi
        storage:
          size: 50Gi
    dassie:
      resources:
        cpu:
          units: 0.5
        memory:
          size: 1Gi
        storage:
          size: 20Gi

  placement:
    dcloud:
      pricing:
        nostream:
          denom: uakt
          amount: 300  # ~$1.50-3/month
        dassie:
          denom: uakt
          amount: 200  # ~$1-2/month

deployment:
  nostream:
    dcloud:
      profile: nostream
      count: 1
  dassie:
    dcloud:
      profile: dassie
      count: 1
```

**Estimated Akash cost**: ~$2.50-5/month for both containers

### Database & Persistence

**Nostream (Container 1):**
- **PostgreSQL** - Nostr event storage (Nostream's default)
- **Redis** - Subscription caching and pub/sub (Nostream's default)
- **Persistent volume** - Shared between PostgreSQL and Redis

**Dassie (Container 2):**
- **SQLite** - ILP ledger and payment channel state (Dassie's default)
- **Persistent volume** - Single file database

**Economic Monitor:**
- **Shares PostgreSQL** with Nostream (economic_snapshots table)
- **Queries both** Nostream and Dassie via APIs for consolidated view

**Akash persistent storage:**
```yaml
# In SDL profiles
storage:
  - size: 50Gi
    attributes:
      persistent: true
      class: beta3  # Persistent storage class on Akash
```

### CosmWasm Payment Channels (Akash/Cosmos)

**Decision:** Use CosmWasm smart contracts for Cosmos-based payment channels.

**Rationale:**
- **Permissionless** - Deploy to Akash chain without governance
- **Fast iteration** - Deploy new versions quickly
- **Low cost** - ~0.5-2 AKT (~$0.0025-$0.01) to deploy
- **Rust ecosystem** - Well-documented, secure

**Contract functionality:**
```rust
// cosmos-payment-channels/src/contract.rs

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    // Initialize contract state
    Ok(Response::default())
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::OpenChannel { recipient, expiration } => {
            // Lock sender's funds (info.funds) in contract
            let channel = PaymentChannel {
                id: generate_channel_id(&info.sender, &recipient),
                sender: info.sender.clone(),
                recipient,
                amount: info.funds[0].amount,
                denom: info.funds[0].denom.clone(),
                expiration,
                highest_claim: Uint128::zero(),
                status: ChannelStatus::Open,
            };
            CHANNELS.save(deps.storage, &channel.id, &channel)?;
            Ok(Response::new()
                .add_attribute("action", "open_channel")
                .add_attribute("channel_id", channel.id))
        }
        ExecuteMsg::CloseChannel { channel_id, final_claim } => {
            // Verify claim signature (off-chain data)
            // Transfer claimed amount to recipient
            // Refund remainder to sender
            execute_close_channel(deps, env, info, channel_id, final_claim)
        }
    }
}

#[entry_point]
pub fn query(
    deps: Deps,
    _env: Env,
    msg: QueryMsg,
) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetChannel { channel_id } => {
            to_binary(&CHANNELS.load(deps.storage, &channel_id)?)
        }
    }
}
```

**Deployment:**
```bash
# Build contract
cd cosmos-payment-channels
cargo wasm
cosmwasm-optimize .

# Deploy to Akash testnet
akash tx wasm store artifacts/cosmos_payment_channels.wasm \
  --from wallet \
  --chain-id akashnet-2 \
  --gas auto \
  --gas-adjustment 1.3

# Instantiate
akash tx wasm instantiate <code_id> '{}' \
  --from wallet \
  --label "payment-channels-v1" \
  --admin <your_address>
```

### Testing Requirements

**Unit Tests:**
- Nostream: Existing Nostream tests + new ILP integration tests
- Dassie: Use Dassie's existing test suite + new settlement module tests
- CosmWasm: Contract tests using cw-multi-test

**Integration Tests:**
- Two-process communication (Nostream ↔ Dassie API)
- End-to-end payment flow (Nostr client → EVENT → payment verification → storage)
- Multi-blockchain settlement (BTC, BASE, AKT, XRP payment channels)
- Akash payment automation (claim channels → pay provider)
- Economic validation (30-day simulation showing profitability)

**Deployment Tests:**
- Akash SDL deployment (testnet and mainnet)
- Container health checks
- Persistent storage validation
- Cross-container communication

### Technology Stack Summary

**Nostream Container:**
- Node.js 22.x
- TypeScript
- PostgreSQL (event storage)
- Redis (caching, pub/sub)
- Fastify (HTTP server)
- WebSocket (Nostr protocol)

**Dassie Container:**
- Node.js 22.x
- TypeScript
- SQLite (ILP ledger)
- Dassie ILP packages
- Settlement modules (Lightning, Base, Cosmos, XRP)

**CosmWasm Contract:**
- Rust
- CosmWasm framework
- Deployed to Akash/Cosmos chain

**Infrastructure:**
- Docker (containerization)
- Akash Network (deployment)
- GitHub Actions (CI/CD)

---

## Success Metrics

### Primary Metrics (MVP)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Self-sustainability** | Revenue ≥ 110% of expenses | Daily economic snapshot shows profit |
| **Nostr compatibility** | Standard clients work without modifications | Test with Damus, Amethyst, Snort |
| **Multi-blockchain support** | 4 currencies accepted (BTC, BASE, AKT, XRP) | Payment channels active on all 4 via Dassie |
| **Payment verification speed** | < 10ms per claim | P99 latency for Nostream → Dassie API call |
| **Akash deployment success** | Relay runs on Akash for 30+ days | Uptime > 99% |
| **Inter-process reliability** | < 0.1% failed API calls | Nostream ↔ Dassie communication success rate |

### Secondary Metrics (Production)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **User adoption** | 500+ active users | Unique pubkeys publishing events |
| **Event throughput** | 100+ events/second | Nostream relay capacity |
| **Routing revenue** | > 20% of total | Dassie connector fees / total revenue |
| **Economic margin** | Revenue > 150% of expenses | Healthy profit margin |
| **Akash cost efficiency** | Hosting < $8/month | Actual Akash provider charges |

---

## MVP Validation Approach

### Phase 1: Local Development (Weeks 1-4)

**Week 1-2: Fork and Setup**
1. Fork Nostream repository
2. Fork or clone Dassie repository
3. Create CosmWasm payment channel contract repository
4. Set up local development environment (Docker Compose)
5. Validate both run independently

**Week 3-4: Integration**
1. Add Dassie API client to Nostream
2. Implement payment claim extraction from Nostr events
3. Wire up payment verification (Nostream → Dassie API)
4. Test locally with mock payment claims
5. Validate standard Nostr clients can connect

### Phase 2: Multi-Blockchain Settlement (Weeks 5-8)

**Week 5: Bitcoin/Lightning**
1. Use Dassie's existing Lightning support (if available) OR
2. Implement Lightning settlement module
3. Test Bitcoin testnet payment channels
4. Validate claim verification and settlement

**Week 6: Ethereum Base L2**
1. Create Solidity payment channel contract for Base
2. Deploy to Base Sepolia testnet
3. Implement Base settlement module in Dassie
4. Test Base testnet payment channels

**Week 7: Cosmos/Akash CosmWasm**
1. Complete CosmWasm payment channel contract
2. Deploy to Akash testnet
3. Implement Cosmos settlement module in Dassie
4. Test Akash testnet payment channels

**Week 8: XRP Ledger**
1. Implement XRP settlement module
2. Integrate with XRP testnet payment channels
3. Test claim verification and settlement

### Phase 3: Economic Monitoring (Weeks 9-10)

**Week 9: Revenue Tracking**
1. Implement economic monitor service in Nostream
2. Query Dassie for balances and routing fees
3. Track revenue per currency
4. Create economic_snapshots table in PostgreSQL

**Week 10: Expense Tracking & Akash Payment**
1. Integrate with Akash provider billing API
2. Implement automatic AKT conversion (via Dassie ILP routing)
3. Implement automatic Akash escrow deposits
4. Build profitability dashboard
5. Test 7-day economic cycle locally

### Phase 4: Akash Deployment (Weeks 11-12)

**Week 11: Containerization**
1. Create Dockerfiles for Nostream and Dassie
2. Create Akash SDL with 2-service configuration
3. Test Docker Compose locally (simulates Akash)

**Week 12: Akash Deployment**
1. Deploy to Akash testnet
2. Validate both containers communicate via localhost
3. Deploy to Akash mainnet
4. Monitor actual costs for 7 days
5. Validate self-sustainability target

### Phase 5: Economic Validation (Weeks 13-16)

**Week 13-14: User Simulation**
1. Simulate 500 users publishing events
2. Generate realistic Nostr traffic patterns
3. Measure actual revenue from micropayments

**Week 15-16: Profitability Validation**
1. Run 30-day economic simulation
2. Measure: Revenue vs. Akash costs
3. Validate: Revenue > 110% of expenses
4. Document economic model with real data
5. Adjust pricing if needed

---

## Out of Scope (Explicitly Excluded)

1. **Privacy/TEE features** - No nilCC, no AMD SEV-SNP, no attestation
2. **Farcaster integration** - Nostr protocol only
3. **AI agent automation** - Focus on human users; agents can use relay but no special features
4. **Mobile native apps** - Standard Nostr mobile clients work
5. **Advanced Nostr NIPs** - Core NIPs only (01, 02, 04, 09, 11, 12, 15, 16, 20, 22, 33)
6. **Single-process optimization** - Start with 2 processes, optimize later if needed
7. **Fiat currency** - Cryptocurrency only
8. **Advanced content moderation** - Basic spam filtering only
9. **Multi-relay coordination** - Single relay instance for MVP
10. **Horizontal scaling** - Single deployment, clustering is future work

---

## Epic List

### Epic 1: Nostream Fork & ILP Integration
**Goal:** Fork Nostream repository, remove centralized payment processors, and integrate with Dassie ILP node via HTTP API for payment claim verification.

### Epic 2: Dassie Multi-Blockchain Settlement Modules
**Goal:** Implement or configure settlement modules for Bitcoin (Lightning), Base L2, Cosmos/Akash (CosmWasm), and XRP Ledger in Dassie node.

### Epic 3: CosmWasm Payment Channel Contract
**Goal:** Create, test, and deploy CosmWasm smart contract for Cosmos/Akash payment channels with XRP-style claim functionality.

### Epic 4: Economic Monitoring & Self-Sustainability
**Goal:** Build revenue/expense tracking, profitability monitoring, and automatic Akash payment system to achieve relay self-sustainability.

### Epic 5: Akash Deployment & SDL
**Goal:** Containerize both applications, create Akash SDL for 2-service deployment, deploy to Akash mainnet, and validate real-world costs.

### Epic 6: Arweave Permanent Storage Integration
**Goal:** Integrate Arweave permanent storage for large content and event backups, implementing hot/cold storage tiers with bundled ILP+Arweave pricing.

### Epic 7: ILP Connector Revenue Optimization
**Goal:** Configure Dassie as ILP connector, establish peer relationships, route payments, and earn routing fees to supplement user payment revenue.

---

## Epic 1: Nostream Fork & ILP Integration

**Goal:** Fork Nostream repository, remove centralized payment processors, and integrate with Dassie ILP node via HTTP API for payment claim verification. This epic establishes the foundation by replacing Nostream's centralized Lightning payments with decentralized ILP payments.

### Story 1.1: Fork Nostream and Remove Centralized Payments

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

### Story 1.2: Create Dassie RPC Client for Nostream

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

### Story 1.3: Define Payment Claim Format for Nostr Events

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

### Story 1.4: Implement Payment Verification in EVENT Handler

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

### Story 1.5: Add Pricing Configuration

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

### Story 1.6: Implement Free Tier / Grace Period

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

### Story 1.7: Add Inter-Process Health Checks

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

### Story 1.8: Create Unified Dashboard

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

## Epic 2: Dassie Multi-Blockchain Settlement Modules

**Goal:** Enable RPC token authentication, implement settlement modules for Bitcoin (Lightning), Base L2, Cosmos/Akash (CosmWasm), and XRP Ledger in Dassie node, and add RPC endpoints for economic monitoring. This epic enables the relay to accept payments in 4 different cryptocurrencies via ILP routing and provides APIs for Nostream integration.

### Story 2.1: Set Up Dassie Development Environment

**As a** developer,
**I want** Dassie running locally for development,
**so that** I can test ILP functionality and build settlement modules.

**Acceptance Criteria:**
1. Dassie repository cloned or forked: `dassie` or `dassie-relay`
2. Dependencies installed: `pnpm install`
3. Development build succeeds: `pnpm build`
4. Dassie node starts: `pnpm dev` (app-dassie package)
5. Health check endpoint responds: GET `http://localhost:7768/health`
6. Peer discovery works (connects to Dassie testnet or local multi-node setup)
7. Documentation: How to run Dassie locally for development

### Story 2.2: Enable RPC Token Authentication in Dassie

**As a** developer,
**I want** Dassie to support token-based authentication for RPC,
**so that** Nostream can authenticate securely via environment variable.

**Acceptance Criteria:**
1. Modify Dassie RPC server: `packages/app-dassie/src/rpc-server/rpc-server.ts`
2. Add token authentication alongside existing session cookie auth:
   ```typescript
   // Token authentication (production-safe)
   const providedToken = url.searchParams.get("token")
   const expectedToken = environmentConfig.rpcAuthToken  // New config

   if (
     expectedToken &&
     expectedToken.length >= 32 &&  // Minimum 32 characters
     providedToken &&
     providedToken === expectedToken  // Constant-time comparison
   ) {
     authenticated = true
   }
   ```
3. Configuration via environment variable: `RPC_AUTH_TOKEN` (minimum 32 characters)
4. Token auth available in production (not just dev mode)
5. Works alongside existing session cookie authentication (both methods supported)
6. Token NOT logged in plain text (sanitize URLs in logs to hide token)
7. Documentation: How to generate secure token (e.g., `openssl rand -hex 32`)
8. Unit test validates token auth works
9. Integration test: Connect with valid token → authenticated, invalid token → `RpcFailure("Unauthorized")`

### Story 2.3: Add Payment Verification RPC Endpoint to Dassie

**As a** developer,
**I want** Dassie to expose an RPC endpoint for payment claim verification,
**so that** Nostream can validate claims via WebSocket RPC.

**Acceptance Criteria:**
1. New RPC mutation added to Dassie's payment router: `src/rpc-server/routers/payment.ts`
2. Mutation definition:
   ```typescript
   verifyPaymentClaim: authenticatedProcedure
     .input(z.object({
       channelId: z.string(),
       amountSats: z.number(),
       nonce: z.number(),
       signature: z.string(),  // hex
       currency: z.enum(['BTC', 'BASE', 'AKT', 'XRP'])
     }))
     .mutation(async ({ input, context }) => {
       // Look up channel state in internal ledger
       // Verify signature matches sender's public key
       // Validate nonce > previous nonce (prevent replay)
       // Validate amount ≤ channel capacity
       // Update channel state with new highest nonce if valid
       return {
         valid: boolean,
         reason?: string,  // "invalid-signature", "insufficient-balance", etc.
         amountSats?: number
       }
     })
   ```
3. Verification logic uses Dassie's internal ledger to look up channel state
4. Updates ledger account when claim is verified (tracks revenue)
5. Requires authentication (uses Dassie's existing auth system)
6. Unit tests with mock channel state
7. Integration test with real payment channel
8. Exported in AppRouter type for Nostream to use

### Story 2.4: Implement Bitcoin Lightning Settlement Module

**As a** developer,
**I want** a Lightning Network settlement module in Dassie,
**so that** users can pay the relay using Bitcoin.

**Acceptance Criteria:**
1. Check if Dassie already has Lightning support (may exist)
2. If not, create module: `packages/app-dassie/src/settlement/lightning/`
3. Implements Dassie's SettlementSchemeModule interface
4. Integrates with LND or CLN (Core Lightning) via gRPC
5. Supports opening payment channels with users
6. Verifies Lightning invoice payments (claim-based or invoice-based)
7. Settles by claiming from Lightning channels
8. Uses Bitcoin testnet for MVP
9. Integration test: Open channel, send payment, close channel

### Story 2.5: Create Base L2 Payment Channel Contract

**As a** developer,
**I want** an Ethereum smart contract for payment channels on Base L2,
**so that** users can pay the relay using ETH.

**Acceptance Criteria:**
1. Solidity contract created: `contracts/BasePaymentChannel.sol`
2. Functions implemented:
   - `openChannel(recipient, expiration) payable` - Lock ETH
   - `closeChannel(channelId, finalClaim) ` - Settle with claim
   - `getChannel(channelId) view` - Query channel state
3. Claim verification logic (ecrecover signature validation)
4. Nonce monotonicity enforcement
5. Contract compiled and tested with Hardhat/Foundry
6. Unit tests cover all functions and edge cases
7. Contract deployed to Base Sepolia testnet
8. Deployment script and documentation

### Story 2.6: Implement Base L2 Settlement Module in Dassie

**As a** developer,
**I want** a Base L2 settlement module in Dassie,
**so that** the relay can accept ETH payments on Base.

**Acceptance Criteria:**
1. Module created: `packages/app-dassie/src/settlement/base/`
2. Implements Dassie's SettlementSchemeModule interface
3. Integrates with Base RPC endpoint (Alchemy, Infura, or public Base Sepolia)
4. Interacts with deployed BasePaymentChannel contract via ethers.js or viem
5. Opens channels: Calls contract's `openChannel` method
6. Verifies claims: Off-chain signature verification in TypeScript
7. Settles: Calls contract's `closeChannel` with final claim
8. Uses Base Sepolia testnet for MVP
9. Integration test: Open channel, verify claims, close channel

### Story 2.7: Implement Cosmos/Akash Settlement Module in Dassie

**As a** developer,
**I want** a Cosmos settlement module in Dassie,
**so that** the relay can accept AKT payments natively.

**Acceptance Criteria:**
1. Module created: `packages/app-dassie/src/settlement/cosmos/`
2. Implements Dassie's SettlementSchemeModule interface
3. Integrates with Akash RPC via CosmJS (@cosmjs/stargate)
4. Interacts with deployed CosmWasm payment channel contract
5. Opens channels: Executes contract's OpenChannel message
6. Verifies claims: Off-chain signature verification (Cosmos secp256k1)
7. Settles: Executes contract's CloseChannel with final claim
8. Uses Akash testnet for development, mainnet for production
9. Integration test: Open channel on testnet, verify claim, close channel

### Story 2.8: Implement XRP Ledger Settlement Module in Dassie

**As a** developer,
**I want** an XRP Ledger settlement module in Dassie,
**so that** users can pay the relay using XRP.

**Acceptance Criteria:**
1. Module created: `packages/app-dassie/src/settlement/xrp/`
2. Implements Dassie's SettlementSchemeModule interface
3. Integrates with XRP Ledger via xrpl.js library
4. Opens payment channels: PaymentChannelCreate transaction
5. Verifies claims: Ed25519 signature verification
6. Settles: PaymentChannelClaim transaction submits final claim
7. Uses XRP testnet for MVP
8. Integration test: Open channel on testnet, send claims, close channel

### Story 2.9: Add Additional RPC Endpoints for Economic Monitor

**As a** developer,
**I want** Dassie to expose RPC endpoints for currency conversion and channel claiming,
**so that** economic monitor can automate AKT conversion and settlement.

**Acceptance Criteria:**
1. New RPC mutations added to Dassie's payment router:
   ```typescript
   // Convert balance to AKT via ILP routing
   convertToAKT: authenticatedProcedure
     .input(z.object({
       fromCurrency: z.enum(['BTC', 'BASE', 'XRP']),
       amount: z.number()
     }))
     .mutation(async ({ input, context }) => {
       // Create ILP payment to AKT connector
       // Return conversion result
       return { aktReceived: number, conversionRate: number, fees: number }
     }),

   // Trigger settlement on all or specific payment channels
   claimAllChannels: authenticatedProcedure
     .input(z.object({ currency: z.enum(['BTC', 'BASE', 'AKT', 'XRP']).optional() }))
     .mutation(async ({ input, context }) => {
       // Trigger settlement on payment channels
       // Return claimed amounts per currency
       return { btc: number, base: number, akt: number, xrp: number }
     }),

   // Get routing statistics (connector revenue)
   getRoutingStats: authenticatedProcedure
     .query(async ({ context }) => {
       // Query revenue/routing-fees accounts from ledger
       return {
         paymentsRouted24h: number,
         routingFeesEarned: { btc, base, akt, xrp },
         activePeers: number
       }
     })
   ```
2. All endpoints use Dassie's existing auth system (authenticated procedures)
3. Unit tests for each endpoint
4. Integration tests validate conversion, claiming, and stats work correctly
5. Note: Balance querying already exists via `ledgers.getList` and `debug.getLedger` (no new endpoint needed)

---

## Epic 3: AKT Payment Channel Deployment (Cronos)

**Updated:** 2025-11-28
**Status:** READY FOR IMPLEMENTATION

**Goal:** Deploy AKT payment channel support via Cronos EVM, enabling users to open payment channels with AKT tokens for Nostr-ILP micropayments.

---

### Context

**Research Findings (2025-11-28):**
- Cronos deployment enables AKT payment channels with **95% code reuse** from Base L2 contract
- **8x faster** development (7 hours vs 57 hours for CosmWasm)
- **8x cheaper** development cost ($1,140 vs $8,625)
- **60-70% cheaper gas** than Base L2 ($0.001 vs $0.003 per channel)
- Production-ready in **1 week** vs 3 weeks

**Decision:** Focus on Cronos deployment for MVP. Native CosmWasm can be considered in future if volume exceeds 100k channels/month.

**Research Documentation:** `docs/research/cronos-akt-deployment/`

---

### Story 3.1: Modify BasePaymentChannel for ERC-20 AKT Support

**As a** developer,
**I want** to modify BasePaymentChannel.sol to work with AKT ERC-20 tokens on Cronos,
**so that** I can reuse 95% of existing battle-tested code.

**Acceptance Criteria:**
1. Create new contract file: `contracts/CronosPaymentChannel.sol` (copy from BasePaymentChannel.sol)
2. Add IERC20 import: `import "@openzeppelin/contracts/token/ERC20/IERC20.sol";`
3. Add token state variable: `IERC20 public immutable aktToken;`
4. Add constructor: `constructor(address _aktTokenAddress) { aktToken = IERC20(_aktTokenAddress); }`
5. Modify `openChannel()`:
   - Add `uint256 amount` parameter
   - Remove `payable` modifier
   - Replace `msg.value` checks with `amount` parameter
   - Add `aktToken.transferFrom(msg.sender, address(this), amount);`
6. Modify `closeChannel()`:
   - Replace `payable(recipient).transfer()` with `aktToken.transfer(recipient, claimAmount)`
   - Replace sender refund with `aktToken.transfer(sender, refundAmount)`
7. Modify `expireChannel()`:
   - Replace `payable(sender).transfer()` with `aktToken.transfer(sender, balance)`
8. All other functions remain unchanged (generateChannelId, _verifyClaimSignature, getChannel, etc.)
9. Contract compiles successfully
10. Code changes documented in PR

**Estimated Effort:** 1.0 hour

**Reference:** `docs/research/cronos-akt-deployment/findings/contract-modifications.md`

---

### Story 3.2: Create MockAKT Token and Update Tests

**As a** developer,
**I want** updated tests that work with ERC-20 tokens instead of native ETH,
**so that** I can validate CronosPaymentChannel behavior.

**Acceptance Criteria:**
1. Create mock token: `contracts/test/MockAKT.sol`
   ```solidity
   contract MockAKT is ERC20 {
       constructor() ERC20("Mock Akash Token", "AKT") {
           _mint(msg.sender, 1000000 * 10**6); // 1M AKT
       }
       function decimals() public pure override returns (uint8) {
           return 6;  // AKT uses 6 decimals
       }
       function mint(address to, uint256 amount) external {
           _mint(to, amount);
       }
   }
   ```
2. Update test file: `test/CronosPaymentChannel.test.ts`
3. Deploy MockAKT token in `beforeEach` hook
4. Mint test AKT to test accounts
5. Add approval step before all `openChannel()` calls: `await aktToken.connect(alice).approve(channel.target, amount)`
6. Replace all `ethers.provider.getBalance()` with `aktToken.balanceOf()`
7. Replace all `ethers.parseEther()` with `ethers.parseUnits(amount, 6)` (6 decimals for AKT)
8. Add new test: "should revert if insufficient approval"
9. Add new test: "should revert if insufficient token balance"
10. All existing tests pass with ERC-20 modifications
11. Test coverage >90%

**Estimated Effort:** 1.5 hours

**Reference:** `docs/research/cronos-akt-deployment/findings/contract-modifications.md` (Testing section)

---

### Story 3.3: Configure Hardhat for Cronos and Create Deployment Scripts

**As a** developer,
**I want** Hardhat configured for Cronos deployment with proper scripts,
**so that** I can deploy to testnet and mainnet.

**Acceptance Criteria:**
1. Update `hardhat.config.ts`:
   ```typescript
   networks: {
     "cronos-testnet": {
       url: "https://evm-t3.cronos.org:8545/",
       accounts: [process.env.PRIVATE_KEY!],
       chainId: 338,
     },
     "cronos-mainnet": {
       url: "https://evm.cronos.org",
       accounts: [process.env.PRIVATE_KEY!],
       chainId: 25,
     }
   }
   ```
2. Add CronoScan verification config:
   ```typescript
   etherscan: {
     apiKey: {
       "cronos-testnet": process.env.CRONOSCAN_API_KEY,
       "cronos-mainnet": process.env.CRONOSCAN_API_KEY,
     },
     customChains: [/* Cronos testnet/mainnet config */]
   }
   ```
3. Create deployment script: `scripts/deploy-cronos-testnet.ts`
   - Deploy MockAKT token
   - Deploy CronosPaymentChannel with MockAKT address
   - Mint test AKT to deployer
   - Log all addresses
4. Create deployment script: `scripts/deploy-cronos-mainnet.ts`
   - Use real AKT address: `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`
   - Deploy CronosPaymentChannel only
5. Update `.env.example` with Cronos variables
6. Local compilation succeeds: `npx hardhat compile`
7. Documentation: Deployment instructions in README

**Estimated Effort:** 0.5 hours

**Reference:** `docs/research/cronos-akt-deployment/findings/deployment-guide.md`

---

### Story 3.4: Deploy to Cronos Testnet and Verify

**As a** developer,
**I want** CronosPaymentChannel deployed and verified on Cronos testnet,
**so that** I can test with real blockchain before mainnet.

**Acceptance Criteria:**
1. MetaMask configured with Cronos testnet (chainId 338)
2. Test CRO obtained from faucet: https://cronos.org/faucet
3. Deploy MockAKT and CronosPaymentChannel to testnet:
   ```bash
   npx hardhat run scripts/deploy-cronos-testnet.ts --network cronos-testnet
   ```
4. Contracts verified on CronoScan:
   ```bash
   npx hardhat verify --network cronos-testnet <MOCK_AKT_ADDRESS>
   npx hardhat verify --network cronos-testnet <CHANNEL_ADDRESS> <MOCK_AKT_ADDRESS>
   ```
5. Verification shows green checkmark on https://testnet.cronoscan.com
6. Test channel lifecycle:
   - Mint AKT to test account
   - Approve channel contract
   - Open channel
   - Verify channel state with `getChannel()`
   - Close channel (or let expire)
   - Verify final balances
7. Gas costs measured and documented
8. Contract addresses documented in project README
9. Screenshots of successful transactions saved

**Estimated Effort:** 1.0 hour

**Reference:** `docs/research/cronos-akt-deployment/findings/deployment-guide.md` (Step 6-8)

---

### Story 3.5: Create Dassie Cronos Settlement Module

**As a** developer,
**I want** a Dassie settlement module for Cronos payment channels,
**so that** ILP payments can settle via AKT on Cronos.

**Acceptance Criteria:**
1. Create module: `packages/app-dassie/src/settlement/cronos/cronos-settlement.ts`
2. Reuse structure from Base L2 settlement module (Story 2.6)
3. Configuration:
   ```typescript
   interface CronosSettlementConfig {
     rpcUrl: string;  // Cronos RPC
     chainId: number;  // 25 for mainnet, 338 for testnet
     channelContractAddress: string;
     aktTokenAddress: string;
     privateKey: string;
   }
   ```
4. Implement methods:
   - `openChannel(recipient, amount, expiration) -> channelId`
   - `closeChannel(channelId, finalClaim) -> txHash`
   - `getChannelBalance(channelId) -> balance`
   - `isChannelOpen(channelId) -> boolean`
5. Handle ERC-20 approval flow:
   - Check current allowance
   - Approve if insufficient
   - Execute channel open
6. Error handling: insufficient AKT, approval failures, gas estimation
7. Integration test with testnet contract
8. Unit tests with mocked ethers.js provider
9. Documentation: How to configure Cronos settlement

**Estimated Effort:** 1.5 hours

**Reference:** Similar to Story 2.6 (Base L2 settlement), adapted for Cronos

---

### Story 3.7: Deploy to Cronos Mainnet (Production)

**As a** developer,
**I want** CronosPaymentChannel deployed to Cronos mainnet,
**so that** users can open payment channels with real AKT.

**Acceptance Criteria:**
1. Pre-deployment checklist completed:
   - [ ] Contract audited or peer-reviewed
   - [ ] Full test coverage (>90%)
   - [ ] Testnet testing complete (multiple channels tested)
   - [ ] Gas costs validated (<$0.01 per channel)
   - [ ] Real AKT token address confirmed: `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`
   - [ ] Sufficient CRO for deployment gas (>10 CRO)
   - [ ] Private key backed up securely
   - [ ] Monitoring/alerting configured
2. Deploy to mainnet:
   ```bash
   npx hardhat run scripts/deploy-cronos-mainnet.ts --network cronos-mainnet
   ```
3. Verify contract on CronoScan:
   ```bash
   npx hardhat verify --network cronos-mainnet <ADDRESS> 0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3
   ```
4. Test with small amount of real AKT:
   - Open channel with 1 AKT
   - Verify channel state
   - Close channel
   - Verify refund received
5. Update production config:
   - Nostream relay: Cronos mainnet RPC URL
   - Dassie settlement: CronosPaymentChannel address
6. Document mainnet addresses:
   - CronosPaymentChannel: `<deployed_address>`
   - AKT Token: `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`
7. Announce deployment:
   - Update project README
   - Notify team/users
   - Post to Nostr relays

**Estimated Effort:** 0.5 hours

**Reference:** `docs/research/cronos-akt-deployment/findings/deployment-guide.md` (Step 9)

---

### Epic Summary

**Effort Estimate:**

| Story | Description | Effort |
|-------|-------------|--------|
| 3.1 | Modify BasePaymentChannel for ERC-20 AKT | 1.0 hour |
| 3.2 | Create MockAKT and update tests | 1.5 hours |
| 3.3 | Configure Hardhat and deployment scripts | 0.5 hours |
| 3.4 | Deploy to Cronos testnet | 1.0 hour |
| 3.5 | Create Dassie Cronos settlement module | 1.5 hours |
| 3.7 | Deploy to Cronos mainnet | 0.5 hours |
| **Total** | | **6.0 hours** |

**Timeline:** 1 week (with testing and review)
**Cost:** ~$900 @ $150/hour

---

### Success Metrics

- ✅ Contract deployed to Cronos mainnet
- ✅ Gas cost per channel <$0.01
- ✅ Code reuse >90% from Base L2 contract
- ✅ Time to production <2 weeks
- ✅ Zero security incidents

---

### References

**Research Documentation:**
- `docs/research/cronos-akt-deployment/` - Complete research findings on Cronos deployment

**Related Epics:**
- Epic 2: Dassie payment integration (Base L2 settlement module serves as template for Story 3.5)

**External Resources:**
- Cronos Documentation: https://docs.cronos.org
- IBC Bridge: https://cronos.org/bridge
- CronoScan: https://cronoscan.com
- AKT Token Address (Cronos mainnet): `0x39a65A74Dc5A778Ff93d1765Ea51F57BC49c81B3`

---

## Epic 4: Economic Monitoring & Self-Sustainability

**Goal:** Build revenue/expense tracking, profitability monitoring, and automatic Akash payment system to achieve relay self-sustainability. This epic proves the core value proposition: the relay pays for itself.

### Story 4.1: Create Economic Monitor Service in Nostream

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

### Story 4.2: Implement Automatic Currency Conversion to AKT

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

### Story 4.3: Integrate with Akash Provider Billing

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

### Story 4.4: Implement Automatic Akash Escrow Deposit

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

### Story 4.5: Create Profitability Dashboard

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

### Story 4.6: Add Economic Alerts

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

### Story 4.7: Implement 30-Day Self-Sustainability Simulation

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

## Epic 5: Akash Deployment & SDL

**Goal:** Containerize both applications (Nostream + Dassie), create Akash SDL for 2-service deployment, deploy to Akash mainnet, and validate real-world hosting costs. This epic proves the system runs on decentralized infrastructure at sustainable cost.

### Story 5.1: Create Nostream Dockerfile

**As a** developer,
**I want** a production Dockerfile for Nostream,
**so that** it can be deployed to Akash.

**Acceptance Criteria:**
1. Dockerfile created: `Dockerfile` in nostream-ilp repo
2. Multi-stage build: Build stage + production stage
3. Build stage: Compiles TypeScript, runs `npm run build`
4. Production stage: Node.js 22 slim, production dependencies only
5. PostgreSQL and Redis run as embedded services OR as sidecars (decide)
6. Non-root user for security
7. Health check: `HEALTHCHECK CMD curl -f http://localhost:7777/health || exit 1`
8. Image size < 500MB
9. Container starts: `docker run -p 7777:7777 nostream-ilp`
10. Automated build via GitHub Actions

### Story 5.2: Create Dassie Dockerfile

**As a** developer,
**I want** a production Dockerfile for Dassie,
**so that** it can be deployed to Akash.

**Acceptance Criteria:**
1. Dockerfile created: `Dockerfile` in Dassie repo (or use existing if available)
2. Multi-stage build (TypeScript compilation)
3. Production stage: Node.js 22 slim
4. SQLite support (better-sqlite3 compiles in container)
5. Non-root user
6. Health check: `HEALTHCHECK CMD curl -f http://localhost:7768/health || exit 1`
7. Image size < 300MB
8. Container starts: `docker run -p 7768:7768 -p 443:443 dassie-node`

### Story 5.3: Create Akash SDL with 2-Service Configuration

**As a** developer,
**I want** an Akash SDL deploying both Nostream and Dassie,
**so that** the complete system runs on Akash.

**Acceptance Criteria:**
1. SDL file created: `deploy/akash/deploy.yaml`
2. Defines 2 services: nostream, dassie (see Technical Assumptions for full SDL)
3. Services communicate via localhost (both in same deployment group)
4. Nostream exposed on port 80 (global)
5. Dassie ILP connector exposed on port 443 (global)
6. Dassie API port 7768 internal only (not exposed globally)
7. Resource profiles: 0.5 CPU, 1-1.5Gi RAM, 20-50Gi storage per service
8. Pricing: ~500 uakt total (~$2.50-5/month target)
9. Persistent storage attributes configured
10. SDL validates: `akash deployment validate deploy.yaml`

### Story 5.4: Create Docker Compose for Local Testing

**As a** developer,
**I want** Docker Compose configuration simulating Akash deployment,
**so that** I can test locally before deploying.

**Acceptance Criteria:**
1. `docker-compose.yml` created in project root
2. Defines same 2 services as Akash SDL
3. Uses localhost networking (simulates Akash)
4. Persistent volumes for databases
5. Environment variables from `.env.example`
6. `docker compose up` starts both services
7. Health checks pass for both containers
8. Nostream and Dassie communicate successfully
9. Can test full payment flow locally

### Story 5.5: Deploy to Akash Testnet

**As a** developer,
**I want** to deploy to Akash testnet,
**so that** I can validate SDL and deployment process.

**Acceptance Criteria:**
1. Docker images built and pushed to registry (GHCR or Docker Hub)
2. Akash wallet created with testnet AKT
3. SDL deployed via Akash CLI or Console
4. Deployment succeeds, both containers start
5. Health checks accessible from internet
6. Nostr client can connect to relay's WebSocket URL
7. Dassie ILP node peerable from external ILP nodes
8. Deployment runs stable for 48 hours
9. Documentation: `docs/deployment/akash-testnet.md`

### Story 5.6: Deploy to Akash Mainnet

**As a** developer,
**I want** to deploy to Akash mainnet,
**so that** I can validate real-world costs and sustainability.

**Acceptance Criteria:**
1. Production images built with mainnet configurations
2. SDL updated for mainnet (production URLs, mainnet RPC endpoints)
3. Akash wallet funded with AKT for deployment (~100 AKT for 3-month buffer)
4. Deployment created on Akash mainnet
5. Provider selected (cheapest with good reputation)
6. Both containers accessible via public URLs
7. DNS configured (optional): nostr.example.com, ilp.example.com
8. Deployment stable for 7 days
9. **Actual costs measured**: Document real Akash charges per day/week
10. Documentation: `docs/deployment/akash-mainnet.md`

### Story 5.7: Implement Akash Cost Monitoring

**As a** developer,
**I want** automatic tracking of Akash hosting costs,
**so that** economic monitor has accurate expense data.

**Acceptance Criteria:**
1. Economic monitor queries Akash for current costs (if API available)
2. If no API, uses configured estimate: `AKASH_DAILY_COST_AKT`
3. After mainnet deployment, update estimate based on real costs
4. Costs stored in economic_snapshots table
5. Dashboard shows: Estimated vs. actual costs (if available)
6. Integration test with Akash provider (mock or real)

### Story 5.8: Create Deployment Automation Script

**As an** operator,
**I want** a script automating deployment to Akash,
**so that** I can deploy easily.

**Acceptance Criteria:**
1. Script created: `scripts/deploy-to-akash.sh`
2. Automates:
   - Build Docker images
   - Push to registry
   - Generate SDL from template
   - Deploy to Akash via CLI
3. Arguments: `--network testnet|mainnet`, `--profile small|medium`
4. Validates prerequisites (Docker, Akash CLI, funded wallet)
5. Outputs deployment URL and lease ID
6. Error handling with clear messages
7. Documentation: `docs/deployment/automated-deployment.md`

---

## Epic 6: Arweave Permanent Storage Integration

**Goal:** Integrate Arweave permanent storage for large content and event backups, implementing hot/cold storage tiers with bundled ILP+Arweave pricing. This epic reduces long-term storage costs and provides permanent data preservation.

### Story 6.1: Set Up Arweave Wallet Management

**As a** developer,
**I want** Arweave wallet integration in Nostream,
**so that** the relay can upload data to Arweave network.

**Acceptance Criteria:**
1. Install arweave-js package: `npm install arweave`
2. Create wallet manager: `src/integrations/arweave-wallet.ts`
3. Load wallet from JWK file (environment variable: `ARWEAVE_WALLET_PATH`)
4. Initialize Arweave client:
   ```typescript
   import Arweave from 'arweave';

   const arweave = Arweave.init({
     host: 'arweave.net',
     port: 443,
     protocol: 'https'
   });
   ```
5. Implement methods:
   - `getBalance() -> Promise<string>` - Query wallet AR balance
   - `uploadData(data, contentType, tags) -> Promise<string>` - Upload and return tx_id
6. Add Arweave tags: App-Name, App-Version, Nostr-specific tags
7. Unit tests with mocked Arweave API
8. Integration test with Arweave testnet (upload small test file)

### Story 6.2: Implement Bundled Pricing Calculator

**As a** developer,
**I want** pricing that bundles relay fees + Arweave storage costs,
**so that** users pay once for both services.

**Acceptance Criteria:**
1. Pricing module: `src/services/bundled-pricing.ts`
2. Configuration:
   ```yaml
   arweave:
     storage_cost_per_mb_msats: 5000  # Fixed cost operator sets (includes AR purchase + margin)
   payments:
     fee_schedules:
       per_kind:
         default: 100  # msats relay fee
         30023: 500    # Long-form content
         1063: 1000    # File metadata
         71: 2000      # Video
   ```
3. Cost calculation function (all costs in msats):
   ```typescript
   interface EventCost {
     relayFee: number;        // msats - relay processing fee
     arweaveCost: number;     // msats - Arweave storage cost
     sizeFee: number;         // msats - additional fee for large content
     total: number;           // msats - total payment required
   }

   calculateBundledCost(kind: number, contentSize: number): EventCost
   ```
4. Per-kind multipliers applied to relay fee
5. Size-based fees (free first 1MB, then `storage_cost_per_mb_msats` per MB)
6. Returns cost breakdown for transparency (all in msats)
7. **Note**: Client responsibility to show USD/AR equivalents using their own price feeds
8. Operator manually updates `storage_cost_per_mb_msats` based on current AR market prices
9. Unit tests validate calculations
10. Documentation explains pricing model and operator cost-setting process

### Story 6.3: Add Arweave Reference Tags to Nostr Events

**As a** developer,
**I want** Nostr events to reference Arweave transaction IDs,
**so that** large content can be retrieved from permanent storage.

**Acceptance Criteria:**
1. Define tag format for Arweave references:
   ```json
   {
     "tags": [
       ["arweave", "tx_id_43_characters"],
       ["arweave-size", "1024576"],
       ["arweave-url", "https://arweave.net/tx_id"],
       ["content-type", "text/markdown"]
     ],
     "content": ""
   }
   ```
2. For kind 1063 (file metadata), use `url` tag: `["url", "ar://tx_id"]`
3. Event validator accepts empty content if arweave tag present
4. Document supported event kinds for Arweave storage:
   - Kind 30023: Long-form content
   - Kind 1063: File metadata
   - Kind 71, 22: Video events
   - Kind 20: Pictures
5. Client helper documentation for creating Arweave-backed events
6. Unit tests validate tag format

### Story 6.4: Implement Upload Endpoint with Payment Verification

**As a** developer,
**I want** HTTP endpoint for uploading content to Arweave with ILP payment,
**so that** clients can store large content permanently.

**Acceptance Criteria:**
1. REST endpoint: `POST /api/arweave/upload`
2. Request body:
   ```json
   {
     "content": "base64_encoded_content",
     "kind": 30023,
     "tags": [["title", "My Article"]],
     "pubkey": "user_pubkey"
   }
   ```
3. Flow:
   - Calculate bundled cost (relay + Arweave)
   - Create ILP payment quote via Dassie RPC
   - Return quote to client with breakdown
   - Wait for payment confirmation (WebSocket or polling)
   - Upload to Arweave
   - Return tx_id to client
4. Quote endpoint: `POST /api/arweave/upload/quote`
5. Payment timeout: 5 minutes
6. Error handling: Payment timeout, Arweave upload failure, insufficient payment
7. Integration test: Full upload flow with payment

### Story 6.5: Implement Automatic Daily Backup to Arweave

**As a** developer,
**I want** automatic daily backups of all events to Arweave,
**so that** relay data is preserved permanently.

**Acceptance Criteria:**
1. Backup service: `src/services/arweave-backup.ts`
2. Runs daily (configurable schedule)
3. Query events from previous day (created_at range)
4. Bundle events as NDJSON (newline-delimited JSON)
5. Compress with gzip
6. Upload to Arweave with tags:
   ```typescript
   [
     { name: 'Backup-Type', value: 'nostr-events' },
     { name: 'Relay-Name', value: process.env.RELAY_NAME },
     { name: 'Event-Count', value: count.toString() },
     { name: 'Date-Range', value: 'YYYY-MM-DD to YYYY-MM-DD' }
   ]
   ```
7. Store backup reference in database:
   ```sql
   CREATE TABLE arweave_backups (
     tx_id VARCHAR(43) PRIMARY KEY,
     event_count INTEGER,
     start_date TIMESTAMPTZ,
     end_date TIMESTAMPTZ,
     created_at TIMESTAMPTZ
   );
   ```
8. Alert if backup fails
9. Integration test with Arweave testnet

### Story 6.6: Implement Hot/Cold Storage Tier Management

**As a** developer,
**I want** automatic archival of old events from PostgreSQL,
**so that** relay storage costs are minimized.

**Acceptance Criteria:**
1. Configuration: `ARWEAVE_HOT_STORAGE_DAYS` (default: 90)
2. Daily cleanup job:
   - Query events older than 90 days
   - Verify events exist in Arweave backup (check arweave_backups table)
   - Delete from PostgreSQL (keep only event ID + arweave reference)
   - Log archival count
3. Stub record remains in database:
   ```sql
   -- Original event deleted, stub inserted
   INSERT INTO archived_events (id, created_at, arweave_backup_tx)
   VALUES ('event_id', timestamp, 'backup_tx_id');
   ```
4. REQ handler checks archived_events table
5. If archived event requested, return with `arweave` tag pointing to backup
6. Dashboard shows: Hot storage size, archived event count, storage savings
7. Integration test validates archival and retrieval

### Story 6.7: Add Arweave Configuration and Monitoring

**As an** operator,
**I want** Arweave wallet balance monitoring and alerts,
**so that** I'm warned before uploads fail due to insufficient AR.

**Acceptance Criteria:**
1. Configuration in `.nostr/settings.yaml`:
   ```yaml
   arweave:
     enabled: true
     wallet_path: /path/to/arweave-keyfile.json
     min_balance_ar: 1.0
     required_kinds: [30023, 1063, 71, 22, 20]
     backup:
       enabled: true
       frequency: daily
       retention_days: 90
   ```
2. Balance monitoring (hourly check):
   - Query wallet balance
   - Alert if < `min_balance_ar`
   - Log balance to economic_snapshots
3. Dashboard displays:
   - Current AR balance
   - Estimated days remaining (based on upload rate)
   - Total data uploaded to Arweave
   - Backup status (last backup time, event count)
4. Alerts: Low balance, backup failures, upload errors
5. Integration test validates monitoring

### Story 6.8: Implement Backup Restoration Process

**As an** operator,
**I want** to restore events from Arweave backups,
**so that** I can recover relay data after catastrophic failure or migrate to new infrastructure.

**Acceptance Criteria:**
1. Restoration script created: `scripts/restore-from-arweave.ts`
2. Command-line interface:
   ```bash
   # Restore specific backup
   npm run restore -- --tx-id <arweave_tx_id>

   # Restore date range
   npm run restore -- --start-date 2024-01-01 --end-date 2024-01-31

   # List available backups
   npm run restore -- --list
   ```
3. Restoration flow:
   - Query arweave_backups table for available backups (or fetch from Arweave by date tags)
   - Download backup from Arweave: GET `https://arweave.net/<tx_id>`
   - Decompress gzip data
   - Parse NDJSON (newline-delimited JSON events)
   - Validate each event signature
   - Check for duplicates (skip if event ID already exists)
   - Insert events into PostgreSQL
   - Report: Events restored, duplicates skipped, errors encountered
4. Progress indicator for large backups (show % complete)
5. Dry-run mode: `--dry-run` flag validates backup without importing
6. Conflict resolution:
   - Skip existing events by default
   - `--overwrite` flag to replace existing events
   - `--merge` flag to preserve newer version (by created_at)
7. Rollback capability: Transaction-based import (all or nothing per backup file)
8. Logging: All restoration operations logged with timestamp, tx_id, event count
9. Error handling:
   - Invalid backup format → abort with clear error
   - Network failure downloading from Arweave → retry 3 times
   - Database connection failure → abort, no partial restore
10. Integration test:
    - Create backup via Story 6.5
    - Clear events from database
    - Restore from Arweave backup
    - Verify all events restored correctly
    - Verify duplicate detection works

---

## Epic 7: ILP Connector Revenue Optimization

**Goal:** Configure Dassie as ILP connector, establish peer relationships, route payments, and earn routing fees to supplement user payment revenue. This epic makes the relay economically stronger by diversifying revenue beyond Nostr users.

### Story 7.1: Configure Dassie as Public ILP Connector

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

### Story 7.2: Implement Routing Fee Configuration

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

### Story 7.3: Establish Peering with Liquidity Providers

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

### Story 7.4: Verify Routing Statistics RPC

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

### Story 7.5: Add Routing Revenue to Dashboard

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

### Story 7.6: Optimize Liquidity Distribution

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

## Success Metrics

### Primary Metrics (MVP - 12-16 Weeks)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Self-sustainability** | Revenue ≥ 110% of expenses | Daily economic snapshot shows profit |
| **Nostr compatibility** | Standard clients work | Test with Damus, Amethyst, Snort, Gossip |
| **Multi-blockchain** | 4 currencies (BTC, BASE, AKT, XRP) | Payment channels active on all 4 testnets |
| **Payment verification** | < 10ms | P99 for Nostream → Dassie RPC → verify → response |
| **Akash deployment** | 30+ days uptime | Relay runs on Akash mainnet > 99% availability |
| **Inter-process** | < 0.1% RPC failures | Nostream ↔ Dassie WebSocket RPC reliability |

### Secondary Metrics (Production - 6 Months)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **User adoption** | 500+ active users | Unique pubkeys publishing events |
| **Event throughput** | 100+ events/second | Nostream capacity under load |
| **Routing revenue** | > 20% of total | Dassie routing fees / total revenue |
| **Economic margin** | Revenue > 150% of expenses | Profit margin |
| **Cost efficiency** | Akash hosting < $8/month | Actual provider charges |

---

## Timeline Estimate

| Epic | Estimated Duration | Dependencies |
|------|-------------------|--------------|
| Epic 1: Nostream Fork & ILP Integration | 3 weeks | None |
| Epic 2: Multi-Blockchain Settlement + RPC APIs | 5 weeks | Epic 1 (for RPC testing) |
| Epic 3: CosmWasm Payment Channels | 3 weeks | None (parallel with Epic 1-2) |
| Epic 4: Economic Monitoring | 3 weeks | Epic 2 (needs settlements working) |
| Epic 5: Akash Deployment | 2 weeks | Epic 1 (needs containers) |
| Epic 6: Arweave Storage Integration | 2 weeks | Epic 1 (needs Nostream fork) |
| Epic 7: ILP Connector Optimization | 2 weeks | Epic 2 (needs settlements working) |

**Total Duration: 14-18 weeks** (3.5-4.5 months with parallelization)

**Parallelization:**
- Epic 1, 3, 5 can start simultaneously (independent work)
- Epic 2, 4, 6, 7 must follow Epic 1 (need integration points)
- Epic 6 (Arweave) can run in parallel with Epic 4 (Economic Monitor)

**Critical path**: Epic 1 → Epic 2 → Epic 4 → Validation

**Optimistic (3 developers)**: 14 weeks
**Realistic (1-2 developers)**: 18 weeks

---

## Risk Assessment & Mitigation

### Top Risks

**Risk 1: Nostream + Dassie integration complexity**
- **Likelihood**: Medium
- **Impact**: Medium (HTTP API between processes may have issues)
- **Mitigation**:
  - Build robust API client with retries and error handling
  - Extensive integration testing
  - Fallback: Merge into single process if API approach fails (2-3 week effort)

**Risk 2: ILP connector liquidity providers don't exist**
- **Likelihood**: Medium-High
- **Impact**: High (can't convert BTC → AKT without connectors)
- **Mitigation**:
  - Run own ILP connectors providing liquidity (become market maker)
  - Partner with existing ILP networks (if available)
  - Fallback: Accept AKT directly only (simplify to single currency)

**Risk 3: Akash costs higher than estimated**
- **Likelihood**: Low
- **Impact**: High (relay not profitable)
- **Mitigation**:
  - Measure actual costs in Week 11-12 (Phase 3)
  - Adjust pricing model if needed (increase per-event cost)
  - Optimize: Compress data, cache aggressively, reduce storage
  - Deploy to cheaper providers on Akash marketplace

**Risk 4: CosmWasm contract security vulnerability**
- **Likelihood**: Low
- **Impact**: Critical (funds at risk)
- **Mitigation**:
  - Security audit before mainnet (paid audit or community review)
  - Extensive testing on testnet (weeks of testing)
  - Low initial limits (100 AKT max per channel)
  - Bug bounty program

**Risk 5: Insufficient user adoption (< 500 users)**
- **Likelihood**: Medium
- **Impact**: High (relay not profitable without users)
- **Mitigation**:
  - Market to Nostr community (sustainability message resonates)
  - Competitive pricing (cheaper than alternatives)
  - Excellent performance (Nostream is fast)
  - Free tier (first 100 events free per user)
  - Operator willing to subsidize initially (~$5-10/month)

---

## Success Criteria (MVP Complete When...)

✅ **Both containers run on Akash mainnet** for 30 consecutive days
✅ **Relay accepts payments in 4 currencies** (BTC, BASE, AKT, XRP all working on testnets)
✅ **Standard Nostr clients connect** (tested with Damus, Amethyst, Snort)
✅ **Relay stores 10,000+ events** from real or simulated users
✅ **Relay is profitable**: Revenue > 110% of Akash costs (measured over 30 days)
✅ **Automatic Akash payment works**: Relay pays provider without operator intervention
✅ **Dashboard shows positive P&L**: Economic metrics clearly demonstrate sustainability
✅ **Routing fees contribute**: > 10% of total revenue comes from ILP connector activity

**Optional (Stretch Goals):**
🎯 500+ real Nostr users publishing events
🎯 Relay routes 10,000+ ILP payments from external nodes
🎯 Break-even in < 14 days (50% faster than 30-day target)

---

## Next Steps

### For Architect:
Create architecture document specifying:
1. Nostream ↔ Dassie HTTP API contract (detailed endpoint specs)
2. Payment claim verification flow (sequence diagrams)
3. Economic monitor state machine (when to convert, when to pay Akash)
4. CosmWasm contract architecture (detailed state management)
5. Deployment architecture on Akash (networking, storage, security)

### For Implementation:
Ready to start Epic 1 after architecture approval:
1. Fork Nostream → Remove centralized payments
2. Fork/clone Dassie → Add API endpoints
3. Create CosmWasm contract → Basic payment channels
4. Target: Working integration (Nostr + ILP) in Week 3-4

### For Business/Marketing:
- Validate economic model with Nostr community
- Identify potential early adopter relay operators
- Create go-to-market strategy (post-MVP)

---

**End of PRD**

This is a greenfield project combining **Nostream** (proven Nostr relay) + **Dassie** (proven ILP implementation) + **Akash** (decentralized hosting) to create the world's first **self-sustaining, cross-ledger micropayment-enabled Nostr relay**.
