# Source Tree Structure

## Nostream-ILP Repository Layout

```
nostream-ilp/
├── src/
│   ├── handlers/                    # Nostr message handlers
│   │   ├── event-handler.ts         # EVENT message processing
│   │   ├── req-handler.ts           # REQ subscription handling
│   │   ├── close-handler.ts         # CLOSE subscription cleanup
│   │   └── auth-handler.ts          # AUTH authentication
│   ├── services/
│   │   ├── payment/
│   │   │   ├── dassie-client.ts     # tRPC client for Dassie RPC
│   │   │   ├── payment-verifier.ts  # Payment claim verification logic
│   │   │   ├── channel-tracker.ts   # Payment channel state sync
│   │   │   └── pricing.ts           # Event kind pricing calculator
│   │   ├── arweave/
│   │   │   ├── wallet-manager.ts    # Arweave wallet operations
│   │   │   ├── upload-service.ts    # Large content upload to Arweave
│   │   │   ├── backup-service.ts    # Daily event backup scheduler
│   │   │   └── retrieval-service.ts # Fetch archived events
│   │   ├── economic-monitor/
│   │   │   ├── monitor.ts           # Main economic monitor service
│   │   │   ├── profitability.ts     # Profit/loss tracking
│   │   │   ├── akash-payment.ts     # Automated Akash bill payment
│   │   │   └── exchange-rate.ts     # Currency conversion oracle
│   │   └── nostr/
│   │       ├── event-repository.ts  # PostgreSQL event storage
│   │       ├── subscription-manager.ts # WebSocket subscription tracking
│   │       └── nip-validators.ts    # NIP compliance validation
│   ├── repositories/
│   │   ├── event.repository.ts      # Event CRUD operations
│   │   ├── payment.repository.ts    # Payment claim storage
│   │   ├── economic.repository.ts   # EconomicSnapshot storage
│   │   └── arweave.repository.ts    # ArweaveBackup metadata
│   ├── database/
│   │   ├── migrations/              # SQL migration scripts
│   │   │   ├── 001_base_nostream.sql
│   │   │   ├── 002_add_payment_tracking.sql
│   │   │   ├── 003_add_economic_snapshots.sql
│   │   │   └── 004_add_arweave_backups.sql
│   │   └── schema.sql               # Full schema definition
│   ├── dashboard/                   # Operator dashboard (minimal UI)
│   │   ├── routes/
│   │   │   ├── metrics.ts           # GET /dashboard/metrics API
│   │   │   ├── payments.ts          # GET /dashboard/payments API
│   │   │   └── health.ts            # GET /dashboard/health API
│   │   ├── static/
│   │   │   ├── index.html           # Dashboard HTML (vanilla JS)
│   │   │   ├── styles.css           # Minimal styling
│   │   │   └── app.js               # Dashboard client logic
│   │   └── dashboard-server.ts      # Fastify plugin for dashboard
│   ├── config/
│   │   ├── settings.ts              # Configuration loader
│   │   ├── constants.ts             # Global constants (pricing tiers, etc.)
│   │   └── logger.ts                # Pino logger configuration
│   ├── utils/
│   │   ├── crypto.ts                # Nostr signature verification
│   │   ├── conversions.ts           # Currency conversion helpers
│   │   └── errors.ts                # Custom error classes
│   └── server.ts                    # Main server entry point
├── test/
│   ├── unit/
│   │   ├── handlers/
│   │   ├── services/
│   │   └── repositories/
│   ├── integration/
│   │   ├── payment-flow.test.ts     # End-to-end payment verification
│   │   ├── arweave-upload.test.ts   # Arweave integration tests
│   │   └── dassie-rpc.test.ts       # tRPC client tests
│   └── fixtures/
│       ├── events.json              # Sample Nostr events
│       └── payment-claims.json      # Sample payment claims
├── .nostr/
│   └── settings.yaml                # Relay configuration (NIP-11, payments, Arweave)
├── docker/
│   ├── Dockerfile.nostream          # Multi-stage build for Nostream
│   ├── Dockerfile.dashboard         # Combined Nostream + Dashboard
│   └── docker-compose.yml           # Local development stack
├── akash/
│   └── deploy.yaml                  # Akash SDL deployment manifest
├── package.json
├── tsconfig.json
└── README.md
```

## Dassie-Relay Repository Layout (Fork or Upstream)

If forking Dassie, key additions:

```
dassie/
├── packages/
│   ├── app-dassie/                  # Core Dassie application
│   │   └── src/
│   │       ├── backend/
│   │       │   ├── settlement/
│   │       │   │   ├── base-settlement.ts      # NEW: Base L2 settlement module
│   │       │   │   ├── cosmos-settlement.ts    # NEW: Cosmos/Akash settlement
│   │       │   │   └── xrp-settlement.ts       # NEW: XRP settlement (if missing)
│   │       │   └── rpc/
│   │       │       └── payment-router.ts       # NEW: Custom RPC endpoints for Nostream
│   │       └── frontend/            # Dassie GUI (not used by relay)
│   ├── lib-reactive/                # Reactive programming primitives
│   └── lib-sqlite/                  # SQLite ledger abstraction
├── docker/
│   └── Dockerfile.dassie            # Dassie container for Akash
└── README.md
```

## CosmWasm Payment Channels Repository

```
cosmos-payment-channels/
├── contracts/
│   └── payment-channel/
│       ├── src/
│       │   ├── contract.rs          # Entry points (instantiate, execute, query)
│       │   ├── state.rs             # Channel state storage
│       │   ├── msg.rs               # Message definitions
│       │   ├── error.rs             # Custom error types
│       │   └── lib.rs               # Library exports
│       ├── examples/
│       │   └── schema.rs            # JSON schema generation
│       └── Cargo.toml
├── scripts/
│   ├── deploy.sh                    # Deploy to Akash testnet
│   └── interact.sh                  # CLI for testing contract
└── README.md
```

## Key Files and Their Purposes

| File Path | Purpose | Key Interactions |
|-----------|---------|------------------|
| `src/handlers/event-handler.ts` | Processes incoming Nostr EVENT messages, extracts payment claims, verifies via Dassie RPC | Calls `payment-verifier.ts` → Dassie RPC → PostgreSQL |
| `src/services/payment/dassie-client.ts` | tRPC WebSocket client connecting to Dassie RPC server | Establishes WS to `ws://dassie:5000/trpc`, type-safe API |
| `src/services/payment/payment-verifier.ts` | Core payment verification logic: checks channel balance, nonce, signature | Called by `event-handler.ts` for every paid event |
| `src/services/economic-monitor/monitor.ts` | Background service that polls Dassie ledger for revenue, pays Akash bills | Runs every 1 hour, calls Dassie RPC, Akash provider API |
| `src/services/arweave/backup-service.ts` | Daily cron job that bundles events → Arweave, updates ArchivedEvent table | Scheduled at 02:00 UTC, queries PostgreSQL, calls Arweave SDK |
| `src/dashboard/static/index.html` | Operator dashboard showing revenue, profit, payment channels | Fetches `/dashboard/metrics` API every 10 seconds |
| `.nostr/settings.yaml` | Relay configuration: pricing per event kind, Arweave settings, Dassie RPC URL | Loaded at startup by `config/settings.ts` |
| `akash/deploy.yaml` | Akash SDL manifest defining 2 containers (Nostream + Dassie), persistent storage | Used by `akash deployment create` command |
| `dassie/packages/app-dassie/src/backend/settlement/cosmos-settlement.ts` | Settlement module for Cosmos/Akash: opens channels, verifies claims, closes channels | Implements `SettlementSchemeModule` interface |
| `cosmos-payment-channels/contracts/payment-channel/src/contract.rs` | CosmWasm smart contract with `open_channel`, `claim_payment`, `close_channel` entry points | Deployed on Akash chain, called by Cosmos settlement module |

---
