#!/usr/bin/env tsx
/**
 * Generate performance trend reports from historical benchmark data
 */

import { promises as fs } from 'fs'
import * as path from 'path'

interface HistoricalDataPoint {
  timestamp: string
  nodeCount: string
  latencyP95: number
  throughput: number
  memoryMB: number
}

interface TrendAnalysis {
  metric: string
  direction: 'improving' | 'degrading' | 'stable'
  changePercent: number
  anomalies: string[]
}

async function loadHistoricalData(
  historyDir: string
): Promise<HistoricalDataPoint[]> {
  const files = await fs.readdir(historyDir)
  const benchmarkFiles = files
    .filter((f) => f.startsWith('benchmark-') && f.endsWith('.json'))
    .sort() // Sort chronologically

  const dataPoints: HistoricalDataPoint[] = []

  for (const file of benchmarkFiles) {
    const filePath = path.join(historyDir, file)
    const content = await fs.readFile(filePath, 'utf-8')
    const data = JSON.parse(content)

    // Extract data points for each network size
    for (const [nodeCount, metrics] of Object.entries(data.baselines || {})) {
      const typedMetrics = metrics as {
        latency: { p95: number }
        throughput: { eventsPerSec: number }
        resources: { memoryMB: number }
      }
      dataPoints.push({
        timestamp: data.generatedAt || file,
        nodeCount,
        latencyP95: typedMetrics.latency.p95,
        throughput: typedMetrics.throughput.eventsPerSec,
        memoryMB: typedMetrics.resources.memoryMB,
      })
    }
  }

  return dataPoints
}

function calculateTrend(values: number[]): TrendAnalysis['direction'] {
  if (values.length < 2) return 'stable'

  // Simple linear regression slope
  const n = values.length
  const xMean = (n - 1) / 2
  const yMean = values.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let denominator = 0

  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean)
    denominator += (i - xMean) ** 2
  }

  const slope = numerator / denominator

  // Threshold for "stable" (< 5% change over period)
  const range = Math.max(...values) - Math.min(...values)
  const changePercent = (range / yMean) * 100

  if (changePercent < 5) return 'stable'
  return slope > 0 ? 'degrading' : 'improving' // Higher latency = degrading
}

function detectAnomalies(values: number[]): number[] {
  if (values.length < 3) return []

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance =
    values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length
  const stdDev = Math.sqrt(variance)

  // Anomaly = value > 2 standard deviations from mean
  return values
    .map((val, idx) => (Math.abs(val - mean) > 2 * stdDev ? idx : -1))
    .filter((idx) => idx !== -1)
}

function generateMarkdownReport(
  dataPoints: HistoricalDataPoint[],
  analyses: TrendAnalysis[]
): string {
  let report = '# Performance Trend Report\n\n'
  report += `**Generated:** ${new Date().toISOString()}\n`
  report += `**Period:** Last ${Math.min(dataPoints.length, 30)} days\n\n`

  report += '## Summary\n\n'

  for (const analysis of analyses) {
    const icon =
      analysis.direction === 'improving'
        ? '📈 ↗️'
        : analysis.direction === 'degrading'
          ? '📉 ↘️'
          : '📊 →'

    report += `- ${icon} **${analysis.metric}:** ${analysis.direction} (${analysis.changePercent.toFixed(1)}% change)\n`

    if (analysis.anomalies.length > 0) {
      report += `  - ⚠️ Anomalies detected on: ${analysis.anomalies.join(', ')}\n`
    }
  }

  report += '\n## Detailed Metrics\n\n'

  // Group by network size
  const byNodeCount = dataPoints.reduce(
    (acc, dp) => {
      if (!acc[dp.nodeCount]) acc[dp.nodeCount] = []
      acc[dp.nodeCount].push(dp)
      return acc
    },
    {} as Record<string, HistoricalDataPoint[]>
  )

  for (const [nodeCount, points] of Object.entries(byNodeCount)) {
    report += `### ${nodeCount} Network\n\n`

    report += '| Date | p95 Latency | Throughput | Memory |\n'
    report += '|------|-------------|------------|--------|\n'

    for (const point of points.slice(-10)) {
      // Last 10 data points
      const date = new Date(point.timestamp).toISOString().split('T')[0]
      report += `| ${date} | ${point.latencyP95}ms | ${point.throughput} evt/s | ${point.memoryMB} MB |\n`
    }

    report += '\n'
  }

  report += '## Recommendations\n\n'

  const degrading = analyses.filter((a) => a.direction === 'degrading')
  if (degrading.length > 0) {
    report += '**Action Required:**\n\n'
    for (const analysis of degrading) {
      report += `- Investigate ${analysis.metric} degradation (${analysis.changePercent.toFixed(1)}% worse)\n`
    }
  } else {
    report += '✅ No performance degradation detected.\n'
  }

  return report
}

async function main() {
  console.log('📈 Generating performance trend report...\n')

  const historyDir = path.join(process.cwd(), '.benchmarks/history')

  try {
    // Ensure history directory exists
    await fs.mkdir(historyDir, { recursive: true })

    const files = await fs.readdir(historyDir)
    const benchmarkFiles = files.filter(
      (f) => f.startsWith('benchmark-') && f.endsWith('.json')
    )

    if (benchmarkFiles.length === 0) {
      console.log('⚠️  No historical benchmark data found.')
      console.log('   Run benchmarks with `pnpm benchmark` to generate data.')
      return
    }

    console.log(`Found ${benchmarkFiles.length} historical benchmark files\n`)

    // Load historical data
    const dataPoints = await loadHistoricalData(historyDir)

    // Analyze trends for 10-node network (most common)
    const tenNodeData = dataPoints.filter((dp) => dp.nodeCount === '10-node')

    const analyses: TrendAnalysis[] = []

    if (tenNodeData.length >= 2) {
      // Latency trend
      const latencyValues = tenNodeData.map((dp) => dp.latencyP95)
      const latencyTrend = calculateTrend(latencyValues)
      const latencyAnomalies = detectAnomalies(latencyValues)
      const latencyChange =
        ((latencyValues[latencyValues.length - 1] - latencyValues[0]) /
          latencyValues[0]) *
        100

      analyses.push({
        metric: 'p95 Latency (10-node)',
        direction: latencyTrend,
        changePercent: Math.abs(latencyChange),
        anomalies: latencyAnomalies.map(
          (idx) => new Date(tenNodeData[idx].timestamp).toISOString().split('T')[0]
        ),
      })

      // Throughput trend (inverted - higher is better)
      const throughputValues = tenNodeData.map((dp) => dp.throughput)
      const throughputChange =
        ((throughputValues[0] - throughputValues[throughputValues.length - 1]) /
          throughputValues[0]) *
        100
      const throughputTrend =
        Math.abs(throughputChange) < 5
          ? 'stable'
          : throughputChange > 0
            ? 'degrading'
            : 'improving'
      const throughputAnomalies = detectAnomalies(throughputValues)

      analyses.push({
        metric: 'Throughput (10-node)',
        direction: throughputTrend,
        changePercent: Math.abs(throughputChange),
        anomalies: throughputAnomalies.map(
          (idx) => new Date(tenNodeData[idx].timestamp).toISOString().split('T')[0]
        ),
      })

      // Memory trend
      const memoryValues = tenNodeData.map((dp) => dp.memoryMB)
      const memoryTrend = calculateTrend(memoryValues)
      const memoryAnomalies = detectAnomalies(memoryValues)
      const memoryChange =
        ((memoryValues[memoryValues.length - 1] - memoryValues[0]) /
          memoryValues[0]) *
        100

      analyses.push({
        metric: 'Memory Usage (10-node)',
        direction: memoryTrend,
        changePercent: Math.abs(memoryChange),
        anomalies: memoryAnomalies.map(
          (idx) => new Date(tenNodeData[idx].timestamp).toISOString().split('T')[0]
        ),
      })
    }

    // Generate markdown report
    const report = generateMarkdownReport(dataPoints, analyses)
    const reportPath = path.join(process.cwd(), '.benchmarks/trends.md')
    await fs.writeFile(reportPath, report, 'utf-8')

    console.log('✓ Trend report generated')
    console.log('  Location: .benchmarks/trends.md')
    console.log('\nSummary:')
    for (const analysis of analyses) {
      const icon =
        analysis.direction === 'improving'
          ? '📈'
          : analysis.direction === 'degrading'
            ? '📉'
            : '📊'
      console.log(
        `  ${icon} ${analysis.metric}: ${analysis.direction} (${analysis.changePercent.toFixed(1)}%)`
      )
    }

    console.log('\n✓ Done')
  } catch (error) {
    console.error('Error generating trends:', error)
    process.exit(1)
  }
}

main()
