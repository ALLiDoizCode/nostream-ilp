# Economic Flow Verification - Implementation Guide

This document provides comprehensive guidance on the economic flow verification test suite, including payment flow diagrams, fee calculation formulas, economic model explanation, and troubleshooting.

## Table of Contents

1. [Payment Flow Diagrams](#payment-flow-diagrams)
2. [Fee Calculation Formulas](#fee-calculation-formulas)
3. [Economic Model Explanation](#economic-model-explanation)
4. [Troubleshooting Guide](#troubleshooting-guide)

---

## Payment Flow Diagrams

### 1. Basic 5-Hop Payment Flow

```
┌─────────┐  100 msats   ┌─────────┐  90 msats   ┌─────────┐  80 msats   ┌─────────┐  70 msats   ┌─────────┐  60 msats   ┌─────────┐
│  Alice  │─────────────→│   Bob   │────────────→│  Carol  │────────────→│  Dave   │────────────→│   Eve   │────────────→│  Frank  │
│(sender) │              │ (-10ms) │             │ (-10ms) │             │ (-10ms) │             │ (-10ms) │             │(receiver)│
└─────────┘              └─────────┘             └─────────┘             └─────────┘             └─────────┘             └─────────┘
                            ↓ 10ms                  ↓ 10ms                  ↓ 10ms                  ↓ 10ms                  ↓ 50ms
                         Revenue                  Revenue                 Revenue                 Revenue              Content Fee
                                                                                                                      + 10ms routing
```

**Flow Breakdown:**
1. Alice initiates payment: 100 msats
2. Bob receives 100 msats, deducts 10 msats fee, forwards 90 msats
3. Carol receives 90 msats, deducts 10 msats fee, forwards 80 msats
4. Dave receives 80 msats, deducts 10 msats fee, forwards 70 msats
5. Eve receives 70 msats, deducts 10 msats fee, forwards 60 msats
6. Frank receives 60 msats (50 msats content fee + 10 msats routing fee)

**Accounting Verification:**
- Total payment: 100 msats
- Total routing fees: 50 msats (5 hops × 10 msats)
- Final delivery: 50 msats (content fee)
- **Invariant:** `100 = 50 + 50` ✓

---

### 2. Payment Fulfillment Propagation

```
Forward Payment (Alice → Frank)
Alice ──→ Bob ──→ Carol ──→ Dave ──→ Eve ──→ Frank
  (1)      (2)      (3)      (4)     (5)      (6)

Fulfillment Propagation (Frank → Alice)
Alice ←── Bob ←── Carol ←── Dave ←── Eve ←── Frank
  (11)     (10)     (9)      (8)     (7)      (6)
```

**Timing:**
1. **Forward propagation:** 100-200ms (p95) for 5 hops
2. **Fulfillment propagation:** < 1000ms (p95)
3. **Total round-trip:** < 1200ms (p95)

**State Transitions:**
- Alice: PENDING → FULFILLED
- Bob-Eve: FORWARDED → SETTLED
- Frank: RECEIVED → SETTLED

---

### 3. Insufficient Payment Rejection

```
┌─────────┐  60 msats   ┌─────────┐           ┌─────────┐
│  Alice  │────────────→│   Bob   │─────X─────│  Carol  │
│(sender) │             │         │           │         │
└─────────┘             └─────────┘           └─────────┘
     ↑                       │
     │                       │ REJECT: Insufficient payment
     └───────────────────────┘ (needs 90, has 50)
```

**Rejection Logic:**
1. Alice sends 60 msats for 100 msat event
2. Bob receives 60 msats
3. Bob calculates: 60 - 10 (fee) = 50 remaining
4. Bob knows next hop requires 90 msats
5. 50 < 90 → **REJECT**
6. Rejection propagates back to Alice
7. **Atomic rollback:** No fees collected

---

### 4. Variable Routing Fees

```
┌─────────┐  100 msats  ┌─────────┐  95 msats  ┌─────────┐  85 msats  ┌─────────┐  70 msats  ┌─────────┐  50 msats  ┌─────────┐
│  Alice  │────────────→│   Bob   │───────────→│  Carol  │───────────→│  Dave   │───────────→│   Eve   │───────────→│  Frank  │
└─────────┘             └─────────┘            └─────────┘            └─────────┘            └─────────┘            └─────────┘
                           ↓ 5ms                 ↓ 10ms                 ↓ 15ms                 ↓ 20ms                 ↓ 50ms
                         Revenue                Revenue                Revenue                Revenue              Content Fee
```

**Fee Schedule:**
- Bob: 5 msats
- Carol: 10 msats
- Dave: 15 msats
- Eve: 20 msats
- Frank: 50 msats (content fee)

**Total:** 5 + 10 + 15 + 20 + 50 = **100 msats**

---

### 5. Multi-Path Routing

```
                    ┌─────────┐
              ┌────→│   Bob   │────┐
              │     └─────────┘    │
              │                    ↓
┌─────────┐   │     ┌─────────┐    │     ┌─────────┐
│  Alice  │───┼────→│  Carol  │────┼────→│  Frank  │
└─────────┘   │     └─────────┘    │     └─────────┘
              │                    ↑
              │     ┌─────────┐    │
              └────→│   Eve   │────┘
                    └─────────┘
```

**Path Selection:**
- **Path 1:** Alice → Bob → Frank (2 hops, 20 msats fees)
- **Path 2:** Alice → Carol → Frank (2 hops, 20 msats fees)
- **Path 3:** Alice → Eve → Frank (2 hops, 20 msats fees)

**Load Balancing Strategy:**
- Prefer shortest paths (fewer hops = lower fees)
- Distribute across available paths
- Monitor queue depth (< 100 packets per path)

---

### 6. Payment Timeout

```
┌─────────┐  100 msats  ┌─────────┐  90 msats  ┌─────────┐
│  Alice  │────────────→│   Bob   │───────────→│  Carol  │
└─────────┘             └─────────┘            └─────────┘
     ↑                       ↑                       │
     │                       │                       X (fails to forward)
     │                       │
     │  TIMEOUT (30s)        │
     │ ←─────────────────────┘
     │
     └─ Rollback, no fees collected
```

**Timeout Handling:**
1. Carol fails to forward within 30 seconds
2. Bob detects timeout (no fulfillment or rejection)
3. Bob sends timeout rejection to Alice
4. Alice receives timeout notification
5. **Atomic rollback:** All nodes release reserved liquidity
6. Payment state: PENDING → TIMEOUT → FAILED

---

## Fee Calculation Formulas

### 1. Basic Fee Calculation

**Formula:**
```
total_payment = content_fee + routing_fees
routing_fees = hop_count × fee_per_hop
```

**Example (uniform fees):**
```
content_fee = 50 msats
hop_count = 5
fee_per_hop = 10 msats

routing_fees = 5 × 10 = 50 msats
total_payment = 50 + 50 = 100 msats
```

---

### 2. Variable Fee Calculation

**Formula:**
```
total_payment = content_fee + Σ(fee_i) for i in path
```

**Example:**
```
path = [Alice, Bob, Carol, Dave, Eve, Frank]
fees = [0, 5, 10, 15, 20, 0]  // Alice and Frank don't charge routing fees
content_fee = 50

total_payment = 50 + (5 + 10 + 15 + 20) = 100 msats
```

---

### 3. Kind-Based Pricing

**Formula:**
```
total_payment = kind_base_fee × kind_multiplier + routing_fees
```

**Example:**
```
Kind 1 (short note):
  base_fee = 50 msats
  multiplier = 1.0
  routing_fees = 50 msats
  total = 50 × 1.0 + 50 = 100 msats

Kind 30023 (long-form):
  base_fee = 50 msats
  multiplier = 10.0
  routing_fees = 50 msats
  total = 50 × 10.0 + 50 = 550 msats

Kind 1063 (file metadata):
  base_fee = 50 msats
  multiplier = 20.0
  routing_fees = 50 msats
  total = 50 × 20.0 + 50 = 1050 msats
```

---

### 4. Revenue Accounting

**Per-Node Revenue:**
```
node_revenue = total_received - total_forwarded
node_revenue = Σ(fee_i) for all payments routed by node
```

**Network-Wide Revenue:**
```
total_initiated = Σ(all sender payments)
total_delivered = Σ(all recipient deliveries)
total_fees = total_initiated - total_delivered
average_fee_per_hop = total_fees / total_hops
```

**Accounting Invariant:**
```
total_initiated = total_delivered + total_fees

// Conservation of value
Σ(sender_payments) = Σ(recipient_deliveries) + Σ(routing_fees)
```

---

### 5. Fee Deduction at Each Hop

**Formula:**
```
amount_received_i = amount_forwarded_(i-1)
fee_deducted_i = node_fee_i
amount_forwarded_i = amount_received_i - fee_deducted_i
```

**Example (5 hops):**
```
Hop 0 (Alice):  received=100, fee=0,  forwarded=100
Hop 1 (Bob):    received=100, fee=10, forwarded=90
Hop 2 (Carol):  received=90,  fee=10, forwarded=80
Hop 3 (Dave):   received=80,  fee=10, forwarded=70
Hop 4 (Eve):    received=70,  fee=10, forwarded=60
Hop 5 (Frank):  received=60,  fee=10, forwarded=50

Verify: 100 = 50 + (0 + 10 + 10 + 10 + 10 + 10) ✓
```

---

## Economic Model Explanation

### 1. Payment Channel Lifecycle

**Phases:**
1. **Channel Opening:** Alice and Bob deposit funds into payment channel
2. **Payment Flow:** Alice sends payments to Bob via routing nodes
3. **Fee Deduction:** Each node deducts routing fee
4. **Fulfillment:** Bob receives final payment and sends fulfillment back
5. **Settlement:** Routing fees are settled to intermediate nodes
6. **Channel Closing:** Alice and Bob close channel, settle final balances

---

### 2. Revenue Model

**Node Revenue Streams:**
- **Routing fees:** Earned by forwarding payments for others
- **Content fees:** Earned by hosting content (final recipient)
- **Settlement fees:** On-chain settlement costs (Cosmos, Base L2, XRP)

**Example Revenue (1000 events, 5 hops):**
```
Node        Routing Revenue    Content Revenue    Total Revenue
-----       ---------------    ---------------    -------------
Alice       0 msats            0 msats            0 msats (sender)
Bob         10,000 msats       0 msats            10,000 msats
Carol       10,000 msats       0 msats            10,000 msats
Dave        10,000 msats       0 msats            10,000 msats
Eve         10,000 msats       0 msats            10,000 msats
Frank       10,000 msats       50,000 msats       60,000 msats (recipient)

Network Total: 100,000 msats initiated
               50,000 msats delivered (content)
               50,000 msats fees (routing)
```

---

### 3. Economic Incentives

**Why Route Payments?**
- Earn routing fees (10 msats per event × 1000 events = 10,000 msats)
- Build reputation as reliable node
- Increase network connectivity
- Attract more routing traffic

**Why Publish Content?**
- Earn content fees (50 msats per event)
- Monetize content directly (no ads)
- Pay-per-view model

**Why Use Paid Relay?**
- Spam prevention (payment required)
- Quality content (economic signal)
- Reliable infrastructure (relay earns revenue for operations)

---

### 4. Attack Resistance

**Economic Attacks Prevented:**

1. **Overpayment Exploitation:**
   - Attacker sends 200 msats for 100 msat event
   - Excess 100 msats returned to sender
   - No node keeps excess fees
   - **Mitigation:** Strict accounting, refund excess

2. **Double-Spend:**
   - Attacker sends same payment twice
   - Second payment rejected (duplicate event ID)
   - Only one event stored
   - **Mitigation:** Event ID deduplication

3. **Fee Manipulation:**
   - Intermediate node (Carol) tries to keep 30 msats instead of 10
   - Next hop (Dave) receives 60 msats (expected 80)
   - Dave detects underpayment and rejects
   - Carol's attack fails (payment rolled back)
   - **Mitigation:** Each node verifies received amount matches expected

4. **Payment Replay:**
   - Attacker replays old payment packet
   - Replay detected via nonce/timestamp validation
   - Replayed payment rejected
   - **Mitigation:** Nonce tracking, timestamp expiry

---

### 5. Performance Targets

**Latency:**
- 5-hop payment: < 200ms (p95)
- 10-hop payment: < 500ms (p95)
- Fulfillment propagation: < 1000ms (p95)

**Throughput:**
- 100 concurrent payments: < 10 seconds
- No deadlocks or race conditions

**Accuracy:**
- 100% fee accounting accuracy
- Zero "lost" payments (all msats accounted for)
- Conservation invariant: `total_initiated = total_delivered + total_fees`

---

## Troubleshooting Guide

### Issue 1: Fee Accounting Fails

**Symptom:**
- Revenue sums don't match
- Accounting invariant fails: `total_initiated ≠ total_delivered + total_fees`

**Possible Causes:**
1. Concurrent updates to revenue counters
2. Incorrect fee deduction logic
3. Race condition in payment processing

**Debugging Steps:**
1. Add logging to each hop's fee deduction:
   ```typescript
   console.log(`Hop ${nodeId}: received=${amount}, fee=${fee}, forwarded=${amount-fee}`)
   ```

2. Verify fee deduction formula:
   ```typescript
   amountForwarded = amountReceived - feeDeducted
   ```

3. Check for race conditions:
   ```typescript
   // Bad: Non-atomic update
   node.revenue += fee

   // Good: Atomic update
   node.revenue.add(fee)
   ```

**Solution:**
- Use atomic operations for revenue counters
- Verify accounting invariant after each payment
- Run tests with single-threaded processing to isolate logic bugs

---

### Issue 2: Payment Times Out

**Symptom:**
- Payment fails to complete within timeout (30 seconds)
- TIMEOUT status instead of FULFILLED

**Possible Causes:**
1. Network simulation delays too aggressive
2. Actual implementation bug (infinite loop, deadlock)
3. Timeout value too short for multi-hop paths

**Debugging Steps:**
1. Reduce network latency to 0ms to isolate timing from logic:
   ```typescript
   const nodes = await createTestNetwork(6, {
     networkSimulation: { latency: 0 }
   })
   ```

2. Add timing markers at each hop:
   ```typescript
   console.log(`Hop ${nodeId}: arrived at ${performance.now()}ms`)
   ```

3. Check timeout value is reasonable:
   ```typescript
   // For 10 hops with 100ms network latency each
   const timeout = 10 * 100 * 2  // 2x buffer = 2000ms
   ```

**Solution:**
- Increase timeout for longer paths
- Fix deadlocks/infinite loops in payment logic
- Optimize hop processing time

---

### Issue 3: Revenue Doesn't Sum Correctly

**Symptom:**
- Network-wide revenue totals incorrect
- Per-node revenue doesn't match expected
- Conservation invariant fails

**Possible Causes:**
1. Race condition in concurrent payment processing
2. Double-counting fees
3. Lost updates (concurrent writes conflict)

**Debugging Steps:**
1. Run tests with single-threaded processing:
   ```typescript
   for (let i = 0; i < eventCount; i++) {
     await processPayment(i)  // Sequential, not concurrent
   }
   ```

2. Verify each node's revenue separately:
   ```typescript
   nodes.forEach(node => {
     console.log(`${node.id}: ${node.getRoutingRevenue()} msats`)
   })
   ```

3. Check accounting invariant:
   ```typescript
   const totalInitiated = 100 * eventCount
   const totalDelivered = 50 * eventCount
   const totalFees = 50 * eventCount
   expect(totalInitiated).toBe(totalDelivered + totalFees)
   ```

**Solution:**
- Use atomic operations for revenue counters
- Ensure single writer per counter (no concurrent updates)
- Verify conservation: `Σ(payments) = Σ(deliveries) + Σ(fees)`

---

### Issue 4: Insufficient Payment Not Rejected

**Symptom:**
- Underpayment accepted instead of rejected
- Node forwards payment despite insufficient funds

**Possible Causes:**
1. Next-hop cost calculation incorrect
2. Fee deduction logic wrong
3. Missing validation check

**Debugging Steps:**
1. Log required amount at each hop:
   ```typescript
   console.log(`Hop ${nodeId}: need=${nextHopCost + fee}, have=${amount}`)
   ```

2. Verify path cost calculation:
   ```typescript
   const pathCost = calculatePathCost(currentNode, destination)
   const requiredAmount = pathCost + currentNodeFee

   if (amountReceived < requiredAmount) {
     return rejectPayment('Insufficient payment')
   }
   ```

3. Check fee deduction before forwarding:
   ```typescript
   const amountToForward = amountReceived - fee
   if (amountToForward < nextHopCost) {
     return rejectPayment('Insufficient funds for next hop')
   }
   ```

**Solution:**
- Add validation before forwarding payment
- Calculate path cost correctly (sum of all downstream fees)
- Reject if `amountReceived < pathCost + currentNodeFee`

---

### Issue 5: Fulfillment Propagation Slow

**Symptom:**
- Fulfillment takes > 1 second (p95 target)
- Slow propagation back to sender

**Possible Causes:**
1. Network delays simulated too high
2. Callback mechanism not wired correctly
3. Synchronous processing blocking propagation

**Debugging Steps:**
1. Add timing markers at each hop:
   ```typescript
   performance.mark(`fulfillment_${nodeId}`)
   ```

2. Measure propagation time:
   ```typescript
   const startTime = performance.now()
   // ... fulfillment propagates ...
   const endTime = performance.now()
   console.log(`Propagation time: ${endTime - startTime}ms`)
   ```

3. Verify reverse path:
   ```typescript
   // Frank → Eve → Dave → Carol → Bob → Alice
   console.log(`Fulfillment path: ${fulfillmentPath.join(' → ')}`)
   ```

**Solution:**
- Use asynchronous propagation (don't block)
- Reduce network simulation latency for testing
- Verify callback chain is correct (reverse of payment path)

---

### Issue 6: Concurrent Payments Cause Race Conditions

**Symptom:**
- Revenue counters incorrect under load
- Lost updates (concurrent writes)
- Inconsistent state across nodes

**Possible Causes:**
1. Non-atomic operations on shared state
2. Missing mutex locks around critical sections
3. Race condition in payment processing

**Debugging Steps:**
1. Run test with concurrency=1 to verify logic:
   ```typescript
   for (let i = 0; i < 100; i++) {
     await processPayment(i)  // Sequential
   }
   ```

2. Add mutex locks around revenue updates:
   ```typescript
   async recordRevenue(fee: number) {
     await this.mutex.lock()
     try {
       this.revenue += fee
     } finally {
       this.mutex.unlock()
     }
   }
   ```

3. Use atomic operations:
   ```typescript
   // Bad: Non-atomic
   node.revenue += fee

   // Good: Atomic
   Atomics.add(node.revenueBuffer, 0, fee)
   ```

**Solution:**
- Use atomic operations for all counters
- Add mutex locks around critical sections
- Verify correctness with single-threaded test first, then scale to concurrent

---

## Summary

This guide provides comprehensive documentation for the economic flow verification test suite:

1. **Payment Flow Diagrams:** Visual representation of payment flows, fulfillment propagation, rejections, variable fees, multi-path routing, and timeouts.

2. **Fee Calculation Formulas:** Mathematical formulas for calculating fees, revenue, and verifying accounting invariants.

3. **Economic Model:** Explanation of payment channel lifecycle, revenue model, economic incentives, attack resistance, and performance targets.

4. **Troubleshooting:** Detailed debugging steps for common issues including fee accounting failures, timeouts, revenue sum errors, validation failures, slow fulfillment, and race conditions.

**Key Invariants:**
- `total_initiated = total_delivered + total_fees` (conservation of value)
- `amountForwarded = amountReceived - feeDeducted` (fee deduction)
- `100% fee accounting accuracy` (zero tolerance for drift)

**Performance Targets:**
- 5-hop payment: < 200ms (p95)
- 10-hop payment: < 500ms (p95)
- 100 concurrent payments: < 10 seconds
- Fulfillment propagation: < 1000ms (p95)

For more details, see:
- **Test Suite:** `packages/app-nostream/test/btp-nips/integration/economic-flow.spec.ts`
- **Story:** `docs/stories/11.3.story.md`
- **Epic:** `docs/prd/epic-11-btp-nips-n-peer-verification.md`
