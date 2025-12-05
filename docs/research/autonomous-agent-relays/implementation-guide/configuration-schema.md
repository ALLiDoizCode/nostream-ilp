# Autonomous Agent Configuration Schema

## Overview

This document defines the complete configuration schema for autonomous Nostr-ILP relay agents, including environment variables, YAML configuration, secrets management, validation, and migration strategies.

**Audience:** System administrators, DevOps engineers, developers

**Related Documents:**
- [Self-Deployment Design](/docs/research/autonomous-agent-relays/agent-design/self-deployment.md)
- [Deployment Runbook](/docs/research/autonomous-agent-relays/implementation-guide/deployment-runbook.md)

---

## Table of Contents

1. [Configuration File Structure](#configuration-file-structure)
2. [Environment Variables Reference](#environment-variables-reference)
3. [YAML Configuration Schema](#yaml-configuration-schema)
4. [Secrets Management](#secrets-management)
5. [Configuration Validation](#configuration-validation)
6. [Default Values](#default-values)
7. [Configuration Examples](#configuration-examples)
8. [Hot Reload Support](#hot-reload-support)
9. [Configuration Migration](#configuration-migration)

---

## Configuration File Structure

### File Locations

```
/app/
├── config/
│   ├── default.yaml          # Default configuration (committed)
│   ├── development.yaml      # Development overrides
│   ├── staging.yaml          # Staging overrides
│   ├── production.yaml       # Production overrides
│   └── local.yaml            # Local overrides (not committed)
├── secrets/
│   ├── keys.enc              # Encrypted key bundle
│   ├── agent-keys.json       # Agent identity keys (not committed)
│   ├── payment-keys.json     # Payment channel keys (not committed)
│   └── arweave-wallet.json   # Arweave wallet JWK (not committed)
└── .env                      # Environment variables (not committed)
```

### Configuration Priority

Configuration is loaded in the following order (later overrides earlier):

1. `config/default.yaml` - Base defaults
2. `config/{environment}.yaml` - Environment-specific (determined by NODE_ENV)
3. `config/local.yaml` - Local overrides
4. Environment variables - Highest priority

### Example Loading

```typescript
// packages/agent-relay/src/config/loader.ts

import { load } from 'js-yaml';
import { readFileSync } from 'fs';
import { merge } from 'lodash';

export function loadConfig(): AgentConfig {
  const env = process.env.NODE_ENV || 'development';

  // Load configuration files
  const defaultConfig = load(readFileSync('config/default.yaml', 'utf8'));
  const envConfig = load(readFileSync(`config/${env}.yaml`, 'utf8'));
  const localConfig = loadIfExists('config/local.yaml');

  // Merge configurations
  let config = merge({}, defaultConfig, envConfig, localConfig);

  // Override with environment variables
  config = applyEnvironmentOverrides(config);

  // Validate configuration
  validateConfig(config);

  return config;
}
```

---

## Environment Variables Reference

### Agent Identity

| Variable | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| `AGENT_ID` | string | Yes | Unique agent identifier | `agent_a1b2c3d4e5f6` |
| `AGENT_PRIVATE_KEY` | hex | Yes | Nostr private key (32 bytes hex) | `abc123...` |
| `AGENT_NAME` | string | No | Human-readable agent name | `My Autonomous Relay` |
| `AGENT_DESCRIPTION` | string | No | Agent description | `Self-managing relay` |

### Akash Configuration

| Variable | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| `AKASH_ACCOUNT_ADDRESS` | string | Yes | Akash wallet address | `akash1xyz...` |
| `AKASH_PRIVATE_KEY` | hex | Yes | Akash account private key | `def456...` |
| `AKASH_CHAIN_ID` | string | Yes | Akash chain ID | `akashnet-2` |
| `AKASH_NODE` | url | Yes | Akash RPC endpoint | `https://rpc.akash.network:443` |
| `AKASH_DSEQ` | number | No* | Deployment sequence number | `12345678` |
| `AKASH_PROVIDER` | string | No* | Provider address | `akash1provider...` |

*Required when autonomous mode is enabled

### Payment Configuration

| Variable | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| `CRONOS_RPC_URL` | url | Yes | Cronos RPC endpoint | `https://evm.cronos.org` |
| `PAYMENT_CHANNEL_ADDRESS` | address | Yes | Payment channel contract | `0x123...` |
| `CHANNEL_PRIVATE_KEY` | hex | Yes | EVM private key for channels | `789abc...` |
| `ILP_ADDRESS` | string | Yes | ILP payment pointer | `$ilp.example.com/agent123` |
| `DASSIE_NODE_URL` | url | No | Dassie ILP node URL | `http://localhost:3000` |

### Database Configuration

| Variable | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| `POSTGRES_HOST` | string | Yes | PostgreSQL host | `postgres` |
| `POSTGRES_PORT` | number | Yes | PostgreSQL port | `5432` |
| `POSTGRES_DB` | string | Yes | Database name | `nostream` |
| `POSTGRES_USER` | string | Yes | Database user | `nostream_user` |
| `POSTGRES_PASSWORD` | string | Yes | Database password | `secure_password` |
| `POSTGRES_MAX_CONNECTIONS` | number | No | Max connections | `200` |
| `POSTGRES_SSL` | boolean | No | Enable SSL | `true` |

### Redis Configuration

| Variable | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| `REDIS_HOST` | string | Yes | Redis host | `redis` |
| `REDIS_PORT` | number | Yes | Redis port | `6379` |
| `REDIS_PASSWORD` | string | No | Redis password | `redis_password` |
| `REDIS_DB` | number | No | Redis database number | `0` |
| `REDIS_MAX_MEMORY` | string | No | Max memory (with unit) | `2gb` |
| `REDIS_EVICTION_POLICY` | string | No | Eviction policy | `allkeys-lru` |

### Arweave Configuration

| Variable | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| `ARWEAVE_WALLET_PATH` | path | Yes | Path to Arweave wallet JWK | `/secrets/arweave-wallet.json` |
| `ARWEAVE_ENABLED` | boolean | No | Enable Arweave storage | `true` |
| `ARWEAVE_HOST` | string | No | Arweave gateway host | `arweave.net` |
| `ARWEAVE_PORT` | number | No | Arweave gateway port | `443` |
| `ARWEAVE_PROTOCOL` | string | No | Protocol (http/https) | `https` |
| `ARWEAVE_BACKUP_ENABLED` | boolean | No | Enable automatic backups | `true` |
| `ARWEAVE_BACKUP_FREQUENCY` | string | No | Backup frequency | `daily` |

### Monitoring Configuration

| Variable | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| `GRAFANA_CLOUD_API_KEY` | string | No | Grafana Cloud API key | `glc_xxx` |
| `GRAFANA_CLOUD_URL` | url | No | Grafana Cloud endpoint | `https://prometheus-us-central1.grafana.net` |
| `HEALTHCHECK_URL` | url | No | External healthcheck URL | `https://healthchecks.io/ping/xxx` |
| `SENTRY_DSN` | url | No | Sentry error tracking DSN | `https://xxx@sentry.io/xxx` |
| `LOG_LEVEL` | string | No | Logging level | `info` |
| `LOG_FORMAT` | string | No | Log format (json/text) | `json` |

### Alerting Configuration

| Variable | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| `SLACK_WEBHOOK_URL` | url | No | Slack webhook for alerts | `https://hooks.slack.com/...` |
| `TELEGRAM_BOT_TOKEN` | string | No | Telegram bot token | `123456:ABC-DEF...` |
| `TELEGRAM_CHAT_ID` | string | No | Telegram chat ID | `-1001234567890` |
| `EMAIL_SMTP_HOST` | string | No | SMTP server host | `smtp.gmail.com` |
| `EMAIL_SMTP_PORT` | number | No | SMTP server port | `587` |
| `EMAIL_FROM` | email | No | From email address | `alerts@example.com` |
| `EMAIL_TO` | email | No | To email address | `admin@example.com` |
| `OPERATOR_NOSTR_PUBKEY` | npub | No | Operator Nostr pubkey for DMs | `npub1xyz...` |

### Autonomous Features

| Variable | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| `AUTONOMOUS_MODE` | boolean | No | Enable autonomous operations | `true` |
| `SELF_DEPLOYMENT_ENABLED` | boolean | No | Enable self-deployment management | `true` |
| `REPRODUCTION_ENABLED` | boolean | No | Enable agent reproduction | `false` |
| `MAX_CHILDREN` | number | No | Max child agents | `5` |
| `PARENT_AGENT_ID` | string | No* | Parent agent ID (for children) | `agent_parent123` |
| `REPRODUCTION_TRIGGERS` | json | No | Enabled reproduction triggers | `["high_load","redundancy"]` |

*Required for child agents

### Treasury Configuration

| Variable | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| `TREASURY_ENABLED` | boolean | No | Enable treasury management | `true` |
| `TREASURY_MIN_AKT_BALANCE` | number | No | Min AKT before swap | `10` |
| `TREASURY_MIN_CRO_BALANCE` | number | No | Min CRO before alert | `100` |
| `TREASURY_AUTO_SWAP` | boolean | No | Enable automatic swaps | `true` |
| `TREASURY_DEX_ROUTER` | address | No | DEX router contract | `0xabc...` |
| `TREASURY_SWAP_SLIPPAGE` | number | No | Max slippage (0-1) | `0.02` |

### Network Configuration

| Variable | Type | Required | Description | Example |
|----------|------|----------|-------------|---------|
| `PORT` | number | No | HTTP server port | `8080` |
| `WEBSOCKET_PORT` | number | No | WebSocket server port | `8080` |
| `HTTPS_ENABLED` | boolean | No | Enable HTTPS | `true` |
| `SSL_CERT_PATH` | path | No* | SSL certificate path | `/certs/cert.pem` |
| `SSL_KEY_PATH` | path | No* | SSL private key path | `/certs/key.pem` |
| `DOMAIN` | string | No | Custom domain | `relay.example.com` |
| `MAX_CONNECTIONS` | number | No | Max concurrent connections | `10000` |
| `CONNECTION_TIMEOUT_MS` | number | No | Connection timeout | `300000` |

*Required if HTTPS_ENABLED=true

---

## YAML Configuration Schema

### Complete Schema (TypeScript Definition)

```typescript
// packages/agent-relay/src/config/schema.ts

export interface AgentConfig {
  agent: AgentIdentity;
  akash: AkashConfig;
  relay: RelayConfig;
  payments: PaymentConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  arweave: ArweaveConfig;
  monitoring: MonitoringConfig;
  alerting: AlertingConfig;
  autonomous: AutonomousConfig;
  treasury: TreasuryConfig;
  network: NetworkConfig;
  security: SecurityConfig;
  features: FeatureFlags;
}

export interface AgentIdentity {
  id: string;
  name: string;
  description: string;
  privateKey: string;      // Loaded from secrets
  publicKey?: string;      // Derived from privateKey
  npub?: string;           // Derived from privateKey
}

export interface AkashConfig {
  accountAddress: string;
  privateKey: string;      // Loaded from secrets
  chainId: string;
  nodeUrl: string;
  gasPrice: string;
  gasAdjustment: number;
  deployment?: {
    dseq?: number;
    provider?: string;
    leaseId?: string;
  };
}

export interface RelayConfig {
  name: string;
  description: string;
  pubkey: string;
  supportedNips: number[];
  limitations?: {
    maxMessageLength?: number;
    maxSubscriptions?: number;
    maxFilters?: number;
    maxSubidLength?: number;
    maxLimit?: number;
    minPowDifficulty?: number;
    authRequired?: boolean;
    paymentRequired?: boolean;
  };
  retention?: {
    kinds?: Record<number, number>;  // kind -> seconds
    time?: number;                   // default retention time
  };
}

export interface PaymentConfig {
  enabled: boolean;
  processor: 'ilp' | 'lightning' | 'cronos';
  ilp?: ILPConfig;
  cronos?: CronosConfig;
  bundledPricing: boolean;
  feeSchedules: {
    admission?: {
      enabled: boolean;
      amount: number;           // msats
    };
    perEvent?: {
      enabled: boolean;
      baseAmount: number;       // msats
      kindMultipliers?: Record<number, number>;
    };
    subscription?: {
      enabled: boolean;
      daily?: number;           // msats
      monthly?: number;         // msats
    };
  };
}

export interface ILPConfig {
  address: string;              // Payment pointer
  dassieNodeUrl?: string;
  streamServerSecret?: string;
}

export interface CronosConfig {
  rpcUrl: string;
  chainId: number;
  paymentChannelAddress: string;
  channelPrivateKey: string;    // Loaded from secrets
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;             // Loaded from secrets
  maxConnections: number;
  ssl: boolean;
  migrationsPath: string;
  seedPath?: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;            // Loaded from secrets
  db: number;
  maxMemory: string;
  evictionPolicy: string;
  keyPrefix: string;
}

export interface ArweaveConfig {
  enabled: boolean;
  walletPath: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  timeout: number;
  requiredKinds: number[];      // Kinds that must be stored on Arweave
  backup: {
    enabled: boolean;
    frequency: 'hourly' | 'daily' | 'weekly';
    retentionDays: number;      // How long to keep in hot storage
  };
  pricing: {
    arPerMB: number;            // Updated from oracle
    arToUsdRate: number;        // Updated from oracle
  };
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsPort: number;
  healthcheckUrl?: string;
  grafana?: {
    enabled: boolean;
    apiKey: string;
    url: string;
  };
  sentry?: {
    enabled: boolean;
    dsn: string;
    environment: string;
    tracesSampleRate: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    destination: 'stdout' | 'file' | 'both';
    filePath?: string;
  };
}

export interface AlertingConfig {
  enabled: boolean;
  channels: {
    console: boolean;
    slack?: {
      enabled: boolean;
      webhookUrl: string;
      channel?: string;
      username?: string;
    };
    telegram?: {
      enabled: boolean;
      botToken: string;
      chatId: string;
    };
    email?: {
      enabled: boolean;
      smtp: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
          user: string;
          pass: string;
        };
      };
      from: string;
      to: string[];
    };
    nostr?: {
      enabled: boolean;
      operatorPubkey: string;
      relays: string[];
    };
  };
  severityFilters: {
    low: string[];      // Which channels for low severity
    medium: string[];   // Which channels for medium severity
    high: string[];     // Which channels for high severity
    critical: string[]; // Which channels for critical severity
  };
}

export interface AutonomousConfig {
  enabled: boolean;
  selfDeployment: {
    enabled: boolean;
    renewalBufferHours: number;    // Renew lease when < N hours remain
    scaleUpThreshold: number;      // CPU/memory % to trigger scale
    scaleDownThreshold: number;    // CPU/memory % to trigger scale down
  };
  reproduction: {
    enabled: boolean;
    maxChildren: number;
    allowedTriggers: ReproductionTrigger[];
    loadThreshold: number;         // Trigger at N% capacity
    geoDistribution: boolean;      // Spawn in different regions
    redundancyTarget: number;      // Min agents for redundancy
  };
  providerSelection: {
    priceWeight: number;           // 0-1
    uptimeWeight: number;          // 0-1
    reputationWeight: number;      // 0-1
    diversityWeight: number;       // 0-1
  };
  healthMonitoring: {
    intervalSeconds: number;
    timeoutSeconds: number;
    failureThreshold: number;      // Failed checks before action
  };
  parentAgentId?: string;          // For child agents
}

export interface TreasuryConfig {
  enabled: boolean;
  balances: {
    akt: {
      minBalance: number;          // AKT
      targetBalance: number;       // AKT
      alertThreshold: number;      // AKT
    };
    cro: {
      minBalance: number;          // CRO
      targetBalance: number;       // CRO
      alertThreshold: number;      // CRO
    };
    ar: {
      minBalance: number;          // AR
      targetBalance: number;       // AR
      alertThreshold: number;      // AR
    };
  };
  autoSwap: {
    enabled: boolean;
    dexRouter: string;             // Contract address
    slippageTolerance: number;     // 0-1 (e.g., 0.02 = 2%)
    maxSwapAmount: number;         // Max per swap in USD
  };
}

export interface NetworkConfig {
  http: {
    port: number;
    host: string;
    cors: {
      enabled: boolean;
      origins: string[];
    };
    rateLimit: {
      enabled: boolean;
      windowMs: number;
      max: number;
    };
  };
  websocket: {
    port: number;
    maxConnections: number;
    pingInterval: number;          // ms
    pongTimeout: number;           // ms
    maxPayloadSize: number;        // bytes
  };
  https: {
    enabled: boolean;
    port?: number;
    certPath?: string;
    keyPath?: string;
    forceHttps?: boolean;
  };
  domain?: string;
}

export interface SecurityConfig {
  keys: {
    storageBackend: 'environment' | 'file' | 'vault' | 'kms';
    encryptionKey?: string;        // For file backend
    vaultUrl?: string;             // For vault backend
    kmsKeyId?: string;             // For KMS backend
    rotationEnabled: boolean;
    rotationIntervalDays: number;
  };
  encryption: {
    algorithm: string;
    keyDerivation: {
      algorithm: string;
      iterations: number;
      keyLength: number;
    };
  };
  contentSecurityPolicy?: {
    directives: Record<string, string[]>;
  };
}

export interface FeatureFlags {
  experimentalILP: boolean;
  arweaveBackup: boolean;
  autonomousReproduction: boolean;
  adaptivePricing: boolean;
  geoRouting: boolean;
  p2pMesh: boolean;
}
```

### Example YAML Configuration

```yaml
# config/default.yaml

agent:
  id: ${AGENT_ID}
  name: ${AGENT_NAME:Autonomous Agent Relay}
  description: ${AGENT_DESCRIPTION:Self-managing Nostr relay with ILP payments}
  privateKey: ${AGENT_PRIVATE_KEY}  # Loaded from secrets

akash:
  accountAddress: ${AKASH_ACCOUNT_ADDRESS}
  privateKey: ${AKASH_PRIVATE_KEY}  # Loaded from secrets
  chainId: ${AKASH_CHAIN_ID:akashnet-2}
  nodeUrl: ${AKASH_NODE:https://rpc.akash.network:443}
  gasPrice: ${AKASH_GAS_PRICES:0.025uakt}
  gasAdjustment: ${AKASH_GAS_ADJUSTMENT:1.25}
  deployment:
    dseq: ${AKASH_DSEQ}
    provider: ${AKASH_PROVIDER}

relay:
  name: ${RELAY_NAME:Autonomous Agent Relay}
  description: ${RELAY_DESCRIPTION:Self-managing relay with autonomous operations}
  pubkey: ${RELAY_PUBKEY}  # Derived from agent.privateKey
  supportedNips:
    - 1   # Basic protocol
    - 2   # Contact list
    - 4   # Encrypted DMs
    - 9   # Event deletion
    - 11  # Relay info
    - 12  # Generic tag queries
    - 15  # End of stored events
    - 16  # Event treatment
    - 20  # Command results
    - 22  # Event created_at limits
    - 28  # Public chat
    - 33  # Parameterized replaceable events
    - 40  # Expiration timestamp
  limitations:
    maxMessageLength: 524288      # 512KB
    maxSubscriptions: 20
    maxFilters: 10
    maxSubidLength: 256
    maxLimit: 5000
    minPowDifficulty: 0
    authRequired: false
    paymentRequired: true
  retention:
    time: 7776000                 # 90 days default
    kinds:
      0: 31536000                 # Metadata: 1 year
      1: 7776000                  # Short notes: 90 days
      3: 31536000                 # Follow lists: 1 year
      7: 2592000                  # Reactions: 30 days
      30023: 0                    # Long-form: permanent (Arweave)

payments:
  enabled: true
  processor: ilp
  bundledPricing: true
  ilp:
    address: ${ILP_ADDRESS}
    dassieNodeUrl: ${DASSIE_NODE_URL:http://localhost:3000}
  cronos:
    rpcUrl: ${CRONOS_RPC_URL:https://evm.cronos.org}
    chainId: ${CRONOS_CHAIN_ID:25}
    paymentChannelAddress: ${PAYMENT_CHANNEL_ADDRESS}
    channelPrivateKey: ${CHANNEL_PRIVATE_KEY}  # Loaded from secrets
  feeSchedules:
    admission:
      enabled: false
      amount: 0
    perEvent:
      enabled: true
      baseAmount: 100              # 100 msats base
      kindMultipliers:
        1: 0.1                     # Short notes: 10 msats
        30023: 2.0                 # Long-form: 200 msats + Arweave
        1063: 3.0                  # Files: 300 msats + Arweave
        71: 5.0                    # Video: 500 msats + Arweave
    subscription:
      enabled: false

database:
  host: ${POSTGRES_HOST:postgres}
  port: ${POSTGRES_PORT:5432}
  database: ${POSTGRES_DB:nostream}
  user: ${POSTGRES_USER:nostream_user}
  password: ${POSTGRES_PASSWORD}  # Loaded from secrets
  maxConnections: ${POSTGRES_MAX_CONNECTIONS:200}
  ssl: ${POSTGRES_SSL:false}
  migrationsPath: ./migrations
  seedPath: ./seeds

redis:
  host: ${REDIS_HOST:redis}
  port: ${REDIS_PORT:6379}
  password: ${REDIS_PASSWORD}     # Loaded from secrets (optional)
  db: ${REDIS_DB:0}
  maxMemory: ${REDIS_MAX_MEMORY:2gb}
  evictionPolicy: ${REDIS_EVICTION_POLICY:allkeys-lru}
  keyPrefix: agent:

arweave:
  enabled: ${ARWEAVE_ENABLED:true}
  walletPath: ${ARWEAVE_WALLET_PATH:/secrets/arweave-wallet.json}
  host: ${ARWEAVE_HOST:arweave.net}
  port: ${ARWEAVE_PORT:443}
  protocol: ${ARWEAVE_PROTOCOL:https}
  timeout: 30000
  requiredKinds:
    - 30023   # Long-form content
    - 1063    # File metadata
    - 71      # Video
    - 22      # Short video
    - 20      # Pictures
  backup:
    enabled: ${ARWEAVE_BACKUP_ENABLED:true}
    frequency: ${ARWEAVE_BACKUP_FREQUENCY:daily}
    retentionDays: ${ARWEAVE_RETENTION_DAYS:90}
  pricing:
    arPerMB: 0.001                # Updated from oracle
    arToUsdRate: 25.0             # Updated from oracle

monitoring:
  enabled: true
  metricsPort: ${METRICS_PORT:9090}
  healthcheckUrl: ${HEALTHCHECK_URL}
  grafana:
    enabled: ${GRAFANA_ENABLED:false}
    apiKey: ${GRAFANA_CLOUD_API_KEY}
    url: ${GRAFANA_CLOUD_URL}
  sentry:
    enabled: ${SENTRY_ENABLED:false}
    dsn: ${SENTRY_DSN}
    environment: ${NODE_ENV:development}
    tracesSampleRate: 0.1
  logging:
    level: ${LOG_LEVEL:info}
    format: ${LOG_FORMAT:json}
    destination: stdout

alerting:
  enabled: true
  channels:
    console: true
    slack:
      enabled: ${SLACK_ALERTS_ENABLED:false}
      webhookUrl: ${SLACK_WEBHOOK_URL}
      channel: '#agent-alerts'
      username: 'Agent Alert Bot'
    telegram:
      enabled: ${TELEGRAM_ALERTS_ENABLED:false}
      botToken: ${TELEGRAM_BOT_TOKEN}
      chatId: ${TELEGRAM_CHAT_ID}
    email:
      enabled: ${EMAIL_ALERTS_ENABLED:false}
      smtp:
        host: ${EMAIL_SMTP_HOST}
        port: ${EMAIL_SMTP_PORT:587}
        secure: false
        auth:
          user: ${EMAIL_SMTP_USER}
          pass: ${EMAIL_SMTP_PASS}
      from: ${EMAIL_FROM}
      to:
        - ${EMAIL_TO}
    nostr:
      enabled: ${NOSTR_ALERTS_ENABLED:false}
      operatorPubkey: ${OPERATOR_NOSTR_PUBKEY}
      relays:
        - wss://relay.damus.io
        - wss://nos.lol
  severityFilters:
    low:
      - console
    medium:
      - console
      - slack
    high:
      - console
      - slack
      - telegram
    critical:
      - console
      - slack
      - telegram
      - email
      - nostr

autonomous:
  enabled: ${AUTONOMOUS_MODE:false}
  selfDeployment:
    enabled: ${SELF_DEPLOYMENT_ENABLED:false}
    renewalBufferHours: 24        # Renew when < 24h remain
    scaleUpThreshold: 0.8         # Scale at 80% resource usage
    scaleDownThreshold: 0.3       # Scale down at 30% resource usage
  reproduction:
    enabled: ${REPRODUCTION_ENABLED:false}
    maxChildren: ${MAX_CHILDREN:5}
    allowedTriggers:
      - high_load
      - geographic_demand
      - redundancy
    loadThreshold: 0.8            # Reproduce at 80% capacity
    geoDistribution: true
    redundancyTarget: 3           # Maintain at least 3 agents
  providerSelection:
    priceWeight: 0.4
    uptimeWeight: 0.3
    reputationWeight: 0.2
    diversityWeight: 0.1
  healthMonitoring:
    intervalSeconds: 30
    timeoutSeconds: 10
    failureThreshold: 3           # 3 failed checks = failure
  parentAgentId: ${PARENT_AGENT_ID}

treasury:
  enabled: ${TREASURY_ENABLED:true}
  balances:
    akt:
      minBalance: 10              # AKT
      targetBalance: 50           # AKT
      alertThreshold: 20          # AKT
    cro:
      minBalance: 100             # CRO
      targetBalance: 500          # CRO
      alertThreshold: 200         # CRO
    ar:
      minBalance: 0.1             # AR
      targetBalance: 1.0          # AR
      alertThreshold: 0.3         # AR
  autoSwap:
    enabled: ${TREASURY_AUTO_SWAP:true}
    dexRouter: ${TREASURY_DEX_ROUTER}
    slippageTolerance: 0.02       # 2%
    maxSwapAmount: 100            # USD

network:
  http:
    port: ${PORT:8080}
    host: ${HOST:0.0.0.0}
    cors:
      enabled: true
      origins:
        - '*'
    rateLimit:
      enabled: true
      windowMs: 60000             # 1 minute
      max: 1000                   # 1000 requests per minute
  websocket:
    port: ${WEBSOCKET_PORT:8080}
    maxConnections: ${MAX_CONNECTIONS:10000}
    pingInterval: 30000           # 30 seconds
    pongTimeout: 5000             # 5 seconds
    maxPayloadSize: 524288        # 512KB
  https:
    enabled: ${HTTPS_ENABLED:false}
    port: ${HTTPS_PORT:8443}
    certPath: ${SSL_CERT_PATH}
    keyPath: ${SSL_KEY_PATH}
    forceHttps: false
  domain: ${DOMAIN}

security:
  keys:
    storageBackend: ${KEY_STORAGE_BACKEND:environment}
    encryptionKey: ${KEY_ENCRYPTION_KEY}
    vaultUrl: ${VAULT_URL}
    kmsKeyId: ${KMS_KEY_ID}
    rotationEnabled: false
    rotationIntervalDays: 90
  encryption:
    algorithm: aes-256-gcm
    keyDerivation:
      algorithm: pbkdf2
      iterations: 100000
      keyLength: 32
  contentSecurityPolicy:
    directives:
      defaultSrc:
        - "'self'"
      scriptSrc:
        - "'self'"
        - "'unsafe-inline'"
      styleSrc:
        - "'self'"
        - "'unsafe-inline'"
      imgSrc:
        - "'self'"
        - data:
        - https:
      connectSrc:
        - "'self'"
        - wss:

features:
  experimentalILP: ${FEATURE_EXPERIMENTAL_ILP:false}
  arweaveBackup: ${FEATURE_ARWEAVE_BACKUP:true}
  autonomousReproduction: ${FEATURE_AUTONOMOUS_REPRODUCTION:false}
  adaptivePricing: ${FEATURE_ADAPTIVE_PRICING:false}
  geoRouting: ${FEATURE_GEO_ROUTING:false}
  p2pMesh: ${FEATURE_P2P_MESH:false}
```

---

## Secrets Management

### Option 1: Environment Variables (Development)

```bash
# .env file (DO NOT COMMIT)

# Agent keys
AGENT_ID=agent_a1b2c3d4e5f6
AGENT_PRIVATE_KEY=abc123...

# Akash keys
AKASH_ACCOUNT_ADDRESS=akash1xyz...
AKASH_PRIVATE_KEY=def456...

# Payment keys
CHANNEL_PRIVATE_KEY=789abc...

# Database
POSTGRES_PASSWORD=secure_db_password

# Redis
REDIS_PASSWORD=secure_redis_password

# Monitoring
GRAFANA_CLOUD_API_KEY=glc_xxx
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

### Option 2: Encrypted File (Production)

```bash
# Encrypt keys file
node scripts/encrypt-keys.js \
  --input secrets/keys.json \
  --output secrets/keys.enc \
  --key-env KEY_ENCRYPTION_KEY

# keys.json format:
{
  "AGENT_PRIVATE_KEY": "abc123...",
  "AKASH_PRIVATE_KEY": "def456...",
  "CHANNEL_PRIVATE_KEY": "789abc...",
  "POSTGRES_PASSWORD": "secure_db_password",
  "REDIS_PASSWORD": "secure_redis_password"
}

# Set encryption key in environment
export KEY_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Application will decrypt on startup
```

### Option 3: HashiCorp Vault (Enterprise)

```bash
# Store keys in Vault
vault kv put secret/agents/agent_a1b2c3d4e5f6/keys \
  AGENT_PRIVATE_KEY=abc123... \
  AKASH_PRIVATE_KEY=def456... \
  CHANNEL_PRIVATE_KEY=789abc... \
  POSTGRES_PASSWORD=secure_db_password \
  REDIS_PASSWORD=secure_redis_password

# Configure Vault access
export VAULT_URL=https://vault.example.com
export VAULT_TOKEN=s.xxx

# Application will fetch from Vault on startup
```

### Option 4: Cloud KMS (AWS/GCP/Azure)

```bash
# Encrypt keys with KMS
aws kms encrypt \
  --key-id alias/agent-keys \
  --plaintext fileb://secrets/agent-keys.json \
  --output text \
  --query CiphertextBlob > secrets/agent-keys.enc

# Store encrypted keys in environment
export AGENT_PRIVATE_KEY_ENCRYPTED=$(cat secrets/agent-private-key.enc)

# Application will decrypt with KMS on startup
```

---

## Configuration Validation

### Zod Schema

```typescript
// packages/agent-relay/src/config/validation.ts

import { z } from 'zod';

const AgentIdentitySchema = z.object({
  id: z.string().regex(/^agent_[a-f0-9]{16,}$/),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  privateKey: z.string().regex(/^[a-f0-9]{64}$/),
  publicKey: z.string().optional(),
  npub: z.string().optional()
});

const AkashConfigSchema = z.object({
  accountAddress: z.string().startsWith('akash1'),
  privateKey: z.string().regex(/^[a-f0-9]{64}$/),
  chainId: z.string(),
  nodeUrl: z.string().url(),
  gasPrice: z.string(),
  gasAdjustment: z.number().min(1).max(2),
  deployment: z.object({
    dseq: z.number().optional(),
    provider: z.string().optional(),
    leaseId: z.string().optional()
  }).optional()
});

const PaymentConfigSchema = z.object({
  enabled: z.boolean(),
  processor: z.enum(['ilp', 'lightning', 'cronos']),
  bundledPricing: z.boolean(),
  ilp: z.object({
    address: z.string().startsWith('$'),
    dassieNodeUrl: z.string().url().optional(),
    streamServerSecret: z.string().optional()
  }).optional(),
  cronos: z.object({
    rpcUrl: z.string().url(),
    chainId: z.number(),
    paymentChannelAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    channelPrivateKey: z.string().regex(/^[a-f0-9]{64}$/)
  }).optional(),
  feeSchedules: z.object({
    admission: z.object({
      enabled: z.boolean(),
      amount: z.number().min(0)
    }).optional(),
    perEvent: z.object({
      enabled: z.boolean(),
      baseAmount: z.number().min(0),
      kindMultipliers: z.record(z.number()).optional()
    }).optional(),
    subscription: z.object({
      enabled: z.boolean(),
      daily: z.number().optional(),
      monthly: z.number().optional()
    }).optional()
  })
});

const DatabaseConfigSchema = z.object({
  host: z.string(),
  port: z.number().min(1).max(65535),
  database: z.string().min(1),
  user: z.string().min(1),
  password: z.string().min(1),
  maxConnections: z.number().min(1).max(1000),
  ssl: z.boolean(),
  migrationsPath: z.string(),
  seedPath: z.string().optional()
});

const RedisConfigSchema = z.object({
  host: z.string(),
  port: z.number().min(1).max(65535),
  password: z.string().optional(),
  db: z.number().min(0).max(15),
  maxMemory: z.string().regex(/^\d+[kmg]b$/i),
  evictionPolicy: z.enum([
    'noeviction',
    'allkeys-lru',
    'volatile-lru',
    'allkeys-random',
    'volatile-random',
    'volatile-ttl'
  ]),
  keyPrefix: z.string()
});

const ArweaveConfigSchema = z.object({
  enabled: z.boolean(),
  walletPath: z.string(),
  host: z.string(),
  port: z.number(),
  protocol: z.enum(['http', 'https']),
  timeout: z.number(),
  requiredKinds: z.array(z.number()),
  backup: z.object({
    enabled: z.boolean(),
    frequency: z.enum(['hourly', 'daily', 'weekly']),
    retentionDays: z.number().min(1)
  }),
  pricing: z.object({
    arPerMB: z.number().positive(),
    arToUsdRate: z.number().positive()
  })
});

const MonitoringConfigSchema = z.object({
  enabled: z.boolean(),
  metricsPort: z.number().min(1).max(65535),
  healthcheckUrl: z.string().url().optional(),
  grafana: z.object({
    enabled: z.boolean(),
    apiKey: z.string(),
    url: z.string().url()
  }).optional(),
  sentry: z.object({
    enabled: z.boolean(),
    dsn: z.string().url(),
    environment: z.string(),
    tracesSampleRate: z.number().min(0).max(1)
  }).optional(),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    format: z.enum(['json', 'text']),
    destination: z.enum(['stdout', 'file', 'both']),
    filePath: z.string().optional()
  })
});

const AlertingConfigSchema = z.object({
  enabled: z.boolean(),
  channels: z.object({
    console: z.boolean(),
    slack: z.object({
      enabled: z.boolean(),
      webhookUrl: z.string().url(),
      channel: z.string().optional(),
      username: z.string().optional()
    }).optional(),
    telegram: z.object({
      enabled: z.boolean(),
      botToken: z.string(),
      chatId: z.string()
    }).optional(),
    email: z.object({
      enabled: z.boolean(),
      smtp: z.object({
        host: z.string(),
        port: z.number(),
        secure: z.boolean(),
        auth: z.object({
          user: z.string(),
          pass: z.string()
        })
      }),
      from: z.string().email(),
      to: z.array(z.string().email())
    }).optional(),
    nostr: z.object({
      enabled: z.boolean(),
      operatorPubkey: z.string(),
      relays: z.array(z.string().url())
    }).optional()
  }),
  severityFilters: z.object({
    low: z.array(z.string()),
    medium: z.array(z.string()),
    high: z.array(z.string()),
    critical: z.array(z.string())
  })
});

const AutonomousConfigSchema = z.object({
  enabled: z.boolean(),
  selfDeployment: z.object({
    enabled: z.boolean(),
    renewalBufferHours: z.number().min(1).max(168),
    scaleUpThreshold: z.number().min(0).max(1),
    scaleDownThreshold: z.number().min(0).max(1)
  }),
  reproduction: z.object({
    enabled: z.boolean(),
    maxChildren: z.number().min(1).max(100),
    allowedTriggers: z.array(z.enum([
      'high_load',
      'geographic_demand',
      'redundancy',
      'specialization',
      'scheduled'
    ])),
    loadThreshold: z.number().min(0).max(1),
    geoDistribution: z.boolean(),
    redundancyTarget: z.number().min(1)
  }),
  providerSelection: z.object({
    priceWeight: z.number().min(0).max(1),
    uptimeWeight: z.number().min(0).max(1),
    reputationWeight: z.number().min(0).max(1),
    diversityWeight: z.number().min(0).max(1)
  }).refine(
    (data) => data.priceWeight + data.uptimeWeight + data.reputationWeight + data.diversityWeight === 1,
    { message: 'Provider selection weights must sum to 1.0' }
  ),
  healthMonitoring: z.object({
    intervalSeconds: z.number().min(10).max(3600),
    timeoutSeconds: z.number().min(1).max(60),
    failureThreshold: z.number().min(1).max(10)
  }),
  parentAgentId: z.string().optional()
});

const TreasuryConfigSchema = z.object({
  enabled: z.boolean(),
  balances: z.object({
    akt: z.object({
      minBalance: z.number().positive(),
      targetBalance: z.number().positive(),
      alertThreshold: z.number().positive()
    }),
    cro: z.object({
      minBalance: z.number().positive(),
      targetBalance: z.number().positive(),
      alertThreshold: z.number().positive()
    }),
    ar: z.object({
      minBalance: z.number().positive(),
      targetBalance: z.number().positive(),
      alertThreshold: z.number().positive()
    })
  }),
  autoSwap: z.object({
    enabled: z.boolean(),
    dexRouter: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    slippageTolerance: z.number().min(0).max(0.1),
    maxSwapAmount: z.number().positive()
  })
});

const NetworkConfigSchema = z.object({
  http: z.object({
    port: z.number().min(1).max(65535),
    host: z.string(),
    cors: z.object({
      enabled: z.boolean(),
      origins: z.array(z.string())
    }),
    rateLimit: z.object({
      enabled: z.boolean(),
      windowMs: z.number(),
      max: z.number()
    })
  }),
  websocket: z.object({
    port: z.number().min(1).max(65535),
    maxConnections: z.number().min(1),
    pingInterval: z.number().min(1000),
    pongTimeout: z.number().min(1000),
    maxPayloadSize: z.number().min(1024)
  }),
  https: z.object({
    enabled: z.boolean(),
    port: z.number().min(1).max(65535).optional(),
    certPath: z.string().optional(),
    keyPath: z.string().optional(),
    forceHttps: z.boolean().optional()
  }),
  domain: z.string().optional()
});

const SecurityConfigSchema = z.object({
  keys: z.object({
    storageBackend: z.enum(['environment', 'file', 'vault', 'kms']),
    encryptionKey: z.string().optional(),
    vaultUrl: z.string().url().optional(),
    kmsKeyId: z.string().optional(),
    rotationEnabled: z.boolean(),
    rotationIntervalDays: z.number().min(1).max(365)
  }),
  encryption: z.object({
    algorithm: z.string(),
    keyDerivation: z.object({
      algorithm: z.string(),
      iterations: z.number().min(10000),
      keyLength: z.number().min(16).max(64)
    })
  }),
  contentSecurityPolicy: z.object({
    directives: z.record(z.array(z.string()))
  }).optional()
});

const FeatureFlagsSchema = z.object({
  experimentalILP: z.boolean(),
  arweaveBackup: z.boolean(),
  autonomousReproduction: z.boolean(),
  adaptivePricing: z.boolean(),
  geoRouting: z.boolean(),
  p2pMesh: z.boolean()
});

const RelayConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  pubkey: z.string(),
  supportedNips: z.array(z.number()),
  limitations: z.object({
    maxMessageLength: z.number().optional(),
    maxSubscriptions: z.number().optional(),
    maxFilters: z.number().optional(),
    maxSubidLength: z.number().optional(),
    maxLimit: z.number().optional(),
    minPowDifficulty: z.number().optional(),
    authRequired: z.boolean().optional(),
    paymentRequired: z.boolean().optional()
  }).optional(),
  retention: z.object({
    kinds: z.record(z.number()).optional(),
    time: z.number().optional()
  }).optional()
});

export const AgentConfigSchema = z.object({
  agent: AgentIdentitySchema,
  akash: AkashConfigSchema,
  relay: RelayConfigSchema,
  payments: PaymentConfigSchema,
  database: DatabaseConfigSchema,
  redis: RedisConfigSchema,
  arweave: ArweaveConfigSchema,
  monitoring: MonitoringConfigSchema,
  alerting: AlertingConfigSchema,
  autonomous: AutonomousConfigSchema,
  treasury: TreasuryConfigSchema,
  network: NetworkConfigSchema,
  security: SecurityConfigSchema,
  features: FeatureFlagsSchema
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Validate configuration and throw errors if invalid
 */
export function validateConfig(config: unknown): AgentConfig {
  try {
    return AgentConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    throw new Error('Invalid configuration');
  }
}
```

### Validation CLI

```bash
# Validate configuration
node scripts/validate-config.js --config config/production.yaml

# Output on success:
# ✓ Configuration is valid

# Output on failure:
# ✗ Configuration validation failed:
#   - agent.id: Invalid format (must match ^agent_[a-f0-9]{16,}$)
#   - akash.gasAdjustment: Number must be greater than or equal to 1
#   - autonomous.providerSelection: Weights must sum to 1.0
```

---

## Default Values

All default values with justification:

| Section | Key | Default | Justification |
|---------|-----|---------|---------------|
| **Relay** | maxMessageLength | 524288 (512KB) | NIP-01 recommendation |
| | maxSubscriptions | 20 | Prevent resource exhaustion |
| | maxLimit | 5000 | Balance performance and usefulness |
| | paymentRequired | true | Core feature of paid relay |
| | retention.time | 7776000 (90 days) | Balance storage cost and utility |
| **Autonomous** | renewalBufferHours | 24 | Allow time for recovery if renewal fails |
| | scaleUpThreshold | 0.8 (80%) | Scale before hitting limits |
| | scaleDownThreshold | 0.3 (30%) | Avoid frequent scaling oscillation |
| | maxChildren | 5 | Prevent exponential growth |
| | loadThreshold | 0.8 (80%) | Trigger reproduction at high load |
| | redundancyTarget | 3 | Fault tolerance with 2 failures |
| **Provider Selection** | priceWeight | 0.4 (40%) | Price is primary concern |
| | uptimeWeight | 0.3 (30%) | Reliability is critical |
| | reputationWeight | 0.2 (20%) | Community trust matters |
| | diversityWeight | 0.1 (10%) | Avoid single point of failure |
| **Health Monitoring** | intervalSeconds | 30 | Frequent enough to detect issues quickly |
| | timeoutSeconds | 10 | Allow for network latency |
| | failureThreshold | 3 | Avoid false positives |
| **Treasury** | akt.minBalance | 10 AKT | ~7 days at $5/day |
| | akt.targetBalance | 50 AKT | ~30 days buffer |
| | autoSwap.slippageTolerance | 0.02 (2%) | Balance execution and price impact |
| **Network** | http.port | 8080 | Standard non-privileged port |
| | websocket.maxConnections | 10000 | Reasonable limit for 4 CPU / 8GB RAM |
| | websocket.pingInterval | 30000 (30s) | Keep connections alive |
| | websocket.maxPayloadSize | 524288 (512KB) | Match maxMessageLength |
| **Security** | rotationIntervalDays | 90 | Quarterly rotation |
| | encryption.algorithm | aes-256-gcm | Industry standard |
| | keyDerivation.iterations | 100000 | OWASP recommendation for PBKDF2 |
| **Logging** | level | info | Balance verbosity and noise |
| | format | json | Machine-readable for aggregation |
| **Arweave** | backup.frequency | daily | Balance cost and data safety |
| | backup.retentionDays | 90 | Match default event retention |

---

## Configuration Examples

### Development Environment

```yaml
# config/development.yaml

agent:
  name: Dev Agent Relay
  description: Development instance

akash:
  chainId: testnet-02
  nodeUrl: https://rpc.testnet.akash.network:443

monitoring:
  logging:
    level: debug
    format: text

autonomous:
  enabled: false
  reproduction:
    enabled: false

treasury:
  autoSwap:
    enabled: false

features:
  experimentalILP: true
  arweaveBackup: false
```

### Staging Environment

```yaml
# config/staging.yaml

agent:
  name: Staging Agent Relay
  description: Staging instance for testing

akash:
  chainId: akashnet-2
  nodeUrl: https://rpc.akash.network:443

monitoring:
  logging:
    level: info
    format: json
  grafana:
    enabled: true
  sentry:
    enabled: true
    environment: staging

autonomous:
  enabled: true
  selfDeployment:
    enabled: true
  reproduction:
    enabled: false

treasury:
  autoSwap:
    enabled: true

features:
  arweaveBackup: true
  autonomousReproduction: false
```

### Production Environment

```yaml
# config/production.yaml

agent:
  name: Production Agent Relay
  description: Autonomous production relay

akash:
  chainId: akashnet-2
  nodeUrl: https://rpc.akash.network:443

relay:
  limitations:
    paymentRequired: true
    authRequired: false

monitoring:
  enabled: true
  logging:
    level: info
    format: json
    destination: both
  grafana:
    enabled: true
  sentry:
    enabled: true
    environment: production
    tracesSampleRate: 0.1

alerting:
  enabled: true
  channels:
    console: true
    slack:
      enabled: true
    telegram:
      enabled: true
    email:
      enabled: true
    nostr:
      enabled: true

autonomous:
  enabled: true
  selfDeployment:
    enabled: true
  reproduction:
    enabled: true
    maxChildren: 5

treasury:
  enabled: true
  autoSwap:
    enabled: true

security:
  keys:
    storageBackend: vault
    rotationEnabled: true
    rotationIntervalDays: 90

features:
  arweaveBackup: true
  autonomousReproduction: true
  adaptivePricing: false
```

---

## Hot Reload Support

### Configuration Watcher

```typescript
// packages/agent-relay/src/config/watcher.ts

import { watch } from 'fs';
import { EventEmitter } from 'events';

export class ConfigurationWatcher extends EventEmitter {
  private configPath: string;
  private currentConfig: AgentConfig;
  private watcher: FSWatcher | null = null;

  constructor(configPath: string) {
    super();
    this.configPath = configPath;
    this.currentConfig = loadConfig();
  }

  /**
   * Start watching configuration file for changes
   */
  start(): void {
    this.watcher = watch(this.configPath, (eventType) => {
      if (eventType === 'change') {
        this.handleConfigChange();
      }
    });

    console.log(`Watching configuration: ${this.configPath}`);
  }

  /**
   * Stop watching configuration file
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Handle configuration file change
   */
  private async handleConfigChange(): Promise<void> {
    try {
      // Load new configuration
      const newConfig = loadConfig();

      // Validate new configuration
      validateConfig(newConfig);

      // Calculate diff
      const changes = this.diffConfig(this.currentConfig, newConfig);

      if (changes.length === 0) {
        console.log('Configuration file changed but no effective changes detected');
        return;
      }

      // Check if changes are hot-reloadable
      const nonReloadable = changes.filter(c => !this.isHotReloadable(c.path));

      if (nonReloadable.length > 0) {
        console.warn('Some configuration changes require restart:');
        nonReloadable.forEach(c => console.warn(`  - ${c.path}`));
        this.emit('restart-required', nonReloadable);
        return;
      }

      // Apply hot-reloadable changes
      this.currentConfig = newConfig;
      this.emit('config-updated', changes);

      console.log('Configuration hot-reloaded successfully');
      changes.forEach(c => {
        console.log(`  ${c.path}: ${c.oldValue} -> ${c.newValue}`);
      });

    } catch (error) {
      console.error('Failed to reload configuration:', error);
      this.emit('reload-error', error);
    }
  }

  /**
   * Calculate diff between configurations
   */
  private diffConfig(oldConfig: any, newConfig: any, path: string = ''): ConfigChange[] {
    const changes: ConfigChange[] = [];

    for (const key in newConfig) {
      const fullPath = path ? `${path}.${key}` : key;
      const oldValue = oldConfig[key];
      const newValue = newConfig[key];

      if (typeof newValue === 'object' && newValue !== null && !Array.isArray(newValue)) {
        // Recurse into nested objects
        changes.push(...this.diffConfig(oldValue || {}, newValue, fullPath));
      } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          path: fullPath,
          oldValue,
          newValue
        });
      }
    }

    return changes;
  }

  /**
   * Check if configuration path can be hot-reloaded
   */
  private isHotReloadable(path: string): boolean {
    // Non-reloadable paths (require restart)
    const nonReloadable = [
      'agent.id',
      'agent.privateKey',
      'akash.accountAddress',
      'akash.privateKey',
      'database.host',
      'database.port',
      'database.database',
      'redis.host',
      'redis.port',
      'network.http.port',
      'network.websocket.port',
      'security.keys.storageBackend'
    ];

    return !nonReloadable.some(p => path.startsWith(p));
  }
}

interface ConfigChange {
  path: string;
  oldValue: any;
  newValue: any;
}

// Usage
const watcher = new ConfigurationWatcher('config/production.yaml');

watcher.on('config-updated', (changes) => {
  // Apply changes to running application
  applyConfigChanges(changes);
});

watcher.on('restart-required', (changes) => {
  // Alert operator that restart is needed
  sendAlert({
    title: 'Configuration Restart Required',
    severity: 'medium',
    message: `The following configuration changes require a restart: ${changes.map(c => c.path).join(', ')}`
  });
});

watcher.on('reload-error', (error) => {
  // Alert operator of reload failure
  sendAlert({
    title: 'Configuration Reload Failed',
    severity: 'high',
    message: error.message
  });
});

watcher.start();
```

---

## Configuration Migration

### Version History

```typescript
export const CONFIG_VERSIONS = {
  '1.0.0': {
    released: '2025-01-01',
    changes: [
      'Initial configuration schema'
    ]
  },
  '1.1.0': {
    released: '2025-02-01',
    changes: [
      'Added autonomous.reproduction.allowedTriggers',
      'Added treasury.autoSwap.maxSwapAmount',
      'Renamed payments.ilp.serverUrl to dassieNodeUrl'
    ],
    migrations: [
      {
        path: 'payments.ilp.serverUrl',
        action: 'rename',
        newPath: 'payments.ilp.dassieNodeUrl'
      }
    ]
  },
  '1.2.0': {
    released: '2025-03-01',
    changes: [
      'Added features.adaptivePricing',
      'Added features.geoRouting',
      'Removed deprecated relay.requireAuth (use relay.limitations.authRequired)'
    ],
    migrations: [
      {
        path: 'relay.requireAuth',
        action: 'move',
        newPath: 'relay.limitations.authRequired'
      }
    ]
  }
};
```

### Migration Tool

```typescript
// scripts/migrate-config.ts

import { readFileSync, writeFileSync } from 'fs';
import { load, dump } from 'js-yaml';

interface Migration {
  path: string;
  action: 'rename' | 'move' | 'delete' | 'transform';
  newPath?: string;
  transform?: (value: any) => any;
}

export function migrateConfig(
  configPath: string,
  fromVersion: string,
  toVersion: string
): void {
  console.log(`Migrating configuration from ${fromVersion} to ${toVersion}...`);

  // Load configuration
  const config = load(readFileSync(configPath, 'utf8')) as any;

  // Get migrations to apply
  const migrations = getMigrationsBetween(fromVersion, toVersion);

  console.log(`Applying ${migrations.length} migrations...`);

  // Apply each migration
  for (const migration of migrations) {
    applyMigration(config, migration);
  }

  // Write updated configuration
  writeFileSync(configPath, dump(config));

  console.log('✓ Configuration migrated successfully');
}

function getMigrationsBetween(from: string, to: string): Migration[] {
  const migrations: Migration[] = [];

  // Iterate through versions between from and to
  for (const version in CONFIG_VERSIONS) {
    if (version > from && version <= to) {
      const versionInfo = CONFIG_VERSIONS[version];
      if (versionInfo.migrations) {
        migrations.push(...versionInfo.migrations);
      }
    }
  }

  return migrations;
}

function applyMigration(config: any, migration: Migration): void {
  const { path, action, newPath, transform } = migration;

  console.log(`  Migrating ${path} (${action})`);

  const value = getValueAtPath(config, path);

  if (value === undefined) {
    console.log(`    Skipped (path does not exist)`);
    return;
  }

  switch (action) {
    case 'rename':
    case 'move':
      if (!newPath) throw new Error('newPath required for rename/move');
      setValueAtPath(config, newPath, value);
      deleteValueAtPath(config, path);
      break;

    case 'delete':
      deleteValueAtPath(config, path);
      break;

    case 'transform':
      if (!transform) throw new Error('transform function required for transform action');
      const newValue = transform(value);
      setValueAtPath(config, path, newValue);
      break;
  }
}

function getValueAtPath(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function setValueAtPath(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

function deleteValueAtPath(obj: any, path: string): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => current?.[key], obj);
  if (target) {
    delete target[lastKey];
  }
}

// CLI usage
if (require.main === module) {
  const [,, configPath, fromVersion, toVersion] = process.argv;

  if (!configPath || !fromVersion || !toVersion) {
    console.error('Usage: migrate-config.ts <config-path> <from-version> <to-version>');
    process.exit(1);
  }

  migrateConfig(configPath, fromVersion, toVersion);
}
```

**Usage:**
```bash
# Migrate configuration from 1.0.0 to 1.2.0
node scripts/migrate-config.ts config/production.yaml 1.0.0 1.2.0

# Output:
# Migrating configuration from 1.0.0 to 1.2.0...
# Applying 2 migrations...
#   Migrating payments.ilp.serverUrl (rename)
#   Migrating relay.requireAuth (move)
# ✓ Configuration migrated successfully
```

---

## Summary

This configuration schema provides:

1. **Complete YAML Configuration** - All settings for autonomous agent operation
2. **Environment Variables** - 50+ variables for runtime configuration
3. **Secrets Management** - Multiple backend options (env, file, vault, KMS)
4. **Validation** - Comprehensive Zod schema with type safety
5. **Default Values** - Sensible defaults with justification
6. **Configuration Examples** - Development, staging, production
7. **Hot Reload** - Live configuration updates without restart
8. **Migration Tools** - Version-aware configuration migration

**Key Features:**

- Type-safe configuration with TypeScript and Zod
- Multiple environment support (dev, staging, prod)
- Secure secrets management with multiple backends
- Validation prevents invalid configurations
- Hot reload for most configuration changes
- Version-controlled migration for upgrades

**Next Steps:**

1. Implement configuration loader with environment variable support
2. Add Zod validation to CI/CD pipeline
3. Set up Vault or KMS for production secrets
4. Create configuration templates for different deployment scenarios
5. Document all configuration options in relay UI
6. Add configuration export/import for backup
7. Implement configuration audit logging

---

*Document Status: Complete*
*Last Updated: 2025-12-05*
*Author: Claude (Configuration Schema)*
