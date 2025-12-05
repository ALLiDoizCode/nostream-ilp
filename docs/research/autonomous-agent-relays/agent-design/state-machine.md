# Agent State Machine Specification

**Research Document**
**Author:** Claude Code (AI Research Assistant)
**Date:** 2025-12-05
**Status:** Phase 2 - Agent Design Research
**Version:** 1.0.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [State Definitions](#state-definitions)
3. [State Transition Table](#state-transition-table)
4. [State Machine Diagram](#state-machine-diagram)
5. [Entry/Exit Actions](#entryexit-actions)
6. [Error Handling & Recovery](#error-handling--recovery)
7. [State Persistence](#state-persistence)
8. [Monitoring & Observability](#monitoring--observability)
9. [Failure Modes & Mitigation](#failure-modes--mitigation)
10. [Configuration Schema](#configuration-schema)
11. [Implementation Examples](#implementation-examples)

---

## Executive Summary

### Purpose

The agent state machine defines **all possible states** an autonomous relay+connector node can be in, and the **valid transitions** between states. This ensures predictable, recoverable behavior even under adverse conditions.

### Key States

| State | Purpose | Duration | Can Resume After Restart? |
|-------|---------|----------|---------------------------|
| **BOOTSTRAPPING** | Initialize, connect to network | 30-60 seconds | ✅ Yes |
| **RUNNING** | Normal operation (accepting events) | Hours-Days | ✅ Yes |
| **MAINTENANCE** | Routine maintenance (swaps, backups) | 5-30 seconds | ✅ Yes |
| **DEGRADED** | Partial failure (limited service) | Minutes-Hours | ✅ Yes |
| **EMERGENCY** | Critical failure (no new events) | Minutes | ✅ Yes |
| **SHUTDOWN** | Graceful shutdown | 5-10 seconds | ❌ No |
| **STOPPED** | Fully stopped | Indefinite | ❌ No |

### Design Principles

1. **Always Recoverable** - Every state (except STOPPED) can resume after restart
2. **Fail-Safe** - Default to conservative behavior (reject events if uncertain)
3. **Observable** - Emit metrics and logs for every transition
4. **Deterministic** - Same inputs → same transitions (no randomness in core logic)
5. **Idempotent** - Entry/exit actions can be run multiple times safely

---

## State Definitions

### State 1: BOOTSTRAPPING

**Purpose:** Agent is initializing and connecting to the network.

**Characteristics:**
- 🔴 **Not Accepting Events** - Rejecting all incoming events
- 🟡 **Connecting to Peers** - Establishing BTP sessions
- 🟡 **Loading State** - Reading database, balances, configuration
- 🟡 **Verifying Treasury** - Checking wallet balances on-chain

**Entry Actions:**
1. Load configuration from `config.yaml`
2. Initialize database connections (PostgreSQL, SQLite)
3. Load agent state from `agent_state` table
4. Query blockchain balances (BTC, ETH, AKT, XRP)
5. Download Bootstrap Node List (BNL)
6. Download Known Node List (KNL) from bootstrap nodes
7. Apply anti-Sybil filtering
8. Initiate peering requests to top 20 nodes

**Exit Actions:**
1. Verify at least 3 peers connected
2. Verify treasury balance > minimum (100 AKT)
3. Emit metric: `agent_bootstrap_duration_seconds`
4. Log: "Agent bootstrapped successfully"

**Transition Triggers:**
- ✅ → **RUNNING**: Minimum 3 peers connected AND treasury balance sufficient
- ❌ → **EMERGENCY**: Bootstrap timeout (5 minutes) OR treasury balance too low

**Typical Duration:** 30-60 seconds

---

### State 2: RUNNING

**Purpose:** Normal operation - agent is accepting events and routing payments.

**Characteristics:**
- 🟢 **Accepting Events** - Processing 100+ events/sec
- 🟢 **Routing ILP Packets** - Forwarding payments to peers
- 🟢 **Earning Revenue** - Recording fees from events
- 🟢 **Monitoring Health** - Tracking metrics (latency, throughput, errors)

**Entry Actions:**
1. Enable event handlers (Nostr, ILP)
2. Start WebSocket bridge (if configured)
3. Resume active subscriptions
4. Emit metric: `agent_state{state="running"} = 1`
5. Log: "Agent entering RUNNING state"

**Exit Actions:**
1. Flush pending events to database
2. Save current agent state
3. Emit metric: `agent_state{state="running"} = 0`

**Periodic Activities (while RUNNING):**

| Activity | Frequency | Actor |
|----------|-----------|-------|
| Adjust pricing | Every 1 minute | PricingEngineActor |
| Rebalance treasury | Every 1 hour | TreasuryManagerActor |
| Evaluate peers | Every 5 minutes | PeerEvaluationActor |
| Backup events | Every 24 hours | ArweaveBackupActor |
| Health check | Every 30 seconds | MonitoringActor |

**Transition Triggers:**
- 🟡 → **MAINTENANCE**: Scheduled maintenance window OR manual trigger
- 🟠 → **DEGRADED**: Error rate > 5% OR peer count < 3 OR treasury balance < 50 AKT
- 🔴 → **EMERGENCY**: Critical error (database down, all peers disconnected)
- ⚫ → **SHUTDOWN**: Manual shutdown command OR SIGTERM received

**Typical Duration:** Hours to Days

---

### State 3: MAINTENANCE

**Purpose:** Performing routine maintenance tasks (treasury swaps, Akash renewal, backups).

**Characteristics:**
- 🟡 **Limited Event Processing** - Accepting events with increased fees (2x)
- 🔵 **Performing Maintenance** - Executing swaps, backups, updates
- 🟢 **Routing Still Active** - ILP routing continues

**Entry Actions:**
1. Increase pricing multiplier: `pricing.demandAdjustment = 2.0`
2. Emit metric: `agent_state{state="maintenance"} = 1`
3. Log: "Agent entering MAINTENANCE state"
4. Notify peers via NIP-11 relay info update

**Maintenance Tasks:**
- Treasury rebalancing (ETH → AKT swap)
- Arweave event backup
- Akash deployment renewal
- Database vacuum/optimize
- Log rotation

**Exit Actions:**
1. Reset pricing multiplier: `pricing.demandAdjustment = 1.0`
2. Emit metric: `agent_state{state="maintenance"} = 0`
3. Verify maintenance task completed successfully

**Transition Triggers:**
- ✅ → **RUNNING**: Maintenance task completed successfully
- 🔴 → **EMERGENCY**: Maintenance task failed AND critical (e.g., treasury swap failed, balance too low)
- 🟡 → **RUNNING**: Maintenance timeout (30 minutes) - abort task, log error

**Typical Duration:** 5-30 seconds (swaps), 1-5 minutes (backups)

---

### State 4: DEGRADED

**Purpose:** Agent is operational but with reduced capacity (some systems failing).

**Characteristics:**
- 🟡 **Accepting Events (Reduced)** - Processing 50% of normal capacity
- 🔴 **Some Systems Down** - e.g., Redis cache down, some peers disconnected
- 🟠 **High Error Rate** - 5-10% of requests failing
- 🟡 **Attempting Recovery** - Reconnecting peers, retrying failed operations

**Entry Actions:**
1. Reduce throughput limit: `maxEventsPerSecond = 50`
2. Increase base price: `pricing.basePrice = 200` (2x)
3. Emit metric: `agent_state{state="degraded"} = 1`
4. Emit alert: `agent_degraded{reason="..."}`
5. Log: "Agent entering DEGRADED state: {reason}"

**Recovery Activities:**
- Reconnect to disconnected peers
- Retry failed database operations
- Restart Redis cache (if down)
- Clear event processing queue (if backed up)

**Exit Actions:**
1. Restore normal throughput: `maxEventsPerSecond = 100`
2. Restore normal pricing: `pricing.basePrice = 100`
3. Emit metric: `agent_state{state="degraded"} = 0`
4. Verify systems healthy (peers > 3, error rate < 1%)

**Transition Triggers:**
- ✅ → **RUNNING**: All systems recovered (error rate < 1%, peers ≥ 3)
- 🔴 → **EMERGENCY**: Condition worsens (peers = 0, database down, treasury empty)
- 🟡 → **MAINTENANCE**: Manual maintenance triggered to fix issue

**Typical Duration:** Minutes to Hours

---

### State 5: EMERGENCY

**Purpose:** Critical failure - agent cannot process events safely.

**Characteristics:**
- 🔴 **Rejecting All Events** - Returning error to clients
- 🔴 **Critical System Down** - Database, all peers, or treasury depleted
- 🔵 **Emergency Recovery** - Attempting to restore minimal functionality
- 📢 **Alerting Operator** - Sending alerts (if configured)

**Entry Actions:**
1. Disable event handlers (stop accepting new events)
2. Emit metric: `agent_state{state="emergency"} = 1`
3. Emit alert: `agent_emergency{reason="..."}`
4. Log: "EMERGENCY: {detailed_reason}"
5. Attempt to notify operator (email, webhook, Telegram)

**Emergency Recovery Procedures:**

| Failure | Recovery Procedure |
|---------|-------------------|
| **Database Down** | 1. Retry connection (3 attempts, 5s interval)<br>2. Fallback to SQLite (temporary)<br>3. Alert operator |
| **All Peers Disconnected** | 1. Re-download BNL/KNL<br>2. Reset session keys<br>3. Initiate new peering requests |
| **Treasury Empty** | 1. Check pending settlements<br>2. Attempt emergency swap (if balances in other tokens)<br>3. Alert operator to fund wallet |
| **Akash Deployment Failed** | 1. Redeploy with fallback provider<br>2. Reduce resource requirements (cheaper)<br>3. Alert operator |

**Exit Actions:**
1. Re-enable event handlers
2. Emit metric: `agent_state{state="emergency"} = 0`
3. Verify critical system restored

**Transition Triggers:**
- ✅ → **DEGRADED**: Partial recovery (e.g., 1 peer connected, database up but slow)
- ✅ → **RUNNING**: Full recovery (all systems healthy)
- ⚫ → **SHUTDOWN**: Manual shutdown OR unrecoverable failure after 30 minutes

**Typical Duration:** Minutes (ideally), could be Hours if operator intervention needed

---

### State 6: SHUTDOWN

**Purpose:** Agent is gracefully shutting down.

**Characteristics:**
- 🔴 **Rejecting New Events** - Returning "shutting down" errors
- 🟡 **Draining Queue** - Processing remaining events in queue
- 🟡 **Saving State** - Flushing database writes, saving agent state
- 🟡 **Closing Connections** - Gracefully closing peer sessions

**Entry Actions:**
1. Disable event handlers (reject new events)
2. Emit metric: `agent_state{state="shutdown"} = 1`
3. Log: "Agent initiating graceful shutdown"
4. Set shutdown deadline: `shutdownDeadline = Date.now() + 10000` (10 seconds)

**Shutdown Procedures:**
1. Stop accepting new events
2. Wait for event queue to drain (max 5 seconds)
3. Flush all database writes
4. Save agent state to `agent_state` table
5. Close all peer BTP sessions
6. Close database connections
7. Stop HTTP servers (WebSocket bridge, monitoring)

**Exit Actions:**
1. Emit metric: `agent_state{state="shutdown"} = 0`
2. Emit metric: `agent_shutdown_duration_seconds`
3. Log: "Agent shutdown complete"

**Transition Triggers:**
- ⚫ → **STOPPED**: Shutdown procedures completed OR deadline reached (force stop)

**Typical Duration:** 5-10 seconds

---

### State 7: STOPPED

**Purpose:** Agent is fully stopped (no longer running).

**Characteristics:**
- ⚫ **Not Running** - Process exited
- 💾 **State Persisted** - All state saved to database
- 🔄 **Can Restart** - On restart, will enter BOOTSTRAPPING

**Entry Actions:**
- (None - process is terminating)

**Exit Actions:**
- (None - process has exited)

**Transition Triggers:**
- 🔄 → **BOOTSTRAPPING**: Process restarted (systemd, Docker, Akash)

**Typical Duration:** Indefinite (until restarted)

---

## State Transition Table

### Transition Matrix

| From ↓ / To → | BOOTSTRAPPING | RUNNING | MAINTENANCE | DEGRADED | EMERGENCY | SHUTDOWN | STOPPED |
|---------------|---------------|---------|-------------|----------|-----------|----------|---------|
| **BOOTSTRAPPING** | - | ✅ Normal | ❌ | ❌ | ⚠️ Timeout | ⚠️ Manual | ❌ |
| **RUNNING** | ❌ | - | ✅ Scheduled | ⚠️ Error | ⚠️ Critical | ✅ Manual | ❌ |
| **MAINTENANCE** | ❌ | ✅ Complete | - | ❌ | ⚠️ Failed | ⚠️ Manual | ❌ |
| **DEGRADED** | ❌ | ✅ Recovered | ✅ Manual | - | ⚠️ Worse | ⚠️ Manual | ❌ |
| **EMERGENCY** | ❌ | ✅ Recovered | ❌ | ✅ Partial | - | ⚠️ Manual | ❌ |
| **SHUTDOWN** | ❌ | ❌ | ❌ | ❌ | ❌ | - | ✅ Complete |
| **STOPPED** | 🔄 Restart | ❌ | ❌ | ❌ | ❌ | ❌ | - |

**Legend:**
- ✅ Normal transition (expected)
- ⚠️ Warning transition (needs attention)
- ❌ Invalid transition (blocked)
- 🔄 Restart (new process)
- - (Same state, no transition)

### Transition Conditions

| Transition | Condition | Priority |
|------------|-----------|----------|
| `BOOTSTRAPPING → RUNNING` | `peers.count >= 3 AND treasury.akt >= 100` | Normal |
| `BOOTSTRAPPING → EMERGENCY` | `timeout(5 minutes) OR treasury.akt < 10` | High |
| `RUNNING → MAINTENANCE` | `scheduled OR manual` | Normal |
| `RUNNING → DEGRADED` | `errorRate > 0.05 OR peers.count < 3 OR treasury.akt < 50` | Medium |
| `RUNNING → EMERGENCY` | `database.down OR peers.count == 0 OR treasury.akt < 10` | Critical |
| `RUNNING → SHUTDOWN` | `SIGTERM OR manual` | High |
| `MAINTENANCE → RUNNING` | `task.completed AND task.successful` | Normal |
| `MAINTENANCE → EMERGENCY` | `task.failed AND critical` | High |
| `DEGRADED → RUNNING` | `errorRate < 0.01 AND peers.count >= 3 AND treasury.akt >= 100` | Normal |
| `DEGRADED → EMERGENCY` | `peers.count == 0 OR database.down` | Critical |
| `EMERGENCY → DEGRADED` | `partial_recovery (e.g., 1 peer connected)` | Medium |
| `EMERGENCY → RUNNING` | `full_recovery (all systems healthy)` | High |
| `EMERGENCY → SHUTDOWN` | `timeout(30 minutes) OR manual` | High |
| `SHUTDOWN → STOPPED` | `shutdown_complete OR deadline_reached` | High |
| `STOPPED → BOOTSTRAPPING` | `process_restarted` | Normal |

---

## State Machine Diagram

### ASCII Diagram

```
                    ┌───────────────┐
                    │   STOPPED     │
                    │  (Not Running)│
                    └───────┬───────┘
                            │
                    Process Restart
                            │
                            ▼
                    ┌───────────────────┐
           ┌───────▶│  BOOTSTRAPPING    │
           │        │ (Initializing)    │
           │        └────────┬──────────┘
           │                 │
           │          Timeout│OR Treasury Low
           │                 │
           │        Peers≥3  │  Treasury OK
           │    ┌────────────┴──────────────┐
           │    │                           │
           │    ▼                           ▼
           │ ┌────────────┐         ┌──────────────┐
           │ │  RUNNING   │────────▶│  EMERGENCY   │
           │ │ (Normal)   │ Critical│ (Critical    │
           │ └─────┬──────┘  Error  │  Failure)    │
           │       │                └──────┬───────┘
           │       │                       │
           │       │ Scheduled      Partial│Recovery
           │       │ Maintenance           │
           │       │                       │
           │       ▼                       ▼
           │ ┌──────────────┐       ┌─────────────┐
           │ │ MAINTENANCE  │       │  DEGRADED   │
           │ │ (Routine     │       │ (Reduced    │
           │ │  Tasks)      │       │  Capacity)  │
           │ └──────┬───────┘       └──────┬──────┘
           │        │                      │
           │        │ Complete      Error  │ Recovered
           │        │              Rate↑   │
           │        ▼                      │
           │ ┌──────────────┐◀─────────────┘
           │ │   RUNNING    │
           │ └──────┬───────┘
           │        │
           │        │ Manual Shutdown
           │        │ OR SIGTERM
           │        ▼
           │ ┌──────────────┐
           └─│   SHUTDOWN   │
             │ (Draining)   │
             └──────┬───────┘
                    │
             Complete│OR Deadline
                    ▼
             ┌──────────────┐
             │   STOPPED    │
             └──────────────┘
```

### Mermaid Diagram

```mermaid
stateDiagram-v2
    [*] --> STOPPED
    STOPPED --> BOOTSTRAPPING: Process Restart

    BOOTSTRAPPING --> RUNNING: Peers≥3, Treasury OK
    BOOTSTRAPPING --> EMERGENCY: Timeout OR Low Treasury

    RUNNING --> MAINTENANCE: Scheduled Task
    RUNNING --> DEGRADED: Error Rate>5% OR Peers<3
    RUNNING --> EMERGENCY: Critical Failure
    RUNNING --> SHUTDOWN: Manual OR SIGTERM

    MAINTENANCE --> RUNNING: Task Complete
    MAINTENANCE --> EMERGENCY: Task Failed (Critical)

    DEGRADED --> RUNNING: Recovered
    DEGRADED --> EMERGENCY: Condition Worsens

    EMERGENCY --> DEGRADED: Partial Recovery
    EMERGENCY --> RUNNING: Full Recovery
    EMERGENCY --> SHUTDOWN: Timeout OR Manual

    SHUTDOWN --> STOPPED: Shutdown Complete

    STOPPED --> [*]
```

---

## Entry/Exit Actions

### BOOTSTRAPPING State

**Entry Actions (Pseudocode):**

```typescript
async function enterBootstrappingState(): Promise<void> {
  logger.info('Entering BOOTSTRAPPING state')
  metrics.agentState.set({ state: 'bootstrapping' }, 1)

  // 1. Load configuration
  const config = await loadConfiguration('./config.yaml')
  validateConfiguration(config)

  // 2. Initialize databases
  const db = await initializeDatabase(config.database)
  const channelDb = await initializeSQLite('./channels.db')

  // 3. Load previous agent state (if exists)
  const agentState = await db.query('SELECT * FROM agent_state WHERE id = 1')
  if (agentState.rows.length > 0) {
    logger.info('Resuming from previous state', agentState.rows[0])
  }

  // 4. Query blockchain balances
  const balances = await queryBalances({
    btc: config.wallets.btc,
    eth: config.wallets.eth,
    akt: config.wallets.akt,
    xrp: config.wallets.xrp
  })
  logger.info('Treasury balances', balances)

  // 5. Download Bootstrap Node List
  const bnl = config.bootstrapNodes // Hardcoded in config
  logger.info('Bootstrap nodes', { count: bnl.length })

  // 6. Download Known Node Lists from bootstrap nodes
  const knls = await Promise.all(
    bnl.map(node => downloadKNL(node.url))
  )

  // 7. Anti-Sybil filtering (>50% BNL consensus)
  const filteredPeers = applyAntiSybilFilter(knls, 0.5)
  logger.info('Filtered peers', { count: filteredPeers.length })

  // 8. Evaluate and rank peers
  const rankedPeers = evaluatePeers(filteredPeers, {
    reputation: 0.7,
    settlementScheme: config.settlement.preferred
  })

  // 9. Initiate peering requests (top 20)
  const peeringResults = await Promise.allSettled(
    rankedPeers.slice(0, 20).map(peer => sendPeeringRequest(peer))
  )

  const connectedPeers = peeringResults.filter(r => r.status === 'fulfilled')
  logger.info('Peering complete', { connected: connectedPeers.length })

  // 10. Check transition conditions
  if (connectedPeers.length >= 3 && balances.akt >= 100_000000n) {
    await transitionTo('RUNNING')
  } else if (Date.now() - bootstrapStartTime > 300000) { // 5 minutes
    logger.error('Bootstrap timeout')
    await transitionTo('EMERGENCY', { reason: 'bootstrap_timeout' })
  } else if (balances.akt < 10_000000n) {
    logger.error('Insufficient treasury')
    await transitionTo('EMERGENCY', { reason: 'treasury_empty' })
  }
}
```

**Exit Actions (Pseudocode):**

```typescript
async function exitBootstrappingState(): Promise<void> {
  metrics.agentState.set({ state: 'bootstrapping' }, 0)
  metrics.bootstrapDurationSeconds.observe(Date.now() - bootstrapStartTime)

  logger.info('Exiting BOOTSTRAPPING state', {
    peers: connectedPeers.length,
    treasury: balances.akt.toString()
  })
}
```

---

### RUNNING State

**Entry Actions (Pseudocode):**

```typescript
async function enterRunningState(): Promise<void> {
  logger.info('Entering RUNNING state')
  metrics.agentState.set({ state: 'running' }, 1)

  // 1. Enable event handlers
  enableNostrEventHandler()
  enableILPPacketHandler()

  // 2. Start WebSocket bridge (if configured)
  if (config.websocket.enabled) {
    await startWebSocketBridge(config.websocket.port)
  }

  // 3. Resume active subscriptions
  const activeSubscriptions = await db.query('SELECT * FROM subscriptions WHERE active = true')
  for (const sub of activeSubscriptions.rows) {
    await resumeSubscription(sub)
  }

  // 4. Start periodic actors
  startActor(PricingEngineActor, { interval: 60000 }) // Every 1 minute
  startActor(TreasuryManagerActor, { interval: 3600000 }) // Every 1 hour
  startActor(PeerEvaluationActor, { interval: 300000 }) // Every 5 minutes
  startActor(ArweaveBackupActor, { interval: 86400000 }) // Every 24 hours
  startActor(MonitoringActor, { interval: 30000 }) // Every 30 seconds

  logger.info('All systems operational')
}
```

**Exit Actions (Pseudocode):**

```typescript
async function exitRunningState(): Promise<void> {
  logger.info('Exiting RUNNING state')
  metrics.agentState.set({ state: 'running' }, 0)

  // 1. Flush pending events
  await flushEventQueue()

  // 2. Save agent state
  await db.query(`
    UPDATE agent_state SET
      last_state = 'running',
      last_transition = NOW(),
      metrics = $1
    WHERE id = 1
  `, [JSON.stringify(getCurrentMetrics())])

  logger.info('State saved successfully')
}
```

---

### MAINTENANCE State

**Entry Actions:**

```typescript
async function enterMaintenanceState(task: MaintenanceTask): Promise<void> {
  logger.info('Entering MAINTENANCE state', { task: task.name })
  metrics.agentState.set({ state: 'maintenance' }, 1)

  // 1. Increase pricing (2x)
  pricingStrategy.demandAdjustment = 2.0

  // 2. Update relay info (NIP-11)
  await updateRelayInfo({
    description: 'Relay in maintenance mode (higher fees)',
    supported_nips: [1, 2, 4, 9, 11, 15, 20, 42],
    maintenance: true
  })

  // 3. Execute maintenance task
  try {
    await task.execute()
    logger.info('Maintenance task completed', { task: task.name })
    await transitionTo('RUNNING')
  } catch (error) {
    logger.error('Maintenance task failed', { task: task.name, error })
    if (task.critical) {
      await transitionTo('EMERGENCY', { reason: 'maintenance_failed', task: task.name })
    } else {
      await transitionTo('RUNNING') // Non-critical failure, resume anyway
    }
  }
}
```

---

### EMERGENCY State

**Entry Actions:**

```typescript
async function enterEmergencyState(reason: string, details: any): Promise<void> {
  logger.error('⚠️ EMERGENCY STATE ENTERED ⚠️', { reason, details })
  metrics.agentState.set({ state: 'emergency' }, 1)
  metrics.agentEmergency.inc({ reason })

  // 1. Disable event handlers (reject all new events)
  disableNostrEventHandler()

  // 2. Send alerts
  await sendAlert({
    severity: 'critical',
    title: 'Agent Entered Emergency State',
    message: `Reason: ${reason}`,
    details,
    timestamp: new Date()
  })

  // 3. Start emergency recovery
  const recoveryProcedure = selectRecoveryProcedure(reason)
  const recoveryResult = await recoveryProcedure.execute()

  if (recoveryResult.success) {
    if (recoveryResult.fullRecovery) {
      await transitionTo('RUNNING')
    } else {
      await transitionTo('DEGRADED', { partialRecovery: true })
    }
  } else {
    // Recovery failed, wait for operator intervention
    logger.error('Emergency recovery failed, awaiting operator')

    // Timeout after 30 minutes → shutdown
    setTimeout(() => {
      logger.error('Emergency timeout, initiating shutdown')
      transitionTo('SHUTDOWN', { reason: 'emergency_timeout' })
    }, 1800000) // 30 minutes
  }
}
```

---

## Error Handling & Recovery

### Error Categories

| Category | Severity | Action |
|----------|----------|--------|
| **Transient** | Low | Retry 3 times, log warning |
| **Recoverable** | Medium | Transition to DEGRADED, attempt recovery |
| **Critical** | High | Transition to EMERGENCY, alert operator |
| **Fatal** | Critical | Transition to SHUTDOWN, save state |

### Recovery Procedures

#### Recovery 1: Database Connection Lost

```typescript
async function recoverDatabaseConnection(): Promise<RecoveryResult> {
  logger.warn('Database connection lost, attempting recovery')

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await db.connect()
      logger.info('Database reconnected', { attempt })
      return { success: true, fullRecovery: true }
    } catch (error) {
      logger.error('Database reconnection failed', { attempt, error })
      await sleep(5000 * attempt) // Exponential backoff
    }
  }

  // Fallback to SQLite (temporary)
  logger.warn('Falling back to SQLite (temporary)')
  const tempDb = await initializeSQLite('./temp_events.db')
  await migrateToTemporaryDb(tempDb)

  return {
    success: true,
    fullRecovery: false,
    message: 'Using temporary SQLite database'
  }
}
```

#### Recovery 2: All Peers Disconnected

```typescript
async function recoverPeerConnections(): Promise<RecoveryResult> {
  logger.warn('All peers disconnected, re-bootstrapping')

  // 1. Clear stale session keys
  await clearSessionKeys()

  // 2. Re-download BNL/KNL
  const bnl = config.bootstrapNodes
  const knls = await Promise.all(bnl.map(node => downloadKNL(node.url)))

  // 3. Apply anti-Sybil filter
  const filteredPeers = applyAntiSybilFilter(knls, 0.5)

  // 4. Initiate new peering requests
  const results = await Promise.allSettled(
    filteredPeers.slice(0, 20).map(peer => sendPeeringRequest(peer))
  )

  const connected = results.filter(r => r.status === 'fulfilled').length

  if (connected >= 3) {
    logger.info('Peer recovery successful', { connected })
    return { success: true, fullRecovery: true }
  } else if (connected >= 1) {
    logger.warn('Partial peer recovery', { connected })
    return { success: true, fullRecovery: false }
  } else {
    logger.error('Peer recovery failed')
    return { success: false }
  }
}
```

#### Recovery 3: Treasury Empty

```typescript
async function recoverTreasury(): Promise<RecoveryResult> {
  logger.warn('Treasury balance too low, attempting recovery')

  // 1. Check balances in other currencies
  const balances = await queryBalances()

  if (balances.eth >= parseEther('0.1')) {
    // Swap ETH → AKT
    logger.info('Swapping ETH to AKT')
    const swapResult = await swapToAKT(parseEther('0.1'), 'ETH')

    if (swapResult.success) {
      logger.info('Emergency swap successful', { amountOut: swapResult.amountOut })
      return { success: true, fullRecovery: true }
    }
  }

  // 2. Check pending settlements
  const pending = await getPendingSettlements()
  if (pending.total >= 100_000000n) {
    logger.info('Settling pending channels', { total: pending.total })
    await settlePendingChannels(pending.channels)
    return { success: true, fullRecovery: true }
  }

  // 3. Alert operator
  await sendAlert({
    severity: 'critical',
    title: 'Treasury Empty - Funding Required',
    message: `AKT balance: ${balances.akt.toString()}, need 100 AKT minimum`,
    actionRequired: true
  })

  return {
    success: false,
    message: 'Treasury empty, operator funding required'
  }
}
```

---

## State Persistence

### Database Schema

```sql
-- packages/app-agent-relay/schema/agent_state.sql

CREATE TABLE agent_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  current_state VARCHAR(20) NOT NULL,
  previous_state VARCHAR(20),
  last_transition TIMESTAMP NOT NULL DEFAULT NOW(),
  transition_count INTEGER NOT NULL DEFAULT 0,

  -- Context for current state
  state_context JSONB,

  -- Metrics snapshot
  metrics JSONB,

  -- Configuration snapshot
  config JSONB,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CHECK (id = 1) -- Only one row
);

-- Transition history
CREATE TABLE state_transitions (
  id SERIAL PRIMARY KEY,
  from_state VARCHAR(20) NOT NULL,
  to_state VARCHAR(20) NOT NULL,
  reason VARCHAR(100),
  details JSONB,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transitions_timestamp ON state_transitions(timestamp DESC);

-- Example queries

-- Get current state
SELECT current_state, state_context FROM agent_state WHERE id = 1;

-- Get last 10 transitions
SELECT * FROM state_transitions ORDER BY timestamp DESC LIMIT 10;

-- Get transition statistics
SELECT
  from_state,
  to_state,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (
    LEAD(timestamp) OVER (ORDER BY timestamp) - timestamp
  ))) as avg_duration_seconds
FROM state_transitions
GROUP BY from_state, to_state
ORDER BY count DESC;
```

### State Persistence Logic

```typescript
// packages/app-agent-relay/src/state/persistence.ts

export class StatePersistence {
  async saveState(state: AgentState): Promise<void> {
    await this.db.query(`
      UPDATE agent_state SET
        current_state = $1,
        state_context = $2,
        metrics = $3,
        updated_at = NOW()
      WHERE id = 1
    `, [
      state.name,
      JSON.stringify(state.context),
      JSON.stringify(state.metrics)
    ])
  }

  async recordTransition(from: string, to: string, reason?: string, details?: any): Promise<void> {
    await this.db.query(`
      INSERT INTO state_transitions (from_state, to_state, reason, details)
      VALUES ($1, $2, $3, $4)
    `, [from, to, reason, JSON.stringify(details)])

    await this.db.query(`
      UPDATE agent_state SET
        previous_state = $1,
        transition_count = transition_count + 1
      WHERE id = 1
    `, [from])
  }

  async loadState(): Promise<AgentState | null> {
    const result = await this.db.query('SELECT * FROM agent_state WHERE id = 1')

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      name: row.current_state,
      context: row.state_context,
      metrics: row.metrics,
      lastTransition: row.last_transition
    }
  }
}
```

### Resume After Restart

```typescript
// packages/app-agent-relay/src/main.ts

async function main() {
  const statePersistence = new StatePersistence(db)

  // Load previous state (if exists)
  const previousState = await statePersistence.loadState()

  if (previousState) {
    logger.info('Resuming from previous state', previousState)

    // Resume based on previous state
    switch (previousState.name) {
      case 'RUNNING':
      case 'DEGRADED':
      case 'MAINTENANCE':
        // Restart in BOOTSTRAPPING, will transition back to RUNNING
        await transitionTo('BOOTSTRAPPING', { resuming: true })
        break

      case 'EMERGENCY':
        // Resume emergency recovery
        await transitionTo('EMERGENCY', {
          resuming: true,
          reason: previousState.context?.reason
        })
        break

      case 'SHUTDOWN':
      case 'STOPPED':
        // Normal restart
        await transitionTo('BOOTSTRAPPING')
        break

      default:
        logger.warn('Unknown previous state, starting fresh')
        await transitionTo('BOOTSTRAPPING')
    }
  } else {
    // First time startup
    await transitionTo('BOOTSTRAPPING')
  }
}
```

---

## Monitoring & Observability

### Prometheus Metrics

```typescript
// packages/app-agent-relay/src/monitoring/metrics.ts
import { register, Gauge, Counter, Histogram } from 'prom-client'

// State gauge (0 or 1 per state)
export const agentStateGauge = new Gauge({
  name: 'agent_state',
  help: 'Current agent state (1 = active, 0 = inactive)',
  labelNames: ['state']
})

// Transition counter
export const transitionCounter = new Counter({
  name: 'agent_state_transitions_total',
  help: 'Total number of state transitions',
  labelNames: ['from_state', 'to_state', 'reason']
})

// State duration histogram
export const stateDurationHistogram = new Histogram({
  name: 'agent_state_duration_seconds',
  help: 'Time spent in each state',
  labelNames: ['state'],
  buckets: [1, 5, 15, 30, 60, 300, 600, 1800, 3600, 7200] // 1s to 2h
})

// Emergency counter
export const emergencyCounter = new Counter({
  name: 'agent_emergency_total',
  help: 'Total number of emergency state entries',
  labelNames: ['reason']
})

// Usage example:
function transitionTo(newState: string, context?: any) {
  const oldState = currentState

  // Update gauges
  agentStateGauge.set({ state: oldState }, 0)
  agentStateGauge.set({ state: newState }, 1)

  // Increment counter
  transitionCounter.inc({
    from_state: oldState,
    to_state: newState,
    reason: context?.reason || 'normal'
  })

  // Record duration
  stateDurationHistogram.observe(
    { state: oldState },
    (Date.now() - stateStartTime) / 1000
  )

  // Special metrics
  if (newState === 'EMERGENCY') {
    emergencyCounter.inc({ reason: context?.reason || 'unknown' })
  }

  currentState = newState
  stateStartTime = Date.now()
}
```

### Grafana Dashboard Panels

**Panel 1: Current State (Gauge)**
```promql
agent_state
```

**Panel 2: State Transitions Over Time (Graph)**
```promql
rate(agent_state_transitions_total[5m])
```

**Panel 3: Time in Each State (Heatmap)**
```promql
agent_state_duration_seconds_bucket
```

**Panel 4: Emergency Events (Counter)**
```promql
increase(agent_emergency_total[1h])
```

**Panel 5: State Distribution (Pie Chart)**
```promql
sum by (state) (agent_state_duration_seconds_sum) /
sum(agent_state_duration_seconds_sum)
```

### Logging Standards

```typescript
// Structured logging with Winston
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'agent.log' }),
    new winston.transports.Console()
  ]
})

// State transition log format
logger.info('State transition', {
  event: 'state_transition',
  from: oldState,
  to: newState,
  reason: context?.reason,
  duration_ms: Date.now() - stateStartTime,
  metrics: getCurrentMetrics(),
  timestamp: new Date().toISOString()
})
```

---

## Failure Modes & Mitigation

### Failure Mode 1: Database Corruption

**Symptoms:**
- Database queries returning inconsistent data
- Write operations failing
- State persistence errors

**Detection:**
- Database integrity checks (daily)
- Checksum verification
- Query result validation

**Mitigation:**
1. Detect corruption via checksums
2. Transition to EMERGENCY
3. Stop accepting events
4. Restore from latest backup
5. Replay events from Arweave (if needed)
6. Transition back to RUNNING

**Prevention:**
- Daily PostgreSQL backups (via pg_dump)
- Write-ahead logging (WAL) enabled
- Regular VACUUM and ANALYZE
- Replication to secondary instance

---

### Failure Mode 2: Network Partition

**Symptoms:**
- All peers unreachable
- BTP packets timing out
- No ILP routing possible

**Detection:**
- Peer connection count = 0
- Heartbeat failures
- Network reachability tests

**Mitigation:**
1. Detect partition (all peers down)
2. Transition to DEGRADED (initially)
3. Attempt peer reconnection (5 minutes)
4. If persistent → EMERGENCY
5. Re-bootstrap from BNL
6. If still failing → SHUTDOWN (alert operator)

**Prevention:**
- Multi-region peer diversity
- Fallback to alternative networks (Tor, I2P)
- Multiple network interfaces

---

### Failure Mode 3: Treasury Depletion

**Symptoms:**
- AKT balance < 10 AKT
- Cannot pay Akash hosting fees
- Cannot perform swaps (gas fees)

**Detection:**
- Balance monitoring (every 5 minutes)
- Alert threshold: 50 AKT
- Critical threshold: 10 AKT

**Mitigation:**
1. Detect low balance (< 50 AKT)
2. Transition to MAINTENANCE
3. Attempt emergency swap (ETH/BTC/XRP → AKT)
4. If swap fails → EMERGENCY
5. Alert operator to fund wallet
6. If balance reaches 0 → SHUTDOWN

**Prevention:**
- Automated rebalancing (every hour)
- Revenue tracking (ensure profitable)
- Multiple token balances (diversification)
- Operator alerts at 100 AKT threshold

---

### Failure Mode 4: Akash Deployment Failure

**Symptoms:**
- Deployment evicted (insufficient payment)
- Provider offline
- Resource constraints exceeded

**Detection:**
- Akash lease status monitoring
- Deployment health checks
- Resource usage metrics

**Mitigation:**
1. Detect deployment failure
2. Transition to MAINTENANCE
3. Attempt redeploy with:
   - Same provider (if available)
   - Different provider (fallback)
   - Reduced resource requirements (cheaper)
4. If all attempts fail → EMERGENCY
5. Alert operator

**Prevention:**
- Maintain 7-day buffer in treasury
- Monitor provider reputation
- Auto-renew leases 24h before expiry
- Multi-provider redundancy (future)

---

## Configuration Schema

### YAML Configuration

```yaml
# packages/app-agent-relay/config.yaml

# Agent identification
agent:
  id: "agent-abc-123"
  name: "My Autonomous Relay"
  version: "1.0.0"

# State machine settings
state_machine:
  bootstrap_timeout_seconds: 300  # 5 minutes
  emergency_timeout_seconds: 1800  # 30 minutes
  shutdown_deadline_seconds: 10
  min_peers: 3
  min_treasury_akt: 100_000000  # 100 AKT (uakt)

# Database connections
database:
  postgresql:
    url: "postgres://user:pass@localhost:5432/agent_relay"
    max_connections: 20
    idle_timeout_ms: 30000
  sqlite:
    path: "./data/channels.db"
  redis:
    url: "redis://localhost:6379"
    enabled: true

# Wallet configuration
wallets:
  btc:
    address: "bc1q..."
    enabled: false
  eth:
    address: "0x..."
    rpc_url: "https://base-mainnet.g.alchemy.com/v2/..."
    enabled: true
  akt:
    address: "akash1..."
    rpc_url: "https://rpc.cosmos.directory/akash"
    enabled: true
  xrp:
    address: "rX..."
    enabled: false

# Treasury management
treasury:
  rebalance_interval_seconds: 3600  # 1 hour
  target_balances:
    akt: 150_000000  # 150 AKT
  swap_slippage_percent: 0.5
  emergency_swap_enabled: true

# Pricing strategy
pricing:
  base_price_msats: 100
  kind_multipliers:
    1: 1.0      # Short note
    30023: 5.0  # Long-form
    1063: 10.0  # File metadata
  demand_adjustment_enabled: true
  maintenance_multiplier: 2.0  # 2x during maintenance

# Peer discovery
peers:
  bootstrap_nodes:
    - id: "bootstrap-1.btp-nips.org"
      url: "https://bootstrap-1.btp-nips.org"
      pubkey: "0x..."
    - id: "bootstrap-2.btp-nips.org"
      url: "https://bootstrap-2.btp-nips.org"
      pubkey: "0x..."
  target_peer_count: 20
  anti_sybil_threshold: 0.5  # 50% BNL consensus
  min_reputation: 0.7

# Akash deployment
akash:
  enabled: true
  wallet_address: "akash1..."
  sdl_config:
    image: "ghcr.io/nostr-ilp/agent-relay:latest"
    cpu: "4000m"
    memory: "8Gi"
    storage: "100Gi"
  auto_renew: true
  renew_buffer_hours: 24

# Arweave backup
arweave:
  enabled: true
  wallet_path: "./arweave-keyfile.json"
  backup_interval_seconds: 86400  # 24 hours
  retention_days: 90

# Monitoring
monitoring:
  prometheus_port: 9090
  metrics_interval_seconds: 30
  health_check_interval_seconds: 30

# Alerting
alerts:
  enabled: true
  webhook_url: "https://example.com/webhook"
  email: "operator@example.com"
  telegram_bot_token: "..."
  telegram_chat_id: "..."
```

### Configuration Validation (Zod)

```typescript
// packages/app-agent-relay/src/config/schema.ts
import { z } from 'zod'

export const ConfigSchema = z.object({
  agent: z.object({
    id: z.string(),
    name: z.string(),
    version: z.string()
  }),

  state_machine: z.object({
    bootstrap_timeout_seconds: z.number().min(60).max(600),
    emergency_timeout_seconds: z.number().min(300).max(3600),
    shutdown_deadline_seconds: z.number().min(5).max(60),
    min_peers: z.number().min(1).max(100),
    min_treasury_akt: z.bigint().min(10_000000n) // 10 AKT minimum
  }),

  database: z.object({
    postgresql: z.object({
      url: z.string().url(),
      max_connections: z.number().min(10).max(100),
      idle_timeout_ms: z.number()
    }),
    sqlite: z.object({
      path: z.string()
    }),
    redis: z.object({
      url: z.string().url(),
      enabled: z.boolean()
    })
  }),

  wallets: z.object({
    btc: z.object({
      address: z.string(),
      enabled: z.boolean()
    }).optional(),
    eth: z.object({
      address: z.string().startsWith('0x'),
      rpc_url: z.string().url(),
      enabled: z.boolean()
    }),
    akt: z.object({
      address: z.string().startsWith('akash'),
      rpc_url: z.string().url(),
      enabled: z.boolean()
    }),
    xrp: z.object({
      address: z.string(),
      enabled: z.boolean()
    }).optional()
  }),

  treasury: z.object({
    rebalance_interval_seconds: z.number().min(300).max(86400),
    target_balances: z.object({
      akt: z.bigint().min(100_000000n)
    }),
    swap_slippage_percent: z.number().min(0.1).max(5.0),
    emergency_swap_enabled: z.boolean()
  }),

  pricing: z.object({
    base_price_msats: z.number().min(1).max(10000),
    kind_multipliers: z.record(z.number()),
    demand_adjustment_enabled: z.boolean(),
    maintenance_multiplier: z.number().min(1.0).max(10.0)
  }),

  peers: z.object({
    bootstrap_nodes: z.array(z.object({
      id: z.string(),
      url: z.string().url(),
      pubkey: z.string()
    })).min(1),
    target_peer_count: z.number().min(5).max(100),
    anti_sybil_threshold: z.number().min(0.1).max(1.0),
    min_reputation: z.number().min(0.0).max(1.0)
  }),

  akash: z.object({
    enabled: z.boolean(),
    wallet_address: z.string().startsWith('akash'),
    sdl_config: z.object({
      image: z.string(),
      cpu: z.string(),
      memory: z.string(),
      storage: z.string()
    }),
    auto_renew: z.boolean(),
    renew_buffer_hours: z.number().min(1).max(168)
  }),

  arweave: z.object({
    enabled: z.boolean(),
    wallet_path: z.string(),
    backup_interval_seconds: z.number().min(3600).max(604800),
    retention_days: z.number().min(7).max(365)
  }),

  monitoring: z.object({
    prometheus_port: z.number().min(1024).max(65535),
    metrics_interval_seconds: z.number().min(10).max(300),
    health_check_interval_seconds: z.number().min(10).max(300)
  }),

  alerts: z.object({
    enabled: z.boolean(),
    webhook_url: z.string().url().optional(),
    email: z.string().email().optional(),
    telegram_bot_token: z.string().optional(),
    telegram_chat_id: z.string().optional()
  })
})

export type AgentConfig = z.infer<typeof ConfigSchema>

export function validateConfig(config: unknown): AgentConfig {
  return ConfigSchema.parse(config)
}
```

---

## Implementation Examples

### Example 1: State Machine Implementation

```typescript
// packages/app-agent-relay/src/state/machine.ts
import { createSignal } from '@dassie/lib-reactive'

export enum AgentState {
  BOOTSTRAPPING = 'BOOTSTRAPPING',
  RUNNING = 'RUNNING',
  MAINTENANCE = 'MAINTENANCE',
  DEGRADED = 'DEGRADED',
  EMERGENCY = 'EMERGENCY',
  SHUTDOWN = 'SHUTDOWN',
  STOPPED = 'STOPPED'
}

export class StateMachine {
  private currentState: AgentState
  private stateStartTime: number
  private statePersistence: StatePersistence

  constructor(
    private config: AgentConfig,
    private db: DatabaseConnection
  ) {
    this.statePersistence = new StatePersistence(db)
    this.currentState = AgentState.STOPPED
    this.stateStartTime = Date.now()
  }

  async initialize() {
    // Load previous state
    const savedState = await this.statePersistence.loadState()

    if (savedState) {
      logger.info('Resuming from saved state', savedState)
      // Always start in BOOTSTRAPPING when process restarts
      await this.transitionTo(AgentState.BOOTSTRAPPING, { resuming: true })
    } else {
      await this.transitionTo(AgentState.BOOTSTRAPPING)
    }
  }

  async transitionTo(newState: AgentState, context?: any) {
    const oldState = this.currentState

    // Validate transition
    if (!this.isValidTransition(oldState, newState)) {
      logger.error('Invalid state transition', { from: oldState, to: newState })
      throw new Error(`Invalid transition: ${oldState} → ${newState}`)
    }

    logger.info('State transition', { from: oldState, to: newState, context })

    // Exit current state
    await this.exitState(oldState)

    // Record transition
    await this.statePersistence.recordTransition(oldState, newState, context?.reason, context)

    // Update metrics
    metrics.agentStateGauge.set({ state: oldState }, 0)
    metrics.agentStateGauge.set({ state: newState }, 1)
    metrics.transitionCounter.inc({ from_state: oldState, to_state: newState })

    // Update current state
    this.currentState = newState
    this.stateStartTime = Date.now()

    // Enter new state
    await this.enterState(newState, context)
  }

  private async enterState(state: AgentState, context?: any) {
    switch (state) {
      case AgentState.BOOTSTRAPPING:
        await this.enterBootstrapping(context)
        break
      case AgentState.RUNNING:
        await this.enterRunning(context)
        break
      case AgentState.MAINTENANCE:
        await this.enterMaintenance(context)
        break
      case AgentState.DEGRADED:
        await this.enterDegraded(context)
        break
      case AgentState.EMERGENCY:
        await this.enterEmergency(context)
        break
      case AgentState.SHUTDOWN:
        await this.enterShutdown(context)
        break
      case AgentState.STOPPED:
        // No entry actions (process terminating)
        break
    }
  }

  private async exitState(state: AgentState) {
    const duration = Date.now() - this.stateStartTime

    // Record duration
    metrics.stateDurationHistogram.observe({ state }, duration / 1000)

    // State-specific exit actions
    switch (state) {
      case AgentState.RUNNING:
        await this.flushEventQueue()
        break
      case AgentState.MAINTENANCE:
        this.resetPricing()
        break
      // ... other states
    }

    // Save state
    await this.statePersistence.saveState({
      name: state,
      context: {},
      metrics: this.getCurrentMetrics(),
      duration
    })
  }

  private isValidTransition(from: AgentState, to: AgentState): boolean {
    const validTransitions: Record<AgentState, AgentState[]> = {
      [AgentState.BOOTSTRAPPING]: [AgentState.RUNNING, AgentState.EMERGENCY, AgentState.SHUTDOWN],
      [AgentState.RUNNING]: [AgentState.MAINTENANCE, AgentState.DEGRADED, AgentState.EMERGENCY, AgentState.SHUTDOWN],
      [AgentState.MAINTENANCE]: [AgentState.RUNNING, AgentState.EMERGENCY, AgentState.SHUTDOWN],
      [AgentState.DEGRADED]: [AgentState.RUNNING, AgentState.EMERGENCY, AgentState.MAINTENANCE, AgentState.SHUTDOWN],
      [AgentState.EMERGENCY]: [AgentState.RUNNING, AgentState.DEGRADED, AgentState.SHUTDOWN],
      [AgentState.SHUTDOWN]: [AgentState.STOPPED],
      [AgentState.STOPPED]: [AgentState.BOOTSTRAPPING]
    }

    return validTransitions[from]?.includes(to) ?? false
  }

  // State entry methods (implementations shown earlier)
  private async enterBootstrapping(context?: any) { /* ... */ }
  private async enterRunning(context?: any) { /* ... */ }
  private async enterMaintenance(context?: any) { /* ... */ }
  private async enterDegraded(context?: any) { /* ... */ }
  private async enterEmergency(context?: any) { /* ... */ }
  private async enterShutdown(context?: any) { /* ... */ }
}
```

---

## Conclusion

### Summary

This state machine specification provides **complete coverage** of all agent states and transitions, enabling:

1. **Predictable Behavior** - Deterministic state transitions based on clear conditions
2. **Resilience** - Graceful recovery from failures via state-based error handling
3. **Observability** - Comprehensive metrics and logging for every state
4. **Maintainability** - Clear entry/exit actions for each state
5. **Resumability** - State persistence allows resuming after restart

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| 7 States | Covers all operational modes (normal, maintenance, degraded, emergency) |
| Fail-Safe Defaults | Always err on conservative side (reject events if uncertain) |
| State Persistence | PostgreSQL table stores current state (resume after restart) |
| Prometheus Metrics | Real-time monitoring via metrics (Grafana dashboards) |
| Recovery Procedures | Automated recovery for common failures (DB, peers, treasury) |

### Next Steps

1. **Implement State Machine** (packages/app-agent-relay/src/state/)
2. **Write Unit Tests** (test all transitions)
3. **Integration Testing** (simulate failures)
4. **Deploy Prototype** (verify state machine in production)

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-05
**Author:** Claude Code (AI Research Assistant)
**License:** MIT (research outputs), Apache 2.0 (code)

**Related Documents:**
- [Architecture Overview](./architecture-overview.md)
- [Dassie Integration Guide](../technical-feasibility/dassie-integration.md)
- [Reputation Systems](../security-privacy/reputation-systems.md)
