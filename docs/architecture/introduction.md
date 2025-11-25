# Introduction

This document outlines the overall project architecture for **Nostr-ILP Relay**, including backend systems, shared services, and non-UI specific concerns. Its primary goal is to serve as the guiding architectural blueprint for AI-driven development, ensuring consistency and adherence to chosen patterns and technologies.

**Relationship to Frontend Architecture:**
The project includes a minimal operator dashboard UI. Core technology stack choices documented herein (see "Tech Stack") are definitive for the entire project, including the dashboard frontend components.

## Starter Template or Existing Project

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

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-11-25 | 0.1 | Initial architecture document created from PRD v0.3 | Claude (Architect) |

---
