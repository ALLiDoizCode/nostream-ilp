/**
 * Performance regression detection using statistical analysis
 */

import { tTestTwoSample } from 'simple-statistics'
import type { BenchmarkResults, NodeBenchmark } from './benchmark-utils'
import { loadBenchmarkBaseline } from './benchmark-utils'

export interface RegressionReport {
  hasRegression: boolean
  warnings: string[]
  failures: string[]
  details: RegressionDetail[]
}

export interface RegressionDetail {
  metric: string
  current: number
  baseline: number
  delta: number
  deltaPercent: number
  severity: 'ok' | 'warning' | 'failure'
  message: string
}

/**
 * Detect performance regressions by comparing current results to baseline
 *
 * @param current - Current benchmark results
 * @param baseline - Baseline benchmark results (if null, no regression detected)
 * @returns Regression report
 */
export function detectRegression(
  current: BenchmarkResults,
  baseline: BenchmarkResults | null
): RegressionReport {
  const report: RegressionReport = {
    hasRegression: false,
    warnings: [],
    failures: [],
    details: [],
  }

  if (!baseline) {
    report.warnings.push('⚠️  No baseline found. Skipping regression detection.')
    return report
  }

  // Check each node configuration
  for (const [nodeConfig, currentMetrics] of Object.entries(current.baselines)) {
    const baselineMetrics = baseline.baselines[nodeConfig]

    if (!baselineMetrics) {
      report.warnings.push(`⚠️  No baseline for ${nodeConfig}. Skipping comparison.`)
      continue
    }

    // Check latency regressions
    checkLatencyRegression(nodeConfig, currentMetrics, baselineMetrics, report)

    // Check throughput regressions
    checkThroughputRegression(nodeConfig, currentMetrics, baselineMetrics, report)

    // Check memory regressions
    checkMemoryRegression(nodeConfig, currentMetrics, baselineMetrics, report)
  }

  return report
}

/**
 * Check latency regression
 */
function checkLatencyRegression(
  nodeConfig: string,
  current: NodeBenchmark,
  baseline: NodeBenchmark,
  report: RegressionReport
): void {
  const p95Delta =
    (current.latency.p95 - baseline.latency.p95) / baseline.latency.p95
  const p95DeltaPercent = p95Delta * 100

  const detail: RegressionDetail = {
    metric: `${nodeConfig} - p95 Latency`,
    current: current.latency.p95,
    baseline: baseline.latency.p95,
    delta: current.latency.p95 - baseline.latency.p95,
    deltaPercent: p95DeltaPercent,
    severity: 'ok',
    message: '',
  }

  // Check against thresholds
  if (p95Delta > 0.5) {
    // 50% increase = FAILURE
    detail.severity = 'failure'
    detail.message = `❌ Latency regression: ${p95DeltaPercent.toFixed(1)}% increase (threshold: 50%)`
    report.hasRegression = true
    report.failures.push(detail.message)
  } else if (p95Delta > 0.2) {
    // 20% increase = WARNING
    detail.severity = 'warning'
    detail.message = `⚠️  Latency warning: ${p95DeltaPercent.toFixed(1)}% increase (threshold: 20%)`
    report.warnings.push(detail.message)
  } else if (p95Delta < -0.05) {
    // 5% decrease = IMPROVEMENT
    detail.severity = 'ok'
    detail.message = `✓ Latency improved: ${Math.abs(p95DeltaPercent).toFixed(1)}% decrease`
  } else {
    // Within noise threshold (±5%)
    detail.severity = 'ok'
    detail.message = `✓ Latency stable: ${p95DeltaPercent > 0 ? '+' : ''}${p95DeltaPercent.toFixed(1)}% change`
  }

  report.details.push(detail)
}

/**
 * Check throughput regression
 */
function checkThroughputRegression(
  nodeConfig: string,
  current: NodeBenchmark,
  baseline: NodeBenchmark,
  report: RegressionReport
): void {
  const throughputDelta =
    (baseline.throughput.eventsPerSec - current.throughput.eventsPerSec) /
    baseline.throughput.eventsPerSec
  const throughputDeltaPercent = throughputDelta * 100

  const detail: RegressionDetail = {
    metric: `${nodeConfig} - Throughput`,
    current: current.throughput.eventsPerSec,
    baseline: baseline.throughput.eventsPerSec,
    delta: current.throughput.eventsPerSec - baseline.throughput.eventsPerSec,
    deltaPercent: -throughputDeltaPercent, // Negative because we're measuring decrease
    severity: 'ok',
    message: '',
  }

  // Check against thresholds (note: decrease in throughput is bad)
  if (throughputDelta > 0.5) {
    // 50% decrease = FAILURE
    detail.severity = 'failure'
    detail.message = `❌ Throughput regression: ${throughputDeltaPercent.toFixed(1)}% decrease (threshold: 50%)`
    report.hasRegression = true
    report.failures.push(detail.message)
  } else if (throughputDelta > 0.2) {
    // 20% decrease = WARNING
    detail.severity = 'warning'
    detail.message = `⚠️  Throughput warning: ${throughputDeltaPercent.toFixed(1)}% decrease (threshold: 20%)`
    report.warnings.push(detail.message)
  } else if (throughputDelta < -0.05) {
    // 5% increase = IMPROVEMENT
    detail.severity = 'ok'
    detail.message = `✓ Throughput improved: ${Math.abs(throughputDeltaPercent).toFixed(1)}% increase`
  } else {
    // Within noise threshold (±5%)
    detail.severity = 'ok'
    detail.message = `✓ Throughput stable: ${throughputDelta < 0 ? '+' : ''}${Math.abs(throughputDeltaPercent).toFixed(1)}% change`
  }

  report.details.push(detail)
}

/**
 * Check memory regression
 */
function checkMemoryRegression(
  nodeConfig: string,
  current: NodeBenchmark,
  baseline: NodeBenchmark,
  report: RegressionReport
): void {
  const memoryDelta =
    (current.resources.memoryMB - baseline.resources.memoryMB) /
    baseline.resources.memoryMB
  const memoryDeltaPercent = memoryDelta * 100

  const detail: RegressionDetail = {
    metric: `${nodeConfig} - Memory Usage`,
    current: current.resources.memoryMB,
    baseline: baseline.resources.memoryMB,
    delta: current.resources.memoryMB - baseline.resources.memoryMB,
    deltaPercent: memoryDeltaPercent,
    severity: 'ok',
    message: '',
  }

  // Check against thresholds
  if (memoryDelta > 0.3) {
    // 30% increase = WARNING
    detail.severity = 'warning'
    detail.message = `⚠️  Memory warning: ${memoryDeltaPercent.toFixed(1)}% increase (threshold: 30%)`
    report.warnings.push(detail.message)
  } else if (memoryDelta < -0.05) {
    // 5% decrease = IMPROVEMENT
    detail.severity = 'ok'
    detail.message = `✓ Memory improved: ${Math.abs(memoryDeltaPercent).toFixed(1)}% decrease`
  } else {
    // Within acceptable range
    detail.severity = 'ok'
    detail.message = `✓ Memory stable: ${memoryDelta > 0 ? '+' : ''}${memoryDeltaPercent.toFixed(1)}% change`
  }

  report.details.push(detail)
}

/**
 * Perform statistical significance test (t-test)
 *
 * @param currentSamples - Array of current measurements
 * @param baselineSamples - Array of baseline measurements
 * @param alpha - Significance level (default: 0.05 for 95% confidence)
 * @returns True if difference is statistically significant
 */
export function isStatisticallySignificant(
  currentSamples: number[],
  baselineSamples: number[],
  alpha = 0.05
): boolean {
  try {
    const pValue = tTestTwoSample(currentSamples, baselineSamples, 0)
    return pValue < alpha
  } catch (error) {
    console.warn('⚠️  Could not perform t-test:', error)
    return false
  }
}

/**
 * Format regression report as markdown
 */
export function formatRegressionReport(report: RegressionReport): string {
  let output = '# Performance Regression Report\n\n'

  if (report.hasRegression) {
    output += '## ❌ REGRESSIONS DETECTED\n\n'
  } else if (report.warnings.length > 0) {
    output += '## ⚠️  WARNINGS\n\n'
  } else {
    output += '## ✓ NO REGRESSIONS\n\n'
  }

  // Failures
  if (report.failures.length > 0) {
    output += '### Failures\n\n'
    for (const failure of report.failures) {
      output += `- ${failure}\n`
    }
    output += '\n'
  }

  // Warnings
  if (report.warnings.length > 0) {
    output += '### Warnings\n\n'
    for (const warning of report.warnings) {
      output += `- ${warning}\n`
    }
    output += '\n'
  }

  // Detailed metrics
  output += '## Detailed Metrics\n\n'
  output += '| Metric | Current | Baseline | Delta | Delta % | Status |\n'
  output += '|--------|---------|----------|-------|---------|--------|\n'

  for (const detail of report.details) {
    const statusIcon =
      detail.severity === 'failure'
        ? '❌'
        : detail.severity === 'warning'
          ? '⚠️'
          : '✓'

    output += `| ${detail.metric} | ${detail.current.toFixed(2)} | ${detail.baseline.toFixed(2)} | ${detail.delta > 0 ? '+' : ''}${detail.delta.toFixed(2)} | ${detail.deltaPercent > 0 ? '+' : ''}${detail.deltaPercent.toFixed(1)}% | ${statusIcon} |\n`
  }

  output += '\n'

  return output
}

/**
 * Main function - detect regressions and generate report
 */
export async function main(): Promise<void> {
  console.log('🔍 Detecting performance regressions...\n')

  // Load current results (should be generated by benchmark run)
  const currentPath = 'benchmark-results.json'
  const currentResults = await loadBenchmarkBaseline(currentPath)

  if (!currentResults) {
    console.error('❌ No current benchmark results found at:', currentPath)
    process.exit(1)
  }

  // Load baseline
  const baseline = await loadBenchmarkBaseline('.benchmarks/baseline.json')

  // Detect regressions
  const report = detectRegression(currentResults, baseline)

  // Format and display report
  const markdown = formatRegressionReport(report)
  console.log(markdown)

  // Write report to file
  const { promises: fs } = await import('fs')
  await fs.writeFile('regression-report.md', markdown, 'utf-8')
  console.log('✓ Regression report saved to: regression-report.md')

  // Exit with error if regressions detected
  if (report.hasRegression) {
    console.error('\n❌ Performance regressions detected. Please investigate.')
    process.exit(1)
  }

  if (report.warnings.length > 0) {
    console.warn('\n⚠️  Performance warnings detected. Review recommended.')
  } else {
    console.log('\n✓ All performance metrics within acceptable range.')
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
}
