/**
 * Statistical utilities for benchmark analysis
 */

/**
 * Calculate percentile from a sorted array of values
 *
 * @param values - Array of numeric values (must be sorted)
 * @param percentile - Percentile to calculate (0.0 to 1.0)
 * @returns The value at the specified percentile
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0
  }

  if (values.length === 1) {
    return values[0]
  }

  // Ensure percentile is in valid range
  if (percentile < 0 || percentile > 1) {
    throw new Error('Percentile must be between 0 and 1')
  }

  // Calculate position
  const index = percentile * (values.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower

  // Interpolate between values
  if (lower === upper) {
    return values[lower]
  }

  return values[lower] * (1 - weight) + values[upper] * weight
}

/**
 * Calculate multiple percentiles at once
 *
 * @param values - Array of numeric values (will be sorted)
 * @param percentiles - Array of percentiles to calculate (e.g., [0.5, 0.95, 0.99])
 * @returns Map of percentile to value
 */
export function calculatePercentiles(
  values: number[],
  percentiles: number[]
): Map<number, number> {
  const sorted = [...values].sort((a, b) => a - b)
  const results = new Map<number, number>()

  for (const p of percentiles) {
    results.set(p, calculatePercentile(sorted, p))
  }

  return results
}

/**
 * Calculate standard deviation
 *
 * @param values - Array of numeric values
 * @returns Standard deviation
 */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length
  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length

  return Math.sqrt(variance)
}

/**
 * Calculate mean (average)
 *
 * @param values - Array of numeric values
 * @returns Mean value
 */
export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, val) => sum + val, 0) / values.length
}

/**
 * Calculate median
 *
 * @param values - Array of numeric values
 * @returns Median value
 */
export function median(values: number[]): number {
  return calculatePercentile([...values].sort((a, b) => a - b), 0.5)
}

/**
 * Calculate confidence interval
 *
 * @param values - Array of numeric values
 * @param confidence - Confidence level (e.g., 0.95 for 95% confidence)
 * @returns [lower bound, upper bound]
 */
export function confidenceInterval(
  values: number[],
  confidence = 0.95
): [number, number] {
  const sorted = [...values].sort((a, b) => a - b)
  const alpha = 1 - confidence
  const lowerPercentile = alpha / 2
  const upperPercentile = 1 - alpha / 2

  return [
    calculatePercentile(sorted, lowerPercentile),
    calculatePercentile(sorted, upperPercentile),
  ]
}
