#!/usr/bin/env tsx

/**
 * 30-Day Self-Sustainability Validation Script
 *
 * Simulates peer node economics to prove the business model works.
 * Calculates daily revenue (subscriptions + routing fees) vs daily expenses
 * (Akash hosting + gas fees + subscription costs).
 *
 * Usage:
 *   pnpm tsx scripts/validate-sustainability.ts [scenario]
 *   pnpm tsx scripts/validate-sustainability.ts base
 *   pnpm tsx scripts/validate-sustainability.ts all
 */

// ============================================================================
// Configuration Constants
// ============================================================================

/**
 * BTC/USD exchange rate assumption
 * TODO: Consider fetching from price oracle API for production use
 */
const BTC_USD_RATE = 45000

// ============================================================================
// Type Definitions
// ============================================================================

export interface SimulationInputs {
  followers: number;              // Users who subscribe to me (earn from)
  follows: number;                // Users I subscribe to (pay for)
  subscriptionPriceMsats: number; // Msats per hour
  akashCostMonthlyUsd: number;    // Monthly hosting cost
  routingFeePercentage: number;   // Percentage of routed payments
  gasCostPerSettlement: number;   // USD per Base L2 transaction
  settlementsPerDay: number;      // Channel settlements/day
}

export interface SimulationScenario {
  name: string;
  description: string;
  inputs: SimulationInputs;
}

export interface DayResult {
  day: number;
  revenue: number;
  expenses: number;
  profit: number;
  cumulativeProfit: number;
}

export interface SimulationResult {
  scenario: string;
  inputs: SimulationInputs;
  days: DayResult[];
  breakEvenDay: number | null;
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  averageDailyProfit: number;
  roi: number; // Return on investment percentage
}

export interface ValidationTargets {
  pessimistic: { breakEvenDay: number };
  base: { breakEvenDay: number };
  optimistic: { roi: number };
}

// ============================================================================
// Scenarios
// ============================================================================

export const scenarios: SimulationScenario[] = [
  {
    name: 'Pessimistic',
    description: 'Minimal network: 20 followers, 15 follows',
    inputs: {
      followers: 20,
      follows: 15,
      subscriptionPriceMsats: 5000,  // 5000 msats/hour
      akashCostMonthlyUsd: 5.00,
      routingFeePercentage: 1.0,
      gasCostPerSettlement: 0.02,
      settlementsPerDay: 2,
    },
  },
  {
    name: 'Base',
    description: 'Expected network: 50 followers, 30 follows',
    inputs: {
      followers: 50,
      follows: 30,
      subscriptionPriceMsats: 5000,
      akashCostMonthlyUsd: 5.00,
      routingFeePercentage: 1.0,
      gasCostPerSettlement: 0.02,
      settlementsPerDay: 2,
    },
  },
  {
    name: 'Optimistic',
    description: 'Strong network: 250 followers, 50 follows',
    inputs: {
      followers: 250,
      follows: 50,
      subscriptionPriceMsats: 5000,
      akashCostMonthlyUsd: 5.00,
      routingFeePercentage: 1.0,
      gasCostPerSettlement: 0.02,
      settlementsPerDay: 2,
    },
  },
]

// ============================================================================
// Validation Targets
// ============================================================================

export const targets: ValidationTargets = {
  pessimistic: { breakEvenDay: 30 },
  base: { breakEvenDay: 15 },
  optimistic: { roi: 300 },
}

// ============================================================================
// Revenue Calculation Functions
// ============================================================================

/**
 * Calculate daily subscription revenue
 * @param followers Number of followers subscribing to this node
 * @param priceMsats Subscription price in msats per hour
 * @returns Daily revenue in USD
 */
export function calculateSubscriptionRevenue(
  followers: number,
  priceMsats: number
): number {
  const msatsPerDay = followers * priceMsats * 24 // 24 hours
  const satsPerDay = msatsPerDay / 1000
  const btcPerDay = satsPerDay / 100_000_000
  return btcPerDay * BTC_USD_RATE
}

/**
 * Estimate daily routing fee revenue
 * @param follows Number of follows (outgoing subscriptions)
 * @param followers Number of followers (incoming subscriptions)
 * @param feePercentage Routing fee percentage (0.01 = 1%)
 * @returns Estimated daily routing revenue in USD
 */
export function calculateRoutingRevenue(
  follows: number,
  followers: number,
  feePercentage: number
): number {
  // Routing revenue comes from forwarding payments for OTHER users
  // Estimate: Average node forwards traffic for 50% of its network
  const networkSize = follows + followers
  const routedPaymentsPerDay = networkSize * 0.5 * 10 // 10 payments/day avg
  const avgPaymentUsd = 0.01 // $0.01 per payment
  return routedPaymentsPerDay * avgPaymentUsd * feePercentage
}

/**
 * Calculate total daily revenue
 */
export function calculateDailyRevenue(inputs: SimulationInputs): {
  subscriptionRevenue: number;
  routingRevenue: number;
  total: number;
} {
  const subscriptionRevenue = calculateSubscriptionRevenue(
    inputs.followers,
    inputs.subscriptionPriceMsats
  )
  const routingRevenue = calculateRoutingRevenue(
    inputs.follows,
    inputs.followers,
    inputs.routingFeePercentage / 100
  )

  return {
    subscriptionRevenue,
    routingRevenue,
    total: subscriptionRevenue + routingRevenue,
  }
}

// ============================================================================
// Expense Calculation Functions
// ============================================================================

/**
 * Calculate daily Akash hosting cost
 * @param monthlyUsd Monthly hosting cost
 * @returns Daily cost in USD
 */
export function calculateAkashCost(monthlyUsd: number): number {
  return monthlyUsd / 30 // Average days per month
}

/**
 * Calculate daily gas fees for Base L2 settlements
 * @param costPerSettlement USD per transaction
 * @param settlementsPerDay Number of daily settlements
 * @returns Daily gas cost in USD
 */
export function calculateGasCost(
  costPerSettlement: number,
  settlementsPerDay: number
): number {
  return costPerSettlement * settlementsPerDay
}

/**
 * Calculate daily subscription expenses (paying for follows)
 * @param follows Number of follows (outgoing subscriptions)
 * @param priceMsats Subscription price in msats per hour
 * @returns Daily expense in USD
 */
export function calculateSubscriptionExpense(
  follows: number,
  priceMsats: number
): number {
  const msatsPerDay = follows * priceMsats * 24
  const satsPerDay = msatsPerDay / 1000
  const btcPerDay = satsPerDay / 100_000_000
  return btcPerDay * BTC_USD_RATE
}

/**
 * Calculate total daily expenses
 */
export function calculateDailyExpenses(inputs: SimulationInputs): {
  akashCost: number;
  gasCost: number;
  subscriptionExpense: number;
  total: number;
} {
  const akashCost = calculateAkashCost(inputs.akashCostMonthlyUsd)
  const gasCost = calculateGasCost(
    inputs.gasCostPerSettlement,
    inputs.settlementsPerDay
  )
  const subscriptionExpense = calculateSubscriptionExpense(
    inputs.follows,
    inputs.subscriptionPriceMsats
  )

  return {
    akashCost,
    gasCost,
    subscriptionExpense,
    total: akashCost + gasCost + subscriptionExpense,
  }
}

// ============================================================================
// Simulation Functions
// ============================================================================

/**
 * Run 30-day sustainability simulation
 */
export function runSimulation(
  scenario: SimulationScenario,
  days: number = 30
): SimulationResult {
  const results: DayResult[] = []
  let cumulativeProfit = 0
  let breakEvenDay: number | null = null

  for (let day = 1; day <= days; day++) {
    const revenue = calculateDailyRevenue(scenario.inputs)
    const expenses = calculateDailyExpenses(scenario.inputs)
    const profit = revenue.total - expenses.total
    cumulativeProfit += profit

    results.push({
      day,
      revenue: revenue.total,
      expenses: expenses.total,
      profit,
      cumulativeProfit,
    })

    // Detect break-even day
    if (breakEvenDay === null && cumulativeProfit >= 0) {
      breakEvenDay = day
    }
  }

  const totalRevenue = results.reduce((sum, r) => sum + r.revenue, 0)
  const totalExpenses = results.reduce((sum, r) => sum + r.expenses, 0)
  const totalProfit = totalRevenue - totalExpenses
  const averageDailyProfit = totalProfit / days

  // Calculate ROI: (Total Profit / Total Expenses) * 100
  const roi = totalExpenses > 0 ? (totalProfit / totalExpenses) * 100 : 0

  return {
    scenario: scenario.name,
    inputs: scenario.inputs,
    days: results,
    breakEvenDay,
    totalRevenue,
    totalExpenses,
    totalProfit,
    averageDailyProfit,
    roi,
  }
}

/**
 * Validate simulation result against targets
 */
export function validateResult(result: SimulationResult): {
  passed: boolean;
  message: string;
} {
  const scenarioKey = result.scenario.toLowerCase() as keyof ValidationTargets
  const target = targets[scenarioKey]

  if (!target) {
    return { passed: true, message: 'No validation target for scenario' }
  }

  if (result.scenario.toLowerCase() === 'optimistic') {
    const passed = result.roi >= target.roi
    return {
      passed,
      message: passed
        ? `✅ ROI ${result.roi.toFixed(1)}% exceeds target ${target.roi}%`
        : `❌ ROI ${result.roi.toFixed(1)}% below target ${target.roi}%`,
    }
  } else {
    const breakEven = result.breakEvenDay || Infinity
    const passed = breakEven <= target.breakEvenDay
    return {
      passed,
      message: passed
        ? `✅ Break-even day ${breakEven} meets target (≤${target.breakEvenDay})`
        : `❌ Break-even day ${breakEven} exceeds target (≤${target.breakEvenDay})`,
    }
  }
}

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Generate markdown sustainability report
 */
export function generateReport(result: SimulationResult): string {
  const revenue = calculateDailyRevenue(result.inputs)
  const expenses = calculateDailyExpenses(result.inputs)
  const validation = validateResult(result)

  return `
# 30-Day Sustainability Report

**Scenario:** ${result.scenario}
- Followers: ${result.inputs.followers} (earning from)
- Follows: ${result.inputs.follows} (paying for)
- Subscription Price: ${result.inputs.subscriptionPriceMsats} msats/hour

---

## Revenue Breakdown

| Source | Daily | Monthly (30 days) |
|--------|-------|-------------------|
| Subscriptions | $${revenue.subscriptionRevenue.toFixed(2)} | $${(revenue.subscriptionRevenue * 30).toFixed(2)} |
| Routing Fees | $${revenue.routingRevenue.toFixed(2)} | $${(revenue.routingRevenue * 30).toFixed(2)} |
| **Total** | **$${revenue.total.toFixed(2)}** | **$${(revenue.total * 30).toFixed(2)}** |

---

## Expense Breakdown

| Item | Daily | Monthly (30 days) |
|------|-------|-------------------|
| Akash Hosting | $${expenses.akashCost.toFixed(2)} | $${(expenses.akashCost * 30).toFixed(2)} |
| Gas Fees (Base L2) | $${expenses.gasCost.toFixed(2)} | $${(expenses.gasCost * 30).toFixed(2)} |
| Subscription Costs | $${expenses.subscriptionExpense.toFixed(2)} | $${(expenses.subscriptionExpense * 30).toFixed(2)} |
| **Total** | **$${expenses.total.toFixed(2)}** | **$${(expenses.total * 30).toFixed(2)}** |

---

## Profitability Analysis

| Metric | Value |
|--------|-------|
| Daily Profit | $${result.averageDailyProfit.toFixed(2)} |
| Monthly Profit (30 days) | $${result.totalProfit.toFixed(2)} |
| Break-Even Day | ${result.breakEvenDay !== null ? `Day ${result.breakEvenDay} ✅` : 'Not reached ❌'} |
| ROI (30 days) | ${result.roi.toFixed(1)}% |
| Annual ROI (projected) | ${(result.roi * 12).toFixed(1)}% |

---

## Validation

${validation.message}

---

## Conclusion

${
  validation.passed
    ? `This scenario **PASSES** sustainability validation. The node is economically viable with ${result.inputs.followers} followers and ${result.inputs.follows} follows.`
    : 'This scenario **FAILS** sustainability validation. Consider: 1) Increasing followers, 2) Reducing hosting costs, or 3) Adjusting subscription pricing.'
}

**Recommendation:** ${
  result.totalProfit > 100
    ? 'Strong profitability. Consider scaling to more users.'
    : result.totalProfit > 0
    ? 'Profitable but tight margins. Monitor closely.'
    : 'Unprofitable. Adjust network size or pricing.'
}
`
}

/**
 * Save report to file
 */
export async function saveReport(
  result: SimulationResult,
  outputDir: string = 'reports'
): Promise<string> {
  const { promises: fs } = await import('fs')
  const path = await import('path')

  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `sustainability-${result.scenario.toLowerCase()}-${timestamp}.md`
  const filepath = path.join(outputDir, filename)

  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(filepath, generateReport(result))

  return filepath
}

// ============================================================================
// Real Node Comparison
// ============================================================================

/**
 * Compare simulation to real node performance
 * @param simulationResult Simulated 30-day results
 */
export async function compareToRealNode(
  simulationResult: SimulationResult
): Promise<void> {
  try {
    // Fetch real metrics from dashboard API
    const response = await fetch('http://localhost:3000/dashboard/economics')
    if (!response.ok) {
      console.warn('⚠️  Could not fetch real node metrics. Skipping comparison.')
      return
    }

    const realMetrics = await response.json()

    console.log('\n## Real Node Comparison\n')
    console.log('| Metric | Simulated | Actual | Variance |')
    console.log('|--------|-----------|--------|----------|')

    // Compare monthly revenue
    const simMonthlyRevenue = simulationResult.totalRevenue
    const realMonthlyRevenue = realMetrics.this_month.revenue_usd
    const revenueVariance = ((realMonthlyRevenue - simMonthlyRevenue) / simMonthlyRevenue * 100).toFixed(1)

    console.log(`| Monthly Revenue | $${simMonthlyRevenue.toFixed(2)} | $${realMonthlyRevenue.toFixed(2)} | ${revenueVariance}% |`)

    // Compare monthly expenses
    const simMonthlyExpenses = simulationResult.totalExpenses
    const realMonthlyExpenses = realMetrics.this_month.expenses_usd
    const expenseVariance = ((realMonthlyExpenses - simMonthlyExpenses) / simMonthlyExpenses * 100).toFixed(1)

    console.log(`| Monthly Expenses | $${simMonthlyExpenses.toFixed(2)} | $${realMonthlyExpenses.toFixed(2)} | ${expenseVariance}% |`)

    // Compare profitability
    const simProfit = simulationResult.totalProfit
    const realProfit = realMetrics.this_month.profit_usd
    const profitVariance = simProfit !== 0 ? ((realProfit - simProfit) / simProfit * 100).toFixed(1) : 'N/A'

    console.log(`| Monthly Profit | $${simProfit.toFixed(2)} | $${realProfit.toFixed(2)} | ${profitVariance}% |`)

    console.log('\n**Analysis:**')
    if (Math.abs(parseFloat(revenueVariance)) < 20) {
      console.log('✅ Revenue simulation is accurate (within 20% variance)')
    } else {
      console.log(`⚠️  Revenue variance is high (${revenueVariance}%). Consider adjusting assumptions.`)
    }

    if (realProfit > 0 && simProfit > 0) {
      console.log('✅ Both simulation and real node are profitable')
    } else if (realProfit <= 0) {
      console.log('⚠️  Real node is not profitable. Review pricing or costs.')
    }

  } catch (error) {
    console.warn('⚠️  Error comparing to real node:', (error as Error).message)
  }
}

/**
 * Validate simulation assumptions
 */
export function validateAssumptions(result: SimulationResult): void {
  console.log('\n## Assumption Validation\n')

  const revenue = calculateDailyRevenue(result.inputs)
  const expenses = calculateDailyExpenses(result.inputs)

  console.log('**Revenue Assumptions:**')
  console.log(`- Subscription price: ${result.inputs.subscriptionPriceMsats} msats/hour`)
  console.log('- BTC/USD rate: $45,000 (assumed)')
  console.log('- Followers actively paying: 100% (optimistic)')
  console.log('- Hours subscribed per day: 24 (maximum)')

  console.log('\n**Expense Assumptions:**')
  console.log(`- Akash cost: $${result.inputs.akashCostMonthlyUsd}/month`)
  console.log(`- Gas per settlement: $${result.inputs.gasCostPerSettlement}`)
  console.log(`- Settlements per day: ${result.inputs.settlementsPerDay}`)

  console.log('\n**Routing Fee Assumptions:**')
  console.log(`- Network size: ${result.inputs.followers + result.inputs.follows} users`)
  console.log('- Routed payments: 50% of network')
  console.log('- Average payment: $0.01')
  console.log(`- Fee percentage: ${result.inputs.routingFeePercentage}%`)

  console.log('\n**Recommendations:**')
  if (revenue.subscriptionRevenue < 1.0) {
    console.log('⚠️  Subscription revenue is low. Consider increasing followers or price.')
  }
  if (expenses.subscriptionExpense > revenue.subscriptionRevenue * 0.5) {
    console.log('⚠️  Subscription expenses are high (>50% of revenue). Reduce follows or negotiate lower prices.')
  }
  if (result.totalProfit < 10) {
    console.log('⚠️  Profit margin is thin (<$10/month). Target 100+ followers for sustainability.')
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('   30-Day Self-Sustainability Validation')
  console.log('='.repeat(60))
  console.log()

  const scenarioArg = process.argv[2]?.toLowerCase() || 'all'

  const scenariosToRun = scenarioArg === 'all'
    ? scenarios
    : scenarios.filter(s => s.name.toLowerCase() === scenarioArg)

  if (scenariosToRun.length === 0) {
    console.error(`❌ Unknown scenario: ${scenarioArg}`)
    console.log('Available scenarios: pessimistic, base, optimistic, all')
    process.exit(1)
  }

  for (const scenario of scenariosToRun) {
    console.log(`\n## Running Scenario: ${scenario.name}\n`)
    console.log(`${scenario.description}\n`)

    // Run simulation
    const result = runSimulation(scenario)

    // Generate report
    const report = generateReport(result)
    console.log(report)

    // Save report to file
    const filepath = await saveReport(result)
    console.log(`\n📄 Report saved to: ${filepath}`)

    // Validate assumptions
    validateAssumptions(result)

    // Compare to real node (if available)
    if (scenarioArg !== 'all') {
      await compareToRealNode(result)
    }

    console.log('\n' + '='.repeat(60) + '\n')
  }

  console.log('✅ Validation complete!\n')
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
}
