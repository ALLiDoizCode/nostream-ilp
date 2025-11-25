# Goals and Background Context

## Goals

- **Enable self-sustaining Nostr relays** that earn revenue from micropayments and use it to pay for their own hosting on Akash Network
- **Marry Interledger Protocol (ILP) with Nostr** by embedding payment claims in Nostr events and enabling cross-ledger micropayment routing
- **Create economic sustainability for permissionless relay infrastructure** where relays operate profitably without donations or external funding
- **Support multi-blockchain payment acceptance** allowing users to pay in BTC, ETH (Base), AKT, or XRP with automatic conversion via ILP connectors
- **Enable relay-as-connector functionality** where relays route ILP payments between peers and earn routing fees to supplement user payment revenue
- **Deliver production-ready deployment on Akash** with automated SDL generation and economic monitoring

## Background Context

The Nostr protocol faces a fundamental sustainability problem: relays provide free storage and bandwidth for users, leading to either centralized corporate-run relays (censorship risk) or volunteer-run relays that eventually shut down due to costs. Previous monetization attempts (donations, subscriptions) have failed because:

1. **Micropayment economics don't work** - Credit card fees ($0.30) make per-event payments impossible
2. **Single-blockchain lock-in** - Users must hold specific tokens (e.g., Lightning sats) to use specific relays
3. **All-or-nothing pricing** - Subscriptions exclude casual users who don't want monthly commitment

The Interledger Protocol (ILP) solves these problems by enabling:
- **Cross-ledger routing** - Users pay in any cryptocurrency (BTC, ETH, BASE, XRP), relays receive preferred currency (AKT)
- **N-hop connector networks** - Payments route through intermediary connectors who provide liquidity and earn fees
- **Micropayment viability** - XRP-style payment channels enable satoshi-level payments with single settlement transaction

By integrating **Nostream** (production TypeScript Nostr relay) with **Dassie** (production ILP implementation) and deploying on **Akash** (decentralized compute marketplace), we create a **self-sustaining economic model**: relays earn more from user micropayments than they pay for Akash hosting, achieving financial independence.

## Existing Solutions We Build Upon

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

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-01-24 | 0.1 | Initial greenfield PRD for Nostr-ILP relay project | Claude/User |
| 2025-01-24 | 0.2 | Updated to use Nostream (fork) + Dassie (integration) two-process architecture | Claude/User |
| 2025-01-24 | 0.3 | Updated to use Dassie's WebSocket RPC API instead of HTTP REST, leveraging existing tRPC infrastructure. Added Story 2.2 for RPC token authentication. | Claude/User |

---
