# Monitoring & Observability

## Logging Strategy

**Technology:** Pino (high-performance JSON logger)

**Log Levels:**
- `fatal`: System is unusable (Dassie RPC connection permanently lost)
- `error`: Error events that might still allow the application to continue running
- `warn`: Potentially harmful situations (low AKT balance, unprofitable)
- `info`: Informational messages highlighting progress (startup, shutdown, payment verified)
- `debug`: Detailed information for debugging (WebSocket messages, RPC calls)
- `trace`: Very detailed information (event content, full stack traces)

**Structured Logging Format:**

```typescript
// src/config/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'nostream-ilp',
    environment: process.env.NODE_ENV,
  },
});

// Usage examples
logger.info({ event: 'server_started', port: 443 }, 'Server listening');

logger.error({
  event: 'payment_verification_failed',
  channelId: claim.channelId,
  reason: 'insufficient_balance',
  amountRequested: claim.amountSats,
  availableBalance: channel.balance
}, 'Payment verification failed');

logger.debug({
  event: 'nostr_event_received',
  eventId: event.id,
  kind: event.kind,
  pubkey: event.pubkey
}, 'Received Nostr event');
```

**Log Aggregation:**

For production, logs are written to stdout (captured by Akash provider) and optionally shipped to external service:

```typescript
// Optional: Ship logs to Loki/Grafana Cloud
if (process.env.LOKI_URL) {
  const transport = pino.transport({
    target: 'pino-loki',
    options: {
      batching: true,
      interval: 5,
      host: process.env.LOKI_URL,
      basicAuth: {
        username: process.env.LOKI_USERNAME,
        password: process.env.LOKI_PASSWORD
      },
      labels: {
        service: 'nostream-ilp',
        environment: process.env.NODE_ENV
      }
    }
  });

  logger = pino(logger.options, transport);
}
```

## Metrics Collection

**Technology:** Prometheus-compatible metrics exposed via `/metrics` endpoint

**Key Metrics:**

```typescript
// src/services/metrics.ts
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export const register = new Registry();

// Event processing metrics
export const eventsReceived = new Counter({
  name: 'nostream_events_received_total',
  help: 'Total number of Nostr events received',
  labelNames: ['kind', 'result'], // result: accepted, rejected_payment, rejected_signature
  registers: [register]
});

export const eventsStored = new Counter({
  name: 'nostream_events_stored_total',
  help: 'Total number of events stored in database',
  labelNames: ['kind'],
  registers: [register]
});

// Payment metrics
export const paymentsVerified = new Counter({
  name: 'nostream_payments_verified_total',
  help: 'Total number of payment claims verified',
  labelNames: ['currency', 'result'], // result: valid, invalid_signature, insufficient_balance, replay_attack
  registers: [register]
});

export const revenueEarned = new Gauge({
  name: 'nostream_revenue_total',
  help: 'Total revenue earned (in currency base units)',
  labelNames: ['currency'],
  registers: [register]
});

// Channel metrics
export const activeChannels = new Gauge({
  name: 'nostream_payment_channels_active',
  help: 'Number of active payment channels',
  labelNames: ['blockchain'],
  registers: [register]
});

// WebSocket metrics
export const connectedClients = new Gauge({
  name: 'nostream_connected_clients',
  help: 'Number of connected WebSocket clients',
  registers: [register]
});

export const activeSubscriptions = new Gauge({
  name: 'nostream_active_subscriptions',
  help: 'Number of active Nostr subscriptions',
  registers: [register]
});

// Performance metrics
export const eventProcessingDuration = new Histogram({
  name: 'nostream_event_processing_duration_seconds',
  help: 'Event processing duration',
  labelNames: ['kind'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register]
});

export const paymentVerificationDuration = new Histogram({
  name: 'nostream_payment_verification_duration_seconds',
  help: 'Payment verification duration',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
  registers: [register]
});

// Arweave metrics
export const arweaveUploads = new Counter({
  name: 'nostream_arweave_uploads_total',
  help: 'Total number of Arweave uploads',
  labelNames: ['type'], // type: event, backup
  registers: [register]
});

export const arweaveSpend = new Gauge({
  name: 'nostream_arweave_spend_winston',
  help: 'Total AR spent on uploads (in winston)',
  registers: [register]
});

// Economic Monitor metrics
export const profitability = new Gauge({
  name: 'nostream_profit_uakt',
  help: 'Current profit/loss (in uakt)',
  registers: [register]
});

export const aktBalance = new Gauge({
  name: 'nostream_akt_balance',
  help: 'Current AKT balance for Akash payments',
  registers: [register]
});
```

**Metrics Endpoint:**

```typescript
// src/dashboard/routes/metrics.ts
import { register } from '../../services/metrics';

export async function handleMetrics(req, reply) {
  reply.header('Content-Type', register.contentType);
  return register.metrics();
}

// Register route (public, no auth required for Prometheus scraping)
fastify.get('/metrics', handleMetrics);
```

**Prometheus Scrape Config:**

```yaml