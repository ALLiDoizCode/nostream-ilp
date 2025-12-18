/**
 * Subscription Manager Component
 * Handles subscription list display, status updates, and subscription management
 *
 * Reference: docs/stories/9.3.story.md#Task 3
 */

class SubscriptionManager {
  constructor() {
    this.subscriptions = []
    this.isLoading = false
    this.pollingInterval = null
    this.lastUpdated = null

    // Modal state
    this.activeModal = null
    this.activeSubscription = null

    // Bind methods
    this.loadSubscriptions = this.loadSubscriptions.bind(this)
    this.renderSubscriptions = this.renderSubscriptions.bind(this)
    this.renderSubscription = this.renderSubscription.bind(this)
    this.pollSubscriptions = this.pollSubscriptions.bind(this)
    this.openRenewModal = this.openRenewModal.bind(this)
    this.openUnsubscribeModal = this.openUnsubscribeModal.bind(this)
    this.openAddSubscriptionModal = this.openAddSubscriptionModal.bind(this)
    this.closeModal = this.closeModal.bind(this)
    this.toggleDetails = this.toggleDetails.bind(this)
  }

  /**
   * Initialize the subscription manager
   * @param {HTMLElement} container - Container element for subscription list
   * @param {HTMLElement} countElement - Element to display subscription count
   */
  async init(container, countElement) {
    this.container = container
    this.countElement = countElement

    // Set up modal container
    this.setupModals()

    // Load initial subscriptions
    await this.loadSubscriptions()

    // Start polling for updates
    this.startPolling()
  }

  /**
   * Set up modal container and event listeners
   */
  setupModals() {
    // Modal container already exists in HTML
    // Add event listener for clicking outside modal
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        this.closeModal()
      }
    })

    // Add event listener for Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.closeModal()
      }
    })
  }

  /**
   * Start polling for subscription updates every 10 seconds
   */
  startPolling() {
    this.pollingInterval = setInterval(this.pollSubscriptions, 10000)
  }

  /**
   * Stop polling for subscription updates
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  /**
   * Poll for subscription updates
   */
  async pollSubscriptions() {
    if (this.isLoading || this.activeModal) {
      // Pause polling when modal is open
      return
    }

    await this.loadSubscriptions(true) // Silent reload
  }

  /**
   * Load subscriptions from API
   * @param {boolean} silent - If true, don't show loading indicator
   */
  async loadSubscriptions(silent = false) {
    if (this.isLoading) return

    this.isLoading = true

    if (!silent) {
      this.showLoading()
    }

    try {
      const response = await fetch('/peer/api/subscriptions')

      if (!response.ok) {
        throw new Error(`Failed to fetch subscriptions: ${response.status}`)
      }

      const data = await response.json()

      this.subscriptions = data.subscriptions || []
      this.lastUpdated = new Date()

      this.renderSubscriptions()
      this.updateCount()
    } catch (error) {
      console.error('Error loading subscriptions:', error)
      this.showError('Failed to load subscriptions')
    } finally {
      this.isLoading = false
      if (!silent) {
        this.hideLoading()
      }
    }
  }

  /**
   * Render all subscriptions
   */
  renderSubscriptions() {
    if (!this.container) return

    if (this.subscriptions.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <p>No active subscriptions</p>
          <button class="btn btn-primary" onclick="subscriptionManager.openAddSubscriptionModal()">
            Add Subscription
          </button>
        </div>
      `
      return
    }

    const subscriptionsHTML = this.subscriptions
      .map((sub) => this.renderSubscription(sub))
      .join('')

    this.container.innerHTML = subscriptionsHTML
  }

  /**
   * Render a single subscription card
   * @param {Object} sub - Subscription object
   * @returns {string} HTML string
   */
  renderSubscription(sub) {
    const statusClass = `status-${sub.status}` // status-healthy, status-expiring-soon, etc.
    const statusLabel = this.getStatusLabel(sub.status)

    // Truncate subscription ID
    const shortId = sub.id.substring(0, 8) + '...'

    // Truncate subscriber ILP address if too long
    const shortSubscriber =
      sub.subscriber.length > 40
        ? sub.subscriber.substring(0, 37) + '...'
        : sub.subscriber

    return `
      <div class="subscription-card ${statusClass}" data-subscription-id="${sub.id}">
        <div class="subscription-header">
          <div class="subscription-id">
            <strong>ID:</strong>
            <code title="${sub.id}">${shortId}</code>
            <button class="btn-icon" onclick="subscriptionManager.copyToClipboard('${sub.id}')" title="Copy ID">
              📋
            </button>
          </div>
          <div class="subscription-status">
            <span class="status-badge ${statusClass}">${statusLabel}</span>
          </div>
        </div>

        <div class="subscription-body">
          <div class="subscription-field">
            <strong>Subscriber:</strong>
            <span title="${sub.subscriber}">${shortSubscriber}</span>
          </div>

          <div class="subscription-field">
            <strong>Expires:</strong>
            <span class="expiration-time">${sub.timeRemainingHuman}</span>
            <span class="muted-text">(${new Date(sub.expiresAt).toLocaleString()})</span>
          </div>

          <div class="subscription-field">
            <strong>Filters:</strong>
            <span class="filter-summary">${sub.filterSummary}</span>
          </div>

          <!-- Expandable Details -->
          <div class="subscription-details-toggle">
            <button
              class="btn-link"
              onclick="subscriptionManager.toggleDetails('${sub.id}')"
              aria-label="Toggle subscription details"
            >
              <span class="details-toggle-text">View Details</span> ▼
            </button>
          </div>

          <div class="subscription-details" id="details-${sub.id}" style="display: none;">
            <h4>Full Filters</h4>
            <pre class="filter-json">${JSON.stringify(sub.filters, null, 2)}</pre>
            <div class="details-meta">
              <div><strong>Expires At:</strong> ${sub.expiresAtISO}</div>
              <div><strong>Active:</strong> ${sub.active ? 'Yes' : 'No'}</div>
            </div>
          </div>
        </div>

        <div class="subscription-actions">
          <button
            class="btn btn-secondary btn-small"
            onclick="subscriptionManager.openRenewModal('${sub.id}')"
            aria-label="Renew subscription"
          >
            Renew
          </button>
          <button
            class="btn btn-danger btn-small"
            onclick="subscriptionManager.openUnsubscribeModal('${sub.id}')"
            aria-label="Unsubscribe"
          >
            Unsubscribe
          </button>
        </div>
      </div>
    `
  }

  /**
   * Get human-readable status label
   * @param {string} status - Status string
   * @returns {string} Label
   */
  getStatusLabel(status) {
    const labels = {
      healthy: 'Healthy',
      expiring_soon: 'Expiring Soon',
      expiring_critical: 'Critical',
      expired: 'Expired',
    }
    return labels[status] || 'Unknown'
  }

  /**
   * Toggle subscription details visibility
   * @param {string} subscriptionId - Subscription ID
   */
  toggleDetails(subscriptionId) {
    const detailsElement = document.getElementById(`details-${subscriptionId}`)
    const toggleButton = detailsElement.previousElementSibling.querySelector('.btn-link')

    if (detailsElement.style.display === 'none') {
      detailsElement.style.display = 'block'
      toggleButton.querySelector('.details-toggle-text').textContent = 'Hide Details'
      toggleButton.innerHTML = toggleButton.innerHTML.replace('▼', '▲')
    } else {
      detailsElement.style.display = 'none'
      toggleButton.querySelector('.details-toggle-text').textContent = 'View Details'
      toggleButton.innerHTML = toggleButton.innerHTML.replace('▲', '▼')
    }
  }

  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   */
  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(
      () => {
        this.showSuccess('Copied to clipboard')
      },
      (err) => {
        console.error('Failed to copy:', err)
      }
    )
  }

  /**
   * Update subscription count display
   */
  updateCount() {
    if (this.countElement) {
      this.countElement.textContent = `${this.subscriptions.length} active subscription${this.subscriptions.length === 1 ? '' : 's'}`
    }

    // Update last updated timestamp
    const lastUpdatedElement = document.getElementById('subscriptions-last-updated')
    if (lastUpdatedElement && this.lastUpdated) {
      const now = new Date()
      const secondsAgo = Math.floor((now - this.lastUpdated) / 1000)
      lastUpdatedElement.textContent = `Last updated: ${secondsAgo}s ago`
    }
  }

  /**
   * Open renew subscription modal
   * @param {string} subscriptionId - Subscription ID
   */
  openRenewModal(subscriptionId) {
    const subscription = this.subscriptions.find((s) => s.id === subscriptionId)
    if (!subscription) {
      this.showError('Subscription not found')
      return
    }

    this.activeSubscription = subscription
    this.activeModal = 'renew'

    const modalElement = document.getElementById('renew-modal')
    modalElement.style.display = 'flex'

    // Set current subscription info
    document.getElementById('renew-sub-id').textContent = subscription.id.substring(0, 16) + '...'
    document.getElementById('renew-current-expiry').textContent = subscription.timeRemainingHuman

    // Reset form
    document.getElementById('renew-ttl').value = '3600'
    this.calculateRenewalCost()
  }

  /**
   * Open unsubscribe confirmation modal
   * @param {string} subscriptionId - Subscription ID
   */
  openUnsubscribeModal(subscriptionId) {
    const subscription = this.subscriptions.find((s) => s.id === subscriptionId)
    if (!subscription) {
      this.showError('Subscription not found')
      return
    }

    this.activeSubscription = subscription
    this.activeModal = 'unsubscribe'

    const modalElement = document.getElementById('unsubscribe-modal')
    modalElement.style.display = 'flex'

    // Set subscription info
    document.getElementById('unsubscribe-sub-id').textContent = subscription.id
    document.getElementById('unsubscribe-sub-subscriber').textContent = subscription.subscriber
  }

  /**
   * Open add subscription modal
   */
  openAddSubscriptionModal() {
    this.activeModal = 'add'

    const modalElement = document.getElementById('add-subscription-modal')
    modalElement.style.display = 'flex'

    // Reset form
    document.getElementById('add-sub-subscriber').value = ''
    document.getElementById('add-sub-authors').value = ''
    document.getElementById('add-sub-kinds').value = '1'
    document.getElementById('add-sub-since').value = ''
    document.getElementById('add-sub-until').value = ''
    document.getElementById('add-sub-limit').value = '100'
    document.getElementById('add-sub-ttl').value = '3600'

    this.calculateSubscriptionCost()
  }

  /**
   * Close active modal
   */
  closeModal() {
    if (this.activeModal === 'renew') {
      document.getElementById('renew-modal').style.display = 'none'
    } else if (this.activeModal === 'unsubscribe') {
      document.getElementById('unsubscribe-modal').style.display = 'none'
    } else if (this.activeModal === 'add') {
      document.getElementById('add-subscription-modal').style.display = 'none'
    }

    this.activeModal = null
    this.activeSubscription = null
  }

  /**
   * Calculate renewal cost based on TTL
   */
  async calculateRenewalCost() {
    const ttlInput = document.getElementById('renew-ttl')
    const costElement = document.getElementById('renew-cost')

    const ttl = parseInt(ttlInput.value, 10)

    if (isNaN(ttl) || ttl < 60) {
      costElement.textContent = '-- msats'
      return
    }

    // Calculate cost: ceil(ttl / 3600) * 5000
    const hours = Math.ceil(ttl / 3600)
    const cost = hours * 5000

    costElement.textContent = `${cost.toLocaleString()} msats`
  }

  /**
   * Calculate subscription cost based on TTL
   */
  async calculateSubscriptionCost() {
    const ttlInput = document.getElementById('add-sub-ttl')
    const costElement = document.getElementById('add-sub-cost')

    const ttl = parseInt(ttlInput.value, 10)

    if (isNaN(ttl) || ttl < 60) {
      costElement.textContent = '-- msats'
      return
    }

    // Calculate cost: ceil(ttl / 3600) * 5000
    const hours = Math.ceil(ttl / 3600)
    const cost = hours * 5000

    costElement.textContent = `${cost.toLocaleString()} msats`
  }

  /**
   * Handle renew subscription
   */
  async renewSubscription() {
    if (!this.activeSubscription) return

    const ttl = parseInt(document.getElementById('renew-ttl').value, 10)

    if (isNaN(ttl) || ttl < 60 || ttl > 86400) {
      this.showError('Invalid TTL. Must be between 60 and 86400 seconds.')
      return
    }

    try {
      const response = await fetch(`/peer/api/subscriptions/${this.activeSubscription.id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl }),
      })

      const data = await response.json()

      if (response.status === 501) {
        // Not implemented yet (pending StreamConnection integration)
        this.showError('Subscription renewal will be available in Story 9.6')
      } else if (!response.ok) {
        throw new Error(data.error || 'Failed to renew subscription')
      } else {
        this.showSuccess('Subscription renewed successfully')
        await this.loadSubscriptions()
      }

      this.closeModal()
    } catch (error) {
      console.error('Error renewing subscription:', error)
      this.showError(error.message)
    }
  }

  /**
   * Handle unsubscribe
   */
  async unsubscribe() {
    if (!this.activeSubscription) return

    try {
      const response = await fetch(`/peer/api/subscriptions/${this.activeSubscription.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (response.status === 501) {
        // Not implemented yet (pending StreamConnection integration)
        this.showError('Unsubscribe will be available in Story 9.6')
      } else if (!response.ok) {
        throw new Error(data.error || 'Failed to unsubscribe')
      } else {
        this.showSuccess('Unsubscribed successfully')
        await this.loadSubscriptions()
      }

      this.closeModal()
    } catch (error) {
      console.error('Error unsubscribing:', error)
      this.showError(error.message)
    }
  }

  /**
   * Handle create subscription
   */
  async createSubscription() {
    // Get form values
    const subscriber = document.getElementById('add-sub-subscriber').value.trim()
    const authorsStr = document.getElementById('add-sub-authors').value.trim()
    const kindsStr = document.getElementById('add-sub-kinds').value.trim()
    const sinceStr = document.getElementById('add-sub-since').value
    const untilStr = document.getElementById('add-sub-until').value
    const limitStr = document.getElementById('add-sub-limit').value
    const ttl = parseInt(document.getElementById('add-sub-ttl').value, 10)

    // Validate subscriber
    if (!subscriber || !subscriber.startsWith('g.')) {
      this.showError('Invalid ILP address. Must start with "g."')
      return
    }

    // Build filter object
    const filter = {}

    if (authorsStr) {
      filter.authors = authorsStr.split(',').map((a) => a.trim()).filter(Boolean)
    }

    if (kindsStr) {
      filter.kinds = kindsStr.split(',').map((k) => parseInt(k.trim(), 10)).filter((n) => !isNaN(n))
    }

    if (sinceStr) {
      filter.since = Math.floor(new Date(sinceStr).getTime() / 1000)
    }

    if (untilStr) {
      filter.until = Math.floor(new Date(untilStr).getTime() / 1000)
    }

    if (limitStr) {
      filter.limit = parseInt(limitStr, 10)
    }

    // Validate filter has at least one criterion
    if (Object.keys(filter).length === 0) {
      const confirmEmpty = confirm(
        'Warning: No filters specified. This will subscribe to ALL events, which may be expensive. Continue?'
      )
      if (!confirmEmpty) return
    }

    // Validate TTL
    if (isNaN(ttl) || ttl < 60 || ttl > 86400) {
      this.showError('Invalid TTL. Must be between 60 and 86400 seconds.')
      return
    }

    try {
      const response = await fetch('/peer/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriber,
          filters: [filter],
          ttl,
        }),
      })

      const data = await response.json()

      if (response.status === 501) {
        // Not implemented yet (pending StreamConnection integration)
        this.showError('Subscription creation will be available in Story 9.6')
      } else if (!response.ok) {
        throw new Error(data.error || 'Failed to create subscription')
      } else {
        this.showSuccess('Subscription created successfully')
        await this.loadSubscriptions()
      }

      this.closeModal()
    } catch (error) {
      console.error('Error creating subscription:', error)
      this.showError(error.message)
    }
  }

  /**
   * Show loading indicator
   */
  showLoading() {
    if (this.container) {
      this.container.innerHTML = `
        <div class="loading-indicator">
          <div class="spinner"></div>
          <p>Loading subscriptions...</p>
        </div>
      `
    }
  }

  /**
   * Hide loading indicator
   */
  hideLoading() {
    // Handled by renderSubscriptions()
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    const errorElement = document.getElementById('error-message')
    if (errorElement) {
      errorElement.textContent = message
      errorElement.classList.remove('hidden')
      setTimeout(() => {
        errorElement.classList.add('hidden')
      }, 5000)
    }
  }

  /**
   * Show success message
   * @param {string} message - Success message
   */
  showSuccess(message) {
    const successElement = document.getElementById('success-message')
    if (successElement) {
      successElement.textContent = message
      successElement.classList.remove('hidden')
      setTimeout(() => {
        successElement.classList.add('hidden')
      }, 5000)
    }
  }

  /**
   * Destroy subscription manager (cleanup)
   */
  destroy() {
    this.stopPolling()
  }
}

// Create global instance
const subscriptionManager = new SubscriptionManager()
