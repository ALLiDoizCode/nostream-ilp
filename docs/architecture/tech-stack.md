# Tech Stack

## Cloud Infrastructure
- **Provider:** Akash Network (decentralized compute marketplace)
- **Key Services:** Container deployment via SDL, persistent storage, provider billing API
- **Deployment Regions:** Global (provider selection based on cost/performance)

## Technology Stack Table

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
