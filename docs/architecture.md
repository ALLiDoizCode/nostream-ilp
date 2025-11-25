# Nostr-ILP Relay Architecture Document

## Introduction

This document outlines the overall project architecture for **Nostr-ILP Relay**, including backend systems, shared services, and non-UI specific concerns. Its primary goal is to serve as the guiding architectural blueprint for AI-driven development, ensuring consistency and adherence to chosen patterns and technologies.

**Relationship to Frontend Architecture:**
The project includes a minimal operator dashboard UI. Core technology stack choices documented herein (see "Tech Stack") are definitive for the entire project, including the dashboard frontend components.

### Starter Template or Existing Project

Based on the PRD Technical Assumptions, this project uses **two forked repositories**, not starter templates:

**Existing Codebases Being Extended:**

1. **Nostream Fork** (Primary Repository)
   - **Source:** https://github.com/cameri/nostream
   - **Language:** TypeScript
   - **Runtime:** Node.js 18+
   - **Stack:** Fastify (HTTP), PostgreSQL, Redis, WebSocket
   - **Modifications Required:**
     - Remove centralized payment processors (ZEBEDEE, Nodeless, etc.)
     - Add Dassie RPC client for payment verification
     - Add economic monitor service
     - Add operator dashboard
   - **Pre-configured Patterns:**
     - Event handler architecture for Nostr message types
     - Database repositories for event storage
     - WebSocket subscription management
     - NIP-11 relay information endpoint
   - **Limitations:**
     - Designed for Lightning-only payments (we're replacing with ILP)
     - PostgreSQL schema must be extended for economic tracking

2. **Dassie** (ILP Node - Use Upstream or Fork)
   - **Source:** https://github.com/justmoon/dassie
   - **Language:** TypeScript
   - **Monorepo:** pnpm workspaces
   - **Stack:** tRPC (RPC), SQLite, reactive signals
   - **Modifications Required:**
     - Add RPC token authentication for production deployment
     - Add new RPC endpoints (`payment.verifyPaymentClaim`, `payment.convertToAKT`, etc.)
     - Create settlement modules for Base L2, Cosmos, XRP (if not already present)
   - **Pre-configured Patterns:**
     - Reactive programming model (signals, actors, stores)
     - Internal ledger with double-entry accounting
     - Peer-to-peer discovery and routing
     - Settlement scheme plugin architecture
   - **Limitations:**
     - Settlement modules may need to be created for specific blockchains
     - RPC currently uses session cookies (adding token auth for server-to-server)

3. **CosmWasm Template** (New Smart Contract)
   - **Source:** https://github.com/CosmWasm/cw-template.git
   - **Language:** Rust
   - **Purpose:** Payment channel contract for Cosmos/Akash chain
   - **Pre-configured:**
     - Basic contract structure (entry points, state, messages)
     - Test framework (cw-multi-test)
     - Schema generation
   - **Build from Scratch:** Payment channel logic (open, claim, close)

**Repository Structure Decision:** Dual-repo approach (not monorepo)
- Repo 1: `nostream-ilp` (fork of Nostream)
- Repo 2: `dassie-relay` (fork or upstream)
- Repo 3: `cosmos-payment-channels` (new)

This allows pulling upstream updates independently while keeping clear separation of concerns.

### Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-11-25 | 0.1 | Initial architecture document created from PRD v0.3 | Claude (Architect) |

---

## High Level Architecture

### Technical Summary

The Nostr-ILP Relay is a **dual-process microservices architecture** deploying two specialized containers (Nostream relay + Dassie ILP node) on Akash Network. The system bridges decentralized social networking (Nostr) with cross-ledger micropayments (ILP), enabling a **self-sustaining relay** that accepts payments in multiple cryptocurrencies (BTC, BASE, AKT, XRP) and automatically pays for its own Akash hosting. Core architectural patterns include **event-driven messaging** (Nostr WebSocket), **RPC-based inter-process communication** (tRPC WebSocket), **plugin-based settlement modules** (multi-blockchain support), and **reactive state management** (Dassie signals). The system achieves the PRD goal of economic sustainability by earning revenue from both user micropayments and ILP routing fees, while Arweave permanent storage provides cost-efficient long-term data persistence.

### High Level Overview

**Architectural Style:** **Microservices with Shared Deployment**
- Two independent services (Nostream + Dassie) deployed as separate containers in a single Akash SDL
- Services communicate via localhost WebSocket RPC (tRPC)
- Each service maintains its own data store (PostgreSQL + Redis for Nostream, SQLite for Dassie)

**Repository Structure:** **Dual-Repo (from PRD)**
- Repo 1: `nostream-ilp` - Fork of Nostream with ILP integration
- Repo 2: `dassie-relay` - Fork or upstream Dassie with custom settlement modules
- Repo 3: `cosmos-payment-channels` - New CosmWasm contract

**Service Architecture:** **Two-Process Deployment (from PRD)**
- Container 1: Nostream relay + Economic monitor (combined process)
- Container 2: Dassie ILP node (standalone)
- Both deployed via single Akash SDL (~$2.50-5/month)

**Primary User Interaction Flow:**
1. Nostr client connects via WebSocket → Nostream relay
2. Client publishes EVENT with payment claim in tags
3. Nostream extracts claim → calls Dassie RPC → verifies payment off-chain
4. If valid → Nostream stores event in PostgreSQL + broadcasts to subscribers
5. Economic monitor tracks revenue → converts to AKT → pays Akash provider automatically

**Key Architectural Decisions:**

1. **Inter-Process Communication via WebSocket RPC (not HTTP REST)**
   - Rationale: Leverage Dassie's existing tRPC infrastructure, real-time subscriptions, type-safe API

2. **Off-Chain Payment Verification (not on-chain for every event)**
   - Rationale: Payment channels enable instant verification without blockchain latency or fees

3. **Economic Monitor Co-Located with Nostream**
   - Rationale: Reduces container count (2 vs 3), lower Akash cost, simpler deployment

4. **Arweave for Permanent Storage + Event Backups**
   - Rationale: One-time payment model more sustainable than recurring cloud storage, prevents data loss

5. **Multi-Blockchain Settlement via Plugin Modules**
   - Rationale: Accept payments in any currency, route via ILP connectors, settle natively per blockchain

### High Level Project Diagram

```mermaid
graph TB
    subgraph "Nostr Clients"
        Client1[Damus iOS]
        Client2[Amethyst Android]
        Client3[Snort Web]
    end

    subgraph "Akash Deployment"
        subgraph "Container 1: Nostream + Monitor"
            Nostream[Nostream Relay<br/>WebSocket Server]
            Monitor[Economic Monitor<br/>Background Service]
            PG[(PostgreSQL<br/>Events)]
            Redis[(Redis<br/>Cache)]
        end

        subgraph "Container 2: Dassie ILP"
            Dassie[Dassie Node<br/>ILP Connector]
            DassieDB[(SQLite<br/>Ledger)]
            Settlement[Settlement Modules<br/>BTC/BASE/AKT/XRP]
        end
    end

    subgraph "External Systems"
        Arweave[Arweave Network<br/>Permanent Storage]
        Lightning[Lightning Network<br/>BTC Channels]
        BaseL2[Base L2<br/>ETH Channels]
        CosmosChain[Cosmos/Akash<br/>CosmWasm Contract]
        XRP[XRP Ledger<br/>Payment Channels]
        ILPPeers[Other ILP Nodes<br/>Connector Network]
        AkashProvider[Akash Provider<br/>Hosting Billing]
    end

    Client1 -->|WebSocket| Nostream
    Client2 -->|WebSocket| Nostream
    Client3 -->|WebSocket| Nostream

    Nostream <-->|tRPC WS| Dassie
    Monitor <-->|tRPC WS| Dassie

    Nostream --> PG
    Nostream --> Redis
    Dassie --> DassieDB

    Nostream -->|Upload Large Content| Arweave
    Nostream -->|Daily Backups| Arweave

    Settlement -->|Settle BTC| Lightning
    Settlement -->|Settle ETH| BaseL2
    Settlement -->|Settle AKT| CosmosChain
    Settlement -->|Settle XRP| XRP

    Dassie <-->|Route Payments| ILPPeers
    Monitor -->|Pay for Hosting| AkashProvider

    style Nostream fill:#4A90E2
    style Dassie fill:#50C878
    style Monitor fill:#FFB347
    style Arweave fill:#9370DB
```

### Architectural and Design Patterns

**1. Event-Driven Architecture**
- Nostr protocol is fundamentally event-driven (EVENT, REQ, CLOSE messages)
- Nostream uses event handlers for each message type
- Dassie uses reactive signals for state changes
- _Rationale:_ Native to both Nostr and Dassie, enables real-time subscriptions, scalable WebSocket model

**2. Repository Pattern (Data Access)**
- Nostream abstracts database access via repositories (`EventRepository`, `SubscriptionRepository`)
- Dassie uses reactive stores for ledger access
- _Rationale:_ Testability (mock repositories), future database migration flexibility, clear separation of data logic from business logic

**3. Plugin Architecture (Settlement Modules)**
- Dassie's `SettlementSchemeModule` interface allows blockchain-agnostic settlement
- Each blockchain (BTC, BASE, AKT, XRP) implements the same interface
- _Rationale:_ Extensibility (add new chains without core changes), modularity (test each independently), aligns with PRD's multi-blockchain requirement

**4. Reactive Programming (Dassie)**
- Dassie uses signals, actors, and computed values for state management
- Real-time balance updates via RPC subscriptions (`subscribeBalance`, `subscribeToLedgerAccount`)
- _Rationale:_ Efficient real-time updates, reduces polling, memory-efficient state propagation

**5. RPC for Inter-Process Communication**
- Nostream → Dassie communication via tRPC over WebSocket
- Type-safe API contract with TypeScript inference
- Bidirectional (queries, mutations, subscriptions)
- _Rationale:_ Leverages existing Dassie RPC server, type safety prevents runtime errors, WebSocket enables real-time subscriptions vs. HTTP polling

**6. Two-Phase Payment Protocol**
- Off-chain payment claims (signed messages) verified before on-chain settlement
- Settlement batched daily or when thresholds reached
- _Rationale:_ Instant verification (<10ms), reduces blockchain transaction costs, aligns with payment channel model (XRP, Lightning)

**7. Hot/Cold Storage Tiers (Arweave)**
- Hot: Recent events + small content in PostgreSQL (fast retrieval)
- Cold: Old events + large content in Arweave (permanent, cheap)
- _Rationale:_ Reduces relay storage costs, permanent data preservation, bundled pricing model (relay fee + storage fee)

**8. Command Query Responsibility Separation (CQRS-lite)**
- Nostream EVENT handler (write path): Payment verification → storage
- Nostream REQ handler (read path): Query filters → cached results
- Dassie ledger (write): ILP packet processing → accounting
- Dassie RPC (read): Query endpoints for monitoring
- _Rationale:_ Optimizes write performance (payment verification) separately from read performance (subscription delivery)

---

## Tech Stack

### Cloud Infrastructure
- **Provider:** Akash Network (decentralized compute marketplace)
- **Key Services:** Container deployment via SDL, persistent storage, provider billing API
- **Deployment Regions:** Global (provider selection based on cost/performance)

### Technology Stack Table

| Category | Technology | Version | Purpose | Rationale |
|----------|-----------|---------|---------|-----------|
| **Language** | TypeScript | 5.3+ | Primary development language | Both Nostream and Dassie use TypeScript; strong typing prevents payment bugs |
| **Runtime** | Node.js | 22.x LTS | JavaScript runtime | Required by both codebases; v22 for latest performance/security |
| **Package Manager** | pnpm | 8.x | Dependency management | Dassie uses pnpm workspaces; faster than npm/yarn |
| **Framework (Nostream)** | Fastify | 4.x | HTTP server for Nostream | Nostream's existing choice; high performance, low overhead |
| **Framework (Dashboard)** | Fastify + Static HTML | 4.x | Operator dashboard | Minimal UI served from Nostream; avoid React/Vue complexity |
| **Database (Events)** | PostgreSQL | 14.0+ | Nostr event storage | Nostream requirement; proven at scale, excellent JSON indexing |
| **Cache** | Redis | 7.x | Subscription caching | Nostream requirement; pub/sub for event broadcasting |
| **Database (Ledger)** | SQLite | 3.x | Dassie internal ledger | Dassie's choice; embedded, single-file, ACID transactions |
| **RPC Framework** | tRPC | 10.x | Inter-process communication | Dassie's existing RPC server; type-safe, WebSocket subscriptions |
| **WebSocket** | ws | 8.x | Nostr protocol transport | Standard WebSocket library for Node.js |
| **Smart Contract** | CosmWasm | 2.0+ | Cosmos payment channels | Akash chain native; Rust-based, auditable |
| **Smart Contract (Base)** | Solidity | 0.8.20+ | Base L2 payment channels | Ethereum standard; well-audited patterns |
| **Blockchain SDK (Cosmos)** | CosmJS | 0.32+ | Cosmos transaction signing | Official Cosmos JavaScript SDK |
| **Blockchain SDK (Base)** | viem | 2.x | Ethereum interactions | Modern, TypeScript-first, tree-shakeable |
| **Permanent Storage** | Arweave | N/A (network) | Large content + backups | One-time payment model; 200+ year persistence guarantee |
| **Arweave SDK** | arweave-js | 1.15+ | Arweave uploads | Official JavaScript SDK for Arweave network |
| **Lightning SDK** | lnd-grpc | Latest | Bitcoin payment channels | If Dassie doesn't have Lightning; LND integration |
| **XRP SDK** | xrpl.js | 3.x | XRP payment channels | Official Ripple SDK; payment channel support |
| **Testing (Unit)** | Vitest | 1.x | Fast unit testing | Modern, Vite-based, compatible with both projects |
| **Testing (Integration)** | Testcontainers | Latest | PostgreSQL/Redis containers | Real database testing without mocks |
| **Testing (Smart Contract)** | cw-multi-test | 2.x | CosmWasm testing | Official CosmWasm test framework |
| **Linting** | ESLint | 8.x | Code quality | TypeScript-aware linting |
| **Formatting** | Prettier | 3.x | Code formatting | Consistent style across projects |
| **Containerization** | Docker | 24.x | Application packaging | Required for Akash deployment |
| **CI/CD** | GitHub Actions | N/A | Build and test automation | Free for open source; Docker image builds |
| **Monitoring** | Pino | 8.x | Structured logging | High performance; JSON logs for analysis |

---

## Data Models

### NostrEvent

**Purpose:** Represents a Nostr event (note, reaction, long-form content, etc.) stored in the relay

**Key Attributes:**
- `id`: string (SHA-256 hash of event) - Primary key
- `pubkey`: string (hex-encoded public key) - Author identifier
- `created_at`: integer (Unix timestamp) - Event creation time
- `kind`: integer (event type) - Determines event category (1=note, 30023=article, etc.)
- `tags`: array of string arrays - Metadata, references, payment claims
- `content`: text - Event payload (may be empty if stored in Arweave)
- `sig`: string (hex-encoded signature) - Cryptographic proof of authorship

**Relationships:**
- References other events via `["e", "<event_id>"]` tags (replies, quotes)
- References users via `["p", "<pubkey>"]` tags (mentions)
- References Arweave via `["arweave", "<tx_id>"]` tags (permanent storage)

### PaymentClaim

**Purpose:** Off-chain payment claim embedded in Nostr event tags for micropayment verification

**Key Attributes:**
- `channelId`: string - Identifier for payment channel (blockchain-specific)
- `amountSats`: integer - Payment amount in satoshis (standardized across currencies)
- `nonce`: integer - Monotonically increasing counter (prevents replay attacks)
- `signature`: string (hex) - Cryptographic signature from payer
- `currency`: enum ('BTC' | 'BASE' | 'AKT' | 'XRP') - Payment currency

**Relationships:**
- Embedded in NostrEvent.tags as `["payment", "ilp", channelId, amount, nonce, signature, currency]`
- Verified against PaymentChannel state in Dassie ledger

### PaymentChannel (Dassie Internal State)

**Purpose:** Tracks state of payment channels across all blockchains in Dassie's internal ledger

**Key Attributes:**
- `channelId`: string - Unique identifier (Primary key)
- `blockchain`: enum ('BTC' | 'BASE' | 'AKT' | 'XRP') - Settlement network
- `sender`: string - Payer's address (blockchain-specific format)
- `recipient`: string - Relay's address
- `capacity`: bigint - Total locked funds in channel
- `balance`: bigint - Current unclaimed balance
- `highestNonce`: integer - Last verified nonce (prevents double-spend)
- `expiration`: integer (Unix timestamp) - When channel expires
- `status`: enum ('OPEN' | 'CLOSED' | 'EXPIRED') - Channel state

**Relationships:**
- Links to Dassie ledger accounts: `<currency>:assets/settlement/<channelId>`
- References on-chain contracts (CosmWasm address, Base contract address, etc.)

### EconomicSnapshot

**Purpose:** Tracks relay's financial health over time for profitability monitoring

**Key Attributes:**
- `timestamp`: timestamptz - Snapshot time (Primary key)
- `revenue_btc`: bigint - Revenue from BTC payments (in satoshis)
- `revenue_base`: bigint - Revenue from BASE payments (in wei)
- `revenue_akt`: bigint - Revenue from AKT payments (in uakt)
- `revenue_xrp`: bigint - Revenue from XRP payments (in drops)
- `routing_fees_total`: bigint - ILP connector fees earned (AKT-equivalent)
- `arweave_expenses`: bigint - AR spent on uploads/backups (in winston)
- `akash_expenses`: bigint - Akash hosting costs (in uakt)
- `net_profit`: bigint - Total profit (in AKT-equivalent)
- `akt_balance`: bigint - Current AKT balance for Akash payments

**Relationships:**
- Aggregated from Dassie ledger accounts via RPC queries
- Used by Economic Monitor for profitability alerts
- Displayed in operator dashboard

### ArweaveBackup

**Purpose:** Tracks daily event backups uploaded to Arweave for disaster recovery

**Key Attributes:**
- `tx_id`: string (43 chars) - Arweave transaction ID (Primary key)
- `event_count`: integer - Number of events in backup
- `start_date`: timestamptz - Backup date range start
- `end_date`: timestamptz - Backup date range end
- `created_at`: timestamptz - When backup was created
- `size_bytes`: bigint - Compressed backup size
- `ar_cost`: decimal - AR tokens spent on upload

**Relationships:**
- ArchivedEvent references ArweaveBackup.tx_id
- Used for hot/cold storage tier management

### ArchivedEvent (Stub Record)

**Purpose:** Minimal record for events archived to Arweave (full data deleted from PostgreSQL)

**Key Attributes:**
- `id`: string - Original event ID (Primary key)
- `created_at`: timestamptz - Original event timestamp
- `kind`: integer - Event kind (for filtering)
- `arweave_backup_tx`: string - Reference to ArweaveBackup.tx_id
- `archived_at`: timestamptz - When event was archived

**Relationships:**
- Links to ArweaveBackup containing full event data
- Clients query this table when requesting old events
- REQ handler returns event with `["arweave", tx_id]` tag

### CosmWasmPaymentChannel (Smart Contract State)

**Purpose:** On-chain state for Cosmos/Akash payment channels (stored in CosmWasm contract)

**Key Attributes:**
- `id`: string - Channel identifier
- `sender`: Addr - Cosmos address of payer
- `recipient`: Addr - Relay's Cosmos address
- `amount`: Uint128 - Locked AKT amount (in uakt)
- `denom`: string - "uakt"
- `expiration`: u64 - Block height or timestamp
- `highest_claim`: Uint128 - Largest verified claim
- `status`: enum (Open | Closed | Expired)

**Relationships:**
- Mirrored in Dassie internal ledger for off-chain verification
- Contract deployed on Akash chain

---

## Source Tree Structure

### Nostream-ILP Repository Layout

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

### Dassie-Relay Repository Layout (Fork or Upstream)

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

### CosmWasm Payment Channels Repository

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

### Key Files and Their Purposes

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

## Backend System Design

### System Components Overview

The backend consists of **three primary subsystems** working in concert:

1. **Nostream Relay Core** (Nostr protocol handler)
2. **Dassie ILP Node** (Payment routing and verification)
3. **Economic Monitor** (Financial automation)

Supporting services:
- **Arweave Integration** (Permanent storage)
- **Dashboard API** (Operator visibility)

### Component Diagram

```mermaid
graph TB
    subgraph "Nostream Container"
        WS[WebSocket Server<br/>Fastify + ws]
        EventHandler[Event Handler<br/>EVENT/REQ/CLOSE]
        PaymentVerifier[Payment Verifier<br/>Claim validation]
        EventRepo[Event Repository<br/>PostgreSQL access]
        ArweaveService[Arweave Service<br/>Upload/Backup]
        DashboardAPI[Dashboard API<br/>Fastify routes]

        WS --> EventHandler
        EventHandler --> PaymentVerifier
        PaymentVerifier --> EventRepo
        EventHandler --> ArweaveService
    end

    subgraph "Dassie Container"
        DassieRPC[tRPC Server<br/>WebSocket]
        ILPCore[ILP Packet Router<br/>Core logic]
        Ledger[Internal Ledger<br/>SQLite]
        Settlement[Settlement Modules<br/>BTC/BASE/AKT/XRP]

        DassieRPC --> ILPCore
        ILPCore --> Ledger
        ILPCore --> Settlement
    end

    subgraph "Background Services"
        EconMonitor[Economic Monitor<br/>Cron service]
        BackupService[Backup Service<br/>Daily archival]
    end

    PaymentVerifier -->|tRPC WS| DassieRPC
    EconMonitor -->|tRPC WS| DassieRPC
    BackupService --> ArweaveService

    DashboardAPI --> EventRepo
    DashboardAPI --> DassieRPC

    ArweaveService -->|HTTPS| ArweaveNet[Arweave Network]
    Settlement -->|RPC| Blockchains[Blockchains<br/>BTC/BASE/AKT/XRP]
    EconMonitor -->|REST API| AkashProvider[Akash Provider]

    style WS fill:#4A90E2
    style DassieRPC fill:#50C878
    style EconMonitor fill:#FFB347
```

### Component Specifications

#### 1. WebSocket Server (Nostream Entry Point)

**Technology:** Fastify + `ws` library
**Responsibilities:**
- Accept WebSocket connections from Nostr clients
- Parse Nostr protocol messages (EVENT, REQ, CLOSE, AUTH)
- Route messages to appropriate handlers
- Broadcast events to active subscriptions
- Handle connection lifecycle (open, close, error)

**Key Configuration:**
```yaml
# .nostr/settings.yaml
relay:
  url: wss://relay.example.com
  name: "ILP Relay"
  max_connections: 10000
  max_subscriptions_per_client: 20
  message_size_limit: 128KB
```

**Performance Targets:**
- Handle 10,000 concurrent connections
- Process 1,000 EVENT messages/second
- Deliver events to subscribers <50ms latency

#### 2. Event Handler (Core Nostr Logic)

**Responsibilities:**
- Validate Nostr event structure (id, signature, created_at)
- Extract payment claims from event tags
- Call Payment Verifier to check balance
- Store events in PostgreSQL (or reject if payment invalid)
- Trigger Arweave upload for large content (kind 30023, 1063)
- Broadcast accepted events to matching subscriptions

**Event Processing Flow:**
```typescript
async function handleEvent(event: NostrEvent, ws: WebSocket): Promise<void> {
  // 1. Validate signature
  if (!verifySignature(event)) {
    return sendError(ws, 'invalid: signature verification failed');
  }

  // 2. Check if payment required
  const pricing = getPricingForKind(event.kind);
  if (pricing.requiresPayment) {
    // 3. Extract payment claim
    const claim = extractPaymentClaim(event.tags);
    if (!claim) {
      return sendError(ws, 'restricted: payment required');
    }

    // 4. Verify payment via Dassie RPC
    const isValid = await paymentVerifier.verify(claim);
    if (!isValid) {
      return sendError(ws, 'restricted: invalid payment');
    }
  }

  // 5. Check if needs Arweave storage
  if (pricing.requiresArweave) {
    const txId = await arweaveService.upload(event.content, event);
    event.tags.push(['arweave', txId]);
    event.content = ''; // Clear content (stored in Arweave)
  }

  // 6. Store event
  await eventRepository.save(event);

  // 7. Broadcast to subscribers
  await subscriptionManager.broadcast(event);

  // 8. Send confirmation
  sendOK(ws, event.id, true, '');
}
```

**Error Handling:**
- Invalid signature → `["OK", event_id, false, "invalid: bad signature"]`
- Missing payment → `["OK", event_id, false, "restricted: payment required"]`
- Invalid payment → `["OK", event_id, false, "restricted: payment claim invalid"]`
- Duplicate event → `["OK", event_id, true, "duplicate: already stored"]`

#### 3. Payment Verifier (Dassie Integration)

**Responsibilities:**
- Establish tRPC WebSocket connection to Dassie
- Send payment claim verification requests
- Cache channel states to reduce RPC calls
- Track payment statistics for dashboard

**Verification Algorithm:**
```typescript
interface PaymentClaim {
  channelId: string;
  amountSats: number;
  nonce: number;
  signature: string;
  currency: 'BTC' | 'BASE' | 'AKT' | 'XRP';
}

async function verifyPayment(claim: PaymentClaim): Promise<boolean> {
  // 1. Fetch channel state from Dassie (or local cache)
  const channel = await dassieClient.payment.getChannelState({
    channelId: claim.channelId
  });

  if (!channel) return false;
  if (channel.status !== 'OPEN') return false;

  // 2. Verify nonce is sequential
  if (claim.nonce <= channel.highestNonce) {
    throw new Error('Replay attack: nonce already used');
  }

  // 3. Verify signature
  const message = `${claim.channelId}:${claim.amountSats}:${claim.nonce}`;
  const isValidSig = verifyChannelSignature(
    message,
    claim.signature,
    channel.sender
  );
  if (!isValidSig) return false;

  // 4. Verify sufficient balance
  const requiredBalance = channel.balance - claim.amountSats;
  if (requiredBalance < 0) return false;

  // 5. Record claim in Dassie ledger (off-chain)
  await dassieClient.payment.recordClaim({
    channelId: claim.channelId,
    amount: claim.amountSats,
    nonce: claim.nonce
  });

  return true;
}
```

**Optimization:** Cache channel states for 30 seconds to reduce Dassie RPC calls:
```typescript
const channelCache = new Map<string, { state: PaymentChannel, expiry: number }>();

async function getCachedChannelState(channelId: string): Promise<PaymentChannel | null> {
  const cached = channelCache.get(channelId);
  if (cached && Date.now() < cached.expiry) {
    return cached.state;
  }

  const state = await dassieClient.payment.getChannelState({ channelId });
  channelCache.set(channelId, { state, expiry: Date.now() + 30000 });
  return state;
}
```

#### 4. Dassie RPC Client (tRPC Integration)

**Technology:** tRPC client over WebSocket
**Responsibilities:**
- Maintain persistent WebSocket connection to Dassie
- Expose type-safe API for payment operations
- Handle reconnection on connection loss
- Subscribe to real-time balance updates

**Client Initialization:**
```typescript
import { createTRPCProxyClient, createWSClient } from '@trpc/client';
import type { AppRouter } from 'dassie/src/backend/rpc/router';

const wsClient = createWSClient({
  url: process.env.DASSIE_RPC_URL || 'ws://localhost:5000/trpc',
  onOpen: () => console.log('Connected to Dassie RPC'),
  onClose: () => console.log('Disconnected from Dassie RPC'),
  retryDelayMs: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
});

export const dassieClient = createTRPCProxyClient<AppRouter>({
  links: [wsLink({ client: wsClient })],
});
```

**RPC Endpoints Used (from Dassie):**
| Endpoint | Type | Purpose | Parameters |
|----------|------|---------|------------|
| `payment.getChannelState` | Query | Fetch payment channel details | `{ channelId: string }` |
| `payment.recordClaim` | Mutation | Record off-chain payment claim | `{ channelId, amount, nonce }` |
| `payment.verifyPaymentClaim` | Query | Verify claim validity | `{ claim: PaymentClaim }` |
| `payment.convertToAKT` | Mutation | Convert revenue to AKT for Akash | `{ amount, fromCurrency }` |
| `ledger.getBalance` | Query | Get balance for ledger account | `{ accountPath: string }` |
| `ledger.subscribeToAccount` | Subscription | Real-time balance updates | `{ accountPath: string }` |

**Authentication (Production):**
```typescript
const wsClient = createWSClient({
  url: process.env.DASSIE_RPC_URL,
  connectionParams: async () => ({
    token: process.env.DASSIE_RPC_TOKEN, // Shared secret
  }),
});
```

#### 5. Economic Monitor (Financial Automation)

**Responsibilities:**
- Poll Dassie ledger every hour for revenue across all currencies
- Calculate total profit (revenue - expenses)
- Convert profits to AKT tokens
- Pay Akash provider bills automatically
- Alert operator if balance low or unprofitable
- Record EconomicSnapshot for historical analysis

**Service Architecture:**
```typescript
class EconomicMonitorService {
  private interval: NodeJS.Timer;

  async start() {
    // Run immediately on startup
    await this.runMonitoringCycle();

    // Then every hour
    this.interval = setInterval(() => this.runMonitoringCycle(), 3600000);
  }

  async runMonitoringCycle() {
    try {
      // 1. Fetch revenue from Dassie ledger
      const revenue = await this.fetchRevenue();

      // 2. Calculate expenses
      const expenses = await this.calculateExpenses();

      // 3. Calculate profit
      const profit = this.calculateProfit(revenue, expenses);

      // 4. Record snapshot
      await this.recordSnapshot({ revenue, expenses, profit });

      // 5. Check if Akash payment due
      const akashBill = await this.checkAkashBill();
      if (akashBill.due) {
        await this.payAkashProvider(akashBill.amount);
      }

      // 6. Check profitability alerts
      if (profit < 0) {
        await this.sendAlert('UNPROFITABLE', profit);
      }
    } catch (error) {
      console.error('Economic monitoring cycle failed:', error);
    }
  }

  async fetchRevenue(): Promise<RevenueBreakdown> {
    const btcBalance = await dassieClient.ledger.getBalance({
      accountPath: 'btc:revenue/relay-fees'
    });
    const baseBalance = await dassieClient.ledger.getBalance({
      accountPath: 'base:revenue/relay-fees'
    });
    // ... same for AKT, XRP

    return { btc: btcBalance, base: baseBalance, /* ... */ };
  }

  async calculateExpenses(): Promise<ExpenseBreakdown> {
    // Query Arweave expenses from database
    const arweaveExpenses = await db.query(`
      SELECT SUM(ar_cost) FROM arweave_backups
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);

    // Estimate Akash costs (query provider API or use fixed rate)
    const akashExpenses = await this.estimateAkashCost();

    return { arweave: arweaveExpenses, akash: akashExpenses };
  }

  async payAkashProvider(amount: number) {
    // 1. Ensure sufficient AKT balance
    const aktBalance = await dassieClient.ledger.getBalance({
      accountPath: 'akt:assets/settlement'
    });

    if (aktBalance < amount) {
      // Convert other currencies to AKT
      await dassieClient.payment.convertToAKT({
        amount: amount - aktBalance,
        fromCurrency: 'BTC' // Use BTC as primary reserve
      });
    }

    // 2. Send payment to Akash provider
    const providerAddress = process.env.AKASH_PROVIDER_ADDRESS;
    await this.sendCosmosTransaction(providerAddress, amount);
  }
}
```

**Alert Thresholds:**
```yaml
# .nostr/settings.yaml
economic_monitor:
  enabled: true
  poll_interval_seconds: 3600
  alerts:
    unprofitable_threshold: -1000  # Alert if losing >1000 uakt/hour
    low_balance_akt: 5000000       # Alert if <5 AKT remaining
    high_arweave_spend: 10000000   # Alert if >10 AR/day spent
  akash_payment:
    auto_pay: true
    reserve_balance: 10000000      # Keep 10 AKT in reserve
```

#### 6. Arweave Integration

**Components:**
- **WalletManager:** Manages Arweave JWK wallet, signs transactions
- **UploadService:** Uploads large content (kind 30023, 1063) to Arweave
- **BackupService:** Daily event backup scheduler
- **RetrievalService:** Fetches archived events from Arweave

**Upload Flow (Large Content):**
```typescript
async function uploadLargeContent(event: NostrEvent): Promise<string> {
  const wallet = new ArweaveWalletManager(process.env.ARWEAVE_WALLET_PATH);

  // 1. Prepare data
  const contentBuffer = Buffer.from(event.content);

  // 2. Calculate cost
  const arweaveCost = await wallet.estimateUploadCost(contentBuffer.length);

  // 3. Create transaction
  const tx = await wallet.arweave.createTransaction({
    data: contentBuffer
  }, wallet.wallet);

  // 4. Add tags
  tx.addTag('Content-Type', getContentType(event.kind));
  tx.addTag('Nostr-Kind', event.kind.toString());
  tx.addTag('Nostr-Pubkey', event.pubkey);
  tx.addTag('App-Name', 'nostr-ilp-relay');

  // 5. Sign and post
  await wallet.arweave.transactions.sign(tx, wallet.wallet);
  await wallet.arweave.transactions.post(tx);

  // 6. Record expense
  await db.query(`
    INSERT INTO arweave_uploads (tx_id, event_id, ar_cost, size_bytes)
    VALUES ($1, $2, $3, $4)
  `, [tx.id, event.id, arweaveCost, contentBuffer.length]);

  return tx.id; // Return Arweave transaction ID
}
```

**Backup Flow (Daily Archival):**
```typescript
// Scheduled via cron at 02:00 UTC
async function runDailyBackup() {
  const yesterday = new Date(Date.now() - 86400000);
  const today = new Date();

  // 1. Query events from yesterday
  const events = await db.query(`
    SELECT * FROM events
    WHERE created_at >= $1 AND created_at < $2
    ORDER BY created_at ASC
  `, [yesterday, today]);

  // 2. Convert to NDJSON
  const ndjson = events.map(e => JSON.stringify(e)).join('\n');

  // 3. Compress with gzip
  const compressed = await gzip(Buffer.from(ndjson));

  // 4. Upload to Arweave
  const txId = await arweaveService.uploadBackup(compressed, {
    event_count: events.length,
    start_date: yesterday.toISOString(),
    end_date: today.toISOString()
  });

  // 5. Archive events (delete full content, keep stub)
  for (const event of events) {
    await db.query(`
      INSERT INTO archived_events (id, created_at, kind, arweave_backup_tx, archived_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [event.id, event.created_at, event.kind, txId]);

    await db.query(`DELETE FROM events WHERE id = $1`, [event.id]);
  }

  console.log(`Archived ${events.length} events to Arweave tx ${txId}`);
}
```

---

## API Specifications

### Nostr Protocol APIs (WebSocket)

The relay implements the Nostr protocol specification (NIP-01) over WebSocket.

#### Client → Relay Messages

**1. EVENT - Publish an event**
```json
["EVENT", {
  "id": "event_id_hash_hex",
  "pubkey": "author_pubkey_hex",
  "created_at": 1234567890,
  "kind": 1,
  "tags": [
    ["e", "referenced_event_id"],
    ["p", "mentioned_pubkey"],
    ["payment", "ilp", "channel_123", "1000", "42", "signature_hex", "BTC"]
  ],
  "content": "Hello Nostr!",
  "sig": "signature_hex"
}]
```

**Payment Tag Format:**
```
["payment", "ilp", channelId, amountSats, nonce, signature, currency]
```

**2. REQ - Subscribe to events**
```json
["REQ", "subscription_id", {
  "authors": ["pubkey1", "pubkey2"],
  "kinds": [1, 30023],
  "#e": ["event_id"],
  "#p": ["pubkey"],
  "since": 1234567890,
  "until": 1234567900,
  "limit": 100
}]
```

**3. CLOSE - Close subscription**
```json
["CLOSE", "subscription_id"]
```

**4. AUTH - Authenticate (NIP-42)**
```json
["AUTH", {
  "id": "event_id",
  "pubkey": "client_pubkey",
  "created_at": 1234567890,
  "kind": 22242,
  "tags": [["relay", "wss://relay.example.com"], ["challenge", "challenge_string"]],
  "content": "",
  "sig": "signature"
}]
```

#### Relay → Client Messages

**1. EVENT - Send event matching subscription**
```json
["EVENT", "subscription_id", {
  "id": "event_id",
  "pubkey": "author_pubkey",
  "created_at": 1234567890,
  "kind": 1,
  "tags": [["arweave", "tx_id_if_archived"]],
  "content": "Event content or empty if in Arweave",
  "sig": "signature"
}]
```

**2. EOSE - End of Stored Events**
```json
["EOSE", "subscription_id"]
```

**3. OK - Event acceptance result**
```json
["OK", "event_id", true, ""]
["OK", "event_id", false, "invalid: signature verification failed"]
["OK", "event_id", false, "restricted: payment required"]
["OK", "event_id", false, "restricted: invalid payment"]
["OK", "event_id", true, "duplicate: already stored"]
```

**4. NOTICE - Human-readable message**
```json
["NOTICE", "Payment required for event kind 30023. Include payment tag."]
```

**5. AUTH - Authentication challenge (NIP-42)**
```json
["AUTH", "challenge_string"]
```

---

### Dashboard REST API

The operator dashboard exposes HTTP endpoints for monitoring and management.

**Base URL:** `https://relay.example.com/dashboard`

#### GET /dashboard/metrics

**Description:** Get current relay metrics (revenue, profit, channels)

**Authentication:** HTTP Basic Auth (operator credentials)

**Response:**
```json
{
  "timestamp": "2025-11-25T12:00:00Z",
  "revenue": {
    "btc_sats": 1000000,
    "base_wei": "5000000000000000000",
    "akt_uakt": 50000000,
    "xrp_drops": 10000000
  },
  "expenses": {
    "arweave_winston": 5000000000,
    "akash_uakt": 2500000
  },
  "profit": {
    "total_akt_equivalent": 47500000,
    "hourly_rate_uakt": 1200
  },
  "channels": {
    "open": 15,
    "total_capacity_sats": 50000000
  },
  "relay_stats": {
    "total_events": 125000,
    "events_24h": 850,
    "active_subscriptions": 42,
    "connected_clients": 23
  }
}
```

#### GET /dashboard/payments

**Description:** Get recent payment history

**Authentication:** HTTP Basic Auth

**Query Parameters:**
- `limit` (default: 50, max: 500)
- `offset` (default: 0)
- `currency` (filter by BTC, BASE, AKT, XRP, or "all")

**Response:**
```json
{
  "payments": [
    {
      "timestamp": "2025-11-25T11:55:00Z",
      "channel_id": "channel_123",
      "amount_sats": 1000,
      "currency": "BTC",
      "event_id": "abc123...",
      "event_kind": 1,
      "sender_pubkey": "def456..."
    }
  ],
  "total": 850,
  "limit": 50,
  "offset": 0
}
```

#### GET /dashboard/health

**Description:** Health check endpoint

**Authentication:** None (public)

**Response:**
```json
{
  "status": "healthy",
  "services": {
    "nostream": "up",
    "dassie_rpc": "up",
    "postgresql": "up",
    "redis": "up",
    "arweave": "up"
  },
  "warnings": [
    "AKT balance below reserve threshold (3.5 AKT remaining)"
  ]
}
```

#### GET /dashboard/channels

**Description:** Get payment channel details

**Authentication:** HTTP Basic Auth

**Response:**
```json
{
  "channels": [
    {
      "channel_id": "channel_123",
      "blockchain": "BTC",
      "sender": "bc1q...",
      "capacity_sats": 10000000,
      "balance_sats": 8500000,
      "highest_nonce": 42,
      "status": "OPEN",
      "expiration": "2025-12-25T00:00:00Z",
      "total_spent_sats": 1500000
    }
  ]
}
```

#### POST /dashboard/config

**Description:** Update relay configuration (pricing, alerts)

**Authentication:** HTTP Basic Auth

**Request Body:**
```json
{
  "pricing": {
    "1": { "amount_sats": 10, "requires_payment": true },
    "30023": { "amount_sats": 500, "requires_payment": true, "requires_arweave": true }
  },
  "economic_monitor": {
    "alerts": {
      "unprofitable_threshold": -2000,
      "low_balance_akt": 3000000
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration updated. Restart required for some changes."
}
```

---

### Dassie RPC API (tRPC)

These are the **custom endpoints** that need to be added to Dassie for Nostream integration.

**Connection:** WebSocket at `ws://dassie:5000/trpc`

#### payment.getChannelState

**Type:** Query
**Description:** Fetch payment channel details

**Input:**
```typescript
{
  channelId: string;
}
```

**Output:**
```typescript
{
  channelId: string;
  blockchain: 'BTC' | 'BASE' | 'AKT' | 'XRP';
  sender: string;
  recipient: string;
  capacity: bigint;
  balance: bigint;
  highestNonce: number;
  expiration: number; // Unix timestamp
  status: 'OPEN' | 'CLOSED' | 'EXPIRED';
}
```

#### payment.verifyPaymentClaim

**Type:** Query
**Description:** Verify a payment claim's validity

**Input:**
```typescript
{
  channelId: string;
  amountSats: number;
  nonce: number;
  signature: string;
  currency: 'BTC' | 'BASE' | 'AKT' | 'XRP';
}
```

**Output:**
```typescript
{
  valid: boolean;
  error?: string; // If invalid: "insufficient_balance", "invalid_nonce", "invalid_signature", etc.
}
```

#### payment.recordClaim

**Type:** Mutation
**Description:** Record an off-chain payment claim in ledger

**Input:**
```typescript
{
  channelId: string;
  amount: number;
  nonce: number;
  eventId?: string; // Optional Nostr event ID for tracking
}
```

**Output:**
```typescript
{
  success: boolean;
  newBalance: bigint;
  newNonce: number;
}
```

#### payment.convertToAKT

**Type:** Mutation
**Description:** Convert revenue from other currencies to AKT for Akash payments

**Input:**
```typescript
{
  amount: number; // Amount in source currency base units
  fromCurrency: 'BTC' | 'BASE' | 'XRP';
  slippageTolerance?: number; // Default: 0.05 (5%)
}
```

**Output:**
```typescript
{
  success: boolean;
  amountAKT: bigint; // Amount received in uakt
  exchangeRate: number; // Rate used for conversion
  transactionId: string; // On-chain or ILP payment ID
}
```

#### ledger.getBalance

**Type:** Query
**Description:** Get balance for a ledger account path

**Input:**
```typescript
{
  accountPath: string; // e.g., "btc:revenue/relay-fees"
}
```

**Output:**
```typescript
{
  balance: bigint;
  accountPath: string;
  lastUpdated: number; // Unix timestamp
}
```

#### ledger.subscribeToAccount

**Type:** Subscription
**Description:** Real-time balance updates for an account

**Input:**
```typescript
{
  accountPath: string;
}
```

**Output (stream):**
```typescript
{
  balance: bigint;
  delta: bigint; // Change since last update
  timestamp: number;
  reason: string; // "payment_received", "settlement", "conversion", etc.
}
```

#### settlement.openChannel

**Type:** Mutation
**Description:** Open a new payment channel on a blockchain

**Input:**
```typescript
{
  blockchain: 'BTC' | 'BASE' | 'AKT' | 'XRP';
  sender: string; // Blockchain-specific address
  amount: bigint; // In base units (sats, wei, uakt, drops)
  expirationBlocks?: number; // Default: 1000 blocks
}
```

**Output:**
```typescript
{
  channelId: string;
  onChainTxId: string; // Transaction ID on the blockchain
  status: 'PENDING' | 'OPEN';
  estimatedConfirmationTime: number; // Seconds
}
```

#### settlement.closeChannel

**Type:** Mutation
**Description:** Close a payment channel and settle on-chain

**Input:**
```typescript
{
  channelId: string;
  finalAmount: bigint; // Final claimed amount
}
```

**Output:**
```typescript
{
  success: boolean;
  onChainTxId: string;
  refundAmount: bigint; // Amount returned to sender
  relayAmount: bigint; // Amount sent to relay
}
```

---

### Arweave Upload API (Internal)

**Note:** This is an internal service, not exposed via HTTP. Used by Nostream event handler and backup service.

#### arweaveService.upload(content, metadata)

**Description:** Upload content to Arweave and return transaction ID

**Parameters:**
```typescript
content: Buffer | string;
metadata: {
  eventId: string;
  eventKind: number;
  contentType: string;
  pubkey: string;
}
```

**Returns:**
```typescript
Promise<{
  txId: string; // Arweave transaction ID (43 chars)
  url: string; // https://arweave.net/{txId}
  cost: number; // AR cost in winston
  size: number; // Bytes uploaded
}>
```

#### arweaveService.uploadBackup(compressedData, manifest)

**Description:** Upload daily event backup bundle

**Parameters:**
```typescript
compressedData: Buffer; // Gzipped NDJSON
manifest: {
  event_count: number;
  start_date: string;
  end_date: string;
}
```

**Returns:**
```typescript
Promise<{
  txId: string;
  cost: number;
  size: number;
}>
```

#### arweaveService.retrieve(txId)

**Description:** Fetch archived content from Arweave

**Parameters:**
```typescript
txId: string; // 43-character transaction ID
```

**Returns:**
```typescript
Promise<{
  data: Buffer;
  contentType: string;
  tags: Array<{ name: string; value: string }>;
}>
```

---

## Security Architecture

### Threat Model

The Nostr-ILP relay faces these primary security threats:

1. **Payment Fraud:**
   - Replay attacks (reuse old payment claims)
   - Double-spending (submit same payment to multiple relays)
   - Signature forgery (fake payment claims)
   - Balance manipulation (claim more than channel balance)

2. **Nostr Protocol Attacks:**
   - Signature verification bypass
   - Event flooding (DoS via spam)
   - Subscription DoS (create infinite subscriptions)
   - Impersonation (forge events from other users)

3. **Infrastructure Attacks:**
   - DDoS against WebSocket endpoint
   - Database injection attacks
   - RPC interception (Nostream ↔ Dassie)
   - Arweave wallet theft

4. **Economic Attacks:**
   - Drain relay's AKT balance (prevent Akash payment)
   - ILP routing manipulation
   - Price oracle manipulation (exchange rate attacks)

### Security Layers

```mermaid
graph TB
    Client[Nostr Client]

    subgraph "Layer 1: Transport Security"
        TLS[TLS 1.3<br/>WebSocket Encryption]
        RateLimit[Rate Limiting<br/>Per IP/Pubkey]
    end

    subgraph "Layer 2: Authentication"
        NIP42[NIP-42 Auth<br/>Challenge-Response]
        EventSig[Event Signature<br/>Verification]
    end

    subgraph "Layer 3: Payment Security"
        PaymentVerify[Payment Claim<br/>Verification]
        NonceCheck[Nonce Sequence<br/>Validation]
        BalanceCheck[Channel Balance<br/>Verification]
        SigVerify[Channel Signature<br/>Verification]
    end

    subgraph "Layer 4: Data Security"
        SQLInject[SQL Injection<br/>Protection]
        XSS[XSS Protection<br/>Dashboard]
        SecretMgmt[Secret Management<br/>Environment Vars]
    end

    subgraph "Layer 5: Inter-Service Security"
        RPCAuth[Dassie RPC Token<br/>Authentication]
        NetworkIsolation[Container Network<br/>Isolation]
    end

    Client --> TLS
    TLS --> RateLimit
    RateLimit --> NIP42
    NIP42 --> EventSig
    EventSig --> PaymentVerify
    PaymentVerify --> NonceCheck
    NonceCheck --> BalanceCheck
    BalanceCheck --> SigVerify
    SigVerify --> SQLInject
    SQLInject --> RPCAuth
```

### Authentication & Authorization

#### Nostr Client Authentication (NIP-42)

**Purpose:** Prevent abuse by anonymous clients

**Implementation:**
```typescript
// When client connects, send AUTH challenge
function handleNewConnection(ws: WebSocket) {
  const challenge = generateRandomChallenge(); // 32 bytes hex
  ws.metadata = { challenge, authenticated: false };

  send(ws, ['AUTH', challenge]);

  // Timeout if not authenticated within 30 seconds
  setTimeout(() => {
    if (!ws.metadata.authenticated) {
      ws.close(4401, 'Authentication timeout');
    }
  }, 30000);
}

// Verify AUTH response
function handleAuthMessage(ws: WebSocket, authEvent: NostrEvent) {
  // 1. Verify event kind is 22242
  if (authEvent.kind !== 22242) {
    return sendError(ws, 'invalid: wrong event kind for AUTH');
  }

  // 2. Verify challenge tag matches
  const challengeTag = authEvent.tags.find(t => t[0] === 'challenge');
  if (challengeTag?.[1] !== ws.metadata.challenge) {
    return sendError(ws, 'invalid: challenge mismatch');
  }

  // 3. Verify relay tag
  const relayTag = authEvent.tags.find(t => t[0] === 'relay');
  if (relayTag?.[1] !== config.relay.url) {
    return sendError(ws, 'invalid: wrong relay URL');
  }

  // 4. Verify signature
  if (!verifyEventSignature(authEvent)) {
    return sendError(ws, 'invalid: signature verification failed');
  }

  // 5. Mark as authenticated
  ws.metadata.authenticated = true;
  ws.metadata.pubkey = authEvent.pubkey;

  send(ws, ['OK', authEvent.id, true, '']);
}
```

**Enforcement:**
- All EVENT messages require authentication
- REQ messages allowed without auth (public read access)
- Rate limits stricter for unauthenticated connections

#### Dashboard Authentication (HTTP Basic Auth)

**Purpose:** Protect operator dashboard from unauthorized access

**Implementation:**
```typescript
// Fastify plugin for dashboard routes
fastify.register(async (instance) => {
  instance.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      reply.code(401).header('WWW-Authenticate', 'Basic realm="Dashboard"');
      throw new Error('Unauthorized');
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [username, password] = credentials.split(':');

    // Verify against environment variables
    const validUsername = process.env.DASHBOARD_USERNAME;
    const validPassword = process.env.DASHBOARD_PASSWORD;

    if (username !== validUsername || password !== validPassword) {
      reply.code(401);
      throw new Error('Invalid credentials');
    }
  });

  instance.get('/dashboard/metrics', handleMetrics);
  instance.get('/dashboard/payments', handlePayments);
  // ... other routes
});
```

**Credentials Storage:**
```bash
# .env file (never commit to git)
DASHBOARD_USERNAME=operator
DASHBOARD_PASSWORD=<generated-strong-password>
```

#### Dassie RPC Authentication

**Purpose:** Prevent unauthorized access to Dassie payment operations

**Implementation:**
```typescript
// Nostream tRPC client
const dassieClient = createTRPCProxyClient<AppRouter>({
  links: [
    wsLink({
      client: createWSClient({
        url: process.env.DASSIE_RPC_URL,
        connectionParams: async () => ({
          token: process.env.DASSIE_RPC_TOKEN // Shared secret
        }),
      }),
    }),
  ],
});

// Dassie RPC server (add auth middleware)
// In dassie/packages/app-dassie/src/backend/rpc/server.ts
export const createContext = ({ req }) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');

  if (token !== process.env.DASSIE_RPC_TOKEN) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return { authenticated: true };
};
```

**Token Generation:**
```bash
# Generate secure random token
openssl rand -hex 32

# Store in both containers' environments
# Nostream: DASSIE_RPC_TOKEN=<token>
# Dassie: DASSIE_RPC_TOKEN=<token>
```

### Payment Security

#### Preventing Replay Attacks

**Mechanism:** Monotonically increasing nonce

**Implementation:**
```typescript
async function verifyNonce(channelId: string, nonce: number): Promise<boolean> {
  const channel = await dassieClient.payment.getChannelState({ channelId });

  if (nonce <= channel.highestNonce) {
    logger.warn({
      event: 'replay_attack_detected',
      channelId,
      attemptedNonce: nonce,
      highestNonce: channel.highestNonce
    });
    return false;
  }

  // Verify nonce is sequential (not jumping ahead suspiciously)
  if (nonce > channel.highestNonce + 1000) {
    logger.warn({
      event: 'suspicious_nonce_jump',
      channelId,
      attemptedNonce: nonce,
      highestNonce: channel.highestNonce
    });
    return false; // Reject if nonce jumps more than 1000
  }

  return true;
}
```

#### Signature Verification

**Purpose:** Ensure payment claims are cryptographically valid

**Implementation:**
```typescript
import { schnorr } from '@noble/curves/secp256k1';

function verifyChannelSignature(
  message: string,
  signature: string,
  senderPubkey: string
): boolean {
  try {
    const messageHash = sha256(message);
    const signatureBytes = hexToBytes(signature);
    const pubkeyBytes = hexToBytes(senderPubkey);

    return schnorr.verify(signatureBytes, messageHash, pubkeyBytes);
  } catch (error) {
    logger.error({ event: 'signature_verification_error', error });
    return false;
  }
}

// Verify payment claim signature
const claim: PaymentClaim = extractPaymentClaim(event.tags);
const message = `${claim.channelId}:${claim.amountSats}:${claim.nonce}`;

if (!verifyChannelSignature(message, claim.signature, channel.sender)) {
  return sendError(ws, 'restricted: invalid payment signature');
}
```

#### Double-Spend Prevention

**Mechanism:** Atomic nonce updates in Dassie ledger

**Implementation:**
```rust
// In Dassie ledger (pseudo-Rust)
fn record_claim(channel_id: &str, amount: u64, nonce: u64) -> Result<(), Error> {
    db.transaction(|| {
        // 1. Lock channel row (FOR UPDATE)
        let mut channel = channels.find(channel_id).lock_for_update()?;

        // 2. Verify nonce is next sequential value
        if nonce != channel.highest_nonce + 1 {
            return Err(Error::InvalidNonce);
        }

        // 3. Verify sufficient balance
        if amount > channel.balance {
            return Err(Error::InsufficientBalance);
        }

        // 4. Update atomically
        channel.balance -= amount;
        channel.highest_nonce = nonce;
        channel.save()?;

        // 5. Record in ledger
        ledger.debit(format!("{}:liabilities/{}", channel.currency, channel.sender), amount)?;
        ledger.credit("revenue/relay-fees", amount)?;

        Ok(())
    })
}
```

### Data Security

#### SQL Injection Protection

**Mechanism:** Parameterized queries only

**Implementation:**
```typescript
// GOOD: Parameterized query
async function getEventsByAuthor(pubkey: string): Promise<NostrEvent[]> {
  const result = await db.query(
    `SELECT * FROM events WHERE pubkey = $1 ORDER BY created_at DESC LIMIT 100`,
    [pubkey]
  );
  return result.rows;
}

// BAD: String concatenation (NEVER DO THIS)
async function getEventsByAuthorUnsafe(pubkey: string): Promise<NostrEvent[]> {
  const result = await db.query(
    `SELECT * FROM events WHERE pubkey = '${pubkey}'` // VULNERABLE
  );
  return result.rows;
}
```

**Enforcement:**
- ESLint rule: Disallow template literals in db.query()
- Code review checklist: All database queries use parameters
- Static analysis: Scan for SQL injection patterns in CI

#### XSS Protection (Dashboard)

**Mechanism:** Content Security Policy + input sanitization

**Implementation:**
```typescript
// Fastify CSP plugin
fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"], // No inline scripts
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for simplicity
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"], // Only connect to same origin
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
});

// Dashboard HTML - no inline scripts
// app.js loads via <script src="/static/app.js"></script>

// Sanitize user input (event content display)
function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
    ALLOWED_ATTR: ['href']
  });
}
```

#### Secret Management

**Environment Variables (Never Hardcode):**
```bash
# .env (local development)
DASSIE_RPC_URL=ws://localhost:5000/trpc
DASSIE_RPC_TOKEN=<generated-token>
DASHBOARD_USERNAME=operator
DASHBOARD_PASSWORD=<generated-password>
ARWEAVE_WALLET_PATH=/secrets/arweave-keyfile.json
POSTGRES_PASSWORD=<generated-password>
AKASH_PROVIDER_ADDRESS=<cosmos-address>
```

**Akash Deployment (Secrets Injection):**
```yaml
# akash/deploy.yaml
services:
  nostream:
    image: ghcr.io/yourorg/nostream-ilp:latest
    env:
      - DASSIE_RPC_TOKEN=  # Injected via Akash CLI
      - DASHBOARD_PASSWORD=  # Injected via Akash CLI
      - ARWEAVE_WALLET_PATH=/secrets/arweave.json
    # ... rest of config
```

**Deployment Command:**
```bash
# Set secrets before deployment
akash deployment create deploy.yaml \
  --env DASSIE_RPC_TOKEN=$(cat .secrets/dassie-token) \
  --env DASHBOARD_PASSWORD=$(cat .secrets/dashboard-pw)
```

**Arweave Wallet Security:**
- Store JWK file in persistent volume (not in Docker image)
- Encrypt volume at rest (Akash provider-level encryption)
- Limit wallet balance (only fund what's needed for 1 month)
- Monitor wallet balance; alert if unexpected withdrawals

### Network Security

#### Container Network Isolation

**Akash SDL Configuration:**
```yaml
# Only expose necessary ports externally
services:
  nostream:
    expose:
      - port: 443
        as: 443
        to:
          - global: true  # Public WebSocket + Dashboard
      - port: 5432
        to:
          - service: nostream  # PostgreSQL only accessible within deployment

  dassie:
    expose:
      - port: 5000
        to:
          - service: nostream  # Dassie RPC only accessible to nostream
          - global: false  # NOT exposed to internet
```

**Result:**
- Nostream WebSocket/HTTPS: Public (port 443)
- Dassie RPC: Internal only (nostream can connect, internet cannot)
- PostgreSQL: Internal only (nostream can connect)
- Redis: Internal only (nostream can connect)

#### TLS/SSL Configuration

**WebSocket TLS (wss://):**
```typescript
// Fastify HTTPS configuration
fastify.register(require('@fastify/websocket'), {
  options: {
    maxPayload: 131072, // 128KB max message size
    perMessageDeflate: true // Compression
  }
});

// TLS certificate (via Let's Encrypt on Akash provider)
// Akash providers auto-provision TLS for exposed ports
```

**Dassie RPC TLS (optional internal encryption):**
```typescript
// Even though internal-only, can add TLS for defense in depth
const wsClient = createWSClient({
  url: 'wss://dassie:5000/trpc', // wss instead of ws
  // ... rest of config
});
```

### Rate Limiting & DoS Protection

#### Per-IP Rate Limits

**Implementation:**
```typescript
import rateLimit from '@fastify/rate-limit';

// Apply to WebSocket connections
fastify.register(rateLimit, {
  max: 100, // 100 requests per window
  timeWindow: '1 minute',
  cache: 10000, // Cache 10k IP addresses
  skipOnError: true, // Don't block if Redis is down
  redis: redisClient, // Shared Redis for distributed rate limiting
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for'] || req.ip; // Use real IP behind proxy
  }
});
```

#### Per-Pubkey Rate Limits

**Implementation:**
```typescript
const pubkeyLimits = new Map<string, { count: number; resetAt: number }>();

function checkPubkeyRateLimit(pubkey: string): boolean {
  const now = Date.now();
  const limit = pubkeyLimits.get(pubkey);

  if (!limit || now > limit.resetAt) {
    // Reset window
    pubkeyLimits.set(pubkey, {
      count: 1,
      resetAt: now + 60000 // 1 minute window
    });
    return true;
  }

  if (limit.count >= 100) { // 100 events per minute per pubkey
    logger.warn({
      event: 'rate_limit_exceeded',
      pubkey,
      count: limit.count
    });
    return false;
  }

  limit.count++;
  return true;
}

// In event handler
if (!checkPubkeyRateLimit(event.pubkey)) {
  return sendError(ws, 'rate-limited: too many events');
}
```

#### Subscription Limits

**Implementation:**
```typescript
const MAX_SUBSCRIPTIONS_PER_CLIENT = 20;

function handleReqMessage(ws: WebSocket, subscriptionId: string, filters: Filter[]) {
  // Count active subscriptions for this connection
  const activeCount = ws.metadata.subscriptions?.size || 0;

  if (activeCount >= MAX_SUBSCRIPTIONS_PER_CLIENT) {
    return send(ws, ['NOTICE', `Maximum ${MAX_SUBSCRIPTIONS_PER_CLIENT} subscriptions allowed`]);
  }

  // Validate filter complexity (prevent expensive queries)
  if (filters.length > 10) {
    return send(ws, ['NOTICE', 'Too many filters in REQ']);
  }

  for (const filter of filters) {
    if (filter.authors?.length > 100) {
      return send(ws, ['NOTICE', 'Too many authors in filter (max 100)']);
    }
    if (filter.kinds?.length > 20) {
      return send(ws, ['NOTICE', 'Too many kinds in filter (max 20)']);
    }
  }

  // Create subscription
  // ...
}
```

### Security Monitoring

#### Suspicious Activity Alerts

**Trigger Alerts On:**
- Replay attack attempts (old nonce reused)
- Invalid signature attempts (>10 per minute from same pubkey)
- Rate limit exceeded (>5x in 10 minutes from same IP)
- Large balance drain from Arweave wallet (>10 AR in 1 hour)
- Dassie RPC authentication failures
- Dashboard login failures (>5 attempts)

**Alert Implementation:**
```typescript
class SecurityMonitor {
  async logSecurityEvent(event: SecurityEvent) {
    logger.error({
      type: 'security_event',
      ...event
    });

    // Check if should alert operator
    if (event.severity === 'CRITICAL') {
      await this.sendOperatorAlert(event);
    }
  }

  async sendOperatorAlert(event: SecurityEvent) {
    // Send via configured channel (email, Telegram, etc.)
    const message = `SECURITY ALERT: ${event.type}\n${JSON.stringify(event, null, 2)}`;

    if (process.env.ALERT_WEBHOOK_URL) {
      await fetch(process.env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message })
      });
    }
  }
}
```

#### Audit Logging

**Log All Security-Relevant Events:**
```typescript
interface AuditLog {
  timestamp: Date;
  event_type: string;
  actor: string; // pubkey or IP
  action: string;
  resource: string;
  outcome: 'success' | 'failure';
  details: Record<string, any>;
}

// Example: Log payment verification
auditLogger.log({
  timestamp: new Date(),
  event_type: 'payment_verification',
  actor: event.pubkey,
  action: 'verify_claim',
  resource: `channel:${claim.channelId}`,
  outcome: isValid ? 'success' : 'failure',
  details: {
    amount: claim.amountSats,
    nonce: claim.nonce,
    currency: claim.currency
  }
});

// Store in PostgreSQL audit_logs table
// Retention: 90 days, then archive to Arweave
```

---

## Deployment Architecture

### Akash Network Deployment

The relay deploys to Akash Network, a decentralized cloud compute marketplace. Akash provides cost-effective hosting (~$2.50-5/month) with the unique capability for the relay to **pay its own hosting bills** using earned AKT tokens.

#### Akash SDL (Stack Definition Language)

**File:** `akash/deploy.yaml`

```yaml
---
version: "2.0"

services:
  nostream:
    image: ghcr.io/yourorg/nostream-ilp:latest
    expose:
      - port: 443
        as: 443
        to:
          - global: true
        proto: tcp
        accept:
          - wss://relay.yourdomain.com
    env:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://nostream:password@postgres:5432/nostream
      - REDIS_URL=redis://redis:6379
      - DASSIE_RPC_URL=ws://dassie:5000/trpc
      - DASSIE_RPC_TOKEN=  # Injected at deployment
      - ARWEAVE_WALLET_PATH=/secrets/arweave-keyfile.json
      - DASHBOARD_USERNAME=  # Injected at deployment
      - DASHBOARD_PASSWORD=  # Injected at deployment
    depends_on:
      - postgres
      - redis
      - dassie

  dassie:
    image: ghcr.io/yourorg/dassie-relay:latest
    expose:
      - port: 5000
        to:
          - service: nostream
        proto: tcp
    env:
      - NODE_ENV=production
      - DASSIE_RPC_TOKEN=  # Injected at deployment (same as nostream)
      - SETTLEMENT_ENABLED=true

  postgres:
    image: postgres:14-alpine
    expose:
      - port: 5432
        to:
          - service: nostream
    env:
      - POSTGRES_USER=nostream
      - POSTGRES_PASSWORD=  # Injected at deployment
      - POSTGRES_DB=nostream

  redis:
    image: redis:7-alpine
    expose:
      - port: 6379
        to:
          - service: nostream

profiles:
  compute:
    nostream:
      resources:
        cpu:
          units: 0.5  # 500 millicores
        memory:
          size: 1Gi
        storage:
          size: 10Gi  # For PostgreSQL + logs
    dassie:
      resources:
        cpu:
          units: 0.25
        memory:
          size: 512Mi
        storage:
          size: 1Gi  # SQLite ledger
    postgres:
      resources:
        cpu:
          units: 0.25
        memory:
          size: 512Mi
        storage:
          size: 20Gi  # Event storage
    redis:
      resources:
        cpu:
          units: 0.1
        memory:
          size: 256Mi
        storage:
          size: 1Gi

  placement:
    dcloud:
      pricing:
        nostream:
          denom: uakt
          amount: 1000  # Max price willing to pay per block
        dassie:
          denom: uakt
          amount: 500
        postgres:
          denom: uakt
          amount: 500
        redis:
          denom: uakt
          amount: 200

deployment:
  nostream:
    dcloud:
      profile: nostream
      count: 1
  dassie:
    dcloud:
      profile: dassie
      count: 1
  postgres:
    dcloud:
      profile: postgres
      count: 1
  redis:
    dcloud:
      profile: redis
      count: 1
```

#### Deployment Steps

**1. Build Docker Images**

```bash
# Build Nostream image
cd nostream-ilp
docker build -f docker/Dockerfile.nostream -t ghcr.io/yourorg/nostream-ilp:v1.0.0 .
docker push ghcr.io/yourorg/nostream-ilp:v1.0.0

# Build Dassie image
cd ../dassie
docker build -f docker/Dockerfile.dassie -t ghcr.io/yourorg/dassie-relay:v1.0.0 .
docker push ghcr.io/yourorg/dassie-relay:v1.0.0
```

**2. Generate Secrets**

```bash
# Generate secure tokens
DASSIE_RPC_TOKEN=$(openssl rand -hex 32)
DASHBOARD_PASSWORD=$(openssl rand -base64 24)
POSTGRES_PASSWORD=$(openssl rand -base64 24)

# Save to .secrets/ directory (gitignored)
echo $DASSIE_RPC_TOKEN > .secrets/dassie-token
echo $DASHBOARD_PASSWORD > .secrets/dashboard-pw
echo $POSTGRES_PASSWORD > .secrets/postgres-pw
```

**3. Deploy to Akash**

```bash
# Set environment variables for injection
export DASSIE_RPC_TOKEN=$(cat .secrets/dassie-token)
export DASHBOARD_USERNAME=operator
export DASHBOARD_PASSWORD=$(cat .secrets/dashboard-pw)
export POSTGRES_PASSWORD=$(cat .secrets/postgres-pw)

# Create deployment
akash tx deployment create akash/deploy.yaml \
  --from <your-akash-wallet> \
  --node https://rpc.akashnet.net:443 \
  --chain-id akashnet-2 \
  --gas auto \
  --gas-adjustment 1.3

# Wait for bids from providers (~30 seconds)
akash query market lease list --owner <your-address>

# Accept lowest bid
akash tx market lease create \
  --dseq <deployment-sequence> \
  --provider <provider-address> \
  --from <your-akash-wallet>

# Send manifest (with secrets injected)
akash provider send-manifest akash/deploy.yaml \
  --dseq <deployment-sequence> \
  --provider <provider-address> \
  --from <your-akash-wallet>
```

**4. Verify Deployment**

```bash
# Get deployment status
akash provider lease-status \
  --dseq <deployment-sequence> \
  --provider <provider-address> \
  --from <your-akash-wallet>

# Get public URL
akash provider lease-status ... | jq '.services.nostream.uris[0]'
# Output: https://abc123.provider.akash.network

# Test WebSocket connection
wscat -c wss://abc123.provider.akash.network

# Test dashboard
curl -u operator:$DASHBOARD_PASSWORD https://abc123.provider.akash.network/dashboard/health
```

### Docker Containerization

#### Nostream Dockerfile

**File:** `docker/Dockerfile.nostream`

```dockerfile
# Multi-stage build for smaller image size
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8

# Copy dependency files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm build

# Prune dev dependencies
RUN pnpm prune --prod

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create secrets directory
RUN mkdir -p /secrets

# Expose WebSocket port
EXPOSE 443

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:443/dashboard/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Run server
CMD ["node", "dist/server.js"]
```

#### Dassie Dockerfile

**File:** `dassie/docker/Dockerfile.dassie`

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8

# Copy root package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all packages
COPY packages ./packages

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build Dassie
RUN pnpm --filter @dassie/app-dassie build

# Production stage
FROM node:22-alpine

WORKDIR /app

RUN npm install -g pnpm@8

# Copy built Dassie app
COPY --from=builder /app/packages/app-dassie/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create ledger directory
RUN mkdir -p /data/ledger

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

CMD ["node", "dist/index.js"]
```

### CI/CD Pipeline (GitHub Actions)

**File:** `.github/workflows/deploy.yml`

```yaml
name: Build and Deploy to Akash

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install pnpm
        run: npm install -g pnpm@8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run linter
        run: pnpm lint

      - name: Run type check
        run: pnpm typecheck

      - name: Run unit tests
        run: pnpm test:unit

      - name: Run integration tests
        run: pnpm test:integration

  build-nostream:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/nostream-ilp
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.nostream
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  build-dassie:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4
        with:
          repository: justmoon/dassie  # Or your fork
          ref: main

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Dassie image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile.dassie
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/dassie-relay:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-akash:
    needs: [build-nostream, build-dassie]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'

    steps:
      - uses: actions/checkout@v4

      - name: Install Akash CLI
        run: |
          wget https://github.com/akash-network/provider/releases/download/v0.4.6/akash_0.4.6_linux_amd64.zip
          unzip akash_0.4.6_linux_amd64.zip
          chmod +x akash
          sudo mv akash /usr/local/bin/

      - name: Deploy to Akash
        env:
          AKASH_KEYRING_BACKEND: test
          AKASH_CHAIN_ID: akashnet-2
          AKASH_NODE: https://rpc.akashnet.net:443
          DASSIE_RPC_TOKEN: ${{ secrets.DASSIE_RPC_TOKEN }}
          DASHBOARD_PASSWORD: ${{ secrets.DASHBOARD_PASSWORD }}
          POSTGRES_PASSWORD: ${{ secrets.POSTGRES_PASSWORD }}
        run: |
          # Import wallet from secret
          echo "${{ secrets.AKASH_WALLET_MNEMONIC }}" | akash keys add deployer --recover

          # Create or update deployment
          akash tx deployment create akash/deploy.yaml \
            --from deployer \
            --gas auto \
            --gas-adjustment 1.3 \
            --yes

          # Wait for lease creation (handled by automation script)
          ./scripts/akash-auto-lease.sh
```

### Local Development Environment

**File:** `docker/docker-compose.yml`

```yaml
version: '3.8'

services:
  nostream:
    build:
      context: ..
      dockerfile: docker/Dockerfile.nostream
    ports:
      - "3000:443"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://nostream:password@postgres:5432/nostream
      - REDIS_URL=redis://redis:6379
      - DASSIE_RPC_URL=ws://dassie:5000/trpc
      - DASSIE_RPC_TOKEN=dev-token-insecure
      - ARWEAVE_WALLET_PATH=/app/.secrets/arweave-dev.json
      - DASHBOARD_USERNAME=operator
      - DASHBOARD_PASSWORD=dev-password
    volumes:
      - ../src:/app/src  # Hot reload
      - ../.secrets:/app/.secrets
    depends_on:
      - postgres
      - redis
      - dassie

  dassie:
    build:
      context: ../../dassie
      dockerfile: docker/Dockerfile.dassie
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=development
      - DASSIE_RPC_TOKEN=dev-token-insecure
    volumes:
      - dassie-data:/data/ledger

  postgres:
    image: postgres:14-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=nostream
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=nostream
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ../database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  # Optional: pgAdmin for database management
  pgadmin:
    image: dpage/pgadmin4
    ports:
      - "5050:80"
    environment:
      - PGADMIN_DEFAULT_EMAIL=admin@relay.local
      - PGADMIN_DEFAULT_PASSWORD=admin

volumes:
  postgres-data:
  redis-data:
  dassie-data:
```

**Usage:**

```bash
# Start all services
docker-compose -f docker/docker-compose.yml up -d

# View logs
docker-compose -f docker/docker-compose.yml logs -f nostream

# Run migrations
docker-compose -f docker/docker-compose.yml exec nostream pnpm migrate

# Stop all services
docker-compose -f docker/docker-compose.yml down

# Reset all data
docker-compose -f docker/docker-compose.yml down -v
```

### Database Migrations

**Strategy:** Sequential SQL migrations with version tracking

**Migration Files:**

```
database/migrations/
├── 001_base_nostream.sql         # Original Nostream schema
├── 002_add_payment_tracking.sql  # Payment channel tables
├── 003_add_economic_snapshots.sql # Economic monitoring
├── 004_add_arweave_backups.sql   # Arweave backup tracking
└── 005_add_audit_logs.sql        # Security audit logs
```

**Example Migration (002):**

```sql
-- database/migrations/002_add_payment_tracking.sql

-- Payment channels table
CREATE TABLE payment_channels (
    channel_id VARCHAR(128) PRIMARY KEY,
    blockchain VARCHAR(10) NOT NULL CHECK (blockchain IN ('BTC', 'BASE', 'AKT', 'XRP')),
    sender VARCHAR(256) NOT NULL,
    recipient VARCHAR(256) NOT NULL,
    capacity BIGINT NOT NULL,
    balance BIGINT NOT NULL,
    highest_nonce INTEGER NOT NULL DEFAULT 0,
    expiration TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_channels_sender ON payment_channels(sender);
CREATE INDEX idx_payment_channels_status ON payment_channels(status);

-- Payment claims table (for audit trail)
CREATE TABLE payment_claims (
    id SERIAL PRIMARY KEY,
    channel_id VARCHAR(128) NOT NULL REFERENCES payment_channels(channel_id),
    event_id VARCHAR(64) NOT NULL REFERENCES events(id),
    amount_sats BIGINT NOT NULL,
    nonce INTEGER NOT NULL,
    signature VARCHAR(256) NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (channel_id, nonce)
);

CREATE INDEX idx_payment_claims_event_id ON payment_claims(event_id);
CREATE INDEX idx_payment_claims_verified_at ON payment_claims(verified_at);

-- Update events table to track payment requirement
ALTER TABLE events ADD COLUMN requires_payment BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN payment_amount BIGINT;
ALTER TABLE events ADD COLUMN payment_verified BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_events_requires_payment ON events(requires_payment) WHERE requires_payment = TRUE;
```

**Migration Runner:**

```typescript
// src/database/migrator.ts
import { readdir, readFile } from 'fs/promises';
import { Pool } from 'pg';

export class Migrator {
  constructor(private db: Pool) {}

  async migrate() {
    // Create migrations table if not exists
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get applied migrations
    const result = await this.db.query('SELECT version FROM schema_migrations ORDER BY version');
    const appliedVersions = new Set(result.rows.map(r => r.version));

    // Get migration files
    const files = await readdir('database/migrations');
    const migrations = files
      .filter(f => f.endsWith('.sql'))
      .map(f => ({
        version: parseInt(f.split('_')[0]),
        file: f
      }))
      .sort((a, b) => a.version - b.version);

    // Apply pending migrations
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        console.log(`Migration ${migration.version} already applied, skipping`);
        continue;
      }

      console.log(`Applying migration ${migration.version}: ${migration.file}`);

      const sql = await readFile(`database/migrations/${migration.file}`, 'utf8');

      await this.db.query('BEGIN');
      try {
        await this.db.query(sql);
        await this.db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migration.version]);
        await this.db.query('COMMIT');
        console.log(`Migration ${migration.version} applied successfully`);
      } catch (error) {
        await this.db.query('ROLLBACK');
        console.error(`Migration ${migration.version} failed:`, error);
        throw error;
      }
    }
  }
}
```

**Run migrations on startup:**

```typescript
// src/server.ts
import { Migrator } from './database/migrator';

async function startServer() {
  // Connect to database
  const db = new Pool({ connectionString: process.env.DATABASE_URL });

  // Run migrations
  const migrator = new Migrator(db);
  await migrator.migrate();

  // Start server
  await fastify.listen({ port: 443, host: '0.0.0.0' });
}
```

### Environment-Specific Configuration

**Development (.env.development):**
```bash
NODE_ENV=development
DATABASE_URL=postgresql://nostream:password@localhost:5432/nostream
REDIS_URL=redis://localhost:6379
DASSIE_RPC_URL=ws://localhost:5000/trpc
DASSIE_RPC_TOKEN=dev-token-insecure
DASHBOARD_USERNAME=operator
DASHBOARD_PASSWORD=dev-password
ARWEAVE_WALLET_PATH=./.secrets/arweave-dev.json
LOG_LEVEL=debug
```

**Production (Akash environment variables):**
```bash
NODE_ENV=production
DATABASE_URL=postgresql://nostream:<injected>@postgres:5432/nostream
REDIS_URL=redis://redis:6379
DASSIE_RPC_URL=ws://dassie:5000/trpc
DASSIE_RPC_TOKEN=<injected-via-akash-cli>
DASHBOARD_USERNAME=<injected>
DASHBOARD_PASSWORD=<injected>
ARWEAVE_WALLET_PATH=/secrets/arweave-keyfile.json
LOG_LEVEL=info
```

---

## Monitoring & Observability

### Logging Strategy

**Technology:** Pino (high-performance JSON logger)

**Log Levels:**
- `fatal`: System is unusable (Dassie RPC connection permanently lost)
- `error`: Error events that might still allow the application to continue running
- `warn`: Potentially harmful situations (low AKT balance, unprofitable)
- `info`: Informational messages highlighting progress (startup, shutdown, payment verified)
- `debug`: Detailed information for debugging (WebSocket messages, RPC calls)
- `trace`: Very detailed information (event content, full stack traces)

**Structured Logging Format:**

```typescript
// src/config/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'nostream-ilp',
    environment: process.env.NODE_ENV,
  },
});

// Usage examples
logger.info({ event: 'server_started', port: 443 }, 'Server listening');

logger.error({
  event: 'payment_verification_failed',
  channelId: claim.channelId,
  reason: 'insufficient_balance',
  amountRequested: claim.amountSats,
  availableBalance: channel.balance
}, 'Payment verification failed');

logger.debug({
  event: 'nostr_event_received',
  eventId: event.id,
  kind: event.kind,
  pubkey: event.pubkey
}, 'Received Nostr event');
```

**Log Aggregation:**

For production, logs are written to stdout (captured by Akash provider) and optionally shipped to external service:

```typescript
// Optional: Ship logs to Loki/Grafana Cloud
if (process.env.LOKI_URL) {
  const transport = pino.transport({
    target: 'pino-loki',
    options: {
      batching: true,
      interval: 5,
      host: process.env.LOKI_URL,
      basicAuth: {
        username: process.env.LOKI_USERNAME,
        password: process.env.LOKI_PASSWORD
      },
      labels: {
        service: 'nostream-ilp',
        environment: process.env.NODE_ENV
      }
    }
  });

  logger = pino(logger.options, transport);
}
```

### Metrics Collection

**Technology:** Prometheus-compatible metrics exposed via `/metrics` endpoint

**Key Metrics:**

```typescript
// src/services/metrics.ts
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export const register = new Registry();

// Event processing metrics
export const eventsReceived = new Counter({
  name: 'nostream_events_received_total',
  help: 'Total number of Nostr events received',
  labelNames: ['kind', 'result'], // result: accepted, rejected_payment, rejected_signature
  registers: [register]
});

export const eventsStored = new Counter({
  name: 'nostream_events_stored_total',
  help: 'Total number of events stored in database',
  labelNames: ['kind'],
  registers: [register]
});

// Payment metrics
export const paymentsVerified = new Counter({
  name: 'nostream_payments_verified_total',
  help: 'Total number of payment claims verified',
  labelNames: ['currency', 'result'], // result: valid, invalid_signature, insufficient_balance, replay_attack
  registers: [register]
});

export const revenueEarned = new Gauge({
  name: 'nostream_revenue_total',
  help: 'Total revenue earned (in currency base units)',
  labelNames: ['currency'],
  registers: [register]
});

// Channel metrics
export const activeChannels = new Gauge({
  name: 'nostream_payment_channels_active',
  help: 'Number of active payment channels',
  labelNames: ['blockchain'],
  registers: [register]
});

// WebSocket metrics
export const connectedClients = new Gauge({
  name: 'nostream_connected_clients',
  help: 'Number of connected WebSocket clients',
  registers: [register]
});

export const activeSubscriptions = new Gauge({
  name: 'nostream_active_subscriptions',
  help: 'Number of active Nostr subscriptions',
  registers: [register]
});

// Performance metrics
export const eventProcessingDuration = new Histogram({
  name: 'nostream_event_processing_duration_seconds',
  help: 'Event processing duration',
  labelNames: ['kind'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register]
});

export const paymentVerificationDuration = new Histogram({
  name: 'nostream_payment_verification_duration_seconds',
  help: 'Payment verification duration',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
  registers: [register]
});

// Arweave metrics
export const arweaveUploads = new Counter({
  name: 'nostream_arweave_uploads_total',
  help: 'Total number of Arweave uploads',
  labelNames: ['type'], // type: event, backup
  registers: [register]
});

export const arweaveSpend = new Gauge({
  name: 'nostream_arweave_spend_winston',
  help: 'Total AR spent on uploads (in winston)',
  registers: [register]
});

// Economic Monitor metrics
export const profitability = new Gauge({
  name: 'nostream_profit_uakt',
  help: 'Current profit/loss (in uakt)',
  registers: [register]
});

export const aktBalance = new Gauge({
  name: 'nostream_akt_balance',
  help: 'Current AKT balance for Akash payments',
  registers: [register]
});
```

**Metrics Endpoint:**

```typescript
// src/dashboard/routes/metrics.ts
import { register } from '../../services/metrics';

export async function handleMetrics(req, reply) {
  reply.header('Content-Type', register.contentType);
  return register.metrics();
}

// Register route (public, no auth required for Prometheus scraping)
fastify.get('/metrics', handleMetrics);
```

**Prometheus Scrape Config:**

```yaml
# prometheus.yml (if self-hosting Prometheus)
scrape_configs:
  - job_name: 'nostream-ilp-relay'
    scrape_interval: 15s
    static_configs:
      - targets: ['relay.yourdomain.com:443']
    metrics_path: '/metrics'
```

### Alerting Rules

**Technology:** Prometheus Alertmanager or Grafana Alerts

**Critical Alerts:**

```yaml
# alerts.yml
groups:
  - name: nostream_critical
    interval: 1m
    rules:
      - alert: NostrumServiceDown
        expr: up{job="nostream-ilp-relay"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Nostream relay is down"
          description: "The relay has been unreachable for 2 minutes"

      - alert: DassieRPCDown
        expr: nostream_dassie_rpc_connected == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Dassie RPC connection lost"
          description: "Cannot verify payments without Dassie connection"

      - alert: DatabaseConnectionLost
        expr: nostream_database_connected == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL connection lost"
          description: "Cannot store events without database"

      - alert: LowAKTBalance
        expr: nostream_akt_balance < 5000000  # Less than 5 AKT
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "AKT balance critically low"
          description: "{{ $value }} uakt remaining. Cannot pay Akash provider soon."

      - alert: RelayUnprofitable
        expr: nostream_profit_uakt < -10000000  # Losing more than 10 AKT
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Relay operating at a loss"
          description: "Cumulative loss: {{ $value }} uakt over 1 hour"

      - alert: HighPaymentFailureRate
        expr: rate(nostream_payments_verified_total{result!="valid"}[5m]) / rate(nostream_payments_verified_total[5m]) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High payment verification failure rate"
          description: "{{ $value | humanizePercentage }} of payments failing"

      - alert: ArweaveWalletDepleted
        expr: nostream_arweave_wallet_balance_winston < 1000000000  # Less than 0.001 AR
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Arweave wallet balance low"
          description: "Cannot upload content or backups soon"
```

**Alert Notification Channels:**

```yaml
# alertmanager.yml
receivers:
  - name: 'operator-telegram'
    telegram_configs:
      - bot_token: '<telegram-bot-token>'
        chat_id: '<your-chat-id>'
        message: |
          Alert: {{ .GroupLabels.alertname }}
          Severity: {{ .CommonLabels.severity }}
          {{ .CommonAnnotations.description }}

  - name: 'operator-email'
    email_configs:
      - to: 'operator@relay.com'
        from: 'alerts@relay.com'
        smarthost: 'smtp.gmail.com:587'
        auth_username: '<email>'
        auth_password: '<app-password>'

route:
  receiver: 'operator-telegram'
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'operator-email'
      continue: true
```

### Dashboard Visualization

**Technology:** Grafana

**Key Dashboards:**

**1. Relay Health Overview**
- Uptime / connected clients / active subscriptions
- Event throughput (events/sec)
- Payment verification success rate
- Database query performance

**2. Revenue & Profitability**
- Revenue by currency (BTC, BASE, AKT, XRP)
- Expenses (Arweave, Akash)
- Net profit over time
- AKT balance remaining

**3. Payment Channels**
- Active channels by blockchain
- Channel balances over time
- Payment verification latency
- Failed payment reasons (pie chart)

**4. Performance Metrics**
- Event processing latency (p50, p95, p99)
- Payment verification latency
- Database query duration
- WebSocket message queue depth

**Example Grafana Panel (JSON):**

```json
{
  "title": "Event Processing Latency",
  "targets": [
    {
      "expr": "histogram_quantile(0.50, rate(nostream_event_processing_duration_seconds_bucket[5m]))",
      "legendFormat": "p50"
    },
    {
      "expr": "histogram_quantile(0.95, rate(nostream_event_processing_duration_seconds_bucket[5m]))",
      "legendFormat": "p95"
    },
    {
      "expr": "histogram_quantile(0.99, rate(nostream_event_processing_duration_seconds_bucket[5m]))",
      "legendFormat": "p99"
    }
  ],
  "yAxis": {
    "format": "s",
    "label": "Latency"
  }
}
```

### Distributed Tracing

**Technology:** OpenTelemetry (optional for advanced debugging)

**Trace Payment Flow:**

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('nostream-ilp');

async function handleEventWithTracing(event: NostrEvent) {
  return tracer.startActiveSpan('handle_event', async (span) => {
    span.setAttribute('event.id', event.id);
    span.setAttribute('event.kind', event.kind);
    span.setAttribute('event.pubkey', event.pubkey);

    try {
      // Extract payment claim
      const claim = await tracer.startActiveSpan('extract_payment_claim', async (childSpan) => {
        const claim = extractPaymentClaim(event.tags);
        childSpan.setAttribute('claim.channelId', claim?.channelId);
        childSpan.end();
        return claim;
      });

      // Verify payment via Dassie RPC
      const isValid = await tracer.startActiveSpan('verify_payment', async (childSpan) => {
        childSpan.setAttribute('claim.amount', claim.amountSats);
        const result = await paymentVerifier.verify(claim);
        childSpan.setAttribute('verification.result', result);
        childSpan.end();
        return result;
      });

      // Store event
      await tracer.startActiveSpan('store_event', async (childSpan) => {
        await eventRepository.save(event);
        childSpan.end();
      });

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

---

## Error Handling & Resilience

### Error Classification

**1. Transient Errors (Retry):**
- Database connection timeout
- Dassie RPC connection lost
- Arweave upload timeout
- Redis connection failure

**2. Permanent Errors (Fail Fast):**
- Invalid Nostr event signature
- Invalid payment claim signature
- Insufficient channel balance
- Expired payment channel

**3. Degraded Mode Errors (Continue with Reduced Functionality):**
- Arweave service down → Store events without archival
- Redis cache down → Fall back to database queries
- Dashboard unavailable → Relay continues serving Nostr clients

### Retry Strategies

**Exponential Backoff with Jitter:**

```typescript
// src/utils/retry.ts
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    jitterFactor?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 5,
    initialDelayMs = 100,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    jitterFactor = 0.1
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;

      if (attempt >= maxAttempts) {
        throw error;
      }

      // Add jitter to prevent thundering herd
      const jitter = delay * jitterFactor * (Math.random() - 0.5);
      const actualDelay = Math.min(delay + jitter, maxDelayMs);

      logger.warn({
        event: 'retry_attempt',
        attempt,
        maxAttempts,
        delayMs: actualDelay,
        error: error.message
      }, `Retrying after error (attempt ${attempt}/${maxAttempts})`);

      await sleep(actualDelay);

      delay *= backoffMultiplier;
    }
  }
}
```

**Usage Example (Dassie RPC):**

```typescript
async function verifyPaymentWithRetry(claim: PaymentClaim): Promise<boolean> {
  return retryWithBackoff(
    async () => {
      return await dassieClient.payment.verifyPaymentClaim(claim);
    },
    {
      maxAttempts: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000
    }
  );
}
```

### Circuit Breaker Pattern

**Purpose:** Prevent cascading failures when Dassie/Arweave are down

```typescript
// src/utils/circuit-breaker.ts
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;

  constructor(
    private options: {
      failureThreshold: number;
      successThreshold: number;
      timeoutMs: number;
      resetTimeMs: number;
    }
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeMs) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        logger.info({ event: 'circuit_breaker_half_open' });
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        this.timeout()
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async timeout(): Promise<never> {
    await sleep(this.options.timeoutMs);
    throw new Error('Circuit breaker timeout');
  }

  private onSuccess() {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = 'CLOSED';
        logger.info({ event: 'circuit_breaker_closed' });
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'OPEN';
      logger.error({
        event: 'circuit_breaker_open',
        failureCount: this.failureCount
      });
    }
  }
}

// Usage
const dassieCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 5000,
  resetTimeMs: 30000
});

async function callDassie() {
  return dassieCircuitBreaker.execute(async () => {
    return await dassieClient.payment.getChannelState({ channelId: '...' });
  });
}
```

### Graceful Degradation

**Scenario: Arweave Service Unavailable**

```typescript
async function handleLargeContent(event: NostrEvent): Promise<void> {
  try {
    const txId = await arweaveService.upload(event.content, event);
    event.tags.push(['arweave', txId]);
    event.content = ''; // Clear content
  } catch (error) {
    logger.error({
      event: 'arweave_upload_failed',
      eventId: event.id,
      error: error.message
    }, 'Arweave upload failed, storing full content in database');

    // Degrade gracefully: store in PostgreSQL instead
    // Add tag indicating content is NOT in Arweave
    event.tags.push(['arweave_pending', 'true']);

    // Keep full content in database
    // (Economic monitor will retry upload later)
  }
}
```

**Scenario: Redis Cache Down**

```typescript
async function getCachedChannelState(channelId: string): Promise<PaymentChannel> {
  try {
    const cached = await redis.get(`channel:${channelId}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    logger.warn({
      event: 'redis_cache_miss',
      error: error.message
    }, 'Redis unavailable, querying Dassie directly');
  }

  // Fall back to Dassie RPC
  const state = await dassieClient.payment.getChannelState({ channelId });

  // Try to cache for next time (best effort)
  try {
    await redis.setex(`channel:${channelId}`, 30, JSON.stringify(state));
  } catch (error) {
    // Ignore cache write failure
  }

  return state;
}
```

### Health Checks

**Comprehensive Health Check Endpoint:**

```typescript
// src/dashboard/routes/health.ts
export async function handleHealthCheck(req, reply) {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      nostream: 'up',
      dassie_rpc: 'unknown',
      postgresql: 'unknown',
      redis: 'unknown',
      arweave: 'unknown'
    },
    warnings: []
  };

  // Check Dassie RPC
  try {
    await dassieClient.ledger.getBalance({ accountPath: 'akt:assets/settlement' });
    health.services.dassie_rpc = 'up';
  } catch (error) {
    health.services.dassie_rpc = 'down';
    health.status = 'degraded';
    health.warnings.push('Dassie RPC unavailable - payments cannot be verified');
  }

  // Check PostgreSQL
  try {
    await db.query('SELECT 1');
    health.services.postgresql = 'up';
  } catch (error) {
    health.services.postgresql = 'down';
    health.status = 'unhealthy';
    health.warnings.push('PostgreSQL down - cannot store events');
  }

  // Check Redis
  try {
    await redis.ping();
    health.services.redis = 'up';
  } catch (error) {
    health.services.redis = 'down';
    health.warnings.push('Redis down - caching disabled');
  }

  // Check Arweave
  try {
    const balance = await arweaveWallet.getBalance();
    health.services.arweave = 'up';
    if (parseInt(balance) < 1000000000) { // < 0.001 AR
      health.warnings.push(`Arweave wallet low (${balance} winston)`);
    }
  } catch (error) {
    health.services.arweave = 'down';
    health.warnings.push('Arweave unavailable - archival disabled');
  }

  // Check AKT balance
  try {
    const aktBalance = await dassieClient.ledger.getBalance({ accountPath: 'akt:assets/settlement' });
    if (aktBalance < 5000000) { // < 5 AKT
      health.warnings.push(`AKT balance low (${aktBalance / 1000000} AKT)`);
    }
  } catch (error) {
    // Already warned about Dassie RPC being down
  }

  reply.code(health.status === 'unhealthy' ? 503 : 200);
  return health;
}
```

---

## Performance & Scalability

### Performance Targets

**Latency Goals:**
- Event acceptance: **<10ms** (p95)
- Payment verification: **<50ms** (p95)
- Subscription delivery: **<100ms** (p95)
- Database query: **<5ms** (p95)

**Throughput Goals:**
- **1,000 events/second** sustained
- **10,000 concurrent WebSocket connections**
- **100,000 active subscriptions**

### Database Optimization

**1. Indexing Strategy:**

```sql
-- Events table indexes (already in Nostream)
CREATE INDEX idx_events_kind ON events(kind);
CREATE INDEX idx_events_pubkey ON events(pubkey);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_events_kind_created_at ON events(kind, created_at DESC);

-- Additional indexes for ILP integration
CREATE INDEX idx_events_payment_verified ON events(payment_verified) WHERE requires_payment = TRUE;
CREATE INDEX idx_payment_claims_channel_nonce ON payment_claims(channel_id, nonce);
CREATE INDEX idx_payment_channels_status_blockchain ON payment_channels(status, blockchain) WHERE status = 'OPEN';

-- Partial index for archived events
CREATE INDEX idx_archived_events_kind_date ON archived_events(kind, created_at DESC);
```

**2. Query Optimization:**

```typescript
// BAD: N+1 query problem
for (const event of events) {
  const claims = await db.query('SELECT * FROM payment_claims WHERE event_id = $1', [event.id]);
}

// GOOD: Single JOIN query
const events = await db.query(`
  SELECT e.*, pc.amount_sats, pc.nonce
  FROM events e
  LEFT JOIN payment_claims pc ON pc.event_id = e.id
  WHERE e.pubkey = $1
  ORDER BY e.created_at DESC
  LIMIT 100
`, [pubkey]);
```

**3. Connection Pooling:**

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Max 20 connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
```

### Caching Strategy

**Multi-Layer Cache:**

**L1: In-Memory Cache (Map)**
- Channel states (TTL: 30 seconds)
- NIP-11 relay info (static)
- Pricing configuration (TTL: 5 minutes)

**L2: Redis Cache**
- Recent events (TTL: 10 minutes)
- Subscription filter results (TTL: 1 minute)
- Balance snapshots (TTL: 30 seconds)

**L3: PostgreSQL (Source of Truth)**

```typescript
class CachedChannelService {
  private memCache = new Map<string, { state: PaymentChannel; expiry: number }>();

  async getChannelState(channelId: string): Promise<PaymentChannel> {
    // L1: Check in-memory cache
    const mem = this.memCache.get(channelId);
    if (mem && Date.now() < mem.expiry) {
      return mem.state;
    }

    // L2: Check Redis
    try {
      const cached = await redis.get(`channel:${channelId}`);
      if (cached) {
        const state = JSON.parse(cached);
        this.memCache.set(channelId, { state, expiry: Date.now() + 30000 });
        return state;
      }
    } catch (error) {
      // Redis down, continue to L3
    }

    // L3: Query Dassie RPC
    const state = await dassieClient.payment.getChannelState({ channelId });

    // Populate caches
    this.memCache.set(channelId, { state, expiry: Date.now() + 30000 });
    try {
      await redis.setex(`channel:${channelId}`, 30, JSON.stringify(state));
    } catch (error) {
      // Ignore cache write failure
    }

    return state;
  }
}
```

### WebSocket Optimization

**1. Compression:**

```typescript
fastify.register(require('@fastify/websocket'), {
  options: {
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3 // Lower compression level = faster
      },
      threshold: 1024 // Only compress messages > 1KB
    }
  }
});
```

**2. Backpressure Handling:**

```typescript
function sendEvent(ws: WebSocket, event: NostrEvent) {
  const message = JSON.stringify(['EVENT', subscriptionId, event]);

  // Check if WebSocket buffer is full
  if (ws.bufferedAmount > 100000) { // 100KB backlog
    logger.warn({
      event: 'websocket_backpressure',
      bufferedAmount: ws.bufferedAmount
    }, 'Client cannot keep up, dropping subscription');

    // Close slow clients
    ws.close(1008, 'Cannot keep up with event stream');
    return;
  }

  ws.send(message);
}
```

### Horizontal Scaling (Future)

**Strategy:** Add load balancer + multiple Nostream instances

**Requirements:**
- **Sticky sessions:** WebSocket connections must stay on same instance
- **Shared Redis:** For subscription state synchronization
- **Shared PostgreSQL:** Single source of truth
- **Shared Dassie:** One Dassie node for all Nostream instances

**Architecture:**

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    │   (Sticky WS)   │
                    └────────┬────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
         ┌──────▼──────┐ ┌──▼───────┐ ┌─▼────────┐
         │ Nostream #1 │ │Nostream#2│ │Nostream#3│
         └──────┬──────┘ └──┬───────┘ └─┬────────┘
                │           │            │
                └───────────┼────────────┘
                            │
                   ┌────────┴────────┐
                   │                 │
            ┌──────▼──────┐   ┌─────▼─────┐
            │  PostgreSQL │   │   Redis   │
            │   (Shared)  │   │ (Shared)  │
            └─────────────┘   └───────────┘
                   │
            ┌──────▼──────┐
            │    Dassie   │
            │   (Shared)  │
            └─────────────┘
```

**Implementation Notes:**
- Use Akash persistent storage for PostgreSQL/Redis
- Share Dassie RPC URL across all instances
- Redis pub/sub for cross-instance event broadcasting

---

**End of Backend Architecture Document**

