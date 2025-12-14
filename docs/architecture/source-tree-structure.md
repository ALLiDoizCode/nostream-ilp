# Source Tree Structure

## Monorepo Layout (Updated for Story 2.10)

After the monorepo migration, the project now uses **pnpm workspaces** to manage multiple packages:

```
nostream-ilp/                         # Monorepo root
├── packages/
│   ├── app-nostream/                 # Nostr relay application
│   │   ├── src/
│   │   │   ├── handlers/             # Nostr message handlers
│   │   │   │   ├── event-handler.ts  # EVENT message processing
│   │   │   │   ├── req-handler.ts    # REQ subscription handling
│   │   │   │   ├── close-handler.ts  # CLOSE subscription cleanup
│   │   │   │   └── auth-handler.ts   # AUTH authentication
│   │   │   ├── services/
│   │   │   │   ├── payment/
│   │   │   │   │   ├── dassie-client.ts     # tRPC client for Dassie RPC
│   │   │   │   │   ├── payment-verifier.ts  # Payment claim verification
│   │   │   │   │   ├── channel-tracker.ts   # Payment channel state sync
│   │   │   │   │   └── pricing.ts           # Event kind pricing calculator
│   │   │   │   ├── arweave/
│   │   │   │   │   ├── wallet-manager.ts    # Arweave wallet operations
│   │   │   │   │   ├── upload-service.ts    # Large content upload
│   │   │   │   │   ├── backup-service.ts    # Daily event backup
│   │   │   │   │   └── retrieval-service.ts # Fetch archived events
│   │   │   │   ├── economic-monitor/
│   │   │   │   │   ├── monitor.ts           # Main economic monitor
│   │   │   │   │   ├── profitability.ts     # Profit/loss tracking
│   │   │   │   │   ├── akash-payment.ts     # Automated Akash payments
│   │   │   │   │   └── exchange-rate.ts     # Currency conversion oracle
│   │   │   │   └── nostr/
│   │   │   │       ├── event-repository.ts  # PostgreSQL event storage
│   │   │   │       ├── subscription-manager.ts # WebSocket subscriptions
│   │   │   │       └── nip-validators.ts    # NIP compliance validation
│   │   │   ├── repositories/
│   │   │   │   ├── event.repository.ts      # Event CRUD operations
│   │   │   │   ├── payment.repository.ts    # Payment claim storage
│   │   │   │   ├── economic.repository.ts   # EconomicSnapshot storage
│   │   │   │   └── arweave.repository.ts    # ArweaveBackup metadata
│   │   │   ├── dashboard/                   # Operator dashboard (minimal UI)
│   │   │   ├── config/                      # Configuration loader
│   │   │   ├── utils/                       # Crypto, conversions, errors
│   │   │   └── server.ts                    # Main server entry point
│   │   ├── test/
│   │   │   ├── unit/
│   │   │   └── integration/
│   │   ├── migrations/                      # PostgreSQL migrations
│   │   ├── .nostr/                         # Relay configuration
│   │   ├── package.json                    # @nostream-ilp/app-nostream
│   │   └── tsconfig.json
│   │
│   ├── app-dassie/                 # Dassie ILP node
│   │   ├── src/
│   │   │   ├── backend/
│   │   │   │   ├── settlement/     # Settlement modules (base, cosmos, xrp)
│   │   │   │   └── rpc/            # tRPC router for Nostream integration
│   │   │   ├── index.ts            # Dassie entry point
│   │   │   └── ...                 # Other Dassie modules
│   │   ├── package.json            # @nostream-ilp/app-dassie
│   │   └── tsconfig.json
│   │
│   ├── lib-payment-types/          # Shared TypeScript types
│   │   ├── src/
│   │   │   └── index.ts            # PaymentClaim, AppRouter, etc.
│   │   ├── package.json            # @nostream-ilp/lib-payment-types
│   │   └── tsconfig.json
│   │
│   ├── lib-contracts/              # Smart contracts (Base L2)
│   │   ├── BasePaymentChannel.sol
│   │   ├── MultiTokenPaymentChannelFactory.sol
│   │   ├── test/                   # Contract tests (Hardhat)
│   │   ├── scripts/                # Deployment scripts
│   │   ├── typechain-types/        # TypeChain-generated types
│   │   ├── hardhat.config.ts
│   │   ├── package.json            # @nostream-ilp/lib-contracts
│   │   └── tsconfig.json
│   │
│   └── lib-dassie-*/              # Dassie library packages
│       ├── lib-dassie-reactive/   # Reactive programming primitives
│       ├── lib-dassie-http-server/ # HTTP server utilities
│       ├── lib-dassie-sqlite/     # SQLite ledger abstraction
│       ├── lib-dassie-rpc/        # RPC framework
│       ├── lib-dassie-protocol-ilp/ # ILP protocol implementation
│       └── ...                    # Other Dassie libraries
│
├── docker/
│   ├── Dockerfile.nostream        # Multi-stage build for Nostream
│   └── Dockerfile.dassie          # Multi-stage build for Dassie
├── docker-compose.yml             # Local development stack
├── akash/
│   └── deploy.yaml                # Akash SDL deployment manifest
├── scripts/
│   ├── docker-build.sh
│   ├── docker-start.sh
│   └── akash-deploy.ts
├── pnpm-workspace.yaml            # pnpm workspace configuration
├── package.json                   # Root workspace scripts
├── tsconfig.json                  # Root TypeScript config with references
├── MONOREPO.md                    # Monorepo developer guide
└── README.md
```

---

## Key Packages

| Package | Name | Purpose | Dependencies |
|---------|------|---------|--------------|
| **app-nostream** | `@nostream-ilp/app-nostream` | Main Nostr relay with ILP payments | `lib-payment-types` |
| **app-dassie** | `@nostream-ilp/app-dassie` | Dassie ILP node | `lib-dassie-*` packages |
| **lib-payment-types** | `@nostream-ilp/lib-payment-types` | Shared TypeScript interfaces | None |
| **lib-contracts** | `@nostream-ilp/lib-contracts` | Solidity smart contracts | OpenZeppelin |
| **lib-dassie-reactive** | `@nostream-ilp/lib-dassie-reactive` | Reactive primitives | None |
| **lib-dassie-http-server** | `@nostream-ilp/lib-dassie-http-server` | HTTP server utilities | `lib-dassie-reactive` |
| **lib-dassie-sqlite** | `@nostream-ilp/lib-dassie-sqlite` | Ledger storage | `lib-dassie-reactive` |
| **lib-dassie-rpc** | `@nostream-ilp/lib-dassie-rpc` | tRPC server | `lib-dassie-reactive-rpc` |

---

## Key Files and Their Purposes

| File Path | Purpose | Key Interactions |
|-----------|---------|------------------|
| `packages/app-nostream/src/handlers/event-handler.ts` | Processes incoming Nostr EVENT messages, extracts payment claims | Calls `payment-verifier.ts` → Dassie RPC → PostgreSQL |
| `packages/app-nostream/src/services/payment/dassie-client.ts` | tRPC WebSocket client connecting to Dassie RPC server | Establishes WS to `ws://dassie:5000/trpc`, type-safe API |
| `packages/app-nostream/src/services/payment/payment-verifier.ts` | Core payment verification logic: checks channel balance, nonce, signature | Called by `event-handler.ts` for every paid event |
| `packages/lib-payment-types/src/index.ts` | Shared payment types used by both Nostream and Dassie | Imported by app-nostream, app-dassie |
| `packages/lib-contracts/BasePaymentChannel.sol` | Base L2 payment channel contract | Deployed on Base Sepolia |
| `packages/lib-contracts/MultiTokenPaymentChannelFactory.sol` | Multi-token payment channel factory | Supports multiple ERC-20 tokens on Base L2 |
| `packages/app-dassie/src/backend/settlement/base-settlement.ts` | Settlement module for Base L2: opens channels, verifies claims, closes channels | Implements `SettlementSchemeModule` interface |
| `packages/app-dassie/src/backend/rpc/payment-router.ts` | Custom RPC endpoints for Nostream (verifyPaymentClaim, claimAllChannels) | Called by `dassie-client.ts` |
| `pnpm-workspace.yaml` | Workspace configuration listing all packages | Used by pnpm to resolve workspace dependencies |
| `package.json` (root) | Monorepo scripts (build, test, dev:all) | Entry point for developers |

---

## Package Import Flow

### Example: Payment Verification

```
1. Nostream receives EVENT message
   └─> packages/app-nostream/src/handlers/event-handler.ts

2. Extract PaymentClaim from event tags
   └─> Uses PaymentClaim type from @nostream-ilp/lib-payment-types

3. Verify claim via Dassie RPC
   └─> packages/app-nostream/src/services/payment/dassie-client.ts
       └─> tRPC call to packages/app-dassie/src/backend/rpc/payment-router.ts

4. Dassie checks channel state in SQLite
   └─> packages/app-dassie/src/backend/settlement/base-settlement.ts
       └─> Uses @nostream-ilp/lib-dassie-sqlite

5. Return verification result
   └─> AppRouter interface from @nostream-ilp/lib-payment-types
       └─> dassie-client.ts receives PaymentClaimVerification
           └─> event-handler.ts accepts or rejects event
```

---

## TypeScript Project References

The monorepo uses TypeScript project references for incremental builds:

**Root tsconfig.json:**
```json
{
  "references": [
    { "path": "./packages/lib-payment-types" },
    { "path": "./packages/lib-contracts" },
    { "path": "./packages/app-nostream" },
    { "path": "./packages/app-dassie" }
  ]
}
```

**app-nostream tsconfig.json:**
```json
{
  "extends": "../../tsconfig.json",
  "references": [
    { "path": "../lib-payment-types" }
  ]
}
```

This enables:
- Incremental builds (only rebuild changed packages)
- Type checking across package boundaries
- Better IDE performance

---

## Development Workflow

### 1. Install Dependencies

```bash
pnpm install
```

This installs all packages and links workspace dependencies.

### 2. Build All Packages

```bash
pnpm build
```

Builds in correct order based on dependencies:
1. `lib-payment-types` (no dependencies)
2. `lib-contracts` (independent)
3. `app-nostream` (depends on `lib-payment-types`)
4. `app-dassie` (depends on `lib-dassie-*`)

### 3. Run Development Servers

```bash
# Run Nostream only
pnpm dev:nostream

# Run Dassie only
pnpm dev:dassie

# Run both concurrently
pnpm dev:all
```

### 4. Run Tests

```bash
# All packages
pnpm test

# Specific package
pnpm test:nostream
pnpm test:dassie
pnpm test:contracts
```

---

## Migration from Original Structure

**Before (separate repos):**
```
/Users/jonathangreen/Documents/
├── nostream-ilp/       # Relay + contracts
└── dassie/             # Separate Dassie repo
```

**After (monorepo):**
```
nostream-ilp/
└── packages/
    ├── app-nostream/
    ├── app-dassie/
    ├── lib-payment-types/
    └── lib-contracts/
```

**Benefits:**
- Atomic commits across Nostream + Dassie
- Shared TypeScript types prevent version mismatches
- Single `pnpm install`, single `pnpm build`
- Docker builds from single context

---

**Last Updated:** December 12, 2025
**Story:** 2.10 - Migrate Dassie into Monorepo
