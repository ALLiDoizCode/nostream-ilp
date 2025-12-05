# Autonomous Relay Decision Engine

## Overview

The decision engine is the core orchestration system that integrates pricing, peering, and treasury management algorithms into a cohesive decision-making framework. It handles event-driven decision loops, priority queues, conflict resolution, and monitoring.

## Design Principles

1. **Event-Driven**: React to events (new user, price change, lease expiry)
2. **Priority-Based**: Handle urgent decisions before routine ones
3. **Conflict Resolution**: Resolve competing decisions intelligently
4. **Observable**: Full transparency into decision-making process
5. **Testable**: Simulation mode for testing without execution

## Architecture

### Core Components

```typescript
/**
 * Central decision engine integrating all autonomous algorithms
 */
class DecisionEngine {
  private eventBus: EventBus;
  private priorityQueue: PriorityQueue<Decision>;
  private executors: Map<DecisionType, DecisionExecutor>;
  private monitor: DecisionMonitor;
  private simulator: DecisionSimulator;

  constructor(
    private pricingEngine: PricingEngine,
    private peeringSelector: ActivePeeringSelector,
    private treasuryManager: AKTSwapDecisionEngine,
    private leaseManager: AkashLeaseManager,
    config: EngineConfig
  ) {
    this.eventBus = new EventBus();
    this.priorityQueue = new PriorityQueue();
    this.monitor = new DecisionMonitor();
    this.simulator = new DecisionSimulator();

    this.initializeExecutors();
    this.startDecisionLoop();
    this.registerEventHandlers();
  }

  /**
   * Initialize decision executors
   */
  private initializeExecutors(): void {
    this.executors.set('pricing', new PricingExecutor(this.pricingEngine));
    this.executors.set('peering', new PeeringExecutor(this.peeringSelector));
    this.executors.set('treasury', new TreasuryExecutor(this.treasuryManager));
    this.executors.set('lease', new LeaseExecutor(this.leaseManager));
  }

  /**
   * Register event handlers
   */
  private registerEventHandlers(): void {
    // Pricing events
    this.eventBus.on('event:publish:request', (event) => {
      this.handlePricingRequest(event);
    });

    this.eventBus.on('peer:price:update', (data) => {
      this.handlePeerPriceUpdate(data);
    });

    // Peering events
    this.eventBus.on('peer:discovered', (peer) => {
      this.handlePeerDiscovered(peer);
    });

    this.eventBus.on('peer:request:incoming', (peer) => {
      this.handlePeerRequest(peer);
    });

    this.eventBus.on('peer:performance:degraded', (peer) => {
      this.handlePeerDegradation(peer);
    });

    // Treasury events
    this.eventBus.on('payment:received', (payment) => {
      this.handlePaymentReceived(payment);
    });

    this.eventBus.on('price:change:significant', (priceData) => {
      this.handlePriceChange(priceData);
    });

    this.eventBus.on('balance:threshold', (balanceData) => {
      this.handleBalanceThreshold(balanceData);
    });

    // Lease events
    this.eventBus.on('lease:expiring', (leaseData) => {
      this.handleLeaseExpiring(leaseData);
    });

    this.eventBus.on('lease:renewal:failed', (error) => {
      this.handleLeaseRenewalFailed(error);
    });
  }

  /**
   * Main decision loop (reactive)
   */
  private startDecisionLoop(): void {
    // Use Dassie-style reactive pattern
    createActor(async () => {
      while (true) {
        // Get next decision from priority queue
        const decision = await this.priorityQueue.dequeue();

        if (!decision) {
          await this.sleep(100); // No decisions pending
          continue;
        }

        try {
          // Check for conflicts
          const conflicts = this.checkConflicts(decision);

          if (conflicts.length > 0) {
            const resolved = this.resolveConflicts(decision, conflicts);
            await this.executeDecision(resolved);
          } else {
            await this.executeDecision(decision);
          }
        } catch (error) {
          this.monitor.recordError(decision, error);
          await this.handleDecisionError(decision, error);
        }
      }
    });
  }

  /**
   * Execute a decision
   */
  private async executeDecision(decision: Decision): Promise<void> {
    this.monitor.recordDecision(decision);

    // Simulation mode - don't execute, just log
    if (this.simulator.isEnabled()) {
      this.simulator.simulate(decision);
      return;
    }

    const executor = this.executors.get(decision.type);

    if (!executor) {
      throw new Error(`No executor for decision type: ${decision.type}`);
    }

    const result = await executor.execute(decision);

    this.monitor.recordResult(decision, result);
    this.eventBus.emit(`decision:${decision.type}:executed`, result);
  }

  /**
   * Check for decision conflicts
   */
  private checkConflicts(decision: Decision): Decision[] {
    const pending = this.priorityQueue.getPending();

    return pending.filter(other =>
      this.hasConflict(decision, other)
    );
  }

  /**
   * Check if two decisions conflict
   */
  private hasConflict(d1: Decision, d2: Decision): boolean {
    // Treasury + Lease conflict (both need AKT)
    if (
      (d1.type === 'treasury' && d2.type === 'lease') ||
      (d1.type === 'lease' && d2.type === 'treasury')
    ) {
      return true;
    }

    // Multiple pricing decisions for same event
    if (d1.type === 'pricing' && d2.type === 'pricing') {
      return d1.metadata?.eventId === d2.metadata?.eventId;
    }

    // Multiple peering decisions for same peer
    if (d1.type === 'peering' && d2.type === 'peering') {
      return d1.metadata?.peerUrl === d2.metadata?.peerUrl;
    }

    return false;
  }

  /**
   * Resolve conflicting decisions
   */
  private resolveConflicts(
    decision: Decision,
    conflicts: Decision[]
  ): Decision {
    // Priority order: lease > treasury > peering > pricing
    const priorityOrder = ['lease', 'treasury', 'peering', 'pricing'];

    const allDecisions = [decision, ...conflicts];

    // Sort by priority
    allDecisions.sort((a, b) => {
      const aPriority = priorityOrder.indexOf(a.type);
      const bPriority = priorityOrder.indexOf(b.type);
      return aPriority - bPriority;
    });

    const highest = allDecisions[0];

    // Cancel lower priority decisions
    for (const d of allDecisions.slice(1)) {
      this.monitor.recordCancellation(d, `Cancelled due to higher priority: ${highest.type}`);
      this.priorityQueue.remove(d);
    }

    return highest;
  }

  /**
   * Handle decision execution error
   */
  private async handleDecisionError(
    decision: Decision,
    error: Error
  ): Promise<void> {
    console.error(`Decision error (${decision.type}):`, error);

    // Retry logic
    if (decision.retries < 3) {
      decision.retries++;
      decision.priority = Math.min(10, decision.priority + 1); // Increase priority

      this.priorityQueue.enqueue(decision);
    } else {
      // Max retries - alert human
      await this.alertHuman({
        severity: 'critical',
        type: 'decision_failure',
        decision,
        error: error.message
      });
    }
  }

  private async alertHuman(alert: Alert): Promise<void> {
    // Send alert via configured channels (email, SMS, etc.)
    console.error('ALERT:', alert);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Event handlers

  private async handlePricingRequest(event: any): Promise<void> {
    const decision: Decision = {
      id: crypto.randomUUID(),
      type: 'pricing',
      priority: 5, // Medium priority
      createdAt: Date.now(),
      retries: 0,
      metadata: {
        eventId: event.id,
        event
      }
    };

    this.priorityQueue.enqueue(decision);
  }

  private async handlePeerPriceUpdate(data: any): Promise<void> {
    // Trigger pricing re-evaluation if competitive
    const decision: Decision = {
      id: crypto.randomUUID(),
      type: 'pricing',
      priority: 7,
      createdAt: Date.now(),
      retries: 0,
      metadata: {
        action: 'recalculate',
        reason: 'peer_price_update'
      }
    };

    this.priorityQueue.enqueue(decision);
  }

  private async handlePeerDiscovered(peer: any): Promise<void> {
    const decision: Decision = {
      id: crypto.randomUUID(),
      type: 'peering',
      priority: 6,
      createdAt: Date.now(),
      retries: 0,
      metadata: {
        action: 'evaluate',
        peer
      }
    };

    this.priorityQueue.enqueue(decision);
  }

  private async handlePeerRequest(peer: any): Promise<void> {
    const decision: Decision = {
      id: crypto.randomUUID(),
      type: 'peering',
      priority: 7,
      createdAt: Date.now(),
      retries: 0,
      metadata: {
        action: 'accept_or_reject',
        peer
      }
    };

    this.priorityQueue.enqueue(decision);
  }

  private async handlePeerDegradation(peer: any): Promise<void> {
    const decision: Decision = {
      id: crypto.randomUUID(),
      type: 'peering',
      priority: 8,
      createdAt: Date.now(),
      retries: 0,
      metadata: {
        action: 'drop',
        peer
      }
    };

    this.priorityQueue.enqueue(decision);
  }

  private async handlePaymentReceived(payment: any): Promise<void> {
    // Update treasury balance
    this.eventBus.emit('treasury:balance:updated', payment);
  }

  private async handlePriceChange(priceData: any): Promise<void> {
    const decision: Decision = {
      id: crypto.randomUUID(),
      type: 'treasury',
      priority: 6,
      createdAt: Date.now(),
      retries: 0,
      metadata: {
        action: 'evaluate_swap',
        priceData
      }
    };

    this.priorityQueue.enqueue(decision);
  }

  private async handleBalanceThreshold(balanceData: any): Promise<void> {
    const decision: Decision = {
      id: crypto.randomUUID(),
      type: 'treasury',
      priority: 8,
      createdAt: Date.now(),
      retries: 0,
      metadata: {
        action: 'swap',
        balanceData,
        urgency: 'high'
      }
    };

    this.priorityQueue.enqueue(decision);
  }

  private async handleLeaseExpiring(leaseData: any): Promise<void> {
    const timeUntilExpiry = leaseData.expiresAt - Date.now();
    const priority = timeUntilExpiry < 21600000 ? 10 : 9; // 10 if < 6 hours

    const decision: Decision = {
      id: crypto.randomUUID(),
      type: 'lease',
      priority,
      createdAt: Date.now(),
      retries: 0,
      metadata: {
        action: 'renew',
        leaseData
      }
    };

    this.priorityQueue.enqueue(decision);
  }

  private async handleLeaseRenewalFailed(error: any): Promise<void> {
    await this.alertHuman({
      severity: 'critical',
      type: 'lease_renewal_failed',
      error: error.message,
      decision: null
    });
  }
}

interface Decision {
  id: string;
  type: DecisionType;
  priority: number;        // 1-10 (10 = highest)
  createdAt: number;
  retries: number;
  metadata?: Record<string, any>;
}

type DecisionType = 'pricing' | 'peering' | 'treasury' | 'lease';

interface Alert {
  severity: 'info' | 'warning' | 'critical';
  type: string;
  decision: Decision | null;
  error?: string;
}

interface EngineConfig {
  simulationMode: boolean;
  maxQueueSize: number;
  maxRetries: number;
}
```

### Priority Queue

```typescript
/**
 * Priority queue for decisions
 */
class PriorityQueue<T extends { priority: number; createdAt: number }> {
  private items: T[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Add item to queue
   */
  enqueue(item: T): void {
    if (this.items.length >= this.maxSize) {
      // Remove lowest priority item
      this.items.sort((a, b) => b.priority - a.priority);
      this.items.pop();
    }

    this.items.push(item);
    this.items.sort((a, b) => {
      // Sort by priority (descending), then by age (ascending)
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * Get next item from queue
   */
  async dequeue(): Promise<T | null> {
    return this.items.shift() || null;
  }

  /**
   * Remove specific item
   */
  remove(item: T): void {
    const index = this.items.findIndex(i => i === item);
    if (index !== -1) {
      this.items.splice(index, 1);
    }
  }

  /**
   * Get all pending items
   */
  getPending(): T[] {
    return [...this.items];
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.items.length;
  }
}
```

### Decision Executors

```typescript
/**
 * Base decision executor
 */
abstract class DecisionExecutor {
  abstract execute(decision: Decision): Promise<ExecutionResult>;
}

/**
 * Pricing decision executor
 */
class PricingExecutor extends DecisionExecutor {
  constructor(private pricingEngine: PricingEngine) {
    super();
  }

  async execute(decision: Decision): Promise<ExecutionResult> {
    const { event } = decision.metadata || {};

    if (!event) {
      throw new Error('No event in pricing decision metadata');
    }

    const quote = await this.pricingEngine.calculatePrice(
      event,
      event.pubkey
    );

    return {
      success: true,
      data: { quote },
      timestamp: Date.now()
    };
  }
}

/**
 * Peering decision executor
 */
class PeeringExecutor extends DecisionExecutor {
  constructor(private peeringSelector: ActivePeeringSelector) {
    super();
  }

  async execute(decision: Decision): Promise<ExecutionResult> {
    const { action, peer } = decision.metadata || {};

    switch (action) {
      case 'evaluate':
        const decisions = await this.peeringSelector.selectPeers();
        return {
          success: true,
          data: { decisions },
          timestamp: Date.now()
        };

      case 'accept_or_reject':
        // Implementation would use PassivePeeringHandler
        return {
          success: true,
          data: { accepted: false },
          timestamp: Date.now()
        };

      case 'drop':
        // Implementation would drop peer
        return {
          success: true,
          data: { dropped: peer },
          timestamp: Date.now()
        };

      default:
        throw new Error(`Unknown peering action: ${action}`);
    }
  }
}

/**
 * Treasury decision executor
 */
class TreasuryExecutor extends DecisionExecutor {
  constructor(private treasuryManager: AKTSwapDecisionEngine) {
    super();
  }

  async execute(decision: Decision): Promise<ExecutionResult> {
    const { action } = decision.metadata || {};

    const swapDecision = await this.treasuryManager.makeSwapDecision();

    if (swapDecision.shouldSwap) {
      // Execute swap
      // Implementation would use SwapExecutor
      return {
        success: true,
        data: { swapDecision },
        timestamp: Date.now()
      };
    }

    return {
      success: true,
      data: { swapDecision },
      timestamp: Date.now()
    };
  }
}

/**
 * Lease decision executor
 */
class LeaseExecutor extends DecisionExecutor {
  constructor(private leaseManager: AkashLeaseManager) {
    super();
  }

  async execute(decision: Decision): Promise<ExecutionResult> {
    const { action } = decision.metadata || {};

    if (action === 'renew') {
      const result = await this.leaseManager.renewLease();

      return {
        success: result.success,
        data: { result },
        timestamp: Date.now()
      };
    }

    throw new Error(`Unknown lease action: ${action}`);
  }
}

interface ExecutionResult {
  success: boolean;
  data: any;
  timestamp: number;
  error?: string;
}
```

### Event Bus

```typescript
/**
 * Event bus for inter-component communication
 */
class EventBus {
  private handlers: Map<string, Array<(data: any) => void>> = new Map();

  /**
   * Register event handler
   */
  on(event: string, handler: (data: any) => void): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }

    this.handlers.get(event)!.push(handler);
  }

  /**
   * Emit event
   */
  emit(event: string, data?: any): void {
    const handlers = this.handlers.get(event);

    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    }
  }

  /**
   * Remove event handler
   */
  off(event: string, handler: (data: any) => void): void {
    const handlers = this.handlers.get(event);

    if (!handlers) {
      return;
    }

    const index = handlers.indexOf(handler);

    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }
}
```

## Monitoring and Observability

### Decision Monitor

```typescript
/**
 * Monitor and track decision execution
 */
class DecisionMonitor {
  private decisions: Map<string, DecisionRecord> = new Map();
  private metrics: MonitoringMetrics;

  constructor() {
    this.metrics = {
      totalDecisions: 0,
      successfulDecisions: 0,
      failedDecisions: 0,
      cancelledDecisions: 0,
      avgExecutionTime: 0,
      decisionsByType: new Map(),
      decisionsByPriority: new Map()
    };
  }

  /**
   * Record decision
   */
  recordDecision(decision: Decision): void {
    this.decisions.set(decision.id, {
      decision,
      startTime: Date.now(),
      status: 'pending'
    });

    this.metrics.totalDecisions++;

    // Track by type
    const typeCount = this.metrics.decisionsByType.get(decision.type) ?? 0;
    this.metrics.decisionsByType.set(decision.type, typeCount + 1);

    // Track by priority
    const priorityCount = this.metrics.decisionsByPriority.get(decision.priority) ?? 0;
    this.metrics.decisionsByPriority.set(decision.priority, priorityCount + 1);
  }

  /**
   * Record decision result
   */
  recordResult(decision: Decision, result: ExecutionResult): void {
    const record = this.decisions.get(decision.id);

    if (!record) {
      return;
    }

    const executionTime = Date.now() - record.startTime;

    record.endTime = Date.now();
    record.status = result.success ? 'success' : 'failed';
    record.result = result;

    if (result.success) {
      this.metrics.successfulDecisions++;
    } else {
      this.metrics.failedDecisions++;
    }

    // Update avg execution time
    this.metrics.avgExecutionTime =
      (this.metrics.avgExecutionTime * (this.metrics.totalDecisions - 1) + executionTime) /
      this.metrics.totalDecisions;
  }

  /**
   * Record decision error
   */
  recordError(decision: Decision, error: Error): void {
    const record = this.decisions.get(decision.id);

    if (!record) {
      return;
    }

    record.endTime = Date.now();
    record.status = 'failed';
    record.error = error.message;

    this.metrics.failedDecisions++;
  }

  /**
   * Record decision cancellation
   */
  recordCancellation(decision: Decision, reason: string): void {
    const record = this.decisions.get(decision.id);

    if (!record) {
      return;
    }

    record.endTime = Date.now();
    record.status = 'cancelled';
    record.error = reason;

    this.metrics.cancelledDecisions++;
  }

  /**
   * Get metrics
   */
  getMetrics(): MonitoringMetrics {
    return { ...this.metrics };
  }

  /**
   * Get decision history
   */
  getHistory(limit: number = 100): DecisionRecord[] {
    return Array.from(this.decisions.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  /**
   * Get decisions by type
   */
  getDecisionsByType(type: DecisionType): DecisionRecord[] {
    return Array.from(this.decisions.values())
      .filter(r => r.decision.type === type)
      .sort((a, b) => b.startTime - a.startTime);
  }
}

interface DecisionRecord {
  decision: Decision;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  result?: ExecutionResult;
  error?: string;
}

interface MonitoringMetrics {
  totalDecisions: number;
  successfulDecisions: number;
  failedDecisions: number;
  cancelledDecisions: number;
  avgExecutionTime: number;
  decisionsByType: Map<DecisionType, number>;
  decisionsByPriority: Map<number, number>;
}
```

### Dashboard

```typescript
/**
 * Real-time decision dashboard
 */
class DecisionDashboard {
  constructor(private monitor: DecisionMonitor) {}

  /**
   * Get dashboard data
   */
  getDashboardData(): DashboardData {
    const metrics = this.monitor.getMetrics();
    const recentHistory = this.monitor.getHistory(50);

    const successRate =
      metrics.successfulDecisions /
      (metrics.successfulDecisions + metrics.failedDecisions);

    const decisionsByType: Record<string, number> = {};
    for (const [type, count] of metrics.decisionsByType) {
      decisionsByType[type] = count;
    }

    return {
      overview: {
        totalDecisions: metrics.totalDecisions,
        successRate,
        avgExecutionTime: metrics.avgExecutionTime,
        pendingDecisions: this.getPendingCount(recentHistory)
      },
      byType: decisionsByType,
      recentDecisions: recentHistory.slice(0, 10).map(r => ({
        id: r.decision.id,
        type: r.decision.type,
        priority: r.decision.priority,
        status: r.status,
        executionTime: r.endTime ? r.endTime - r.startTime : null
      }))
    };
  }

  private getPendingCount(history: DecisionRecord[]): number {
    return history.filter(r => r.status === 'pending').length;
  }
}

interface DashboardData {
  overview: {
    totalDecisions: number;
    successRate: number;
    avgExecutionTime: number;
    pendingDecisions: number;
  };
  byType: Record<string, number>;
  recentDecisions: Array<{
    id: string;
    type: string;
    priority: number;
    status: string;
    executionTime: number | null;
  }>;
}
```

## Simulation Mode

### Decision Simulator

```typescript
/**
 * Simulate decisions without executing
 */
class DecisionSimulator {
  private enabled: boolean = false;
  private simulations: SimulationRecord[] = [];

  /**
   * Enable simulation mode
   */
  enable(): void {
    this.enabled = true;
    console.log('SIMULATION MODE ENABLED - No decisions will be executed');
  }

  /**
   * Disable simulation mode
   */
  disable(): void {
    this.enabled = false;
    console.log('SIMULATION MODE DISABLED');
  }

  /**
   * Check if simulation is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Simulate decision
   */
  simulate(decision: Decision): void {
    const simulation: SimulationRecord = {
      decision,
      simulatedAt: Date.now(),
      predictedOutcome: this.predictOutcome(decision)
    };

    this.simulations.push(simulation);

    console.log('SIMULATION:', {
      type: decision.type,
      priority: decision.priority,
      predicted: simulation.predictedOutcome
    });
  }

  /**
   * Predict decision outcome
   */
  private predictOutcome(decision: Decision): any {
    switch (decision.type) {
      case 'pricing':
        return {
          success: true,
          estimatedPrice: 100 // Placeholder
        };

      case 'peering':
        return {
          success: true,
          action: decision.metadata?.action
        };

      case 'treasury':
        return {
          success: true,
          estimatedSwap: decision.metadata?.balanceData
        };

      case 'lease':
        return {
          success: true,
          estimatedCost: 100 // Placeholder
        };
    }
  }

  /**
   * Get simulation history
   */
  getSimulations(): SimulationRecord[] {
    return [...this.simulations];
  }

  /**
   * Clear simulation history
   */
  clearSimulations(): void {
    this.simulations = [];
  }
}

interface SimulationRecord {
  decision: Decision;
  simulatedAt: number;
  predictedOutcome: any;
}
```

## Learning and Adaptation

### Simple Rule-Based Learning

```typescript
/**
 * Learn from decision outcomes and adapt parameters
 */
class DecisionLearner {
  private outcomes: Map<string, OutcomeHistory> = new Map();

  /**
   * Record decision outcome
   */
  recordOutcome(
    decision: Decision,
    result: ExecutionResult,
    actualValue: number
  ): void {
    const key = this.getOutcomeKey(decision);

    if (!this.outcomes.has(key)) {
      this.outcomes.set(key, {
        successes: 0,
        failures: 0,
        avgValue: 0,
        values: []
      });
    }

    const history = this.outcomes.get(key)!;

    if (result.success) {
      history.successes++;
      history.values.push(actualValue);

      // Update average
      history.avgValue =
        history.values.reduce((a, b) => a + b, 0) / history.values.length;
    } else {
      history.failures++;
    }
  }

  /**
   * Get recommended adjustment based on learning
   */
  getRecommendation(decision: Decision): Recommendation {
    const key = this.getOutcomeKey(decision);
    const history = this.outcomes.get(key);

    if (!history) {
      return {
        adjust: false,
        reason: 'Insufficient data'
      };
    }

    const successRate = history.successes / (history.successes + history.failures);

    // Adjust based on success rate
    if (successRate < 0.5) {
      return {
        adjust: true,
        reason: 'Low success rate',
        suggestion: this.getSuggestion(decision, 'decrease')
      };
    } else if (successRate > 0.9) {
      return {
        adjust: true,
        reason: 'High success rate - can be more aggressive',
        suggestion: this.getSuggestion(decision, 'increase')
      };
    }

    return {
      adjust: false,
      reason: 'Success rate in acceptable range'
    };
  }

  private getOutcomeKey(decision: Decision): string {
    return `${decision.type}:${JSON.stringify(decision.metadata)}`;
  }

  private getSuggestion(
    decision: Decision,
    direction: 'increase' | 'decrease'
  ): string {
    switch (decision.type) {
      case 'pricing':
        return direction === 'increase'
          ? 'Increase prices by 10%'
          : 'Decrease prices by 10%';

      case 'peering':
        return direction === 'increase'
          ? 'Accept more peers'
          : 'Be more selective';

      case 'treasury':
        return direction === 'increase'
          ? 'Swap more frequently'
          : 'Swap less frequently';

      default:
        return 'No suggestion';
    }
  }
}

interface OutcomeHistory {
  successes: number;
  failures: number;
  avgValue: number;
  values: number[];
}

interface Recommendation {
  adjust: boolean;
  reason: string;
  suggestion?: string;
}
```

## Integration with Dassie Reactive Model

### Reactive Decision Engine

```typescript
/**
 * Integrate with Dassie reactive model
 */
class ReactiveDassieDecisionEngine {
  private reactor: Reactor;

  constructor(
    private decisionEngine: DecisionEngine,
    private dassieNode: DassieNode
  ) {
    this.reactor = createReactor();
    this.setupReactiveSignals();
  }

  /**
   * Setup reactive signals
   */
  private setupReactiveSignals(): void {
    // Create signals for key metrics
    const [aktBalance, setAktBalance] = createSignal(0);
    const [evmBalance, setEvmBalance] = createSignal(0);
    const [peerCount, setPeerCount] = createSignal(0);
    const [queueDepth, setQueueDepth] = createSignal(0);

    // Create computed values
    const shouldSwap = createComputed(() => {
      return evmBalance() > 50 && aktBalance() < 100;
    });

    const shouldAddPeer = createComputed(() => {
      return peerCount() < 10 && queueDepth() > 100;
    });

    // Create actors for background tasks
    createActor(async () => {
      // Update balances every 5 minutes
      while (true) {
        const balances = await this.fetchBalances();
        setAktBalance(balances.akt);
        setEvmBalance(balances.evm);

        await this.sleep(300000);
      }
    });

    createActor(async () => {
      // Update peer count every minute
      while (true) {
        const peers = await this.fetchPeerCount();
        setPeerCount(peers);

        await this.sleep(60000);
      }
    });

    // React to computed values
    createActor(async () => {
      while (true) {
        if (shouldSwap()) {
          this.decisionEngine.eventBus.emit('balance:threshold', {
            akt: aktBalance(),
            evm: evmBalance()
          });
        }

        if (shouldAddPeer()) {
          this.decisionEngine.eventBus.emit('peering:capacity', {
            peerCount: peerCount(),
            queueDepth: queueDepth()
          });
        }

        await this.sleep(10000); // Check every 10 seconds
      }
    });
  }

  private async fetchBalances(): Promise<{ akt: number; evm: number }> {
    // Implementation would fetch from blockchain
    return { akt: 0, evm: 0 };
  }

  private async fetchPeerCount(): Promise<number> {
    // Implementation would query Dassie node
    return 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Placeholder types for Dassie integration
type Reactor = any;
type DassieNode = any;

function createReactor(): Reactor {
  return {};
}

function createSignal(initial: any): [() => any, (val: any) => void] {
  let value = initial;
  return [() => value, (val) => { value = val; }];
}

function createComputed(fn: () => any): () => any {
  return fn;
}

function createActor(fn: () => Promise<void>): void {
  fn();
}
```

## Override Mechanisms

### Human Override

```typescript
/**
 * Allow human intervention when needed
 */
class HumanOverride {
  private overrides: Map<string, Override> = new Map();

  /**
   * Register override
   */
  registerOverride(
    decisionType: DecisionType,
    condition: (decision: Decision) => boolean,
    handler: (decision: Decision) => Promise<Decision | null>
  ): void {
    this.overrides.set(decisionType, {
      condition,
      handler
    });
  }

  /**
   * Check if decision needs human approval
   */
  async checkOverride(decision: Decision): Promise<Decision | null> {
    const override = this.overrides.get(decision.type);

    if (!override) {
      return decision; // No override registered
    }

    if (override.condition(decision)) {
      // Requires human approval
      return await override.handler(decision);
    }

    return decision;
  }

  /**
   * Request human approval
   */
  async requestApproval(decision: Decision): Promise<Decision | null> {
    console.log('HUMAN APPROVAL REQUIRED:');
    console.log(JSON.stringify(decision, null, 2));

    // In production, this would:
    // 1. Send notification to human operator
    // 2. Wait for approval via API/UI
    // 3. Return approved/rejected decision

    return null; // Placeholder
  }
}

interface Override {
  condition: (decision: Decision) => boolean;
  handler: (decision: Decision) => Promise<Decision | null>;
}
```

## Complete Example

```typescript
// Initialize all components
const pricingEngine = new PricingEngine(PRICING_WEIGHTS, peerMonitor, oracle);
const peeringSelector = new ActivePeeringSelector(evaluator, discovery);
const treasuryManager = new AKTSwapDecisionEngine(
  balanceAggregator,
  priceOracle,
  leaseManager
);
const leaseManager = new AkashLeaseManager(akashClient, treasuryManager);

// Create decision engine
const decisionEngine = new DecisionEngine(
  pricingEngine,
  peeringSelector,
  treasuryManager,
  leaseManager,
  {
    simulationMode: false,
    maxQueueSize: 1000,
    maxRetries: 3
  }
);

// Setup monitoring
const monitor = decisionEngine.monitor;
const dashboard = new DecisionDashboard(monitor);

// Setup human overrides
const humanOverride = new HumanOverride();

// Register override for large swaps
humanOverride.registerOverride(
  'treasury',
  (decision) => {
    const amount = decision.metadata?.balanceData?.amount ?? 0;
    return amount > 10000; // Swaps > $10k require approval
  },
  async (decision) => {
    return await humanOverride.requestApproval(decision);
  }
);

// Start the engine
console.log('Decision engine started');

// Trigger events
decisionEngine.eventBus.emit('event:publish:request', {
  id: 'event123',
  kind: 1,
  content: 'Hello world',
  pubkey: 'user123'
});

// View dashboard
setInterval(() => {
  const data = dashboard.getDashboardData();
  console.log('Dashboard:', data);
}, 60000); // Every minute
```

## Testing Strategy

```typescript
describe('Decision Engine', () => {
  it('should prioritize lease decisions over treasury', async () => {
    const engine = new DecisionEngine(
      pricingEngine,
      peeringSelector,
      treasuryManager,
      leaseManager,
      { simulationMode: true, maxQueueSize: 100, maxRetries: 3 }
    );

    // Add treasury decision
    engine.eventBus.emit('balance:threshold', { evm: 100, akt: 50 });

    // Add lease decision
    engine.eventBus.emit('lease:expiring', {
      expiresAt: Date.now() + 3600000
    });

    await sleep(1000);

    const history = engine.monitor.getHistory(2);

    // Lease should be executed first
    expect(history[0].decision.type).toBe('lease');
    expect(history[1].decision.type).toBe('treasury');
  });

  it('should resolve conflicts correctly', async () => {
    const engine = new DecisionEngine(
      pricingEngine,
      peeringSelector,
      treasuryManager,
      leaseManager,
      { simulationMode: true, maxQueueSize: 100, maxRetries: 3 }
    );

    // Add conflicting decisions
    const d1: Decision = {
      id: '1',
      type: 'treasury',
      priority: 8,
      createdAt: Date.now(),
      retries: 0
    };

    const d2: Decision = {
      id: '2',
      type: 'lease',
      priority: 10,
      createdAt: Date.now(),
      retries: 0
    };

    engine['priorityQueue'].enqueue(d1);
    engine['priorityQueue'].enqueue(d2);

    const resolved = engine['resolveConflicts'](d1, [d2]);

    // Lease should win
    expect(resolved.type).toBe('lease');
  });

  it('should track metrics correctly', async () => {
    const monitor = new DecisionMonitor();

    const decision: Decision = {
      id: '1',
      type: 'pricing',
      priority: 5,
      createdAt: Date.now(),
      retries: 0
    };

    monitor.recordDecision(decision);
    monitor.recordResult(decision, { success: true, data: {}, timestamp: Date.now() });

    const metrics = monitor.getMetrics();

    expect(metrics.totalDecisions).toBe(1);
    expect(metrics.successfulDecisions).toBe(1);
  });
});
```

## Conclusion

This decision engine provides:

1. **Event-driven architecture**: React to events in real-time
2. **Priority-based execution**: Handle urgent decisions first
3. **Conflict resolution**: Intelligently resolve competing decisions
4. **Full observability**: Monitor all decisions and outcomes
5. **Simulation mode**: Test decisions without execution
6. **Dassie integration**: Use reactive programming model
7. **Human override**: Allow intervention when needed
8. **Learning capability**: Adapt based on outcomes

The engine integrates pricing, peering, and treasury algorithms into a cohesive autonomous system that operates without human intervention while maintaining safety and observability.

**Key Features:**
- Event-driven decision loop
- Priority queue for urgent decisions
- Conflict resolution between competing decisions
- Real-time monitoring and dashboard
- Simulation mode for testing
- Integration with Dassie reactive model
- Human override for critical decisions
- Rule-based learning and adaptation

Implementation provides the foundation for a fully autonomous relay that makes intelligent decisions about pricing, peering, and treasury management while maintaining transparency and safety.
