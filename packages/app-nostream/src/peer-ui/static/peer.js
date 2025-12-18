/**
 * Peer UI Main JavaScript
 * Handles UI interactions and coordinates between components
 */

// Import economics dashboard
import EconomicsDashboard from '/peer/components/economics-dashboard.js'

// Global state
let composer = null
let eventFeed = null
let economicsDashboard = null
let currentPubkey = null
let peerStatus = { connectedPeers: 0, activeChannels: 0, canPublish: false }

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  composer = new EventComposer()
  initializeEventListeners()
  initializeEventFeed()
  initializeSubscriptionManager()
  initializeChannelManager()
  initializeEconomicsDashboard()
  initializePeerDiscovery()
  checkPeerStatus()
  detectNIP07()

  // Poll peer status every 10 seconds
  setInterval(checkPeerStatus, 10000)
})

/**
 * Initialize all event listeners
 */
function initializeEventListeners() {
  // Event kind selector
  const kindSelector = document.getElementById('event-kind')
  kindSelector?.addEventListener('change', handleKindChange)

  // Content textarea
  const contentTextarea = document.getElementById('event-content')
  contentTextarea?.addEventListener('input', handleContentChange)

  // Preview button
  const previewBtn = document.getElementById('preview-btn')
  previewBtn?.addEventListener('click', togglePreview)

  // Cost breakdown toggle
  const costBreakdownToggle = document.getElementById('cost-breakdown-toggle')
  costBreakdownToggle?.addEventListener('click', toggleCostBreakdown)

  // Signing buttons
  const signNIP07Btn = document.getElementById('sign-nip07-btn')
  signNIP07Btn?.addEventListener('click', handleSignWithNIP07)

  const signManualBtn = document.getElementById('sign-manual-btn')
  signManualBtn?.addEventListener('click', handleSignManual)

  // Publish button
  const publishBtn = document.getElementById('publish-btn')
  publishBtn?.addEventListener('click', handlePublish)

  // Event feed filter buttons
  const applyFiltersBtn = document.getElementById('apply-filters-btn')
  applyFiltersBtn?.addEventListener('click', handleApplyFilters)

  const clearFiltersBtn = document.getElementById('clear-filters-btn')
  clearFiltersBtn?.addEventListener('click', handleClearFilters)

  // Initialize character counter
  handleKindChange()
}

/**
 * Initialize event feed
 */
async function initializeEventFeed() {
  const eventListContainer = document.getElementById('event-list')
  const loadingIndicator = document.getElementById('event-loading')
  const scrollSentinel = document.getElementById('scroll-sentinel')

  eventFeed = new EventFeed()
  await eventFeed.init(eventListContainer, loadingIndicator, scrollSentinel)

  // Load peer list for filter dropdown
  await loadPeerList()
}

/**
 * Load peer list for filter dropdown
 */
async function loadPeerList() {
  try {
    const response = await fetch('/peer/api/peers')
    const data = await response.json()

    const filterPeerSelect = document.getElementById('filter-peer')
    if (filterPeerSelect && data.peers) {
      data.peers.forEach((peer) => {
        const option = document.createElement('option')
        option.value = peer.pubkey
        option.textContent = `${peer.pubkey.slice(0, 8)}...${peer.pubkey.slice(-8)}`
        filterPeerSelect.appendChild(option)
      })
    }
  } catch (error) {
    console.error('Error loading peer list:', error)
  }
}

/**
 * Initialize subscription manager
 */
async function initializeSubscriptionManager() {
  const subscriptionListContainer = document.getElementById('subscription-list')
  const subscriptionCountElement = document.getElementById('subscription-count')

  await subscriptionManager.init(subscriptionListContainer, subscriptionCountElement)
}

/**
 * Initialize channel manager (Story 9.4)
 */
async function initializeChannelManager() {
  const channelListContainer = document.getElementById('channel-list')
  const channelCountElement = document.getElementById('channel-count')

  await channelManager.init(channelListContainer, channelCountElement)
}

/**
 * Initialize economics dashboard (Story 9.5)
 */
async function initializeEconomicsDashboard() {
  economicsDashboard = new EconomicsDashboard()

  await economicsDashboard.init(
    'profitability-status',
    'today-metrics',
    'month-metrics',
    'alltime-metrics',
    'balances-display',
    'days-remaining-display',
    'chart-period'
  )
}

/**
 * Initialize peer discovery (Story 9.6)
 */
async function initializePeerDiscovery() {
  const peerDiscoveryContainer = document.getElementById('peer-discovery-section')

  if (peerDiscoveryContainer && typeof peerDiscovery !== 'undefined') {
    await peerDiscovery.init(peerDiscoveryContainer)
  }
}

/**
 * Handle apply filters button
 */
function handleApplyFilters() {
  const filterPeer = document.getElementById('filter-peer').value
  const filterSince = document.getElementById('filter-since').value
  const filterUntil = document.getElementById('filter-until').value

  // Get checked kinds
  const kindCheckboxes = document.querySelectorAll('.kind-checkboxes input[type="checkbox"]:checked')
  const kinds = Array.from(kindCheckboxes).map((cb) => parseInt(cb.value, 10))

  // Build filters object
  const filters = {
    authors: filterPeer ? [filterPeer] : [],
    kinds: kinds.length > 0 ? kinds : [],
    since: filterSince ? Math.floor(new Date(filterSince).getTime() / 1000) : null,
    until: filterUntil ? Math.floor(new Date(filterUntil).getTime() / 1000) : null,
  }

  eventFeed.applyFilters(filters)
}

/**
 * Handle clear filters button
 */
function handleClearFilters() {
  document.getElementById('filter-peer').value = ''
  document.getElementById('filter-since').value = ''
  document.getElementById('filter-until').value = ''

  // Uncheck all kind checkboxes, then check defaults
  const kindCheckboxes = document.querySelectorAll('.kind-checkboxes input[type="checkbox"]')
  kindCheckboxes.forEach((cb) => {
    cb.checked = ['1', '30023', '7'].includes(cb.value)
  })

  eventFeed.clearFilters()
}

/**
 * Handle event kind change
 */
function handleKindChange() {
  const kind = parseInt(document.getElementById('event-kind').value, 10)
  const charLimit = kind === 1 ? 280 : 10000
  document.getElementById('char-limit').textContent = charLimit

  // Update cost
  handleContentChange()
}

/**
 * Handle content change
 */
function handleContentChange() {
  const content = document.getElementById('event-content').value
  const kind = parseInt(document.getElementById('event-kind').value, 10)

  // Update character counter
  const validation = composer.validateContent(content, kind)
  document.getElementById('char-count').textContent = validation.charCount

  const charCounter = document.querySelector('.character-counter')
  const warningEl = document.getElementById('char-warning')

  if (!validation.valid) {
    charCounter.classList.add('warning')
    warningEl.classList.remove('hidden')
    warningEl.textContent = validation.reason
  } else {
    charCounter.classList.remove('warning')
    if (validation.warning) {
      warningEl.classList.remove('hidden')
      warningEl.textContent = validation.warning
    } else {
      warningEl.classList.add('hidden')
    }
  }

  // Update cost (debounced)
  clearTimeout(window.costUpdateTimeout)
  window.costUpdateTimeout = setTimeout(() => {
    updateCost(kind, new Blob([content]).size)
  }, 500)
}

/**
 * Update cost display
 */
async function updateCost(kind, contentSize) {
  const result = await composer.calculateCost(kind, contentSize)

  if (result.error) {
    document.getElementById('cost-msats').textContent = '-- msats'
    document.getElementById('cost-usd').textContent = '(error)'
    return
  }

  document.getElementById('cost-msats').textContent = `${result.costMsats} msats`
  document.getElementById('cost-usd').textContent = `(~$${composer.msatsToUsd(result.costMsats)})`

  // Update breakdown
  document.getElementById('breakdown-relay').textContent = `${result.breakdown.relayFee} msats`
  document.getElementById('breakdown-size').textContent = `${result.breakdown.sizeFee} msats`
  document.getElementById('breakdown-arweave').textContent = `${result.breakdown.arweaveCost || 0} msats`
}

/**
 * Toggle preview pane
 */
function togglePreview() {
  const previewPane = document.getElementById('event-preview')
  const isHidden = previewPane.classList.contains('hidden')

  if (isHidden) {
    // Show preview
    const content = document.getElementById('event-content').value
    const kind = parseInt(document.getElementById('event-kind').value, 10)
    const tags = document.getElementById('event-tags').value

    const event = composer.composeEvent(content, kind, tags)
    composer.updatePreview(previewPane, event, currentPubkey)

    previewPane.classList.remove('hidden')
    document.getElementById('preview-btn').textContent = 'Hide Preview'
  } else {
    // Hide preview
    previewPane.classList.add('hidden')
    document.getElementById('preview-btn').textContent = 'Preview Event'
  }
}

/**
 * Toggle cost breakdown
 */
function toggleCostBreakdown() {
  const breakdown = document.getElementById('cost-breakdown')
  const toggle = document.getElementById('cost-breakdown-toggle')
  const isHidden = breakdown.classList.contains('hidden')

  if (isHidden) {
    breakdown.classList.remove('hidden')
    toggle.textContent = 'Hide breakdown'
  } else {
    breakdown.classList.add('hidden')
    toggle.textContent = 'Show breakdown'
  }
}

/**
 * Detect NIP-07 browser extension
 */
function detectNIP07() {
  const nip07Available = document.getElementById('nip07-available')
  const nip07Unavailable = document.getElementById('nip07-unavailable')

  if (window.nostr) {
    nip07Available.classList.remove('hidden')
    nip07Unavailable.classList.add('hidden')
  } else {
    nip07Available.classList.add('hidden')
    nip07Unavailable.classList.remove('hidden')
  }
}

/**
 * Handle signing with NIP-07
 */
async function handleSignWithNIP07() {
  try {
    const content = document.getElementById('event-content').value
    const kind = parseInt(document.getElementById('event-kind').value, 10)
    const tags = document.getElementById('event-tags').value

    if (!content.trim()) {
      showError('Please enter some content before signing')
      return
    }

    const event = composer.composeEvent(content, kind, tags)

    // Get pubkey from extension
    currentPubkey = await window.nostr.getPublicKey()
    event.pubkey = currentPubkey

    // Sign event
    const signedEvent = await window.nostr.signEvent(event)
    composer.setSignedEvent(signedEvent)

    // Show success
    showEventSigned(signedEvent)
  } catch (error) {
    console.error('NIP-07 signing error:', error)
    showError(`Signing failed: ${error.message}`)
  }
}

/**
 * Handle manual signing
 */
async function handleSignManual() {
  try {
    const content = document.getElementById('event-content').value
    const kind = parseInt(document.getElementById('event-kind').value, 10)
    const tags = document.getElementById('event-tags').value
    const nsec = document.getElementById('nsec-input').value

    if (!content.trim()) {
      showError('Please enter some content before signing')
      return
    }

    if (!nsec.trim() || !nsec.startsWith('nsec')) {
      showError('Please enter a valid nsec private key')
      return
    }

    // TODO: Implement manual signing using nostr-tools or similar
    // For now, show a placeholder error
    showError('Manual signing not yet implemented. Please use a NIP-07 browser extension.')
  } catch (error) {
    console.error('Manual signing error:', error)
    showError(`Signing failed: ${error.message}`)
  }
}

/**
 * Show event signed success
 */
function showEventSigned(signedEvent) {
  const signedSection = document.getElementById('event-signed')
  signedSection.classList.remove('hidden')

  document.getElementById('signed-event-id').textContent = signedEvent.id
  document.getElementById('signed-event-sig').textContent =
    signedEvent.sig.slice(0, 32) + '...'

  // Enable publish button
  const publishBtn = document.getElementById('publish-btn')
  publishBtn.disabled = false
  document.getElementById('publish-disabled-reason').textContent = ''
}

/**
 * Handle publish event
 */
async function handlePublish() {
  const signedEvent = composer.getSignedEvent()
  if (!signedEvent) {
    showError('Please sign the event before publishing')
    return
  }

  if (!peerStatus.canPublish) {
    showError('Cannot publish: No connected peers')
    return
  }

  // Show loading state
  const publishBtn = document.getElementById('publish-btn')
  const publishBtnText = document.getElementById('publish-btn-text')
  const publishSpinner = document.getElementById('publish-spinner')

  publishBtn.disabled = true
  publishBtnText.textContent = 'Publishing...'
  publishSpinner.classList.remove('hidden')

  try {
    const response = await fetch('/peer/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signedEvent),
    })

    const result = await response.json()

    if (response.ok && result.success) {
      showSuccess(`Event published successfully! Event ID: ${result.eventId}`)
      resetForm()
    } else {
      showError(`Publish failed: ${result.error || 'Unknown error'}`)
    }
  } catch (error) {
    console.error('Publish error:', error)
    showError(`Publish failed: ${error.message}`)
  } finally {
    // Reset button state
    publishBtn.disabled = false
    publishBtnText.textContent = 'Publish Event'
    publishSpinner.classList.add('hidden')
  }
}

/**
 * Check peer connection status
 */
async function checkPeerStatus() {
  try {
    const response = await fetch('/peer/api/status')
    const status = await response.json()

    peerStatus = status

    // Update UI
    document.getElementById('peer-count').textContent = status.connectedPeers
    document.getElementById('peer-connection-detail').textContent =
      `${status.connectedPeers} peers, ${status.activeChannels} channels`

    const connectionStatus = document.getElementById('connection-status')
    if (status.connectedPeers > 0) {
      connectionStatus.classList.remove('disconnected')
    } else {
      connectionStatus.classList.add('disconnected')
    }

    // Update publish button state
    const publishBtn = document.getElementById('publish-btn')
    const publishReason = document.getElementById('publish-disabled-reason')

    if (!status.canPublish && composer.getSignedEvent()) {
      publishBtn.disabled = true
      publishReason.textContent = 'Cannot publish: No connected peers'
    } else if (composer.getSignedEvent()) {
      publishBtn.disabled = false
      publishReason.textContent = ''
    }
  } catch (error) {
    console.error('Status check error:', error)
  }
}

/**
 * Show error message
 */
function showError(message) {
  const errorEl = document.getElementById('error-message')
  errorEl.textContent = message
  errorEl.classList.remove('hidden')

  setTimeout(() => {
    errorEl.classList.add('hidden')
  }, 5000)
}

/**
 * Show success message
 */
function showSuccess(message) {
  const successEl = document.getElementById('success-message')
  successEl.textContent = message
  successEl.classList.remove('hidden')

  setTimeout(() => {
    successEl.classList.add('hidden')
  }, 5000)
}

/**
 * Reset form after successful publish
 */
function resetForm() {
  document.getElementById('event-content').value = ''
  document.getElementById('event-tags').value = ''
  document.getElementById('nsec-input').value = ''
  document.getElementById('event-signed').classList.add('hidden')
  document.getElementById('event-preview').classList.add('hidden')
  document.getElementById('preview-btn').textContent = 'Preview Event'

  composer.reset()

  const publishBtn = document.getElementById('publish-btn')
  publishBtn.disabled = true
  document.getElementById('publish-disabled-reason').textContent =
    'Sign the event to enable publishing'

  handleContentChange()
}
