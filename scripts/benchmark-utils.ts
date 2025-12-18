/**
 * Benchmark utilities for saving/loading results and generating reports
 */

import { promises as fs } from 'fs'
import path from 'path'
import { ChartJSNodeCanvas } from 'chartjs-node-canvas'
import type { ChartConfiguration } from 'chart.js'

/**
 * Baseline and current benchmark results schema
 */
export interface BenchmarkResults {
  version: string
  generatedAt: string
  commitHash?: string
  baselines: Record<string, NodeBenchmark>
}

export interface NodeBenchmark {
  latency: {
    p50: number
    p95: number
    p99: number
    max: number
  }
  throughput: {
    eventsPerSec: number
    bytesPerSec: number
  }
  resources: {
    memoryMB: number
    cpuPercent: number
    connections: number
  }
}

export interface LatencyBreakdown {
  serialization: number
  network: number
  deserialization: number
  crypto: number
  database: number
  subscription: number
  total: number
}

/**
 * Save benchmark results to baseline file
 */
export async function saveBenchmarkResults(
  results: BenchmarkResults,
  filePath = '.benchmarks/baseline.json'
): Promise<void> {
  const fullPath = path.resolve(process.cwd(), filePath)
  const dir = path.dirname(fullPath)

  // Ensure directory exists
  await fs.mkdir(dir, { recursive: true })

  // Write results
  await fs.writeFile(fullPath, JSON.stringify(results, null, 2), 'utf-8')

  console.log(`✓ Benchmark results saved to ${filePath}`)
}

/**
 * Load benchmark baseline from file
 */
export async function loadBenchmarkBaseline(
  filePath = '.benchmarks/baseline.json'
): Promise<BenchmarkResults | null> {
  const fullPath = path.resolve(process.cwd(), filePath)

  try {
    const content = await fs.readFile(fullPath, 'utf-8')
    return JSON.parse(content) as BenchmarkResults
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('⚠️  No baseline found. This will be the first baseline.')
      return null
    }
    throw error
  }
}

/**
 * Generate markdown report from benchmark results
 */
export async function generateBenchmarkReport(
  results: BenchmarkResults,
  baseline: BenchmarkResults | null,
  outputPath = 'benchmark-report.md'
): Promise<void> {
  let report = '# Benchmark Results\n\n'
  report += `**Generated:** ${results.generatedAt}\n`
  if (results.commitHash) {
    report += `**Commit:** ${results.commitHash}\n`
  }
  report += '\n'

  // Generate comparison table
  report += '## Performance Metrics\n\n'

  for (const [nodeConfig, metrics] of Object.entries(results.baselines)) {
    report += `### ${nodeConfig}\n\n`

    // Latency table
    report += '**Latency Distribution:**\n\n'
    report += '| Metric | Current | Baseline | Delta |\n'
    report += '|--------|---------|----------|-------|\n'

    const baselineMetrics = baseline?.baselines[nodeConfig]

    for (const [key, value] of Object.entries(metrics.latency)) {
      const baselineValue = baselineMetrics?.latency[key as keyof typeof metrics.latency]
      const delta = baselineValue
        ? ((value - baselineValue) / baselineValue) * 100
        : null

      report += `| ${key} | ${value.toFixed(2)}ms | ${
        baselineValue ? `${baselineValue.toFixed(2)}ms` : 'N/A'
      } | ${delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%` : 'N/A'} |\n`
    }

    report += '\n'

    // Throughput table
    report += '**Throughput:**\n\n'
    report += '| Metric | Current | Baseline | Delta |\n'
    report += '|--------|---------|----------|-------|\n'

    for (const [key, value] of Object.entries(metrics.throughput)) {
      const baselineValue = baselineMetrics?.throughput[key as keyof typeof metrics.throughput]
      const delta = baselineValue
        ? ((value - baselineValue) / baselineValue) * 100
        : null

      const unit = key === 'eventsPerSec' ? 'events/s' : 'bytes/s'
      report += `| ${key} | ${value.toFixed(2)} ${unit} | ${
        baselineValue ? `${baselineValue.toFixed(2)} ${unit}` : 'N/A'
      } | ${delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%` : 'N/A'} |\n`
    }

    report += '\n'

    // Resource usage table
    report += '**Resource Usage:**\n\n'
    report += '| Metric | Current | Baseline | Delta |\n'
    report += '|--------|---------|----------|-------|\n'

    for (const [key, value] of Object.entries(metrics.resources)) {
      const baselineValue = baselineMetrics?.resources[key as keyof typeof metrics.resources]
      const delta = baselineValue
        ? ((value - baselineValue) / baselineValue) * 100
        : null

      let unit = ''
      if (key === 'memoryMB') unit = 'MB'
      if (key === 'cpuPercent') unit = '%'

      report += `| ${key} | ${value.toFixed(2)}${unit} | ${
        baselineValue ? `${baselineValue.toFixed(2)}${unit}` : 'N/A'
      } | ${delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%` : 'N/A'} |\n`
    }

    report += '\n'
  }

  // Write report
  const fullPath = path.resolve(process.cwd(), outputPath)
  await fs.writeFile(fullPath, report, 'utf-8')

  console.log(`✓ Benchmark report generated: ${outputPath}`)
}

/**
 * Generate graphs from benchmark results using Chart.js
 */
export async function generateGraphs(
  results: BenchmarkResults,
  baseline: BenchmarkResults | null,
  outputPath = 'benchmark-graphs.png'
): Promise<void> {
  const width = 1200
  const height = 600
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height })

  // Extract data for graph
  const nodeConfigs = Object.keys(results.baselines)
  const p95Latencies = nodeConfigs.map((config) => results.baselines[config].latency.p95)
  const baselineP95 = baseline
    ? nodeConfigs.map((config) => baseline.baselines[config]?.latency.p95 ?? 0)
    : []

  const configuration: ChartConfiguration = {
    type: 'line',
    data: {
      labels: nodeConfigs,
      datasets: [
        {
          label: 'Current p95 Latency (ms)',
          data: p95Latencies,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Mesh Scalability - p95 Latency',
        },
        legend: {
          display: true,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Latency (ms)',
          },
        },
        x: {
          title: {
            display: true,
            text: 'Network Size',
          },
        },
      },
    },
  }

  // Add baseline dataset if available
  if (baseline && baselineP95.length > 0) {
    configuration.data.datasets.push({
      label: 'Baseline p95 Latency (ms)',
      data: baselineP95,
      borderColor: 'rgb(255, 99, 132)',
      backgroundColor: 'rgba(255, 99, 132, 0.2)',
      tension: 0.1,
    })
  }

  const image = await chartJSNodeCanvas.renderToBuffer(configuration)
  const fullPath = path.resolve(process.cwd(), outputPath)
  await fs.writeFile(fullPath, image)

  console.log(`✓ Benchmark graphs generated: ${outputPath}`)
}

/**
 * Archive benchmark results with timestamp
 */
export async function archiveBenchmarkResults(
  results: BenchmarkResults,
  archiveDir = '.benchmarks/history'
): Promise<void> {
  const fullPath = path.resolve(process.cwd(), archiveDir)
  await fs.mkdir(fullPath, { recursive: true })

  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
  const fileName = `benchmark-${timestamp}.json`

  await fs.writeFile(
    path.join(fullPath, fileName),
    JSON.stringify(results, null, 2),
    'utf-8'
  )

  console.log(`✓ Benchmark archived: ${archiveDir}/${fileName}`)

  // Clean up old archives (keep last 90 days)
  await cleanupOldArchives(fullPath, 90)
}

/**
 * Clean up archives older than specified days
 */
async function cleanupOldArchives(archiveDir: string, retentionDays: number): Promise<void> {
  const files = await fs.readdir(archiveDir)
  const now = Date.now()
  const maxAge = retentionDays * 24 * 60 * 60 * 1000

  for (const file of files) {
    if (!file.startsWith('benchmark-') || !file.endsWith('.json')) {
      continue
    }

    const filePath = path.join(archiveDir, file)
    const stat = await fs.stat(filePath)
    const age = now - stat.mtimeMs

    if (age > maxAge) {
      await fs.unlink(filePath)
      console.log(`  ✓ Deleted old archive: ${file}`)
    }
  }
}

/**
 * Get current git commit hash
 */
export async function getGitCommitHash(): Promise<string | undefined> {
  try {
    const { execSync } = await import('child_process')
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
    return hash
  } catch {
    return undefined
  }
}
