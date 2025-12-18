/* eslint-env browser */
/* global Chart */
/**
 * Economics Dashboard Component
 * Displays revenue, expenses, profitability metrics, and charts
 *
 * Reference: docs/stories/9.5.story.md#Task 2
 */

// Import chart data formatter
import {
  formatRevenueExpenseChart,
  formatProfitabilityChart,
  formatRevenueBreakdownChart,
  formatExpenseBreakdownChart,
  getRevenueExpenseChartOptions,
  getProfitabilityChartOptions,
  getPieChartOptions,
} from '../utils/chart-data-formatter.js'

class EconomicsDashboard {
  constructor() {
    this.metrics = null
    this.snapshots = null
    this.isLoading = false
    this.pollingInterval = null
    this.lastUpdated = null
    this.selectedPeriod = '7d'

    // Chart instances
    this.revenueExpenseChart = null
    this.profitabilityChart = null
    this.revenueBreakdownChart = null
    this.expenseBreakdownChart = null

    // Bind methods
    this.loadMetrics = this.loadMetrics.bind(this)
    this.loadSnapshots = this.loadSnapshots.bind(this)
    this.renderStatusIndicator = this.renderStatusIndicator.bind(this)
    this.renderMetricsSummary = this.renderMetricsSummary.bind(this)
    this.renderBalances = this.renderBalances.bind(this)
    this.renderDaysRemaining = this.renderDaysRemaining.bind(this)
    this.updateCharts = this.updateCharts.bind(this)
    this.pollMetrics = this.pollMetrics.bind(this)
    this.onPeriodChange = this.onPeriodChange.bind(this)
  }

  /**
   * Initialize the economics dashboard
   * @param {string} statusId - ID of status indicator element
   * @param {string} todayId - ID of today metrics element
   * @param {string} monthId - ID of month metrics element
   * @param {string} alltimeId - ID of all-time metrics element
   * @param {string} balancesId - ID of balances element
   * @param {string} daysRemainingId - ID of days remaining element
   * @param {string} periodSelectorId - ID of period selector dropdown
   */
  async init(
    statusId,
    todayId,
    monthId,
    alltimeId,
    balancesId,
    daysRemainingId,
    periodSelectorId
  ) {
    this.statusElement = document.getElementById(statusId)
    this.todayElement = document.getElementById(todayId)
    this.monthElement = document.getElementById(monthId)
    this.alltimeElement = document.getElementById(alltimeId)
    this.balancesElement = document.getElementById(balancesId)
    this.daysRemainingElement = document.getElementById(daysRemainingId)
    this.periodSelector = document.getElementById(periodSelectorId)

    // Set up period selector event listener
    if (this.periodSelector) {
      this.periodSelector.addEventListener('change', this.onPeriodChange)
    }

    // Load initial data
    await this.loadMetrics()
    await this.loadSnapshots(this.selectedPeriod)

    // Initialize charts (after Chart.js is loaded)
    this.initializeCharts()

    // Start polling (every 30 seconds)
    this.startPolling()
  }

  /**
   * Start polling for metrics updates every 30 seconds
   */
  startPolling() {
    this.pollingInterval = setInterval(this.pollMetrics, 30000)
  }

  /**
   * Stop polling for metrics updates
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  /**
   * Poll for metrics updates
   */
  async pollMetrics() {
    if (this.isLoading) {
      return
    }

    await this.loadMetrics(true) // Silent reload
  }

  /**
   * Load economics metrics from API
   * @param {boolean} silent - If true, don't show loading indicator
   */
  async loadMetrics(silent = false) {
    if (this.isLoading) return

    this.isLoading = true

    if (!silent) {
      this.showLoading()
    }

    try {
      const response = await fetch('/economics')

      if (!response.ok) {
        throw new Error(`Failed to fetch economics metrics: ${response.status}`)
      }

      const data = await response.json()

      this.metrics = data
      this.lastUpdated = new Date()

      // Render UI
      this.renderStatusIndicator()
      this.renderMetricsSummary()
      this.renderBalances()
      this.renderDaysRemaining()

      // Update pie charts (they use current metrics, not historical snapshots)
      if (this.revenueBreakdownChart && this.expenseBreakdownChart) {
        this.updatePieCharts()
      }
    } catch (error) {
      console.error('Error loading economics metrics:', error)
      this.showError('Failed to load economics metrics')
    } finally {
      this.isLoading = false
      if (!silent) {
        this.hideLoading()
      }
    }
  }

  /**
   * Load economic snapshots for charts
   * @param {string} period - Time period ('7d', '30d', '90d')
   * @param {boolean} silent - If true, don't show loading indicator
   */
  async loadSnapshots(period, silent = false) {
    if (this.isLoading) return

    this.isLoading = true

    if (!silent) {
      this.showLoading()
    }

    try {
      const response = await fetch(`/economics/snapshots?period=${period}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch snapshots: ${response.status}`)
      }

      const snapshots = await response.json()

      this.snapshots = snapshots

      // Update charts (revenue/expense and profitability)
      if (this.revenueExpenseChart && this.profitabilityChart) {
        this.updateCharts()
      }
    } catch (error) {
      console.error('Error loading snapshots:', error)
      this.showError('Failed to load snapshot data')
    } finally {
      this.isLoading = false
      if (!silent) {
        this.hideLoading()
      }
    }
  }

  /**
   * Render profitability status indicator
   */
  renderStatusIndicator() {
    if (!this.statusElement || !this.metrics) return

    const { status, this_month } = this.metrics
    const profitability = this_month.profitability_percentage

    // Status badge with color coding
    let statusClass = 'status-profitable'
    let statusText = 'Profitable'
    let statusIcon = '✅'

    if (status === 'break-even' || (profitability >= 0 && profitability <= 5)) {
      statusClass = 'status-break-even'
      statusText = 'Break-Even'
      statusIcon = '⚠️'
    } else if (status === 'losing-money' || profitability < 0) {
      statusClass = 'status-losing-money'
      statusText = 'Losing Money'
      statusIcon = '❌'
    }

    this.statusElement.innerHTML = `
      <div class="status-badge ${statusClass}" role="status" aria-live="polite" aria-label="Profitability status: ${statusText}">
        <span class="status-icon" aria-hidden="true">${statusIcon}</span>
        <span class="status-text">${statusText}</span>
      </div>
      <div class="profitability-percentage" aria-label="Profitability percentage: ${profitability.toFixed(2)} percent">
        Profitability: <strong>${profitability.toFixed(2)}%</strong>
      </div>
    `
  }

  /**
   * Render metrics summary cards
   */
  renderMetricsSummary() {
    if (!this.metrics) return

    const { today, this_month, all_time } = this.metrics

    // Today's metrics
    if (this.todayElement) {
      this.todayElement.innerHTML = `
        <div class="metric-row" aria-label="Today's revenue: $${today.revenue_usd.toFixed(2)}">
          <span class="metric-label">Revenue:</span>
          <span class="metric-value">$${today.revenue_usd.toFixed(2)}</span>
        </div>
        <div class="metric-row" aria-label="Today's expenses: $${today.expenses_usd.toFixed(2)}">
          <span class="metric-label">Expenses:</span>
          <span class="metric-value">$${today.expenses_usd.toFixed(2)}</span>
        </div>
        <div class="metric-row" aria-label="Today's profit: $${today.profit_usd.toFixed(2)}">
          <span class="metric-label">Profit:</span>
          <span class="metric-value ${today.profit_usd >= 0 ? 'profit-positive' : 'profit-negative'}">
            $${today.profit_usd.toFixed(2)}
          </span>
        </div>
      `
    }

    // This month's metrics
    if (this.monthElement) {
      this.monthElement.innerHTML = `
        <div class="metric-row" aria-label="This month's revenue: $${this_month.revenue_usd.toFixed(2)}">
          <span class="metric-label">Revenue:</span>
          <span class="metric-value">$${this_month.revenue_usd.toFixed(2)}</span>
        </div>
        <div class="metric-row" aria-label="This month's expenses: $${this_month.expenses_usd.toFixed(2)}">
          <span class="metric-label">Expenses:</span>
          <span class="metric-value">$${this_month.expenses_usd.toFixed(2)}</span>
        </div>
        <div class="metric-row" aria-label="This month's profit: $${this_month.profit_usd.toFixed(2)}">
          <span class="metric-label">Profit:</span>
          <span class="metric-value ${this_month.profit_usd >= 0 ? 'profit-positive' : 'profit-negative'}">
            $${this_month.profit_usd.toFixed(2)}
          </span>
        </div>
        <div class="metric-row" aria-label="This month's profitability: ${this_month.profitability_percentage.toFixed(2)} percent">
          <span class="metric-label">Profitability:</span>
          <span class="metric-value">${this_month.profitability_percentage.toFixed(2)}%</span>
        </div>
      `
    }

    // All-time metrics
    if (this.alltimeElement) {
      this.alltimeElement.innerHTML = `
        <div class="metric-row" aria-label="Total revenue: $${all_time.total_revenue_usd.toFixed(2)}">
          <span class="metric-label">Total Revenue:</span>
          <span class="metric-value">$${all_time.total_revenue_usd.toFixed(2)}</span>
        </div>
        <div class="metric-row" aria-label="Total expenses: $${all_time.total_expenses_usd.toFixed(2)}">
          <span class="metric-label">Total Expenses:</span>
          <span class="metric-value">$${all_time.total_expenses_usd.toFixed(2)}</span>
        </div>
        <div class="metric-row" aria-label="Net profit: $${all_time.net_profit_usd.toFixed(2)}">
          <span class="metric-label">Net Profit:</span>
          <span class="metric-value ${all_time.net_profit_usd >= 0 ? 'profit-positive' : 'profit-negative'}">
            $${all_time.net_profit_usd.toFixed(2)}
          </span>
        </div>
      `
    }
  }

  /**
   * Render balance information
   */
  renderBalances() {
    if (!this.balancesElement || !this.metrics) return

    const { balances } = this.metrics

    // Convert balances from base units
    const ethBalance = (parseFloat(balances.eth_balance) / 1e18).toFixed(4)
    const usdcBalance = (parseFloat(balances.usdc_balance) / 1e6).toFixed(2)
    const aktWalletBalance = (parseFloat(balances.akt_wallet_balance) / 1e6).toFixed(2)
    const aktEscrowBalance = (parseFloat(balances.akt_escrow_balance) / 1e6).toFixed(2)

    this.balancesElement.innerHTML = `
      <div class="balance-row" aria-label="ETH balance: ${ethBalance} ETH">
        <span class="balance-label">ETH:</span>
        <span class="balance-value">${ethBalance} ETH</span>
      </div>
      <div class="balance-row" aria-label="USDC balance: ${usdcBalance} USDC">
        <span class="balance-label">USDC:</span>
        <span class="balance-value">${usdcBalance} USDC</span>
      </div>
      <div class="balance-row" aria-label="AKT wallet balance: ${aktWalletBalance} AKT">
        <span class="balance-label">AKT Wallet:</span>
        <span class="balance-value">${aktWalletBalance} AKT</span>
      </div>
      <div class="balance-row" aria-label="AKT escrow balance: ${aktEscrowBalance} AKT">
        <span class="balance-label">AKT Escrow:</span>
        <span class="balance-value">${aktEscrowBalance} AKT</span>
      </div>
    `
  }

  /**
   * Render days of hosting remaining
   */
  renderDaysRemaining() {
    if (!this.daysRemainingElement || !this.metrics) return

    const days = this.metrics.balances.days_hosting_remaining

    // Color coding based on days remaining
    let barClass = 'days-healthy' // green
    if (days < 30 && days >= 10) {
      barClass = 'days-warning' // yellow
    } else if (days < 10) {
      barClass = 'days-critical' // red
    }

    // Calculate percentage (assume 90 days max capacity)
    const percentage = Math.min((days / 90) * 100, 100)

    this.daysRemainingElement.innerHTML = `
      <div class="progress-bar" role="progressbar" aria-valuenow="${days}" aria-valuemin="0" aria-valuemax="90" aria-label="Days of hosting remaining: ${days} days">
        <div class="progress-bar-fill ${barClass}" style="width: ${percentage}%"></div>
      </div>
      <div class="days-remaining-text" aria-label="${days} days of hosting remaining">
        <strong>${days}</strong> days remaining
      </div>
    `
  }

  /**
   * Initialize all charts
   */
  initializeCharts() {
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
      console.error('Chart.js not loaded')
      return
    }

    // Revenue/Expense chart
    const revenueExpenseCanvas = document.getElementById('revenue-expense-chart')
    if (revenueExpenseCanvas) {
      revenueExpenseCanvas.setAttribute('role', 'img')
      revenueExpenseCanvas.setAttribute('aria-label', 'Line chart showing revenue and expenses over time')
      this.revenueExpenseChart = new Chart(revenueExpenseCanvas, {
        type: 'line',
        data: formatRevenueExpenseChart([]),
        options: getRevenueExpenseChartOptions(),
      })
    }

    // Profitability chart
    const profitabilityCanvas = document.getElementById('profitability-chart')
    if (profitabilityCanvas) {
      profitabilityCanvas.setAttribute('role', 'img')
      profitabilityCanvas.setAttribute('aria-label', 'Line chart showing profitability percentage over time with break-even line')
      this.profitabilityChart = new Chart(profitabilityCanvas, {
        type: 'line',
        data: formatProfitabilityChart([]),
        options: getProfitabilityChartOptions(),
      })
    }

    // Revenue breakdown pie chart
    const revenueBreakdownCanvas = document.getElementById('revenue-breakdown-chart')
    if (revenueBreakdownCanvas) {
      revenueBreakdownCanvas.setAttribute('role', 'img')
      revenueBreakdownCanvas.setAttribute('aria-label', 'Pie chart showing revenue breakdown by source: subscriptions, routing, and content')
      this.revenueBreakdownChart = new Chart(revenueBreakdownCanvas, {
        type: 'pie',
        data: formatRevenueBreakdownChart(this.metrics || {}),
        options: getPieChartOptions(),
      })
    }

    // Expense breakdown pie chart
    const expenseBreakdownCanvas = document.getElementById('expense-breakdown-chart')
    if (expenseBreakdownCanvas) {
      expenseBreakdownCanvas.setAttribute('role', 'img')
      expenseBreakdownCanvas.setAttribute('aria-label', 'Pie chart showing expense breakdown: Akash hosting costs, gas fees, and other expenses')
      this.expenseBreakdownChart = new Chart(expenseBreakdownCanvas, {
        type: 'pie',
        data: formatExpenseBreakdownChart(this.metrics || {}),
        options: getPieChartOptions(),
      })
    }

    // Update charts with real data
    if (this.snapshots) {
      this.updateCharts()
    }
    if (this.metrics) {
      this.updatePieCharts()
    }
  }

  /**
   * Update revenue/expense and profitability charts
   */
  updateCharts() {
    if (!this.snapshots) return

    // Update revenue/expense chart
    if (this.revenueExpenseChart) {
      const data = formatRevenueExpenseChart(this.snapshots)
      this.revenueExpenseChart.data = data
      this.revenueExpenseChart.update()
    }

    // Update profitability chart
    if (this.profitabilityChart) {
      const data = formatProfitabilityChart(this.snapshots)
      this.profitabilityChart.data = data
      this.profitabilityChart.update()
    }
  }

  /**
   * Update pie charts (revenue and expense breakdown)
   */
  updatePieCharts() {
    if (!this.metrics) return

    // Update revenue breakdown chart
    if (this.revenueBreakdownChart) {
      const data = formatRevenueBreakdownChart(this.metrics)
      this.revenueBreakdownChart.data = data
      this.revenueBreakdownChart.update()
    }

    // Update expense breakdown chart
    if (this.expenseBreakdownChart) {
      const data = formatExpenseBreakdownChart(this.metrics)
      this.expenseBreakdownChart.data = data
      this.expenseBreakdownChart.update()
    }
  }

  /**
   * Handle period selector change
   * @param {Event} event
   */
  async onPeriodChange(event) {
    this.selectedPeriod = event.target.value
    await this.loadSnapshots(this.selectedPeriod)
  }

  /**
   * Show loading indicator
   */
  showLoading() {
    if (this.statusElement) {
      this.statusElement.innerHTML = '<div class="loading-spinner">Loading...</div>'
    }
  }

  /**
   * Hide loading indicator
   */
  hideLoading() {
    // Loading indicator will be replaced by renderStatusIndicator()
  }

  /**
   * Show error message
   * @param {string} message - Error message to display
   */
  showError(message) {
    const errorElement = document.getElementById('error-message')
    if (errorElement) {
      errorElement.textContent = message
      errorElement.classList.remove('hidden')

      // Auto-hide after 5 seconds
      setTimeout(() => {
        errorElement.classList.add('hidden')
      }, 5000)
    }
  }
}

// Export for use in peer.js
export default EconomicsDashboard
