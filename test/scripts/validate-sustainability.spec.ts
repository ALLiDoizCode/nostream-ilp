import {
  calculateAkashCost,
  calculateDailyExpenses,
  calculateDailyRevenue,
  calculateGasCost,
  calculateRoutingRevenue,
  calculateSubscriptionExpense,
  calculateSubscriptionRevenue,
  runSimulation,
  scenarios,
  type SimulationInputs,
  validateResult,
} from '../../scripts/validate-sustainability'
import { describe, expect, it } from 'vitest'

describe('Revenue Calculations', () => {
  it('should calculate subscription revenue correctly', () => {
    // 50 followers × 5000 msats/hour × 24 hours = 6,000,000 msats/day
    // = 6,000 sats/day = 0.00006 BTC/day
    // @ $45,000/BTC = $2.70/day
    const revenue = calculateSubscriptionRevenue(50, 5000)
    expect(revenue).toBeCloseTo(2.70, 2)
  })

  it('should calculate routing revenue correctly', () => {
    const revenue = calculateRoutingRevenue(30, 50, 0.01)
    expect(revenue).toBeGreaterThan(0)
    expect(revenue).toBeLessThan(1.0) // Routing is secondary revenue
  })

  it('should sum revenue sources correctly', () => {
    const inputs: SimulationInputs = {
      followers: 50,
      follows: 30,
      subscriptionPriceMsats: 5000,
      akashCostMonthlyUsd: 5,
      routingFeePercentage: 1,
      gasCostPerSettlement: 0.02,
      settlementsPerDay: 2,
    }

    const revenue = calculateDailyRevenue(inputs)
    expect(revenue.total).toBe(revenue.subscriptionRevenue + revenue.routingRevenue)
    expect(revenue.total).toBeGreaterThan(2.5)
  })
})

describe('Expense Calculations', () => {
  it('should calculate Akash cost correctly', () => {
    const cost = calculateAkashCost(5.00)
    expect(cost).toBeCloseTo(0.167, 3) // $5 / 30 days
  })

  it('should calculate gas cost correctly', () => {
    const cost = calculateGasCost(0.02, 2)
    expect(cost).toBe(0.04) // 2 settlements × $0.02
  })

  it('should calculate subscription expense correctly', () => {
    // 30 follows × 5000 msats/hour × 24 hours
    const expense = calculateSubscriptionExpense(30, 5000)
    expect(expense).toBeCloseTo(1.62, 2)
  })

  it('should sum expenses correctly', () => {
    const inputs: SimulationInputs = {
      followers: 50,
      follows: 30,
      subscriptionPriceMsats: 5000,
      akashCostMonthlyUsd: 5,
      routingFeePercentage: 1,
      gasCostPerSettlement: 0.02,
      settlementsPerDay: 2,
    }

    const expenses = calculateDailyExpenses(inputs)
    expect(expenses.total).toBe(
      expenses.akashCost + expenses.gasCost + expenses.subscriptionExpense
    )
  })
})

describe('Simulation Logic', () => {
  it('should run 30-day base scenario simulation', () => {
    const baseScenario = scenarios.find(s => s.name === 'Base')!
    const result = runSimulation(baseScenario, 30)

    expect(result.days).toHaveLength(30)
    expect(result.totalProfit).toBeGreaterThan(0)
    expect(result.breakEvenDay).not.toBeNull()
    expect(result.breakEvenDay!).toBeLessThanOrEqual(15) // AC: Base profitable by day 15
  })

  it('should detect break-even day correctly', () => {
    const pessimisticScenario = scenarios.find(s => s.name === 'Pessimistic')!
    const result = runSimulation(pessimisticScenario, 30)

    expect(result.breakEvenDay).not.toBeNull()
    expect(result.breakEvenDay!).toBeLessThanOrEqual(30) // AC: Pessimistic break-even by day 30
  })

  it('should calculate ROI correctly', () => {
    const optimisticScenario = scenarios.find(s => s.name === 'Optimistic')!
    const result = runSimulation(optimisticScenario, 30)

    expect(result.roi).toBeGreaterThan(300) // AC: Optimistic 300%+ ROI
  })

  it('should track cumulative profit correctly', () => {
    const baseScenario = scenarios.find(s => s.name === 'Base')!
    const result = runSimulation(baseScenario, 30)

    // Cumulative profit should increase monotonically (or stay same if daily profit = 0)
    for (let i = 1; i < result.days.length; i++) {
      const prevCumulative = result.days[i - 1].cumulativeProfit
      const currentCumulative = result.days[i].cumulativeProfit
      expect(currentCumulative).toBeGreaterThanOrEqual(prevCumulative)
    }
  })

  it('should calculate daily profit as revenue minus expenses', () => {
    const baseScenario = scenarios.find(s => s.name === 'Base')!
    const result = runSimulation(baseScenario, 30)

    result.days.forEach(day => {
      expect(day.profit).toBeCloseTo(day.revenue - day.expenses, 10)
    })
  })
})

describe('Validation Logic', () => {
  it('should validate base scenario passes', () => {
    const baseScenario = scenarios.find(s => s.name === 'Base')!
    const result = runSimulation(baseScenario, 30)
    const validation = validateResult(result)

    expect(validation.passed).toBe(true)
    expect(validation.message).toContain('✅')
  })

  it('should validate optimistic ROI target', () => {
    const optimisticScenario = scenarios.find(s => s.name === 'Optimistic')!
    const result = runSimulation(optimisticScenario, 30)
    const validation = validateResult(result)

    expect(validation.passed).toBe(true)
    expect(validation.message).toContain('ROI')
  })

  it('should validate pessimistic break-even target', () => {
    const pessimisticScenario = scenarios.find(s => s.name === 'Pessimistic')!
    const result = runSimulation(pessimisticScenario, 30)
    const validation = validateResult(result)

    expect(validation.passed).toBe(true)
    expect(validation.message).toContain('Break-even')
  })
})
