# Future Work (Epic 10+)

**Last Updated:** 2025-12-05

---

## Overview

This document outlines future enhancements that build upon the BTP-NIPs peer-to-peer network foundation (Epic 1-9).

---

## Epic 10: Autonomous Agent Network

**Status:** Research Complete, Implementation Deferred
**Research Location:** [docs/research/autonomous-agent-relays/](../research/autonomous-agent-relays/)
**Timeline:** 8-12 months post-MVP
**Budget:** $700K-1M

### Vision

Transform peer nodes into **autonomous agents** with AI decision-making:
- Dynamic pricing algorithms (optimize subscription fees)
- Automatic peer selection (reputation-based)
- Self-deployment and scaling (spawn child agents)
- Treasury optimization (when to buy AKT, rebalance channels)
- Network orchestration (1,000+ agent mesh)

### Why Deferred

1. **Foundation First:** Epic 1-9 must be proven profitable before adding AI complexity
2. **Economic Validation:** Need 90+ days of real revenue data
3. **Scope:** Autonomous agents are a separate project (~12 months, $700K+)
4. **Risk Management:** Prove basic P2P network before autonomous layer

### Prerequisites

- ✅ Epic 1-9 complete and deployed to production
- ✅ 50+ active peers generating consistent revenue
- ✅ Proven profitability (revenue > costs) for 90+ days
- ✅ All payment channels stable at scale

### Implementation Approach

**Phase 1:** Rule-based decision engine (no AI)
- If revenue < threshold → increase subscription price
- If escrow < 7 days → buy AKT immediately
- Simple if/then logic

**Phase 2:** ML-based optimization
- Price optimization using historical data
- Peer selection via reputation ML model
- Revenue forecasting

**Phase 3:** Agent orchestration
- Deploy 10-20 agent network
- Peer reputation and discovery
- Economic equilibrium testing

**Phase 4:** Network scaling
- Enable agent reproduction
- Grow to 100+ agents
- Full autonomous operation

### Research Outputs

30+ comprehensive documents preserved in [research/autonomous-agent-relays/](../research/autonomous-agent-relays/):
- BTP-NIPs protocol specification (already implemented in Epic 5)
- Agent decision engines
- Economic modeling (unit economics, network simulations)
- Security and threat models
- Multi-chain integration plans
- Implementation guides

---

## Epic 11: Arweave Permanent Storage

**Status:** Deferred
**Timeline:** 2-3 weeks
**Priority:** Medium

### Goal

Integrate Arweave for:
- Large content storage (kind 30023 long-form, kind 1063 files)
- Event backups (daily backup of all events)
- Hot/cold storage tiers (recent in PostgreSQL, old in Arweave)

### Why Valuable

- Reduces peer node storage costs (offload old events)
- Permanent data preservation (200+ year guarantee)
- One-time payment vs recurring cloud storage

---

## Epic 12: Multi-Chain Expansion

**Status:** Deferred
**Timeline:** 3-4 weeks per chain
**Priority:** Low (only if demand exists)

### Potential Chains

- **Arbitrum One:** Lower fees than Ethereum L1, large TVL
- **Optimism:** Similar to Base (Optimism stack)
- **Polygon:** High throughput, very low fees
- **Cosmos Hub:** Native IBC support, Akash integration

### Why Deferred

- Base L2 is sufficient for MVP
- Multi-chain adds 70% more deployment work
- Capital requirements increase 4-5x
- Can add later if demand proven

---

## Epic 13: Privacy Layer

**Status:** Future Research
**Timeline:** 6-8 months
**Priority:** Medium

### Features

- **Onion Routing:** 3-hop event routing for metadata privacy
- **Tor Integration:** Hide peer IP addresses
- **Packet Padding:** Fixed sizes to prevent size-based correlation
- **Timing Obfuscation:** Random jitter to break timing analysis
- **zk-SNARKs:** Zero-knowledge payment proofs

### Challenges

- Latency increase (onion routing adds ~200ms per hop)
- Complexity (Tor integration, cryptography)
- Adoption (users must opt-in for privacy features)

---

## Epic 14: Cross-Protocol Bridges

**Status:** Concept
**Timeline:** 4-6 months
**Priority:** Low

### Potential Bridges

- Nostr ↔ Farcaster
- Nostr ↔ ActivityPub (Mastodon)
- Nostr ↔ AT Protocol (Bluesky)

### Value

- Expand user base
- Reduce network fragmentation
- Cross-protocol communication

---

## Epic 15: Layer 2 Scaling

**Status:** Future Research
**Timeline:** 12+ months
**Priority:** Low

### Technologies

- Optimistic rollups for payment channel aggregation
- State channels for high-frequency micropayments
- zk-Rollups for privacy + scalability

### Expected Impact

- 10-100x throughput increase
- Sub-millisecond latency
- Massive capital efficiency

---

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2025-12-05 | 1.0 | Initial future work documentation |

---
