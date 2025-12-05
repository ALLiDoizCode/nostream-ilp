# Autonomous Relay Peering Selection Algorithm

## Overview

The peering selection algorithm determines which other relays to connect with for ILP routing and content sharing. Effective peering maximizes routing value, content availability, and censorship resistance while minimizing costs and risks.

## Design Principles

1. **Value-Based Selection**: Peer with relays that provide routing value and content overlap
2. **Reputation-Aware**: Trust established peers, verify new ones
3. **Diversity**: Maintain geographic, operator, and content diversity
4. **Dynamic**: Continuously evaluate and rotate peers
5. **Resilient**: Avoid concentration risk and Sybil attacks

## Peer Discovery

### Discovery Sources

```typescript
interface PeerDiscoverySource {
  type: 'bnl' | 'knl' | 'nostr' | 'dns' | 'gossip';
  priority: number;
  trustLevel: number;
}

const DISCOVERY_SOURCES: PeerDiscoverySource[] = [
  { type: 'bnl', priority: 1, trustLevel: 1.0 },    // Bootstrap Node List (hardcoded)
  { type: 'knl', priority: 2, trustLevel: 0.8 },    // Known Node List (from BNL)
  { type: 'nostr', priority: 3, trustLevel: 0.6 },  // Nostr relay lists (NIP-10002)
  { type: 'dns', priority: 4, trustLevel: 0.5 },    // DNS seed nodes
  { type: 'gossip', priority: 5, trustLevel: 0.3 }  // Peer gossip
];
```

### Discovery Implementation

```typescript
class PeerDiscovery {
  private discoveredPeers: Map<string, DiscoveredPeer> = new Map();

  constructor(
    private bnl: string[],
    private nostrClient: NostrClient,
    private dnsResolver: DNSResolver
  ) {}

  /**
   * Discover peers from all sources
   */
  async discoverPeers(): Promise<DiscoveredPeer[]> {
    const peers: DiscoveredPeer[] = [];

    // 1. Bootstrap Node List (highest priority)
    for (const url of this.bnl) {
      peers.push({
        url,
        source: 'bnl',
        trustLevel: 1.0,
        discoveredAt: Date.now()
      });
    }

    // 2. Known Node List from bootstrap nodes
    const knlPeers = await this.fetchKnownNodeLists(peers);
    peers.push(...knlPeers);

    // 3. Nostr relay lists
    const nostrPeers = await this.fetchNostrRelayLists();
    peers.push(...nostrPeers);

    // 4. DNS seeds
    const dnsPeers = await this.fetchDNSSeeds();
    peers.push(...dnsPeers);

    // 5. Deduplicate and store
    for (const peer of peers) {
      if (!this.discoveredPeers.has(peer.url)) {
        this.discoveredPeers.set(peer.url, peer);
      }
    }

    return Array.from(this.discoveredPeers.values());
  }

  /**
   * Fetch KNL from bootstrap nodes
   */
  private async fetchKnownNodeLists(
    bootstrapNodes: DiscoveredPeer[]
  ): Promise<DiscoveredPeer[]> {
    const peers: DiscoveredPeer[] = [];

    for (const node of bootstrapNodes) {
      try {
        const response = await fetch(`${node.url}/api/v1/peers/known`);
        const knl: KnownNodeList = await response.json();

        for (const peer of knl.nodes) {
          peers.push({
            url: peer.url,
            source: 'knl',
            trustLevel: 0.8,
            discoveredAt: Date.now(),
            referredBy: node.url
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch KNL from ${node.url}:`, error);
      }
    }

    return peers;
  }

  /**
   * Fetch relay lists from Nostr
   */
  private async fetchNostrRelayLists(): Promise<DiscoveredPeer[]> {
    const peers: DiscoveredPeer[] = [];

    // Query for kind 10002 (relay list metadata) events
    const events = await this.nostrClient.queryEvents({
      kinds: [10002],
      limit: 100
    });

    for (const event of events) {
      // Extract relay URLs from tags
      for (const tag of event.tags) {
        if (tag[0] === 'r') {
          const url = tag[1];
          const relayType = tag[2]; // read/write

          peers.push({
            url,
            source: 'nostr',
            trustLevel: 0.6,
            discoveredAt: Date.now(),
            metadata: {
              relayType,
              publishedBy: event.pubkey
            }
          });
        }
      }
    }

    return peers;
  }

  /**
   * Fetch DNS seeds
   */
  private async fetchDNSSeeds(): Promise<DiscoveredPeer[]> {
    const seeds = [
      'nostr-relay.seed.example.com',
      'ilp-relay.seed.example.com'
    ];

    const peers: DiscoveredPeer[] = [];

    for (const seed of seeds) {
      try {
        const addresses = await this.dnsResolver.resolve(seed);

        for (const addr of addresses) {
          peers.push({
            url: `https://${addr}`,
            source: 'dns',
            trustLevel: 0.5,
            discoveredAt: Date.now()
          });
        }
      } catch (error) {
        console.warn(`Failed to resolve DNS seed ${seed}:`, error);
      }
    }

    return peers;
  }
}

interface DiscoveredPeer {
  url: string;
  source: 'bnl' | 'knl' | 'nostr' | 'dns' | 'gossip';
  trustLevel: number;
  discoveredAt: number;
  referredBy?: string;
  metadata?: Record<string, any>;
}

interface KnownNodeList {
  nodes: Array<{
    url: string;
    publicKey: string;
    features: string[];
  }>;
  timestamp: number;
}
```

## Peer Evaluation

### Scoring Criteria

```typescript
interface PeerScore {
  // Core metrics (0-100 scale)
  reputation: number;        // Historical reliability
  routingValue: number;      // Payment routing capability
  contentOverlap: number;    // Relevant content availability
  connectivity: number;      // Network position
  reliability: number;       // Uptime and responsiveness

  // Weighted total score
  totalScore: number;

  // Detailed breakdown
  breakdown: ScoreBreakdown;
}

interface ScoreBreakdown {
  // Reputation factors
  successfulPayments: number;
  failedPayments: number;
  averageResponseTime: number;
  uptimePercentage: number;

  // Routing factors
  liquidityScore: number;
  routingSuccessRate: number;
  feeCompetitiveness: number;

  // Content factors
  sharedEventKinds: number[];
  contentFreshness: number;
  storageCapacity: number;

  // Network factors
  peerCount: number;
  networkCentrality: number;
  geographicDiversity: number;
}

const SCORING_WEIGHTS = {
  reputation: 0.30,      // 30% weight
  routingValue: 0.25,    // 25% weight
  contentOverlap: 0.20,  // 20% weight
  connectivity: 0.15,    // 15% weight
  reliability: 0.10      // 10% weight
};
```

### Evaluation Algorithm

```typescript
class PeerEvaluator {
  constructor(
    private reputationSystem: ReputationSystem,
    private contentAnalyzer: ContentAnalyzer,
    private networkAnalyzer: NetworkAnalyzer
  ) {}

  /**
   * Evaluate a peer and calculate score
   */
  async evaluatePeer(peer: DiscoveredPeer): Promise<PeerScore> {
    const [
      reputation,
      routingValue,
      contentOverlap,
      connectivity,
      reliability
    ] = await Promise.all([
      this.evaluateReputation(peer),
      this.evaluateRoutingValue(peer),
      this.evaluateContentOverlap(peer),
      this.evaluateConnectivity(peer),
      this.evaluateReliability(peer)
    ]);

    const totalScore =
      reputation * SCORING_WEIGHTS.reputation +
      routingValue * SCORING_WEIGHTS.routingValue +
      contentOverlap * SCORING_WEIGHTS.contentOverlap +
      connectivity * SCORING_WEIGHTS.connectivity +
      reliability * SCORING_WEIGHTS.reliability;

    return {
      reputation,
      routingValue,
      contentOverlap,
      connectivity,
      reliability,
      totalScore,
      breakdown: await this.getScoreBreakdown(peer)
    };
  }

  /**
   * Evaluate peer reputation (0-100)
   */
  private async evaluateReputation(peer: DiscoveredPeer): Promise<number> {
    const reputation = await this.reputationSystem.getReputation(peer.url);

    if (!reputation) {
      // New peer - use source trust level
      return peer.trustLevel * 50; // Max 50 for new peers
    }

    // Calculate based on historical performance
    const successRate = reputation.successfulPayments /
      (reputation.successfulPayments + reputation.failedPayments);

    const uptimeScore = reputation.uptimePercentage;
    const responseScore = Math.max(0, 100 - reputation.averageResponseTime / 10);

    return (successRate * 40) + (uptimeScore * 40) + (responseScore * 20);
  }

  /**
   * Evaluate routing value (0-100)
   */
  private async evaluateRoutingValue(peer: DiscoveredPeer): Promise<number> {
    try {
      // Query peer for routing capabilities
      const capabilities = await this.queryRoutingCapabilities(peer.url);

      if (!capabilities) {
        return 0;
      }

      // Liquidity score (0-40)
      const liquidityScore = Math.min(40, capabilities.totalLiquidity / 1000000);

      // Routing success rate (0-30)
      const routingScore = capabilities.routingSuccessRate * 30;

      // Fee competitiveness (0-30)
      const feeScore = Math.max(0, 30 - capabilities.averageFee / 10);

      return liquidityScore + routingScore + feeScore;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Evaluate content overlap (0-100)
   */
  private async evaluateContentOverlap(peer: DiscoveredPeer): Promise<number> {
    const myEventKinds = await this.contentAnalyzer.getPopularEventKinds();
    const peerEventKinds = await this.queryPeerEventKinds(peer.url);

    if (!peerEventKinds || peerEventKinds.length === 0) {
      return 0;
    }

    // Calculate Jaccard similarity
    const intersection = myEventKinds.filter(k => peerEventKinds.includes(k));
    const union = [...new Set([...myEventKinds, ...peerEventKinds])];

    const overlapScore = (intersection.length / union.length) * 60;

    // Bonus for high-value content kinds
    const hasHighValueContent = peerEventKinds.some(k =>
      [30023, 1063, 71].includes(k)
    );
    const highValueBonus = hasHighValueContent ? 20 : 0;

    // Content freshness (0-20)
    const freshnessScore = await this.evaluateContentFreshness(peer.url);

    return overlapScore + highValueBonus + freshnessScore;
  }

  /**
   * Evaluate network connectivity (0-100)
   */
  private async evaluateConnectivity(peer: DiscoveredPeer): Promise<number> {
    const networkStats = await this.networkAnalyzer.analyzeNode(peer.url);

    if (!networkStats) {
      return 0;
    }

    // Peer count score (0-40)
    const peerScore = Math.min(40, networkStats.peerCount * 2);

    // Network centrality (0-40)
    const centralityScore = networkStats.centralityScore * 40;

    // Geographic diversity (0-20)
    const diversityScore = networkStats.geographicDiversity * 20;

    return peerScore + centralityScore + diversityScore;
  }

  /**
   * Evaluate reliability (0-100)
   */
  private async evaluateReliability(peer: DiscoveredPeer): Promise<number> {
    const healthCheck = await this.performHealthCheck(peer.url);

    if (!healthCheck.online) {
      return 0;
    }

    // Response time score (0-50)
    const responseScore = Math.max(0, 50 - healthCheck.responseTime / 10);

    // Version compatibility (0-25)
    const versionScore = this.isVersionCompatible(healthCheck.version) ? 25 : 0;

    // Feature support (0-25)
    const featureScore = this.calculateFeatureScore(healthCheck.features);

    return responseScore + versionScore + featureScore;
  }

  private async queryRoutingCapabilities(url: string): Promise<any> {
    const response = await fetch(`${url}/api/v1/routing/capabilities`);
    return response.ok ? await response.json() : null;
  }

  private async queryPeerEventKinds(url: string): Promise<number[]> {
    const response = await fetch(`${url}/api/v1/stats/event-kinds`);
    return response.ok ? await response.json() : [];
  }

  private async evaluateContentFreshness(url: string): Promise<number> {
    const response = await fetch(`${url}/api/v1/stats/latest-event`);
    if (!response.ok) return 0;

    const { timestamp } = await response.json();
    const ageMinutes = (Date.now() - timestamp) / 60000;

    // Score decreases with age
    return Math.max(0, 20 - ageMinutes / 60);
  }

  private async performHealthCheck(url: string): Promise<HealthCheck> {
    const start = Date.now();

    try {
      const response = await fetch(`${url}/api/v1/health`, {
        timeout: 5000
      });

      const data = await response.json();

      return {
        online: true,
        responseTime: Date.now() - start,
        version: data.version,
        features: data.features
      };
    } catch (error) {
      return {
        online: false,
        responseTime: 5000,
        version: null,
        features: []
      };
    }
  }

  private isVersionCompatible(version: string | null): boolean {
    if (!version) return false;
    // Check version compatibility logic
    return true; // Placeholder
  }

  private calculateFeatureScore(features: string[]): number {
    const requiredFeatures = ['ilp', 'stream', 'arweave'];
    const supportedCount = requiredFeatures.filter(f =>
      features.includes(f)
    ).length;

    return (supportedCount / requiredFeatures.length) * 25;
  }

  private async getScoreBreakdown(peer: DiscoveredPeer): Promise<ScoreBreakdown> {
    // Implementation would gather detailed metrics
    return {} as ScoreBreakdown; // Placeholder
  }
}

interface HealthCheck {
  online: boolean;
  responseTime: number;
  version: string | null;
  features: string[];
}
```

## Active Peering Algorithm

### Selection Strategy

```typescript
class ActivePeeringSelector {
  private readonly MIN_PEERS = 5;
  private readonly MAX_PEERS = 20;
  private readonly TARGET_PEERS = 10;

  constructor(
    private evaluator: PeerEvaluator,
    private discovery: PeerDiscovery
  ) {}

  /**
   * Select peers to actively connect with
   */
  async selectPeers(): Promise<PeeringDecision[]> {
    // 1. Discover available peers
    const discovered = await this.discovery.discoverPeers();

    // 2. Evaluate all discovered peers
    const evaluated = await Promise.all(
      discovered.map(async peer => ({
        peer,
        score: await this.evaluator.evaluatePeer(peer)
      }))
    );

    // 3. Sort by total score
    evaluated.sort((a, b) => b.score.totalScore - a.score.totalScore);

    // 4. Apply diversity constraints
    const diversified = this.applyDiversityConstraints(evaluated);

    // 5. Select top N peers
    const selected = diversified.slice(0, this.TARGET_PEERS);

    // 6. Create peering decisions
    return selected.map(({ peer, score }) => ({
      peer: peer.url,
      action: 'connect',
      score: score.totalScore,
      reason: this.generateReason(score)
    }));
  }

  /**
   * Apply diversity constraints to prevent concentration
   */
  private applyDiversityConstraints(
    evaluated: Array<{ peer: DiscoveredPeer; score: PeerScore }>
  ): Array<{ peer: DiscoveredPeer; score: PeerScore }> {
    const selected: Array<{ peer: DiscoveredPeer; score: PeerScore }> = [];
    const operators = new Set<string>();
    const countries = new Set<string>();

    for (const item of evaluated) {
      // Extract operator and country from metadata
      const operator = this.extractOperator(item.peer);
      const country = this.extractCountry(item.peer);

      // Diversity constraints
      const operatorLimit = 3; // Max 3 peers from same operator
      const countryLimit = 5;  // Max 5 peers from same country

      const operatorCount = Array.from(operators).filter(o => o === operator).length;
      const countryCount = Array.from(countries).filter(c => c === country).length;

      if (operatorCount >= operatorLimit || countryCount >= countryLimit) {
        continue; // Skip this peer
      }

      selected.push(item);
      operators.add(operator);
      countries.add(country);

      if (selected.length >= this.TARGET_PEERS) {
        break;
      }
    }

    return selected;
  }

  private extractOperator(peer: DiscoveredPeer): string {
    // Extract operator from URL or metadata
    const domain = new URL(peer.url).hostname;
    return domain.split('.').slice(-2).join('.');
  }

  private extractCountry(peer: DiscoveredPeer): string {
    // Use GeoIP lookup or metadata
    return 'unknown'; // Placeholder
  }

  private generateReason(score: PeerScore): string {
    const reasons: string[] = [];

    if (score.reputation > 70) {
      reasons.push('high reputation');
    }

    if (score.routingValue > 70) {
      reasons.push('good routing capability');
    }

    if (score.contentOverlap > 60) {
      reasons.push('relevant content');
    }

    if (score.connectivity > 70) {
      reasons.push('well-connected');
    }

    return reasons.join(', ') || 'meets minimum requirements';
  }
}

interface PeeringDecision {
  peer: string;
  action: 'connect' | 'disconnect' | 'maintain';
  score: number;
  reason: string;
}
```

## Passive Peering Algorithm

### Accept/Reject Logic

```typescript
class PassivePeeringHandler {
  constructor(
    private evaluator: PeerEvaluator,
    private currentPeers: Set<string>,
    private maxPeers: number = 20
  ) {}

  /**
   * Decide whether to accept incoming peer request
   */
  async handlePeerRequest(peer: DiscoveredPeer): Promise<PeeringResponse> {
    // 1. Check capacity
    if (this.currentPeers.size >= this.maxPeers) {
      return {
        accept: false,
        reason: 'Maximum peer capacity reached'
      };
    }

    // 2. Evaluate peer
    const score = await this.evaluator.evaluatePeer(peer);

    // 3. Minimum score threshold
    const MIN_SCORE = 40; // 40/100 minimum

    if (score.totalScore < MIN_SCORE) {
      return {
        accept: false,
        reason: `Score too low: ${score.totalScore} < ${MIN_SCORE}`
      };
    }

    // 4. Reputation check
    if (score.reputation < 30) {
      return {
        accept: false,
        reason: 'Insufficient reputation'
      };
    }

    // 5. Check for existing better peers
    const worstCurrentScore = await this.getWorstCurrentPeerScore();

    if (score.totalScore < worstCurrentScore) {
      return {
        accept: false,
        reason: `Score ${score.totalScore} below worst current peer ${worstCurrentScore}`
      };
    }

    // 6. Anti-Sybil checks
    const sybilCheck = await this.performSybilCheck(peer);

    if (!sybilCheck.passed) {
      return {
        accept: false,
        reason: `Sybil check failed: ${sybilCheck.reason}`
      };
    }

    // 7. Accept with conditions
    return {
      accept: true,
      reason: `Accepted: score ${score.totalScore}`,
      conditions: {
        probationPeriod: 86400000, // 24 hours
        maxLiquidity: 1000000,     // Limited liquidity during probation
        monitoring: true
      }
    };
  }

  /**
   * Get score of worst current peer
   */
  private async getWorstCurrentPeerScore(): Promise<number> {
    if (this.currentPeers.size === 0) {
      return 0;
    }

    const scores = await Promise.all(
      Array.from(this.currentPeers).map(async url => {
        const peer: DiscoveredPeer = {
          url,
          source: 'bnl',
          trustLevel: 1.0,
          discoveredAt: Date.now()
        };

        const score = await this.evaluator.evaluatePeer(peer);
        return score.totalScore;
      })
    );

    return Math.min(...scores);
  }

  /**
   * Perform anti-Sybil checks
   */
  private async performSybilCheck(peer: DiscoveredPeer): Promise<SybilCheck> {
    const checks: SybilCheckResult[] = [];

    // 1. IP address check
    const ipCheck = await this.checkIPReputation(peer.url);
    checks.push(ipCheck);

    // 2. Proof-of-payment check (Dassie requirement)
    const popCheck = await this.checkProofOfPayment(peer.url);
    checks.push(popCheck);

    // 3. Domain age check
    const domainCheck = await this.checkDomainAge(peer.url);
    checks.push(domainCheck);

    // 4. SSL certificate check
    const sslCheck = await this.checkSSLCertificate(peer.url);
    checks.push(sslCheck);

    const failedChecks = checks.filter(c => !c.passed);

    return {
      passed: failedChecks.length === 0,
      reason: failedChecks.map(c => c.reason).join(', '),
      checks
    };
  }

  private async checkIPReputation(url: string): Promise<SybilCheckResult> {
    // Check IP against known bad actor lists
    return { passed: true, reason: '' }; // Placeholder
  }

  private async checkProofOfPayment(url: string): Promise<SybilCheckResult> {
    // Require small payment to prove legitimacy
    return { passed: true, reason: '' }; // Placeholder
  }

  private async checkDomainAge(url: string): Promise<SybilCheckResult> {
    // Check domain registration date
    return { passed: true, reason: '' }; // Placeholder
  }

  private async checkSSLCertificate(url: string): Promise<SybilCheckResult> {
    // Verify SSL certificate validity
    return { passed: true, reason: '' }; // Placeholder
  }
}

interface PeeringResponse {
  accept: boolean;
  reason: string;
  conditions?: {
    probationPeriod: number;
    maxLiquidity: number;
    monitoring: boolean;
  };
}

interface SybilCheck {
  passed: boolean;
  reason: string;
  checks: SybilCheckResult[];
}

interface SybilCheckResult {
  passed: boolean;
  reason: string;
}
```

## Peer Rotation Strategy

### Rotation Algorithm

```typescript
class PeerRotationManager {
  private readonly ROTATION_INTERVAL = 86400000; // 24 hours
  private readonly MIN_PEER_AGE = 3600000;       // 1 hour minimum

  constructor(
    private selector: ActivePeeringSelector,
    private evaluator: PeerEvaluator,
    private currentPeers: Map<string, PeerConnection>
  ) {
    this.startRotationSchedule();
  }

  /**
   * Evaluate whether to rotate peers
   */
  async evaluateRotation(): Promise<RotationDecision[]> {
    const decisions: RotationDecision[] = [];

    // 1. Evaluate all current peers
    const evaluated = await Promise.all(
      Array.from(this.currentPeers.entries()).map(async ([url, conn]) => ({
        url,
        connection: conn,
        score: await this.evaluator.evaluatePeer({
          url,
          source: 'bnl',
          trustLevel: 1.0,
          discoveredAt: conn.connectedAt
        })
      }))
    );

    // 2. Identify underperforming peers
    const underperforming = evaluated.filter(e => e.score.totalScore < 40);

    for (const peer of underperforming) {
      // Don't drop too quickly
      const age = Date.now() - peer.connection.connectedAt;

      if (age < this.MIN_PEER_AGE) {
        continue;
      }

      decisions.push({
        action: 'drop',
        peer: peer.url,
        reason: `Low score: ${peer.score.totalScore}`,
        score: peer.score.totalScore
      });
    }

    // 3. Identify better alternatives
    const potentialPeers = await this.selector.selectPeers();

    for (const potential of potentialPeers) {
      // Check if we already have this peer
      if (this.currentPeers.has(potential.peer)) {
        continue;
      }

      // Find worst current peer
      const worst = evaluated.reduce((w, e) =>
        e.score.totalScore < w.score.totalScore ? e : w
      );

      // Replace if new peer is significantly better
      if (potential.score > worst.score.totalScore * 1.2) { // 20% better
        decisions.push({
          action: 'replace',
          peer: worst.url,
          replacement: potential.peer,
          reason: `Replace ${worst.url} (${worst.score.totalScore}) with ${potential.peer} (${potential.score})`,
          score: potential.score
        });
      }
    }

    return decisions;
  }

  /**
   * Execute rotation decisions
   */
  async executeRotation(decisions: RotationDecision[]): Promise<void> {
    for (const decision of decisions) {
      switch (decision.action) {
        case 'drop':
          await this.dropPeer(decision.peer);
          break;

        case 'replace':
          await this.dropPeer(decision.peer);
          if (decision.replacement) {
            await this.addPeer(decision.replacement);
          }
          break;

        case 'add':
          if (decision.replacement) {
            await this.addPeer(decision.replacement);
          }
          break;
      }
    }
  }

  /**
   * Drop peer connection
   */
  private async dropPeer(url: string): Promise<void> {
    const connection = this.currentPeers.get(url);

    if (!connection) {
      return;
    }

    // Close connection gracefully
    await connection.close();

    this.currentPeers.delete(url);

    console.log(`Dropped peer: ${url}`);
  }

  /**
   * Add new peer connection
   */
  private async addPeer(url: string): Promise<void> {
    try {
      const connection = await this.establishConnection(url);
      this.currentPeers.set(url, connection);

      console.log(`Added peer: ${url}`);
    } catch (error) {
      console.error(`Failed to add peer ${url}:`, error);
    }
  }

  private async establishConnection(url: string): Promise<PeerConnection> {
    // Implementation would establish ILP peering
    return {} as PeerConnection; // Placeholder
  }

  private startRotationSchedule(): void {
    setInterval(async () => {
      const decisions = await this.evaluateRotation();
      await this.executeRotation(decisions);
    }, this.ROTATION_INTERVAL);
  }
}

interface PeerConnection {
  url: string;
  connectedAt: number;
  close: () => Promise<void>;
}

interface RotationDecision {
  action: 'drop' | 'replace' | 'add';
  peer: string;
  replacement?: string;
  reason: string;
  score: number;
}
```

## Content Overlap Calculation

### Algorithm

```typescript
class ContentAnalyzer {
  constructor(private eventRepository: EventRepository) {}

  /**
   * Get popular event kinds on this relay
   */
  async getPopularEventKinds(limit: number = 10): Promise<number[]> {
    const kindCounts = await this.eventRepository.getEventKindCounts();

    return kindCounts
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(k => k.kind);
  }

  /**
   * Calculate content overlap with peer
   */
  async calculateOverlap(peerUrl: string): Promise<ContentOverlap> {
    const myKinds = await this.getPopularEventKinds(20);
    const peerKinds = await this.fetchPeerEventKinds(peerUrl);

    const intersection = myKinds.filter(k => peerKinds.includes(k));
    const union = [...new Set([...myKinds, ...peerKinds])];

    const jaccardSimilarity = intersection.length / union.length;

    // Calculate weighted overlap (high-value kinds count more)
    const weights = new Map<number, number>([
      [1, 1.0],      // Basic notes
      [30023, 3.0],  // Long-form (high value)
      [1063, 2.5],   // Files
      [71, 2.0]      // Video
    ]);

    const weightedIntersection = intersection.reduce((sum, kind) =>
      sum + (weights.get(kind) ?? 1.0), 0
    );

    const weightedUnion = union.reduce((sum, kind) =>
      sum + (weights.get(kind) ?? 1.0), 0
    );

    const weightedSimilarity = weightedIntersection / weightedUnion;

    return {
      jaccardSimilarity,
      weightedSimilarity,
      sharedKinds: intersection,
      uniqueKinds: myKinds.filter(k => !peerKinds.includes(k)),
      peerUniqueKinds: peerKinds.filter(k => !myKinds.includes(k))
    };
  }

  private async fetchPeerEventKinds(peerUrl: string): Promise<number[]> {
    const response = await fetch(`${peerUrl}/api/v1/stats/event-kinds`);
    return response.ok ? await response.json() : [];
  }
}

interface ContentOverlap {
  jaccardSimilarity: number;
  weightedSimilarity: number;
  sharedKinds: number[];
  uniqueKinds: number[];
  peerUniqueKinds: number[];
}
```

## Routing Value Estimation

### Algorithm

```typescript
class RoutingValueEstimator {
  /**
   * Estimate routing value of peer
   */
  async estimateValue(peerUrl: string): Promise<RoutingValue> {
    const capabilities = await this.queryCapabilities(peerUrl);

    if (!capabilities) {
      return {
        totalValue: 0,
        breakdown: {
          liquidityValue: 0,
          connectivityValue: 0,
          reliabilityValue: 0,
          feeValue: 0
        }
      };
    }

    // 1. Liquidity value (0-40)
    const liquidityValue = Math.min(40, capabilities.totalLiquidity / 1000000);

    // 2. Connectivity value (0-30)
    const connectivityValue = Math.min(30, capabilities.peerCount * 1.5);

    // 3. Reliability value (0-20)
    const reliabilityValue = capabilities.routingSuccessRate * 20;

    // 4. Fee competitiveness value (0-10)
    const avgFee = capabilities.averageFee;
    const feeValue = Math.max(0, 10 - avgFee / 100);

    const totalValue = liquidityValue + connectivityValue +
                       reliabilityValue + feeValue;

    return {
      totalValue,
      breakdown: {
        liquidityValue,
        connectivityValue,
        reliabilityValue,
        feeValue
      }
    };
  }

  private async queryCapabilities(peerUrl: string): Promise<any> {
    const response = await fetch(`${peerUrl}/api/v1/routing/capabilities`);
    return response.ok ? await response.json() : null;
  }
}

interface RoutingValue {
  totalValue: number;
  breakdown: {
    liquidityValue: number;
    connectivityValue: number;
    reliabilityValue: number;
    feeValue: number;
  };
}
```

## Code Examples

### Complete Integration

```typescript
// Initialize components
const discovery = new PeerDiscovery(
  BOOTSTRAP_NODE_LIST,
  nostrClient,
  dnsResolver
);

const reputationSystem = new ReputationSystem();
const contentAnalyzer = new ContentAnalyzer(eventRepository);
const networkAnalyzer = new NetworkAnalyzer();

const evaluator = new PeerEvaluator(
  reputationSystem,
  contentAnalyzer,
  networkAnalyzer
);

const activeSelector = new ActivePeeringSelector(evaluator, discovery);
const passiveHandler = new PassivePeeringHandler(evaluator, currentPeers, 20);

// Active peering
const peeringDecisions = await activeSelector.selectPeers();

for (const decision of peeringDecisions) {
  console.log(`Peering decision: ${decision.action} ${decision.peer}`);
  console.log(`  Score: ${decision.score}`);
  console.log(`  Reason: ${decision.reason}`);
}

// Passive peering (handle incoming request)
const incomingPeer: DiscoveredPeer = {
  url: 'https://new-relay.example.com',
  source: 'gossip',
  trustLevel: 0.3,
  discoveredAt: Date.now()
};

const response = await passiveHandler.handlePeerRequest(incomingPeer);

if (response.accept) {
  console.log(`Accepted peer: ${incomingPeer.url}`);
  console.log(`  Conditions:`, response.conditions);
} else {
  console.log(`Rejected peer: ${incomingPeer.url}`);
  console.log(`  Reason: ${response.reason}`);
}

// Peer rotation
const rotationManager = new PeerRotationManager(
  activeSelector,
  evaluator,
  currentPeers
);

const rotationDecisions = await rotationManager.evaluateRotation();

for (const decision of rotationDecisions) {
  console.log(`Rotation: ${decision.action} ${decision.peer}`);
  console.log(`  Reason: ${decision.reason}`);
}
```

## Decision Tree (ASCII)

```
Peering Decision Flow
=====================

[Peer Discovery]
    |
    +-- BNL (Bootstrap Node List) ──> Trust Level: 1.0
    +-- KNL (Known Node List) ──────> Trust Level: 0.8
    +-- Nostr Relay Lists ──────────> Trust Level: 0.6
    +-- DNS Seeds ──────────────────> Trust Level: 0.5
    +-- Gossip ─────────────────────> Trust Level: 0.3
    |
    v
[Peer Evaluation]
    |
    +-- Reputation Score (30%)
    |   +-- Historical Success Rate
    |   +-- Uptime Percentage
    |   +-- Response Time
    |
    +-- Routing Value (25%)
    |   +-- Liquidity Score
    |   +-- Routing Success Rate
    |   +-- Fee Competitiveness
    |
    +-- Content Overlap (20%)
    |   +-- Jaccard Similarity
    |   +-- High-Value Content
    |   +-- Content Freshness
    |
    +-- Connectivity (15%)
    |   +-- Peer Count
    |   +-- Network Centrality
    |   +-- Geographic Diversity
    |
    +-- Reliability (10%)
    |   +-- Health Check
    |   +-- Version Compatibility
    |   +-- Feature Support
    |
    v
[Total Score Calculation]
    |
    +-- Score >= 70 ──> Excellent Peer ──> Priority Connect
    +-- Score 40-69 ──> Good Peer ──────> Standard Connect
    +-- Score < 40 ──> Poor Peer ──────> Reject/Probation
    |
    v
[Active Peering]
    |
    +-- Sort by Score
    +-- Apply Diversity Constraints
    |   +-- Max 3 peers/operator
    |   +-- Max 5 peers/country
    +-- Select Top 10
    |
    v
[Passive Peering]
    |
    +-- Check Capacity
    |   +-- At Max? ──> Reject
    |   +-- Below Max? ──> Continue
    |
    +-- Check Minimum Score (40)
    |   +-- Below? ──> Reject
    |   +-- Above? ──> Continue
    |
    +-- Anti-Sybil Checks
    |   +-- IP Reputation
    |   +-- Proof-of-Payment
    |   +-- Domain Age
    |   +-- SSL Certificate
    |   +-- All Pass? ──> Accept with Probation
    |   +-- Any Fail? ──> Reject
    |
    v
[Peer Rotation] (Daily)
    |
    +-- Evaluate Current Peers
    |   +-- Score < 40? ──> Drop Peer
    |   +-- Score >= 40? ──> Keep Peer
    |
    +-- Discover New Peers
    |   +-- New Score > Current * 1.2? ──> Replace
    |   +-- New Score < Current * 1.2? ──> Keep Current
    |
    v
[Peering Decision]
    |
    +-- Connect
    +-- Disconnect
    +-- Maintain
    +-- Replace
```

## Performance Metrics

Track the following metrics:

```typescript
interface PeeringMetrics {
  // Current state
  activePeers: number;
  avgPeerScore: number;
  totalRoutingCapacity: number;

  // Discovery metrics
  peersDiscovered: number;
  peersEvaluated: number;
  evaluationTime: number;

  // Selection metrics
  peersAccepted: number;
  peersRejected: number;
  acceptanceRate: number;

  // Rotation metrics
  peersDropped: number;
  peersAdded: number;
  rotationFrequency: number;

  // Quality metrics
  avgUptime: number;
  avgResponseTime: number;
  routingSuccessRate: number;

  // Diversity metrics
  uniqueOperators: number;
  uniqueCountries: number;
  contentDiversity: number;
}
```

## Testing Strategy

```typescript
describe('Peering Selection', () => {
  it('should discover peers from all sources', async () => {
    const discovery = new PeerDiscovery(BNL, nostrClient, dnsResolver);
    const peers = await discovery.discoverPeers();

    expect(peers.length).toBeGreaterThan(0);
    expect(peers.some(p => p.source === 'bnl')).toBe(true);
  });

  it('should evaluate peer score correctly', async () => {
    const evaluator = new PeerEvaluator(
      reputationSystem,
      contentAnalyzer,
      networkAnalyzer
    );

    const peer: DiscoveredPeer = {
      url: 'https://test.example.com',
      source: 'bnl',
      trustLevel: 1.0,
      discoveredAt: Date.now()
    };

    const score = await evaluator.evaluatePeer(peer);

    expect(score.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.totalScore).toBeLessThanOrEqual(100);
  });

  it('should select diverse peers', async () => {
    const selector = new ActivePeeringSelector(evaluator, discovery);
    const decisions = await selector.selectPeers();

    // Check operator diversity
    const operators = decisions.map(d => extractOperator(d.peer));
    const uniqueOperators = new Set(operators);

    expect(uniqueOperators.size).toBeGreaterThan(decisions.length * 0.5);
  });

  it('should reject low-score peers', async () => {
    const handler = new PassivePeeringHandler(evaluator, currentPeers, 20);

    const lowScorePeer: DiscoveredPeer = {
      url: 'https://bad.example.com',
      source: 'gossip',
      trustLevel: 0.1,
      discoveredAt: Date.now()
    };

    const response = await handler.handlePeerRequest(lowScorePeer);

    expect(response.accept).toBe(false);
  });

  it('should rotate underperforming peers', async () => {
    const rotationManager = new PeerRotationManager(
      selector,
      evaluator,
      currentPeers
    );

    const decisions = await rotationManager.evaluateRotation();

    // Should identify peers to drop/replace
    expect(decisions.some(d => d.action === 'drop' || d.action === 'replace'))
      .toBe(true);
  });
});
```

## Conclusion

This peering selection algorithm provides:

1. **Multi-source discovery**: BNL, KNL, Nostr, DNS, gossip
2. **Comprehensive evaluation**: Reputation, routing, content, connectivity, reliability
3. **Diversity enforcement**: Operator, geographic, content diversity
4. **Anti-Sybil protection**: Multiple verification checks
5. **Dynamic optimization**: Continuous rotation and improvement

The algorithm balances multiple objectives:
- Network value (routing, content)
- Reliability (uptime, performance)
- Diversity (censorship resistance)
- Security (Sybil resistance)

Implementation integrates with Dassie's peer-to-peer model and provides autonomous peering decisions without human intervention.
