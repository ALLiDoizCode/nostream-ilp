# Autonomous Relay Pricing Algorithm

## Overview

The pricing algorithm determines the cost for publishing events to the relay. It must balance profitability with competitiveness while considering multiple factors including event characteristics, network conditions, and user behavior.

## Design Principles

1. **Dynamic Pricing**: Prices adjust in real-time based on supply/demand
2. **Competitive**: Match or beat peer relay prices
3. **Fair**: Returning customers and low-impact events get discounts
4. **Profitable**: Cover costs + margin for treasury growth
5. **Predictable**: Users can estimate costs before publishing

## Pricing Factors

### Base Cost Structure

```typescript
interface PricingFactors {
  // Event characteristics
  kind: number;              // Event kind (1, 30023, etc.)
  sizeBytes: number;         // Content size
  storageTier: 'hot' | 'cold'; // Hot (DB) or Cold (Arweave)

  // Network conditions
  queueDepth: number;        // Current event processing queue
  peerPrices: number[];      // Competitor pricing

  // User factors
  userReputation: number;    // Score 0-100
  previousEvents: number;    // Historical event count

  // Cost factors
  arweavePrice: number;      // Current AR storage cost
  dbCost: number;            // Database storage cost per MB
  cpuLoad: number;           // Current CPU utilization 0-100
}
```

### Weight Configuration

```typescript
const PRICING_WEIGHTS = {
  // Base multipliers by event kind
  kindMultipliers: {
    1: 0.1,        // Short notes - cheap
    3: 0.2,        // Follow lists
    7: 0.05,       // Reactions - very cheap
    30023: 2.0,    // Long-form content
    1063: 3.0,     // File metadata
    71: 5.0,       // Video events
    default: 1.0   // Unknown kinds
  },

  // Size-based pricing (per MB)
  sizePrice: {
    firstMB: 0,           // First MB free
    perAdditionalMB: 1000 // 1000 msats per MB after first
  },

  // Storage tier multipliers
  storageTierMultipliers: {
    hot: 1.0,    // No premium for hot storage
    cold: 1.5    // 50% premium for permanent Arweave storage
  },

  // Congestion pricing
  congestion: {
    threshold: 100,     // Queue depth threshold
    multiplier: 0.01    // 1% increase per item over threshold
  },

  // Reputation discounts
  reputation: {
    maxDiscount: 0.5,   // 50% max discount for best users
    minScore: 0,        // No discount below this score
    maxScore: 100       // Full discount at this score
  },

  // Competitive pricing
  competitive: {
    matchPercentage: 0.95,  // Price at 95% of competitor average
    minMargin: 0.1          // Never go below 10% margin
  }
};
```

## Core Algorithm

### Pseudocode

```
FUNCTION calculateEventPrice(event, factors):
    // 1. Calculate base price
    basePrice = BASE_RELAY_FEE

    // 2. Apply kind multiplier
    kindMultiplier = getKindMultiplier(event.kind)
    price = basePrice * kindMultiplier

    // 3. Add size-based fee
    sizeMB = factors.sizeBytes / (1024 * 1024)
    if sizeMB > 1:
        price += (sizeMB - 1) * SIZE_PRICE_PER_MB

    // 4. Add storage costs
    if factors.storageTier == 'cold':
        arweaveCost = calculateArweaveCost(sizeMB, factors.arweavePrice)
        price += arweaveCost * STORAGE_TIER_MULTIPLIER
    else:
        dbCost = sizeMB * DB_COST_PER_MB
        price += dbCost

    // 5. Apply congestion multiplier
    if factors.queueDepth > CONGESTION_THRESHOLD:
        excess = factors.queueDepth - CONGESTION_THRESHOLD
        congestionMultiplier = 1 + (excess * CONGESTION_RATE)
        price *= congestionMultiplier

    // 6. Apply reputation discount
    reputationDiscount = calculateReputationDiscount(factors.userReputation)
    price *= (1 - reputationDiscount)

    // 7. Check competitive pricing
    avgPeerPrice = average(factors.peerPrices)
    if avgPeerPrice > 0:
        targetPrice = avgPeerPrice * MATCH_PERCENTAGE
        price = min(price, targetPrice)

    // 8. Enforce minimum margin
    minPrice = calculateCosts(event, factors) * (1 + MIN_MARGIN)
    price = max(price, minPrice)

    return round(price)
```

### TypeScript Implementation

```typescript
// Constants
const BASE_RELAY_FEE = 100; // 100 msats base fee
const SIZE_PRICE_PER_MB = 1000; // 1000 msats per MB after first
const DB_COST_PER_MB = 50; // 50 msats per MB in DB
const CONGESTION_THRESHOLD = 100;
const CONGESTION_RATE = 0.01;
const MIN_MARGIN = 0.1; // 10% minimum margin

class PricingEngine {
  constructor(
    private config: typeof PRICING_WEIGHTS,
    private peerMonitor: PeerPriceMonitor,
    private arweaveOracle: ArweavePriceOracle
  ) {}

  /**
   * Calculate the price for publishing an event
   */
  async calculatePrice(
    event: NostrEvent,
    userPubkey: string
  ): Promise<PriceQuote> {
    const factors = await this.gatherPricingFactors(event, userPubkey);

    // 1. Base price with kind multiplier
    const kindMultiplier = this.getKindMultiplier(event.kind);
    let price = BASE_RELAY_FEE * kindMultiplier;

    // 2. Size-based pricing
    const sizeMB = factors.sizeBytes / (1024 * 1024);
    const sizeFee = this.calculateSizeFee(sizeMB);
    price += sizeFee;

    // 3. Storage costs
    const storageCost = await this.calculateStorageCost(
      sizeMB,
      factors.storageTier
    );
    price += storageCost;

    // 4. Congestion pricing
    const congestionMultiplier = this.calculateCongestionMultiplier(
      factors.queueDepth
    );
    price *= congestionMultiplier;

    // 5. Reputation discount
    const reputationDiscount = this.calculateReputationDiscount(
      factors.userReputation
    );
    price *= (1 - reputationDiscount);

    // 6. Competitive pricing check
    price = await this.applyCompetitivePricing(price, event.kind, sizeMB);

    // 7. Enforce minimum margin
    const minPrice = this.calculateMinPrice(factors);
    price = Math.max(price, minPrice);

    return {
      amount: Math.round(price),
      breakdown: {
        baseFee: BASE_RELAY_FEE * kindMultiplier,
        sizeFee,
        storageCost,
        congestionMultiplier,
        reputationDiscount,
        finalPrice: Math.round(price)
      },
      factors
    };
  }

  /**
   * Get multiplier for event kind
   */
  private getKindMultiplier(kind: number): number {
    return this.config.kindMultipliers[kind] ?? this.config.kindMultipliers.default;
  }

  /**
   * Calculate fee based on content size
   */
  private calculateSizeFee(sizeMB: number): number {
    if (sizeMB <= 1) {
      return this.config.sizePrice.firstMB;
    }

    const additionalMB = sizeMB - 1;
    return additionalMB * this.config.sizePrice.perAdditionalMB;
  }

  /**
   * Calculate storage cost (DB or Arweave)
   */
  private async calculateStorageCost(
    sizeMB: number,
    tier: 'hot' | 'cold'
  ): Promise<number> {
    if (tier === 'hot') {
      return sizeMB * DB_COST_PER_MB;
    }

    // Cold storage (Arweave)
    const arPrice = await this.arweaveOracle.getPricePerMB();
    const arweaveBytes = sizeMB * 1024 * 1024;
    const arweaveCost = arPrice * arweaveBytes;

    // Convert AR to msats (assuming price oracle provides conversion)
    const msatsCost = await this.arweaveOracle.convertToMsats(arweaveCost);

    return msatsCost * this.config.storageTierMultipliers.cold;
  }

  /**
   * Calculate congestion multiplier based on queue depth
   */
  private calculateCongestionMultiplier(queueDepth: number): number {
    if (queueDepth <= this.config.congestion.threshold) {
      return 1.0;
    }

    const excess = queueDepth - this.config.congestion.threshold;
    return 1 + (excess * this.config.congestion.multiplier);
  }

  /**
   * Calculate reputation-based discount
   */
  private calculateReputationDiscount(reputation: number): number {
    if (reputation <= this.config.reputation.minScore) {
      return 0;
    }

    if (reputation >= this.config.reputation.maxScore) {
      return this.config.reputation.maxDiscount;
    }

    // Linear interpolation
    const range = this.config.reputation.maxScore - this.config.reputation.minScore;
    const position = (reputation - this.config.reputation.minScore) / range;

    return position * this.config.reputation.maxDiscount;
  }

  /**
   * Apply competitive pricing constraints
   */
  private async applyCompetitivePricing(
    price: number,
    kind: number,
    sizeMB: number
  ): Promise<number> {
    const peerPrices = await this.peerMonitor.getPricesForEvent(kind, sizeMB);

    if (peerPrices.length === 0) {
      return price; // No peer data, use calculated price
    }

    const avgPeerPrice = peerPrices.reduce((a, b) => a + b, 0) / peerPrices.length;
    const targetPrice = avgPeerPrice * this.config.competitive.matchPercentage;

    // Price at 95% of average peer price, but don't go below our calculated price
    // if it would violate minimum margin
    return Math.min(price, targetPrice);
  }

  /**
   * Calculate minimum price to maintain margin
   */
  private calculateMinPrice(factors: PricingFactors): number {
    const directCosts =
      (factors.storageTier === 'cold'
        ? factors.arweavePrice
        : factors.dbCost) +
      (factors.sizeBytes / (1024 * 1024)) * 10; // Estimated processing cost

    return directCosts * (1 + this.config.competitive.minMargin);
  }

  /**
   * Gather all pricing factors
   */
  private async gatherPricingFactors(
    event: NostrEvent,
    userPubkey: string
  ): Promise<PricingFactors> {
    const [
      queueDepth,
      userStats,
      storageTier,
      arweavePrice
    ] = await Promise.all([
      this.getQueueDepth(),
      this.getUserStats(userPubkey),
      this.determineStorageTier(event),
      this.arweaveOracle.getPricePerMB()
    ]);

    return {
      kind: event.kind,
      sizeBytes: JSON.stringify(event).length,
      storageTier,
      queueDepth,
      peerPrices: await this.peerMonitor.getPricesForEvent(
        event.kind,
        JSON.stringify(event).length / (1024 * 1024)
      ),
      userReputation: userStats.reputation,
      previousEvents: userStats.eventCount,
      arweavePrice,
      dbCost: DB_COST_PER_MB,
      cpuLoad: await this.getCpuLoad()
    };
  }

  private async getQueueDepth(): Promise<number> {
    // Implementation would query event processing queue
    return 0; // Placeholder
  }

  private async getUserStats(pubkey: string): Promise<UserStats> {
    // Implementation would query user database
    return { reputation: 50, eventCount: 0 }; // Placeholder
  }

  private async determineStorageTier(event: NostrEvent): Promise<'hot' | 'cold'> {
    // Large content or specific kinds go to Arweave
    const ARWEAVE_KINDS = [30023, 1063, 71, 22, 20];
    const size = JSON.stringify(event).length;

    if (ARWEAVE_KINDS.includes(event.kind) || size > 1024 * 1024) {
      return 'cold';
    }

    return 'hot';
  }

  private async getCpuLoad(): Promise<number> {
    // Implementation would check system CPU usage
    return 0; // Placeholder
  }
}

interface PriceQuote {
  amount: number;
  breakdown: {
    baseFee: number;
    sizeFee: number;
    storageCost: number;
    congestionMultiplier: number;
    reputationDiscount: number;
    finalPrice: number;
  };
  factors: PricingFactors;
}

interface UserStats {
  reputation: number;
  eventCount: number;
}
```

## Competitive Analysis Integration

### Peer Price Monitoring

```typescript
class PeerPriceMonitor {
  private priceCache: Map<string, PeerPrice[]> = new Map();
  private updateInterval = 300000; // 5 minutes

  constructor(private peerManager: PeerManager) {
    this.startPriceMonitoring();
  }

  /**
   * Get prices from peer relays for similar events
   */
  async getPricesForEvent(kind: number, sizeMB: number): Promise<number[]> {
    const cacheKey = `${kind}-${Math.floor(sizeMB)}`;

    // Check cache
    const cached = this.priceCache.get(cacheKey);
    if (cached && Date.now() - cached[0].timestamp < this.updateInterval) {
      return cached.map(p => p.price);
    }

    // Fetch from peers
    const peers = await this.peerManager.getActivePeers();
    const prices: number[] = [];

    for (const peer of peers) {
      try {
        const quote = await this.requestPriceQuote(peer, kind, sizeMB);
        if (quote && quote.price > 0) {
          prices.push(quote.price);
        }
      } catch (error) {
        // Peer unavailable, skip
        continue;
      }
    }

    // Update cache
    this.priceCache.set(
      cacheKey,
      prices.map(price => ({ price, timestamp: Date.now() }))
    );

    return prices;
  }

  /**
   * Request price quote from peer relay
   */
  private async requestPriceQuote(
    peer: Peer,
    kind: number,
    sizeMB: number
  ): Promise<{ price: number } | null> {
    // Send dummy event to peer's pricing endpoint
    const response = await fetch(`${peer.url}/api/v1/pricing/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        size_bytes: sizeMB * 1024 * 1024
      })
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  }

  /**
   * Background task to update price data
   */
  private startPriceMonitoring() {
    setInterval(async () => {
      // Pre-fetch prices for common event kinds
      const commonKinds = [1, 30023, 1063];
      const commonSizes = [0.1, 1, 10]; // MB

      for (const kind of commonKinds) {
        for (const size of commonSizes) {
          await this.getPricesForEvent(kind, size);
        }
      }
    }, this.updateInterval);
  }
}

interface PeerPrice {
  price: number;
  timestamp: number;
}
```

## A/B Testing Framework

### Price Experimentation

```typescript
class PricingExperiment {
  private experiments: Map<string, Experiment> = new Map();

  /**
   * Create a pricing experiment
   */
  createExperiment(
    name: string,
    variants: PricingVariant[],
    duration: number = 86400000 // 24 hours default
  ): void {
    this.experiments.set(name, {
      name,
      variants,
      startTime: Date.now(),
      endTime: Date.now() + duration,
      results: new Map()
    });
  }

  /**
   * Select pricing variant for user
   */
  selectVariant(experimentName: string, userPubkey: string): PricingVariant | null {
    const experiment = this.experiments.get(experimentName);
    if (!experiment) {
      return null;
    }

    // Check if experiment is still active
    if (Date.now() > experiment.endTime) {
      return null;
    }

    // Consistent assignment based on pubkey hash
    const hash = this.hashPubkey(userPubkey);
    const variantIndex = hash % experiment.variants.length;

    return experiment.variants[variantIndex];
  }

  /**
   * Record experiment result
   */
  recordResult(
    experimentName: string,
    variantId: string,
    accepted: boolean,
    price: number
  ): void {
    const experiment = this.experiments.get(experimentName);
    if (!experiment) {
      return;
    }

    if (!experiment.results.has(variantId)) {
      experiment.results.set(variantId, {
        offers: 0,
        acceptances: 0,
        revenue: 0
      });
    }

    const result = experiment.results.get(variantId)!;
    result.offers++;

    if (accepted) {
      result.acceptances++;
      result.revenue += price;
    }
  }

  /**
   * Analyze experiment results
   */
  analyzeExperiment(experimentName: string): ExperimentAnalysis {
    const experiment = this.experiments.get(experimentName);
    if (!experiment) {
      throw new Error(`Experiment ${experimentName} not found`);
    }

    const variantResults: VariantResult[] = [];

    for (const [variantId, result] of experiment.results) {
      const acceptanceRate = result.acceptances / result.offers;
      const avgRevenue = result.revenue / result.acceptances;

      variantResults.push({
        variantId,
        offers: result.offers,
        acceptances: result.acceptances,
        acceptanceRate,
        totalRevenue: result.revenue,
        avgRevenue,
        revenuePerOffer: result.revenue / result.offers
      });
    }

    // Find winning variant (highest revenue per offer)
    const winner = variantResults.reduce((best, current) =>
      current.revenuePerOffer > best.revenuePerOffer ? current : best
    );

    return {
      experimentName,
      duration: experiment.endTime - experiment.startTime,
      variants: variantResults,
      winner: winner.variantId,
      recommendedAction: this.getRecommendation(variantResults, winner)
    };
  }

  private hashPubkey(pubkey: string): number {
    let hash = 0;
    for (let i = 0; i < pubkey.length; i++) {
      hash = ((hash << 5) - hash) + pubkey.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private getRecommendation(
    variants: VariantResult[],
    winner: VariantResult
  ): string {
    const improvementPct = ((winner.revenuePerOffer / variants[0].revenuePerOffer) - 1) * 100;

    if (improvementPct > 10) {
      return `Adopt ${winner.variantId} - ${improvementPct.toFixed(1)}% revenue improvement`;
    } else if (improvementPct > 0) {
      return `Continue testing - improvement marginal (${improvementPct.toFixed(1)}%)`;
    } else {
      return `Keep current pricing - no improvement found`;
    }
  }
}

interface PricingVariant {
  id: string;
  baseFeeDelta: number;      // Adjustment to BASE_RELAY_FEE
  kindMultiplierDelta: number; // Adjustment to kind multipliers
  description: string;
}

interface Experiment {
  name: string;
  variants: PricingVariant[];
  startTime: number;
  endTime: number;
  results: Map<string, ExperimentResult>;
}

interface ExperimentResult {
  offers: number;
  acceptances: number;
  revenue: number;
}

interface VariantResult {
  variantId: string;
  offers: number;
  acceptances: number;
  acceptanceRate: number;
  totalRevenue: number;
  avgRevenue: number;
  revenuePerOffer: number;
}

interface ExperimentAnalysis {
  experimentName: string;
  duration: number;
  variants: VariantResult[];
  winner: string;
  recommendedAction: string;
}
```

## Worked Examples

### Example 1: Short Note (Kind 1)

```
Event:
- Kind: 1
- Size: 500 bytes (0.0005 MB)
- User reputation: 75
- Queue depth: 50
- Peer average: 50 msats

Calculation:
1. Base price: 100 msats
2. Kind multiplier: 0.1 → 100 * 0.1 = 10 msats
3. Size fee: < 1 MB → 0 msats
4. Storage: Hot (DB) → 0.0005 * 50 = 0.025 msats
5. Congestion: 50 < 100 → 1.0x
6. Reputation: 75/100 = 0.75 → 0.75 * 0.5 = 37.5% discount
   Price: 10.025 * (1 - 0.375) = 6.27 msats
7. Competitive: Peer avg 50 msats * 0.95 = 47.5 msats
   min(6.27, 47.5) = 6.27 msats
8. Min margin: Direct cost ~0.1 msats * 1.1 = 0.11 msats
   max(6.27, 0.11) = 6.27 msats

Final Price: 6 msats (rounded)
```

### Example 2: Long-Form Article (Kind 30023)

```
Event:
- Kind: 30023
- Size: 5 MB
- User reputation: 20
- Queue depth: 150
- Peer average: 8000 msats
- Arweave price: 0.001 AR per MB = 2000 msats per MB

Calculation:
1. Base price: 100 msats
2. Kind multiplier: 2.0 → 100 * 2.0 = 200 msats
3. Size fee: (5 - 1) * 1000 = 4000 msats
4. Storage: Cold (Arweave) → 5 * 2000 * 1.5 = 15000 msats
5. Congestion: (150 - 100) * 0.01 = 0.5 → 1.5x multiplier
   Price: (200 + 4000 + 15000) * 1.5 = 28800 msats
6. Reputation: 20/100 = 0.2 → 0.2 * 0.5 = 10% discount
   Price: 28800 * 0.9 = 25920 msats
7. Competitive: Peer avg 8000 * 0.95 = 7600 msats
   min(25920, 7600) = 7600 msats
8. Min margin: Direct cost 15000 * 1.1 = 16500 msats
   max(7600, 16500) = 16500 msats

Final Price: 16500 msats (competitive price too low, use min margin)
```

### Example 3: High Reputation User, Low Congestion

```
Event:
- Kind: 1
- Size: 200 bytes
- User reputation: 100 (perfect score)
- Queue depth: 10
- Peer average: 100 msats

Calculation:
1. Base price: 100 msats
2. Kind multiplier: 0.1 → 10 msats
3. Size fee: 0 msats
4. Storage: Hot → ~0 msats
5. Congestion: 1.0x
6. Reputation: 100/100 → 50% discount
   Price: 10 * 0.5 = 5 msats
7. Competitive: 100 * 0.95 = 95 msats
   min(5, 95) = 5 msats
8. Min margin: ~0.1 msats
   max(5, 0.1) = 5 msats

Final Price: 5 msats (loyal customer discount)
```

## Performance Metrics

### Key Metrics to Track

```typescript
interface PricingMetrics {
  // Revenue metrics
  totalRevenue: number;          // Total msats earned
  revenuePerEvent: number;       // Average revenue per event
  revenuePerKind: Map<number, number>; // Revenue by event kind

  // Volume metrics
  totalEvents: number;           // Total events accepted
  eventsPerKind: Map<number, number>; // Volume by kind
  rejectionRate: number;         // % of quotes declined

  // Competitive metrics
  pricingAdvantage: number;      // % cheaper than peers
  marketShare: number;           // % of network events

  // Efficiency metrics
  profitMargin: number;          // (Revenue - Costs) / Revenue
  costCoverage: number;          // Revenue / Costs ratio

  // User metrics
  repeatCustomers: number;       // Users with > 1 event
  avgUserReputation: number;     // Average reputation score
  newUsers: number;              // First-time users
}

class PricingAnalytics {
  /**
   * Calculate pricing performance metrics
   */
  calculateMetrics(period: TimePeriod): PricingMetrics {
    const events = this.getEventsInPeriod(period);
    const costs = this.getCostsInPeriod(period);

    const totalRevenue = events.reduce((sum, e) => sum + e.price, 0);
    const totalCosts = costs.reduce((sum, c) => sum + c.amount, 0);

    const revenuePerKind = new Map<number, number>();
    const eventsPerKind = new Map<number, number>();

    for (const event of events) {
      const kindRevenue = revenuePerKind.get(event.kind) ?? 0;
      revenuePerKind.set(event.kind, kindRevenue + event.price);

      const kindCount = eventsPerKind.get(event.kind) ?? 0;
      eventsPerKind.set(event.kind, kindCount + 1);
    }

    const quotes = this.getQuotesInPeriod(period);
    const rejectionRate = (quotes.length - events.length) / quotes.length;

    return {
      totalRevenue,
      revenuePerEvent: totalRevenue / events.length,
      revenuePerKind,
      totalEvents: events.length,
      eventsPerKind,
      rejectionRate,
      pricingAdvantage: this.calculatePricingAdvantage(events),
      marketShare: this.calculateMarketShare(events, period),
      profitMargin: (totalRevenue - totalCosts) / totalRevenue,
      costCoverage: totalRevenue / totalCosts,
      repeatCustomers: this.countRepeatCustomers(events),
      avgUserReputation: this.calculateAvgReputation(events),
      newUsers: this.countNewUsers(events)
    };
  }

  private getEventsInPeriod(period: TimePeriod): Event[] {
    // Implementation would query database
    return [];
  }

  private getCostsInPeriod(period: TimePeriod): Cost[] {
    // Implementation would query cost tracking
    return [];
  }

  private getQuotesInPeriod(period: TimePeriod): Quote[] {
    // Implementation would query quote history
    return [];
  }

  private calculatePricingAdvantage(events: Event[]): number {
    // Compare our prices to peer averages
    return 0; // Placeholder
  }

  private calculateMarketShare(events: Event[], period: TimePeriod): number {
    // Calculate our events / total network events
    return 0; // Placeholder
  }

  private countRepeatCustomers(events: Event[]): number {
    const userCounts = new Map<string, number>();

    for (const event of events) {
      const count = userCounts.get(event.pubkey) ?? 0;
      userCounts.set(event.pubkey, count + 1);
    }

    return Array.from(userCounts.values()).filter(count => count > 1).length;
  }

  private calculateAvgReputation(events: Event[]): number {
    const reputations = events.map(e => e.userReputation);
    return reputations.reduce((a, b) => a + b, 0) / reputations.length;
  }

  private countNewUsers(events: Event[]): number {
    // Count users with their first event in this period
    return 0; // Placeholder
  }
}
```

## Parameter Tuning Guidelines

### Initial Configuration

Start with conservative values:

```typescript
const INITIAL_CONFIG = {
  BASE_RELAY_FEE: 100,           // 100 msats = 0.1 sats
  SIZE_PRICE_PER_MB: 1000,       // 1 sat per MB
  MIN_MARGIN: 0.2,               // 20% minimum margin
  MATCH_PERCENTAGE: 0.95,        // Price at 95% of peers
  MAX_REPUTATION_DISCOUNT: 0.3   // 30% max discount
};
```

### Adjustment Strategy

```
Week 1: Monitor baseline metrics
- Track: revenue, volume, rejection rate, market share

Week 2-3: Test pricing variants
- A/B test: ±20% BASE_RELAY_FEE
- Measure: revenue per offer, acceptance rate

Week 4: Adjust based on results
- If rejection rate > 30%: Decrease prices 10%
- If profit margin < 10%: Increase prices 10%
- If market share < 5%: Decrease prices 15%

Monthly: Competitive analysis
- Compare to top 5 peers
- Adjust MATCH_PERCENTAGE if needed
- Review kind multipliers

Quarterly: Strategic review
- Evaluate reputation discount impact
- Assess congestion pricing effectiveness
- Optimize storage tier pricing
```

### Optimization Targets

```typescript
interface OptimizationTargets {
  // Financial targets
  minProfitMargin: 0.15,         // 15% minimum
  targetProfitMargin: 0.30,      // 30% target

  // Volume targets
  minRejectionRate: 0.10,        // 10% minimum (too low = leaving money on table)
  maxRejectionRate: 0.40,        // 40% maximum (too high = prices too high)

  // Market targets
  minMarketShare: 0.05,          // 5% of network
  targetMarketShare: 0.15,       // 15% target

  // Competitive targets
  pricingAdvantage: 0.90,        // 10% cheaper than average peer
  peerMatchRate: 0.80            // Match 80% of peer prices
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('PricingEngine', () => {
  it('should calculate base price correctly', () => {
    const engine = new PricingEngine(PRICING_WEIGHTS, mockPeerMonitor, mockOracle);
    const event = createMockEvent({ kind: 1, size: 500 });

    const quote = await engine.calculatePrice(event, 'test_pubkey');

    expect(quote.breakdown.baseFee).toBe(100 * 0.1); // kind 1 multiplier
  });

  it('should apply reputation discount', () => {
    const engine = new PricingEngine(PRICING_WEIGHTS, mockPeerMonitor, mockOracle);
    const event = createMockEvent({ kind: 1 });

    // Mock user with 100 reputation
    const quote = await engine.calculatePrice(event, 'high_rep_user');

    expect(quote.breakdown.reputationDiscount).toBe(0.5); // 50% discount
  });

  it('should enforce minimum margin', () => {
    const engine = new PricingEngine(PRICING_WEIGHTS, mockPeerMonitor, mockOracle);
    const event = createMockEvent({ kind: 30023, size: 10 * 1024 * 1024 });

    const quote = await engine.calculatePrice(event, 'test_pubkey');

    // Price should cover costs + 10% margin
    expect(quote.amount).toBeGreaterThanOrEqual(quote.breakdown.storageCost * 1.1);
  });

  it('should match competitive pricing', async () => {
    const mockPeerMonitor = {
      getPricesForEvent: async () => [1000, 1200, 1100] // Avg: 1100
    };

    const engine = new PricingEngine(PRICING_WEIGHTS, mockPeerMonitor, mockOracle);
    const event = createMockEvent({ kind: 1 });

    const quote = await engine.calculatePrice(event, 'test_pubkey');

    // Should price at 95% of peer average (1045)
    expect(quote.amount).toBeLessThanOrEqual(1045);
  });
});
```

### Integration Tests

```typescript
describe('Pricing Integration', () => {
  it('should handle full pricing flow', async () => {
    // Setup
    const relay = await createTestRelay();
    const client = createTestClient();

    // Create event
    const event = await client.createEvent({
      kind: 1,
      content: 'Test note'
    });

    // Request quote
    const quote = await client.requestQuote(event);

    expect(quote.amount).toBeGreaterThan(0);
    expect(quote.breakdown).toBeDefined();

    // Pay and publish
    await client.payInvoice(quote);
    const result = await client.publishEvent(event);

    expect(result.success).toBe(true);
  });

  it('should reject insufficient payment', async () => {
    const relay = await createTestRelay();
    const client = createTestClient();

    const event = await client.createEvent({ kind: 1, content: 'Test' });
    const quote = await client.requestQuote(event);

    // Pay less than quoted
    await client.payInvoice({ ...quote, amount: quote.amount - 10 });

    const result = await client.publishEvent(event);

    expect(result.success).toBe(false);
    expect(result.error).toContain('insufficient payment');
  });
});
```

### Load Tests

```typescript
describe('Pricing Performance', () => {
  it('should handle 1000 price calculations/sec', async () => {
    const engine = new PricingEngine(PRICING_WEIGHTS, mockPeerMonitor, mockOracle);

    const startTime = Date.now();
    const promises = [];

    for (let i = 0; i < 1000; i++) {
      const event = createMockEvent({ kind: 1 });
      promises.push(engine.calculatePrice(event, `user_${i}`));
    }

    await Promise.all(promises);

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(1000); // < 1 second
  });
});
```

## Conclusion

This pricing algorithm provides:

1. **Dynamic pricing** that responds to network conditions
2. **Competitive pricing** that matches or beats peers
3. **User incentives** through reputation discounts
4. **Profitability** via minimum margin enforcement
5. **Flexibility** through A/B testing framework
6. **Observability** through comprehensive metrics

The algorithm balances multiple objectives:
- Revenue maximization
- Market share growth
- User satisfaction
- Cost coverage
- Competitive positioning

Implementation can start with simple rule-based pricing and evolve toward more sophisticated ML-based optimization as data accumulates.

---

**Next Steps:**
1. Implement PricingEngine class
2. Set up PeerPriceMonitor
3. Create PricingExperiment framework
4. Deploy with conservative initial parameters
5. Monitor metrics and iterate
