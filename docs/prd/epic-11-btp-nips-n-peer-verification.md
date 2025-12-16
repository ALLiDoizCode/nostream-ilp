# Epic 11: BTP-NIPs N-Peer Network Verification

## Epic Metadata

- **Epic ID:** 11
- **Type:** Quality Assurance & Integration Testing
- **Status:** Planned
- **Priority:** High (Blocker for Production Deployment)
- **Dependencies:** Epic 5 (BTP-NIPs Core Protocol)
- **Estimated Duration:** 2 weeks
- **Created:** 2025-12-16
- **Owner:** Product Owner (Sarah) / QA (Quinn)

---

## Epic Goal

**Verify the BTP-NIPs protocol functions correctly in multi-node mesh networks (5-10+ peers) through comprehensive integration testing, economic flow validation, and resilience testing - ensuring production readiness before deployment.**

---

## Problem Statement

### Current State (Gap Identified by QA)

Quinn's analysis of the test suite revealed:

**✅ What's Verified:**
- Unit tests: 100% coverage of individual components
- 2-peer flows: Excellent coverage (Alice ↔ Bob)
- 3-peer multi-hop: Good coverage (Alice → Bob → Carol)
- 4-peer propagation: Mocked tests only

**❌ Critical Gaps:**
1. **No full N-peer mesh network tests** (5-10 independent nodes with complete protocol stack)
2. **No peer discovery integration tests** (components tested in isolation only)
3. **No real Dassie ILP routing tests** (all tests use `MockStreamConnection`)
4. **No economic flow verification** across multi-hop routing (payment accounting, fee distribution)
5. **No network resilience tests** (node failures, partitions, recovery)

**Confidence Level:** 70% (components work, small networks work, unknown for production mesh)

### Risk to Production

Without N-peer verification:
- **Unknown scalability limits** (does the protocol work with 50+ peers?)
- **Unknown failure modes** (what breaks when nodes crash mid-propagation?)
- **Unverified economic model** (are routing fees calculated correctly across N hops?)
- **Potential cascading failures** in production mesh
- **Deployment blocker** for Akash Network

---

## Epic Description

### Existing System Context

**Current BTP-NIPs Implementation (Epic 5):**
- Protocol specification complete
- Parser, serializer, crypto implemented
- Event handlers: EVENT, REQ, CLOSE, EOSE, OK
- Subscription manager with filter matching
- Event deduplication and TTL enforcement
- Payment validation and kind-based pricing

**Technology Stack:**
- TypeScript/Node.js
- Vitest test framework
- PostgreSQL + Redis (EventRepository, EventCache)
- ILP STREAM protocol (via Dassie integration)
- Nostr protocol (event signing, verification)

**Integration Points:**
- Dassie ILP node (HTTP API for payment verification)
- PostgreSQL database (event storage)
- Redis cache (event caching, deduplication)
- Peer discovery system (BNL/KNL from Epic 6)

---

### Enhancement Details

**What's Being Added:**

1. **N-Peer Integration Test Framework**
   - Utility to spin up 5-10 test nodes with full protocol stack
   - Network orchestration (mesh formation, peer discovery simulation)
   - Test helpers for multi-node scenarios

2. **Comprehensive Integration Test Suites**
   - N-peer event propagation tests (10-node mesh)
   - Economic flow verification (multi-hop payment tracking)
   - Real Dassie integration tests (replace mocks with actual ILP nodes)
   - Network resilience tests (failures, partitions, recovery)

3. **Performance Benchmarks**
   - Mesh scalability tests (10, 25, 50, 100 nodes)
   - Latency measurement across network diameter
   - Throughput testing under network load

4. **Continuous Verification Infrastructure**
   - CI/CD integration for N-peer tests
   - Performance regression detection
   - Network health monitoring during tests

**How It Integrates:**

- Extends existing test suite (`test/btp-nips/integration/`)
- Uses real Dassie nodes (Docker/process orchestration)
- Leverages existing components (no protocol changes)
- Adds test-only orchestration layer

**Success Criteria:**

1. ✅ 10-node mesh: Event propagation verified end-to-end
2. ✅ Economic flow: All routing fees tracked and validated across 5+ hops
3. ✅ Real Dassie: ILP payment settlement verified with actual Dassie nodes
4. ✅ Resilience: Node failures handled gracefully without cascade
5. ✅ Performance: p95 latency < 500ms for 10-hop propagation
6. ✅ CI/CD: Automated N-peer tests run on every PR

---

## Stories

### Story 11.1: N-Peer Test Framework Infrastructure

**Goal:** Build reusable test framework for spinning up N independent nodes with full BTP-NIPs stack.

**Acceptance Criteria:**
- `createTestNetwork(n)` utility function
- Each node has: EventRepository, EventCache, SubscriptionManager, PeerDiscovery, ILP connection
- Network orchestration: mesh formation, peer discovery, heartbeat simulation
- Cleanup utilities (graceful shutdown, resource cleanup)

**Estimated Effort:** 3 days

---

### Story 11.2: N-Peer Event Propagation Integration Tests

**Goal:** Verify event propagation across 5-10 node mesh networks with deduplication, TTL, and subscription matching.

**Acceptance Criteria:**
- Test: 10-node mesh, Alice publishes, all 9 subscribers receive event
- Test: Deduplication works network-wide (each node sees event exactly once)
- Test: TTL enforcement prevents infinite loops
- Test: Source filtering prevents echo back to publisher
- Test: Subscription matching scales sub-linearly with network size

**Estimated Effort:** 4 days

---

### Story 11.3: Economic Flow Verification Tests

**Goal:** Track and verify payment flows across multi-hop routing with fee accounting.

**Acceptance Criteria:**
- Test: 5-hop payment (Alice → Bob → Carol → Dave → Eve)
- Verify: Each intermediate node receives correct routing fee
- Verify: Final recipient receives expected amount (original - total fees)
- Test: Payment fulfillment propagates back to sender
- Test: Insufficient payment rejected at each hop

**Estimated Effort:** 3 days

---

### Story 11.4: Real Dassie Integration Tests

**Goal:** Replace `MockStreamConnection` with real Dassie nodes for ILP routing verification.

**Acceptance Criteria:**
- Docker Compose setup for N Dassie nodes
- Test: ILP STREAM connection establishment between peers
- Test: Payment settlement via real Dassie ILP routing
- Test: Dassie peering (BNL/KNL integration)
- Test: Multi-hop ILP payment through Dassie network

**Estimated Effort:** 5 days

---

### Story 11.5: Network Resilience & Failure Tests

**Goal:** Verify protocol handles node failures, network partitions, and recovery gracefully.

**Acceptance Criteria:**
- Test: Node crash mid-propagation (event still reaches other peers)
- Test: Network partition and healing (state synchronization)
- Test: Reconnection and subscription renewal
- Test: Graceful degradation (partial network connectivity)
- Test: Byzantine fault tolerance (malicious peers)

**Estimated Effort:** 4 days

---

### Story 11.6: Performance Benchmarks & CI/CD Integration

**Goal:** Establish performance baselines and automate N-peer tests in CI/CD pipeline.

**Acceptance Criteria:**
- Benchmark: Mesh scalability (10, 25, 50, 100 nodes)
- Benchmark: Latency distribution across network diameter
- Benchmark: Throughput under sustained load
- CI/CD: N-peer tests run on every PR (with reasonable timeouts)
- CI/CD: Performance regression detection and alerts

**Estimated Effort:** 3 days

---

### Story 11.7: Docker Network Simulation Infrastructure

**Goal:** Add Docker network simulation with configurable latency, jitter, and packet loss using `tc` (traffic control) for realistic network testing.

**Acceptance Criteria:**
- Docker network with traffic control (tc) support
- Latency simulation (configurable per container)
- Packet loss simulation (configurable rate)
- Jitter simulation (latency variance)
- Initialization script for traffic control rules
- Test framework integration (networkSimulation config)
- Network condition verification
- Performance impact testing

**Estimated Effort:** 2 days

**Dependencies:**
- Story 11.4 complete (Docker Dassie Integration)

---

## Compatibility Requirements

- ✅ **No protocol changes** (verification only, no BTP-NIPs modifications)
- ✅ **Backward compatible test infrastructure** (existing unit tests unaffected)
- ✅ **CI/CD compatible** (tests complete within reasonable timeouts: < 15 minutes)
- ✅ **Resource efficient** (tests run on standard CI runners: 4 CPU, 8GB RAM)

---

## Risk Mitigation

### Primary Risks

1. **Risk: Test infrastructure complexity**
   - **Impact:** High (blocked epic if framework doesn't work)
   - **Mitigation:** Start with 3-node tests, incrementally scale to 10+
   - **Rollback:** Use existing 2-3 peer tests as baseline

2. **Risk: Dassie integration flakiness**
   - **Impact:** Medium (CI/CD failures from Dassie instability)
   - **Mitigation:** Docker network isolation, retry logic, health checks
   - **Rollback:** Keep mock-based tests as fallback

3. **Risk: CI/CD timeout issues**
   - **Impact:** Medium (slow tests block development)
   - **Mitigation:** Parallel test execution, selective N-peer runs (nightly builds)
   - **Rollback:** Make N-peer tests optional (manual trigger)

4. **Risk: Discovery of protocol bugs**
   - **Impact:** High (delays deployment, requires Epic 5 fixes)
   - **Mitigation:** Allocate buffer for bug fixes (2-3 days)
   - **Rollback:** Document bugs, prioritize fixes in separate epic

---

## Definition of Done

### Epic Completion Criteria

- ✅ All 7 stories completed with acceptance criteria met
- ✅ N-peer test suite passing consistently (< 5% flake rate)
- ✅ Real Dassie integration verified (no mocks in critical paths)
- ✅ Performance benchmarks established and documented
- ✅ CI/CD pipeline running N-peer tests automatically
- ✅ Network simulation infrastructure functional (latency, jitter, packet loss)
- ✅ No regressions in existing unit/integration tests
- ✅ Documentation updated (README, test suite guide)

### Production Readiness Gate

This epic serves as a **quality gate for Epic 8 (Deployment)**:

- ❌ **Cannot deploy to Akash** without N-peer verification
- ✅ **Can proceed with deployment** once all tests pass
- 📊 **Baseline metrics established** for production monitoring

---

## Dependencies

### Upstream Dependencies

- **Epic 5 (BTP-NIPs Core Protocol):** Must be complete before verification
- **Epic 6 (Peer Networking):** Peer discovery integration needed for Story 11.4
- **Story 5.9 (Dassie tRPC Endpoints):** Required for Story 11.4 (Real Dassie Integration)
- **Story 5.10 (Dassie Configuration & BTP-NIPs Reception):** Required for Story 11.4 (Real Dassie Integration)

### Downstream Dependencies

- **Epic 8 (Deployment):** Blocked until this epic completes
- **Epic 9 (Web UI):** Network stability confidence needed for user-facing features

---

## Timeline

**Total Duration:** 3 weeks (15 working days)

**Week 1:**
- Days 1-3: Story 11.1 (Test Framework)
- Days 4-5: Story 11.2 (Event Propagation) - Part 1

**Week 2:**
- Days 1-2: Story 11.2 (Event Propagation) - Part 2
- Days 3-5: Story 11.3 (Economic Flow)
- Days 6-7: Story 11.4 (Real Dassie) - Part 1 (blocked on 5.9, 5.10)

**Week 3:**
- Days 1-3: Story 11.4 (Real Dassie) - Part 2
- Days 4-5: Story 11.7 (Network Simulation) - depends on 11.4
- Days 6-8: Story 11.5 (Resilience)
- Days 9-10: Story 11.6 (Benchmarks & CI/CD)

**Week 4 (Buffer):**
- Days 1-2: Final validation with network simulation
- Days 3-5: Documentation, bug fixes, performance tuning

**Critical Path:** Story 11.1 → 11.2 → 11.4 (blocked on 5.9, 5.10) → 11.7 (can parallelize 11.3, 11.5, 11.6)

---

## Stakeholder Communication

### Key Stakeholders

- **Quinn (QA):** Epic owner, test design and execution
- **Dev Team:** Implementation support, bug fixes if needed
- **Sarah (PO):** Epic validation, story refinement
- **DevOps/CI:** CI/CD pipeline integration

### Communication Plan

- **Daily standup updates** during execution
- **Mid-epic checkpoint** (end of Week 1): Review Story 11.1-11.2 results
- **Final validation meeting** (end of Week 2): Go/no-go for Epic 8 deployment

---

## Success Metrics

### Quantitative Metrics

1. **Test Coverage:**
   - N-peer integration tests: 10+ scenarios
   - Economic flow tests: 5+ multi-hop scenarios
   - Resilience tests: 8+ failure scenarios

2. **Performance Baselines:**
   - 10-node mesh: p95 event propagation < 500ms
   - 50-node mesh: p95 event propagation < 2000ms
   - Subscription matching: < 50ms for 1000 subscriptions

3. **Reliability:**
   - Test flake rate: < 5%
   - CI/CD success rate: > 95%
   - Zero protocol bugs discovered (aspirational)

### Qualitative Metrics

- **Confidence level:** 95%+ for production deployment
- **Team readiness:** Full understanding of failure modes
- **Documentation quality:** Runbook for debugging network issues

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-12-16 | 1.0 | Initial epic creation based on QA gap analysis | Sarah (PO) |

---

## References

- **QA Analysis:** Quinn's verification report (2025-12-16)
- **Existing Tests:** `test/btp-nips/integration/btp-nips-e2e.spec.ts`
- **Protocol Spec:** `docs/prd/epic-5-btp-nips-protocol.md`
- **Test Patterns:** `test/btp-nips/performance/btp-nips-e2e-perf.spec.ts`

---

**Notes:**

This epic is **non-negotiable for production deployment**. The 70% confidence level from current 2-3 peer tests is insufficient for a production peer-to-peer network that will handle real user payments and content propagation.

The investment in comprehensive N-peer testing will pay dividends by:
1. Preventing production incidents
2. Establishing performance baselines for monitoring
3. Building team confidence in the protocol
4. Enabling safe deployment to Akash Network

---
