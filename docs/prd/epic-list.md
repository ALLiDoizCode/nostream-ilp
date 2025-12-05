# Epic List (Revised for BTP-NIPs P2P Network)

## Completed Epics

### Epic 1: Nostream Fork & ILP Integration ✅
**Status:** Complete
**Goal:** Fork Nostream repository, remove centralized payment processors, and integrate with Dassie ILP node via HTTP API for payment claim verification.

### Epic 2: Dassie Multi-Blockchain Settlement Modules ✅
**Status:** Complete
**Goal:** Implement or configure settlement modules for Bitcoin (Lightning), Base L2, Cosmos/Akash (CosmWasm), and XRP Ledger in Dassie node.

### Epic 3: EVM Payment Channel Contracts ✅
**Status:** Complete (pivoted from CosmWasm to EVM)
**Goal:** Create, test, and deploy payment channel contracts on Cronos for ERC-20 token support.

---

## Active Epics (BTP-NIPs Network)

### Epic 4: Base Payment Channels
**Status:** In Progress (Story 4.1)
**Goal:** Deploy multi-token payment channel factory on Base L2 to enable peer-to-peer payments with unidirectional channels and top-up functionality.
**Stories:** 4.1, 4.2, 4.3
**Timeline:** 2 weeks

### Epic 5: BTP-NIPs Core Protocol
**Status:** Planned
**Goal:** Implement protocol for embedding Nostr events in ILP STREAM packets, enabling native payment-content coupling.
**Stories:** 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
**Timeline:** 4 weeks

### Epic 6: Peer Networking
**Status:** Planned
**Goal:** Integrate Nostr social graph (follow lists) with Dassie network discovery (BNL/KNL) for seamless peer connections.
**Stories:** 6.1, 6.2, 6.3, 6.4, 6.5
**Timeline:** 2 weeks

### Epic 7: Direct Akash Integration
**Status:** Planned
**Goal:** Track revenue in USD, purchase AKT tokens, and automatically pay Akash hosting via Cosmos SDK transactions.
**Stories:** 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
**Timeline:** 2 weeks

### Epic 8: Deployment
**Status:** Planned
**Goal:** Containerize peer node and deploy to Akash Network.
**Stories:** 8.1, 8.2, 8.3
**Timeline:** 1 week

### Epic 9: Web UI
**Status:** Planned
**Goal:** Build web interface for peer operations (publish, feed, subscriptions, channels, economics).
**Stories:** 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
**Timeline:** 2 weeks

---

## Future Epics (Post-MVP)

### Epic 10: Autonomous Agents
**Status:** Research Complete, Implementation Deferred
**Goal:** Add AI decision layer on top of BTP-NIPs foundation for autonomous network operation.
**Research:** [docs/research/autonomous-agent-relays/](../research/autonomous-agent-relays/)
**Timeline:** 8-12 months after Epic 9

### Epic 11: Arweave Permanent Storage
**Status:** Deferred
**Goal:** Integrate Arweave for large content and event backups.

### Epic 12: Multi-Chain Expansion
**Status:** Deferred
**Goal:** Add support for additional EVM chains (Arbitrum, Optimism) and non-EVM chains (Cosmos, XRP).

### Epic 13: Privacy Layer
**Status:** Future Research
**Goal:** Onion routing, Tor integration, zk-SNARKs for metadata privacy.

---

## Timeline Overview

```
Weeks 1-2:   Epic 4 (Payment Channels)
Weeks 3-6:   Epic 5 (BTP-NIPs Protocol)
Weeks 7-8:   Epic 6 (Peer Networking)
Weeks 9-10:  Epic 7 (Akash Integration)
Week 11:     Epic 8 (Deployment)
Weeks 12-13: Epic 9 (Web UI)

MVP Complete: Week 13 (3 months)
```

---

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2025-01-24 | 1.0 | Initial epic list (traditional architecture) |
| 2025-12-05 | 2.0 | Revised for BTP-NIPs P2P network architecture |

---

