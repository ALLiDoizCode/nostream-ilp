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
 * Initialize dashboard on page load
 */
window.addEventListener('DOMContentLoaded', () => {
  console.log('Dashboard initialized')
  startPolling()
})

/**
 * Cleanup on page unload
 */
window.addEventListener('beforeunload', () => {
  stopPolling()
})
