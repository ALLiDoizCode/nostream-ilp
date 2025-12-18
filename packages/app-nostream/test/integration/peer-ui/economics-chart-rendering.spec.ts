/**
 * Economics Dashboard Chart Rendering Integration Tests
 * Tests chart rendering with mock data
 *
 * Reference: docs/stories/9.5.story.md#Task 8 - Integration Test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  formatRevenueExpenseChart,
  formatProfitabilityChart,
  formatRevenueBreakdownChart,
  formatExpenseBreakdownChart,
} from '../../../src/peer-ui/static/utils/chart-data-formatter.js'

describe('Economics Dashboard Chart Rendering', () => {
  let mockSnapshots: any[]
  let mockMetrics: any

  beforeEach(() => {
    // Mock snapshot data (simulating API response from /economics/snapshots)
    mockSnapshots = [
      {
        timestamp: '2025-12-01T00:00:00Z',
        revenue_usd: 100.0,
        expenses_usd: 70.0,
        net_profit_usd: 30.0,
        subscription_revenue_usd: 50.0,
        routing_revenue_usd: 30.0,
        content_revenue_usd: 20.0,
      },
      {
        timestamp: '2025-12-02T00:00:00Z',
        revenue_usd: 120.0,
        expenses_usd: 80.0,
        net_profit_usd: 40.0,
        subscription_revenue_usd: 60.0,
        routing_revenue_usd: 40.0,
        content_revenue_usd: 20.0,
      },
      {
        timestamp: '2025-12-03T00:00:00Z',
        revenue_usd: 90.0,
        expenses_usd: 100.0,
        net_profit_usd: -10.0,
        subscription_revenue_usd: 40.0,
        routing_revenue_usd: 30.0,
        content_revenue_usd: 20.0,
      },
    ]

    // Mock economics metrics (simulating API response from /economics)
    mockMetrics = {
      timestamp: '2025-12-15T12:00:00Z',
      status: 'profitable',
      today: {
        revenue_usd: 125.5,
        expenses_usd: 85.0,
        profit_usd: 40.5,
      },
      this_month: {
        revenue_usd: 3500.0,
        expenses_usd: 2400.0,
        profit_usd: 1100.0,
        profitability_percentage: 31.43,
      },
      all_time: {
        total_revenue_usd: 12500.0,
        total_expenses_usd: 9500.0,
        net_profit_usd: 3000.0,
      },
      revenue_breakdown: {
        subscriptions_usd: 2000.0,
        routing_usd: 1000.0,
        content_usd: 500.0,
      },
      expense_breakdown: {
        akash_cost_usd: 2000.0,
        gas_fees_usd: 350.0,
        other_usd: 50.0,
      },
      balances: {
        eth_balance: '1500000000000000000',
        usdc_balance: '2500000000',
        akt_wallet_balance: '5000000',
        akt_escrow_balance: '10000000',
        days_hosting_remaining: 45,
      },
    }
  })

  describe('Revenue/Expense Chart Integration', () => {
    it('should render chart with valid snapshot data', () => {
      const chartData = formatRevenueExpenseChart(mockSnapshots)

      expect(chartData.labels).toHaveLength(3)
      expect(chartData.datasets).toHaveLength(2)
      expect(chartData.datasets[0].label).toBe('Revenue (USD)')
      expect(chartData.datasets[1].label).toBe('Expenses (USD)')
    })

    it('should handle empty data gracefully', () => {
      const chartData = formatRevenueExpenseChart([])

      expect(chartData.labels).toHaveLength(0)
      expect(chartData.datasets[0].data).toHaveLength(0)
    })

    it('should format dates correctly', () => {
      const chartData = formatRevenueExpenseChart(mockSnapshots)

      expect(chartData.labels[0]).toBe('12/01')
      expect(chartData.labels[1]).toBe('12/02')
      expect(chartData.labels[2]).toBe('12/03')
    })
  })

  describe('Profitability Chart Integration', () => {
    it('should render chart with profitability percentages', () => {
      const chartData = formatProfitabilityChart(mockSnapshots)

      expect(chartData.labels).toHaveLength(3)
      expect(chartData.datasets).toHaveLength(1)
      expect(chartData.datasets[0].data).toContain('30.00')
      expect(chartData.datasets[0].data).toContain('33.33')
      expect(chartData.datasets[0].data).toContain('-11.11')
    })

    it('should use correct color for positive profitability', () => {
      const chartData = formatProfitabilityChart(mockSnapshots)

      // Average is positive, should be green
      expect(chartData.datasets[0].borderColor).toBe('rgb(34, 197, 94)')
    })

    it('should use correct color for negative profitability', () => {
      const negativeSnapshots = [
        {
          timestamp: '2025-12-01T00:00:00Z',
          revenue_usd: 100,
          expenses_usd: 120,
          net_profit_usd: -20,
        },
        {
          timestamp: '2025-12-02T00:00:00Z',
          revenue_usd: 100,
          expenses_usd: 130,
          net_profit_usd: -30,
        },
      ]

      const chartData = formatProfitabilityChart(negativeSnapshots)

      // Average is negative, should be red
      expect(chartData.datasets[0].borderColor).toBe('rgb(239, 68, 68)')
    })
  })

  describe('Revenue Breakdown Chart Integration', () => {
    it('should render pie chart with revenue breakdown', () => {
      const chartData = formatRevenueBreakdownChart(mockMetrics)

      expect(chartData.labels).toEqual(['Subscriptions', 'Routing', 'Content'])
      expect(chartData.datasets[0].data).toEqual([2000.0, 1000.0, 500.0])
      expect(chartData.datasets[0].backgroundColor).toHaveLength(3)
    })

    it('should handle zero revenue', () => {
      const zeroMetrics = {
        ...mockMetrics,
        revenue_breakdown: {
          subscriptions_usd: 0,
          routing_usd: 0,
          content_usd: 0,
        },
      }

      const chartData = formatRevenueBreakdownChart(zeroMetrics)

      expect(chartData.labels).toEqual(['No Revenue'])
      expect(chartData.datasets[0].data).toEqual([1])
    })
  })

  describe('Expense Breakdown Chart Integration', () => {
    it('should render pie chart with expense breakdown', () => {
      const chartData = formatExpenseBreakdownChart(mockMetrics)

      expect(chartData.labels).toEqual(['Akash Cost', 'Gas Fees', 'Other'])
      expect(chartData.datasets[0].data).toEqual([2000.0, 350.0, 50.0])
      expect(chartData.datasets[0].backgroundColor).toHaveLength(3)
    })

    it('should handle zero expenses', () => {
      const zeroMetrics = {
        ...mockMetrics,
        expense_breakdown: {
          akash_cost_usd: 0,
          gas_fees_usd: 0,
          other_usd: 0,
        },
      }

      const chartData = formatExpenseBreakdownChart(zeroMetrics)

      expect(chartData.labels).toEqual(['No Expenses'])
      expect(chartData.datasets[0].data).toEqual([1])
    })
  })

  describe('Full Dashboard Rendering Flow', () => {
    it('should handle complete data flow', () => {
      // Simulate receiving API data and rendering all charts
      const revenueExpenseData = formatRevenueExpenseChart(mockSnapshots)
      const profitabilityData = formatProfitabilityChart(mockSnapshots)
      const revenueBreakdownData = formatRevenueBreakdownChart(mockMetrics)
      const expenseBreakdownData = formatExpenseBreakdownChart(mockMetrics)

      // Verify all charts have valid data
      expect(revenueExpenseData.labels).toHaveLength(3)
      expect(profitabilityData.labels).toHaveLength(3)
      expect(revenueBreakdownData.labels).toHaveLength(3)
      expect(expenseBreakdownData.labels).toHaveLength(3)

      // Verify data integrity
      expect(revenueExpenseData.datasets[0].data).toEqual([100, 120, 90])
      expect(revenueExpenseData.datasets[1].data).toEqual([70, 80, 100])
      expect(revenueBreakdownData.datasets[0].data).toEqual([2000, 1000, 500])
      expect(expenseBreakdownData.datasets[0].data).toEqual([2000, 350, 50])
    })

    it('should handle partial data', () => {
      // Test with only 1 snapshot
      const singleSnapshot = [mockSnapshots[0]]

      const revenueExpenseData = formatRevenueExpenseChart(singleSnapshot)
      const profitabilityData = formatProfitabilityChart(singleSnapshot)

      expect(revenueExpenseData.labels).toHaveLength(1)
      expect(profitabilityData.labels).toHaveLength(1)
    })
  })
})
