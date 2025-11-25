# Backend System Design

## System Components Overview

The backend consists of **three primary subsystems** working in concert:

1. **Nostream Relay Core** (Nostr protocol handler)
2. **Dassie ILP Node** (Payment routing and verification)
3. **Economic Monitor** (Financial automation)

Supporting services:
- **Arweave Integration** (Permanent storage)
- **Dashboard API** (Operator visibility)

## Component Diagram

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

## Component Specifications

### 1. WebSocket Server (Nostream Entry Point)

**Technology:** Fastify + `ws` library
**Responsibilities:**
- Accept WebSocket connections from Nostr clients
- Parse Nostr protocol messages (EVENT, REQ, CLOSE, AUTH)
- Route messages to appropriate handlers
- Broadcast events to active subscriptions
- Handle connection lifecycle (open, close, error)

**Key Configuration:**
```yaml