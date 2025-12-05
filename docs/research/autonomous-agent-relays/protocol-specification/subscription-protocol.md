# BTP-NIPs Subscription Protocol

**Version:** 1.0.0
**Status:** Draft
**Date:** 2025-12-05

---

## Table of Contents

1. [Overview](#overview)
2. [Subscription Lifecycle](#subscription-lifecycle)
3. [REQ (Subscription Request)](#req-subscription-request)
4. [Filter Propagation](#filter-propagation)
5. [Event Delivery](#event-delivery)
6. [EOSE (End of Stored Events)](#eose-end-of-stored-events)
7. [CLOSE (Subscription Termination)](#close-subscription-termination)
8. [Subscription Management](#subscription-management)
9. [Payment Models](#payment-models)
10. [State Synchronization](#state-synchronization)
11. [Performance Optimization](#performance-optimization)
12. [Error Handling](#error-handling)
13. [Examples](#examples)

---

## Overview

### Purpose

The BTP-NIPs subscription protocol enables clients to request and receive Nostr events from relays over ILP, with integrated micropayment support. This document specifies:

1. How subscriptions are created, managed, and terminated
2. Event delivery guarantees and ordering
3. Payment semantics for subscriptions
4. Multi-relay subscription handling

### Design Principles

1. **Stateful:** Relays maintain subscription state until explicitly closed
2. **Payment-Aware:** Subscriptions can be free, one-time paid, or streaming paid
3. **Efficient:** Minimize redundant event delivery
4. **Compatible:** Maps cleanly to Nostr NIP-01 REQ/CLOSE semantics

### Subscription Flow Overview

```
Client                    Relay                     Database
  │                         │                          │
  ├─ REQ (+ payment) ──────>│                          │
  │                         ├─ Store subscription      │
  │                         ├─ Query events ──────────>│
  │                         │<─ Stored events ─────────┤
  │<─ EVENT (1) ────────────┤                          │
  │<─ EVENT (2) ────────────┤                          │
  │<─ EOSE ─────────────────┤                          │
  │                         │                          │
  │                    [New event arrives]             │
  │<─ EVENT (3) ────────────┤                          │
  │                         │                          │
  ├─ CLOSE ───────────────>│                          │
  │                         ├─ Delete subscription     │
  │<─ CLOSED ───────────────┤                          │
```

---

## Subscription Lifecycle

### 1. Creation (REQ)

**Client sends:**
- REQ message with filters
- Payment (if required)
- Subscription ID (client-generated, unique per connection)

**Relay responds:**
- Stores subscription state
- Queries database for matching events
- Sends stored events
- Sends EOSE
- Continues monitoring for new events

### 2. Active State

**During active subscription:**
- Relay monitors for new events matching filters
- Sends events to client as they arrive
- May require ongoing payments (streaming model)
- Subscription remains active until:
  - Client sends CLOSE
  - TTL expires
  - Relay closes subscription (CLOSED message)

### 3. Termination (CLOSE)

**Client sends:**
- CLOSE message with subscription ID

**Relay responds:**
- Stops monitoring for events
- Deletes subscription state
- Sends CLOSED confirmation (optional)

### 4. Expiration

**TTL-Based Expiration:**
```typescript
interface SubscriptionMetadata {
  ttl?: number;  // Seconds until expiration
  expiresAt?: number;  // Unix timestamp
}
```

**Relay behavior when TTL expires:**
1. Stops monitoring for events
2. Deletes subscription state
3. Sends CLOSED message to client

---

## REQ (Subscription Request)

### Message Structure

```typescript
interface ReqMessage {
  type: 'REQ';
  subscriptionId: string;
  filters: NostrFilter[];
}

interface BTPNIPsReqPacket {
  version: 1;
  messageType: NostrMessageType.REQ;
  payment: PaymentMetadata;
  nostr: ReqMessage;
  metadata: {
    timestamp: number;
    ttl?: number;  // Subscription duration (seconds)
    priority?: number;  // Delivery priority
  };
}
```

### NostrFilter Definition

```typescript
interface NostrFilter {
  ids?: string[];           // Event IDs
  authors?: string[];       // Pubkey hex strings
  kinds?: number[];         // Event kinds
  since?: number;           // Unix timestamp (inclusive)
  until?: number;           // Unix timestamp (inclusive)
  limit?: number;           // Max events to return
  [key: `#${string}`]: string[];  // Tag filters (e.g., "#e", "#p")
}
```

### Example REQ Packet

```typescript
const reqPacket: BTPNIPsEnvelope = {
  version: 1,
  messageType: NostrMessageType.REQ,
  payment: {
    amount: "5000",  // 5000 msats for 1 hour
    currency: "msat",
    purpose: PaymentPurpose.SUBSCRIPTION
  },
  nostr: {
    type: "REQ",
    subscriptionId: "client-sub-001",
    filters: [
      {
        kinds: [1],
        authors: ["pubkey1", "pubkey2"],
        since: Math.floor(Date.now() / 1000) - 86400,  // Last 24 hours
        limit: 100
      },
      {
        kinds: [30023],
        "#d": ["article-slug-1", "article-slug-2"]
      }
    ]
  },
  metadata: {
    timestamp: Math.floor(Date.now() / 1000),
    ttl: 3600,  // 1 hour subscription
    priority: 128
  }
};
```

### Relay Processing Algorithm

```typescript
async function handleReqPacket(
  packet: BTPNIPsEnvelope,
  ilpPrepare: ILPPrepare
): Promise<ILPFulfill> {

  const { subscriptionId, filters } = packet.nostr as ReqMessage;

  // 1. Validate payment
  const requiredFee = calculateSubscriptionFee(filters, packet.metadata.ttl);
  if (BigInt(packet.payment.amount) < requiredFee) {
    throw new Error('Insufficient payment');
  }

  // 2. Store subscription state
  const subscription: Subscription = {
    id: subscriptionId,
    filters,
    createdAt: Date.now(),
    expiresAt: packet.metadata.ttl
      ? Date.now() + packet.metadata.ttl * 1000
      : null,
    clientAddress: ilpPrepare.source,  // ILP address of client
    paymentModel: determinePaymentModel(packet.payment)
  };

  await subscriptionRepo.save(subscription);

  // 3. Query stored events
  const storedEvents = await eventRepo.findByFilters(filters);

  // 4. Send stored events (asynchronously)
  sendStoredEvents(subscription, storedEvents);

  // 5. Send EOSE
  sendEOSE(subscription);

  // 6. Return ILP Fulfill (subscription created)
  const preimage = generateFulfillment(subscriptionId);

  return {
    fulfillment: preimage,
    data: {
      subscriptionId,
      eventCount: storedEvents.length,
      expiresAt: subscription.expiresAt
    }
  };
}
```

---

## Filter Propagation

### Multi-Relay Subscription

When a relay receives a subscription request, it may need to forward the subscription to peer relays or upstream agents:

```
Client → Relay A → Relay B → Relay C
```

**Use Case:** Client subscribes to events from multiple sources through a single relay.

### Filter Forwarding

```typescript
async function propagateSubscription(
  subscription: Subscription,
  peerRelays: string[]
) {

  for (const peerAddress of peerRelays) {
    // Create REQ packet for peer
    const peerReq: BTPNIPsEnvelope = {
      version: 1,
      messageType: NostrMessageType.REQ,
      payment: {
        amount: "1000",  // Payment to peer
        currency: "msat",
        purpose: PaymentPurpose.SUBSCRIPTION
      },
      nostr: {
        type: "REQ",
        subscriptionId: `${subscription.id}-peer-${peerAddress}`,
        filters: subscription.filters
      },
      metadata: {
        timestamp: Math.floor(Date.now() / 1000),
        ttl: subscription.expiresAt
          ? Math.floor((subscription.expiresAt - Date.now()) / 1000)
          : undefined
      }
    };

    // Forward to peer via ILP
    await sendILPPacket(peerAddress, peerReq, "1000");
  }
}
```

### Filter Optimization

**Relay may optimize filters before forwarding:**

```typescript
function optimizeFilters(filters: NostrFilter[]): NostrFilter[] {
  // 1. Merge overlapping author lists
  const allAuthors = new Set<string>();
  const allKinds = new Set<number>();

  for (const filter of filters) {
    if (filter.authors) {
      filter.authors.forEach(a => allAuthors.add(a));
    }
    if (filter.kinds) {
      filter.kinds.forEach(k => allKinds.add(k));
    }
  }

  // 2. Create optimized filter
  if (allAuthors.size > 0 && allKinds.size > 0) {
    return [{
      authors: Array.from(allAuthors),
      kinds: Array.from(allKinds)
    }];
  }

  return filters;
}
```

---

## Event Delivery

### Delivery Guarantees

**BTP-NIPs provides:**
1. **At-Least-Once Delivery:** Events may be delivered multiple times (client de-duplicates)
2. **Order Preservation:** Events from a single relay arrive in chronological order
3. **Best-Effort Latency:** Events delivered as soon as received

**BTP-NIPs does NOT guarantee:**
1. Exactly-once delivery (client must de-duplicate by event ID)
2. Global ordering across multiple relays
3. Real-time delivery (use WebSocket for low-latency)

### Event Message Format

```typescript
interface EventMessage {
  type: 'EVENT';
  subscriptionId: string;
  event: NostrEvent;
}

interface BTPNIPsEventPacket {
  version: 1;
  messageType: NostrMessageType.EVENT;
  payment: PaymentMetadata;
  nostr: EventMessage;
  metadata: {
    timestamp: number;
    relaySignature?: string;
  };
}
```

### Sending Events to Client

```typescript
async function sendEventToSubscriber(
  subscription: Subscription,
  event: NostrEvent
) {

  // 1. Check if event matches filters
  if (!matchesFilters(event, subscription.filters)) {
    return;
  }

  // 2. Check if already sent (de-duplication)
  if (await wasSentToSubscription(subscription.id, event.id)) {
    return;
  }

  // 3. Determine payment
  const payment = subscription.paymentModel === 'streaming'
    ? { amount: "10", purpose: PaymentPurpose.EVENT_PUBLISH }
    : { amount: "0", purpose: PaymentPurpose.RELAY_FEE };

  // 4. Create EVENT packet
  const eventPacket: BTPNIPsEnvelope = {
    version: 1,
    messageType: NostrMessageType.EVENT,
    payment,
    nostr: {
      type: "EVENT",
      subscriptionId: subscription.id,
      event
    },
    metadata: {
      timestamp: Math.floor(Date.now() / 1000),
      relaySignature: signEvent(event.id)
    }
  };

  // 5. Send via ILP
  await sendILPPacket(
    subscription.clientAddress,
    eventPacket,
    payment.amount
  );

  // 6. Mark as sent
  await markAsSent(subscription.id, event.id);
}
```

### Batch Event Delivery

For efficiency, relays can send multiple events in quick succession:

```typescript
async function sendStoredEvents(
  subscription: Subscription,
  events: NostrEvent[]
) {

  // Send events in batches of 10
  for (let i = 0; i < events.length; i += 10) {
    const batch = events.slice(i, i + 10);

    await Promise.all(
      batch.map(event => sendEventToSubscriber(subscription, event))
    );

    // Rate limiting: wait 100ms between batches
    await sleep(100);
  }
}
```

---

## EOSE (End of Stored Events)

### Purpose

EOSE signals that the relay has finished sending all stored events matching the subscription filters. After EOSE, only new events will be sent.

### EOSE Message Format

```typescript
interface EoseMessage {
  type: 'EOSE';
  subscriptionId: string;
}

interface BTPNIPsEosePacket {
  version: 1;
  messageType: NostrMessageType.EOSE;
  payment: {
    amount: "0",  // EOSE is always free
    currency: "msat",
    purpose: PaymentPurpose.RELAY_FEE
  };
  nostr: EoseMessage;
  metadata: {
    timestamp: number;
    eventCount?: number;  // Total stored events sent
  };
}
```

### Sending EOSE

```typescript
async function sendEOSE(subscription: Subscription) {
  const eosePacket: BTPNIPsEnvelope = {
    version: 1,
    messageType: NostrMessageType.EOSE,
    payment: {
      amount: "0",
      currency: "msat",
      purpose: PaymentPurpose.RELAY_FEE
    },
    nostr: {
      type: "EOSE",
      subscriptionId: subscription.id
    },
    metadata: {
      timestamp: Math.floor(Date.now() / 1000),
      eventCount: await getEventCount(subscription.id)
    }
  };

  await sendILPPacket(
    subscription.clientAddress,
    eosePacket,
    "0"  // Free
  );
}
```

### Client Handling

```typescript
class SubscriptionManager {
  private subscriptions: Map<string, SubscriptionState> = new Map();

  async handleEOSE(message: EoseMessage) {
    const sub = this.subscriptions.get(message.subscriptionId);

    if (!sub) {
      console.error('Unknown subscription:', message.subscriptionId);
      return;
    }

    // Mark as fully loaded
    sub.status = 'active';
    sub.storedEventsLoaded = true;

    // Notify application
    this.emit('eose', message.subscriptionId);
  }
}
```

---

## CLOSE (Subscription Termination)

### Client-Initiated Close

**Message Format:**
```typescript
interface CloseMessage {
  type: 'CLOSE';
  subscriptionId: string;
}

interface BTPNIPsClosePacket {
  version: 1;
  messageType: NostrMessageType.CLOSE;
  payment: {
    amount: "0",  // CLOSE is free
    currency: "msat",
    purpose: PaymentPurpose.RELAY_FEE
  };
  nostr: CloseMessage;
  metadata: {
    timestamp: number;
  };
}
```

**Relay Processing:**
```typescript
async function handleClosePacket(packet: BTPNIPsEnvelope): Promise<ILPFulfill> {
  const { subscriptionId } = packet.nostr as CloseMessage;

  // 1. Delete subscription state
  await subscriptionRepo.delete(subscriptionId);

  // 2. Clean up sent events cache
  await deleteSentEventsCache(subscriptionId);

  // 3. Send CLOSED confirmation
  await sendClosedConfirmation(subscriptionId);

  // 4. Return ILP Fulfill
  const preimage = generateFulfillment(subscriptionId);

  return {
    fulfillment: preimage,
    data: {
      subscriptionId,
      closed: true
    }
  };
}
```

### Relay-Initiated Close

**Use Cases:**
1. Subscription TTL expired
2. Client violated payment terms
3. Relay shutting down
4. Subscription limit exceeded

**CLOSED Message Format:**
```typescript
interface ClosedMessage {
  type: 'CLOSED';
  subscriptionId: string;
  reason: string;
}

interface BTPNIPsClosedPacket {
  version: 1;
  messageType: NostrMessageType.CLOSED;
  payment: {
    amount: "0",
    currency: "msat",
    purpose: PaymentPurpose.RELAY_FEE
  };
  nostr: ClosedMessage;
  metadata: {
    timestamp: number;
  };
}
```

**Example:**
```typescript
async function sendClosedConfirmation(
  subscriptionId: string,
  reason: string,
  clientAddress: string
) {
  const closedPacket: BTPNIPsEnvelope = {
    version: 1,
    messageType: NostrMessageType.CLOSED,
    payment: {
      amount: "0",
      currency: "msat",
      purpose: PaymentPurpose.RELAY_FEE
    },
    nostr: {
      type: "CLOSED",
      subscriptionId,
      reason
    },
    metadata: {
      timestamp: Math.floor(Date.now() / 1000)
    }
  };

  await sendILPPacket(clientAddress, closedPacket, "0");
}
```

---

## Subscription Management

### Subscription State Schema

```typescript
interface Subscription {
  id: string;                     // Client-provided subscription ID
  filters: NostrFilter[];
  createdAt: number;              // Timestamp (ms)
  expiresAt: number | null;       // Expiration timestamp (ms)
  clientAddress: string;          // ILP address of client
  paymentModel: PaymentModel;
  status: SubscriptionStatus;
  eventsSent: number;             // Total events sent
  lastEventAt: number | null;     // Last event delivery timestamp
}

enum SubscriptionStatus {
  PENDING = 'pending',     // REQ received, loading stored events
  ACTIVE = 'active',       // EOSE sent, monitoring for new events
  EXPIRED = 'expired',     // TTL expired
  CLOSED = 'closed'        // CLOSE received or sent
}

enum PaymentModel {
  FREE = 'free',                   // No payment required
  ONE_TIME = 'one_time',           // One-time payment for subscription
  STREAMING = 'streaming',         // Pay per event delivered
  HYBRID = 'hybrid'                // One-time + per-event fees
}
```

### Database Schema

**PostgreSQL:**
```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  filters JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT,
  client_address TEXT NOT NULL,
  payment_model TEXT NOT NULL,
  status TEXT NOT NULL,
  events_sent INTEGER DEFAULT 0,
  last_event_at BIGINT,
  INDEX idx_expires_at (expires_at),
  INDEX idx_status (status),
  INDEX idx_client_address (client_address)
);

-- Track sent events per subscription (for de-duplication)
CREATE TABLE subscription_events (
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  sent_at BIGINT NOT NULL,
  PRIMARY KEY (subscription_id, event_id),
  INDEX idx_sent_at (sent_at)
);
```

### Expiration Cleanup Job

```typescript
class SubscriptionCleanupService {
  async cleanupExpiredSubscriptions() {
    const now = Date.now();

    // Find expired subscriptions
    const expired = await subscriptionRepo.findExpired(now);

    for (const subscription of expired) {
      // Send CLOSED message
      await sendClosedConfirmation(
        subscription.id,
        'Subscription TTL expired',
        subscription.clientAddress
      );

      // Delete subscription
      await subscriptionRepo.delete(subscription.id);
    }

    console.log(`Cleaned up ${expired.length} expired subscriptions`);
  }

  // Run every 60 seconds
  start() {
    setInterval(() => this.cleanupExpiredSubscriptions(), 60000);
  }
}
```

---

## Payment Models

### Model 1: Free Subscription

**Use Case:** Public relay, community support

```typescript
const freeSubscription = {
  payment: {
    amount: "0",
    purpose: PaymentPurpose.SUBSCRIPTION
  },
  paymentModel: PaymentModel.FREE
};
```

**Event Delivery:** All events are free.

### Model 2: One-Time Payment

**Use Case:** Pay once for N events or T duration

```typescript
const oneTimeSubscription = {
  payment: {
    amount: "5000",  // 5000 msats for 1 hour
    purpose: PaymentPurpose.SUBSCRIPTION
  },
  metadata: {
    ttl: 3600  // 1 hour
  },
  paymentModel: PaymentModel.ONE_TIME
};
```

**Event Delivery:** All events within TTL are free (included in subscription).

**Fee Calculation:**
```typescript
function calculateOneTimeFee(
  filters: NostrFilter[],
  ttl: number
): bigint {
  const baseFee = 1000n; // 1000 msats base
  const durationFee = BigInt(ttl) / 60n; // 1 msat per minute

  // Complexity multiplier based on filters
  const complexity = calculateFilterComplexity(filters);
  const complexityFee = BigInt(complexity) * 100n;

  return baseFee + durationFee + complexityFee;
}

function calculateFilterComplexity(filters: NostrFilter[]): number {
  let complexity = 0;

  for (const filter of filters) {
    if (filter.authors) complexity += filter.authors.length;
    if (filter.kinds) complexity += filter.kinds.length;
    if (filter.limit) complexity += Math.min(filter.limit, 100);
  }

  return complexity;
}
```

### Model 3: Streaming Payment (Pay-Per-Event)

**Use Case:** High-volume subscriptions, usage-based pricing

```typescript
const streamingSubscription = {
  payment: {
    amount: "1000",  // Initial payment (setup fee)
    purpose: PaymentPurpose.SUBSCRIPTION
  },
  paymentModel: PaymentModel.STREAMING
};
```

**Event Delivery:** Each event requires a micro-payment (e.g., 10 msats).

**Implementation:**
```typescript
async function sendEventWithPayment(
  subscription: Subscription,
  event: NostrEvent
) {
  const eventFee = "10"; // 10 msats per event

  // Create ILP Prepare for event delivery
  const eventPacket: BTPNIPsEnvelope = {
    version: 1,
    messageType: NostrMessageType.EVENT,
    payment: {
      amount: eventFee,
      currency: "msat",
      purpose: PaymentPurpose.EVENT_PUBLISH
    },
    nostr: {
      type: "EVENT",
      subscriptionId: subscription.id,
      event
    },
    metadata: {
      timestamp: Math.floor(Date.now() / 1000)
    }
  };

  // Client must pay to receive event
  await sendILPPacket(
    subscription.clientAddress,
    eventPacket,
    eventFee
  );
}
```

**Client Handling:**
```typescript
class StreamingSubscriptionManager {
  async handleEventWithPayment(packet: BTPNIPsEnvelope, ilpPrepare: ILPPrepare) {
    // 1. Verify payment amount
    const expectedFee = "10"; // 10 msats
    if (ilpPrepare.amount !== expectedFee) {
      throw new Error('Unexpected payment amount');
    }

    // 2. Pay for event
    const fulfillment = await this.ilpClient.fulfill(ilpPrepare);

    // 3. Process event
    const { event } = packet.nostr as EventMessage;
    this.emit('event', event);

    return fulfillment;
  }
}
```

### Model 4: Hybrid (One-Time + Per-Event)

**Use Case:** Premium subscriptions with base fee + usage

```typescript
const hybridSubscription = {
  payment: {
    amount: "10000",  // 10,000 msats base fee
    purpose: PaymentPurpose.SUBSCRIPTION,
    feeSchedule: {
      baseRelayFee: "10000",
      eventFee: "5"  // 5 msats per event
    }
  },
  paymentModel: PaymentModel.HYBRID
};
```

---

## State Synchronization

### Multi-Relay Subscriptions

**Challenge:** Client subscribes to multiple relays, receives duplicate events.

**Solution:** Client-side de-duplication by event ID.

```typescript
class MultiRelaySubscriptionManager {
  private seenEvents: Set<string> = new Set();

  handleEvent(event: NostrEvent) {
    // De-duplicate by event ID
    if (this.seenEvents.has(event.id)) {
      return; // Already received from another relay
    }

    this.seenEvents.add(event.id);

    // Process unique event
    this.emit('event', event);
  }
}
```

### Subscription Migration

**Use Case:** Client reconnects to different relay, wants to resume subscription.

**Approach 1: Store Cursor**

Client tracks last received event timestamp:

```typescript
const resumeReq: BTPNIPsEnvelope = {
  version: 1,
  messageType: NostrMessageType.REQ,
  payment: { amount: "5000", currency: "msat", purpose: PaymentPurpose.SUBSCRIPTION },
  nostr: {
    type: "REQ",
    subscriptionId: "resumed-sub-001",
    filters: [
      {
        kinds: [1],
        authors: ["pubkey1"],
        since: lastReceivedTimestamp  // Resume from here
      }
    ]
  },
  metadata: { timestamp: Date.now(), ttl: 3600 }
};
```

**Approach 2: Subscription Token**

Relay issues resumption token:

```typescript
// Relay provides token in EOSE
{
  metadata: {
    resumptionToken: "eyJzdWJJZCI6ImFiYyIsImxhc3RFdmVudCI6MTIzNH0="
  }
}

// Client uses token to resume
{
  nostr: {
    type: "REQ",
    subscriptionId: "new-id",
    filters: [...],
    resumptionToken: "eyJzdWJJZCI6ImFiYyIsImxhc3RFdmVudCI6MTIzNH0="
  }
}
```

---

## Performance Optimization

### 1. Filter Indexing

**Database Indexes:**
```sql
-- Author-based queries
CREATE INDEX idx_events_author ON events(pubkey);

-- Kind-based queries
CREATE INDEX idx_events_kind ON events(kind);

-- Tag-based queries (PostgreSQL JSONB)
CREATE INDEX idx_events_tags ON events USING GIN (tags);

-- Time-range queries
CREATE INDEX idx_events_created_at ON events(created_at);

-- Composite indexes for common filter combinations
CREATE INDEX idx_events_author_kind ON events(pubkey, kind);
CREATE INDEX idx_events_kind_created_at ON events(kind, created_at);
```

### 2. Event Caching

**Cache Recent Events in Redis:**
```typescript
class EventCache {
  private redis: RedisClient;

  async cacheEvent(event: NostrEvent) {
    const key = `event:${event.id}`;
    await this.redis.setex(key, 3600, JSON.stringify(event)); // 1 hour TTL
  }

  async getEvent(eventId: string): Promise<NostrEvent | null> {
    const key = `event:${eventId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // Cache events by filter
  async cacheFilterResults(filterHash: string, events: NostrEvent[]) {
    const key = `filter:${filterHash}`;
    await this.redis.setex(
      key,
      300, // 5 minutes
      JSON.stringify(events.map(e => e.id))
    );
  }
}
```

### 3. Subscription Batching

**Batch Subscriptions with Similar Filters:**
```typescript
class SubscriptionBatcher {
  private batches: Map<string, Subscription[]> = new Map();

  addSubscription(subscription: Subscription) {
    const filterHash = hashFilters(subscription.filters);

    if (!this.batches.has(filterHash)) {
      this.batches.set(filterHash, []);
    }

    this.batches.get(filterHash)!.push(subscription);
  }

  async processNewEvent(event: NostrEvent) {
    // Check each batch
    for (const [filterHash, subscriptions] of this.batches) {
      const filters = subscriptions[0].filters; // All have same filters

      if (matchesFilters(event, filters)) {
        // Send event to all subscriptions in batch
        await Promise.all(
          subscriptions.map(sub => sendEventToSubscriber(sub, event))
        );
      }
    }
  }
}
```

### 4. Rate Limiting

**Per-Client Subscription Limits:**
```typescript
class SubscriptionRateLimiter {
  private clientSubscriptions: Map<string, number> = new Map();

  async checkLimit(clientAddress: string): Promise<boolean> {
    const current = this.clientSubscriptions.get(clientAddress) || 0;
    const limit = 10; // Max 10 concurrent subscriptions per client

    if (current >= limit) {
      return false;
    }

    this.clientSubscriptions.set(clientAddress, current + 1);
    return true;
  }

  async releaseSubscription(clientAddress: string) {
    const current = this.clientSubscriptions.get(clientAddress) || 0;
    this.clientSubscriptions.set(clientAddress, Math.max(0, current - 1));
  }
}
```

---

## Error Handling

### Error Types

```typescript
enum SubscriptionError {
  PAYMENT_INSUFFICIENT = 'payment_insufficient',
  FILTER_INVALID = 'filter_invalid',
  LIMIT_EXCEEDED = 'limit_exceeded',
  SUBSCRIPTION_NOT_FOUND = 'subscription_not_found',
  EXPIRED = 'expired',
  RELAY_ERROR = 'relay_error'
}
```

### Error Response (NOTICE)

```typescript
async function sendErrorNotice(
  clientAddress: string,
  error: SubscriptionError,
  message: string
) {
  const noticePacket: BTPNIPsEnvelope = {
    version: 1,
    messageType: NostrMessageType.NOTICE,
    payment: {
      amount: "0",
      currency: "msat",
      purpose: PaymentPurpose.RELAY_FEE
    },
    nostr: {
      type: "NOTICE",
      message: `[${error}] ${message}`
    },
    metadata: {
      timestamp: Math.floor(Date.now() / 1000)
    }
  };

  await sendILPPacket(clientAddress, noticePacket, "0");
}
```

### Client Error Handling

```typescript
class SubscriptionClient {
  async handleNotice(notice: NoticeMessage) {
    const match = notice.message.match(/^\[(\w+)\] (.+)$/);

    if (match) {
      const [, errorType, errorMessage] = match;

      switch (errorType) {
        case SubscriptionError.PAYMENT_INSUFFICIENT:
          console.error('Subscription payment insufficient:', errorMessage);
          this.emit('payment_error', errorMessage);
          break;

        case SubscriptionError.EXPIRED:
          console.log('Subscription expired:', errorMessage);
          this.emit('expired', errorMessage);
          break;

        default:
          console.error('Subscription error:', errorMessage);
      }
    }
  }
}
```

---

## Examples

### Example 1: Simple Text Note Subscription

**Client:**
```typescript
import { BTPNIPsClient } from './client';

const client = new BTPNIPsClient('g.btp-nips.alice-relay');

// Subscribe to text notes from specific authors
const subscription = await client.subscribe({
  filters: [
    {
      kinds: [1],
      authors: ['pubkey1', 'pubkey2'],
      since: Math.floor(Date.now() / 1000) - 3600 // Last hour
    }
  ],
  payment: {
    amount: '5000', // 5000 msats
    ttl: 3600 // 1 hour
  }
});

// Handle events
subscription.on('event', (event) => {
  console.log('Received event:', event.content);
});

// Handle EOSE
subscription.on('eose', () => {
  console.log('Stored events loaded');
});

// Close subscription after 30 minutes
setTimeout(() => {
  subscription.close();
}, 1800000);
```

### Example 2: Long-Form Article Subscription

**Client:**
```typescript
const articleSub = await client.subscribe({
  filters: [
    {
      kinds: [30023],
      '#d': ['tech-news', 'bitcoin'],
      limit: 50
    }
  ],
  payment: {
    amount: '10000', // Higher fee for larger content
    ttl: 86400 // 24 hours
  }
});

articleSub.on('event', async (event) => {
  // Check for Arweave reference
  const arweaveTag = event.tags.find(t => t[0] === 'arweave');

  if (arweaveTag) {
    const txId = arweaveTag[1];
    const content = await fetchFromArweave(txId);
    console.log('Article content:', content);
  } else {
    console.log('Inline content:', event.content);
  }
});
```

### Example 3: Streaming Payment Subscription

**Client:**
```typescript
const streamingSub = await client.subscribe({
  filters: [
    {
      kinds: [1],
      authors: ['premium-author-pubkey']
    }
  ],
  payment: {
    amount: '1000', // Setup fee
    model: PaymentModel.STREAMING // Pay per event
  }
});

streamingSub.on('payment_request', (amount) => {
  console.log(`Pay ${amount} msats to receive next event`);
});

streamingSub.on('event', (event) => {
  console.log('Received premium event:', event.content);
});
```

### Example 4: Multi-Relay Subscription with De-duplication

**Client:**
```typescript
const relays = [
  'g.btp-nips.relay1',
  'g.btp-nips.relay2',
  'g.btp-nips.relay3'
];

const seenEvents = new Set<string>();

for (const relay of relays) {
  const client = new BTPNIPsClient(relay);

  const sub = await client.subscribe({
    filters: [{ kinds: [1], limit: 100 }],
    payment: { amount: '2000', ttl: 3600 }
  });

  sub.on('event', (event) => {
    // De-duplicate
    if (seenEvents.has(event.id)) {
      return;
    }

    seenEvents.add(event.id);
    console.log('Unique event:', event.id);
  });
}
```

### Example 5: Relay Implementation

**Relay:**
```typescript
import { BTPNIPsRelay } from './relay';

const relay = new BTPNIPsRelay({
  ilpAddress: 'g.btp-nips.my-relay',
  database: postgresConfig,
  cache: redisConfig
});

// Configure payment model
relay.configurePayment({
  model: PaymentModel.ONE_TIME,
  baseFee: '1000', // 1000 msats base
  durationFee: '10' // 10 msats per minute
});

// Handle new event publication
relay.on('event_published', async (event) => {
  // Find matching subscriptions
  const subscriptions = await relay.findMatchingSubscriptions(event);

  // Send to subscribers
  for (const subscription of subscriptions) {
    await relay.sendEventToSubscriber(subscription, event);
  }
});

// Start relay
relay.listen();
console.log('BTP-NIPs relay running at g.btp-nips.my-relay');
```

---

## Appendix

### A. Subscription Lifecycle State Machine

```
┌─────────┐
│ PENDING │ (REQ received)
└────┬────┘
     │
     ├─ Load stored events
     ├─ Send stored events
     │
     ▼
┌─────────┐
│ ACTIVE  │ (EOSE sent)
└────┬────┘
     │
     ├─ Monitor for new events
     ├─ Send new events as they arrive
     │
     ├─ TTL expires ──────────────┐
     ├─ CLOSE received ───────────┤
     ├─ Relay closes ─────────────┤
     │                            │
     ▼                            ▼
┌─────────┐                 ┌─────────┐
│ EXPIRED │                 │ CLOSED  │
└─────────┘                 └─────────┘
```

### B. Filter Matching Algorithm

```typescript
function matchesFilters(event: NostrEvent, filters: NostrFilter[]): boolean {
  // Event matches if it matches ANY filter
  return filters.some(filter => matchesSingleFilter(event, filter));
}

function matchesSingleFilter(event: NostrEvent, filter: NostrFilter): boolean {
  // 1. Check IDs
  if (filter.ids && !filter.ids.includes(event.id)) {
    return false;
  }

  // 2. Check authors
  if (filter.authors && !filter.authors.includes(event.pubkey)) {
    return false;
  }

  // 3. Check kinds
  if (filter.kinds && !filter.kinds.includes(event.kind)) {
    return false;
  }

  // 4. Check time range
  if (filter.since && event.created_at < filter.since) {
    return false;
  }

  if (filter.until && event.created_at > filter.until) {
    return false;
  }

  // 5. Check tag filters
  for (const [key, values] of Object.entries(filter)) {
    if (key.startsWith('#')) {
      const tagName = key.substring(1);
      const eventTagValues = event.tags
        .filter(t => t[0] === tagName)
        .map(t => t[1]);

      if (!values.some(v => eventTagValues.includes(v))) {
        return false;
      }
    }
  }

  return true;
}
```

### C. Performance Benchmarks

**Subscription Creation:**
```
Operation: Create subscription (1 filter)
Time: ~5 ms
Database queries: 1 (insert)

Operation: Load stored events (100 events)
Time: ~50 ms
Database queries: 1 (SELECT with filters)

Operation: Send EOSE
Time: ~1 ms
```

**Event Delivery:**
```
Operation: Match event against 10 subscriptions
Time: ~1 ms

Operation: Send event to subscriber (ILP)
Time: ~10 ms (network latency)

Throughput: ~100 events/second per relay
```

---

## References

1. [NIP-01: Basic Protocol](https://github.com/nostr-protocol/nips/blob/master/01.md)
2. [BTP-NIPs Protocol Specification](./btp-nips-protocol.md)
3. [ILP STREAM Protocol](https://interledger.org/rfcs/0029-stream/)

---

**End of Subscription Protocol Document**
