# Sprint Change Proposal v3: Pure P2P BTP-NIPs Network

**Date:** 2025-12-05
**Prepared By:** Claude Code (Architecture Review Agent)
**Status:** Final Proposal
**Change Checklist:** ✅ Complete (All 6 sections)

---

## Executive Summary

After completing autonomous agent research and deep architectural analysis, we're pivoting to a **pure peer-to-peer network architecture** that:

1. **Uses BTP-NIPs native protocol** - Nostr events embedded in ILP packets (not bolt-on payments)
2. **Base L2 only** - Single EVM chain for simplicity (not multi-chain)
3. **Direct Akash transactions** - Buy AKT and pay via Cosmos SDK (not ILP token swapping)
4. **Everyone is a peer** - No client/server distinction, no relay operators, all peers equal
5. **Foundation = Agent infrastructure** - Same protocol from day one, agents layer on top later

**Impact:**
- **Timeline:** 6 months → 3 months (50% faster)
- **Complexity:** 25,000 LOC → 8,000 LOC (68% reduction)
- **Capital:** $3,820 → $500 per peer (87% reduction)
- **Risk:** HIGH → LOW-MEDIUM

---

## 1. Change Trigger & Context

### Original Direction

**From autonomous agent research:**
- Build autonomous agents with AI decision engines
- Multi-chain support (Cronos, Base, Arbitrum, Lightning, XRP)
- Complex ILP liquidity pools and token swapping via DEX
- Traditional Nostr WebSocket + ILP payment verification (dual protocol)

### New Direction (Final)

**Pure peer-to-peer BTP-NIPs network:**
- Everyone runs identical peer node (Dassie + Storage + UI)
- BTP-NIPs native protocol (events IN ILP packets)
- Base L2 only (unidirectional payment channels)
- Direct Akash payments (buy AKT, pay via Cosmos TX)
- Leverages Dassie's existing peer discovery (BNL/KNL)
- Autonomous agents deferred to Epic 10+ (future)

### Why This Is Better

| Aspect | Original | New | Improvement |
|--------|----------|-----|-------------|
| **Protocol** | Dual (Nostr WS + ILP) | Unified (BTP-NIPs) | 50% less code |
| **Chains** | 5+ blockchains | Base only | 70% less deployment |
| **Token Swaps** | ILP connectors + DEX | Buy AKT directly | 80% less complexity |
| **Architecture** | Client/Server/Relay | Pure P2P | Simpler, more decentralized |
| **Discovery** | Build custom | Use Dassie BNL/KNL | Free, proven |
| **Routing** | Build custom | Use ILP routing | Free, proven |
| **Capital** | $3,820/node | $500/node | 87% reduction |

---

## 2. Epic Impact Summary

### Epic Restructure

#### **Epic 4: Base Payment Channels**
- 4.1: Multi-Token Payment Channel Factory (with top-up) ✅
- 4.2: Deploy to Base Mainnet ✅
- 4.3: Dassie Base Settlement Module ✅

**Changes:**
- ✅ Added top-up functionality (AC 10-13 in Story 4.1)
- ❌ Removed Cronos, Arbitrum deployments
- ✅ Simplified to Base-only

---

#### **Epic 5: BTP-NIPs Core Protocol**
- 5.1: BTP-NIPs Packet Parser (4-byte header + JSON)
- 5.2: EVENT Handler (publish events via ILP)
- 5.3: REQ/CLOSE Handler (subscriptions via ILP STREAM)
- 5.4: Nostr Storage Layer (PostgreSQL, no WebSocket)
- 5.5: Subscription Manager (filter matching, indexing)
- 5.6: Integration Tests (end-to-end BTP-NIPs)

**Replaces:**
- Old Epic 5 (Akash deployment - moved to Epic 8)

---

#### **Epic 6: Peer Networking**
- 6.1: Nostr-to-ILP Address Resolution (Kind 32001)
- 6.2: Follow List Integration (Kind 3 → auto-subscribe)
- 6.3: Peer Connection Management
- 6.4: Event Propagation Logic (multi-hop routing)
- 6.5: Subscription Routing (filter matching across peers)

**Replaces:**
- Old Epic 6 (Arweave - moved to Epic 9)
- Removed WebSocket bridge (not needed for P2P network)

---

#### **Epic 7: Direct Akash Integration**
- 7.1: Economic Monitor (track revenue in USD)
- 7.2: Akash Wallet Management (Cosmos SDK)
- 7.3: AKT Purchase Flow (manual via exchange)
- 7.4: Automatic Akash Escrow Deposit (Cosmos TX)
- 7.5: Profitability Dashboard

**Removed:**
- ILP liquidity pools
- Multi-chain swap APIs
- DEX integration (Osmosis)
- Liquidity rebalancing
- Cross-chain bridges

**Added:**
- Direct Cosmos transaction support
- Simple USD tracking (no multi-currency)

---

#### **Epic 8: Deployment**
- 8.1: Containerize Dassie + Storage + UI
- 8.2: Create Akash SDL
- 8.3: Deploy to Akash testnet
- 8.4: Deploy to Akash mainnet

---

#### **Epic 9: Web UI**
- 9.1: Event Composer (publish interface)
- 9.2: Event Feed (view from subscribed peers)
- 9.3: Subscription Manager (follow/unfollow)
- 9.4: Channel Manager (view balances, top-up)
- 9.5: Economics Dashboard (revenue/costs)
- 9.6: Peer Discovery UI (find and connect to peers)

---

#### **Epic 10+: Future Work**
- Arweave permanent storage
- Multi-chain expansion (if needed)
- Autonomous agents (AI decision layer)
- Privacy layer (onion routing)

---

## 3. Architecture Changes

### Before: Dual Protocol, Multi-Chain

```
┌────────────────────────────────────────────────────┐
│  Nostream Relay (WebSocket Server)                │
│  - 10,000+ LOC                                     │
│  - Payment claim extraction from tags              │
│  - tRPC middleware                                 │
│  - Relay federation logic                          │
└───────────────────┬────────────────────────────────┘
                    │ localhost tRPC
┌───────────────────▼────────────────────────────────┐
│  Dassie ILP Node                                   │
│  - Settlement: Cronos, Base, Arbitrum, Lightning   │
│  - Liquidity pools: 5+ currencies                  │
│  - DEX integration: Osmosis swaps                  │
│  - Complex rebalancing logic                       │
└────────────────────────────────────────────────────┘

Components: 7
LOC: ~25,000
Capital: $3,820
Chains: 5+
```

---

### After: Unified Protocol, Single Chain

```
┌────────────────────────────────────────────────────────────┐
│                    Peer Node                               │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │         Dassie ILP Node (Core)                       │ │
│  │  ✅ Peer discovery (BNL/KNL) - Built-in             │ │
│  │  ✅ ILP routing (multi-hop) - Built-in              │ │
│  │  ✅ STREAM protocol - Built-in                      │ │
│  └──────────────────┬───────────────────────────────────┘ │
│                     │                                      │
│  ┌──────────────────▼───────────────────────────────────┐ │
│  │    BTP-NIPs Handler (NEW - ~500 LOC)                │ │
│  │  - Extract Nostr events from ILP packets            │ │
│  │  - Verify Nostr signatures                           │ │
│  │  - Store in PostgreSQL                               │ │
│  │  - Manage subscriptions                              │ │
│  │  - Filter & route events                             │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │    PostgreSQL + Redis (~1,000 LOC)                  │ │
│  │  - Event storage                                     │ │
│  │  - Subscription tracking                             │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │    Base L2 Settlement (~300 LOC)                    │ │
│  │  - Single payment channel module                     │ │
│  │  - Unidirectional channels with top-up               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │    Web UI (~2,000 LOC)                              │ │
│  │  - Publish events                                    │ │
│  │  - View feed                                         │ │
│  │  - Manage subscriptions                              │ │
│  │  - Channel management & top-up                       │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │    Akash Integration (~400 LOC)                     │ │
│  │  - Track USD revenue                                 │ │
│  │  - Buy AKT (manual/API)                              │ │
│  │  - Pay via Cosmos TX                                 │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘

Components: 3 core (Dassie, BTP-NIPs, UI)
LOC: ~8,000
Capital: $500 per peer
Chains: 1 (Base)
```

---

## 4. How It Works: Peer-to-Peer Model

### Every Peer Runs the Same Stack

```
Alice's Node          Bob's Node           Carol's Node
┌──────────┐         ┌──────────┐         ┌──────────┐
│ Dassie   │◄───────►│ Dassie   │◄───────►│ Dassie   │
│ BTP-NIPs │  ILP    │ BTP-NIPs │  ILP    │ BTP-NIPs │
│ Storage  │         │ Storage  │         │ Storage  │
│ UI       │         │ UI       │         │ UI       │
└──────────┘         └──────────┘         └──────────┘
     │                    │                    │
     │ Payment Channels on Base L2             │
     │                    │                    │
Alice→Bob: $50       Bob→Carol: $30      Carol→Alice: $25
```

**No relays, no servers, just peers!**

---

### Social Layer (Nostr)

**Alice publishes Kind 3 (Follow List):**
```json
{
  "kind": 3,
  "pubkey": "alice_pubkey",
  "tags": [
    ["p", "bob_pubkey", "", "Bob"],
    ["p", "carol_pubkey", "", "Carol"]
  ],
  "content": "{}"
}
```

**Meaning:** Alice wants to receive Bob and Carol's events

---

### Discovery Layer (Nostr Kind 32001)

**Bob publishes ILP Node Info:**
```json
{
  "kind": 32001,
  "pubkey": "bob_pubkey",
  "tags": [
    ["d", "ilp-node-info"],
    ["ilp-address", "g.btp-nips.bob.npub1abc"],
    ["ilp-endpoint", "https://bob-node.akash.network"],
    ["base-address", "0x789def..."]
  ],
  "content": ""
}
```

**Provides:** Bob's ILP address, HTTPS endpoint, Base address for payment channels

---

### Network Layer (Dassie BNL/KNL)

**Alice's Dassie queries bootstrap nodes:**
```
Alice → Bootstrap1: "Where is g.btp-nips.bob.npub1abc?"
Bootstrap1 → Alice: "Bob is at https://bob-node.akash.network"

Alice adds Bob to Known Node List (KNL)
Alice establishes ILP connection to Bob
```

---

### Settlement Layer (Base Payment Channel)

**Alice opens channel with Bob:**
```solidity
openChannel(
  USDC_ADDRESS,
  bob_base_address,  // From Kind 32001 discovery
  parseUnits('50', 6), // Alice deposits $50
  expiration
)
```

**Unidirectional:** Alice → Bob only (Bob deposits $0)

---

### Application Layer (BTP-NIPs)

**Alice subscribes to Bob:**
```typescript
await ilp.sendPacket({
  destination: 'g.btp-nips.bob.npub1abc',
  amount: '5000', // 5000 msats (deducted from Alice's channel)
  data: {
    messageType: NostrMessageType.REQ,
    subscriptionId: 'sub-001',
    filters: [{ authors: ['bob_pubkey'], kinds: [1] }],
    metadata: { ttl: 3600 }
  }
});

// Bob receives, validates payment, starts streaming events
for await (const event of bob.newEvents) {
  if (matchesFilter(event, alice.filters)) {
    await ilp.sendPacket({
      destination: 'g.btp-nips.alice.npub1xyz',
      amount: '0', // Free (subscription already paid)
      data: {
        messageType: NostrMessageType.EVENT,
        nostr: event
      }
    });
  }
}
```

---

## 5. What We're NOT Building (Complexity Removed)

### Removed Components

| Component | Original Plan | New Plan | Savings |
|-----------|---------------|----------|---------|
| **WebSocket Bridge** | Translate legacy clients | Not needed (pure P2P) | 800 LOC, 1 week |
| **Nostream Fork** | 10,000+ LOC relay | Simple storage layer | 9,000 LOC, 3 weeks |
| **Cronos Integration** | Full chain support | Removed | 2 weeks |
| **Arbitrum Integration** | Full chain support | Removed | 2 weeks |
| **Lightning Network** | Bitcoin payments | Removed | 3 weeks |
| **XRP Ledger** | XRP payments | Removed | 2 weeks |
| **ILP Liquidity Pools** | Multi-chain pools | Not needed | 3 weeks |
| **Swap Quote API** | Token swapping | Not needed | 1 week |
| **DEX Integration** | Osmosis swaps | Not needed | 2 weeks |
| **Liquidity Rebalancing** | Complex algorithms | Not needed | 2 weeks |

**Total Time Saved:** 21 weeks ≈ **5 months**

---

## 6. What We ARE Building (Core Components)

### Component 1: BTP-NIPs Handler (Epic 5)
```
Purpose: Extract Nostr events from ILP packets
LOC: ~500
Complexity: Low
Dependencies: Dassie ILP packet handling
```

### Component 2: Nostr Storage Layer (Epic 5)
```
Purpose: Store events, handle queries, manage subscriptions
LOC: ~1,500
Complexity: Medium
Dependencies: PostgreSQL, Redis
```

### Component 3: Base Settlement (Epic 4)
```
Purpose: Unidirectional payment channels with top-up
LOC: ~300 (Solidity) + ~500 (TypeScript module)
Complexity: Low (similar to Epic 3)
Dependencies: Base L2, OpenZeppelin
```

### Component 4: Peer Networking (Epic 6)
```
Purpose: Integrate Nostr social graph with Dassie network discovery
LOC: ~1,000
Complexity: Low (leverage existing Dassie features)
Dependencies: Dassie BNL/KNL, Kind 3, Kind 32001
```

### Component 5: Akash Integration (Epic 7)
```
Purpose: Track revenue, buy AKT, pay hosting
LOC: ~400
Complexity: Low (direct Cosmos SDK transactions)
Dependencies: CosmJS, Akash RPC
```

### Component 6: Web UI (Epic 9)
```
Purpose: User interface for peer operations
LOC: ~2,000
Complexity: Medium
Dependencies: React/Next.js, tRPC client
```

**Total LOC: ~8,200** (vs 25,000 originally)

---

## 7. Payment Channel Design (Unidirectional)

### Key Features

1. **Unidirectional flow** - Only sender deposits
2. **Multi-token support** - ETH, USDC, any ERC-20
3. **Top-up capability** - Sender can add funds anytime
4. **Low capital** - Only deposit for outbound follows
5. **Gas efficient** - ~$0.005 per top-up on Base

### Channel Structure

```solidity
struct Channel {
  address sender;        // Alice (payer)
  address recipient;     // Bob (payee)
  address token;         // USDC or ETH
  uint256 balance;       // Alice's deposit (Bob deposits $0)
  uint256 highestNonce;  // Prevent double-spend
  uint256 expiration;    // Auto-expire after 30 days
  bool isClosed;
}
```

### Functions

```solidity
// Open channel (sender deposits only)
function openChannel(
  address tokenAddress,
  address recipient,
  uint256 amount,
  uint256 expiration
) external payable returns (bytes32 channelId)

// Top-up channel (sender adds more funds)
function topUpChannel(
  bytes32 channelId,
  uint256 amount
) external payable

// Close channel (settle final state)
function closeChannel(
  bytes32 channelId,
  uint256 claimAmount,
  uint256 nonce,
  bytes memory signature
) external

// Expire channel (auto-refund after expiration)
function expireChannel(bytes32 channelId) external
```

---

## 8. Capital Requirements Per Peer

### Bootstrap Phase (New Peer)

```
Initial Setup:
─────────────
Akash deposit: $15 (3 months hosting @ $5/month)
Base channel: $50 (for 1-2 initial peer connections)
Total: $65

After 1 Month (Active User):
─────────────────────────────
Akash: $15 (unchanged)
Base channels: $250 (5 peers × $50)
Total: $265

After 3 Months (Power User):
─────────────────────────────
Akash: $15 (unchanged)
Base channels: $500 (10 peers × $50)
Total: $515

Earnings (if quality content):
Revenue: $5-50/day from subscriptions
Routing fees: $0.50-5/day
```

### Capital Recovery

**Channels are recoverable:**
- Close channel → Get unused balance back
- If Alice deposited $50, spent $30 → Refund $20
- Not lost capital, just locked temporarily

---

## 9. Network Bootstrap Strategy

### Phase 1: Genesis (3-5 Seed Nodes)

```
Seed1, Seed2, Seed3 deployed by project team
- Well-funded ($1,000 each in channels)
- High availability (redundant hosting)
- Bootstrap Node List (hardcoded in client)
```

### Phase 2: Early Adopters (10-20 Peers)

```
Early users deploy their own nodes
- Connect to seed nodes via Dassie BNL
- Open channels with seeds ($50 each)
- Publish interesting content
- Attract followers
```

### Phase 3: Growth (100+ Peers)

```
Network effects kick in
- Peers discover each other via KNL
- Direct peer-to-peer connections
- Reduced reliance on seed nodes
- Decentralized topology emerges
```

---

## 10. Technical Decisions

### Decision 1: Protocol Architecture ✅
- **Selected:** BTP-NIPs native (events in ILP packets)
- **Rejected:** Dual protocol (Nostr WebSocket + ILP)
- **Rationale:** Simpler, atomic guarantees, foundation for agents

### Decision 2: Chain Support ✅
- **Selected:** Base L2 only
- **Rejected:** Multi-chain (Cronos, Arbitrum, Lightning, XRP)
- **Rationale:** 77% less capital, 70% less work, Base has best UX

### Decision 3: Akash Payment Method ✅
- **Selected:** Direct Cosmos transactions
- **Rejected:** ILP token swapping via DEX
- **Rationale:** Simpler, no liquidity pools, no DEX integration

### Decision 4: Network Model ✅
- **Selected:** Pure peer-to-peer (everyone equal)
- **Rejected:** Client/server with relay operators
- **Rationale:** More decentralized, simpler architecture

### Decision 5: Client Compatibility ✅
- **Selected:** New network (no legacy compatibility)
- **Rejected:** WebSocket bridge for existing clients
- **Rationale:** This is a new protocol, not Nostr v2

### Decision 6: Payment Channels ✅
- **Selected:** Unidirectional channels with top-up
- **Rejected:** Bidirectional channels
- **Rationale:** More capital efficient, simpler logic

---

## 11. Updated Timeline

### New Timeline: 12 Weeks to MVP

| Epic | Duration | Cumulative | Key Deliverables |
|------|----------|------------|------------------|
| **Epic 4:** Base Payment Channels | 2 weeks | Week 2 | Contract + top-up deployed |
| **Epic 5:** BTP-NIPs Protocol | 4 weeks | Week 6 | Events in ILP packets working |
| **Epic 6:** Peer Networking | 2 weeks | Week 8 | P2P discovery integrated |
| **Epic 7:** Akash Integration | 1 week | Week 9 | Direct payments working |
| **Epic 8:** Deployment | 1 week | Week 10 | Live on Akash testnet |
| **Epic 9:** Web UI | 2 weeks | Week 12 | Full peer UI complete |

**MVP Delivery:** 12 weeks (3 months)

**vs Original Plan:** 24 weeks (6 months) - **50% faster!**

---

## 12. Risk Assessment

| Risk | Likelihood | Impact | Mitigation | Status |
|------|-----------|--------|------------|--------|
| BTP-NIPs complexity | Low | Medium | Use research specs, proven protocol | ✅ Low |
| Dassie integration | Low | High | Leverage existing features (BNL/KNL) | ✅ Low |
| Base L2 reliability | Low | Medium | Battle-tested, Coinbase backing | ✅ Low |
| User adoption (new network) | High | High | Start small, prove value, grow organic | ⚠️ Medium |
| Capital requirements | Medium | Low | Unidirectional channels reduce capital | ✅ Low |
| Akash hosting costs | Low | Medium | Cheap ($5/month), can migrate if needed | ✅ Low |
| Network cold start | High | Medium | Bootstrap with 3-5 seed nodes | ⚠️ Medium |

**Overall Risk:** LOW-MEDIUM (much lower than multi-chain complexity)

---

## 13. Specific Changes to Story 4.1

### Added Acceptance Criteria (AC 10-13)

**AC 10:** Top-up functionality
```solidity
function topUpChannel(
    bytes32 channelId,
    uint256 amount
) external payable
```

**AC 11:** Top-up validation
- Only sender can top-up their channel
- Channel must not be closed
- Handle both ETH (msg.value) and ERC-20 (transferFrom)
- Increase channel.balance
- Emit ChannelToppedUp event

**AC 12:** Top-up events
```solidity
event ChannelToppedUp(
    bytes32 indexed channelId,
    address indexed sender,
    uint256 amount,
    uint256 newBalance,
    uint256 timestamp
);
```

**AC 13:** Test top-up scenarios
- Sender can top-up with USDC
- Sender can top-up with ETH
- Multiple top-ups work correctly
- Top-up increases balance
- Recipient cannot top-up (reverts)
- Cannot top-up closed channel (reverts)

### Added Tasks

**Task 7:** Add Top-Up Functionality (10 subtasks)
**Task 9:** Write Top-Up Test Suite (11 test cases)
**Task 11:** Updated to document top-up in README

### Updated Dev Notes

Added architecture context explaining peer-to-peer model and unidirectional channels.

---

## 14. Epic Dependencies & Flow

```
Epic 4 (Payment Channels)
  ↓ Provides: On-chain settlement for peer payments

Epic 5 (BTP-NIPs Protocol)
  ↓ Provides: Core protocol for embedding events in ILP

Epic 6 (Peer Networking)
  ↓ Provides: Social graph → network topology mapping

Epic 7 (Akash Integration)
  ↓ Provides: Self-sustainability (pay hosting from revenue)

Epic 8 (Deployment)
  ↓ Provides: Running peer on Akash

Epic 9 (Web UI)
  ↓ Provides: User interface for peer operations

Epic 10+ (Future)
  - Arweave storage
  - Multi-chain expansion
  - Autonomous agents
```

---

## 15. PRD Impact Summary

### Requirements Added

- **FR40:** System shall embed Nostr events in ILP STREAM packets (BTP-NIPs)
- **FR41:** System shall maintain bidirectional ILP STREAM for subscriptions
- **FR42:** System shall support unidirectional payment channels on Base L2
- **FR43:** System shall support channel top-up by sender
- **FR44:** System shall execute direct Cosmos transactions to Akash escrow

### Requirements Removed

- ~~FR16: Bitcoin/Lightning Network support~~
- ~~FR17: Multi-chain settlement (kept Base only)~~
- ~~FR19: XRP Ledger support~~
- ~~FR10: tRPC payment verification~~ (replaced with ILP STREAM validation)

### Requirements Modified

- **NFR18:** Break-even within 30 days with 100+ peers (was 500+ users)
- **NFR21:** Akash cost < $5/month per peer (was $10)

---

## 16. Artifact Updates Required

| File | Change Type | Description | Effort |
|------|-------------|-------------|--------|
| `docs/stories/4.1.story.md` | ✅ **DONE** | Added AC 10-13 (top-up) | 15 min |
| `docs/prd/epic-4-*.md` | Update | Base-only, remove multi-chain | 10 min |
| `docs/prd/epic-5-*.md` | Rewrite | BTP-NIPs protocol (not Akash) | 30 min |
| `docs/prd/epic-6-*.md` | Rewrite | Peer networking (not Arweave) | 30 min |
| `docs/prd/epic-7-*.md` | Rewrite | Direct Akash (not connector opt) | 20 min |
| `docs/prd/epic-list.md` | Update | New epic structure | 5 min |
| `docs/architecture/high-level-architecture.md` | Update | P2P diagram, BTP-NIPs flow | 20 min |
| `docs/prd/requirements.md` | Update | Add/remove requirements | 15 min |
| `docs/prd/future-work.md` | Create | Document autonomous agents | 15 min |
| `docs/research/autonomous-agent-relays/README.md` | Update | Add future work notice | 5 min |

**Total Effort:** ~2.5 hours

---

## 17. Approval & Next Steps

### User Approval Required

**Architecture Decisions:**
- [ ] I approve BTP-NIPs native protocol (events in ILP packets)
- [ ] I approve Base L2 as only EVM chain (no multi-chain)
- [ ] I approve direct Akash payments (no ILP token swapping)
- [ ] I approve pure peer-to-peer model (no client/server, no WebSocket bridge)
- [ ] I approve unidirectional payment channels with top-up (sender deposits only)

**Epic Structure:**
- [ ] I approve revised Epic 4-9 structure
- [ ] I approve deferring autonomous agents to Epic 10+
- [ ] I approve 12-week timeline to MVP

**Story 4.1 Updates:**
- [ ] I approve AC 10-13 (top-up functionality)
- [ ] I approve Task 7 (top-up implementation)
- [ ] I approve Task 9 (top-up test suite)

### Immediate Next Steps (After Approval)

**Hour 1-2:** Update documentation
1. Apply all artifact updates (2.5 hours)
2. Commit changes with clear message
3. Update project status

**Hour 3+:** Begin Epic 4 Story 4.1
1. Review CronosPaymentChannel.sol (baseline)
2. Design multi-token factory architecture
3. Begin contract implementation

**Week 1-2:** Complete Epic 4
- Story 4.1: Contract + tests
- Story 4.2: Deploy to Base
- Story 4.3: Dassie module

**Week 3-6:** Epic 5 (BTP-NIPs)

---

## 18. Success Criteria

### This change proposal succeeds when:

1. ✅ User approves all architectural decisions
2. ✅ All documentation updated (10 files, 2.5 hours)
3. ✅ Team understands peer-to-peer model
4. ✅ Epic 4 Story 4.1 proceeds without blockers
5. ✅ 12-week timeline to MVP is realistic

### MVP succeeds when:

1. ✅ 10+ peers deployed on Akash
2. ✅ Peers can discover each other (Dassie BNL/KNL + Kind 32001)
3. ✅ Peers can open payment channels (Base L2)
4. ✅ Peers can subscribe to each other (BTP-NIPs)
5. ✅ Events propagate via ILP routing
6. ✅ At least 50% of peers are profitable (revenue > costs)

---

## 19. Key Insights from This Process

### What We Learned

1. **Leverage existing infrastructure** - Dassie has peer discovery, don't rebuild it
2. **ILP routing IS event routing** - Multi-hop routing is built-in
3. **Unidirectional channels are more efficient** - Recipient doesn't need to deposit
4. **Base-only is sufficient** - Multi-chain adds massive complexity for little benefit
5. **Pure P2P is simpler** - No client/server, no bridge, everyone equal
6. **Foundation = Agent infrastructure** - Same protocol, just add decision layer later

### Architectural Clarity Achieved

**Before this analysis:**
- Unclear how Nostr and ILP peer discovery interact
- Thought we needed separate event routing
- Thought we needed bidirectional channels
- Thought we needed WebSocket bridge

**After this analysis:**
- ✅ Nostr (social) + Dassie (network) = complete discovery
- ✅ ILP routing handles event propagation
- ✅ Unidirectional channels with top-up = optimal
- ✅ Pure P2P = no bridge needed

---

## 20. Comparison Summary

### Original Vision (From Research)
```
Goal: Autonomous agent relay network
Complexity: Very High
Timeline: 12 months, $700K-1M
Features: AI agents, multi-chain, complex treasury
```

### Foundation Approach (v1 Change Proposal)
```
Goal: Build infrastructure first, defer agents
Complexity: High
Timeline: 6 months
Features: Multi-chain, ILP swaps, WebSocket compatibility
```

### Final Architecture (v3 - This Proposal)
```
Goal: Pure P2P BTP-NIPs network (foundation for agents)
Complexity: Medium-Low
Timeline: 3 months
Features: Base-only, direct Akash, P2P native, unidirectional channels
```

**Evolution:** Very High → High → Medium-Low complexity ✅

---

## Approval

**Prepared By:** Claude Code (Sonnet 4.5)
**Date:** 2025-12-05
**Version:** 3.0 (Final)
**Change Checklist:** ✅ Complete

**Awaiting user approval to:**
1. Update all documentation (~2.5 hours)
2. Proceed with Epic 4 Story 4.1 (Multi-Token Payment Channel Factory with top-up)

---

**Signature:** _________________________________
**Date:** _________________________________
