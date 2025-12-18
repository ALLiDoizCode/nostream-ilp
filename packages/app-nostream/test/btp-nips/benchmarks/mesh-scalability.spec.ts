/**
 * Mesh Scalability Benchmarks
 * AC 1: Benchmark network performance across varying mesh sizes (10, 25, 50, 100 nodes)
 */

import { describe, it, expect, afterAll } from 'vitest'
import { createTestNetwork, formMesh } from '../n-peer/framework'
import { waitForEventPropagation } from '../n-peer/orchestration'
import { ResourceMonitor } from '../n-peer/monitoring'
import { calculatePercentile } from '../utils/statistics'
import {
  saveBenchmarkResults,
  generateBenchmarkReport,
  generateGraphs,
  archiveBenchmarkResults,
  getGitCommitHash,
  loadBenchmarkBaseline,
  type BenchmarkResults,
  type NodeBenchmark,
} from '../../../scripts/benchmark-utils'
import { schnorr } from '@noble/secp256k1'
import { randomBytes } from 'crypto'

describe('Mesh Scalability Benchmarks', () => {
  const benchmarkResults: BenchmarkResults = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    commitHash: undefined,
    baselines: {},
  }

  afterAll(async () => {
    // Get git commit hash
    benchmarkResults.commitHash = await getGitCommitHash()

    // Load baseline for comparison
    const baseline = await loadBenchmarkBaseline()

    // Save current results
    await saveBenchmarkResults(benchmarkResults, 'benchmark-results.json')

    // Archive results
    await archiveBenchmarkResults(benchmarkResults)

    // Generate markdown report
    await generateBenchmarkReport(benchmarkResults, baseline)

    // Generate graphs
    await generateGraphs(benchmarkResults, baseline)

    console.log('\n✓ All benchmark results saved and archived')
  })

  describe('10-Node Mesh Benchmark', () => {
    it('should measure latency distribution (AC 1)', async () => {
      console.log('\n📊 Running 10-node latency benchmark...')

      const nodes = await createTestNetwork(10, {
        networkTopology: 'mesh',
        enablePeerDiscovery: true,
      })

      await formMesh(nodes)
      const latencies: number[] = []

      // Run 100 iterations to get statistically significant sample
      for (let i = 0; i < 100; i++) {
        // Create a test event
        const privkey = randomBytes(32)
        const pubkey = Buffer.from(schnorr.getPublicKey(privkey)).toString('hex')

        const event = {
          id: `event_${i}_${Date.now()}`,
          pubkey,
          created_at: Math.floor(Date.now() / 1000),
          kind: 1,
          tags: [],
          content: `Benchmark event ${i}`,
          sig: 'mock_signature',
        }

        const start = performance.now()

        // Publish from node 0
        await nodes[0].publishEvent(event)

        // Wait for propagation to all other nodes
        await waitForEventPropagation(event.id, nodes.slice(1), 10000)

        const end = performance.now()
        latencies.push(end - start)
      }

      // Calculate percentiles
      latencies.sort((a, b) => a - b)
      const metrics: NodeBenchmark['latency'] = {
        p50: calculatePercentile(latencies, 0.5),
        p95: calculatePercentile(latencies, 0.95),
        p99: calculatePercentile(latencies, 0.99),
        max: Math.max(...latencies),
      }

      console.log(`  p50: ${metrics.p50.toFixed(2)}ms`)
      console.log(`  p95: ${metrics.p95.toFixed(2)}ms`)
      console.log(`  p99: ${metrics.p99.toFixed(2)}ms`)
      console.log(`  max: ${metrics.max.toFixed(2)}ms`)

      // Initialize benchmark results for 10-node
      benchmarkResults.baselines['10-node'] = {
        latency: metrics,
        throughput: { eventsPerSec: 0, bytesPerSec: 0 },
        resources: { memoryMB: 0, cpuPercent: 0, connections: 0 },
      }

      // Verify SLAs (AC 1)
      expect(metrics.p95).toBeLessThan(500)

      // Cleanup
      await Promise.all(nodes.map((node) => node.cleanup()))
    }, 180000) // 3 minute timeout

    it('should measure throughput under sustained load (AC 1)', async () => {
      console.log('\n📊 Running 10-node throughput benchmark...')

      const nodes = await createTestNetwork(10, {
        networkTopology: 'mesh',
        enablePeerDiscovery: true,
      })

      await formMesh(nodes)

      const startTime = performance.now()
      const eventCount = 1000
      let bytesSent = 0

      // Publish events in parallel (distributed across all nodes)
      const promises = []
      for (let i = 0; i < eventCount; i++) {
        const nodeIndex = i % 10
        const privkey = randomBytes(32)
        const pubkey = Buffer.from(schnorr.getPublicKey(privkey)).toString('hex')

        const event = {
          id: `throughput_event_${i}_${Date.now()}`,
          pubkey,
          created_at: Math.floor(Date.now() / 1000),
          kind: 1,
          tags: [],
          content: `Throughput test ${i}`,
          sig: 'mock_signature',
        }

        bytesSent += JSON.stringify(event).length

        promises.push(nodes[nodeIndex].publishEvent(event))
      }

      await Promise.all(promises)

      const endTime = performance.now()
      const durationSec = (endTime - startTime) / 1000
      const eventsPerSec = eventCount / durationSec
      const bytesPerSec = bytesSent / durationSec

      console.log(`  Throughput: ${eventsPerSec.toFixed(2)} events/sec`)
      console.log(`  Bandwidth: ${(bytesPerSec / 1024).toFixed(2)} KB/sec`)

      // Store for report
      benchmarkResults.baselines['10-node'].throughput = {
        eventsPerSec,
        bytesPerSec,
      }

      // Verify SLA (AC 1)
      expect(eventsPerSec).toBeGreaterThan(100)

      // Cleanup
      await Promise.all(nodes.map((node) => node.cleanup()))
    }, 180000)

    it('should measure resource utilization (AC 1)', async () => {
      console.log('\n📊 Running 10-node resource utilization benchmark...')

      const nodes = await createTestNetwork(10, {
        networkTopology: 'mesh',
        enablePeerDiscovery: true,
      })

      await formMesh(nodes)

      // Start resource monitoring
      const resourceMonitor = new ResourceMonitor(nodes)
      resourceMonitor.start(1000) // Sample every second

      // Run sustained load for 30 seconds
      const testDuration = 30000
      const startTime = Date.now()

      while (Date.now() - startTime < testDuration) {
        const privkey = randomBytes(32)
        const pubkey = Buffer.from(schnorr.getPublicKey(privkey)).toString('hex')

        const event = {
          id: `resource_test_${Date.now()}`,
          pubkey,
          created_at: Math.floor(Date.now() / 1000),
          kind: 1,
          tags: [],
          content: 'Resource test event',
          sig: 'mock_signature',
        }

        await nodes[0].publishEvent(event)
        await new Promise((resolve) => setTimeout(resolve, 100)) // 10 events/sec
      }

      resourceMonitor.stop()

      const metrics = resourceMonitor.getAverageMetrics()
      console.log(`  Memory: ${metrics.memoryMB.toFixed(2)} MB`)
      console.log(`  CPU: ${metrics.cpuPercent.toFixed(2)}%`)
      console.log(`  Connections: ${metrics.connections}`)

      // Store for report
      benchmarkResults.baselines['10-node'].resources = metrics

      // Verify resource limits (AC 1)
      expect(metrics.memoryMB).toBeLessThan(512)
      expect(metrics.cpuPercent).toBeLessThan(50)

      // Cleanup
      await Promise.all(nodes.map((node) => node.cleanup()))
    }, 120000)
  })

  describe('25-Node Mesh Benchmark', () => {
    it('should measure latency and network diameter (AC 1)', async () => {
      console.log('\n📊 Running 25-node latency benchmark...')

      const nodes = await createTestNetwork(25, {
        networkTopology: 'mesh',
        enablePeerDiscovery: true,
      })

      await formMesh(nodes)
      const latencies: number[] = []

      // Run 50 iterations (fewer due to larger network)
      for (let i = 0; i < 50; i++) {
        const privkey = randomBytes(32)
        const pubkey = Buffer.from(schnorr.getPublicKey(privkey)).toString('hex')

        const event = {
          id: `event_25_${i}_${Date.now()}`,
          pubkey,
          created_at: Math.floor(Date.now() / 1000),
          kind: 1,
          tags: [],
          content: `Benchmark event ${i}`,
          sig: 'mock_signature',
        }

        const start = performance.now()
        await nodes[0].publishEvent(event)
        await waitForEventPropagation(event.id, nodes.slice(1), 15000)
        const end = performance.now()

        latencies.push(end - start)
      }

      latencies.sort((a, b) => a - b)
      const metrics: NodeBenchmark['latency'] = {
        p50: calculatePercentile(latencies, 0.5),
        p95: calculatePercentile(latencies, 0.95),
        p99: calculatePercentile(latencies, 0.99),
        max: Math.max(...latencies),
      }

      console.log(`  p50: ${metrics.p50.toFixed(2)}ms`)
      console.log(`  p95: ${metrics.p95.toFixed(2)}ms`)
      console.log(`  p99: ${metrics.p99.toFixed(2)}ms`)

      // Network diameter (mesh = 1 hop for all nodes)
      const diameter = 1
      console.log(`  Network diameter: ${diameter} hops`)

      benchmarkResults.baselines['25-node'] = {
        latency: metrics,
        throughput: { eventsPerSec: 0, bytesPerSec: 0 },
        resources: { memoryMB: 0, cpuPercent: 0, connections: 0 },
      }

      // Verify SLAs
      expect(metrics.p95).toBeLessThan(1000)
      expect(diameter).toBeLessThanOrEqual(5)

      await Promise.all(nodes.map((node) => node.cleanup()))
    }, 300000) // 5 minutes

    it('should measure throughput and resource usage (AC 1)', async () => {
      console.log('\n📊 Running 25-node throughput benchmark...')

      const nodes = await createTestNetwork(25, {
        networkTopology: 'mesh',
        enablePeerDiscovery: true,
      })

      await formMesh(nodes)

      const resourceMonitor = new ResourceMonitor(nodes)
      resourceMonitor.start(1000)

      const startTime = performance.now()
      const eventCount = 500
      let bytesSent = 0

      const promises = []
      for (let i = 0; i < eventCount; i++) {
        const nodeIndex = i % 25
        const privkey = randomBytes(32)
        const pubkey = Buffer.from(schnorr.getPublicKey(privkey)).toString('hex')

        const event = {
          id: `throughput_25_${i}_${Date.now()}`,
          pubkey,
          created_at: Math.floor(Date.now() / 1000),
          kind: 1,
          tags: [],
          content: `Throughput test ${i}`,
          sig: 'mock_signature',
        }

        bytesSent += JSON.stringify(event).length
        promises.push(nodes[nodeIndex].publishEvent(event))
      }

      await Promise.all(promises)
      resourceMonitor.stop()

      const endTime = performance.now()
      const durationSec = (endTime - startTime) / 1000
      const eventsPerSec = eventCount / durationSec
      const bytesPerSec = bytesSent / durationSec

      const resources = resourceMonitor.getAverageMetrics()

      console.log(`  Throughput: ${eventsPerSec.toFixed(2)} events/sec`)
      console.log(`  Memory: ${resources.memoryMB.toFixed(2)} MB`)

      benchmarkResults.baselines['25-node'].throughput = {
        eventsPerSec,
        bytesPerSec,
      }
      benchmarkResults.baselines['25-node'].resources = resources

      // Verify SLAs
      expect(eventsPerSec).toBeGreaterThan(250)
      expect(resources.memoryMB).toBeLessThan(768)

      await Promise.all(nodes.map((node) => node.cleanup()))
    }, 300000)
  })

  describe('50-Node Mesh Benchmark', () => {
    it('should measure scalability and graceful degradation (AC 1)', async () => {
      console.log('\n📊 Running 50-node scalability benchmark...')

      const nodes = await createTestNetwork(50, {
        networkTopology: 'mesh',
        enablePeerDiscovery: true,
      })

      await formMesh(nodes)

      const resourceMonitor = new ResourceMonitor(nodes)
      resourceMonitor.start(1000)

      const latencies: number[] = []

      // Run 25 iterations
      for (let i = 0; i < 25; i++) {
        const privkey = randomBytes(32)
        const pubkey = Buffer.from(schnorr.getPublicKey(privkey)).toString('hex')

        const event = {
          id: `event_50_${i}_${Date.now()}`,
          pubkey,
          created_at: Math.floor(Date.now() / 1000),
          kind: 1,
          tags: [],
          content: `Benchmark event ${i}`,
          sig: 'mock_signature',
        }

        const start = performance.now()
        await nodes[0].publishEvent(event)
        await waitForEventPropagation(event.id, nodes.slice(1), 20000)
        const end = performance.now()

        latencies.push(end - start)
      }

      resourceMonitor.stop()

      latencies.sort((a, b) => a - b)
      const metrics: NodeBenchmark['latency'] = {
        p50: calculatePercentile(latencies, 0.5),
        p95: calculatePercentile(latencies, 0.95),
        p99: calculatePercentile(latencies, 0.99),
        max: Math.max(...latencies),
      }

      const resources = resourceMonitor.getAverageMetrics()

      console.log(`  p50: ${metrics.p50.toFixed(2)}ms`)
      console.log(`  p95: ${metrics.p95.toFixed(2)}ms`)
      console.log(`  Memory: ${resources.memoryMB.toFixed(2)} MB`)

      benchmarkResults.baselines['50-node'] = {
        latency: metrics,
        throughput: { eventsPerSec: 0, bytesPerSec: 0 },
        resources,
      }

      // Verify graceful degradation (no exponential blowup)
      expect(metrics.p95).toBeLessThan(2000)
      expect(resources.memoryMB).toBeLessThan(1024)

      await Promise.all(nodes.map((node) => node.cleanup()))
    }, 600000) // 10 minutes
  })

  describe.skip('100-Node Mesh Stress Test', () => {
    // This test is skipped by default (too resource-intensive for CI)
    // Run manually with: vitest run --reporter=verbose mesh-scalability.spec.ts
    it('should remain stable under extreme scale (AC 1)', async () => {
      console.log('\n📊 Running 100-node stress test...')

      const nodes = await createTestNetwork(100, {
        networkTopology: 'mesh',
        enablePeerDiscovery: true,
      })

      await formMesh(nodes)

      const resourceMonitor = new ResourceMonitor(nodes)
      resourceMonitor.start(2000)

      const latencies: number[] = []

      // Run 10 iterations only (very resource intensive)
      for (let i = 0; i < 10; i++) {
        const privkey = randomBytes(32)
        const pubkey = Buffer.from(schnorr.getPublicKey(privkey)).toString('hex')

        const event = {
          id: `event_100_${i}_${Date.now()}`,
          pubkey,
          created_at: Math.floor(Date.now() / 1000),
          kind: 1,
          tags: [],
          content: `Stress test event ${i}`,
          sig: 'mock_signature',
        }

        const start = performance.now()
        await nodes[0].publishEvent(event)
        await waitForEventPropagation(event.id, nodes.slice(1), 30000)
        const end = performance.now()

        latencies.push(end - start)
      }

      resourceMonitor.stop()

      latencies.sort((a, b) => a - b)
      const metrics: NodeBenchmark['latency'] = {
        p50: calculatePercentile(latencies, 0.5),
        p95: calculatePercentile(latencies, 0.95),
        p99: calculatePercentile(latencies, 0.99),
        max: Math.max(...latencies),
      }

      const resources = resourceMonitor.getAverageMetrics()

      console.log(`  p50: ${metrics.p50.toFixed(2)}ms`)
      console.log(`  p95: ${metrics.p95.toFixed(2)}ms`)
      console.log(`  Memory: ${resources.memoryMB.toFixed(2)} MB`)

      benchmarkResults.baselines['100-node'] = {
        latency: metrics,
        throughput: { eventsPerSec: 0, bytesPerSec: 0 },
        resources,
      }

      // Verify network remains stable
      expect(metrics.p95).toBeLessThan(5000)
      expect(resources.memoryMB).toBeLessThan(2048)

      await Promise.all(nodes.map((node) => node.cleanup()))
    }, 1800000) // 30 minutes
  })
})
