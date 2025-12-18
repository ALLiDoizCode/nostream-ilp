/**
 * Chart Data Formatter Unit Tests
 * Tests data transformation for Chart.js formats
 *
 * Reference: docs/stories/9.5.story.md#Task 1 - Unit Test
 */

import { describe, it, expect, beforeEach } from 'vitest'

// Import the formatter functions
import {
  formatRevenueExpenseChart,
  formatProfitabilityChart,
  formatRevenueBreakdownChart,
  formatExpenseBreakdownChart,
  getRevenueExpenseChartOptions,
  getProfitabilityChartOptions,
  getPieChartOptions,
} from '../../../src/peer-ui/static/utils/chart-data-formatter.js'

describe('Chart Data Formatter', () => {
  let mockSnapshots: any[]
  let mockMetrics: any

  beforeEach(() => {
    // Mock snapshot data (from /economics/snapshots API)
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

    // Mock economics metrics (from /economics API)
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

  describe('formatRevenueExpenseChart', () => {
    it('should transform snapshots to Chart.js format', () => {
      const result = formatRevenueExpenseChart(mockSnapshots)

      expect(result.labels).toHaveLength(3)
      expect(result.labels[0]).toBe('12/01')
      expect(result.labels[1]).toBe('12/02')
      expect(result.labels[2]).toBe('12/03')

      expect(result.datasets).toHaveLength(2)
      expect(result.datasets[0].label).toBe('Revenue (USD)')
      expect(result.datasets[0].data).toEqual([100.0, 120.0, 90.0])
      expect(result.datasets[1].label).toBe('Expenses (USD)')
      expect(result.datasets[1].data).toEqual([70.0, 80.0, 100.0])
    })

    it('should handle empty snapshots array', () => {
      const result = formatRevenueExpenseChart([])

      expect(result.labels).toHaveLength(0)
      expect(result.datasets).toHaveLength(2)
      expect(result.datasets[0].data).toHaveLength(0)
      expect(result.datasets[1].data).toHaveLength(0)
    })

    it('should handle null snapshots', () => {
      const result = formatRevenueExpenseChart(null as any)

      expect(result.labels).toHaveLength(0)
      expect(result.datasets).toHaveLength(2)
    })

    it('should format labels as MM/DD', () => {
      const snapshots = [
        { timestamp: '2025-01-05T00:00:00Z', revenue_usd: 100, expenses_usd: 50, net_profit_usd: 50 },
        { timestamp: '2025-12-25T00:00:00Z', revenue_usd: 200, expenses_usd: 100, net_profit_usd: 100 },
      ]

      const result = formatRevenueExpenseChart(snapshots)

      expect(result.labels[0]).toBe('01/05')
      expect(result.labels[1]).toBe('12/25')
    })
  })

  describe('formatProfitabilityChart', () => {
    it('should calculate profitability percentage', () => {
      const result = formatProfitabilityChart(mockSnapshots)

      expect(result.labels).toHaveLength(3)
      expect(result.datasets).toHaveLength(1)
      expect(result.datasets[0].label).toBe('Profitability (%)')

      // Profitability = (net_profit / revenue) * 100
      // Snapshot 1: (30 / 100) * 100 = 30.00%
      // Snapshot 2: (40 / 120) * 100 = 33.33%
      // Snapshot 3: (-10 / 90) * 100 = -11.11%
      expect(result.datasets[0].data[0]).toBe('30.00')
      expect(result.datasets[0].data[1]).toBe('33.33')
      expect(result.datasets[0].data[2]).toBe('-11.11')
    })

    it('should handle zero revenue', () => {
      const snapshots = [
        { timestamp: '2025-12-01T00:00:00Z', revenue_usd: 0, expenses_usd: 50, net_profit_usd: -50 },
      ]

      const result = formatProfitabilityChart(snapshots)

      expect(result.datasets[0].data[0]).toBe('0.00')
    })

    it('should use positive color for positive average profitability', () => {
      const result = formatProfitabilityChart(mockSnapshots)

      // Average profitability: (30 + 33.33 - 11.11) / 3 = 17.41% (positive)
      expect(result.datasets[0].borderColor).toBe('rgb(34, 197, 94)') // green
    })

    it('should use negative color for negative average profitability', () => {
      const negativeSnapshots = [
        { timestamp: '2025-12-01T00:00:00Z', revenue_usd: 100, expenses_usd: 120, net_profit_usd: -20 },
        { timestamp: '2025-12-02T00:00:00Z', revenue_usd: 100, expenses_usd: 130, net_profit_usd: -30 },
      ]

      const result = formatProfitabilityChart(negativeSnapshots)

      expect(result.datasets[0].borderColor).toBe('rgb(239, 68, 68)') // red
    })

    it('should handle empty snapshots array', () => {
      const result = formatProfitabilityChart([])

      expect(result.labels).toHaveLength(0)
      expect(result.datasets).toHaveLength(1)
      expect(result.datasets[0].data).toHaveLength(0)
    })
  })

  describe('formatRevenueBreakdownChart', () => {
    it('should transform revenue breakdown to pie chart format', () => {
      const result = formatRevenueBreakdownChart(mockMetrics)

      expect(result.labels).toEqual(['Subscriptions', 'Routing', 'Content'])
      expect(result.datasets).toHaveLength(1)
      expect(result.datasets[0].data).toEqual([2000.0, 1000.0, 500.0])
      expect(result.datasets[0].backgroundColor).toHaveLength(3)
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

      const result = formatRevenueBreakdownChart(zeroMetrics)

      expect(result.labels).toEqual(['No Revenue'])
      expect(result.datasets[0].data).toEqual([1])
    })

    it('should handle invalid metrics object', () => {
      const result = formatRevenueBreakdownChart(null as any)

      expect(result.labels).toHaveLength(0)
      expect(result.datasets).toHaveLength(1)
      expect(result.datasets[0].data).toHaveLength(0)
    })

    it('should assign correct colors', () => {
      const result = formatRevenueBreakdownChart(mockMetrics)

      expect(result.datasets[0].backgroundColor[0]).toBe('rgb(59, 130, 246)') // subscriptions - blue
      expect(result.datasets[0].backgroundColor[1]).toBe('rgb(34, 197, 94)') // routing - green
      expect(result.datasets[0].backgroundColor[2]).toBe('rgb(168, 85, 247)') // content - purple
    })
  })

  describe('formatExpenseBreakdownChart', () => {
    it('should transform expense breakdown to pie chart format', () => {
      const result = formatExpenseBreakdownChart(mockMetrics)

      expect(result.labels).toEqual(['Akash Cost', 'Gas Fees', 'Other'])
      expect(result.datasets).toHaveLength(1)
      expect(result.datasets[0].data).toEqual([2000.0, 350.0, 50.0])
      expect(result.datasets[0].backgroundColor).toHaveLength(3)
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

      const result = formatExpenseBreakdownChart(zeroMetrics)

      expect(result.labels).toEqual(['No Expenses'])
      expect(result.datasets[0].data).toEqual([1])
    })

    it('should handle invalid metrics object', () => {
      const result = formatExpenseBreakdownChart(null as any)

      expect(result.labels).toHaveLength(0)
      expect(result.datasets).toHaveLength(1)
      expect(result.datasets[0].data).toHaveLength(0)
    })

    it('should assign correct colors', () => {
      const result = formatExpenseBreakdownChart(mockMetrics)

      expect(result.datasets[0].backgroundColor[0]).toBe('rgb(239, 68, 68)') // akash - red
      expect(result.datasets[0].backgroundColor[1]).toBe('rgb(249, 115, 22)') // gas fees - orange
      expect(result.datasets[0].backgroundColor[2]).toBe('rgb(234, 179, 8)') // other - yellow
    })
  })

  describe('Chart Options', () => {
    it('getRevenueExpenseChartOptions should return valid options', () => {
      const options = getRevenueExpenseChartOptions()

      expect(options.responsive).toBe(true)
      expect(options.maintainAspectRatio).toBe(false)
      expect(options.plugins.legend.display).toBe(true)
      expect(options.scales.y.beginAtZero).toBe(true)
    })

    it('getProfitabilityChartOptions should return valid options', () => {
      const options = getProfitabilityChartOptions()

      expect(options.responsive).toBe(true)
      expect(options.maintainAspectRatio).toBe(false)
      expect(options.plugins.legend.display).toBe(true)
    })

    it('getPieChartOptions should return valid options', () => {
      const options = getPieChartOptions()

      expect(options.responsive).toBe(true)
      expect(options.maintainAspectRatio).toBe(false)
      expect(options.plugins.legend.display).toBe(true)
      expect(options.plugins.legend.position).toBe('bottom')
    })

    it('should format currency in revenue/expense chart tooltips', () => {
      const options = getRevenueExpenseChartOptions()
      const callback = options.plugins.tooltip.callbacks.label

      const context = {
        dataset: { label: 'Revenue (USD)' },
        parsed: { y: 125.5 },
      }

      const result = callback(context as any)
      expect(result).toBe('Revenue (USD): $125.50')
    })

    it('should format percentage in profitability chart tooltips', () => {
      const options = getProfitabilityChartOptions()
      const callback = options.plugins.tooltip.callbacks.label

      const context = {
        dataset: { label: 'Profitability (%)' },
        parsed: { y: 32.5 },
      }

      const result = callback(context as any)
      expect(result).toBe('Profitability (%): 32.5%')
    })

    it('should format percentage in pie chart tooltips', () => {
      const options = getPieChartOptions()
      const callback = options.plugins.tooltip.callbacks.label

      const context = {
        label: 'Subscriptions',
        parsed: 2000,
        dataset: { data: [2000, 1000, 500] },
      }

      const result = callback(context as any)
      expect(result).toBe('Subscriptions: $2000.00 (57.1%)')
    })
  })
})
