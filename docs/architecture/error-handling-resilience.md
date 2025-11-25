# Error Handling & Resilience

## Error Classification

**1. Transient Errors (Retry):**
- Database connection timeout
- Dassie RPC connection lost
- Arweave upload timeout
- Redis connection failure

**2. Permanent Errors (Fail Fast):**
- Invalid Nostr event signature
- Invalid payment claim signature
- Insufficient channel balance
- Expired payment channel

**3. Degraded Mode Errors (Continue with Reduced Functionality):**
- Arweave service down → Store events without archival
- Redis cache down → Fall back to database queries
- Dashboard unavailable → Relay continues serving Nostr clients

## Retry Strategies

**Exponential Backoff with Jitter:**

```typescript
// src/utils/retry.ts
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    jitterFactor?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 5,
    initialDelayMs = 100,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    jitterFactor = 0.1
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;

      if (attempt >= maxAttempts) {
        throw error;
      }

      // Add jitter to prevent thundering herd
      const jitter = delay * jitterFactor * (Math.random() - 0.5);
      const actualDelay = Math.min(delay + jitter, maxDelayMs);

      logger.warn({
        event: 'retry_attempt',
        attempt,
        maxAttempts,
        delayMs: actualDelay,
        error: error.message
      }, `Retrying after error (attempt ${attempt}/${maxAttempts})`);

      await sleep(actualDelay);

      delay *= backoffMultiplier;
    }
  }
}
```

**Usage Example (Dassie RPC):**

```typescript
async function verifyPaymentWithRetry(claim: PaymentClaim): Promise<boolean> {
  return retryWithBackoff(
    async () => {
      return await dassieClient.payment.verifyPaymentClaim(claim);
    },
    {
      maxAttempts: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000
    }
  );
}
```

## Circuit Breaker Pattern

**Purpose:** Prevent cascading failures when Dassie/Arweave are down

```typescript
// src/utils/circuit-breaker.ts
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;

  constructor(
    private options: {
      failureThreshold: number;
      successThreshold: number;
      timeoutMs: number;
      resetTimeMs: number;
    }
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeMs) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        logger.info({ event: 'circuit_breaker_half_open' });
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        this.timeout()
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async timeout(): Promise<never> {
    await sleep(this.options.timeoutMs);
    throw new Error('Circuit breaker timeout');
  }

  private onSuccess() {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = 'CLOSED';
        logger.info({ event: 'circuit_breaker_closed' });
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'OPEN';
      logger.error({
        event: 'circuit_breaker_open',
        failureCount: this.failureCount
      });
    }
  }
}

// Usage
const dassieCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 5000,
  resetTimeMs: 30000
});

async function callDassie() {
  return dassieCircuitBreaker.execute(async () => {
    return await dassieClient.payment.getChannelState({ channelId: '...' });
  });
}
```

## Graceful Degradation

**Scenario: Arweave Service Unavailable**

```typescript
async function handleLargeContent(event: NostrEvent): Promise<void> {
  try {
    const txId = await arweaveService.upload(event.content, event);
    event.tags.push(['arweave', txId]);
    event.content = ''; // Clear content
  } catch (error) {
    logger.error({
      event: 'arweave_upload_failed',
      eventId: event.id,
      error: error.message
    }, 'Arweave upload failed, storing full content in database');

    // Degrade gracefully: store in PostgreSQL instead
    // Add tag indicating content is NOT in Arweave
    event.tags.push(['arweave_pending', 'true']);

    // Keep full content in database
    // (Economic monitor will retry upload later)
  }
}
```

**Scenario: Redis Cache Down**

```typescript
async function getCachedChannelState(channelId: string): Promise<PaymentChannel> {
  try {
    const cached = await redis.get(`channel:${channelId}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    logger.warn({
      event: 'redis_cache_miss',
      error: error.message
    }, 'Redis unavailable, querying Dassie directly');
  }

  // Fall back to Dassie RPC
  const state = await dassieClient.payment.getChannelState({ channelId });

  // Try to cache for next time (best effort)
  try {
    await redis.setex(`channel:${channelId}`, 30, JSON.stringify(state));
  } catch (error) {
    // Ignore cache write failure
  }

  return state;
}
```

## Health Checks

**Comprehensive Health Check Endpoint:**

```typescript
// src/dashboard/routes/health.ts
export async function handleHealthCheck(req, reply) {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      nostream: 'up',
      dassie_rpc: 'unknown',
      postgresql: 'unknown',
      redis: 'unknown',
      arweave: 'unknown'
    },
    warnings: []
  };

  // Check Dassie RPC
  try {
    await dassieClient.ledger.getBalance({ accountPath: 'akt:assets/settlement' });
    health.services.dassie_rpc = 'up';
  } catch (error) {
    health.services.dassie_rpc = 'down';
    health.status = 'degraded';
    health.warnings.push('Dassie RPC unavailable - payments cannot be verified');
  }

  // Check PostgreSQL
  try {
    await db.query('SELECT 1');
    health.services.postgresql = 'up';
  } catch (error) {
    health.services.postgresql = 'down';
    health.status = 'unhealthy';
    health.warnings.push('PostgreSQL down - cannot store events');
  }

  // Check Redis
  try {
    await redis.ping();
    health.services.redis = 'up';
  } catch (error) {
    health.services.redis = 'down';
    health.warnings.push('Redis down - caching disabled');
  }

  // Check Arweave
  try {
    const balance = await arweaveWallet.getBalance();
    health.services.arweave = 'up';
    if (parseInt(balance) < 1000000000) { // < 0.001 AR
      health.warnings.push(`Arweave wallet low (${balance} winston)`);
    }
  } catch (error) {
    health.services.arweave = 'down';
    health.warnings.push('Arweave unavailable - archival disabled');
  }

  // Check AKT balance
  try {
    const aktBalance = await dassieClient.ledger.getBalance({ accountPath: 'akt:assets/settlement' });
    if (aktBalance < 5000000) { // < 5 AKT
      health.warnings.push(`AKT balance low (${aktBalance / 1000000} AKT)`);
    }
  } catch (error) {
    // Already warned about Dassie RPC being down
  }

  reply.code(health.status === 'unhealthy' ? 503 : 200);
  return health;
}
```

---
