# Autonomous Agent Architecture Overview

**Research Document**
**Author:** Claude Code (AI Research Assistant)
**Date:** 2025-12-05
**Status:** Phase 2 - Agent Design Research
**Version:** 1.0.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Framework Comparison](#framework-comparison)
3. [Recommended Framework](#recommended-framework)
4. [Agent Component Diagram](#agent-component-diagram)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [Technology Stack](#technology-stack)
7. [Integration Points](#integration-points)
8. [Deployment Architecture](#deployment-architecture)
9. [Scalability Considerations](#scalability-considerations)
10. [Migration Path](#migration-path)

---

## Executive Summary

### Design Goals

This architecture enables **fully autonomous relay+connector nodes** that:

1. **Operate Without Human Intervention** - Self-manage treasury, pricing, and peering
2. **Earn Revenue** - Process 100+ events/sec @ 100 msats average = 30 AKT/day (~$90/day)
3. **Self-Fund Infrastructure** - Pay Akash hosting (1-2 AKT/day) from earnings
4. **Scale to 1000+ Peers** - Multi-hop ILP routing with reputation-based selection
5. **Multi-Chain Settlement** - Accept BTC, ETH, AKT, XRP via payment channels

### Key Findings

**Recommended Framework:** **Dassie lib-reactive (Custom State Machine)**

**Why:**
- ✅ Native integration with Dassie BTP protocol
- ✅ Reactive actor model perfect for autonomous decision-making
- ✅ Production-ready (already powers Dassie ILP nodes)
- ✅ TypeScript (same as Nostream, easy integration)
- ✅ Minimal dependencies (no external AI/LLM required)

**Performance Targets:**
- **Throughput:** 100 events/sec (realistic), 500 events/sec (peak)
- **Latency:** p50: 80ms, p95: 300ms, p99: 800ms
- **Uptime:** 99.5% (4 hours downtime/month)
- **Revenue:** $90/day @ 100 events/sec, $450/day @ 500 events/sec
- **Costs:** $3/day (Akash hosting) + $5/day (gas, swaps) = $8/day
- **Profit:** $82-$442/day ($2,460-$13,260/month)

### Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                 Autonomous Agent Relay Node                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Decision Engine (Core Loop)               │   │
│  │  - Pricing algorithm                                │   │
│  │  - Peer selection                                   │   │
│  │  - Treasury management                              │   │
│  │  - Event routing                                    │   │
│  └────────────┬────────────────────────────────────────┘   │
│               │                                             │
│  ┌────────────┴────────────┬────────────────┬────────────┐ │
│  │                         │                │            │ │
│  ▼                         ▼                ▼            ▼ │
│ ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────┐ │
│ │  Nostr   │  │  ILP         │  │ Treasury │  │ Akash  │ │
│ │  Relay   │  │  Connector   │  │ Manager  │  │ Deploy │ │
│ │ (Events) │  │  (Routing)   │  │ (Swaps)  │  │ (SDL)  │ │
│ └──────────┘  └──────────────┘  └──────────┘  └────────┘ │
│       │                │                │            │     │
│       │                │                │            │     │
│  ┌────▼────────────────▼────────────────▼────────────▼───┐ │
│  │           State Persistence (SQLite/PostgreSQL)       │ │
│  │  - Events                                             │ │
│  │  - Payment channels                                   │ │
│  │  - Peer reputation                                    │ │
│  │  - Agent configuration                                │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  External Integrations:                                    │
│  - Akash Network (hosting)                                │
│  - Osmosis DEX (AKT swaps)                                │
│  - Base L2 / Bitcoin / XRP (payment channels)             │
│  - Arweave (event backup)                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Framework Comparison

### Evaluation Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **Fit for Decision-Making** | 30% | Supports autonomous decision loops, state management |
| **Developer Experience** | 25% | Learning curve, debugging tools, documentation |
| **Performance** | 20% | CPU/memory usage, throughput, latency |
| **Integration** | 15% | Works with Dassie/Nostream, TypeScript/Rust |
| **Maintenance Burden** | 10% | Dependencies, updates, community support |

### Framework Options

#### Option 1: Custom State Machine (Dassie lib-reactive)

**Description:** Build agent logic using Dassie's reactive actor framework (`lib-reactive`)

**Architecture:**
```typescript
// Core decision loop
const AgentDecisionActor = () => createActor((sig) => {
  // Reactive state
  const pricingStrategy = sig.readAndTrack(PricingStrategySignal)
  const balances = sig.readAndTrack(BalancesSignal)
  const peers = sig.readAndTrack(PeersSignal)

  // React to events
  sig.on(IncomingNostrEventTopic, (event) => {
    const fee = calculateFee(event, pricingStrategy)
    // ... decision logic
  })

  // Periodic tasks
  sig.interval(() => adjustPricing(), 60000) // Every minute
  sig.interval(() => rebalanceTreasury(), 3600000) // Every hour
})
```

**Pros:**
- ✅ Native Dassie integration (no impedance mismatch)
- ✅ Reactive model = clean separation of concerns
- ✅ Automatic dependency tracking
- ✅ Excellent lifecycle management (no memory leaks)
- ✅ TypeScript (same as Nostream)
- ✅ Production-ready (powers Dassie nodes)

**Cons:**
- ❌ Custom framework (learning curve)
- ❌ No visual debugging tools
- ❌ Limited community (Dassie-specific)

**Scoring:**
- Fit for Decision-Making: **9/10** (excellent reactive model)
- Developer Experience: **7/10** (good docs, but niche)
- Performance: **9/10** (low overhead, fast)
- Integration: **10/10** (native Dassie)
- Maintenance: **8/10** (stable, low deps)

**Total: 8.45/10**

---

#### Option 2: LangChain Agents (TypeScript/Python)

**Description:** Use LangChain's agent framework with LLM decision-making

**Architecture:**
```python
from langchain.agents import AgentExecutor, create_react_agent
from langchain_openai import ChatOpenAI

# Define tools
tools = [
  Tool(name="calculate_fee", func=calculate_fee_function),
  Tool(name="route_event", func=route_event_function),
  Tool(name="swap_tokens", func=swap_tokens_function)
]

# Create agent with LLM
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
agent = create_react_agent(llm, tools, prompt_template)

# Execute decision loop
agent_executor = AgentExecutor(agent=agent, tools=tools)

result = agent_executor.invoke({
  "input": "New event received from user. Should I accept it?"
})
```

**Pros:**
- ✅ LLM-powered reasoning (adaptable)
- ✅ Large community (LangChain)
- ✅ Rich tooling ecosystem
- ✅ Can explain decisions (transparency)

**Cons:**
- ❌ External API dependency (OpenAI, Anthropic)
- ❌ High latency (LLM inference = 500-2000ms)
- ❌ High cost ($0.001-$0.01 per decision)
- ❌ Non-deterministic behavior
- ❌ Python → TypeScript integration awkward
- ❌ Not designed for 100+ req/sec throughput

**Scoring:**
- Fit for Decision-Making: **6/10** (powerful but slow)
- Developer Experience: **8/10** (great docs, tutorials)
- Performance: **3/10** (high latency, cost)
- Integration: **4/10** (Python ↔ TypeScript friction)
- Maintenance: **6/10** (frequent API changes)

**Total: 5.35/10**

---

#### Option 3: AutoGPT (Python)

**Description:** Use AutoGPT framework for autonomous agent operation

**Architecture:**
```python
from autogpt.agent import Agent
from autogpt.commands import CommandRegistry

# Define agent goals
agent = Agent(
  name="RelayAgent",
  role="Autonomous Nostr relay operator",
  goals=[
    "Accept profitable events",
    "Maintain 99% uptime",
    "Keep treasury above 100 AKT"
  ],
  commands=CommandRegistry()
)

# Register commands
agent.commands.register("accept_event", accept_event_function)
agent.commands.register("adjust_pricing", adjust_pricing_function)
agent.commands.register("swap_to_akt", swap_to_akt_function)

# Run agent loop
while True:
  agent.step()
```

**Pros:**
- ✅ Fully autonomous (goal-driven)
- ✅ Self-improving (learns from experience)
- ✅ Handles complex multi-step tasks

**Cons:**
- ❌ Extremely high latency (multi-second decisions)
- ❌ Very expensive (10-100 LLM calls per decision)
- ❌ Unpredictable behavior (can diverge from goals)
- ❌ Python-only
- ❌ Immature framework (rapid breaking changes)
- ❌ Not designed for real-time systems

**Scoring:**
- Fit for Decision-Making: **7/10** (very autonomous, but unpredictable)
- Developer Experience: **5/10** (complex setup, poor docs)
- Performance: **2/10** (multi-second latency, $$$)
- Integration: **3/10** (Python, high friction)
- Maintenance: **4/10** (unstable API)

**Total: 4.4/10**

---

#### Option 4: Hybrid (lib-reactive + Optional LLM)

**Description:** Use lib-reactive for core logic, LLM for complex edge cases

**Architecture:**
```typescript
const AgentDecisionActor = () => createActor((sig) => {
  sig.on(IncomingNostrEventTopic, async (event) => {
    // Fast path: Deterministic rules
    if (isSimpleEvent(event)) {
      const fee = calculateFee(event, pricingStrategy)
      if (fee >= MIN_FEE) {
        acceptEvent(event)
        return
      }
    }

    // Slow path: LLM reasoning (rare)
    if (isAnomalousEvent(event)) {
      const decision = await llm.decide({
        event,
        context: getAgentContext()
      })

      if (decision.accept) {
        acceptEvent(event)
      }
    }
  })
})
```

**Pros:**
- ✅ Best of both worlds (fast + adaptive)
- ✅ Deterministic for 99% of cases
- ✅ LLM for edge cases only (low cost)
- ✅ Graceful degradation (works without LLM)

**Cons:**
- ❌ Added complexity (two systems)
- ❌ LLM dependency (optional but useful)
- ❌ Requires careful fallback logic

**Scoring:**
- Fit for Decision-Making: **9/10** (very flexible)
- Developer Experience: **7/10** (more complex)
- Performance: **8/10** (fast path dominant)
- Integration: **9/10** (native + optional LLM)
- Maintenance: **7/10** (two systems to maintain)

**Total: 8.15/10**

---

### Framework Comparison Table

| Framework | Score | Fit | DevEx | Perf | Integration | Maintenance | Recommended |
|-----------|-------|-----|-------|------|-------------|-------------|-------------|
| **Custom (lib-reactive)** | **8.45** | 9 | 7 | 9 | 10 | 8 | ✅ **YES** |
| **Hybrid (lib-reactive + LLM)** | **8.15** | 9 | 7 | 8 | 9 | 7 | ⚠️ **MAYBE** |
| **LangChain** | 5.35 | 6 | 8 | 3 | 4 | 6 | ❌ NO |
| **AutoGPT** | 4.4 | 7 | 5 | 2 | 3 | 4 | ❌ NO |

---

## Recommended Framework

### Dassie lib-reactive (Custom State Machine)

**Decision:** Use **Dassie's lib-reactive framework** for autonomous agent logic.

**Justification:**

1. **Native Integration** - lib-reactive is built into Dassie, no impedance mismatch
2. **Performance** - Sub-millisecond decision loops, 100+ decisions/sec
3. **Deterministic** - Predictable behavior, no LLM unpredictability
4. **Cost-Effective** - No external API costs ($0 vs $100s/day for LLM)
5. **Production-Ready** - Already powers Dassie ILP nodes in production
6. **TypeScript** - Same language as Nostream, easy to integrate

### Core Primitives

#### 1. Actors (Long-Running Processes)

```typescript
// packages/app-agent-relay/src/agent/actors/decision-loop.ts
import { createActor } from '@dassie/lib-reactive'

export const AgentDecisionLoopActor = () => createActor((sig) => {
  // Reactive dependencies (auto-rerun when changed)
  const pricing = sig.readAndTrack(PricingStrategySignal)
  const balances = sig.readAndTrack(BalancesSignal)
  const peers = sig.readAndTrack(PeersSignal)

  // Event handlers
  sig.on(IncomingNostrEventTopic, async (event) => {
    await handleIncomingEvent(event, pricing, balances)
  })

  sig.on(PaymentReceivedTopic, async (payment) => {
    await recordRevenue(payment)
  })

  // Periodic tasks
  sig.interval(() => {
    adjustPricingBasedOnDemand(pricing, balances)
  }, 60_000) // Every minute

  sig.interval(() => {
    rebalanceTreasury(balances)
  }, 3600_000) // Every hour

  sig.interval(() => {
    evaluatePeers(peers)
  }, 300_000) // Every 5 minutes

  // Cleanup
  sig.onCleanup(() => {
    logger.info('AgentDecisionLoopActor shutting down')
  })
})
```

#### 2. Signals (Reactive State)

```typescript
// packages/app-agent-relay/src/agent/signals/pricing-strategy.ts
import { createSignal } from '@dassie/lib-reactive'

export const PricingStrategySignal = () => createSignal({
  basePrice: 100, // msats
  multipliers: {
    1: 1.0,      // Text note
    30023: 5.0,  // Long-form content
    1063: 10.0,  // File metadata
  },
  demandAdjustment: 1.0, // Dynamic multiplier
  lastUpdated: Date.now()
})

// Usage in actors:
const pricing = sig.readAndTrack(PricingStrategySignal)
// Actor re-runs when pricing changes
```

#### 3. Topics (Pub/Sub)

```typescript
// packages/app-agent-relay/src/agent/topics/events.ts
import { createTopic } from '@dassie/lib-reactive'
import type { NostrEvent } from 'nostr-tools'

export const IncomingNostrEventTopic = () => createTopic<{
  event: NostrEvent
  paymentClaim?: PaymentClaim
  source: string
}>()

// Publisher:
sig.reactor.use(IncomingNostrEventTopic).emit({
  event,
  paymentClaim,
  source: 'peer-abc'
})

// Subscriber:
sig.on(IncomingNostrEventTopic, (data) => {
  console.log('Received event:', data.event.id)
})
```

#### 4. Computed Values (Derived State)

```typescript
// packages/app-agent-relay/src/agent/computed/profitability.ts
import { createComputed } from '@dassie/lib-reactive'

export const ProfitabilityMetrics = (reactor) =>
  createComputed(reactor, (sig) => {
    const revenue = sig.readAndTrack(TotalRevenueSignal)
    const costs = sig.readAndTrack(TotalCostsSignal)
    const eventCount = sig.readAndTrack(EventCountSignal)

    return {
      profit: revenue - costs,
      profitPerEvent: (revenue - costs) / eventCount,
      margin: ((revenue - costs) / revenue) * 100
    }
  })

// Usage:
const metrics = sig.readAndTrack(ProfitabilityMetrics)
console.log(`Profit margin: ${metrics.margin.toFixed(2)}%`)
```

---

## Agent Component Diagram

### High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                   Autonomous Agent Relay Node                   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Decision Engine (lib-reactive Actors)         │   │
│  │                                                         │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │   │
│  │  │  Pricing     │  │  Routing     │  │  Treasury    │ │   │
│  │  │  Engine      │  │  Engine      │  │  Manager     │ │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │   │
│  │         │                 │                 │          │   │
│  │         └─────────────────┴─────────────────┘          │   │
│  │                          │                             │   │
│  │              ┌───────────▼───────────┐                 │   │
│  │              │  Decision Coordinator │                 │   │
│  │              └───────────┬───────────┘                 │   │
│  └──────────────────────────┼─────────────────────────────┘   │
│                             │                                 │
│  ┌──────────────────────────┼─────────────────────────────┐   │
│  │           Service Layer (Integration)                  │   │
│  │                                                         │   │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────────────┐ │   │
│  │  │ Nostr  │  │  ILP   │  │Payment │  │ Monitoring   │ │   │
│  │  │ Relay  │  │Connect │  │ Verify │  │ & Metrics    │ │   │
│  │  └───┬────┘  └───┬────┘  └───┬────┘  └──────┬───────┘ │   │
│  │      │           │           │              │          │   │
│  └──────┼───────────┼───────────┼──────────────┼──────────┘   │
│         │           │           │              │              │
│  ┌──────▼───────────▼───────────▼──────────────▼──────────┐   │
│  │           Persistence Layer (SQLite/PostgreSQL)        │   │
│  │  - Events         - Reputation    - Agent config       │   │
│  │  - Channels       - Balances      - Audit logs         │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  External Systems:                                             │
│  ┌────────┐  ┌────────┐  ┌─────────┐  ┌──────────┐           │
│  │ Akash  │  │Osmosis │  │  Base   │  │ Arweave  │           │
│  │Network │  │  DEX   │  │   L2    │  │ Storage  │           │
│  └────────┘  └────────┘  └─────────┘  └──────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### Detailed Component Breakdown

#### Decision Engine Components

**1. Pricing Engine**
- **Input:** Event kind, size, network demand
- **Output:** Fee (msats)
- **Logic:**
  ```typescript
  fee = basePrice × kindMultiplier × demandAdjustment + sizeFee
  ```

**2. Routing Engine**
- **Input:** Event, destination, routing table
- **Output:** Best peer to forward to
- **Logic:** Dijkstra + reputation weighting

**3. Treasury Manager**
- **Input:** Current balances (BTC, ETH, AKT, XRP)
- **Output:** Swap orders (e.g., ETH → AKT)
- **Logic:** Keep AKT balance > 100 for Akash hosting

#### Service Layer Components

**1. Nostr Relay**
- **Responsibilities:**
  - Store events (PostgreSQL)
  - Manage subscriptions
  - Filter events per NIP-01
  - Broadcast to subscribers
- **Package:** `app-agent-relay/src/nostr/`

**2. ILP Connector**
- **Responsibilities:**
  - Route ILP packets
  - Manage peer sessions
  - Forward payments
  - Settlement
- **Package:** `app-dassie` (core Dassie)

**3. Payment Verification**
- **Responsibilities:**
  - Verify payment claims
  - Check channel balances
  - Update nonce tracking
  - Record revenue
- **Package:** `app-agent-relay/src/payment/`

**4. Monitoring & Metrics**
- **Responsibilities:**
  - Track event throughput
  - Measure latency (p50, p95, p99)
  - Monitor uptime
  - Alert on anomalies
- **Package:** `app-agent-relay/src/monitoring/`

---

## Data Flow Diagrams

### Event Publishing Flow

```
┌─────────┐
│ Client  │
└────┬────┘
     │
     │ 1. ILP Prepare (EVENT packet + payment)
     ▼
┌─────────────────────────────────┐
│  Agent Relay (Decision Engine)  │
│                                 │
│  ┌──────────────────────────┐  │
│  │ 2. Parse BTP-NIPs packet │  │
│  └────────────┬─────────────┘  │
│               │                 │
│  ┌────────────▼─────────────┐  │
│  │ 3. Pricing Engine        │  │
│  │    Calculate fee         │  │
│  └────────────┬─────────────┘  │
│               │                 │
│  ┌────────────▼─────────────┐  │
│  │ 4. Payment Verification  │  │
│  │    Check claim signature │  │
│  └────────────┬─────────────┘  │
│               │                 │
│  ┌────────────▼─────────────┐  │
│  │ 5. Event Validation      │  │
│  │    Verify Nostr sig      │  │
│  └────────────┬─────────────┘  │
│               │                 │
│  ┌────────────▼─────────────┐  │
│  │ 6. Store Event (DB)      │  │
│  └────────────┬─────────────┘  │
│               │                 │
│  ┌────────────▼─────────────┐  │
│  │ 7. Record Revenue        │  │
│  └────────────┬─────────────┘  │
│               │                 │
│  ┌────────────▼─────────────┐  │
│  │ 8. Broadcast to Subs     │  │
│  └────────────┬─────────────┘  │
└───────────────┼─────────────────┘
                │
                │ 9. ILP Fulfill (proof of acceptance)
                ▼
           ┌─────────┐
           │ Client  │
           └─────────┘
```

### Treasury Rebalancing Flow

```
┌──────────────────────────────────┐
│  Decision Engine (Interval: 1h)  │
└──────────────┬───────────────────┘
               │
               │ 1. Read balances
               ▼
┌──────────────────────────────────┐
│       Balances Signal            │
│  - BTC: 0.01 BTC                 │
│  - ETH: 0.5 ETH                  │
│  - AKT: 50 AKT   ← Low!          │
│  - XRP: 1000 XRP                 │
└──────────────┬───────────────────┘
               │
               │ 2. Check AKT balance < 100
               ▼
┌──────────────────────────────────┐
│    Treasury Manager Actor        │
│  - Target: 150 AKT               │
│  - Deficit: 100 AKT              │
│  - Best source: ETH (liquid)     │
└──────────────┬───────────────────┘
               │
               │ 3. Create swap order (ETH → AKT)
               ▼
┌──────────────────────────────────┐
│       Osmosis DEX                │
│  - Swap 0.25 ETH → 100 AKT       │
│  - Slippage: 0.5%                │
│  - Route: ETH → ATOM → AKT       │
└──────────────┬───────────────────┘
               │
               │ 4. Execute swap tx (on-chain)
               ▼
┌──────────────────────────────────┐
│     Cosmos Network (Osmosis)     │
│  - Gas: 0.01 ATOM (~$0.10)       │
│  - Confirm: 5 seconds            │
└──────────────┬───────────────────┘
               │
               │ 5. Update balances
               ▼
┌──────────────────────────────────┐
│       Balances Signal            │
│  - BTC: 0.01 BTC                 │
│  - ETH: 0.25 ETH  ← Reduced      │
│  - AKT: 150 AKT   ← Replenished  │
│  - XRP: 1000 XRP                 │
└──────────────────────────────────┘
```

### Peer Discovery & Routing Flow

```
┌─────────────────────────────────┐
│   Agent Relay (Bootstrapping)   │
└──────────────┬──────────────────┘
               │
               │ 1. Query Bootstrap Node List (BNL)
               ▼
┌────────────────────────────────────────┐
│    Bootstrap Nodes (Hardcoded 10)     │
│  - bootstrap-1.btp-nips.org           │
│  - bootstrap-2.btp-nips.org           │
│  - ...                                │
└──────────────┬─────────────────────────┘
               │
               │ 2. Request Known Node List (KNL) from each
               ▼
┌────────────────────────────────────────┐
│      Known Node List (KNL)             │
│  - agent-abc.btp-nips.org (rep: 0.95)  │
│  - agent-xyz.btp-nips.org (rep: 0.87)  │
│  - agent-123.btp-nips.org (rep: 0.72)  │
│  - ... (1000+ nodes)                   │
└──────────────┬─────────────────────────┘
               │
               │ 3. Anti-Sybil filtering (>50% BNL consensus)
               ▼
┌────────────────────────────────────────┐
│     Filtered Peer List (500 nodes)     │
└──────────────┬─────────────────────────┘
               │
               │ 4. Peer evaluation & selection (top 20)
               ▼
┌────────────────────────────────────────┐
│      Peering Selection Criteria        │
│  - Reputation > 0.7                    │
│  - Settlement scheme compatible        │
│  - Geographic diversity                │
│  - Liquidity > 10 AKT                  │
└──────────────┬─────────────────────────┘
               │
               │ 5. Send peering requests
               ▼
┌────────────────────────────────────────┐
│      Active Peer Connections (20)      │
│  - BTP sessions established            │
│  - Payment channels open               │
│  - Routing table updated               │
└────────────────────────────────────────┘
```

---

## Technology Stack

### Core Technologies

```yaml
Runtime:
  - Node.js: v20+ (LTS)
  - TypeScript: v5.6+

Frameworks:
  - Dassie (lib-reactive): ILP connector + reactive actors
  - Nostream: Nostr relay (modified for agent integration)

Databases:
  - PostgreSQL: v14+ (event storage)
  - SQLite: Payment channel state (local, fast)
  - Redis: Caching (optional, recommended)

Blockchain Integrations:
  - CosmJS: Cosmos ecosystem (AKT, ATOM)
  - viem: Ethereum & L2s (Base, Arbitrum)
  - xrpl.js: XRP Ledger
  - bitcoinjs-lib: Bitcoin (optional)

Payment Protocols:
  - ILP (Interledger): Core payment routing
  - STREAM: ILP payment stream protocol
  - BTP (Bilateral Transfer Protocol): Peer communication

Storage:
  - Arweave SDK: Permanent event backup

Monitoring:
  - Prometheus: Metrics collection
  - Grafana: Dashboards
  - Loki: Log aggregation (optional)

Deployment:
  - Akash Network: Decentralized hosting
  - Docker: Containerization
  - Akash SDL: Deployment manifests
```

### Package Structure

```
packages/
├── app-agent-relay/           # Main agent application
│   ├── src/
│   │   ├── agent/
│   │   │   ├── actors/
│   │   │   │   ├── decision-loop.ts
│   │   │   │   ├── pricing-engine.ts
│   │   │   │   ├── routing-engine.ts
│   │   │   │   └── treasury-manager.ts
│   │   │   ├── signals/
│   │   │   │   ├── pricing-strategy.ts
│   │   │   │   ├── balances.ts
│   │   │   │   └── peers.ts
│   │   │   ├── computed/
│   │   │   │   ├── profitability.ts
│   │   │   │   └── liquidity.ts
│   │   │   └── topics/
│   │   │       ├── events.ts
│   │   │       └── payments.ts
│   │   ├── nostr/
│   │   │   ├── database/
│   │   │   ├── handlers/
│   │   │   └── websocket-bridge.ts
│   │   ├── payment/
│   │   │   ├── channel-manager.ts
│   │   │   └── verification.ts
│   │   ├── treasury/
│   │   │   ├── swap-executor.ts
│   │   │   └── balance-tracker.ts
│   │   ├── akash/
│   │   │   ├── sdl-generator.ts
│   │   │   └── deployment.ts
│   │   └── monitoring/
│   │       ├── metrics.ts
│   │       └── alerting.ts
│   └── package.json
│
├── lib-agent/                 # Reusable agent primitives
│   ├── src/
│   │   ├── pricing/
│   │   ├── treasury/
│   │   └── decision/
│   └── package.json
│
└── app-dassie/               # Dassie core (existing)
    └── ...
```

### Dependencies (package.json)

```json
{
  "name": "@nostr-ilp/app-agent-relay",
  "version": "1.0.0",
  "dependencies": {
    "@dassie/app-dassie": "workspace:^",
    "@dassie/lib-reactive": "workspace:^",
    "@dassie/lib-protocol-ilp": "workspace:^",
    "@dassie/lib-sqlite": "workspace:^",

    "nostr-tools": "^2.10.2",
    "arweave": "^1.15.1",

    "@cosmjs/cosmwasm-stargate": "^0.32.4",
    "@cosmjs/stargate": "^0.32.4",
    "viem": "^2.21.54",
    "xrpl": "^4.2.0",

    "pg": "^8.13.1",
    "better-sqlite3": "^11.7.0",
    "redis": "^4.7.0",

    "prom-client": "^15.1.3",
    "winston": "^3.17.0",

    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/pg": "^8.11.10",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

---

## Integration Points

### 1. Dassie Integration

**BTP Packet Handler for Nostr Events:**

```typescript
// packages/app-agent-relay/src/integration/dassie-nostr-handler.ts
import type { DassieReactor } from '@dassie/app-dassie'
import { HandleInterledgerPacket } from '@dassie/app-dassie/src/peer-protocol/handlers/interledger-packet'

export const HandleNostrEventPacket = (reactor: DassieReactor) => {
  const baseHandler = reactor.use(HandleInterledgerPacket)

  return async ({ message, authenticated, peerState }) => {
    // 1. Standard ILP packet handling
    const { packet } = message.content.value.value.signed

    // 2. Check if packet contains BTP-NIPs data
    const btpNipsData = parseBTPNIPsPacket(packet.data)

    if (btpNipsData) {
      // 3. Emit to Nostr event handler
      reactor.use(IncomingNostrEventTopic).emit({
        event: btpNipsData.nostr.event,
        paymentClaim: btpNipsData.payment,
        source: message.sender
      })

      return { accepted: true }
    }

    // 4. Fallback to standard ILP handling
    return baseHandler({ message, authenticated, peerState })
  }
}
```

### 2. Nostream Integration

**Modified Event Handler with Payment Verification:**

```typescript
// packages/app-agent-relay/src/integration/nostream-payment.ts
import { verifyEvent } from 'nostr-tools'

export class PaymentRequiredEventHandler {
  async handleEvent(event: NostrEvent, paymentClaim?: PaymentClaim): Promise<EventResponse> {
    // 1. Verify Nostr signature (always)
    if (!verifyEvent(event)) {
      return { accepted: false, message: 'invalid signature' }
    }

    // 2. Calculate required fee
    const requiredFee = this.calculateEventFee(event)

    // 3. Verify payment if fee > 0
    if (requiredFee > 0) {
      if (!paymentClaim) {
        return {
          accepted: false,
          message: `payment-required: ${requiredFee}`,
          requiredFee
        }
      }

      const isValidPayment = await this.verifyPaymentClaim(paymentClaim)
      if (!isValidPayment) {
        return {
          accepted: false,
          message: 'invalid-payment'
        }
      }
    }

    // 4. Store event (standard Nostream logic)
    await this.eventRepository.save(event)

    // 5. Record revenue
    if (requiredFee > 0) {
      await this.recordRevenue(paymentClaim)
    }

    return {
      accepted: true,
      eventId: event.id
    }
  }
}
```

### 3. Akash SDK Integration

**Automatic Deployment Management:**

```typescript
// packages/app-agent-relay/src/integration/akash-deployment.ts
import { SigningStargateClient } from '@cosmjs/stargate'

export class AkashDeploymentManager {
  async ensureDeployment(): Promise<void> {
    // 1. Check if current deployment is healthy
    const deployment = await this.getActiveDeployment()

    if (!deployment || !this.isHealthy(deployment)) {
      // 2. Generate SDL manifest
      const sdl = this.generateSDL({
        image: 'ghcr.io/nostr-ilp/agent-relay:latest',
        cpu: '4000m',
        memory: '8Gi',
        storage: '100Gi',
        ports: [443, 8080]
      })

      // 3. Submit deployment tx
      const tx = await this.createDeployment(sdl)

      // 4. Accept bid from provider
      const bid = await this.waitForBid(tx.deploymentId)
      await this.acceptBid(bid)

      // 5. Send manifest to provider
      await this.sendManifest(bid.provider, sdl)

      logger.info('New Akash deployment created', {
        deploymentId: tx.deploymentId,
        provider: bid.provider
      })
    }
  }

  private generateSDL(config: DeploymentConfig): string {
    return `
---
version: "2.0"

services:
  agent-relay:
    image: ${config.image}
    env:
      - NODE_ENV=production
      - DATABASE_URL=postgres://...
    expose:
      - port: 443
        as: 443
        to:
          - global: true
      - port: 8080
        as: 8080
        to:
          - global: true

profiles:
  compute:
    agent-relay:
      resources:
        cpu:
          units: ${config.cpu}
        memory:
          size: ${config.memory}
        storage:
          size: ${config.storage}

  placement:
    akash:
      pricing:
        agent-relay:
          denom: uakt
          amount: 100

deployment:
  agent-relay:
    akash:
      profile: agent-relay
      count: 1
`
  }
}
```

### 4. Osmosis DEX Integration

**Automated Token Swaps:**

```typescript
// packages/app-agent-relay/src/integration/osmosis-swaps.ts
import { SigningStargateClient } from '@cosmjs/stargate'

export class OsmosisSwapExecutor {
  async swapToAKT(amount: bigint, fromToken: 'ETH' | 'BTC' | 'XRP'): Promise<SwapResult> {
    // 1. Get optimal swap route (Osmosis routing API)
    const route = await this.getOptimalRoute(fromToken, 'AKT', amount)

    // 2. Calculate expected output (with slippage)
    const minOutput = this.calculateMinOutput(route, 0.5) // 0.5% slippage

    // 3. Execute multi-hop swap
    const tx = await this.cosmWasmClient.execute(
      this.walletAddress,
      OSMOSIS_ROUTER_CONTRACT,
      {
        swap: {
          routes: route.hops,
          token_in: {
            denom: this.tokenToDenom(fromToken),
            amount: amount.toString()
          },
          min_token_out: minOutput.toString()
        }
      },
      'auto' // Gas estimation
    )

    logger.info('Swap executed', {
      from: fromToken,
      to: 'AKT',
      amountIn: amount.toString(),
      amountOut: tx.amountOut,
      txHash: tx.transactionHash
    })

    return {
      success: true,
      amountOut: BigInt(tx.amountOut),
      txHash: tx.transactionHash
    }
  }
}
```

---

## Deployment Architecture

### Single Agent Node

```
┌─────────────────────────────────────────────────────────┐
│            Akash Provider (Cloud Infrastructure)        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │        Docker Container (Agent Relay)             │ │
│  │                                                   │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │  Node.js Process                            │ │ │
│  │  │  - Dassie (ILP connector)                   │ │ │
│  │  │  - Agent Decision Engine                    │ │ │
│  │  │  - Nostr Relay                              │ │ │
│  │  │  - Payment Verification                     │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  │                                                   │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │  PostgreSQL (Events)                        │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  │                                                   │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │  Redis (Cache) - Optional                   │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  Network: 100 Mbps                                     │
│  CPU: 4 cores                                          │
│  RAM: 8 GB                                             │
│  Storage: 100 GB SSD                                   │
│  Cost: ~1-2 AKT/day (~$3-6/day)                        │
└─────────────────────────────────────────────────────────┘
```

### Multi-Agent Network

```
        ┌──────────────┐
        │ Bootstrap #1 │
        │ (Hardcoded)  │
        └──────┬───────┘
               │
        ┌──────▼───────┐
        │ Bootstrap #2 │
        └──────┬───────┘
               │
      ┌────────┴────────┐
      │                 │
┌─────▼─────┐     ┌─────▼─────┐
│  Agent A  │◄────┤  Agent B  │
│  (Akash)  │     │  (Akash)  │
└─────┬─────┘     └─────┬─────┘
      │                 │
      │  ILP Routing    │
      │                 │
┌─────▼─────┐     ┌─────▼─────┐
│  Agent C  │◄────┤  Agent D  │
│  (Akash)  │     │  (Akash)  │
└───────────┘     └───────────┘

Each Agent:
- Runs independently
- Manages own treasury
- Routes ILP packets
- Earns fees from events
- Pays Akash hosting
- No centralized coordination
```

---

## Scalability Considerations

### Horizontal Scaling

**Problem:** Single agent node limited to ~100 events/sec

**Solution:** Multi-agent network with routing

```typescript
// Each agent specializes
const agentProfiles = {
  'fast-agent': {
    targetLatency: 50, // p50 ms
    pricing: { basePrice: 200 }, // Higher fees for speed
    deployment: { cpu: '8000m', memory: '16Gi' }
  },
  'cheap-agent': {
    targetLatency: 200, // p50 ms
    pricing: { basePrice: 50 }, // Lower fees
    deployment: { cpu: '2000m', memory: '4Gi' }
  },
  'media-agent': {
    acceptedKinds: [1063, 71, 22], // Files, video
    pricing: { kindMultipliers: { 1063: 20, 71: 50 } },
    arweaveIntegration: true
  }
}
```

**Throughput Scaling:**
- 1 agent: 100 events/sec
- 10 agents: 1,000 events/sec (10x)
- 100 agents: 10,000 events/sec (100x)
- 1000 agents: 100,000 events/sec (1000x)

**Revenue Scaling:**
- 1 agent: $90/day
- 10 agents: $900/day
- 100 agents: $9,000/day
- 1000 agents: $90,000/day

### Vertical Scaling

**Problem:** Event processing CPU-bound

**Solution:** Worker threads for parallelization

```typescript
// packages/app-agent-relay/src/scaling/worker-pool.ts
import { Worker } from 'worker_threads'

export class EventProcessorPool {
  private workers: Worker[] = []

  constructor(workerCount: number = 4) {
    for (let i = 0; i < workerCount; i++) {
      this.workers.push(new Worker('./event-worker.js'))
    }
  }

  async processEvent(event: NostrEvent): Promise<EventResult> {
    // Round-robin distribution
    const worker = this.workers[this.nextWorkerIndex++ % this.workers.length]

    return new Promise((resolve, reject) => {
      worker.postMessage({ type: 'process', event })
      worker.once('message', resolve)
      worker.once('error', reject)
    })
  }
}

// Throughput: 100 events/sec → 400 events/sec (4 workers)
```

### Database Scaling

**Problem:** PostgreSQL writes limited to ~1K/sec

**Solution:** Batch writes + sharding

```typescript
// Batch writes (10x improvement)
const eventBatch: NostrEvent[] = []

setInterval(async () => {
  if (eventBatch.length > 0) {
    await db.query(`
      INSERT INTO events (id, pubkey, created_at, kind, tags, content, sig)
      VALUES ${eventBatch.map((_, i) => `($${i*7+1}, $${i*7+2}, $${i*7+3}, $${i*7+4}, $${i*7+5}, $${i*7+6}, $${i*7+7})`).join(', ')}
    `, eventBatch.flatMap(e => [e.id, e.pubkey, e.created_at, e.kind, e.tags, e.content, e.sig]))

    eventBatch.length = 0
  }
}, 1000) // Batch every second
```

---

## Migration Path

### Phase 1: Prototype (Weeks 1-2)

**Goal:** Prove concept with minimal functionality

**Deliverables:**
- Single agent node (no Akash, runs locally)
- Basic pricing algorithm (fixed fees)
- Payment verification (simple channel state)
- Event storage (SQLite, no PostgreSQL)
- WebSocket bridge (Nostr ↔ BTP-NIPs)

**Success Criteria:**
- Accept 10 events/sec
- Latency p50 < 200ms
- Payment verification works

### Phase 2: Alpha (Weeks 3-4)

**Goal:** Add autonomous decision-making

**Deliverables:**
- Dynamic pricing (demand-based adjustment)
- Treasury management (manual swaps via CLI)
- Peer discovery (BNL + KNL)
- Basic reputation tracking
- PostgreSQL storage

**Success Criteria:**
- Handle 50 events/sec
- Pricing adjusts based on load
- Connect to 5 peers

### Phase 3: Beta (Weeks 5-6)

**Goal:** Full autonomy + Akash deployment

**Deliverables:**
- Automatic treasury rebalancing (Osmosis swaps)
- Akash deployment automation
- Monitoring & alerting (Prometheus)
- Arweave backup integration
- Multi-chain payment channels

**Success Criteria:**
- Run for 7 days without human intervention
- Handle 100 events/sec
- Profitable (revenue > costs)

### Phase 4: Production (Weeks 7-8)

**Goal:** Deploy 3-agent testnet

**Deliverables:**
- 3 agents on Akash Network
- ILP routing between agents
- Reputation system active
- Client libraries (TypeScript SDK)
- Documentation & tutorials

**Success Criteria:**
- 30-day uptime > 99%
- All 3 agents profitable
- Event routing works (multi-hop)

---

## Conclusion

### Summary

**Recommended Architecture:**
- **Framework:** Dassie lib-reactive (custom state machine)
- **Language:** TypeScript
- **Hosting:** Akash Network (decentralized)
- **Database:** PostgreSQL (events) + SQLite (channels)
- **Payments:** ILP (multi-chain)
- **Storage:** Arweave (backups)

**Performance Targets:**
- Throughput: 100-500 events/sec per agent
- Latency: p50 80ms, p95 300ms
- Uptime: 99.5%
- Profitability: $82-442/day per agent

**Development Timeline:**
- Phase 1 (Prototype): 2 weeks
- Phase 2 (Alpha): 2 weeks
- Phase 3 (Beta): 2 weeks
- Phase 4 (Production): 2 weeks
- **Total: 8 weeks to production**

### Next Steps

1. **Implement State Machine** (see state-machine.md)
2. **Build Decision Loop Actor** (pricing, routing, treasury)
3. **Integrate Dassie BTP Handler** (Nostr packet parsing)
4. **Test Payment Flows** (channel state, verification)
5. **Deploy Prototype** (local, then Akash)

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-05
**Author:** Claude Code (AI Research Assistant)
**License:** MIT (research outputs), Apache 2.0 (code)

**Related Documents:**
- [State Machine Specification](./state-machine.md)
- [Dassie Integration Guide](../technical-feasibility/dassie-integration.md)
- [BTP-NIPs Protocol](../protocol-specification/btp-nips-protocol.md)
- [Reputation Systems](../security-privacy/reputation-systems.md)
