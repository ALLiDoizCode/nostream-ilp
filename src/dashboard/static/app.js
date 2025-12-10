/**
 * Dashboard client-side logic
 * Polls /dashboard/metrics every 5 seconds and updates the UI
 */

/* global fetch, document, window */

let updateInterval = null

/**
 * Fetch metrics from server
 */
async function loadMetrics() {
  try {
    const response = await fetch('/dashboard/metrics')

    if (response.status === 401) {
      // Browser will show Basic Auth prompt automatically
      showError('Authentication required. Please log in.')
      return
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const metrics = await response.json()
    updateUI(metrics)
    updateLastUpdatedTime()
    hideError()
    updateConnectionStatus(true)
  } catch (error) {
    console.error('Failed to load metrics:', error)
    showError(`Failed to load metrics: ${error.message}`)
    updateConnectionStatus(false)
  }
}

/**
 * Update UI with metrics
 */
function updateUI(metrics) {
  // Relay stats
  updateElement('total-events', formatNumber(metrics.relay_stats.total_events))
  updateElement('events-24h', formatNumber(metrics.relay_stats.events_24h))
  updateElement('active-subscriptions', formatNumber(metrics.relay_stats.active_subscriptions))
  updateElement('connected-clients', formatNumber(metrics.relay_stats.connected_clients))

  // Payment stats (balances)
  const balances = metrics.payment_stats.balances
  updateElement('balance-btc', formatBTC(balances.btc_sats))
  updateElement('balance-base', formatBASE(balances.base_wei))
  updateElement('balance-akt', formatAKT(balances.akt_uakt))
  updateElement('balance-xrp', formatXRP(balances.xrp_drops))

  // Health status
  updateHealthStatus(metrics.health_status)
}

/**
 * Update health status display
 */
function updateHealthStatus(health) {
  // Overall status
  const overallEl = document.getElementById('health-overall')
  overallEl.textContent = health.status.toUpperCase()
  overallEl.className = `health-indicator health-${health.status}`

  // Individual services
  const services = health.services || {}
  updateServiceHealth('health-nostream', services.nostream)
  updateServiceHealth('health-dassie', services.dassie_rpc)
  updateServiceHealth('health-postgresql', services.postgresql)
  updateServiceHealth('health-redis', services.redis)

  // Warnings
  if (health.warnings && health.warnings.length > 0) {
    const warningsDiv = document.getElementById('health-warnings')
    const warningsList = document.getElementById('warnings-list')
    warningsList.innerHTML = ''

    health.warnings.forEach(warning => {
      const li = document.createElement('li')
      li.textContent = warning
      warningsList.appendChild(li)
    })

    warningsDiv.classList.remove('hidden')
  } else {
    document.getElementById('health-warnings').classList.add('hidden')
  }
}

/**
 * Update individual service health status
 */
function updateServiceHealth(elementId, status) {
  const el = document.getElementById(elementId)
  if (!el) return

  el.textContent = status ? status.toUpperCase() : 'UNKNOWN'
  el.className = `service-status service-${status || 'unknown'}`
}

/**
 * Update element text content safely
 */
function updateElement(id, value) {
  const el = document.getElementById(id)
  if (el) {
    el.textContent = value
  }
}

/**
 * Format number with commas
 */
function formatNumber(num) {
  if (num === undefined || num === null) return '-'
  return num.toLocaleString()
}

/**
 * Format BTC balance (satoshis to BTC)
 */
function formatBTC(sats) {
  if (!sats) return '0.00000000 BTC'
  const btc = BigInt(sats) / BigInt(100000000)
  const remainder = BigInt(sats) % BigInt(100000000)
  return `${btc}.${remainder.toString().padStart(8, '0')} BTC`
}

/**
 * Format BASE balance (wei to BASE)
 */
function formatBASE(wei) {
  if (!wei) return '0.000000 BASE'
  const base = Number(BigInt(wei) / BigInt(1000000000000)) / 1000000
  return `${base.toFixed(6)} BASE`
}

/**
 * Format AKT balance (uakt to AKT)
 */
function formatAKT(uakt) {
  if (!uakt) return '0.000000 AKT'
  const akt = Number(BigInt(uakt)) / 1000000
  return `${akt.toFixed(6)} AKT`
}

/**
 * Format XRP balance (drops to XRP)
 */
function formatXRP(drops) {
  if (!drops) return '0.000000 XRP'
  const xrp = Number(BigInt(drops)) / 1000000
  return `${xrp.toFixed(6)} XRP`
}

/**
 * Update last updated timestamp
 */
function updateLastUpdatedTime() {
  const now = new Date()
  const timeStr = now.toLocaleTimeString()
  updateElement('last-updated', `Last updated: ${timeStr}`)
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(connected) {
  const statusEl = document.getElementById('connection-status')
  if (statusEl) {
    statusEl.className = connected ? 'connection-status connected' : 'connection-status disconnected'
  }
}

/**
 * Show error message
 */
function showError(message) {
  const errorEl = document.getElementById('error-message')
  if (errorEl) {
    errorEl.textContent = message
    errorEl.classList.remove('hidden')
  }
}

/**
 * Hide error message
 */
function hideError() {
  const errorEl = document.getElementById('error-message')
  if (errorEl) {
    errorEl.classList.add('hidden')
  }
}

/**
 * Start polling every 5 seconds
 */
function startPolling() {
  // Initial load
  loadMetrics()

  // Poll every 5 seconds
  updateInterval = setInterval(loadMetrics, 5000)
}

/**
 * Stop polling (cleanup)
 */
function stopPolling() {
  if (updateInterval) {
    clearInterval(updateInterval)
    updateInterval = null
  }
}

/**
 * Cleanup on page unload
 */
window.addEventListener('beforeunload', () => {
  stopPolling()
})

/* ============================================
 * AKT Purchase Management (Story 7.3)
 * ============================================ */

/**
 * Fetch purchase recommendation
 */
async function fetchPurchaseRecommendation() {
  try {
    const response = await fetch('/dashboard/akt/recommendation')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const rec = await response.json()
    updatePurchaseRecommendation(rec)
  } catch (error) {
    console.error('Failed to fetch purchase recommendation:', error)
  }
}

/**
 * Update purchase recommendation UI
 */
function updatePurchaseRecommendation(rec) {
  updateElement('revenue-usd', `$${rec.revenueUsd.toFixed(2)}`)
  updateElement('current-akt', `${rec.currentAktBalance.toFixed(1)} AKT`)
  updateElement('current-akt-usd', `$${(rec.currentAktBalance * rec.aktPriceUsd).toFixed(2)}`)
  updateElement('target-akt', `${rec.targetAktBalance.toFixed(1)} AKT`)
  updateElement('needed-akt', `${rec.neededAkt.toFixed(1)} AKT`)
  updateElement('needed-usd', `$${rec.neededUsd.toFixed(2)}`)
}

/**
 * Fetch current AKT balance
 */
async function fetchAktBalance() {
  try {
    const response = await fetch('/dashboard/akt/balance')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = await response.json()
    // Balance already displayed in purchase recommendation
  } catch (error) {
    console.error('Failed to fetch AKT balance:', error)
  }
}

/**
 * Fetch recent purchases
 */
async function fetchRecentPurchases() {
  try {
    const response = await fetch('/dashboard/akt/purchases?limit=10')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const purchases = await response.json()
    updatePurchasesTable(purchases)
  } catch (error) {
    console.error('Failed to fetch purchases:', error)
  }
}

/**
 * Update purchases table
 */
function updatePurchasesTable(purchases) {
  const tbody = document.getElementById('purchases-tbody')
  if (!tbody) return

  if (purchases.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">No purchases recorded yet</td></tr>'
    return
  }

  tbody.innerHTML = purchases.map(p => {
    const date = new Date(p.purchasedAt).toLocaleString()
    return `
      <tr>
        <td>${date}</td>
        <td>${p.aktAmount.toFixed(2)} AKT</td>
        <td>$${p.usdAmount.toFixed(2)}</td>
        <td>$${p.aktPriceUsd.toFixed(4)}</td>
        <td>${p.exchange || '-'}</td>
        <td>${p.txHash ? `<code>${p.txHash.substring(0, 12)}...</code>` : '-'}</td>
      </tr>
    `
  }).join('')
}

/**
 * Record manual purchase
 */
async function recordPurchase(formData) {
  try {
    const response = await fetch('/dashboard/akt/record-purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to record purchase')
    }

    const purchase = await response.json()
    console.log('Purchase recorded:', purchase)

    // Refresh data
    await Promise.all([
      fetchPurchaseRecommendation(),
      fetchRecentPurchases()
    ])

    return purchase
  } catch (error) {
    console.error('Failed to record purchase:', error)
    throw error
  }
}

/**
 * Copy wallet address to clipboard
 */
async function copyWalletAddress() {
  const addressEl = document.getElementById('akash-wallet-address')
  if (!addressEl) return

  const address = addressEl.textContent
  try {
    await navigator.clipboard.writeText(address)
    // Show temporary feedback
    const btn = document.getElementById('copy-address')
    if (btn) {
      const originalText = btn.textContent
      btn.textContent = 'Copied!'
      setTimeout(() => {
        btn.textContent = originalText
      }, 2000)
    }
  } catch (error) {
    console.error('Failed to copy address:', error)
    alert('Failed to copy address')
  }
}

/**
 * Initialize AKT purchase management
 */
function initAktPurchaseManagement() {
  // Fetch initial data
  fetchPurchaseRecommendation()
  fetchRecentPurchases()

  // Set up periodic refresh (every 60 seconds)
  setInterval(() => {
    fetchPurchaseRecommendation()
    fetchAktBalance()
    fetchRecentPurchases()
  }, 60000)

  // Set up form submission handler
  const form = document.getElementById('record-purchase-form')
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()

      const formData = {
        usdAmount: parseFloat(form.usdAmount.value),
        aktAmount: parseFloat(form.aktAmount.value),
        exchange: form.exchange.value || undefined,
        txHash: form.txHash.value || undefined
      }

      try {
        await recordPurchase(formData)
        form.reset()
        alert('Purchase recorded successfully!')
      } catch (error) {
        alert(`Failed to record purchase: ${error.message}`)
      }
    })
  }

  // Set up copy address button
  const copyBtn = document.getElementById('copy-address')
  if (copyBtn) {
    copyBtn.addEventListener('click', copyWalletAddress)
  }

  // Fetch Akash wallet address from config or API
  // For now, show placeholder (will be populated by server-side rendering or API)
  // TODO: Implement API endpoint to fetch wallet address
}

/**
 * ==========================================
 * Akash Escrow Management (Story 7.4)
 * ==========================================
 */

/**
 * Fetch and display current escrow status
 */
async function fetchEscrowStatus() {
  try {
    const response = await fetch('/dashboard/escrow/status')

    if (!response.ok) {
      if (response.status === 503) {
        // Escrow not configured, hide section
        const section = document.getElementById('akash-escrow')
        if (section) section.style.display = 'none'
        return
      }
      throw new Error(`HTTP ${response.status}`)
    }

    const status = await response.json()

    // Update escrow balance
    const balanceEl = document.getElementById('escrow-balance')
    if (balanceEl) {
      balanceEl.textContent = `${status.escrowBalanceAkt.toFixed(2)} AKT`
    }

    // Update days remaining
    const daysEl = document.getElementById('days-remaining')
    if (daysEl) {
      daysEl.textContent = `${status.daysRemaining.toFixed(1)} days`
    }

    // Update warning level
    const warningEl = document.getElementById('warning-level')
    if (warningEl) {
      warningEl.textContent = status.warningLevel
      warningEl.className = `status-${status.warningLevel.toLowerCase()}`
    }

    // Update target balance
    const targetEl = document.getElementById('target-balance')
    if (targetEl && status.targetBalanceAkt) {
      targetEl.textContent = `${status.targetBalanceAkt.toFixed(2)} AKT (30 days)`
    }

    // Show alerts if needed
    const alertsEl = document.getElementById('escrow-alerts')
    if (alertsEl) {
      if (status.warningLevel === 'WARNING') {
        alertsEl.className = 'escrow-alerts warning'
        alertsEl.innerHTML = `<p>⚠️ Escrow balance low. ${status.daysRemaining.toFixed(1)} days remaining. Auto-deposit will trigger soon.</p>`
      } else if (status.warningLevel === 'CRITICAL') {
        alertsEl.className = 'escrow-alerts critical'
        alertsEl.innerHTML = `<p>🚨 CRITICAL: Escrow balance critically low! Only ${status.daysRemaining.toFixed(1)} days remaining. Immediate deposit needed.</p>`
      } else {
        alertsEl.className = 'escrow-alerts hidden'
      }
    }
  } catch (error) {
    console.error('Failed to fetch escrow status:', error)
  }
}

/**
 * Fetch and display recent escrow deposits
 */
async function fetchRecentDeposits() {
  try {
    const response = await fetch('/dashboard/escrow/deposits?limit=10')

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    const tbody = document.getElementById('deposits-tbody')

    if (!tbody) return

    if (data.deposits.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">No deposits recorded yet</td></tr>'
      return
    }

    tbody.innerHTML = data.deposits.map(deposit => {
      const date = new Date(deposit.depositedAt).toLocaleString()
      const shortTxHash = deposit.txHash.substring(0, 12) + '...'
      return `
        <tr>
          <td>${date}</td>
          <td>${deposit.amountAkt.toFixed(2)} AKT</td>
          <td>${deposit.newBalanceAkt.toFixed(2)} AKT</td>
          <td><code title="${deposit.txHash}">${shortTxHash}</code></td>
        </tr>
      `
    }).join('')
  } catch (error) {
    console.error('Failed to fetch recent deposits:', error)
  }
}

/**
 * Handle manual deposit form submission
 */
async function manualDeposit(event) {
  event.preventDefault()

  const resultEl = document.getElementById('deposit-result')
  const submitBtn = event.target.querySelector('button[type="submit"]')

  if (!resultEl || !submitBtn) return

  // Disable button during request
  submitBtn.disabled = true
  submitBtn.textContent = 'Depositing...'

  try {
    const response = await fetch('/dashboard/escrow/deposit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest' // CSRF protection
      },
      body: JSON.stringify({})
    })

    const result = await response.json()

    if (response.ok && result.success) {
      resultEl.className = 'deposit-result success'
      resultEl.textContent = `✅ Deposited ${result.amountAkt.toFixed(2)} AKT. TX: ${result.txHash.substring(0, 12)}...`
      resultEl.classList.remove('hidden')

      // Refresh status and deposits after short delay
      setTimeout(async () => {
        await fetchEscrowStatus()
        await fetchRecentDeposits()
      }, 2000)
    } else {
      resultEl.className = 'deposit-result error'
      resultEl.textContent = `❌ Deposit failed: ${result.message || result.reason}`
      resultEl.classList.remove('hidden')
    }
  } catch (error) {
    resultEl.className = 'deposit-result error'
    resultEl.textContent = `❌ Deposit failed: ${error.message}`
    resultEl.classList.remove('hidden')
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Deposit to Escrow'
  }
}

/**
 * Initialize escrow management section
 */
function initEscrowManagement() {
  // Set up manual deposit form
  const depositForm = document.getElementById('manual-deposit-form')
  if (depositForm) {
    depositForm.addEventListener('submit', manualDeposit)
  }

  // Initial fetch
  fetchEscrowStatus()
  fetchRecentDeposits()

  // Poll for updates every 60 seconds
  setInterval(() => {
    fetchEscrowStatus()
    fetchRecentDeposits()
  }, 60000)
}

/* ============================================
 * Economics Dashboard (Story 7.5)
 * ============================================ */

// Chart instances (for cleanup)
let revenuePieChart = null
let trendLineChart = null

/**
 * Initialize economics dashboard
 */
function initEconomicsDashboard() {
  loadEconomicsMetrics()
  setupEconomicsRefresh()
  setupExportButtons()
}

/**
 * Fetch economics metrics from server
 */
async function loadEconomicsMetrics() {
  try {
    const response = await fetch('/dashboard/economics')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const metrics = await response.json()
    updateEconomicsUI(metrics)
  } catch (error) {
    console.error('Failed to load economics metrics:', error)
    showError(`Failed to load economics: ${error.message}`)
  }
}

/**
 * Update economics UI with metrics
 */
function updateEconomicsUI(metrics) {
  // Status badge
  const statusEl = document.getElementById('economics-status')
  statusEl.className = `status-badge status-${metrics.status}`
  const statusIcon = metrics.status === 'profitable' ? '✅' :
                     metrics.status === 'break-even' ? '⚠️' : '❌'
  statusEl.textContent = `${statusIcon} ${metrics.status.toUpperCase().replace('-', ' ')}`

  // Today metrics
  updateElement('today-revenue', formatUSD(metrics.today.revenue_usd))
  updateElement('today-expenses', formatUSD(metrics.today.expenses_usd))
  updateElement('today-profit', formatUSD(metrics.today.profit_usd))
  updateProfitColor('today-profit', metrics.today.profit_usd)

  // This month metrics
  updateElement('month-revenue', formatUSD(metrics.this_month.revenue_usd))
  updateElement('month-expenses', formatUSD(metrics.this_month.expenses_usd))
  updateElement('month-profit', formatUSD(metrics.this_month.profit_usd))
  updateElement('month-profitability', `${metrics.this_month.profitability_percentage.toFixed(1)}%`)
  updateProfitColor('month-profit', metrics.this_month.profit_usd)

  // All time metrics
  updateElement('alltime-revenue', formatUSD(metrics.all_time.total_revenue_usd))
  updateElement('alltime-expenses', formatUSD(metrics.all_time.total_expenses_usd))
  updateElement('alltime-profit', formatUSD(metrics.all_time.net_profit_usd))
  updateProfitColor('alltime-profit', metrics.all_time.net_profit_usd)

  // Revenue breakdown
  updateElement('revenue-subscriptions', formatUSD(metrics.revenue_breakdown.subscriptions_usd))
  updateElement('revenue-routing', formatUSD(metrics.revenue_breakdown.routing_usd))
  updateElement('revenue-content', formatUSD(metrics.revenue_breakdown.content_usd))

  // Expense breakdown
  updateElement('expense-akash', formatUSD(metrics.expense_breakdown.akash_cost_usd))
  updateElement('expense-gas', formatUSD(metrics.expense_breakdown.gas_fees_usd))
  updateElement('expense-other', formatUSD(metrics.expense_breakdown.other_usd))

  // Balance overview
  updateElement('balance-eth', formatETH(metrics.balances.eth_balance))
  updateElement('balance-usdc', formatUSDC(metrics.balances.usdc_balance))
  updateElement('balance-akt-wallet', formatAKT(metrics.balances.akt_wallet_balance))
  updateElement('balance-akt-escrow', formatAKT(metrics.balances.akt_escrow_balance))
  updateElement('hosting-days', `${metrics.balances.days_hosting_remaining.toFixed(1)} days`)

  // Update charts
  updateRevenueChart(metrics.revenue_breakdown)
  updateTrendChart()
}

/**
 * Format USD value
 */
function formatUSD(value) {
  if (value === undefined || value === null) return '$0.00'
  return `$${value.toFixed(2)}`
}

/**
 * Format ETH balance (wei to ETH)
 */
function formatETH(wei) {
  if (!wei) return '0.000000 ETH'
  const eth = Number(BigInt(wei)) / 1e18
  return `${eth.toFixed(6)} ETH`
}

/**
 * Format USDC balance (6 decimals to USDC)
 */
function formatUSDC(balance) {
  if (!balance) return '0.000000 USDC'
  const usdc = Number(BigInt(balance)) / 1e6
  return `${usdc.toFixed(6)} USDC`
}

/**
 * Update profit color (green for positive, red for negative)
 */
function updateProfitColor(elementId, value) {
  const el = document.getElementById(elementId)
  if (!el) return
  el.classList.remove('profit-positive', 'profit-negative')
  el.classList.add(value >= 0 ? 'profit-positive' : 'profit-negative')
}

/**
 * Update revenue pie chart
 */
function updateRevenueChart(breakdown) {
  const canvas = document.getElementById('revenue-pie-chart')
  if (!canvas) return

  // Destroy previous chart instance
  if (revenuePieChart) {
    revenuePieChart.destroy()
  }

  const ctx = canvas.getContext('2d')
  revenuePieChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Subscriptions', 'Routing Fees', 'Content Fees'],
      datasets: [{
        data: [breakdown.subscriptions_usd, breakdown.routing_usd, breakdown.content_usd],
        backgroundColor: ['#4CAF50', '#2196F3', '#FF9800']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  })
}

/**
 * Update 30-day revenue/expense trend chart
 */
async function updateTrendChart() {
  try {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    const response = await fetch(`/dashboard/economics/snapshots?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const snapshots = await response.json()

    const canvas = document.getElementById('revenue-expense-chart')
    if (!canvas) return

    // Destroy previous chart instance
    if (trendLineChart) {
      trendLineChart.destroy()
    }

    const ctx = canvas.getContext('2d')
    trendLineChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: snapshots.map(s => new Date(s.timestamp).toLocaleDateString()),
        datasets: [
          {
            label: 'Revenue (USD)',
            data: snapshots.map(s => s.revenue_usd),
            borderColor: '#4CAF50',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            fill: false
          },
          {
            label: 'Expenses (USD)',
            data: snapshots.map(s => s.expenses_usd),
            borderColor: '#F44336',
            backgroundColor: 'rgba(244, 67, 54, 0.1)',
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    })
  } catch (error) {
    console.error('Failed to load trend chart:', error)
  }
}

/**
 * Setup export buttons
 */
function setupExportButtons() {
  const csvBtn = document.getElementById('export-csv')
  if (csvBtn) {
    csvBtn.addEventListener('click', async () => {
      const endDate = new Date().toISOString()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 30)
      window.location.href = `/dashboard/economics/export.csv?startDate=${startDate.toISOString()}&endDate=${endDate}`
    })
  }

  const jsonBtn = document.getElementById('export-json')
  if (jsonBtn) {
    jsonBtn.addEventListener('click', async () => {
      const endDate = new Date().toISOString()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 30)
      const response = await fetch(`/dashboard/economics/snapshots?startDate=${startDate.toISOString()}&endDate=${endDate}`)
      const data = await response.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `economics-${new Date().toISOString().split('T')[0]}.json`
      a.click()
    })
  }
}

/**
 * Auto-refresh economics every 60 seconds
 */
function setupEconomicsRefresh() {
  setInterval(loadEconomicsMetrics, 60000) // 60 seconds
}

/**
 * Enhanced initialization with AKT purchase management
 */
window.addEventListener('DOMContentLoaded', () => {
  console.log('Dashboard initialized')
  startPolling()

  // Initialize economics dashboard if section exists
  if (document.getElementById('economics')) {
    initEconomicsDashboard()
  }

  // Initialize AKT purchase management if section exists
  if (document.getElementById('akt-purchase')) {
    initAktPurchaseManagement()
  }

  // Initialize escrow management if section exists
  if (document.getElementById('akash-escrow')) {
    initEscrowManagement()
  }
})
