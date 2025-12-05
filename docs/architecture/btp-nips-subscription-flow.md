# BTP-NIPs Subscription Flow Architecture

## Overview

This document describes how Nostr subscriptions (REQ/CLOSE) work over ILP STREAM in the BTP-NIPs protocol.

---

## Key Concept: ILP STREAM is Bidirectional

Unlike HTTP request/response, ILP STREAM provides a **bidirectional communication channel** similar to WebSocket:

```
Client                           Relay
  │                               │
  ├─── Open STREAM connection ───>│
  │                               │
  ├─── REQ packet (+ payment) ───>│
  │                               │
  │<─── EVENT packet 1 ────────────┤
  │<─── EVENT packet 2 ────────────┤
  │<─── EVENT packet 3 ────────────┤
  │<─── EOSE packet ───────────────┤
  │                               │
  │     [New event arrives]       │
  │<─── EVENT packet 4 ────────────┤
  │                               │
  ├─── CLOSE packet ─────────────>│
  │<─── CLOSED packet ─────────────┤
  │                               │
  └─── Close STREAM connection ───┘
```

---

## Implementation: Subscription Manager

### Story 5.5: Subscription Manager

```typescript
// packages/app-dassie/src/btp-nips/subscription-manager.ts

import { createActor, createSignal } from '@dassie/lib-reactive';
import type { NostrFilter, NostrEvent } from './types';

interface Subscription {
  id: string;
  streamConnection: StreamConnection;
  filters: NostrFilter[];
  expiresAt: number;
  active: boolean;
}

export const createSubscriptionManager = (reactor: Reactor) => {
  // Track all active subscriptions
  const subscriptions = createSignal<Map<string, Subscription>>(new Map());

  return createActor(async (sig) => {
    // Listen for new events in storage
    const storageMonitor = await sig.run(createStorageMonitor);

    for await (const newEvent of storageMonitor.events) {
      // Check which subscriptions match this event
      const matchingSubs = findMatchingSubscriptions(
        subscriptions.read(),
        newEvent
      );

      // Send event to all matching subscriptions
      for (const sub of matchingSubs) {
        await sendEventPacket(sub.streamConnection, newEvent);
      }
    }
  });
};

function findMatchingSubscriptions(
  subs: Map<string, Subscription>,
  event: NostrEvent
): Subscription[] {
  const matching: Subscription[] = [];

  for (const [id, sub] of subs.entries()) {
    if (!sub.active) continue;
    if (Date.now() > sub.expiresAt) {
      // Subscription expired
      sub.active = false;
      sendClosedPacket(sub.streamConnection, id);
      continue;
    }

    // Check if event matches any filter
    for (const filter of sub.filters) {
      if (eventMatchesFilter(event, filter)) {
        matching.push(sub);
        break;
      }
    }
  }

  return matching;
}

function eventMatchesFilter(event: NostrEvent, filter: NostrFilter): boolean {
  // Check IDs
  if (filter.ids && !filter.ids.includes(event.id)) {
    return false;
  }

  // Check authors
  if (filter.authors && !filter.authors.includes(event.pubkey)) {
    return false;
  }

  // Check kinds
  if (filter.kinds && !filter.kinds.includes(event.kind)) {
    return false;
  }

  // Check timestamps
  if (filter.since && event.created_at < filter.since) {
    return false;
  }
  if (filter.until && event.created_at > filter.until) {
    return false;
  }

  // Check tag filters
  for (const [key, values] of Object.entries(filter)) {
    if (key.startsWith('#')) {
      const tagName = key.slice(1);
      const eventTags = event.tags.filter(t => t[0] === tagName).map(t => t[1]);
      if (!values.some(v => eventTags.includes(v))) {
        return false;
      }
    }
  }

  return true;
}

async function sendEventPacket(
  stream: StreamConnection,
  event: NostrEvent
): Promise<void> {
  const packet: BTPNIPsPacket = {
    version: 1,
    messageType: NostrMessageType.EVENT,
    payment: { amount: '0', currency: 'msat', purpose: 'event_delivery' },
    nostr: event,
    metadata: { timestamp: Math.floor(Date.now() / 1000) }
  };

  await stream.sendPacket(serializeBTPNIPsPacket(packet));
}
```

---

## REQ Handler (Story 5.3)

```typescript
// packages/app-dassie/src/btp-nips/handlers/req-handler.ts

export async function handleReqPacket(
  packet: BTPNIPsPacket,
  streamConnection: StreamConnection,
  subscriptionManager: SubscriptionManager,
  storage: NostrStorageLayer
): Promise<void> {
  const { subscriptionId, filters } = packet.nostr;
  const { ttl = 3600 } = packet.metadata; // Default 1 hour

  // 1. Validate payment
  const requiredAmount = calculateSubscriptionCost(ttl);
  if (parseInt(packet.payment.amount) < requiredAmount) {
    await streamConnection.rejectPacket('Insufficient payment');
    return;
  }

  // 2. Query stored events matching filters
  const storedEvents = await storage.queryEvents(filters);

  // 3. Send stored events
  for (const event of storedEvents) {
    await sendEventPacket(streamConnection, event);
  }

  // 4. Send EOSE (End of Stored Events)
  await sendEosePacket(streamConnection, subscriptionId);

  // 5. Register subscription for future events
  subscriptionManager.addSubscription({
    id: subscriptionId,
    streamConnection,
    filters,
    expiresAt: Date.now() + (ttl * 1000),
    active: true
  });

  // 6. Fulfill ILP packet (payment accepted)
  await streamConnection.fulfillPacket();
}

function calculateSubscriptionCost(ttl: number): number {
  const costPerHour = 5000; // 5000 msats per hour
  const hours = Math.ceil(ttl / 3600);
  return costPerHour * hours;
}
```

---

## CLOSE Handler

```typescript
// packages/app-dassie/src/btp-nips/handlers/close-handler.ts

export async function handleClosePacket(
  packet: BTPNIPsPacket,
  streamConnection: StreamConnection,
  subscriptionManager: SubscriptionManager
): Promise<void> {
  const { subscriptionId } = packet.nostr;

  // 1. Remove subscription
  subscriptionManager.removeSubscription(subscriptionId);

  // 2. Send CLOSED confirmation
  await sendClosedPacket(streamConnection, subscriptionId);

  // 3. Fulfill ILP packet (no payment required for CLOSE)
  await streamConnection.fulfillPacket();
}
```

---

## Performance Considerations

### Subscription Indexing

```typescript
// Optimize subscription matching with indexes

class SubscriptionIndex {
  private byAuthor: Map<string, Set<string>>;  // author → subscription IDs
  private byKind: Map<number, Set<string>>;    // kind → subscription IDs
  private byTag: Map<string, Set<string>>;     // tag → subscription IDs

  constructor() {
    this.byAuthor = new Map();
    this.byKind = new Map();
    this.byTag = new Map();
  }

  addSubscription(id: string, filters: NostrFilter[]): void {
    for (const filter of filters) {
      // Index by authors
      if (filter.authors) {
        for (const author of filter.authors) {
          if (!this.byAuthor.has(author)) {
            this.byAuthor.set(author, new Set());
          }
          this.byAuthor.get(author)!.add(id);
        }
      }

      // Index by kinds
      if (filter.kinds) {
        for (const kind of filter.kinds) {
          if (!this.byKind.has(kind)) {
            this.byKind.set(kind, new Set());
          }
          this.byKind.get(kind)!.add(id);
        }
      }

      // Index by tags
      for (const [key, values] of Object.entries(filter)) {
        if (key.startsWith('#')) {
          for (const value of values) {
            const indexKey = `${key}:${value}`;
            if (!this.byTag.has(indexKey)) {
              this.byTag.set(indexKey, new Set());
            }
            this.byTag.get(indexKey)!.add(id);
          }
        }
      }
    }
  }

  findCandidates(event: NostrEvent): Set<string> {
    const candidates = new Set<string>();

    // Find by author
    const authorSubs = this.byAuthor.get(event.pubkey);
    if (authorSubs) {
      authorSubs.forEach(id => candidates.add(id));
    }

    // Find by kind
    const kindSubs = this.byKind.get(event.kind);
    if (kindSubs) {
      kindSubs.forEach(id => candidates.add(id));
    }

    // Find by tags
    for (const [tagName, tagValue] of event.tags) {
      const indexKey = `#${tagName}:${tagValue}`;
      const tagSubs = this.byTag.get(indexKey);
      if (tagSubs) {
        tagSubs.forEach(id => candidates.add(id));
      }
    }

    return candidates;
  }
}
```

---

## Payment Models for Subscriptions

### 1. One-Time Payment (Default)

```
Client pays 5000 msats → Gets 1 hour subscription
After 1 hour → Subscription expires
```

### 2. Streaming Payment (Future)

```
Client opens payment stream → Pays 83 msats/minute
Every minute: Check balance → If insufficient, close subscription
```

### 3. Free Tier (Optional)

```
No payment required for:
- First N events per day
- Public events from whitelisted authors
- Low-priority subscriptions (delayed delivery)
```

---

## Error Handling

```typescript
enum SubscriptionError {
  INSUFFICIENT_PAYMENT = 'insufficient_payment',
  INVALID_FILTER = 'invalid_filter',
  TOO_MANY_SUBSCRIPTIONS = 'too_many_subscriptions',
  SUBSCRIPTION_EXPIRED = 'subscription_expired',
  SUBSCRIPTION_NOT_FOUND = 'subscription_not_found'
}

async function handleSubscriptionError(
  error: SubscriptionError,
  streamConnection: StreamConnection,
  subscriptionId: string
): Promise<void> {
  // Send CLOSED message with error
  const packet: BTPNIPsPacket = {
    version: 1,
    messageType: NostrMessageType.CLOSED,
    payment: { amount: '0', currency: 'msat', purpose: 'error' },
    nostr: {
      subscriptionId,
      reason: error
    },
    metadata: { timestamp: Math.floor(Date.now() / 1000) }
  };

  await streamConnection.sendPacket(serializeBTPNIPsPacket(packet));

  // Reject ILP packet if payment was involved
  if (error === SubscriptionError.INSUFFICIENT_PAYMENT) {
    await streamConnection.rejectPacket(error);
  } else {
    await streamConnection.fulfillPacket(); // Still fulfill, but subscription failed
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('SubscriptionManager', () => {
  it('should match events to subscriptions by author', async () => {
    const manager = createSubscriptionManager();

    await manager.addSubscription('sub-1', [{
      authors: ['alice', 'bob']
    }]);

    const event = { pubkey: 'alice', kind: 1, ... };
    const matches = manager.findMatchingSubscriptions(event);

    expect(matches).toContain('sub-1');
  });

  it('should expire subscriptions after TTL', async () => {
    const manager = createSubscriptionManager();

    await manager.addSubscription('sub-1', [{ kinds: [1] }], { ttl: 1 }); // 1 second

    await sleep(1100);

    const active = manager.getActiveSubscriptions();
    expect(active).not.toContain('sub-1');
  });
});
```

### Integration Tests

```typescript
describe('BTP-NIPs Subscription Flow', () => {
  it('should handle REQ → EVENT → EOSE → new EVENT → CLOSE', async () => {
    const client = await createBTPNIPsClient();
    const relay = await createBTPNIPsRelay();

    // Open subscription
    const subscription = await client.subscribe({
      filters: [{ kinds: [1], authors: ['alice'] }]
    });

    // Receive stored events
    const storedEvents = [];
    for await (const event of subscription.storedEvents()) {
      storedEvents.push(event);
    }

    expect(storedEvents.length).toBeGreaterThan(0);

    // Publish new event
    await relay.publishEvent({
      pubkey: 'alice',
      kind: 1,
      content: 'New message'
    });

    // Receive new event via subscription
    const newEvent = await subscription.nextEvent();
    expect(newEvent.content).toBe('New message');

    // Close subscription
    await subscription.close();

    // Verify subscription closed
    const closed = await subscription.waitForClosed();
    expect(closed).toBe(true);
  });
});
```

---

## Next Steps

1. **Story 5.3:** Implement REQ/CLOSE handlers
2. **Story 5.5:** Implement Subscription Manager with indexing
3. **Story 6.2:** Build native client with subscription API
4. **Epic 6:** Test end-to-end subscription flow

---

**Last Updated:** 2025-12-05
