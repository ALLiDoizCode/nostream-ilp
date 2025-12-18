/**
 * Channel Manager Component
 * Handles payment channel list display, status updates, and channel management
 *
 * Reference: docs/stories/9.4.story.md#Task 3
 */

class ChannelManager {
  constructor() {
    this.channels = []
    this.isLoading = false
    this.pollingInterval = null
    this.lastUpdated = null

    // Modal state
    this.activeModal = null
    this.activeChannel = null

    // Bind methods
    this.loadChannels = this.loadChannels.bind(this)
    this.renderChannels = this.renderChannels.bind(this)
    this.renderChannel = this.renderChannel.bind(this)
    this.pollChannels = this.pollChannels.bind(this)
    this.openOpenChannelModal = this.openOpenChannelModal.bind(this)
    this.openCloseChannelModal = this.openCloseChannelModal.bind(this)
    this.openTopUpModal = this.openTopUpModal.bind(this)
    this.closeModal = this.closeModal.bind(this)
    this.toggleDetails = this.toggleDetails.bind(this)
  }

  /**
   * Initialize the channel manager
   * @param {HTMLElement} container - Container element for channel list
   * @param {HTMLElement} countElement - Element to display channel count
   */
  async init(container, countElement) {
    this.container = container
    this.countElement = countElement

    // Set up modal container
    this.setupModals()

    // Load initial channels
    await this.loadChannels()

    // Start polling for updates (every 10 seconds)
    this.startPolling()
  }

  /**
   * Set up modal container and event listeners
   */
  setupModals() {
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
   * Start polling for channel updates every 10 seconds
   */
  startPolling() {
    this.pollingInterval = setInterval(this.pollChannels, 10000)
  }

  /**
   * Stop polling for channel updates
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  /**
   * Poll for channel updates
   */
  async pollChannels() {
    if (this.isLoading || this.activeModal) {
      // Pause polling when modal is open
      return
    }

    await this.loadChannels(true) // Silent reload
  }

  /**
   * Load channels from API
   * @param {boolean} silent - If true, don't show loading indicator
   */
  async loadChannels(silent = false) {
    if (this.isLoading) return

    this.isLoading = true

    if (!silent) {
      this.showLoading()
    }

    try {
      const response = await fetch('/peer/api/channels')

      if (!response.ok) {
        throw new Error(`Failed to fetch channels: ${response.status}`)
      }

      const data = await response.json()

      this.channels = data.channels || []
      this.lastUpdated = new Date()

      this.renderChannels()
      this.updateCount()
    } catch (error) {
      console.error('Error loading channels:', error)
      this.showError('Failed to load channels')
    } finally {
      this.isLoading = false
      if (!silent) {
        this.hideLoading()
      }
    }
  }

  /**
   * Render all channels
   */
  renderChannels() {
    if (!this.container) return

    if (this.channels.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <p>No payment channels</p>
          <button class="btn btn-primary" onclick="channelManager.openOpenChannelModal()">
            Open Channel
          </button>
        </div>
      `
      return
    }

    const channelsHTML = this.channels
      .map((channel) => this.renderChannel(channel))
      .join('')

    this.container.innerHTML = channelsHTML
  }

  /**
   * Render a single channel card
   * @param {Object} channel - Channel object
   * @returns {string} HTML string
   */
  renderChannel(channel) {
    const expirationClass = `expiration-${channel.expirationStatus}` // expiration-healthy, expiration-expiring-soon, etc.
    const expirationLabel = this.getExpirationLabel(channel.expirationStatus)

    // Truncate channel ID
    const shortId = channel.channelId.substring(0, 8) + '...'

    // Truncate sender address if too long
    const shortSender =
      channel.sender.length > 20
        ? channel.sender.substring(0, 17) + '...'
        : channel.sender

    // Blockchain icon
    const blockchainIcon = this.getBlockchainIcon(channel.blockchain)

    // Balance progress bar
    const balancePercentage = channel.balancePercentage
    const balanceBarClass = balancePercentage > 70 ? 'high' : balancePercentage > 30 ? 'medium' : 'low'

    return `
      <div class="channel-card ${expirationClass}" data-channel-id="${channel.channelId}">
        <div class="channel-header">
          <div class="channel-id">
            <strong>Channel ID:</strong>
            <code title="${channel.channelId}">${shortId}</code>
            <button class="btn-icon" onclick="channelManager.copyToClipboard('${channel.channelId}')" title="Copy ID">
              📋
            </button>
          </div>
          <div class="channel-blockchain">
            <span class="blockchain-badge">${blockchainIcon} ${channel.blockchain}</span>
          </div>
        </div>

        <div class="channel-body">
          <div class="channel-field">
            <strong>Sender:</strong>
            <span title="${channel.sender}">${shortSender}</span>
          </div>

          <div class="channel-field">
            <strong>Balance:</strong>
            <div class="balance-info">
              <span class="balance-text">${channel.balanceFormatted} / ${channel.capacityFormatted}</span>
              <span class="balance-percentage">(${balancePercentage.toFixed(1)}%)</span>
            </div>
            <div class="balance-bar">
              <div class="balance-bar-fill ${balanceBarClass}" style="width: ${balancePercentage}%"></div>
            </div>
          </div>

          <div class="channel-field">
            <strong>Expires:</strong>
            <span class="expiration-badge ${expirationClass}">${expirationLabel}</span>
            <span class="expiration-time">${channel.timeRemainingHuman}</span>
          </div>

          <div class="channel-field">
            <strong>Status:</strong>
            <span class="status-badge status-${channel.status}">${channel.status.toUpperCase()}</span>
          </div>

          <!-- Expandable Details -->
          <div class="channel-details-toggle">
            <button
              class="btn-link"
              onclick="channelManager.toggleDetails('${channel.channelId}')"
              aria-label="Toggle channel details"
            >
              <span class="details-toggle-text">View Details</span> ▼
            </button>
          </div>

          <div class="channel-details" id="details-${channel.channelId}" style="display: none;">
            <div class="details-row">
              <strong>Full Channel ID:</strong>
              <code>${channel.channelId}</code>
              <button class="btn-icon" onclick="channelManager.copyToClipboard('${channel.channelId}')">📋</button>
            </div>
            <div class="details-row">
              <strong>Sender Address:</strong>
              <code>${channel.sender}</code>
            </div>
            <div class="details-row">
              <strong>Recipient (ILP):</strong>
              <code>${channel.recipient}</code>
            </div>
            <div class="details-row">
              <strong>Capacity:</strong>
              <span>${channel.capacity} base units (${channel.capacityFormatted})</span>
            </div>
            <div class="details-row">
              <strong>Balance:</strong>
              <span>${channel.balance} base units (${channel.balanceFormatted})</span>
            </div>
            <div class="details-row">
              <strong>Highest Nonce:</strong>
              <span>${channel.highestNonce}</span>
            </div>
            <div class="details-row">
              <strong>Expiration:</strong>
              <span>${channel.expirationISO}</span>
            </div>
          </div>
        </div>

        <div class="channel-actions">
          <button
            class="btn btn-secondary btn-small"
            onclick="channelManager.openTopUpModal('${channel.channelId}')"
            title="Top-up via close/reopen workflow (coming soon)"
            disabled
          >
            Top-Up
          </button>
          <button
            class="btn btn-danger btn-small"
            onclick="channelManager.openCloseChannelModal('${channel.channelId}')"
            aria-label="Close channel"
          >
            Close Channel
          </button>
        </div>
      </div>
    `
  }

  /**
   * Get blockchain icon
   * @param {string} blockchain
   * @returns {string} Icon HTML
   */
  getBlockchainIcon(blockchain) {
    const icons = {
      BASE: '🔷',
      BTC: '₿',
      AKT: '☁️',
      XRP: '💧'
    }
    return icons[blockchain] || '🔗'
  }

  /**
   * Get expiration status label
   * @param {string} status
   * @returns {string} Label text
   */
  getExpirationLabel(status) {
    const labels = {
      healthy: 'Healthy',
      expiring_soon: 'Expiring Soon',
      expiring_critical: 'Critical',
      expired: 'Expired'
    }
    return labels[status] || status
  }

  /**
   * Toggle channel details visibility
   * @param {string} channelId
   */
  toggleDetails(channelId) {
    const detailsEl = document.getElementById(`details-${channelId}`)
    if (!detailsEl) return

    const isVisible = detailsEl.style.display !== 'none'
    detailsEl.style.display = isVisible ? 'none' : 'block'

    // Update toggle button text
    const card = document.querySelector(`[data-channel-id="${channelId}"]`)
    const toggleBtn = card.querySelector('.details-toggle-text')
    if (toggleBtn) {
      toggleBtn.textContent = isVisible ? 'View Details' : 'Hide Details'
    }
  }

  /**
   * Update channel count display
   */
  updateCount() {
    if (!this.countElement) return

    const openChannels = this.channels.filter((ch) => ch.status === 'open').length
    this.countElement.textContent = `${openChannels} open channel${openChannels !== 1 ? 's' : ''}`
  }

  /**
   * Show loading indicator
   */
  showLoading() {
    if (this.container) {
      this.container.innerHTML = `
        <div class="loading-indicator">
          <div class="spinner"></div>
          <p>Loading channels...</p>
        </div>
      `
    }
  }

  /**
   * Hide loading indicator
   */
  hideLoading() {
    // Loading indicator is replaced by renderChannels()
  }

  /**
   * Show error message
   * @param {string} message
   */
  showError(message) {
    if (this.container) {
      this.container.innerHTML = `
        <div class="error-state">
          <p class="error-message">${message}</p>
          <button class="btn btn-secondary" onclick="channelManager.loadChannels()">
            Retry
          </button>
        </div>
      `
    }
  }

  /**
   * Copy text to clipboard
   * @param {string} text
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text)
      console.log('Copied to clipboard:', text)
      // TODO: Show toast notification
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }

  /**
   * Open "Open Channel" modal (Task 5)
   */
  openOpenChannelModal() {
    const modalHTML = `
      <div class="modal-overlay">
        <div class="modal" role="dialog" aria-labelledby="open-channel-title">
          <div class="modal-header">
            <h3 id="open-channel-title">Open Payment Channel</h3>
            <button class="btn-close" onclick="channelManager.closeModal()" aria-label="Close modal">×</button>
          </div>
          <div class="modal-body">
            <form id="open-channel-form" onsubmit="channelManager.submitOpenChannel(event)">
              <div class="form-group">
                <label for="blockchain-select">Blockchain:</label>
                <select id="blockchain-select" name="blockchain" required>
                  <option value="BASE" selected>BASE (Ethereum L2)</option>
                  <option value="BTC">Bitcoin</option>
                  <option value="AKT">Akash</option>
                  <option value="XRP">XRP Ledger</option>
                </select>
              </div>
              <div class="form-group">
                <label for="peer-ilp-address">Peer ILP Address:</label>
                <input type="text" id="peer-ilp-address" name="peerIlpAddress" placeholder="g.dassie.alice" required pattern="g\\..+" />
                <small>Format: g.{connector}.{account}</small>
              </div>
              <div class="form-group">
                <label for="peer-base-address">Peer Blockchain Address:</label>
                <input type="text" id="peer-base-address" name="peerBaseAddress" placeholder="0x..." required />
              </div>
              <div class="form-group">
                <label for="deposit-amount">Deposit Amount (base units):</label>
                <input type="text" id="deposit-amount" name="depositAmount" placeholder="1000000000000000000" required pattern="[0-9]+" />
                <small id="amount-hint">1 ETH = 1000000000000000000 wei</small>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="channelManager.closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Open Channel</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `

    document.body.insertAdjacentHTML('beforeend', modalHTML)
    this.activeModal = document.querySelector('.modal-overlay')
    document.getElementById('blockchain-select').focus()
  }

  /**
   * Submit open channel form (Task 5)
   */
  async submitOpenChannel(event) {
    event.preventDefault()
    const form = event.target
    const formData = new FormData(form)

    const data = {
      blockchain: formData.get('blockchain'),
      peerIlpAddress: formData.get('peerIlpAddress'),
      peerBaseAddress: formData.get('peerBaseAddress'),
      depositAmount: formData.get('depositAmount')
    }

    try {
      const submitBtn = form.querySelector('button[type="submit"]')
      submitBtn.disabled = true
      submitBtn.textContent = 'Opening...'

      const response = await fetch('/peer/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to open channel')
      }

      const result = await response.json()
      console.log('Channel opened:', result)

      this.closeModal()
      await this.loadChannels()
      alert(`Channel opened successfully! ID: ${result.channelId}`)
    } catch (error) {
      console.error('Error opening channel:', error)
      alert(`Failed to open channel: ${error.message}`)
      const submitBtn = form.querySelector('button[type="submit"]')
      submitBtn.disabled = false
      submitBtn.textContent = 'Open Channel'
    }
  }

  /**
   * Open "Close Channel" modal (Task 4)
   * @param {string} channelId
   */
  openCloseChannelModal(channelId) {
    const channel = this.channels.find((ch) => ch.channelId === channelId)
    if (!channel) return

    const modalHTML = `
      <div class="modal-overlay">
        <div class="modal" role="dialog" aria-labelledby="close-channel-title">
          <div class="modal-header">
            <h3 id="close-channel-title">Close Payment Channel</h3>
            <button class="btn-close" onclick="channelManager.closeModal()" aria-label="Close modal">×</button>
          </div>
          <div class="modal-body">
            <div class="warning-message">
              <strong>⚠️ Warning:</strong> This will submit an on-chain transaction and may take several minutes.
            </div>
            <p>Are you sure you want to close channel <code>${channelId.substring(0, 16)}...</code>?</p>
            <div class="refund-preview">
              <strong>Estimated Refund:</strong>
              <div class="refund-amount">${channel.balanceFormatted}</div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="channelManager.closeModal()">Cancel</button>
            <button type="button" class="btn btn-danger" onclick="channelManager.confirmCloseChannel('${channelId}')">
              Confirm Close
            </button>
          </div>
        </div>
      </div>
    `

    document.body.insertAdjacentHTML('beforeend', modalHTML)
    this.activeModal = document.querySelector('.modal-overlay')
    this.activeChannel = channelId
  }

  /**
   * Confirm close channel (Task 4)
   */
  async confirmCloseChannel(channelId) {
    try {
      const confirmBtn = this.activeModal.querySelector('.btn-danger')
      confirmBtn.disabled = true
      confirmBtn.textContent = 'Closing...'

      const response = await fetch(`/peer/api/channels/${channelId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to close channel')
      }

      const result = await response.json()
      console.log('Channel closed:', result)

      this.closeModal()
      await this.loadChannels()
      alert(`Channel closed successfully! Refund: ${result.refundAmount}`)
    } catch (error) {
      console.error('Error closing channel:', error)
      alert(`Failed to close channel: ${error.message}`)
      const confirmBtn = this.activeModal.querySelector('.btn-danger')
      confirmBtn.disabled = false
      confirmBtn.textContent = 'Confirm Close'
    }
  }

  /**
   * Open "Top-Up" info modal (Task 6)
   * @param {string} channelId
   */
  openTopUpModal(channelId) {
    const channel = this.channels.find((ch) => ch.channelId === channelId)
    if (!channel) return

    const modalHTML = `
      <div class="modal-overlay">
        <div class="modal" role="dialog" aria-labelledby="topup-title">
          <div class="modal-header">
            <h3 id="topup-title">Top-Up Channel (Coming Soon)</h3>
            <button class="btn-close" onclick="channelManager.closeModal()" aria-label="Close modal">×</button>
          </div>
          <div class="modal-body">
            <div class="info-message">
              <strong>ℹ️ Direct top-up is not yet supported.</strong>
            </div>
            <p>To add funds to this channel, you can close it and open a new channel with a larger deposit.</p>
            <div class="current-channel-info">
              <h4>Current Channel:</h4>
              <div><strong>Capacity:</strong> ${channel.capacityFormatted}</div>
              <div><strong>Balance:</strong> ${channel.balanceFormatted}</div>
            </div>
            <p><strong>Suggested approach:</strong> Close this channel and open a new one with increased capacity.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="channelManager.closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="channelManager.closeAndReopenWorkflow('${channelId}')">
              Close and Reopen
            </button>
          </div>
        </div>
      </div>
    `

    document.body.insertAdjacentHTML('beforeend', modalHTML)
    this.activeModal = document.querySelector('.modal-overlay')
  }

  /**
   * Close and reopen workflow for top-up (Task 6)
   */
  async closeAndReopenWorkflow(channelId) {
    const confirmed = confirm('This will close the current channel and guide you through opening a new one. Continue?')
    if (!confirmed) return

    this.closeModal()
    // Open close modal first
    this.openCloseChannelModal(channelId)
  }

  /**
   * Close active modal
   */
  closeModal() {
    if (this.activeModal) {
      this.activeModal.remove()
      this.activeModal = null
      this.activeChannel = null

      // Resume polling
      if (!this.pollingInterval) {
        this.startPolling()
      }
    }
  }

  /**
   * Cleanup on destroy
   */
  destroy() {
    this.stopPolling()
  }
}

// Global instance
const channelManager = new ChannelManager()
