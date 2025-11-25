# Technical Assumptions

## Repository Structure: Dual-Repo Approach

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

## Service Architecture: Two-Process Deployment

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

## Payment Flow Architecture

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

## Inter-Process Communication: Dassie WebSocket RPC

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

## Akash Deployment Model

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

## Database & Persistence

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