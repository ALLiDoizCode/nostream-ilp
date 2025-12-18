/**
 * N-Peer Test Framework
 * Core utilities for creating and managing multi-node test networks
 */

import { randomBytes } from 'crypto'
import { schnorr } from '@noble/secp256k1'
import { execSync } from 'child_process'
import type { TestNode } from './test-node'
import type { TestNetworkConfig, PeerInfo, PaymentOpts } from './config'
import {
  createMockStreamConnection,
  createRealDassieConnection,
  initializeMetrics,
  type StreamConnection,
  type NostrEvent,
  type NostrFilter,
} from './test-node'
import { MockEventRepository } from './mock-event-repository'
import { MockEventCache } from './mock-event-cache'
import { SubscriptionManager } from '../../../src/btp-nips/subscription-manager'
import { verifyNetworkConditions } from './network-verification'

/**
 * Create an N-node test network with full BTP-NIPs stack
 *
 * @param nodeCount - Number of nodes to create
 * @param config - Network configuration options
 * @returns Array of initialized test nodes
 */
export async function createTestNetwork(
  nodeCount: number,
  config?: Partial<TestNetworkConfig>
): Promise<TestNode[]> {
  const fullConfig: TestNetworkConfig = {
    nodeCount,
    enablePeerDiscovery: config?.enablePeerDiscovery ?? true,
    networkTopology: config?.networkTopology ?? 'mesh',
    networkSimulation: {
      latency: config?.networkSimulation?.latency ?? 0,
      jitter: config?.networkSimulation?.jitter ?? 0,
      packetLoss: config?.networkSimulation?.packetLoss ?? 0,
    },
    faultInjection: config?.faultInjection,
    executionMode: config?.executionMode ?? 'in-process',
    dockerCompose: config?.dockerCompose,
    dassieNodes: config?.dassieNodes ?? (config?.executionMode === 'docker'),
  }

  // Docker mode: Start Docker Compose stack first
  if (fullConfig.executionMode === 'docker') {
    if (!fullConfig.dockerCompose) {
      throw new Error('dockerCompose path required for Docker execution mode')
    }
    await startDockerStack(fullConfig.dockerCompose, nodeCount, fullConfig.networkSimulation)
  }

  // Create nodes in parallel for performance
  const nodePromises = Array.from({ length: nodeCount }, (_, i) =>
    createNode(i, fullConfig)
  )

  const nodes = await Promise.all(nodePromises)

  return nodes
}

/**
 * Start Docker Compose stack and wait for containers to be healthy
 */
async function startDockerStack(
  dockerComposePath: string,
  nodeCount: number,
  networkSimulation?: { latency?: number; jitter?: number; packetLoss?: number }
): Promise<void> {
  console.log(`Starting Docker stack: ${dockerComposePath}`)

  // Build environment variables for network simulation
  const envVars = buildNetworkSimulationEnv(networkSimulation)

  // Start Docker Compose with environment
  execSync(`docker-compose -f ${dockerComposePath} up -d`, {
    stdio: 'inherit',
    env: { ...process.env, ...envVars },
  })

  // Wait for all containers to be healthy
  const containers = [
    'dassie-test-postgres',
    'dassie-test-redis',
    ...Array.from({ length: nodeCount }, (_, i) => `dassie-node-${i}`),
  ]

  for (const container of containers) {
    await waitForContainerHealthy(container, 60000)
  }

  console.log('✓ All Docker containers healthy')

  // Verify network conditions if simulation enabled
  if (networkSimulation && (networkSimulation.latency || networkSimulation.packetLoss)) {
    console.log('Verifying network simulation conditions...')

    // Create temporary nodes for verification
    const tempNodes = await Promise.all(
      [0, 1].map((i) => createTempVerificationNode(i))
    )

    try {
      const verified = await verifyNetworkConditions(
        tempNodes,
        networkSimulation.latency || 0,
        networkSimulation.packetLoss || 0,
        networkSimulation.jitter
      )

      if (!verified) {
        throw new Error('Network simulation verification failed - conditions do not match expected values')
      }

      console.log('✓ Network simulation verified')
    } finally {
      // Cleanup temp nodes
      await Promise.all(tempNodes.map((node) => node.cleanup()))
    }
  }
}

/**
 * Create a temporary node for network verification only
 * (lighter weight than full node creation)
 */
async function createTempVerificationNode(index: number): Promise<TestNode> {
  const nodeId = `node${index}`
  const ilpAddress = `g.dassie.${nodeId}`
  const rpcPort = 7768 + index
  const authToken = `test-token-node${index}`

  // Generate Nostr keypair
  const privkey = randomBytes(32)
  const pubkey = Buffer.from(schnorr.getPublicKey(privkey)).toString('hex')

  // Create real Dassie connection for Docker mode
  const streamConnection = createRealDassieConnection(
    ilpAddress,
    `dassie-node-${index}`,
    rpcPort,
    authToken
  )

  // Create minimal test node for verification
  const node: TestNode = {
    id: nodeId,
    ilpAddress,
    pubkey,
    privkey,
    repository: null as any,
    cache: null as any,
    subscriptionManager: null as any,
    peerDiscovery: null as any,
    streamConnection,
    metrics: initializeMetrics(),
    _receivedEvents: [],
    _subscriptions: new Map(),
    _routingRevenue: 0,
    _running: true,

    async publishEvent(_event: NostrEvent): Promise<void> {},
    async subscribe(_filters: NostrFilter[]): Promise<string> {
      return ''
    },
    getReceivedEvents(_eventId?: string): NostrEvent[] {
      return []
    },
    getRoutingRevenue(): number {
      return 0
    },
    async measureLatency(_operation: () => Promise<void>): Promise<number> {
      return 0
    },
    getResourceUsage() {
      return { memoryMB: 0, cpuPercent: 0, connections: 0 }
    },
    async getPeers() {
      return []
    },
    async sendILPPayment(_opts: any) {
      return {} as any
    },
    async getInternalLedger() {
      return {} as any
    },
    async cleanup() {
      await streamConnection.close()
    },
  }

  return node
}

/**
 * Build environment variables for network simulation
 */
function buildNetworkSimulationEnv(
  simulation?: { latency?: number; jitter?: number; packetLoss?: number }
): Record<string, string> {
  if (!simulation) return {}

  const env: Record<string, string> = {}

  if (simulation.latency && simulation.latency > 0) {
    env.NETWORK_LATENCY = `${simulation.latency}ms`
  }

  if (simulation.jitter && simulation.jitter > 0) {
    env.NETWORK_JITTER = `${simulation.jitter}ms`
  }

  if (simulation.packetLoss && simulation.packetLoss > 0) {
    env.NETWORK_PACKET_LOSS = `${simulation.packetLoss * 100}%`
  }

  return env
}

/**
 * Wait for a Docker container to be healthy
 */
async function waitForContainerHealthy(containerName: string, timeout: number): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const healthStatus = execSync(
        `docker inspect --format='{{.State.Health.Status}}' ${containerName}`,
        { encoding: 'utf-8' }
      ).trim()

      if (healthStatus === 'healthy') {
        console.log(`  ✓ ${containerName} is healthy`)
        return
      }

      console.log(`  Waiting for ${containerName} (status: ${healthStatus})...`)
    } catch (error) {
      console.log(`  Container ${containerName} not found, waiting...`)
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  throw new Error(`Timeout waiting for ${containerName} to be healthy`)
}

/**
 * Create a single test node
 */
async function createNode(
  index: number,
  config: TestNetworkConfig
): Promise<TestNode> {
  const nodeId = `node${index}`
  const ilpAddress = `g.dassie.${nodeId}`

  // Generate Nostr keypair
  const privkey = randomBytes(32)
  const pubkey = Buffer.from(schnorr.getPublicKey(privkey)).toString('hex')

  // Initialize BTP-NIPs components (use mock implementations to avoid database dependencies)
  const repository = new MockEventRepository() as any
  const cache = new MockEventCache() as any
  const subscriptionManager = new SubscriptionManager()

  // Create ILP STREAM connection (mock or real Dassie)
  let streamConnection: StreamConnection
  if (config.executionMode === 'docker' && config.dassieNodes) {
    // Real Dassie connection (Docker mode)
    const rpcPort = 7768 + index // Port mapping: 7768, 7769, 7770, ...
    const authToken = `test-token-node${index}`
    streamConnection = createRealDassieConnection(
      ilpAddress,
      `dassie-node-${index}`,
      rpcPort,
      authToken
    )
  } else {
    // Mock connection (in-process mode)
    streamConnection = createMockStreamConnection(
      ilpAddress,
      config.networkSimulation?.latency ?? 0,
      config.networkSimulation?.packetLoss ?? 0
    )
  }

  // Initialize performance metrics
  const metrics = initializeMetrics()

  // Create test node with helper methods
  const node: TestNode = {
    id: nodeId,
    ilpAddress,
    pubkey,
    privkey,
    repository,
    cache,
    subscriptionManager,
    peerDiscovery: null as any, // TODO: Initialize peer discovery components
    streamConnection,
    metrics,
    _receivedEvents: [],
    _subscriptions: new Map(),
    _routingRevenue: 0,
    _running: true,

    async publishEvent(event: NostrEvent): Promise<void> {
      await repository.saveEvent(event)
      await cache.cacheEvent(event)
    },

    async subscribe(filters: NostrFilter[]): Promise<string> {
      const subId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      node._subscriptions.set(subId, filters)
      return subId
    },

    getReceivedEvents(eventId?: string): NostrEvent[] {
      if (eventId) {
        return node._receivedEvents.filter((e) => e.id === eventId)
      }
      return node._receivedEvents
    },

    getRoutingRevenue(): number {
      return node._routingRevenue
    },

    async measureLatency(operation: () => Promise<void>): Promise<number> {
      const start = performance.now()
      await operation()
      const end = performance.now()
      return end - start
    },

    getResourceUsage() {
      const memUsage = process.memoryUsage()
      return {
        memoryMB: memUsage.heapUsed / 1024 / 1024,
        cpuPercent: 0, // TODO: Implement CPU tracking
        connections:
          streamConnection.type === 'mock'
            ? streamConnection.getActiveConnectionCount()
            : 0,
      }
    },

    // Docker mode methods (Story 11.4)
    async getPeers(): Promise<PeerInfo[]> {
      if (streamConnection.type === 'real') {
        return await streamConnection.getPeers()
      }
      // Mock mode: return empty array
      return []
    },

    async sendILPPayment(opts: PaymentOpts): Promise<Payment> {
      if (streamConnection.type === 'real') {
        return await streamConnection.sendPayment(opts)
      }
      // Mock mode: simulate successful payment
      return {
        id: 'mock-payment-id',
        status: 'fulfilled',
        hops: 1,
        amountDelivered: opts.amount.toString(),
        async waitForFulfillment(_timeout: number): Promise<void> {
          // Mock: instantly fulfilled
        },
      }
    },

    async getInternalLedger(): Promise<LedgerState> {
      if (streamConnection.type === 'real') {
        return await streamConnection.getInternalLedger()
      }
      // Mock mode: return mock ledger state
      return {
        balance: 0,
        pendingBalance: 0,
        routingRevenue: node._routingRevenue,
        feesPaid: 0,
      }
    },

    async cleanup() {
      node._running = false
      await streamConnection.close()
      node._receivedEvents = []
      node._subscriptions.clear()
    },
  }

  return node
}

/**
 * Form mesh network topology between nodes
 *
 * Establishes peer connections based on specified topology:
 * - mesh: Full mesh (all-to-all connections)
 * - star: Hub-and-spoke (node0 is hub, all others connect to it)
 * - ring: Circular connections (node0 <-> node1 <-> node2 <-> ... <-> node0)
 *
 * @param nodes - Array of test nodes
 * @param topology - Network topology type (default: 'mesh')
 */
export async function formMesh(
  nodes: TestNode[],
  topology: 'mesh' | 'star' | 'ring' = 'mesh'
): Promise<void> {
  if (nodes.length < 2) {
    throw new Error('Need at least 2 nodes to form network')
  }

  switch (topology) {
    case 'mesh':
      await formFullMesh(nodes)
      break
    case 'star':
      await formStarTopology(nodes)
      break
    case 'ring':
      await formRingTopology(nodes)
      break
    default:
      throw new Error(`Unknown topology: ${topology}`)
  }
}

/**
 * Form full mesh (all-to-all) connections
 */
async function formFullMesh(nodes: TestNode[]): Promise<void> {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      await connectPeers(nodes[i], nodes[j])
    }
  }
}

/**
 * Form star topology (hub-and-spoke)
 */
async function formStarTopology(nodes: TestNode[]): Promise<void> {
  const hub = nodes[0]
  for (let i = 1; i < nodes.length; i++) {
    await connectPeers(hub, nodes[i])
  }
}

/**
 * Form ring topology (circular)
 */
async function formRingTopology(nodes: TestNode[]): Promise<void> {
  for (let i = 0; i < nodes.length; i++) {
    const next = (i + 1) % nodes.length
    await connectPeers(nodes[i], nodes[next])
  }
}

/**
 * Connect two nodes as peers
 */
async function connectPeers(_node1: TestNode, _node2: TestNode): Promise<void> {
  // TODO: Implement actual peer connection logic
  // For now, this is a mock connection
  // Will be implemented in full in later subtasks
  await new Promise((resolve) => setTimeout(resolve, 1))
}

/**
 * Wait for mesh network to stabilize
 *
 * Polls all nodes until:
 * - All expected peers are connected
 * - Peer discovery has completed
 * - Network is stable
 *
 * @param nodes - Array of test nodes
 * @param timeout - Maximum wait time in milliseconds (default: 30000)
 */
export async function waitForMeshStable(
  nodes: TestNode[],
  timeout = 30000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const stable = await checkNetworkStability(nodes)

    if (stable) {
      return
    }

    // Wait before next check
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error('Network failed to stabilize within timeout')
}

/**
 * Check if network is stable
 */
async function checkNetworkStability(_nodes: TestNode[]): Promise<boolean> {
  // TODO: Implement actual stability check
  // For now, always return true (mock implementation)
  // Will be implemented in full in later subtasks
  return true
}

/**
 * Cleanup Docker network (stops and removes containers)
 * Story 11.4: Docker cleanup
 */
export async function cleanupDockerNetwork(
  nodes: TestNode[],
  dockerComposePath?: string
): Promise<void> {
  // Cleanup individual nodes first
  await Promise.all(nodes.map((node) => node.cleanup()))

  // Stop Docker Compose stack if path provided
  if (dockerComposePath) {
    console.log(`Stopping Docker stack: ${dockerComposePath}`)
    execSync(`docker-compose -f ${dockerComposePath} down -v --remove-orphans`, {
      stdio: 'inherit',
    })
    console.log('✓ Docker stack stopped and cleaned up')
  }
}

/**
 * Wait for Docker containers to be healthy (exported utility)
 */
export async function waitForContainersHealthy(
  nodes: TestNode[],
  timeout = 30000
): Promise<void> {
  const containerNames = nodes.map((node) => {
    if (node.streamConnection.type === 'real') {
      return node.streamConnection.containerName
    }
    return null
  }).filter(Boolean) as string[]

  for (const containerName of containerNames) {
    await waitForContainerHealthy(containerName, timeout)
  }
}
