/**
 * Chart Data Formatter Utility
 * Transforms economics metrics and snapshots into Chart.js data formats
 *
 * Reference: docs/stories/9.5.story.md#Task 1
 */

/**
 * Color scheme for charts (dark mode compatible)
 */
const CHART_COLORS = {
  revenue: 'rgb(75, 192, 192)',
  revenueLight: 'rgba(75, 192, 192, 0.2)',
  expenses: 'rgb(255, 99, 132)',
  expensesLight: 'rgba(255, 99, 132, 0.2)',
  profitPositive: 'rgb(34, 197, 94)', // green
  profitNegative: 'rgb(239, 68, 68)', // red
  subscriptions: 'rgb(59, 130, 246)', // blue
  routing: 'rgb(34, 197, 94)', // green
  content: 'rgb(168, 85, 247)', // purple
  akash: 'rgb(239, 68, 68)', // red
  gasFees: 'rgb(249, 115, 22)', // orange
  other: 'rgb(234, 179, 8)', // yellow
}

/**
 * Format revenue and expense data for dual-line chart
 * @param {Array<Object>} snapshots - Array of snapshot objects from API
 * @returns {Object} Chart.js dataset object
 */
export function formatRevenueExpenseChart(snapshots) {
  if (!snapshots || snapshots.length === 0) {
    console.warn('formatRevenueExpenseChart: Empty snapshots array')
    return {
      labels: [],
      datasets: [
        {
          label: 'Revenue (USD)',
          data: [],
          borderColor: CHART_COLORS.revenue,
          backgroundColor: CHART_COLORS.revenueLight,
          fill: true,
          tension: 0.4,
        },
        {
          label: 'Expenses (USD)',
          data: [],
          borderColor: CHART_COLORS.expenses,
          backgroundColor: CHART_COLORS.expensesLight,
          fill: true,
          tension: 0.4,
        },
      ],
    }
  }

  // Format labels as MM/DD
  const labels = snapshots.map((s) => {
    const date = new Date(s.timestamp)
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`
  })

  // Extract revenue and expense data
  const revenueData = snapshots.map((s) => s.revenue_usd)
  const expensesData = snapshots.map((s) => s.expenses_usd)

  return {
    labels,
    datasets: [
      {
        label: 'Revenue (USD)',
        data: revenueData,
        borderColor: CHART_COLORS.revenue,
        backgroundColor: CHART_COLORS.revenueLight,
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Expenses (USD)',
        data: expensesData,
        borderColor: CHART_COLORS.expenses,
        backgroundColor: CHART_COLORS.expensesLight,
        fill: true,
        tension: 0.4,
      },
    ],
  }
}

/**
 * Format profitability percentage data for line chart
 * @param {Array<Object>} snapshots - Array of snapshot objects from API
 * @returns {Object} Chart.js dataset object
 */
export function formatProfitabilityChart(snapshots) {
  if (!snapshots || snapshots.length === 0) {
    console.warn('formatProfitabilityChart: Empty snapshots array')
    return {
      labels: [],
      datasets: [
        {
          label: 'Profitability (%)',
          data: [],
          borderColor: CHART_COLORS.profitPositive,
          backgroundColor: 'rgba(34, 197, 94, 0.2)',
          fill: true,
          tension: 0.4,
        },
      ],
    }
  }

  // Format labels as MM/DD
  const labels = snapshots.map((s) => {
    const date = new Date(s.timestamp)
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`
  })

  // Calculate profitability percentage for each snapshot
  const profitabilityData = snapshots.map((s) => {
    if (s.revenue_usd === 0) return '0.00'
    return ((s.net_profit_usd / s.revenue_usd) * 100).toFixed(2)
  })

  // Determine color based on overall profitability
  const avgProfitability = profitabilityData.reduce((sum, val) => sum + parseFloat(val), 0) / profitabilityData.length
  const lineColor = avgProfitability >= 0 ? CHART_COLORS.profitPositive : CHART_COLORS.profitNegative

  return {
    labels,
    datasets: [
      {
        label: 'Profitability (%)',
        data: profitabilityData,
        borderColor: lineColor,
        backgroundColor: avgProfitability >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
        fill: true,
        tension: 0.4,
        segment: {
          // Color each segment based on whether it's above or below 0
          borderColor: (ctx) => {
            const value = ctx.p1.parsed.y
            return value >= 0 ? CHART_COLORS.profitPositive : CHART_COLORS.profitNegative
          },
        },
      },
    ],
  }
}

/**
 * Format revenue breakdown for pie chart
 * @param {Object} metrics - EconomicsMetrics object from /economics API
 * @returns {Object} Chart.js dataset object
 */
export function formatRevenueBreakdownChart(metrics) {
  if (!metrics || !metrics.revenue_breakdown) {
    console.warn('formatRevenueBreakdownChart: Invalid metrics object')
    return {
      labels: [],
      datasets: [
        {
          data: [],
          backgroundColor: [],
        },
      ],
    }
  }

  const breakdown = metrics.revenue_breakdown

  // Handle case where all revenue is 0
  if (breakdown.subscriptions_usd === 0 && breakdown.routing_usd === 0 && breakdown.content_usd === 0) {
    return {
      labels: ['No Revenue'],
      datasets: [
        {
          data: [1],
          backgroundColor: ['rgb(75, 85, 99)'], // gray
        },
      ],
    }
  }

  return {
    labels: ['Subscriptions', 'Routing', 'Content'],
    datasets: [
      {
        data: [
          breakdown.subscriptions_usd,
          breakdown.routing_usd,
          breakdown.content_usd,
        ],
        backgroundColor: [
          CHART_COLORS.subscriptions,
          CHART_COLORS.routing,
          CHART_COLORS.content,
        ],
      },
    ],
  }
}

/**
 * Format expense breakdown for pie chart
 * @param {Object} metrics - EconomicsMetrics object from /economics API
 * @returns {Object} Chart.js dataset object
 */
export function formatExpenseBreakdownChart(metrics) {
  if (!metrics || !metrics.expense_breakdown) {
    console.warn('formatExpenseBreakdownChart: Invalid metrics object')
    return {
      labels: [],
      datasets: [
        {
          data: [],
          backgroundColor: [],
        },
      ],
    }
  }

  const breakdown = metrics.expense_breakdown

  // Handle case where all expenses are 0
  if (breakdown.akash_cost_usd === 0 && breakdown.gas_fees_usd === 0 && breakdown.other_usd === 0) {
    return {
      labels: ['No Expenses'],
      datasets: [
        {
          data: [1],
          backgroundColor: ['rgb(75, 85, 99)'], // gray
        },
      ],
    }
  }

  return {
    labels: ['Akash Cost', 'Gas Fees', 'Other'],
    datasets: [
      {
        data: [
          breakdown.akash_cost_usd,
          breakdown.gas_fees_usd,
          breakdown.other_usd,
        ],
        backgroundColor: [
          CHART_COLORS.akash,
          CHART_COLORS.gasFees,
          CHART_COLORS.other,
        ],
      },
    ],
  }
}

/**
 * Get chart options for revenue/expense chart
 * @returns {Object} Chart.js options object
 */
export function getRevenueExpenseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: 'rgb(229, 231, 235)', // text-gray-200
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: function (context) {
            let label = context.dataset.label || ''
            if (label) {
              label += ': '
            }
            if (context.parsed.y !== null) {
              label += '$' + context.parsed.y.toFixed(2)
            }
            return label
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          color: 'rgb(156, 163, 175)', // text-gray-400
          callback: function (value) {
            return '$' + value.toFixed(0)
          },
        },
        grid: {
          color: 'rgba(75, 85, 99, 0.3)', // gray-600 with opacity
        },
      },
      x: {
        ticks: {
          color: 'rgb(156, 163, 175)', // text-gray-400
        },
        grid: {
          color: 'rgba(75, 85, 99, 0.3)',
        },
      },
    },
  }
}

/**
 * Get chart options for profitability chart
 * @returns {Object} Chart.js options object
 */
export function getProfitabilityChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: 'rgb(229, 231, 235)', // text-gray-200
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: function (context) {
            let label = context.dataset.label || ''
            if (label) {
              label += ': '
            }
            if (context.parsed.y !== null) {
              label += context.parsed.y + '%'
            }
            return label
          },
        },
      },
      annotation: {
        annotations: {
          breakEvenLine: {
            type: 'line',
            yMin: 0,
            yMax: 0,
            borderColor: 'rgb(156, 163, 175)', // gray
            borderWidth: 2,
            borderDash: [5, 5],
            label: {
              content: 'Break-even',
              enabled: true,
              position: 'end',
              color: 'rgb(229, 231, 235)',
            },
          },
        },
      },
    },
    scales: {
      y: {
        ticks: {
          color: 'rgb(156, 163, 175)', // text-gray-400
          callback: function (value) {
            return value + '%'
          },
        },
        grid: {
          color: 'rgba(75, 85, 99, 0.3)',
        },
      },
      x: {
        ticks: {
          color: 'rgb(156, 163, 175)',
        },
        grid: {
          color: 'rgba(75, 85, 99, 0.3)',
        },
      },
    },
  }
}

/**
 * Get chart options for pie charts
 * @returns {Object} Chart.js options object
 */
export function getPieChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          color: 'rgb(229, 231, 235)', // text-gray-200
        },
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            const label = context.label || ''
            const value = context.parsed
            const total = context.dataset.data.reduce((a, b) => a + b, 0)
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0
            return `${label}: $${value.toFixed(2)} (${percentage}%)`
          },
        },
      },
    },
  }
}
