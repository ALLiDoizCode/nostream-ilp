# Performance & Scalability

## Performance Targets

**Latency Goals:**
- Event acceptance: **<10ms** (p95)
- Payment verification: **<50ms** (p95)
- Subscription delivery: **<100ms** (p95)
- Database query: **<5ms** (p95)

**Throughput Goals:**
- **1,000 events/second** sustained
- **10,000 concurrent WebSocket connections**
- **100,000 active subscriptions**

## Database Optimization

**1. Indexing Strategy:**

```sql
-- Events table indexes (already in Nostream)
CREATE INDEX idx_events_kind ON events(kind);
CREATE INDEX idx_events_pubkey ON events(pubkey);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_events_kind_created_at ON events(kind, created_at DESC);

-- Additional indexes for ILP integration
CREATE INDEX idx_events_payment_verified ON events(payment_verified) WHERE requires_payment = TRUE;
CREATE INDEX idx_payment_claims_channel_nonce ON payment_claims(channel_id, nonce);
CREATE INDEX idx_payment_channels_status_blockchain ON payment_channels(status, blockchain) WHERE status = 'OPEN';

-- Partial index for archived events
CREATE INDEX idx_archived_events_kind_date ON archived_events(kind, created_at DESC);
```

**2. Query Optimization:**

```typescript
// BAD: N+1 query problem
for (const event of events) {
  const claims = await db.query('SELECT * FROM payment_claims WHERE event_id = $1', [event.id]);
}

// GOOD: Single JOIN query
const events = await db.query(`
  SELECT e.*, pc.amount_sats, pc.nonce
  FROM events e
  LEFT JOIN payment_claims pc ON pc.event_id = e.id
  WHERE e.pubkey = $1
  ORDER BY e.created_at DESC
  LIMIT 100
`, [pubkey]);
```

**3. Connection Pooling:**

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Max 20 connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
```

## Caching Strategy

**Multi-Layer Cache:**

**L1: In-Memory Cache (Map)**
- Channel states (TTL: 30 seconds)
- NIP-11 relay info (static)
- Pricing configuration (TTL: 5 minutes)

**L2: Redis Cache**
- Recent events (TTL: 10 minutes)
- Subscription filter results (TTL: 1 minute)
- Balance snapshots (TTL: 30 seconds)

**L3: PostgreSQL (Source of Truth)**

```typescript
class CachedChannelService {
  private memCache = new Map<string, { state: PaymentChannel; expiry: number }>();

  async getChannelState(channelId: string): Promise<PaymentChannel> {
    // L1: Check in-memory cache
    const mem = this.memCache.get(channelId);
    if (mem && Date.now() < mem.expiry) {
      return mem.state;
    }

    // L2: Check Redis
    try {
      const cached = await redis.get(`channel:${channelId}`);
      if (cached) {
        const state = JSON.parse(cached);
        this.memCache.set(channelId, { state, expiry: Date.now() + 30000 });
        return state;
      }
    } catch (error) {
      // Redis down, continue to L3
    }

    // L3: Query Dassie RPC
    const state = await dassieClient.payment.getChannelState({ channelId });

    // Populate caches
    this.memCache.set(channelId, { state, expiry: Date.now() + 30000 });
    try {
      await redis.setex(`channel:${channelId}`, 30, JSON.stringify(state));
    } catch (error) {
      // Ignore cache write failure
    }

    return state;
  }
}
```

## WebSocket Optimization

**1. Compression:**

```typescript
fastify.register(require('@fastify/websocket'), {
  options: {
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3 // Lower compression level = faster
      },
      threshold: 1024 // Only compress messages > 1KB
    }
  }
});
```

**2. Backpressure Handling:**

```typescript
function sendEvent(ws: WebSocket, event: NostrEvent) {
  const message = JSON.stringify(['EVENT', subscriptionId, event]);

  // Check if WebSocket buffer is full
  if (ws.bufferedAmount > 100000) { // 100KB backlog
    logger.warn({
      event: 'websocket_backpressure',
      bufferedAmount: ws.bufferedAmount
    }, 'Client cannot keep up, dropping subscription');

    // Close slow clients
    ws.close(1008, 'Cannot keep up with event stream');
    return;
  }

  ws.send(message);
}
```

## Horizontal Scaling (Future)

**Strategy:** Add load balancer + multiple Nostream instances

**Requirements:**
- **Sticky sessions:** WebSocket connections must stay on same instance
- **Shared Redis:** For subscription state synchronization
- **Shared PostgreSQL:** Single source of truth
- **Shared Dassie:** One Dassie node for all Nostream instances

**Architecture:**

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    │   (Sticky WS)   │
                    └────────┬────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
         ┌──────▼──────┐ ┌──▼───────┐ ┌─▼────────┐
         │ Nostream #1 │ │Nostream#2│ │Nostream#3│
         └──────┬──────┘ └──┬───────┘ └─┬────────┘
                │           │            │
                └───────────┼────────────┘
                            │
                   ┌────────┴────────┐
                   │                 │
            ┌──────▼──────┐   ┌─────▼─────┐
            │  PostgreSQL │   │   Redis   │
            │   (Shared)  │   │ (Shared)  │
            └─────────────┘   └───────────┘
                   │
            ┌──────▼──────┐
            │    Dassie   │
            │   (Shared)  │
            └─────────────┘
```

**Implementation Notes:**
- Use Akash persistent storage for PostgreSQL/Redis
- Share Dassie RPC URL across all instances
- Redis pub/sub for cross-instance event broadcasting

---

**End of Backend Architecture Document**

