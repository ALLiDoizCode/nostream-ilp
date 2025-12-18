/**
 * Peer Discovery Component
 * Handles peer search, display, and connection workflows
 *
 * Reference: docs/stories/9.6.story.md#Task 2
 */

class PeerDiscovery {
  constructor() {
    this.peers = []
    this.isLoading = false
    this.searchQuery = ''
    this.currentPage = 0
    this.limit = 20
    this.totalResults = 0
    this.debounceTimer = null

    // Modal state
    this.activeModal = null
    this.selectedPeer = null

    // Bind methods
    this.search = this.search.bind(this)
    this.handleSearchInput = this.handleSearchInput.bind(this)
    this.handleSearchSubmit = this.handleSearchSubmit.bind(this)
    this.renderSearchBar = this.renderSearchBar.bind(this)
    this.renderSearchResults = this.renderSearchResults.bind(this)
    this.renderPeerCard = this.renderPeerCard.bind(this)
    this.renderPagination = this.renderPagination.bind(this)
    this.nextPage = this.nextPage.bind(this)
    this.previousPage = this.previousPage.bind(this)
    this.openPeerDetailsModal = this.openPeerDetailsModal.bind(this)
    this.closeModal = this.closeModal.bind(this)
  }

  /**
   * Initialize the peer discovery component
   * @param {HTMLElement} container - Container element for peer discovery UI
   */
  async init(container) {
    this.container = container

    // Render search bar
    this.renderSearchBar()

    // Set up modal event listeners
    this.setupModals()

    // Initial empty state
    this.renderSearchResults()
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
   * Render search bar
   */
  renderSearchBar() {
    const searchBarContainer = this.container.querySelector('.search-bar')
    if (!searchBarContainer) return

    searchBarContainer.innerHTML = `
      <div class="search-input-group">
        <input
          type="text"
          id="peer-search-input"
          class="search-input"
          placeholder="Search by pubkey, operator name, or node ID"
          aria-label="Search for peers by pubkey, operator name, or node ID"
        />
        <button
          id="peer-search-button"
          class="btn btn-primary"
          aria-label="Search"
        >
          Search
        </button>
      </div>
      <div id="search-status" class="search-status" role="status" aria-live="polite"></div>
    `

    // Add event listeners
    const searchInput = document.getElementById('peer-search-input')
    const searchButton = document.getElementById('peer-search-button')

    searchInput.addEventListener('input', this.handleSearchInput)
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleSearchSubmit()
      }
    })
    searchButton.addEventListener('click', this.handleSearchSubmit)
  }

  /**
   * Handle search input with debouncing
   * @param {Event} e - Input event
   */
  handleSearchInput(e) {
    const query = e.target.value.trim()

    // Clear previous debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    // Debounce search by 300ms
    this.debounceTimer = setTimeout(() => {
      if (query.length > 0) {
        this.searchQuery = query
        this.currentPage = 0
        this.search()
      } else {
        // Clear results if query is empty
        this.searchQuery = ''
        this.peers = []
        this.totalResults = 0
        this.renderSearchResults()
        this.updateSearchStatus('Enter a search term to find peers')
      }
    }, 300)
  }

  /**
   * Handle search button click (immediate search)
   */
  handleSearchSubmit() {
    const searchInput = document.getElementById('peer-search-input')
    const query = searchInput.value.trim()

    if (query.length === 0) {
      this.updateSearchStatus('Please enter a search term')
      return
    }

    this.searchQuery = query
    this.currentPage = 0
    this.search()
  }

  /**
   * Search for peers
   */
  async search() {
    if (this.isLoading || !this.searchQuery) return

    this.isLoading = true
    this.showLoading()

    try {
      const offset = this.currentPage * this.limit
      const url = `/peer/api/discovery/search?query=${encodeURIComponent(this.searchQuery)}&limit=${this.limit}&offset=${offset}`

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`)
      }

      const data = await response.json()

      this.peers = data.peers || []
      this.totalResults = data.total || 0

      this.renderSearchResults()
      this.renderPagination()

      if (this.totalResults === 0) {
        this.updateSearchStatus(`No peers found matching "${this.searchQuery}"`)
      } else if (this.totalResults === 1) {
        this.updateSearchStatus(`Found 1 peer`)
      } else {
        this.updateSearchStatus(`Found ${this.totalResults} peers`)
      }
    } catch (error) {
      console.error('Error searching for peers:', error)
      this.showError('Failed to search for peers')
      this.updateSearchStatus('Search failed. Please try again.')
    } finally {
      this.isLoading = false
      this.hideLoading()
    }
  }

  /**
   * Render search results
   */
  renderSearchResults() {
    const resultsContainer = this.container.querySelector('.search-results')
    if (!resultsContainer) return

    if (this.peers.length === 0 && !this.searchQuery) {
      // Initial empty state
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <p>Enter a search term to discover peers on the BTP-NIPs network</p>
        </div>
      `
      return
    }

    if (this.peers.length === 0 && this.searchQuery) {
      // No results
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <p>No peers found matching "${this.escapeHtml(this.searchQuery)}"</p>
          <p class="text-muted">Try a different search term</p>
        </div>
      `
      return
    }

    // Render peer cards
    const cards = this.peers.map((peer) => this.renderPeerCard(peer)).join('')
    resultsContainer.innerHTML = `
      <div class="peer-cards" role="list">
        ${cards}
      </div>
    `
  }

  /**
   * Render individual peer card
   * @param {Object} peer - Peer data
   * @returns {string} - HTML string
   */
  renderPeerCard(peer) {
    const pubkeyShort = this.truncatePubkey(peer.pubkey)
    const ilpAddressShort = this.truncateAddress(peer.ilpAddress)
    const operatorName = peer.operatorName || 'Unknown Operator'
    const uptime = peer.uptime !== undefined ? peer.uptime : null
    const uptimeBadge = uptime !== null ? this.renderUptimeBadge(uptime) : ''
    const features = peer.features || []
    const featureBadges = features.map((f) => `<span class="badge badge-feature">${this.escapeHtml(f)}</span>`).join(' ')

    return `
      <div class="peer-card" role="listitem" tabindex="0" onclick="peerDiscovery.openPeerDetailsModal('${peer.pubkey}')" onkeydown="if(event.key==='Enter') peerDiscovery.openPeerDetailsModal('${peer.pubkey}')">
        <div class="peer-card-header">
          <h3 class="peer-operator-name">${this.escapeHtml(operatorName)}</h3>
          ${uptimeBadge}
        </div>
        <div class="peer-card-body">
          <div class="peer-info-row">
            <span class="peer-info-label">Pubkey:</span>
            <span class="peer-info-value monospace" title="${peer.pubkey}">${pubkeyShort}</span>
          </div>
          <div class="peer-info-row">
            <span class="peer-info-label">ILP Address:</span>
            <span class="peer-info-value monospace" title="${peer.ilpAddress}">${ilpAddressShort}</span>
          </div>
          <div class="peer-info-row">
            <span class="peer-info-label">Endpoint:</span>
            <span class="peer-info-value">${this.escapeHtml(peer.endpoint)}</span>
          </div>
          ${features.length > 0 ? `
          <div class="peer-info-row">
            <span class="peer-info-label">Features:</span>
            <span class="peer-info-value">${featureBadges}</span>
          </div>
          ` : ''}
        </div>
        <div class="peer-card-footer">
          <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); peerDiscovery.openPeerDetailsModal('${peer.pubkey}')">
            View Details
          </button>
        </div>
      </div>
    `
  }

  /**
   * Render uptime badge with color coding
   * @param {number} uptime - Uptime percentage (0-100)
   * @returns {string} - HTML string
   */
  renderUptimeBadge(uptime) {
    let badgeClass = 'badge-danger'
    if (uptime >= 95) {
      badgeClass = 'badge-success'
    } else if (uptime >= 80) {
      badgeClass = 'badge-warning'
    }

    return `<span class="badge ${badgeClass}" title="Uptime: ${uptime}%">
      ${uptime.toFixed(1)}% uptime
    </span>`
  }

  /**
   * Render pagination controls
   */
  renderPagination() {
    const paginationContainer = this.container.querySelector('.pagination')
    if (!paginationContainer) return

    if (this.totalResults === 0) {
      paginationContainer.innerHTML = ''
      return
    }

    const totalPages = Math.ceil(this.totalResults / this.limit)
    const currentPage = this.currentPage + 1 // Display as 1-indexed
    const hasPrevious = this.currentPage > 0
    const hasNext = this.currentPage < totalPages - 1

    paginationContainer.innerHTML = `
      <div class="pagination-controls">
        <button
          class="btn btn-sm btn-secondary"
          ${!hasPrevious ? 'disabled' : ''}
          onclick="peerDiscovery.previousPage()"
          aria-label="Previous page"
        >
          Previous
        </button>
        <span class="pagination-info">
          Page ${currentPage} of ${totalPages} (${this.totalResults} total)
        </span>
        <button
          class="btn btn-sm btn-secondary"
          ${!hasNext ? 'disabled' : ''}
          onclick="peerDiscovery.nextPage()"
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    `
  }

  /**
   * Go to next page
   */
  nextPage() {
    const totalPages = Math.ceil(this.totalResults / this.limit)
    if (this.currentPage < totalPages - 1) {
      this.currentPage++
      this.search()
    }
  }

  /**
   * Go to previous page
   */
  previousPage() {
    if (this.currentPage > 0) {
      this.currentPage--
      this.search()
    }
  }

  /**
   * Open peer details modal
   * @param {string} pubkey - Peer's pubkey
   */
  async openPeerDetailsModal(pubkey) {
    if (!pubkey) return

    this.selectedPeer = null
    this.activeModal = 'peer-details'

    // Show modal with loading state
    const modal = document.getElementById('peer-details-modal')
    if (!modal) {
      console.error('Peer details modal not found')
      return
    }

    modal.classList.add('active')

    const modalContent = modal.querySelector('.modal-body')
    modalContent.innerHTML = '<div class="loading">Loading peer details...</div>'

    try {
      // Fetch full peer details
      const response = await fetch(`/peer/api/discovery/peer/${pubkey}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch peer details: ${response.status}`)
      }

      const data = await response.json()
      this.selectedPeer = data.peer
      this.renderPeerDetailsModal(data)
    } catch (error) {
      console.error('Error loading peer details:', error)
      modalContent.innerHTML = `
        <div class="error-state">
          <p>Failed to load peer details</p>
          <button class="btn btn-secondary" onclick="peerDiscovery.closeModal()">Close</button>
        </div>
      `
    }
  }

  /**
   * Render peer details modal content
   * @param {Object} data - Peer details data (peer, connectionStatus, reputation)
   */
  renderPeerDetailsModal(data) {
    const { peer, connectionStatus, reputation } = data
    const modal = document.getElementById('peer-details-modal')
    const modalContent = modal.querySelector('.modal-body')

    const uptimeBadge = reputation.uptime !== undefined ? this.renderUptimeBadge(reputation.uptime) : ''
    const reliabilityBadge = this.renderReliabilityBadge(reputation.reliability)
    const features = peer.features || []
    const supportedTokens = peer.supportedTokens || []

    modalContent.innerHTML = `
      <div class="peer-details">
        <div class="peer-details-header">
          <h2>${this.escapeHtml(peer.metadata?.operatorName || 'Peer Details')}</h2>
          ${peer.metadata?.nodeId ? `<p class="text-muted">Node ID: ${this.escapeHtml(peer.metadata.nodeId)}</p>` : ''}
        </div>

        <div class="peer-details-section">
          <h3>Connection Information</h3>
          <div class="peer-info-grid">
            <div class="peer-info-item">
              <span class="peer-info-label">Pubkey:</span>
              <span class="peer-info-value monospace copyable" title="Click to copy" onclick="peerDiscovery.copyToClipboard('${peer.pubkey}')">${peer.pubkey}</span>
            </div>
            <div class="peer-info-item">
              <span class="peer-info-label">ILP Address:</span>
              <span class="peer-info-value monospace copyable" title="Click to copy" onclick="peerDiscovery.copyToClipboard('${peer.ilpAddress}')">${peer.ilpAddress}</span>
            </div>
            <div class="peer-info-item">
              <span class="peer-info-label">HTTPS Endpoint:</span>
              <span class="peer-info-value"><a href="${peer.endpoint}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(peer.endpoint)}</a></span>
            </div>
            <div class="peer-info-item">
              <span class="peer-info-label">Base Address:</span>
              <span class="peer-info-value monospace copyable" title="Click to copy" onclick="peerDiscovery.copyToClipboard('${peer.baseAddress}')">${peer.baseAddress}</span>
            </div>
            <div class="peer-info-item">
              <span class="peer-info-label">Protocol Version:</span>
              <span class="peer-info-value">${this.escapeHtml(peer.version)}</span>
            </div>
          </div>
        </div>

        ${supportedTokens.length > 0 ? `
        <div class="peer-details-section">
          <h3>Supported Tokens</h3>
          <div class="badge-group">
            ${supportedTokens.map((token) => `<span class="badge badge-info">${this.escapeHtml(token)}</span>`).join(' ')}
          </div>
        </div>
        ` : ''}

        ${features.length > 0 ? `
        <div class="peer-details-section">
          <h3>Features</h3>
          <div class="badge-group">
            ${features.map((feature) => `<span class="badge badge-feature">${this.escapeHtml(feature)}</span>`).join(' ')}
          </div>
        </div>
        ` : ''}

        <div class="peer-details-section">
          <h3>Connection Status</h3>
          <div class="connection-status">
            <div class="status-item">
              <span class="status-indicator ${connectionStatus.hasSubscription ? 'status-active' : 'status-inactive'}"></span>
              <span>${connectionStatus.hasSubscription ? 'Subscribed' : 'Not subscribed'}</span>
            </div>
            <div class="status-item">
              <span class="status-indicator ${connectionStatus.hasChannel ? 'status-active' : 'status-inactive'}"></span>
              <span>${connectionStatus.hasChannel ? 'Channel open' : 'No channel'}</span>
            </div>
            ${connectionStatus.lastContact ? `
            <div class="status-item">
              <span class="peer-info-label">Last Contact:</span>
              <span>${this.formatTimestamp(connectionStatus.lastContact)}</span>
            </div>
            ` : ''}
          </div>
        </div>

        <div class="peer-details-section">
          <h3>Reputation Metrics</h3>
          <div class="reputation-metrics">
            <div class="metric-card">
              <div class="metric-label">Uptime</div>
              <div class="metric-value">${uptimeBadge}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Reliability Score</div>
              <div class="metric-value">${reliabilityBadge}</div>
            </div>
            ${reputation.totalPayments > 0 ? `
            <div class="metric-card">
              <div class="metric-label">Payment Success Rate</div>
              <div class="metric-value">${this.calculatePaymentSuccessRate(reputation)}%</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Avg Response Time</div>
              <div class="metric-value">${reputation.averageResponseTime}ms</div>
            </div>
            ` : ''}
          </div>
        </div>

        ${peer.metadata?.description ? `
        <div class="peer-details-section">
          <h3>Description</h3>
          <p>${this.escapeHtml(peer.metadata.description)}</p>
        </div>
        ` : ''}

        ${peer.metadata?.contactEmail || peer.metadata?.website ? `
        <div class="peer-details-section">
          <h3>Contact</h3>
          ${peer.metadata.contactEmail ? `<p>Email: <a href="mailto:${peer.metadata.contactEmail}">${this.escapeHtml(peer.metadata.contactEmail)}</a></p>` : ''}
          ${peer.metadata.website ? `<p>Website: <a href="${peer.metadata.website}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(peer.metadata.website)}</a></p>` : ''}
        </div>
        ` : ''}

        <div class="peer-details-actions">
          ${!connectionStatus.hasSubscription ? `
          <button class="btn btn-primary" onclick="peerDiscovery.openConnectModal('${peer.pubkey}', 'subscription')">
            Subscribe to Peer
          </button>
          ` : ''}
          ${!connectionStatus.hasChannel ? `
          <button class="btn btn-primary" onclick="peerDiscovery.openConnectModal('${peer.pubkey}', 'channel')">
            Open Payment Channel
          </button>
          ` : ''}
          <button class="btn btn-secondary" onclick="peerDiscovery.closeModal()">
            Close
          </button>
        </div>
      </div>
    `
  }

  /**
   * Render reliability badge with color coding
   * @param {number} reliability - Reliability score (0-100)
   * @returns {string} - HTML string
   */
  renderReliabilityBadge(reliability) {
    let badgeClass = 'badge-danger'
    if (reliability >= 90) {
      badgeClass = 'badge-success'
    } else if (reliability >= 70) {
      badgeClass = 'badge-warning'
    }

    return `<span class="badge ${badgeClass}">${reliability.toFixed(1)}%</span>`
  }

  /**
   * Calculate payment success rate
   * @param {Object} reputation - Reputation data
   * @returns {number} - Success rate percentage
   */
  calculatePaymentSuccessRate(reputation) {
    if (reputation.totalPayments === 0) return 100
    const successRate = ((reputation.totalPayments - reputation.failedPayments) / reputation.totalPayments) * 100
    return successRate.toFixed(1)
  }

  /**
   * Open connect modal (placeholder - will be implemented in Task 4)
   * @param {string} pubkey - Peer's pubkey
   * @param {string} type - Connection type ('subscription' or 'channel')
   */
  openConnectModal(pubkey, type) {
    console.log('Opening connect modal:', pubkey, type)
    // TODO: Implement in Task 4
    alert(`Connect modal not yet implemented (Task 4).\nPeer: ${pubkey}\nType: ${type}`)
  }

  /**
   * Close active modal
   */
  closeModal() {
    if (!this.activeModal) return

    const modal = document.getElementById('peer-details-modal')
    if (modal) {
      modal.classList.remove('active')
    }

    this.activeModal = null
    this.selectedPeer = null
  }

  /**
   * Update search status message
   * @param {string} message - Status message
   */
  updateSearchStatus(message) {
    const statusElement = document.getElementById('search-status')
    if (statusElement) {
      statusElement.textContent = message
    }
  }

  /**
   * Show loading indicator
   */
  showLoading() {
    this.updateSearchStatus('Searching...')
  }

  /**
   * Hide loading indicator
   */
  hideLoading() {
    // Status is updated by search results
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    this.updateSearchStatus(message)
  }

  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   */
  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      // Show temporary success message
      const tempMsg = document.createElement('div')
      tempMsg.className = 'copy-success'
      tempMsg.textContent = 'Copied!'
      document.body.appendChild(tempMsg)
      setTimeout(() => tempMsg.remove(), 2000)
    }).catch((err) => {
      console.error('Failed to copy:', err)
    })
  }

  /**
   * Format ISO timestamp to relative time
   * @param {string} timestamp - ISO timestamp
   * @returns {string} - Formatted time
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
    return 'Just now'
  }

  /**
   * Truncate pubkey to 16 characters
   * @param {string} pubkey - Full pubkey
   * @returns {string} - Truncated pubkey
   */
  truncatePubkey(pubkey) {
    if (!pubkey || pubkey.length <= 16) return pubkey
    return `${pubkey.substring(0, 8)}...${pubkey.substring(pubkey.length - 8)}`
  }

  /**
   * Truncate ILP address
   * @param {string} address - Full ILP address
   * @returns {string} - Truncated address
   */
  truncateAddress(address) {
    if (!address || address.length <= 40) return address
    return `${address.substring(0, 20)}...${address.substring(address.length - 12)}`
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text
   */
  escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

// Global instance
const peerDiscovery = new PeerDiscovery()
