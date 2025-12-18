/**
 * Configuration and metrics types for N-peer test framework
 */

export interface TestNetworkConfig {
  /** Number of nodes to create in the test network */
  nodeCount: number;

  /** Enable peer discovery layer (default: true) */
  enablePeerDiscovery?: boolean;

  /** Network topology: mesh (all-to-all), star (hub-and-spoke), ring (circular) */
  networkTopology?: 'mesh' | 'star' | 'ring';

  /** Network simulation parameters */
  networkSimulation?: NetworkSimulationConfig;

  /** Fault injection configuration */
  faultInjection?: FaultConfig;

  /** Execution mode: in-process (mocks) or docker (real Dassie nodes) */
  executionMode?: 'in-process' | 'docker';

  /** Path to docker-compose.yml file (required if executionMode === 'docker') */
  dockerCompose?: string;

  /** Use real Dassie nodes instead of mocks (default: true if executionMode === 'docker') */
  dassieNodes?: boolean;
}

export interface NetworkSimulationConfig {
  /** Simulated network latency in milliseconds */
  latency?: number;

  /** Network jitter (variance) in milliseconds */
  jitter?: number;

  /** Packet loss rate (0.0 to 1.0) */
  packetLoss?: number;
}

export interface FaultConfig {
  /** Probability of node failure (0.0 to 1.0) */
  nodeFailureProbability?: number;

  /** Probability of network partition (0.0 to 1.0) */
  partitionProbability?: number;

  /** Mean time to failure in milliseconds */
  meanTimeToFailure?: number;

  /** Mean time to recovery in milliseconds */
  meanTimeToRecovery?: number;
}

export interface PerformanceMetrics {
  /** Latency breakdown */
  latency: LatencyBreakdown;

  /** Throughput metrics */
  throughput: ThroughputMetrics;

  /** Resource usage */
  resources: ResourceMetrics;
}

export interface LatencyBreakdown {
  /** Total end-to-end latency in milliseconds */
  total: number;

  /** Serialization time in milliseconds */
  serialization: number;

  /** Network transmission time in milliseconds */
  network: number;

  /** Deserialization time in milliseconds */
  deserialization: number;

  /** Cryptographic verification time in milliseconds */
  crypto: number;

  /** Database storage time in milliseconds */
  database: number;

  /** Subscription matching time in milliseconds */
  subscription: number;
}

export interface ThroughputMetrics {
  /** Events per second */
  eventsPerSec: number;

  /** Bytes per second */
  bytesPerSec: number;
}

export interface ResourceMetrics {
  /** Memory usage in MB */
  memoryMB: number;

  /** CPU usage percentage */
  cpuPercent: number;

  /** Active connection count */
  connections: number;

  /** Timestamp of measurement */
  timestamp?: number;

  /** Node ID this metric belongs to */
  nodeId?: string;
}

export interface ResourceLeakReport {
  /** Amount of leaked memory in MB */
  leakedMemoryMB: number;

  /** Number of unclosed containers */
  unclosedContainers: number;

  /** Number of unclosed connections */
  unclosedConnections: number;

  /** Whether leaks were detected */
  hasLeaks: boolean;
}

export interface NetworkStats {
  /** Total events propagated across network */
  totalEvents: number;

  /** Total messages sent across network */
  totalMessages: number;

  /** Total bytes transferred */
  totalBytes: number;

  /** Average latency across all nodes (ms) */
  avgLatency: number;

  /** Peak latency (ms) */
  peakLatency: number;

  /** Average throughput (events/sec) */
  avgThroughput: number;

  /** Per-node statistics */
  perNodeStats: Map<string, NodeStats>;
}

export interface NodeStats {
  /** Node ID */
  nodeId: string;

  /** Events published by this node */
  eventsPublished: number;

  /** Events received by this node */
  eventsReceived: number;

  /** Messages sent */
  messagesSent: number;

  /** Messages received */
  messagesReceived: number;

  /** Current peer count */
  peerCount: number;

  /** Performance metrics */
  metrics: PerformanceMetrics;
}

// Docker-specific types (Story 11.4)

/** Peer information from Dassie node */
export interface PeerInfo {
  /** Peer's ILP address */
  ilpAddress: string;

  /** Peer connection status */
  status: 'pending' | 'established' | 'active' | 'disconnected';

  /** Last heartbeat timestamp */
  lastHeartbeat?: number;

  /** Connection established timestamp */
  connectedAt?: number;
}

/** ILP payment options */
export interface PaymentOpts {
  /** Destination ILP address */
  destination: string;

  /** Amount in base units (e.g., msats) */
  amount: string | number;

  /** Currency/asset code */
  currency?: string;

  /** Payment timeout in milliseconds */
  timeout?: number;
}

/** ILP payment result */
export interface Payment {
  /** Payment ID */
  id: string;

  /** Payment status */
  status: 'pending' | 'fulfilled' | 'failed';

  /** Number of hops (for multi-hop payments) */
  hops?: number;

  /** Final amount delivered */
  amountDelivered?: string;

  /** Error message if failed */
  error?: string;

  /** Wait for payment fulfillment */
  waitForFulfillment(timeout: number): Promise<void>;
}

/** Dassie internal ledger state */
export interface LedgerState {
  /** Current balance in base units */
  balance: number;

  /** Pending balance (in-flight payments) */
  pendingBalance?: number;

  /** Total revenue earned from routing */
  routingRevenue?: number;

  /** Total fees paid */
  feesPaid?: number;

  /** Account entries */
  accounts?: Array<{
    path: string;
    debit: number;
    credit: number;
  }>;
}
