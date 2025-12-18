/**
 * Network Verification Utility (Story 11.7, AC 7)
 *
 * Verifies that Docker network simulation conditions match expected values
 * using ping tests between containers.
 */

import { execSync } from 'child_process'
import type { TestNode } from './test-node'

/**
 * Ping test results from container-to-container communication
 */
export interface PingTestResult {
  /** Average round-trip latency in milliseconds */
  averageLatency: number

  /** Minimum latency observed */
  minLatency: number

  /** Maximum latency observed */
  maxLatency: number

  /** Standard deviation (jitter measurement) */
  stdDevLatency: number

  /** Packet loss rate (0.0 to 1.0) */
  packetLoss: number

  /** Number of packets sent */
  packetsSent: number

  /** Number of packets received */
  packetsReceived: number
}

/**
 * Verify that network conditions match expected simulation parameters
 *
 * @param nodes - Array of test nodes (must have at least 2 nodes)
 * @param expectedLatency - Expected latency in milliseconds
 * @param expectedPacketLoss - Expected packet loss rate (0.0 to 1.0)
 * @param expectedJitter - Expected jitter (stddev) in milliseconds (optional)
 * @returns true if conditions match within tolerance, false otherwise
 */
export async function verifyNetworkConditions(
  nodes: TestNode[],
  expectedLatency: number,
  expectedPacketLoss: number,
  expectedJitter?: number
): Promise<boolean> {
  if (nodes.length < 2) {
    throw new Error('Need at least 2 nodes to verify network conditions')
  }

  // Run ping test between first two nodes
  const pingResults = await runPingTest(nodes[0], nodes[1], 100)

  // Check latency (±10% tolerance per AC 7)
  const latencyMatch =
    Math.abs(pingResults.averageLatency - expectedLatency) <= expectedLatency * 0.1

  // Check packet loss (±2% tolerance per AC 7)
  const packetLossMatch = Math.abs(pingResults.packetLoss - expectedPacketLoss) <= 0.02

  // Check jitter if expected value provided (±3ms tolerance per AC 7)
  let jitterMatch = true
  if (expectedJitter !== undefined) {
    jitterMatch = Math.abs(pingResults.stdDevLatency - expectedJitter) <= 3
  }

  // Log verification results
  console.log('Network condition verification:')
  console.log(`  Latency: ${pingResults.averageLatency.toFixed(2)}ms (expected ${expectedLatency}ms) - ${latencyMatch ? '✓' : '✗'}`)
  console.log(`  Packet loss: ${(pingResults.packetLoss * 100).toFixed(2)}% (expected ${(expectedPacketLoss * 100).toFixed(2)}%) - ${packetLossMatch ? '✓' : '✗'}`)
  if (expectedJitter !== undefined) {
    console.log(`  Jitter: ${pingResults.stdDevLatency.toFixed(2)}ms (expected ${expectedJitter}ms) - ${jitterMatch ? '✓' : '✗'}`)
  }

  return latencyMatch && packetLossMatch && jitterMatch
}

/**
 * Run ping test from one node to another inside Docker containers
 *
 * @param fromNode - Source node
 * @param toNode - Destination node
 * @param count - Number of pings to send
 * @returns Parsed ping test results
 */
export async function runPingTest(
  fromNode: TestNode,
  toNode: TestNode,
  count: number
): Promise<PingTestResult> {
  // Get container names
  const fromContainer = getContainerName(fromNode)
  const toContainer = getContainerName(toNode)

  // Get target IP address
  const targetIp = getNodeIpAddress(toContainer)

  // Run ping inside container
  try {
    const output = execSync(
      `docker exec ${fromContainer} ping -c ${count} -W 1 ${targetIp}`,
      { encoding: 'utf-8' }
    )

    return parsePingOutput(output, count)
  } catch (error) {
    // ping returns non-zero exit code on packet loss
    // Parse output anyway if available
    if (error instanceof Error && 'stdout' in error) {
      return parsePingOutput((error as any).stdout, count)
    }
    throw error
  }
}

/**
 * Parse ping command output to extract statistics
 *
 * Example ping output:
 * ```
 * 64 bytes from 172.20.0.11: icmp_seq=1 ttl=64 time=52.3 ms
 * ...
 * 100 packets transmitted, 95 received, 5% packet loss, time 4005ms
 * rtt min/avg/max/mdev = 50.123/52.456/54.789/1.234 ms
 * ```
 */
export function parsePingOutput(output: string, packetsSent: number): PingTestResult {
  const lines = output.split('\n')

  // Extract packet loss from summary line
  const packetLossLine = lines.find((l) => l.includes('packet loss'))
  let packetLoss = 0
  let packetsReceived = packetsSent

  if (packetLossLine) {
    const packetLossMatch = packetLossLine.match(/(\d+)% packet loss/)
    if (packetLossMatch) {
      packetLoss = Number.parseInt(packetLossMatch[1]) / 100
      packetsReceived = Math.round(packetsSent * (1 - packetLoss))
    }
  }

  // Extract RTT statistics (min/avg/max/mdev)
  const rttLine = lines.find((l) => l.includes('rtt min/avg/max'))
  if (!rttLine) {
    throw new Error(`Failed to parse ping output: no RTT statistics found\n${output}`)
  }

  const rttMatch = rttLine.match(
    /rtt min\/avg\/max\/mdev = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/
  )

  if (!rttMatch) {
    throw new Error(`Failed to parse RTT statistics from: ${rttLine}`)
  }

  return {
    minLatency: Number.parseFloat(rttMatch[1]),
    averageLatency: Number.parseFloat(rttMatch[2]),
    maxLatency: Number.parseFloat(rttMatch[3]),
    stdDevLatency: Number.parseFloat(rttMatch[4]),
    packetLoss,
    packetsSent,
    packetsReceived,
  }
}

/**
 * Get Docker container name from test node
 */
function getContainerName(node: TestNode): string {
  if (node.streamConnection.type === 'real') {
    return node.streamConnection.containerName
  }
  throw new Error(`Node ${node.id} is not running in Docker mode`)
}

/**
 * Get IP address of a Docker container
 *
 * @param containerName - Docker container name
 * @returns IP address as string
 */
export function getNodeIpAddress(containerName: string): string {
  const output = execSync(
    `docker inspect --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${containerName}`,
    { encoding: 'utf-8' }
  ).trim()

  if (!output) {
    throw new Error(`Failed to get IP address for container: ${containerName}`)
  }

  return output
}

/**
 * Cleanup network simulation by removing tc qdisc rules
 *
 * This should be called after tests complete to restore normal network behavior
 * and prevent stale rules from affecting subsequent tests.
 *
 * @param nodes - Array of test nodes
 */
export async function cleanupNetworkSimulation(nodes: TestNode[]): Promise<void> {
  for (const node of nodes) {
    if (node.streamConnection.type !== 'real') {
      continue
    }

    const containerName = node.streamConnection.containerName

    try {
      // Remove tc qdisc rules from container
      execSync(`docker exec ${containerName} tc qdisc del dev eth0 root`, {
        stdio: 'ignore',
      })
      console.log(`✓ Removed network simulation from ${node.id}`)
    } catch (_error) {
      // Ignore errors (qdisc might not exist if simulation wasn't enabled)
      console.log(`  No network simulation to clean up for ${node.id}`)
    }
  }
}
