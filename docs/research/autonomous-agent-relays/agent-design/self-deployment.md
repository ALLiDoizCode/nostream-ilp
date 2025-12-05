# Autonomous Agent Self-Deployment on Akash Network

## Executive Summary

This document defines the complete self-deployment system for autonomous Nostr-ILP relay agents on Akash Network. Agents must be capable of deploying themselves, managing their compute resources, selecting providers, handling failures, and reproducing to create new agent instances.

**Key Capabilities:**
- Dynamic SDL generation based on traffic patterns
- Autonomous provider selection and lease management
- Secure key management with rotation support
- Graceful failure handling and migration
- Self-reproduction for network growth
- Integration with treasury for AKT payments

---

## Table of Contents

1. [SDL Template and Dynamic Generation](#sdl-template-and-dynamic-generation)
2. [Lease Lifecycle State Machine](#lease-lifecycle-state-machine)
3. [Provider Selection Algorithm](#provider-selection-algorithm)
4. [Key Management Strategy](#key-management-strategy)
5. [Failure Handling Procedures](#failure-handling-procedures)
6. [Bootstrap Process](#bootstrap-process)
7. [Agent Reproduction Model](#agent-reproduction-model)
8. [Treasury Integration](#treasury-integration)
9. [Monitoring and Alerts](#monitoring-and-alerts)
10. [Code Examples](#code-examples)

---

## SDL Template and Dynamic Generation

### Base SDL Template

```yaml
---
version: "2.0"

services:
  agent-relay:
    image: ghcr.io/your-org/autonomous-agent-relay:latest
    env:
      # Agent Identity
      - AGENT_ID=${AGENT_ID}
      - AGENT_PRIVATE_KEY=${AGENT_PRIVATE_KEY}

      # Akash Configuration
      - AKASH_ACCOUNT_ADDRESS=${AKASH_ACCOUNT_ADDRESS}
      - AKASH_CHAIN_ID=akashnet-2
      - AKASH_NODE=https://rpc.akash.network:443

      # Relay Configuration
      - RELAY_NAME=${RELAY_NAME}
      - RELAY_DESCRIPTION=${RELAY_DESCRIPTION}
      - RELAY_PUBKEY=${RELAY_PUBKEY}

      # Payment Configuration
      - CRONOS_RPC_URL=${CRONOS_RPC_URL}
      - PAYMENT_CHANNEL_ADDRESS=${PAYMENT_CHANNEL_ADDRESS}
      - CHANNEL_PRIVATE_KEY=${CHANNEL_PRIVATE_KEY}

      # Database
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_DB=nostream
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

      # Redis
      - REDIS_HOST=redis
      - REDIS_PORT=6379

      # ILP Configuration
      - ILP_ADDRESS=${ILP_ADDRESS}
      - DASSIE_NODE_URL=${DASSIE_NODE_URL}

      # Arweave Configuration
      - ARWEAVE_WALLET_PATH=/secrets/arweave-wallet.json
      - ARWEAVE_ENABLED=true

      # Monitoring
      - GRAFANA_CLOUD_API_KEY=${GRAFANA_CLOUD_API_KEY}
      - HEALTHCHECK_URL=${HEALTHCHECK_URL}

      # Autonomous Features
      - AUTONOMOUS_MODE=true
      - SELF_DEPLOYMENT_ENABLED=true
      - REPRODUCTION_ENABLED=${REPRODUCTION_ENABLED:-false}
      - PARENT_AGENT_ID=${PARENT_AGENT_ID:-none}

    expose:
      - port: 8080
        as: 80
        to:
          - global: true
      - port: 8443
        as: 443
        to:
          - global: true
        accept:
          - relay.yourdomain.com
      - port: 7946
        as: 7946
        proto: udp
        to:
          - global: true

    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:14-alpine
    env:
      - POSTGRES_DB=nostream
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_MAX_CONNECTIONS=200
    expose:
      - port: 5432
        to:
          - service: agent-relay

  redis:
    image: redis:7-alpine
    env:
      - REDIS_MAXMEMORY=2gb
      - REDIS_MAXMEMORY_POLICY=allkeys-lru
    expose:
      - port: 6379
        to:
          - service: agent-relay

profiles:
  compute:
    agent-relay:
      resources:
        cpu:
          units: ${CPU_UNITS}
        memory:
          size: ${MEMORY_SIZE}
        storage:
          - size: ${STORAGE_SIZE}
          - size: 10Gi
            attributes:
              persistent: true
              class: beta3

    postgres:
      resources:
        cpu:
          units: 1
        memory:
          size: 2Gi
        storage:
          - size: 50Gi
            attributes:
              persistent: true
              class: beta3

    redis:
      resources:
        cpu:
          units: 0.5
        memory:
          size: 2Gi
        storage:
          - size: 5Gi

  placement:
    dcloud:
      pricing:
        agent-relay:
          denom: uakt
          amount: ${MAX_PRICE_PER_BLOCK}
        postgres:
          denom: uakt
          amount: 1000
        redis:
          denom: uakt
          amount: 500

deployment:
  agent-relay:
    dcloud:
      profile: agent-relay
      count: 1

  postgres:
    dcloud:
      profile: postgres
      count: 1

  redis:
    dcloud:
      profile: redis
      count: 1
```

### Dynamic SDL Generation

```typescript
// packages/agent-deployment/src/sdl-generator.ts

import { stringify } from 'yaml';

export interface ResourceRequirements {
  cpuUnits: number;        // 0.5 - 8.0 (in CPU cores)
  memorySize: string;      // "4Gi", "8Gi", "16Gi"
  storageSize: string;     // "100Gi", "200Gi", "500Gi"
  maxPricePerBlock: number; // uAKT per block (~6s)
}

export interface TrafficMetrics {
  eventsPerSecond: number;
  activeConnections: number;
  cacheSize: number; // bytes
  storageUsed: number; // bytes
}

export class SDLGenerator {
  /**
   * Generate SDL based on current traffic patterns and cost constraints
   */
  generateSDL(
    agentConfig: AgentConfig,
    metrics: TrafficMetrics,
    targetCostPerDay: number = 5.0 // USD
  ): string {
    const resources = this.calculateResources(metrics, targetCostPerDay);

    const template = {
      version: "2.0",
      services: this.generateServices(agentConfig, resources),
      profiles: this.generateProfiles(resources),
      deployment: this.generateDeployment()
    };

    return stringify(template);
  }

  /**
   * Calculate optimal resource allocation based on traffic
   */
  private calculateResources(
    metrics: TrafficMetrics,
    targetCostPerDay: number
  ): ResourceRequirements {
    // CPU calculation: 1 core per 100 events/sec baseline
    const cpuUnits = Math.max(
      2.0,
      Math.min(8.0, Math.ceil(metrics.eventsPerSecond / 100))
    );

    // Memory calculation: 4GB base + 1GB per 10k active connections
    const memoryGB = Math.max(
      4,
      Math.min(16, 4 + Math.ceil(metrics.activeConnections / 10000))
    );
    const memorySize = `${memoryGB}Gi`;

    // Storage calculation: 100GB base + actual usage + 50% headroom
    const storageGB = Math.max(
      100,
      Math.min(500, Math.ceil((metrics.storageUsed / 1024 / 1024 / 1024) * 1.5))
    );
    const storageSize = `${storageGB}Gi`;

    // Price calculation
    // Target: $5/day = ~1500 uAKT/block (assuming 1 AKT = $0.50, 14400 blocks/day)
    // Formula: (targetUSD / aktPrice) * 1000000 / blocksPerDay
    const aktPriceUSD = 0.50; // Update from oracle
    const blocksPerDay = 14400; // ~6 second blocks
    const maxPricePerBlock = Math.ceil(
      (targetCostPerDay / aktPriceUSD) * 1000000 / blocksPerDay
    );

    return {
      cpuUnits,
      memorySize,
      storageSize,
      maxPricePerBlock
    };
  }

  /**
   * Generate service definitions with environment variables
   */
  private generateServices(
    config: AgentConfig,
    resources: ResourceRequirements
  ): any {
    return {
      "agent-relay": {
        image: config.dockerImage || "ghcr.io/your-org/autonomous-agent-relay:latest",
        env: [
          `AGENT_ID=${config.agentId}`,
          `AGENT_PRIVATE_KEY=\${AGENT_PRIVATE_KEY}`, // From secrets
          `AKASH_ACCOUNT_ADDRESS=${config.akashAddress}`,
          `RELAY_NAME=${config.relayName}`,
          `RELAY_PUBKEY=${config.relayPubkey}`,
          `POSTGRES_USER=\${POSTGRES_USER}`,
          `POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}`,
          `AUTONOMOUS_MODE=true`,
          `CPU_ALLOCATION=${resources.cpuUnits}`,
          `MEMORY_ALLOCATION=${resources.memorySize}`,
          // ... all other environment variables
        ],
        expose: [
          { port: 8080, as: 80, to: [{ global: true }] },
          { port: 8443, as: 443, to: [{ global: true }], accept: [config.domain] },
          { port: 7946, as: 7946, proto: "udp", to: [{ global: true }] }
        ],
        depends_on: ["postgres", "redis"]
      },
      postgres: this.generatePostgresService(),
      redis: this.generateRedisService()
    };
  }

  /**
   * Generate compute and placement profiles
   */
  private generateProfiles(resources: ResourceRequirements): any {
    return {
      compute: {
        "agent-relay": {
          resources: {
            cpu: { units: resources.cpuUnits },
            memory: { size: resources.memorySize },
            storage: [
              { size: resources.storageSize },
              {
                size: "10Gi",
                attributes: {
                  persistent: true,
                  class: "beta3"
                }
              }
            ]
          }
        },
        postgres: {
          resources: {
            cpu: { units: 1 },
            memory: { size: "2Gi" },
            storage: [
              {
                size: "50Gi",
                attributes: {
                  persistent: true,
                  class: "beta3"
                }
              }
            ]
          }
        },
        redis: {
          resources: {
            cpu: { units: 0.5 },
            memory: { size: "2Gi" },
            storage: [{ size: "5Gi" }]
          }
        }
      },
      placement: {
        dcloud: {
          pricing: {
            "agent-relay": {
              denom: "uakt",
              amount: resources.maxPricePerBlock
            },
            postgres: {
              denom: "uakt",
              amount: 1000
            },
            redis: {
              denom: "uakt",
              amount: 500
            }
          }
        }
      }
    };
  }

  private generateDeployment(): any {
    return {
      "agent-relay": {
        dcloud: {
          profile: "agent-relay",
          count: 1
        }
      },
      postgres: {
        dcloud: {
          profile: "postgres",
          count: 1
        }
      },
      redis: {
        dcloud: {
          profile: "redis",
          count: 1
        }
      }
    };
  }

  private generatePostgresService(): any {
    return {
      image: "postgres:14-alpine",
      env: [
        "POSTGRES_DB=nostream",
        "POSTGRES_USER=${POSTGRES_USER}",
        "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}",
        "POSTGRES_MAX_CONNECTIONS=200"
      ],
      expose: [
        { port: 5432, to: [{ service: "agent-relay" }] }
      ]
    };
  }

  private generateRedisService(): any {
    return {
      image: "redis:7-alpine",
      env: [
        "REDIS_MAXMEMORY=2gb",
        "REDIS_MAXMEMORY_POLICY=allkeys-lru"
      ],
      expose: [
        { port: 6379, to: [{ service: "agent-relay" }] }
      ]
    };
  }
}

export interface AgentConfig {
  agentId: string;
  agentPrivateKey: string;
  akashAddress: string;
  relayName: string;
  relayPubkey: string;
  domain: string;
  dockerImage?: string;
}
```

---

## Lease Lifecycle State Machine

### States

```typescript
export enum LeaseState {
  // Initial states
  UNDEPLOYED = 'undeployed',           // Agent exists but not deployed
  GENERATING_SDL = 'generating_sdl',   // Creating deployment manifest

  // Bidding states
  REQUESTING_BIDS = 'requesting_bids', // Sent deployment to market
  EVALUATING_BIDS = 'evaluating_bids', // Reviewing provider bids
  ACCEPTING_BID = 'accepting_bid',     // Accepting chosen bid

  // Deployment states
  CREATING_LEASE = 'creating_lease',   // Finalizing lease contract
  DEPLOYING = 'deploying',             // Uploading manifest & starting
  STARTING = 'starting',               // Services initializing
  ACTIVE = 'active',                   // Fully operational

  // Maintenance states
  MONITORING = 'monitoring',           // Health checks active
  SCALING = 'scaling',                 // Updating resources
  RENEWING = 'renewing',              // Extending lease

  // Migration states
  MIGRATING = 'migrating',            // Moving to new provider
  DRAINING = 'draining',              // Graceful connection shutdown

  // Termination states
  TERMINATING = 'terminating',        // Closing lease
  TERMINATED = 'terminated',          // Lease closed

  // Error states
  FAILED = 'failed',                  // Deployment failed
  RECOVERY = 'recovery',              // Attempting recovery
}

export enum LeaseEvent {
  // Trigger events
  DEPLOY_REQUESTED = 'deploy_requested',
  SDL_GENERATED = 'sdl_generated',
  BIDS_RECEIVED = 'bids_received',
  BID_SELECTED = 'bid_selected',
  BID_ACCEPTED = 'bid_accepted',
  LEASE_CREATED = 'lease_created',
  DEPLOYMENT_COMPLETE = 'deployment_complete',
  SERVICES_READY = 'services_ready',

  // Monitoring events
  HEALTH_CHECK_PASSED = 'health_check_passed',
  HEALTH_CHECK_FAILED = 'health_check_failed',
  LEASE_EXPIRING_SOON = 'lease_expiring_soon',
  RESOURCES_INSUFFICIENT = 'resources_insufficient',

  // Migration events
  PROVIDER_DEGRADED = 'provider_degraded',
  MIGRATION_STARTED = 'migration_started',
  MIGRATION_COMPLETE = 'migration_complete',

  // Termination events
  SHUTDOWN_REQUESTED = 'shutdown_requested',
  LEASE_TERMINATED = 'lease_terminated',

  // Error events
  DEPLOYMENT_FAILED = 'deployment_failed',
  RECOVERY_SUCCEEDED = 'recovery_succeeded',
  RECOVERY_FAILED = 'recovery_failed',
}
```

### State Machine Implementation

```typescript
// packages/agent-deployment/src/lease-state-machine.ts

import { StateMachine, StateTransition } from '@xstate/core';

export class LeaseStateMachine {
  private state: LeaseState = LeaseState.UNDEPLOYED;
  private transitions: Map<LeaseState, Map<LeaseEvent, LeaseState>>;

  constructor() {
    this.transitions = this.buildTransitionMap();
  }

  /**
   * Define all valid state transitions
   */
  private buildTransitionMap(): Map<LeaseState, Map<LeaseEvent, LeaseState>> {
    const map = new Map<LeaseState, Map<LeaseEvent, LeaseState>>();

    // UNDEPLOYED transitions
    map.set(LeaseState.UNDEPLOYED, new Map([
      [LeaseEvent.DEPLOY_REQUESTED, LeaseState.GENERATING_SDL]
    ]));

    // GENERATING_SDL transitions
    map.set(LeaseState.GENERATING_SDL, new Map([
      [LeaseEvent.SDL_GENERATED, LeaseState.REQUESTING_BIDS],
      [LeaseEvent.DEPLOYMENT_FAILED, LeaseState.FAILED]
    ]));

    // REQUESTING_BIDS transitions
    map.set(LeaseState.REQUESTING_BIDS, new Map([
      [LeaseEvent.BIDS_RECEIVED, LeaseState.EVALUATING_BIDS],
      [LeaseEvent.DEPLOYMENT_FAILED, LeaseState.FAILED]
    ]));

    // EVALUATING_BIDS transitions
    map.set(LeaseState.EVALUATING_BIDS, new Map([
      [LeaseEvent.BID_SELECTED, LeaseState.ACCEPTING_BID],
      [LeaseEvent.DEPLOYMENT_FAILED, LeaseState.FAILED]
    ]));

    // ACCEPTING_BID transitions
    map.set(LeaseState.ACCEPTING_BID, new Map([
      [LeaseEvent.BID_ACCEPTED, LeaseState.CREATING_LEASE],
      [LeaseEvent.DEPLOYMENT_FAILED, LeaseState.FAILED]
    ]));

    // CREATING_LEASE transitions
    map.set(LeaseState.CREATING_LEASE, new Map([
      [LeaseEvent.LEASE_CREATED, LeaseState.DEPLOYING],
      [LeaseEvent.DEPLOYMENT_FAILED, LeaseState.FAILED]
    ]));

    // DEPLOYING transitions
    map.set(LeaseState.DEPLOYING, new Map([
      [LeaseEvent.DEPLOYMENT_COMPLETE, LeaseState.STARTING],
      [LeaseEvent.DEPLOYMENT_FAILED, LeaseState.FAILED]
    ]));

    // STARTING transitions
    map.set(LeaseState.STARTING, new Map([
      [LeaseEvent.SERVICES_READY, LeaseState.ACTIVE],
      [LeaseEvent.DEPLOYMENT_FAILED, LeaseState.FAILED]
    ]));

    // ACTIVE transitions
    map.set(LeaseState.ACTIVE, new Map([
      [LeaseEvent.HEALTH_CHECK_PASSED, LeaseState.MONITORING],
      [LeaseEvent.RESOURCES_INSUFFICIENT, LeaseState.SCALING],
      [LeaseEvent.LEASE_EXPIRING_SOON, LeaseState.RENEWING],
      [LeaseEvent.PROVIDER_DEGRADED, LeaseState.MIGRATING],
      [LeaseEvent.SHUTDOWN_REQUESTED, LeaseState.TERMINATING],
      [LeaseEvent.HEALTH_CHECK_FAILED, LeaseState.RECOVERY]
    ]));

    // MONITORING transitions
    map.set(LeaseState.MONITORING, new Map([
      [LeaseEvent.HEALTH_CHECK_PASSED, LeaseState.ACTIVE],
      [LeaseEvent.RESOURCES_INSUFFICIENT, LeaseState.SCALING],
      [LeaseEvent.LEASE_EXPIRING_SOON, LeaseState.RENEWING],
      [LeaseEvent.PROVIDER_DEGRADED, LeaseState.MIGRATING],
      [LeaseEvent.HEALTH_CHECK_FAILED, LeaseState.RECOVERY]
    ]));

    // SCALING transitions
    map.set(LeaseState.SCALING, new Map([
      [LeaseEvent.DEPLOYMENT_COMPLETE, LeaseState.ACTIVE],
      [LeaseEvent.DEPLOYMENT_FAILED, LeaseState.RECOVERY]
    ]));

    // RENEWING transitions
    map.set(LeaseState.RENEWING, new Map([
      [LeaseEvent.LEASE_CREATED, LeaseState.ACTIVE],
      [LeaseEvent.DEPLOYMENT_FAILED, LeaseState.MIGRATING]
    ]));

    // MIGRATING transitions
    map.set(LeaseState.MIGRATING, new Map([
      [LeaseEvent.MIGRATION_STARTED, LeaseState.DRAINING],
      [LeaseEvent.DEPLOYMENT_FAILED, LeaseState.RECOVERY]
    ]));

    // DRAINING transitions
    map.set(LeaseState.DRAINING, new Map([
      [LeaseEvent.MIGRATION_COMPLETE, LeaseState.REQUESTING_BIDS],
      [LeaseEvent.DEPLOYMENT_FAILED, LeaseState.RECOVERY]
    ]));

    // RECOVERY transitions
    map.set(LeaseState.RECOVERY, new Map([
      [LeaseEvent.RECOVERY_SUCCEEDED, LeaseState.ACTIVE],
      [LeaseEvent.RECOVERY_FAILED, LeaseState.FAILED]
    ]));

    // TERMINATING transitions
    map.set(LeaseState.TERMINATING, new Map([
      [LeaseEvent.LEASE_TERMINATED, LeaseState.TERMINATED]
    ]));

    return map;
  }

  /**
   * Transition to new state based on event
   */
  transition(event: LeaseEvent): LeaseState {
    const stateTransitions = this.transitions.get(this.state);
    if (!stateTransitions) {
      throw new Error(`No transitions defined for state: ${this.state}`);
    }

    const nextState = stateTransitions.get(event);
    if (!nextState) {
      throw new Error(
        `Invalid transition: ${event} from state ${this.state}`
      );
    }

    const previousState = this.state;
    this.state = nextState;

    console.log(`State transition: ${previousState} -> ${this.state} (event: ${event})`);

    return this.state;
  }

  /**
   * Get current state
   */
  getState(): LeaseState {
    return this.state;
  }

  /**
   * Check if state is terminal
   */
  isTerminal(): boolean {
    return this.state === LeaseState.TERMINATED || this.state === LeaseState.FAILED;
  }

  /**
   * Check if state requires action
   */
  requiresAction(): boolean {
    return [
      LeaseState.GENERATING_SDL,
      LeaseState.REQUESTING_BIDS,
      LeaseState.EVALUATING_BIDS,
      LeaseState.ACCEPTING_BID,
      LeaseState.SCALING,
      LeaseState.RENEWING,
      LeaseState.MIGRATING,
      LeaseState.RECOVERY
    ].includes(this.state);
  }
}
```

### State Machine Diagram

```
┌─────────────┐
│ UNDEPLOYED  │
└──────┬──────┘
       │ deploy_requested
       ▼
┌──────────────────┐
│ GENERATING_SDL   │
└──────┬───────────┘
       │ sdl_generated
       ▼
┌──────────────────┐
│ REQUESTING_BIDS  │
└──────┬───────────┘
       │ bids_received
       ▼
┌──────────────────┐
│ EVALUATING_BIDS  │
└──────┬───────────┘
       │ bid_selected
       ▼
┌──────────────────┐
│ ACCEPTING_BID    │
└──────┬───────────┘
       │ bid_accepted
       ▼
┌──────────────────┐
│ CREATING_LEASE   │
└──────┬───────────┘
       │ lease_created
       ▼
┌──────────────────┐
│   DEPLOYING      │
└──────┬───────────┘
       │ deployment_complete
       ▼
┌──────────────────┐
│   STARTING       │
└──────┬───────────┘
       │ services_ready
       ▼
┌──────────────────┐     resources_insufficient
│     ACTIVE       │◄───────────┐
└──────┬───────────┘            │
       │                        │
       │ health_check_passed    │
       ▼                        │
┌──────────────────┐            │
│   MONITORING     │            │
└──────┬───────────┘            │
       │                        │
       │ resources_insufficient │
       ▼                        │
┌──────────────────┐            │
│    SCALING       │────────────┘
└──────┬───────────┘ deployment_complete
       │
       │ lease_expiring_soon
       ▼
┌──────────────────┐
│    RENEWING      │──────┐
└──────┬───────────┘      │ deployment_failed
       │ lease_created    │
       └──────────────────┤
                          ▼
       ┌──────────────────────┐
       │     MIGRATING        │
       └──────┬───────────────┘
              │ migration_started
              ▼
       ┌──────────────────┐
       │    DRAINING      │
       └──────┬───────────┘
              │ migration_complete
              └───────► (back to REQUESTING_BIDS)

┌──────────────────┐
│    RECOVERY      │ ◄─── (from any error)
└──────┬───────────┘
       │ recovery_succeeded
       └───────► ACTIVE
       │ recovery_failed
       └───────► FAILED

┌──────────────────┐
│  TERMINATING     │
└──────┬───────────┘
       │ lease_terminated
       ▼
┌──────────────────┐
│   TERMINATED     │
└──────────────────┘
```

---

## Provider Selection Algorithm

### Selection Criteria

```typescript
export interface ProviderBid {
  provider: string;           // Provider address
  price: number;              // uAKT per block
  attributes: ProviderAttributes;
  reputation: ProviderReputation;
}

export interface ProviderAttributes {
  region: string;             // "us-west", "eu-central", "ap-southeast"
  tier: string;               // "community", "professional", "enterprise"
  uptime: number;             // Percentage (0-100)
  capabilities: string[];     // ["persistent-storage", "gpu", "ipv6"]
  audited: boolean;           // Verified by Akash auditors
}

export interface ProviderReputation {
  totalLeases: number;
  successfulLeases: number;
  averageUptime: number;
  communityRating: number;    // 0-5 stars
  slashCount: number;         // Times penalized for downtime
  lastSlashDate: Date | null;
}

export interface ProviderScore {
  provider: string;
  totalScore: number;
  breakdown: {
    priceScore: number;       // 0-40 points
    uptimeScore: number;      // 0-30 points
    reputationScore: number;  // 0-20 points
    diversityScore: number;   // 0-10 points
  };
}
```

### Scoring Algorithm

```typescript
// packages/agent-deployment/src/provider-selection.ts

export class ProviderSelector {
  private existingProviders: Set<string> = new Set();
  private regionDistribution: Map<string, number> = new Map();

  /**
   * Select best provider from list of bids
   */
  async selectProvider(
    bids: ProviderBid[],
    maxPricePerBlock: number,
    preferences: SelectionPreferences
  ): Promise<ProviderBid> {
    // Filter out bids that are too expensive
    const affordableBids = bids.filter(bid => bid.price <= maxPricePerBlock);

    if (affordableBids.length === 0) {
      throw new Error('No bids within price range');
    }

    // Score all bids
    const scoredBids = affordableBids.map(bid => ({
      bid,
      score: this.scoreBid(bid, maxPricePerBlock, preferences)
    }));

    // Sort by score (highest first)
    scoredBids.sort((a, b) => b.score.totalScore - a.score.totalScore);

    // Log top 3 candidates
    console.log('Top provider candidates:');
    scoredBids.slice(0, 3).forEach((scored, idx) => {
      console.log(`${idx + 1}. ${scored.bid.provider}`);
      console.log(`   Total: ${scored.score.totalScore.toFixed(2)}`);
      console.log(`   Breakdown:`, scored.score.breakdown);
    });

    // Select top bid
    const selected = scoredBids[0];

    // Update tracking
    this.existingProviders.add(selected.bid.provider);
    const region = selected.bid.attributes.region;
    this.regionDistribution.set(
      region,
      (this.regionDistribution.get(region) || 0) + 1
    );

    return selected.bid;
  }

  /**
   * Score a provider bid across multiple dimensions
   */
  private scoreBid(
    bid: ProviderBid,
    maxPrice: number,
    preferences: SelectionPreferences
  ): ProviderScore {
    const priceScore = this.scorePricecost(bid.price, maxPrice);
    const uptimeScore = this.scoreUptime(bid.attributes.uptime, bid.reputation);
    const reputationScore = this.scoreReputation(bid.reputation);
    const diversityScore = this.scoreDiversity(
      bid.provider,
      bid.attributes.region
    );

    const totalScore =
      priceScore * preferences.priceWeight +
      uptimeScore * preferences.uptimeWeight +
      reputationScore * preferences.reputationWeight +
      diversityScore * preferences.diversityWeight;

    return {
      provider: bid.provider,
      totalScore,
      breakdown: {
        priceScore,
        uptimeScore,
        reputationScore,
        diversityScore
      }
    };
  }

  /**
   * Score based on price (lower is better)
   * Max score: 40 points
   */
  private scorePrice(price: number, maxPrice: number): number {
    // Linear scoring: cheapest = 40, maxPrice = 0
    const ratio = price / maxPrice;
    return 40 * (1 - ratio);
  }

  /**
   * Score based on uptime (higher is better)
   * Max score: 30 points
   */
  private scoreUptime(
    uptimePercent: number,
    reputation: ProviderReputation
  ): number {
    // Current uptime: 20 points
    const currentUptimeScore = (uptimePercent / 100) * 20;

    // Historical average: 10 points
    const historicalUptimeScore = (reputation.averageUptime / 100) * 10;

    return currentUptimeScore + historicalUptimeScore;
  }

  /**
   * Score based on reputation metrics
   * Max score: 20 points
   */
  private scoreReputation(reputation: ProviderReputation): number {
    // Success rate: 10 points
    const successRate = reputation.successfulLeases / Math.max(1, reputation.totalLeases);
    const successScore = successRate * 10;

    // Community rating: 5 points
    const ratingScore = (reputation.communityRating / 5) * 5;

    // Penalty for slashes: -1 point per slash (max -5)
    const slashPenalty = Math.min(5, reputation.slashCount);

    // Audited bonus: +5 points
    const auditBonus = reputation.audited ? 5 : 0;

    return Math.max(0, successScore + ratingScore - slashPenalty + auditBonus);
  }

  /**
   * Score based on provider/region diversity
   * Max score: 10 points
   */
  private scoreDiversity(provider: string, region: string): number {
    // Avoid providers we already use
    const providerPenalty = this.existingProviders.has(provider) ? -5 : 0;

    // Prefer underrepresented regions
    const regionCount = this.regionDistribution.get(region) || 0;
    const totalAgents = Array.from(this.regionDistribution.values())
      .reduce((sum, count) => sum + count, 0);

    const regionRatio = totalAgents > 0 ? regionCount / totalAgents : 0;
    const diversityBonus = 10 * (1 - regionRatio);

    return Math.max(0, diversityBonus + providerPenalty);
  }
}

export interface SelectionPreferences {
  priceWeight: number;        // Default: 0.4
  uptimeWeight: number;       // Default: 0.3
  reputationWeight: number;   // Default: 0.2
  diversityWeight: number;    // Default: 0.1
}

export const DEFAULT_PREFERENCES: SelectionPreferences = {
  priceWeight: 0.4,
  uptimeWeight: 0.3,
  reputationWeight: 0.2,
  diversityWeight: 0.1
};
```

### Provider Reputation Tracking

```typescript
// packages/agent-deployment/src/provider-reputation.ts

export class ProviderReputationTracker {
  private db: Database; // PostgreSQL connection

  /**
   * Fetch provider reputation from on-chain and off-chain sources
   */
  async getProviderReputation(
    providerAddress: string
  ): Promise<ProviderReputation> {
    // Query Akash blockchain for on-chain metrics
    const onChainData = await this.fetchOnChainReputation(providerAddress);

    // Query community reputation database
    const communityData = await this.fetchCommunityReputation(providerAddress);

    // Combine data sources
    return {
      totalLeases: onChainData.totalLeases,
      successfulLeases: onChainData.successfulLeases,
      averageUptime: communityData.averageUptime,
      communityRating: communityData.rating,
      slashCount: onChainData.slashCount,
      lastSlashDate: onChainData.lastSlashDate,
      audited: communityData.audited
    };
  }

  /**
   * Record provider performance for our lease
   */
  async recordLeasePerformance(
    providerAddress: string,
    leaseId: string,
    metrics: {
      uptimePercent: number;
      startDate: Date;
      endDate: Date;
      successful: boolean;
      issues: string[];
    }
  ): Promise<void> {
    await this.db.query(`
      INSERT INTO provider_performance
        (provider_address, lease_id, uptime_percent, start_date, end_date, successful, issues)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7)
    `, [
      providerAddress,
      leaseId,
      metrics.uptimePercent,
      metrics.startDate,
      metrics.endDate,
      metrics.successful,
      JSON.stringify(metrics.issues)
    ]);
  }

  /**
   * Get our historical experience with a provider
   */
  async getOurProviderHistory(
    providerAddress: string
  ): Promise<{
    leaseCount: number;
    averageUptime: number;
    successRate: number;
  }> {
    const result = await this.db.query(`
      SELECT
        COUNT(*) as lease_count,
        AVG(uptime_percent) as avg_uptime,
        SUM(CASE WHEN successful THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate
      FROM provider_performance
      WHERE provider_address = $1
    `, [providerAddress]);

    return {
      leaseCount: parseInt(result.rows[0].lease_count),
      averageUptime: parseFloat(result.rows[0].avg_uptime),
      successRate: parseFloat(result.rows[0].success_rate)
    };
  }

  private async fetchOnChainReputation(provider: string): Promise<any> {
    // Query Akash RPC for provider stats
    // Implementation depends on Akash SDK
    return {
      totalLeases: 0,
      successfulLeases: 0,
      slashCount: 0,
      lastSlashDate: null
    };
  }

  private async fetchCommunityReputation(provider: string): Promise<any> {
    // Query community database or API
    return {
      averageUptime: 99.5,
      rating: 4.5,
      audited: false
    };
  }
}
```

---

## Key Management Strategy

### Key Hierarchy

```
Root Seed (BIP39 24-word mnemonic)
  └─ Agent Identity Key (m/44'/118'/0'/0/0)  [Nostr private key]
  └─ Akash Account Key (m/44'/118'/0'/0/1)   [Cosmos SDK key for leases]
  └─ Payment Channel Key (m/44'/60'/0'/0/0)  [EVM key for Cronos]
  └─ Arweave Wallet Key (derived or imported) [JWK for storage uploads]
  └─ Encryption Key (m/44'/118'/0'/0/2)      [For sensitive data]
```

### Key Storage Options

```typescript
// packages/agent-deployment/src/key-management.ts

export enum KeyStorageBackend {
  ENVIRONMENT = 'environment',     // Environment variables (least secure)
  FILE = 'file',                   // Encrypted file on disk
  VAULT = 'vault',                 // HashiCorp Vault
  KMS = 'kms',                     // Cloud KMS (AWS, GCP, Azure)
  HSM = 'hsm',                     // Hardware Security Module
}

export interface KeyConfiguration {
  backend: KeyStorageBackend;
  encryptionKey?: string;          // For FILE backend
  vaultUrl?: string;               // For VAULT backend
  kmsKeyId?: string;               // For KMS backend
}

export class KeyManager {
  private backend: KeyStorageBackend;
  private keys: Map<string, string> = new Map();

  constructor(config: KeyConfiguration) {
    this.backend = config.backend;
    this.initializeBackend(config);
  }

  /**
   * Load all required keys based on storage backend
   */
  async loadKeys(): Promise<void> {
    switch (this.backend) {
      case KeyStorageBackend.ENVIRONMENT:
        await this.loadFromEnvironment();
        break;
      case KeyStorageBackend.FILE:
        await this.loadFromFile();
        break;
      case KeyStorageBackend.VAULT:
        await this.loadFromVault();
        break;
      case KeyStorageBackend.KMS:
        await this.loadFromKMS();
        break;
      default:
        throw new Error(`Unsupported backend: ${this.backend}`);
    }

    // Validate all required keys are present
    this.validateKeys();
  }

  /**
   * Get a key by name
   */
  getKey(keyName: string): string {
    const key = this.keys.get(keyName);
    if (!key) {
      throw new Error(`Key not found: ${keyName}`);
    }
    return key;
  }

  /**
   * Load keys from environment variables
   */
  private async loadFromEnvironment(): Promise<void> {
    this.keys.set('AGENT_PRIVATE_KEY', process.env.AGENT_PRIVATE_KEY!);
    this.keys.set('AKASH_PRIVATE_KEY', process.env.AKASH_PRIVATE_KEY!);
    this.keys.set('PAYMENT_CHANNEL_PRIVATE_KEY', process.env.PAYMENT_CHANNEL_PRIVATE_KEY!);
    this.keys.set('ARWEAVE_WALLET', process.env.ARWEAVE_WALLET!);
    this.keys.set('ENCRYPTION_KEY', process.env.ENCRYPTION_KEY!);
  }

  /**
   * Load keys from encrypted file
   */
  private async loadFromFile(): Promise<void> {
    const fs = require('fs').promises;
    const crypto = require('crypto');

    const encryptedData = await fs.readFile('/secrets/keys.enc');
    const encryptionKey = process.env.KEY_ENCRYPTION_KEY!;

    // Decrypt file
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(encryptionKey, 'hex'),
      Buffer.from(encryptedData.slice(0, 16))
    );

    const decrypted = Buffer.concat([
      decipher.update(encryptedData.slice(16)),
      decipher.final()
    ]);

    const keyData = JSON.parse(decrypted.toString());

    // Load into memory
    for (const [keyName, keyValue] of Object.entries(keyData)) {
      this.keys.set(keyName, keyValue as string);
    }
  }

  /**
   * Load keys from HashiCorp Vault
   */
  private async loadFromVault(): Promise<void> {
    const vault = require('node-vault')({
      endpoint: process.env.VAULT_URL,
      token: process.env.VAULT_TOKEN
    });

    const agentId = process.env.AGENT_ID;
    const secretPath = `secret/data/agents/${agentId}/keys`;

    const response = await vault.read(secretPath);
    const secretData = response.data.data;

    for (const [keyName, keyValue] of Object.entries(secretData)) {
      this.keys.set(keyName, keyValue as string);
    }
  }

  /**
   * Load keys from Cloud KMS (AWS KMS example)
   */
  private async loadFromKMS(): Promise<void> {
    const { KMSClient, DecryptCommand } = require('@aws-sdk/client-kms');
    const kms = new KMSClient({ region: process.env.AWS_REGION });

    // Keys are stored encrypted in environment, decrypt with KMS
    const encryptedKeys = {
      AGENT_PRIVATE_KEY: process.env.AGENT_PRIVATE_KEY_ENCRYPTED!,
      AKASH_PRIVATE_KEY: process.env.AKASH_PRIVATE_KEY_ENCRYPTED!,
      // ... etc
    };

    for (const [keyName, encryptedValue] of Object.entries(encryptedKeys)) {
      const command = new DecryptCommand({
        CiphertextBlob: Buffer.from(encryptedValue, 'base64'),
        KeyId: process.env.KMS_KEY_ID
      });

      const response = await kms.send(command);
      const decrypted = Buffer.from(response.Plaintext!).toString('utf-8');

      this.keys.set(keyName, decrypted);
    }
  }

  /**
   * Validate all required keys are present
   */
  private validateKeys(): void {
    const requiredKeys = [
      'AGENT_PRIVATE_KEY',
      'AKASH_PRIVATE_KEY',
      'PAYMENT_CHANNEL_PRIVATE_KEY',
      'ARWEAVE_WALLET',
      'ENCRYPTION_KEY'
    ];

    for (const keyName of requiredKeys) {
      if (!this.keys.has(keyName)) {
        throw new Error(`Missing required key: ${keyName}`);
      }
    }
  }

  /**
   * Rotate a key (for periodic rotation)
   */
  async rotateKey(keyName: string): Promise<void> {
    // Generate new key
    const newKey = this.generateNewKey(keyName);

    // Update in backend
    await this.updateKeyInBackend(keyName, newKey);

    // Update in memory
    this.keys.set(keyName, newKey);

    console.log(`Rotated key: ${keyName}`);
  }

  private generateNewKey(keyName: string): string {
    const crypto = require('crypto');

    switch (keyName) {
      case 'AGENT_PRIVATE_KEY':
      case 'AKASH_PRIVATE_KEY':
      case 'PAYMENT_CHANNEL_PRIVATE_KEY':
        // Generate new private key (secp256k1 or ed25519)
        return crypto.randomBytes(32).toString('hex');

      case 'ENCRYPTION_KEY':
        // Generate AES-256 key
        return crypto.randomBytes(32).toString('hex');

      default:
        throw new Error(`Cannot rotate key: ${keyName}`);
    }
  }

  private async updateKeyInBackend(keyName: string, newKey: string): Promise<void> {
    // Implementation depends on backend
    // For Vault: vault.write(...)
    // For KMS: encrypt with KMS and update environment
    // For File: re-encrypt file with new key
  }

  private initializeBackend(config: KeyConfiguration): void {
    // Backend-specific initialization
  }
}
```

### Key Rotation Strategy

```typescript
// packages/agent-deployment/src/key-rotation.ts

export class KeyRotationScheduler {
  private keyManager: KeyManager;
  private rotationIntervals: Map<string, number> = new Map([
    ['AGENT_PRIVATE_KEY', 90 * 24 * 60 * 60 * 1000],      // 90 days (or never if immutable)
    ['AKASH_PRIVATE_KEY', 30 * 24 * 60 * 60 * 1000],       // 30 days
    ['PAYMENT_CHANNEL_PRIVATE_KEY', 30 * 24 * 60 * 60 * 1000], // 30 days
    ['ENCRYPTION_KEY', 90 * 24 * 60 * 60 * 1000]           // 90 days
  ]);

  constructor(keyManager: KeyManager) {
    this.keyManager = keyManager;
  }

  /**
   * Schedule automatic key rotation
   */
  startRotationSchedule(): void {
    for (const [keyName, interval] of this.rotationIntervals) {
      setInterval(async () => {
        console.log(`Rotating key: ${keyName}`);
        await this.rotateKeyWithGracePeriod(keyName);
      }, interval);
    }
  }

  /**
   * Rotate key with grace period for active connections
   */
  private async rotateKeyWithGracePeriod(keyName: string): Promise<void> {
    // 1. Generate new key
    console.log(`Generating new ${keyName}...`);
    const newKey = await this.keyManager.rotateKey(keyName);

    // 2. Update configuration to accept both old and new keys (grace period)
    console.log(`Starting grace period for ${keyName}...`);
    await this.enableDualKeyMode(keyName);

    // 3. Wait for grace period (24 hours)
    await this.sleep(24 * 60 * 60 * 1000);

    // 4. Disable old key
    console.log(`Disabling old ${keyName}...`);
    await this.disableOldKey(keyName);

    console.log(`Key rotation complete: ${keyName}`);
  }

  private async enableDualKeyMode(keyName: string): Promise<void> {
    // Allow both old and new keys for authentication/signing
    // Implementation depends on key type
  }

  private async disableOldKey(keyName: string): Promise<void> {
    // Remove old key from accepted keys
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## Failure Handling Procedures

### Failure Categories

```typescript
export enum FailureType {
  // Provider failures
  PROVIDER_OFFLINE = 'provider_offline',
  PROVIDER_DEGRADED = 'provider_degraded',
  PROVIDER_UNRESPONSIVE = 'provider_unresponsive',

  // Lease failures
  LEASE_EXPIRED = 'lease_expired',
  LEASE_REJECTED = 'lease_rejected',
  LEASE_INSUFFICIENT_FUNDS = 'lease_insufficient_funds',

  // Deployment failures
  DEPLOYMENT_FAILED = 'deployment_failed',
  DEPLOYMENT_TIMEOUT = 'deployment_timeout',
  SERVICE_START_FAILED = 'service_start_failed',

  // Network failures
  NETWORK_PARTITION = 'network_partition',
  DNS_FAILURE = 'dns_failure',
  CERTIFICATE_EXPIRED = 'certificate_expired',

  // Resource failures
  OUT_OF_MEMORY = 'out_of_memory',
  OUT_OF_DISK = 'out_of_disk',
  CPU_THROTTLED = 'cpu_throttled',
}

export interface FailureEvent {
  type: FailureType;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metadata: Record<string, any>;
}
```

### Recovery Procedures

```typescript
// packages/agent-deployment/src/failure-handler.ts

export class FailureHandler {
  private leaseManager: LeaseManager;
  private stateMachine: LeaseStateMachine;
  private alerting: AlertingService;

  /**
   * Handle failure and execute recovery procedure
   */
  async handleFailure(failure: FailureEvent): Promise<void> {
    console.error(`Failure detected: ${failure.type}`, failure);

    // Send alert
    await this.alerting.sendAlert({
      title: `Agent Failure: ${failure.type}`,
      severity: failure.severity,
      message: failure.message,
      metadata: failure.metadata
    });

    // Execute recovery based on failure type
    switch (failure.type) {
      case FailureType.PROVIDER_OFFLINE:
      case FailureType.PROVIDER_DEGRADED:
        await this.handleProviderFailure(failure);
        break;

      case FailureType.LEASE_EXPIRED:
        await this.handleLeaseExpiration(failure);
        break;

      case FailureType.LEASE_INSUFFICIENT_FUNDS:
        await this.handleInsufficientFunds(failure);
        break;

      case FailureType.DEPLOYMENT_FAILED:
      case FailureType.DEPLOYMENT_TIMEOUT:
        await this.handleDeploymentFailure(failure);
        break;

      case FailureType.OUT_OF_MEMORY:
      case FailureType.OUT_OF_DISK:
      case FailureType.CPU_THROTTLED:
        await this.handleResourceExhaustion(failure);
        break;

      case FailureType.NETWORK_PARTITION:
        await this.handleNetworkPartition(failure);
        break;

      default:
        await this.handleGenericFailure(failure);
    }
  }

  /**
   * Provider is offline or degraded - migrate to new provider
   */
  private async handleProviderFailure(failure: FailureEvent): Promise<void> {
    console.log('Provider failure detected, initiating migration...');

    // Transition to MIGRATING state
    this.stateMachine.transition(LeaseEvent.PROVIDER_DEGRADED);

    // Find new provider
    const newProvider = await this.leaseManager.findReplacementProvider({
      excludeProviders: [failure.metadata.providerAddress],
      urgency: 'high'
    });

    // Start migration
    await this.leaseManager.migrate(newProvider);
  }

  /**
   * Lease expired - attempt renewal or find new provider
   */
  private async handleLeaseExpiration(failure: FailureEvent): Promise<void> {
    console.log('Lease expired, attempting renewal...');

    try {
      // Try to renew with same provider
      await this.leaseManager.renewLease();
      console.log('Lease renewed successfully');
    } catch (error) {
      console.log('Renewal failed, finding new provider...');

      // Find new provider if renewal fails
      const newProvider = await this.leaseManager.findReplacementProvider({
        urgency: 'high'
      });

      await this.leaseManager.deployToProvider(newProvider);
    }
  }

  /**
   * Insufficient AKT for lease payment - trigger emergency treasury action
   */
  private async handleInsufficientFunds(failure: FailureEvent): Promise<void> {
    console.error('Insufficient AKT balance for lease payment!');

    // Send critical alert
    await this.alerting.sendAlert({
      title: 'CRITICAL: Insufficient AKT Balance',
      severity: 'critical',
      message: 'Agent cannot pay for Akash lease. Emergency swap required.',
      metadata: {
        currentBalance: failure.metadata.currentBalance,
        requiredAmount: failure.metadata.requiredAmount
      }
    });

    // Trigger emergency swap from treasury
    const treasury = new TreasuryManager();
    await treasury.emergencySwap({
      from: 'CRO',
      to: 'AKT',
      amount: failure.metadata.requiredAmount * 2 // 2x for buffer
    });

    // Retry lease payment
    await this.leaseManager.retryLeasePayment();
  }

  /**
   * Deployment failed - retry with different provider
   */
  private async handleDeploymentFailure(failure: FailureEvent): Promise<void> {
    console.log('Deployment failed, retrying with different provider...');

    const attempt = failure.metadata.attempt || 1;

    if (attempt >= 3) {
      // After 3 attempts, escalate
      await this.alerting.sendAlert({
        title: 'Deployment Failed After 3 Attempts',
        severity: 'critical',
        message: 'Agent cannot deploy. Manual intervention required.',
        metadata: failure.metadata
      });

      this.stateMachine.transition(LeaseEvent.DEPLOYMENT_FAILED);
      return;
    }

    // Find new provider (exclude failed ones)
    const excludeProviders = failure.metadata.failedProviders || [];
    const newProvider = await this.leaseManager.findReplacementProvider({
      excludeProviders,
      urgency: 'high'
    });

    // Retry deployment
    await this.leaseManager.deployToProvider(newProvider, {
      attempt: attempt + 1,
      failedProviders: [...excludeProviders, failure.metadata.providerAddress]
    });
  }

  /**
   * Resource exhaustion - scale up immediately
   */
  private async handleResourceExhaustion(failure: FailureEvent): Promise<void> {
    console.log('Resource exhaustion detected, scaling up...');

    const currentResources = await this.leaseManager.getCurrentResources();

    let newResources;
    switch (failure.type) {
      case FailureType.OUT_OF_MEMORY:
        newResources = {
          ...currentResources,
          memorySize: this.increaseMemory(currentResources.memorySize)
        };
        break;

      case FailureType.OUT_OF_DISK:
        newResources = {
          ...currentResources,
          storageSize: this.increaseStorage(currentResources.storageSize)
        };
        break;

      case FailureType.CPU_THROTTLED:
        newResources = {
          ...currentResources,
          cpuUnits: Math.min(8, currentResources.cpuUnits + 2)
        };
        break;
    }

    // Update SDL and redeploy
    await this.leaseManager.scaleResources(newResources);
  }

  /**
   * Network partition - attempt reconnection with exponential backoff
   */
  private async handleNetworkPartition(failure: FailureEvent): Promise<void> {
    console.log('Network partition detected, attempting reconnection...');

    let attempt = 0;
    const maxAttempts = 10;

    while (attempt < maxAttempts) {
      attempt++;
      const backoffMs = Math.min(60000, Math.pow(2, attempt) * 1000); // Max 60s

      console.log(`Reconnection attempt ${attempt}/${maxAttempts} (waiting ${backoffMs}ms)...`);

      await this.sleep(backoffMs);

      try {
        await this.leaseManager.checkConnection();
        console.log('Reconnection successful!');
        return;
      } catch (error) {
        console.log(`Attempt ${attempt} failed:`, error);
      }
    }

    // If still failing after max attempts, migrate
    console.error('Network partition persists after max attempts, migrating...');
    await this.handleProviderFailure(failure);
  }

  /**
   * Generic failure handler
   */
  private async handleGenericFailure(failure: FailureEvent): Promise<void> {
    console.log('Generic failure, logging and alerting...');

    await this.alerting.sendAlert({
      title: `Agent Failure: ${failure.type}`,
      severity: failure.severity,
      message: failure.message,
      metadata: failure.metadata
    });

    // Transition to recovery state
    this.stateMachine.transition(LeaseEvent.DEPLOYMENT_FAILED);
  }

  private increaseMemory(current: string): string {
    const match = current.match(/(\d+)Gi/);
    if (!match) return "8Gi";
    const currentGB = parseInt(match[1]);
    return `${Math.min(16, currentGB * 2)}Gi`;
  }

  private increaseStorage(current: string): string {
    const match = current.match(/(\d+)Gi/);
    if (!match) return "200Gi";
    const currentGB = parseInt(match[1]);
    return `${Math.min(500, currentGB + 100)}Gi`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Health Monitoring

```typescript
// packages/agent-deployment/src/health-monitor.ts

export class HealthMonitor {
  private failureHandler: FailureHandler;
  private checkIntervalMs: number = 30000; // 30 seconds

  /**
   * Start continuous health monitoring
   */
  startMonitoring(): void {
    setInterval(async () => {
      await this.performHealthChecks();
    }, this.checkIntervalMs);
  }

  /**
   * Perform all health checks
   */
  private async performHealthChecks(): Promise<void> {
    const checks = [
      this.checkProviderConnection(),
      this.checkServiceHealth(),
      this.checkResourceUsage(),
      this.checkLeaseExpiration(),
      this.checkBalance()
    ];

    const results = await Promise.allSettled(checks);

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Health check ${index} failed:`, result.reason);
      }
    });
  }

  /**
   * Check if provider is responsive
   */
  private async checkProviderConnection(): Promise<void> {
    // Ping provider
    // Check if services are reachable
    // Measure response time
  }

  /**
   * Check if all services are healthy
   */
  private async checkServiceHealth(): Promise<void> {
    const services = ['agent-relay', 'postgres', 'redis'];

    for (const service of services) {
      const healthy = await this.checkServiceStatus(service);

      if (!healthy) {
        await this.failureHandler.handleFailure({
          type: FailureType.SERVICE_START_FAILED,
          timestamp: new Date(),
          severity: 'high',
          message: `Service ${service} is unhealthy`,
          metadata: { service }
        });
      }
    }
  }

  /**
   * Check resource usage and alert if approaching limits
   */
  private async checkResourceUsage(): Promise<void> {
    const usage = await this.getCurrentResourceUsage();

    if (usage.memoryPercent > 90) {
      await this.failureHandler.handleFailure({
        type: FailureType.OUT_OF_MEMORY,
        timestamp: new Date(),
        severity: 'high',
        message: 'Memory usage above 90%',
        metadata: { usage: usage.memoryPercent }
      });
    }

    if (usage.diskPercent > 85) {
      await this.failureHandler.handleFailure({
        type: FailureType.OUT_OF_DISK,
        timestamp: new Date(),
        severity: 'high',
        message: 'Disk usage above 85%',
        metadata: { usage: usage.diskPercent }
      });
    }

    if (usage.cpuPercent > 95) {
      await this.failureHandler.handleFailure({
        type: FailureType.CPU_THROTTLED,
        timestamp: new Date(),
        severity: 'medium',
        message: 'CPU usage above 95%',
        metadata: { usage: usage.cpuPercent }
      });
    }
  }

  /**
   * Check if lease is expiring soon
   */
  private async checkLeaseExpiration(): Promise<void> {
    const lease = await this.getCurrentLease();
    const hoursUntilExpiration = this.getHoursUntilExpiration(lease.expiresAt);

    if (hoursUntilExpiration < 24) {
      // Trigger renewal
      await this.failureHandler.handleFailure({
        type: FailureType.LEASE_EXPIRED,
        timestamp: new Date(),
        severity: hoursUntilExpiration < 1 ? 'critical' : 'high',
        message: `Lease expiring in ${hoursUntilExpiration} hours`,
        metadata: { expiresAt: lease.expiresAt }
      });
    }
  }

  /**
   * Check AKT balance for lease payments
   */
  private async checkBalance(): Promise<void> {
    const balance = await this.getAKTBalance();
    const dailyCost = await this.estimateDailyCost();
    const daysRemaining = balance / dailyCost;

    if (daysRemaining < 7) {
      await this.failureHandler.handleFailure({
        type: FailureType.LEASE_INSUFFICIENT_FUNDS,
        timestamp: new Date(),
        severity: daysRemaining < 1 ? 'critical' : 'high',
        message: `AKT balance low: ${daysRemaining.toFixed(1)} days remaining`,
        metadata: { balance, dailyCost, daysRemaining }
      });
    }
  }

  private async checkServiceStatus(service: string): Promise<boolean> {
    // Implementation: query service health endpoint
    return true;
  }

  private async getCurrentResourceUsage(): Promise<{
    memoryPercent: number;
    diskPercent: number;
    cpuPercent: number;
  }> {
    // Implementation: query metrics API
    return {
      memoryPercent: 0,
      diskPercent: 0,
      cpuPercent: 0
    };
  }

  private async getCurrentLease(): Promise<{ expiresAt: Date }> {
    // Implementation: query Akash API
    return { expiresAt: new Date() };
  }

  private getHoursUntilExpiration(expiresAt: Date): number {
    const ms = expiresAt.getTime() - Date.now();
    return ms / (1000 * 60 * 60);
  }

  private async getAKTBalance(): Promise<number> {
    // Implementation: query Akash wallet
    return 0;
  }

  private async estimateDailyCost(): Promise<number> {
    // Implementation: calculate based on current lease
    return 0;
  }
}
```

---

## Bootstrap Process

### Manual Bootstrap (First Agent)

```typescript
// packages/agent-deployment/src/bootstrap/manual-bootstrap.ts

export class ManualBootstrap {
  /**
   * Step 1: Generate agent identity and keys
   */
  async generateIdentity(): Promise<AgentIdentity> {
    const crypto = require('crypto');
    const { generateMnemonic } = require('bip39');

    // Generate BIP39 mnemonic (24 words)
    const mnemonic = generateMnemonic(256);

    // Derive keys from mnemonic
    const agentPrivateKey = this.deriveKey(mnemonic, "m/44'/118'/0'/0/0");
    const akashPrivateKey = this.deriveKey(mnemonic, "m/44'/118'/0'/0/1");
    const paymentChannelKey = this.deriveKey(mnemonic, "m/44'/60'/0'/0/0");

    // Generate Arweave wallet
    const arweaveWallet = await this.generateArweaveWallet();

    // Generate agent ID
    const agentId = `agent_${crypto.randomBytes(16).toString('hex')}`;

    return {
      agentId,
      mnemonic,
      keys: {
        agentPrivateKey,
        akashPrivateKey,
        paymentChannelKey,
        arweaveWallet
      }
    };
  }

  /**
   * Step 2: Fund agent accounts
   */
  async fundAccounts(identity: AgentIdentity): Promise<void> {
    const akashAddress = this.deriveAddress(identity.keys.akashPrivateKey, 'akash');
    const cronosAddress = this.deriveAddress(identity.keys.paymentChannelKey, 'cronos');

    console.log('Fund the following addresses:');
    console.log(`Akash (AKT):  ${akashAddress}   (Minimum: 10 AKT for leases)`);
    console.log(`Cronos (CRO): ${cronosAddress}  (Minimum: 100 CRO for operations)`);
    console.log('\nWaiting for funding confirmation...');

    // Poll for balance
    while (true) {
      const aktBalance = await this.checkBalance(akashAddress, 'akash');
      const croBalance = await this.checkBalance(cronosAddress, 'cronos');

      if (aktBalance >= 10 && croBalance >= 100) {
        console.log('✓ Accounts funded successfully!');
        break;
      }

      console.log(`Current balances: ${aktBalance} AKT, ${croBalance} CRO`);
      await this.sleep(10000); // Check every 10 seconds
    }
  }

  /**
   * Step 3: Deploy to Akash
   */
  async deployToAkash(identity: AgentIdentity): Promise<DeploymentInfo> {
    // Generate SDL
    const sdlGenerator = new SDLGenerator();
    const sdl = sdlGenerator.generateSDL(
      {
        agentId: identity.agentId,
        agentPrivateKey: identity.keys.agentPrivateKey,
        akashAddress: this.deriveAddress(identity.keys.akashPrivateKey, 'akash'),
        relayName: `Autonomous Agent ${identity.agentId}`,
        relayPubkey: this.derivePublicKey(identity.keys.agentPrivateKey),
        domain: `${identity.agentId}.akash.network`
      },
      {
        eventsPerSecond: 10,
        activeConnections: 100,
        cacheSize: 1024 * 1024 * 100, // 100MB
        storageUsed: 1024 * 1024 * 1024 * 10 // 10GB
      },
      5.0 // $5/day target
    );

    // Create deployment
    const akashClient = new AkashClient(identity.keys.akashPrivateKey);
    const deployment = await akashClient.createDeployment(sdl);

    console.log(`Deployment created: ${deployment.id}`);

    // Wait for bids
    console.log('Waiting for provider bids...');
    const bids = await akashClient.waitForBids(deployment.id, 60000); // 60s timeout

    // Select provider
    const providerSelector = new ProviderSelector();
    const selectedBid = await providerSelector.selectProvider(
      bids,
      deployment.maxPricePerBlock,
      DEFAULT_PREFERENCES
    );

    console.log(`Selected provider: ${selectedBid.provider}`);

    // Accept bid and create lease
    const lease = await akashClient.acceptBid(deployment.id, selectedBid);

    console.log(`Lease created: ${lease.id}`);

    // Send manifest to provider
    await akashClient.sendManifest(lease.id, sdl);

    // Wait for deployment to become active
    console.log('Waiting for deployment to start...');
    const deploymentInfo = await akashClient.waitForActive(lease.id, 300000); // 5 min timeout

    console.log('✓ Deployment active!');
    console.log(`URL: https://${deploymentInfo.uri}`);

    return deploymentInfo;
  }

  /**
   * Step 4: Activate autonomous mode
   */
  async activateAutonomousMode(
    identity: AgentIdentity,
    deployment: DeploymentInfo
  ): Promise<void> {
    console.log('Activating autonomous mode...');

    // Configure agent to manage its own deployment
    const config = {
      agentId: identity.agentId,
      autonomousMode: true,
      selfDeploymentEnabled: true,
      leaseId: deployment.leaseId,
      providerAddress: deployment.providerAddress
    };

    // Send configuration to deployed agent
    const response = await fetch(`${deployment.uri}/api/admin/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.generateAdminToken(identity)}`
      },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      throw new Error('Failed to activate autonomous mode');
    }

    console.log('✓ Autonomous mode activated!');
    console.log('Agent is now self-managing.');
  }

  private deriveKey(mnemonic: string, path: string): string {
    // BIP39/BIP44 key derivation
    // Implementation depends on crypto library
    return '';
  }

  private deriveAddress(privateKey: string, chain: string): string {
    // Derive address from private key
    // Implementation depends on chain
    return '';
  }

  private derivePublicKey(privateKey: string): string {
    // Derive public key from private key
    return '';
  }

  private async generateArweaveWallet(): Promise<string> {
    const Arweave = require('arweave');
    const arweave = Arweave.init({});
    const wallet = await arweave.wallets.generate();
    return JSON.stringify(wallet);
  }

  private async checkBalance(address: string, chain: string): Promise<number> {
    // Query blockchain for balance
    return 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateAdminToken(identity: AgentIdentity): string {
    // Generate JWT or similar admin auth token
    return '';
  }
}

export interface AgentIdentity {
  agentId: string;
  mnemonic: string;
  keys: {
    agentPrivateKey: string;
    akashPrivateKey: string;
    paymentChannelKey: string;
    arweaveWallet: string;
  };
}

export interface DeploymentInfo {
  leaseId: string;
  providerAddress: string;
  uri: string;
}
```

### Autonomous Bootstrap (Subsequent Agents)

```typescript
// packages/agent-deployment/src/bootstrap/autonomous-bootstrap.ts

export class AutonomousBootstrap {
  private parentAgent: ParentAgentClient;
  private treasury: TreasuryManager;

  /**
   * Autonomous agent spawns a child agent
   */
  async spawnChildAgent(
    reason: string,
    config: ChildAgentConfig
  ): Promise<AgentIdentity> {
    console.log(`Spawning child agent: ${reason}`);

    // 1. Check if reproduction is allowed
    if (!this.isReproductionAllowed()) {
      throw new Error('Reproduction not allowed (insufficient resources or quota exceeded)');
    }

    // 2. Generate child identity
    const childIdentity = await this.generateChildIdentity();

    // 3. Allocate treasury funds to child
    await this.allocateTreasuryFunds(childIdentity, {
      aktAmount: 10,
      croAmount: 100
    });

    // 4. Deploy child to Akash
    const deployment = await this.deployChild(childIdentity, config);

    // 5. Register child in parent's registry
    await this.registerChild(childIdentity, deployment);

    // 6. Activate child's autonomous mode
    await this.activateChild(childIdentity, deployment);

    console.log(`✓ Child agent spawned: ${childIdentity.agentId}`);

    return childIdentity;
  }

  /**
   * Check if agent can spawn children
   */
  private isReproductionAllowed(): boolean {
    // Check reproduction quota
    const currentChildren = this.getChildrenCount();
    const maxChildren = this.getMaxChildren();

    if (currentChildren >= maxChildren) {
      console.log(`Max children reached: ${currentChildren}/${maxChildren}`);
      return false;
    }

    // Check treasury balance
    const balance = this.treasury.getBalance('AKT');
    const minBalance = 50; // Need at least 50 AKT (10 for child + buffer)

    if (balance < minBalance) {
      console.log(`Insufficient AKT balance: ${balance} < ${minBalance}`);
      return false;
    }

    // Check network load
    const networkLoad = this.getNetworkLoad();
    if (networkLoad < 0.7) {
      console.log(`Network load too low for reproduction: ${networkLoad}`);
      return false;
    }

    return true;
  }

  /**
   * Generate identity for child agent
   */
  private async generateChildIdentity(): Promise<AgentIdentity> {
    const { generateMnemonic } = require('bip39');
    const crypto = require('crypto');

    const mnemonic = generateMnemonic(256);
    const agentId = `agent_${crypto.randomBytes(16).toString('hex')}`;

    // Derive keys (same process as manual bootstrap)
    const keys = {
      agentPrivateKey: this.deriveKey(mnemonic, "m/44'/118'/0'/0/0"),
      akashPrivateKey: this.deriveKey(mnemonic, "m/44'/118'/0'/0/1"),
      paymentChannelKey: this.deriveKey(mnemonic, "m/44'/60'/0'/0/0"),
      arweaveWallet: await this.generateArweaveWallet()
    };

    return { agentId, mnemonic, keys };
  }

  /**
   * Transfer funds from parent treasury to child accounts
   */
  private async allocateTreasuryFunds(
    childIdentity: AgentIdentity,
    allocation: { aktAmount: number; croAmount: number }
  ): Promise<void> {
    const akashAddress = this.deriveAddress(childIdentity.keys.akashPrivateKey, 'akash');
    const cronosAddress = this.deriveAddress(childIdentity.keys.paymentChannelKey, 'cronos');

    // Transfer AKT
    await this.treasury.transfer({
      to: akashAddress,
      amount: allocation.aktAmount,
      asset: 'AKT',
      memo: `Spawning child agent ${childIdentity.agentId}`
    });

    // Transfer CRO
    await this.treasury.transfer({
      to: cronosAddress,
      amount: allocation.croAmount,
      asset: 'CRO',
      memo: `Spawning child agent ${childIdentity.agentId}`
    });

    console.log(`✓ Funds allocated to child agent`);
  }

  /**
   * Deploy child agent to Akash
   */
  private async deployChild(
    childIdentity: AgentIdentity,
    config: ChildAgentConfig
  ): Promise<DeploymentInfo> {
    // Same process as manual bootstrap, but fully automated
    const sdlGenerator = new SDLGenerator();
    const akashClient = new AkashClient(childIdentity.keys.akashPrivateKey);

    // Generate SDL based on intended role
    const sdl = sdlGenerator.generateSDL(
      {
        agentId: childIdentity.agentId,
        agentPrivateKey: childIdentity.keys.agentPrivateKey,
        akashAddress: this.deriveAddress(childIdentity.keys.akashPrivateKey, 'akash'),
        relayName: `Autonomous Agent ${childIdentity.agentId}`,
        relayPubkey: this.derivePublicKey(childIdentity.keys.agentPrivateKey),
        domain: `${childIdentity.agentId}.akash.network`
      },
      config.initialMetrics,
      config.targetCostPerDay
    );

    // Create deployment
    const deployment = await akashClient.createDeployment(sdl);
    const bids = await akashClient.waitForBids(deployment.id, 60000);

    // Select provider (exclude parent's provider for diversity)
    const providerSelector = new ProviderSelector();
    providerSelector.existingProviders.add(this.getParentProvider());

    const selectedBid = await providerSelector.selectProvider(
      bids,
      deployment.maxPricePerBlock,
      DEFAULT_PREFERENCES
    );

    // Accept bid and deploy
    const lease = await akashClient.acceptBid(deployment.id, selectedBid);
    await akashClient.sendManifest(lease.id, sdl);

    const deploymentInfo = await akashClient.waitForActive(lease.id, 300000);

    return deploymentInfo;
  }

  /**
   * Register child in parent's registry
   */
  private async registerChild(
    childIdentity: AgentIdentity,
    deployment: DeploymentInfo
  ): Promise<void> {
    await this.parentAgent.registerChild({
      agentId: childIdentity.agentId,
      pubkey: this.derivePublicKey(childIdentity.keys.agentPrivateKey),
      leaseId: deployment.leaseId,
      providerAddress: deployment.providerAddress,
      uri: deployment.uri,
      spawnedAt: new Date(),
      status: 'active'
    });
  }

  /**
   * Activate child's autonomous features
   */
  private async activateChild(
    childIdentity: AgentIdentity,
    deployment: DeploymentInfo
  ): Promise<void> {
    const config = {
      agentId: childIdentity.agentId,
      autonomousMode: true,
      selfDeploymentEnabled: true,
      reproductionEnabled: false, // Children can't reproduce by default
      parentAgentId: this.parentAgent.getAgentId(),
      leaseId: deployment.leaseId,
      providerAddress: deployment.providerAddress
    };

    await fetch(`${deployment.uri}/api/admin/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.generateChildAuthToken(childIdentity)}`
      },
      body: JSON.stringify(config)
    });
  }

  private getChildrenCount(): number {
    // Query database for children
    return 0;
  }

  private getMaxChildren(): number {
    // Get from configuration
    return 5;
  }

  private getNetworkLoad(): number {
    // Calculate current network utilization
    return 0;
  }

  private getParentProvider(): string {
    return '';
  }

  private deriveKey(mnemonic: string, path: string): string {
    return '';
  }

  private deriveAddress(privateKey: string, chain: string): string {
    return '';
  }

  private derivePublicKey(privateKey: string): string {
    return '';
  }

  private async generateArweaveWallet(): Promise<string> {
    return '';
  }

  private generateChildAuthToken(identity: AgentIdentity): string {
    return '';
  }
}

export interface ChildAgentConfig {
  initialMetrics: TrafficMetrics;
  targetCostPerDay: number;
  role: 'replica' | 'specialized';
}

interface ParentAgentClient {
  getAgentId(): string;
  registerChild(child: any): Promise<void>;
}
```

---

## Agent Reproduction Model

### Reproduction Triggers

```typescript
export enum ReproductionTrigger {
  HIGH_LOAD = 'high_load',                 // Network traffic exceeds capacity
  GEOGRAPHIC_DEMAND = 'geographic_demand', // Demand from new region
  REDUNDANCY = 'redundancy',               // Need backup/failover
  SPECIALIZATION = 'specialization',       // Need specialized agent
  SCHEDULED = 'scheduled',                 // Planned reproduction
}

export interface ReproductionDecision {
  shouldReproduce: boolean;
  trigger: ReproductionTrigger;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
  childConfig: ChildAgentConfig;
}
```

### Reproduction Decision Engine

```typescript
// packages/agent-deployment/src/reproduction/decision-engine.ts

export class ReproductionDecisionEngine {
  private metrics: MetricsCollector;
  private treasury: TreasuryManager;
  private children: ChildRegistry;

  /**
   * Evaluate whether to spawn a child agent
   */
  async evaluateReproduction(): Promise<ReproductionDecision | null> {
    // Check high load trigger
    const loadDecision = await this.checkHighLoad();
    if (loadDecision) return loadDecision;

    // Check geographic demand trigger
    const geoDecision = await this.checkGeographicDemand();
    if (geoDecision) return geoDecision;

    // Check redundancy trigger
    const redundancyDecision = await this.checkRedundancy();
    if (redundancyDecision) return redundancyDecision;

    // Check specialization trigger
    const specializationDecision = await this.checkSpecialization();
    if (specializationDecision) return specializationDecision;

    // Check scheduled trigger
    const scheduledDecision = await this.checkScheduled();
    if (scheduledDecision) return scheduledDecision;

    return null; // No reproduction needed
  }

  /**
   * Check if load requires scaling via reproduction
   */
  private async checkHighLoad(): Promise<ReproductionDecision | null> {
    const metrics = await this.metrics.getCurrentMetrics();

    // If events/sec exceeds 80% of capacity, consider reproduction
    const capacityThreshold = 0.8;
    const currentLoad = metrics.eventsPerSecond / metrics.maxEventsPerSecond;

    if (currentLoad > capacityThreshold) {
      // Check if we can scale vertically first
      const canScaleUp = await this.canScaleVertically();

      if (!canScaleUp) {
        return {
          shouldReproduce: true,
          trigger: ReproductionTrigger.HIGH_LOAD,
          reason: `Load at ${(currentLoad * 100).toFixed(1)}% capacity, max vertical scale reached`,
          urgency: currentLoad > 0.9 ? 'high' : 'medium',
          childConfig: {
            initialMetrics: this.estimateChildMetrics(metrics),
            targetCostPerDay: 5.0,
            role: 'replica'
          }
        };
      }
    }

    return null;
  }

  /**
   * Check if there's demand from new geographic regions
   */
  private async checkGeographicDemand(): Promise<ReproductionDecision | null> {
    const connectionsByRegion = await this.metrics.getConnectionsByRegion();

    // If a region has >30% of connections but no local agent, deploy there
    const totalConnections = Object.values(connectionsByRegion)
      .reduce((sum, count) => sum + count, 0);

    for (const [region, count] of Object.entries(connectionsByRegion)) {
      const percentage = count / totalConnections;

      if (percentage > 0.3) {
        const hasAgentInRegion = await this.children.hasAgentInRegion(region);

        if (!hasAgentInRegion) {
          return {
            shouldReproduce: true,
            trigger: ReproductionTrigger.GEOGRAPHIC_DEMAND,
            reason: `${(percentage * 100).toFixed(1)}% of connections from ${region}, no local agent`,
            urgency: 'medium',
            childConfig: {
              initialMetrics: this.estimateRegionalMetrics(region, count),
              targetCostPerDay: 5.0,
              role: 'replica'
            }
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if redundancy requires additional agents
   */
  private async checkRedundancy(): Promise<ReproductionDecision | null> {
    const childCount = await this.children.getActiveCount();

    // Minimum redundancy: 3 agents for fault tolerance
    if (childCount < 2) {
      return {
        shouldReproduce: true,
        trigger: ReproductionTrigger.REDUNDANCY,
        reason: `Only ${childCount + 1} active agents, need at least 3 for redundancy`,
        urgency: childCount === 0 ? 'high' : 'medium',
        childConfig: {
          initialMetrics: this.getAverageMetrics(),
          targetCostPerDay: 5.0,
          role: 'replica'
        }
      };
    }

    return null;
  }

  /**
   * Check if specialized agents are needed
   */
  private async checkSpecialization(): Promise<ReproductionDecision | null> {
    // Example: Heavy video uploads might require specialized agent
    const metrics = await this.metrics.getCurrentMetrics();
    const videoEventPercent = metrics.eventsByKind[71] / metrics.totalEvents;

    if (videoEventPercent > 0.2) {
      const hasVideoSpecialist = await this.children.hasSpecialist('video');

      if (!hasVideoSpecialist) {
        return {
          shouldReproduce: true,
          trigger: ReproductionTrigger.SPECIALIZATION,
          reason: `${(videoEventPercent * 100).toFixed(1)}% video events, need specialized handler`,
          urgency: 'low',
          childConfig: {
            initialMetrics: this.estimateVideoMetrics(metrics),
            targetCostPerDay: 8.0, // Higher cost for video processing
            role: 'specialized'
          }
        };
      }
    }

    return null;
  }

  /**
   * Check scheduled reproduction
   */
  private async checkScheduled(): Promise<ReproductionDecision | null> {
    // Example: Monthly spawn a backup agent
    const lastReproduction = await this.children.getLastReproductionDate();
    const daysSince = (Date.now() - lastReproduction.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince > 30) {
      return {
        shouldReproduce: true,
        trigger: ReproductionTrigger.SCHEDULED,
        reason: `Scheduled monthly reproduction (${daysSince.toFixed(0)} days since last)`,
        urgency: 'low',
        childConfig: {
          initialMetrics: this.getAverageMetrics(),
          targetCostPerDay: 5.0,
          role: 'replica'
        }
      };
    }

    return null;
  }

  private async canScaleVertically(): Promise<boolean> {
    const currentResources = await this.getCurrentResources();
    return currentResources.cpuUnits < 8 && currentResources.memorySize !== "16Gi";
  }

  private estimateChildMetrics(parentMetrics: any): TrafficMetrics {
    // Child should handle ~50% of parent's load
    return {
      eventsPerSecond: parentMetrics.eventsPerSecond * 0.5,
      activeConnections: parentMetrics.activeConnections * 0.5,
      cacheSize: parentMetrics.cacheSize * 0.5,
      storageUsed: 1024 * 1024 * 1024 * 10 // Start with 10GB
    };
  }

  private estimateRegionalMetrics(region: string, connections: number): TrafficMetrics {
    // Estimate based on regional connections
    return {
      eventsPerSecond: connections * 0.1,
      activeConnections: connections,
      cacheSize: 1024 * 1024 * 100, // 100MB
      storageUsed: 1024 * 1024 * 1024 * 10 // 10GB
    };
  }

  private estimateVideoMetrics(parentMetrics: any): TrafficMetrics {
    // Video specialist needs more storage, less CPU
    return {
      eventsPerSecond: 5,
      activeConnections: 50,
      cacheSize: 1024 * 1024 * 500, // 500MB
      storageUsed: 1024 * 1024 * 1024 * 100 // 100GB
    };
  }

  private getAverageMetrics(): TrafficMetrics {
    return {
      eventsPerSecond: 10,
      activeConnections: 100,
      cacheSize: 1024 * 1024 * 100,
      storageUsed: 1024 * 1024 * 1024 * 10
    };
  }

  private async getCurrentResources(): Promise<ResourceRequirements> {
    // Query current SDL
    return {
      cpuUnits: 2,
      memorySize: "4Gi",
      storageSize: "100Gi",
      maxPricePerBlock: 2000
    };
  }
}
```

### Reproduction Lifecycle

```
┌─────────────────────────────────────┐
│   Reproduction Decision Engine      │
│   (evaluates triggers every hour)   │
└──────────────┬──────────────────────┘
               │
               │ shouldReproduce = true
               ▼
┌─────────────────────────────────────┐
│   Check Treasury & Quota            │
│   (can we afford child?)            │
└──────────────┬──────────────────────┘
               │ yes
               ▼
┌─────────────────────────────────────┐
│   Generate Child Identity           │
│   (mnemonic, keys, agent ID)        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Allocate Treasury Funds           │
│   (transfer AKT & CRO to child)     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Deploy Child to Akash             │
│   (SDL generation, bidding, lease)  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Register Child in Parent Registry │
│   (track child for monitoring)      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Activate Child Autonomous Mode    │
│   (child now self-manages)          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Monitor Child Health              │
│   (parent receives heartbeats)      │
└─────────────────────────────────────┘
```

---

## Treasury Integration

### AKT Payment Flow

```typescript
// packages/agent-deployment/src/treasury/akt-payments.ts

export class AKTPaymentManager {
  private wallet: AkashWallet;
  private treasury: TreasuryManager;

  /**
   * Ensure sufficient AKT balance for lease payments
   */
  async ensureSufficientBalance(
    requiredAmount: number,
    daysBuffer: number = 7
  ): Promise<void> {
    const currentBalance = await this.wallet.getBalance();
    const dailyCost = await this.estimateDailyCost();
    const requiredBalance = dailyCost * daysBuffer;

    if (currentBalance < requiredBalance) {
      const shortfall = requiredBalance - currentBalance;
      console.log(`AKT balance low: ${currentBalance} AKT, need ${requiredBalance} AKT`);

      // Trigger swap from treasury
      await this.treasury.swapToAKT(shortfall * 1.1); // 10% buffer
    }
  }

  /**
   * Pay for lease (called by Akash during lease creation/renewal)
   */
  async payForLease(leaseId: string, amount: number): Promise<string> {
    console.log(`Paying for lease ${leaseId}: ${amount} uAKT`);

    // Check balance
    await this.ensureSufficientBalance(amount / 1000000);

    // Submit payment transaction
    const tx = await this.wallet.sendPayment({
      to: 'provider_escrow_address',
      amount: amount,
      memo: `Lease payment: ${leaseId}`
    });

    console.log(`Payment sent: ${tx.hash}`);

    // Wait for confirmation
    await this.wallet.waitForConfirmation(tx.hash);

    return tx.hash;
  }

  /**
   * Estimate daily cost based on current lease
   */
  private async estimateDailyCost(): Promise<number> {
    // Query current lease details
    // Calculate cost per block * blocks per day
    return 5.0; // $5/day in AKT equivalent
  }
}
```

### Treasury Swap Integration

```typescript
// packages/agent-deployment/src/treasury/swap-integration.ts

export class TreasurySwapIntegration {
  private cronosWallet: CronosWallet;
  private dexRouter: DexRouter;

  /**
   * Swap CRO to AKT via DEX
   */
  async swapCROToAKT(
    aktAmount: number,
    slippageTolerance: number = 0.02 // 2%
  ): Promise<string> {
    console.log(`Swapping for ${aktAmount} AKT...`);

    // Get quote from DEX
    const quote = await this.dexRouter.getQuote({
      from: 'CRO',
      to: 'AKT',
      amountOut: aktAmount
    });

    const croRequired = quote.amountIn;
    const maxCro = croRequired * (1 + slippageTolerance);

    console.log(`Quote: ${croRequired} CRO for ${aktAmount} AKT (max: ${maxCro} CRO)`);

    // Check CRO balance
    const croBalance = await this.cronosWallet.getBalance();
    if (croBalance < maxCro) {
      throw new Error(`Insufficient CRO balance: ${croBalance} < ${maxCro}`);
    }

    // Execute swap
    const tx = await this.dexRouter.swap({
      from: 'CRO',
      to: 'AKT',
      amountIn: croRequired,
      amountOutMin: aktAmount * (1 - slippageTolerance),
      deadline: Date.now() + 300000 // 5 minutes
    });

    console.log(`Swap executed: ${tx.hash}`);

    // Wait for confirmation and bridge to Akash
    await this.waitForSwapAndBridge(tx.hash, aktAmount);

    return tx.hash;
  }

  /**
   * Wait for swap confirmation and bridge AKT to Akash chain
   */
  private async waitForSwapAndBridge(
    txHash: string,
    expectedAkt: number
  ): Promise<void> {
    // Wait for swap confirmation
    await this.cronosWallet.waitForConfirmation(txHash);

    // Bridge AKT from Cronos to Akash chain (if needed)
    // This depends on where AKT is traded (might be wrapped AKT on Cronos)

    console.log(`✓ Swap and bridge complete: ${expectedAkt} AKT`);
  }
}
```

---

## Monitoring and Alerts

### Alert Channels

```typescript
export enum AlertChannel {
  CONSOLE = 'console',
  EMAIL = 'email',
  SLACK = 'slack',
  TELEGRAM = 'telegram',
  WEBHOOK = 'webhook',
  NOSTR = 'nostr', // Send Nostr DM to operator
}

export interface Alert {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  metadata: Record<string, any>;
  channels: AlertChannel[];
}
```

### Alerting Service

```typescript
// packages/agent-deployment/src/monitoring/alerting.ts

export class AlertingService {
  private channels: Map<AlertChannel, AlertChannelHandler>;

  constructor() {
    this.channels = new Map();
    this.initializeChannels();
  }

  /**
   * Send alert to configured channels
   */
  async sendAlert(alert: Omit<Alert, 'id' | 'timestamp'>): Promise<void> {
    const fullAlert: Alert = {
      ...alert,
      id: this.generateAlertId(),
      timestamp: new Date(),
      channels: this.getChannelsForSeverity(alert.severity)
    };

    console.log(`🚨 ALERT [${fullAlert.severity.toUpperCase()}]: ${fullAlert.title}`);
    console.log(fullAlert.message);

    // Send to each channel in parallel
    const sendPromises = fullAlert.channels.map(async (channel) => {
      const handler = this.channels.get(channel);
      if (handler) {
        try {
          await handler.send(fullAlert);
        } catch (error) {
          console.error(`Failed to send alert via ${channel}:`, error);
        }
      }
    });

    await Promise.all(sendPromises);

    // Store alert in database
    await this.storeAlert(fullAlert);
  }

  /**
   * Get alert channels based on severity
   */
  private getChannelsForSeverity(severity: string): AlertChannel[] {
    switch (severity) {
      case 'critical':
        return [
          AlertChannel.CONSOLE,
          AlertChannel.SLACK,
          AlertChannel.TELEGRAM,
          AlertChannel.EMAIL,
          AlertChannel.NOSTR
        ];
      case 'high':
        return [
          AlertChannel.CONSOLE,
          AlertChannel.SLACK,
          AlertChannel.TELEGRAM
        ];
      case 'medium':
        return [
          AlertChannel.CONSOLE,
          AlertChannel.SLACK
        ];
      case 'low':
      default:
        return [AlertChannel.CONSOLE];
    }
  }

  private initializeChannels(): void {
    this.channels.set(AlertChannel.CONSOLE, new ConsoleAlertHandler());
    this.channels.set(AlertChannel.SLACK, new SlackAlertHandler());
    this.channels.set(AlertChannel.TELEGRAM, new TelegramAlertHandler());
    this.channels.set(AlertChannel.EMAIL, new EmailAlertHandler());
    this.channels.set(AlertChannel.NOSTR, new NostrAlertHandler());
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async storeAlert(alert: Alert): Promise<void> {
    // Store in database for history/analytics
  }
}

// Alert channel handlers
interface AlertChannelHandler {
  send(alert: Alert): Promise<void>;
}

class ConsoleAlertHandler implements AlertChannelHandler {
  async send(alert: Alert): Promise<void> {
    // Already logged by main service
  }
}

class SlackAlertHandler implements AlertChannelHandler {
  async send(alert: Alert): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) return;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `*${alert.title}*`,
        attachments: [{
          color: this.getSeverityColor(alert.severity),
          text: alert.message,
          fields: this.formatMetadata(alert.metadata),
          ts: Math.floor(alert.timestamp.getTime() / 1000)
        }]
      })
    });
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'medium': return '#FFA500';
      case 'low': return 'good';
      default: return '#808080';
    }
  }

  private formatMetadata(metadata: Record<string, any>): any[] {
    return Object.entries(metadata).map(([key, value]) => ({
      title: key,
      value: JSON.stringify(value),
      short: true
    }));
  }
}

class TelegramAlertHandler implements AlertChannelHandler {
  async send(alert: Alert): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    const message = [
      `🚨 *${alert.title}*`,
      `Severity: ${alert.severity.toUpperCase()}`,
      '',
      alert.message,
      '',
      '```json',
      JSON.stringify(alert.metadata, null, 2),
      '```'
    ].join('\n');

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });
  }
}

class EmailAlertHandler implements AlertChannelHandler {
  async send(alert: Alert): Promise<void> {
    // Send email via SendGrid, AWS SES, etc.
  }
}

class NostrAlertHandler implements AlertChannelHandler {
  async send(alert: Alert): Promise<void> {
    // Send encrypted DM to operator's Nostr pubkey
    const operatorPubkey = process.env.OPERATOR_NOSTR_PUBKEY;
    if (!operatorPubkey) return;

    const event = {
      kind: 14, // NIP-17 private DM
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['p', operatorPubkey]
      ],
      content: JSON.stringify({
        title: alert.title,
        severity: alert.severity,
        message: alert.message,
        metadata: alert.metadata
      })
    };

    // Sign and send to relays
    // Implementation depends on nostr-tools
  }
}
```

### Metrics Dashboard

```typescript
// packages/agent-deployment/src/monitoring/dashboard.ts

export class MetricsDashboard {
  /**
   * Expose metrics in Prometheus format
   */
  async getPrometheusMetrics(): Promise<string> {
    const metrics = await this.collectMetrics();

    return [
      `# HELP agent_events_per_second Current event processing rate`,
      `# TYPE agent_events_per_second gauge`,
      `agent_events_per_second ${metrics.eventsPerSecond}`,
      '',
      `# HELP agent_active_connections Current WebSocket connections`,
      `# TYPE agent_active_connections gauge`,
      `agent_active_connections ${metrics.activeConnections}`,
      '',
      `# HELP agent_resource_usage_percent Resource usage percentage`,
      `# TYPE agent_resource_usage_percent gauge`,
      `agent_resource_usage_percent{resource="cpu"} ${metrics.cpuPercent}`,
      `agent_resource_usage_percent{resource="memory"} ${metrics.memoryPercent}`,
      `agent_resource_usage_percent{resource="disk"} ${metrics.diskPercent}`,
      '',
      `# HELP agent_lease_expiration_hours Hours until lease expiration`,
      `# TYPE agent_lease_expiration_hours gauge`,
      `agent_lease_expiration_hours ${metrics.leaseExpirationHours}`,
      '',
      `# HELP agent_treasury_balance Treasury balance by asset`,
      `# TYPE agent_treasury_balance gauge`,
      `agent_treasury_balance{asset="AKT"} ${metrics.balances.AKT}`,
      `agent_treasury_balance{asset="CRO"} ${metrics.balances.CRO}`,
      '',
      `# HELP agent_children_count Number of child agents`,
      `# TYPE agent_children_count gauge`,
      `agent_children_count{status="active"} ${metrics.children.active}`,
      `agent_children_count{status="failed"} ${metrics.children.failed}`,
    ].join('\n');
  }

  private async collectMetrics(): Promise<any> {
    // Collect from various sources
    return {
      eventsPerSecond: 0,
      activeConnections: 0,
      cpuPercent: 0,
      memoryPercent: 0,
      diskPercent: 0,
      leaseExpirationHours: 0,
      balances: { AKT: 0, CRO: 0 },
      children: { active: 0, failed: 0 }
    };
  }
}
```

---

## Code Examples

### Complete Deployment Flow

```typescript
// packages/agent-deployment/src/examples/full-deployment.ts

import { ManualBootstrap } from '../bootstrap/manual-bootstrap';
import { LeaseStateMachine, LeaseEvent } from '../lease-state-machine';
import { SDLGenerator } from '../sdl-generator';
import { ProviderSelector, DEFAULT_PREFERENCES } from '../provider-selection';
import { KeyManager, KeyStorageBackend } from '../key-management';
import { HealthMonitor } from '../health-monitor';
import { FailureHandler } from '../failure-handler';
import { AlertingService } from '../monitoring/alerting';

async function deployFirstAgent() {
  console.log('🚀 Starting autonomous agent deployment...\n');

  // Initialize services
  const bootstrap = new ManualBootstrap();
  const stateMachine = new LeaseStateMachine();
  const sdlGenerator = new SDLGenerator();
  const providerSelector = new ProviderSelector();
  const alerting = new AlertingService();

  try {
    // Step 1: Generate identity
    console.log('Step 1: Generating agent identity...');
    stateMachine.transition(LeaseEvent.DEPLOY_REQUESTED);

    const identity = await bootstrap.generateIdentity();
    console.log(`✓ Agent ID: ${identity.agentId}`);
    console.log(`✓ Mnemonic: ${identity.mnemonic}`);
    console.log('⚠️  SAVE THIS MNEMONIC SECURELY!\n');

    // Step 2: Fund accounts
    console.log('Step 2: Funding accounts...');
    await bootstrap.fundAccounts(identity);

    // Step 3: Generate SDL
    console.log('\nStep 3: Generating deployment manifest...');
    stateMachine.transition(LeaseEvent.SDL_GENERATED);

    const config = {
      agentId: identity.agentId,
      agentPrivateKey: identity.keys.agentPrivateKey,
      akashAddress: deriveAddress(identity.keys.akashPrivateKey, 'akash'),
      relayName: `Autonomous Agent ${identity.agentId}`,
      relayPubkey: derivePublicKey(identity.keys.agentPrivateKey),
      domain: `${identity.agentId}.akash.network`
    };

    const sdl = sdlGenerator.generateSDL(
      config,
      {
        eventsPerSecond: 10,
        activeConnections: 100,
        cacheSize: 1024 * 1024 * 100,
        storageUsed: 1024 * 1024 * 1024 * 10
      },
      5.0 // $5/day target
    );

    console.log('✓ SDL generated\n');

    // Step 4: Deploy to Akash
    console.log('Step 4: Deploying to Akash Network...');
    const deployment = await bootstrap.deployToAkash(identity);

    stateMachine.transition(LeaseEvent.DEPLOYMENT_COMPLETE);
    stateMachine.transition(LeaseEvent.SERVICES_READY);

    console.log(`✓ Deployment complete!`);
    console.log(`   URL: ${deployment.uri}`);
    console.log(`   Lease ID: ${deployment.leaseId}\n`);

    // Step 5: Activate autonomous mode
    console.log('Step 5: Activating autonomous mode...');
    await bootstrap.activateAutonomousMode(identity, deployment);

    stateMachine.transition(LeaseEvent.HEALTH_CHECK_PASSED);

    console.log('✓ Agent is now autonomous!\n');

    // Step 6: Start monitoring
    console.log('Step 6: Starting health monitoring...');
    const healthMonitor = new HealthMonitor(
      new FailureHandler(/* ... */),
      stateMachine,
      alerting
    );
    healthMonitor.startMonitoring();

    console.log('✓ Monitoring active\n');

    // Success notification
    await alerting.sendAlert({
      title: 'Agent Deployed Successfully',
      severity: 'low',
      message: `Agent ${identity.agentId} is now operational at ${deployment.uri}`,
      metadata: {
        agentId: identity.agentId,
        leaseId: deployment.leaseId,
        provider: deployment.providerAddress
      }
    });

    console.log('🎉 Deployment complete! Agent is self-managing.');

  } catch (error) {
    console.error('❌ Deployment failed:', error);

    await alerting.sendAlert({
      title: 'Agent Deployment Failed',
      severity: 'critical',
      message: error.message,
      metadata: { error: error.stack }
    });

    throw error;
  }
}

// Helper functions
function deriveAddress(privateKey: string, chain: string): string {
  // Implementation
  return '';
}

function derivePublicKey(privateKey: string): string {
  // Implementation
  return '';
}

// Run deployment
if (require.main === module) {
  deployFirstAgent()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
```

---

## Cost Estimation Calculator

```typescript
// packages/agent-deployment/src/utils/cost-calculator.ts

export interface CostBreakdown {
  cpuCost: number;
  memoryCost: number;
  storageCost: number;
  networkCost: number;
  totalPerBlock: number;
  totalPerDay: number;
  totalPerMonth: number;
}

export class CostCalculator {
  private readonly BLOCKS_PER_DAY = 14400; // ~6 second blocks
  private readonly DAYS_PER_MONTH = 30;

  // Akash pricing (uAKT per block)
  private readonly CPU_PRICE_PER_CORE = 100;      // 100 uAKT per core per block
  private readonly MEMORY_PRICE_PER_GB = 50;      // 50 uAKT per GB per block
  private readonly STORAGE_PRICE_PER_GB = 10;     // 10 uAKT per GB per block
  private readonly NETWORK_PRICE_BASE = 20;       // 20 uAKT base network per block

  /**
   * Calculate cost for given resources
   */
  calculateCost(resources: ResourceRequirements): CostBreakdown {
    const cpuCost = resources.cpuUnits * this.CPU_PRICE_PER_CORE;

    const memoryGB = this.parseSize(resources.memorySize);
    const memoryCost = memoryGB * this.MEMORY_PRICE_PER_GB;

    const storageGB = this.parseSize(resources.storageSize);
    const storageCost = storageGB * this.STORAGE_PRICE_PER_GB;

    const networkCost = this.NETWORK_PRICE_BASE;

    const totalPerBlock = cpuCost + memoryCost + storageCost + networkCost;
    const totalPerDay = totalPerBlock * this.BLOCKS_PER_DAY;
    const totalPerMonth = totalPerDay * this.DAYS_PER_MONTH;

    return {
      cpuCost,
      memoryCost,
      storageCost,
      networkCost,
      totalPerBlock,
      totalPerDay,
      totalPerMonth
    };
  }

  /**
   * Calculate resources needed for target daily cost
   */
  calculateResourcesForBudget(
    targetDailyCostUSD: number,
    aktPriceUSD: number
  ): ResourceRequirements {
    // Convert USD to AKT
    const targetDailyCostAKT = targetDailyCostUSD / aktPriceUSD;
    const targetDailyCostuAKT = targetDailyCostAKT * 1000000;

    // Calculate max price per block
    const maxPricePerBlock = Math.floor(targetDailyCostuAKT / this.BLOCKS_PER_DAY);

    // Work backwards to find resource allocation
    // Simple heuristic: 60% CPU, 20% memory, 15% storage, 5% network
    const cpuBudget = maxPricePerBlock * 0.60;
    const memoryBudget = maxPricePerBlock * 0.20;
    const storageBudget = maxPricePerBlock * 0.15;

    const cpuUnits = Math.min(8, Math.floor(cpuBudget / this.CPU_PRICE_PER_CORE));
    const memoryGB = Math.min(16, Math.floor(memoryBudget / this.MEMORY_PRICE_PER_GB));
    const storageGB = Math.min(500, Math.floor(storageBudget / this.STORAGE_PRICE_PER_GB));

    return {
      cpuUnits: Math.max(2, cpuUnits),
      memorySize: `${Math.max(4, memoryGB)}Gi`,
      storageSize: `${Math.max(100, storageGB)}Gi`,
      maxPricePerBlock
    };
  }

  /**
   * Display cost breakdown
   */
  displayCostBreakdown(
    resources: ResourceRequirements,
    aktPriceUSD: number
  ): void {
    const cost = this.calculateCost(resources);

    console.log('\n📊 Cost Breakdown:');
    console.log('━'.repeat(50));
    console.log(`CPU (${resources.cpuUnits} cores):     ${cost.cpuCost} uAKT/block`);
    console.log(`Memory (${resources.memorySize}):      ${cost.memoryCost} uAKT/block`);
    console.log(`Storage (${resources.storageSize}):    ${cost.storageCost} uAKT/block`);
    console.log(`Network:            ${cost.networkCost} uAKT/block`);
    console.log('─'.repeat(50));
    console.log(`Total per block:    ${cost.totalPerBlock} uAKT`);
    console.log(`Total per day:      ${(cost.totalPerDay / 1000000).toFixed(6)} AKT ($${(cost.totalPerDay / 1000000 * aktPriceUSD).toFixed(2)})`);
    console.log(`Total per month:    ${(cost.totalPerMonth / 1000000).toFixed(6)} AKT ($${(cost.totalPerMonth / 1000000 * aktPriceUSD).toFixed(2)})`);
    console.log('━'.repeat(50) + '\n');
  }

  private parseSize(size: string): number {
    const match = size.match(/(\d+)Gi/);
    return match ? parseInt(match[1]) : 0;
  }
}

// Example usage
if (require.main === module) {
  const calculator = new CostCalculator();

  // Example 1: Calculate cost for specific resources
  const resources: ResourceRequirements = {
    cpuUnits: 4,
    memorySize: "8Gi",
    storageSize: "100Gi",
    maxPricePerBlock: 0
  };

  calculator.displayCostBreakdown(resources, 0.50); // AKT = $0.50

  // Example 2: Find resources for $5/day budget
  console.log('\n🎯 Resources for $5/day budget:');
  const budgetResources = calculator.calculateResourcesForBudget(5.0, 0.50);
  calculator.displayCostBreakdown(budgetResources, 0.50);
}
```

---

## Summary

This document defines a complete self-deployment system for autonomous Nostr-ILP relay agents on Akash Network. Key features include:

1. **Dynamic SDL Generation** - Automatically adjusts compute resources based on traffic
2. **Autonomous Lease Management** - Full lifecycle from bidding to renewal
3. **Provider Selection** - Multi-criteria scoring for optimal placement
4. **Secure Key Management** - Multiple backend options with rotation support
5. **Comprehensive Failure Handling** - Recovery procedures for all failure modes
6. **Bootstrap Process** - Both manual (first agent) and autonomous (reproduction)
7. **Agent Reproduction** - Self-spawning based on load, geography, and redundancy
8. **Treasury Integration** - Automated AKT payments with DEX swaps
9. **Monitoring & Alerts** - Multi-channel alerting with severity-based routing

The system enables true agent autonomy while maintaining reliability and cost efficiency at the target of $3-6/day per agent.

**Next Steps:**
1. Implement Akash SDK integration (TypeScript client)
2. Build key management vault integration
3. Create reproduction decision engine
4. Develop monitoring dashboard
5. Test full deployment flow on Akash testnet
6. Implement treasury DEX swap integration
7. Add Grafana/Prometheus metrics
8. Create deployment runbook (see next document)

---

*Document Status: Complete*
*Last Updated: 2025-12-05*
*Author: Claude (Autonomous Agent Design)*
