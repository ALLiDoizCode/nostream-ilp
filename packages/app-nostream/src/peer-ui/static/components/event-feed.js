/**
 * Event Feed Component
 * Handles event display, filtering, infinite scroll, and real-time updates
 */

class EventFeed {
  constructor() {
    this.events = []
    this.filters = {
      authors: [],
      kinds: [],
      since: null,
      until: null,
    }
    this.pagination = {
      offset: 0,
      limit: 50,
      hasMore: true,
    }
    this.isLoading = false
    this.isPaused = false
    this.newestEventTimestamp = 0
    this.newEventCount = 0
    this.pollingInterval = null
    this.intersectionObserver = null

    // Bind methods
    this.loadEvents = this.loadEvents.bind(this)
    this.loadMoreEvents = this.loadMoreEvents.bind(this)
    this.loadNewEvents = this.loadNewEvents.bind(this)
    this.applyFilters = this.applyFilters.bind(this)
    this.clearFilters = this.clearFilters.bind(this)
    this.handleScroll = this.handleScroll.bind(this)
    this.pollForNewEvents = this.pollForNewEvents.bind(this)
  }

  /**
   * Initialize the event feed
   * @param {HTMLElement} container - Container element for event list
   * @param {HTMLElement} loadingIndicator - Loading spinner element
   * @param {HTMLElement} sentinelElement - Sentinel for intersection observer
   */
  async init(container, loadingIndicator, sentinelElement) {
    this.container = container
    this.loadingIndicator = loadingIndicator
    this.sentinelElement = sentinelElement

    // Set up intersection observer for infinite scroll
    this.setupIntersectionObserver()

    // Set up scroll handler for auto-pause
    window.addEventListener('scroll', this.handleScroll)

    // Load initial events
    await this.loadEvents()

    // Start polling for new events
    this.startPolling()
  }

  /**
   * Set up Intersection Observer API for infinite scroll
   */
  setupIntersectionObserver() {
    if (!this.sentinelElement) return

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.isLoading && this.pagination.hasMore) {
            this.loadMoreEvents()
          }
        })
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0.1,
      }
    )

    this.intersectionObserver.observe(this.sentinelElement)
  }

  /**
   * Handle scroll events to pause/resume real-time updates
   */
  handleScroll() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    this.isPaused = scrollTop > 200 // Pause if scrolled down more than 200px
  }

  /**
   * Start polling for new events every 5 seconds
   */
  startPolling() {
    this.pollingInterval = setInterval(this.pollForNewEvents, 5000)
  }

  /**
   * Stop polling for new events
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  /**
   * Poll for new events since the most recent event
   */
  async pollForNewEvents() {
    if (this.isPaused || this.isLoading || this.newestEventTimestamp === 0) {
      return
    }

    try {
      const params = new URLSearchParams({
        limit: '25',
        since: (this.newestEventTimestamp + 1).toString(),
      })

      // Add filters if active
      if (this.filters.authors.length > 0) {
        params.append('authors', this.filters.authors.join(','))
      }
      if (this.filters.kinds.length > 0) {
        params.append('kinds', this.filters.kinds.join(','))
      }

      const response = await fetch(`/peer/api/events?${params.toString()}`)
      if (!response.ok) {
        console.error('Failed to fetch new events:', response.status)
        return
      }

      const data = await response.json()
      if (data.events && data.events.length > 0) {
        // Update newest timestamp
        data.events.forEach((event) => {
          if (event.created_at > this.newestEventTimestamp) {
            this.newestEventTimestamp = event.created_at
          }
        })

        // Prepend new events
        this.events = [...data.events, ...this.events]

        // Limit in-memory events to 200
        if (this.events.length > 200) {
          this.events = this.events.slice(0, 200)
        }

        // Show notification or auto-prepend
        if (this.isPaused) {
          this.newEventCount += data.events.length
          this.showNewEventNotification(this.newEventCount)
        } else {
          this.prependEvents(data.events)
        }
      }
    } catch (error) {
      console.error('Error polling for new events:', error)
    }
  }

  /**
   * Load events from API
   */
  async loadEvents() {
    if (this.isLoading) return

    this.isLoading = true
    this.showLoading()

    try {
      const params = new URLSearchParams({
        limit: this.pagination.limit.toString(),
        offset: this.pagination.offset.toString(),
      })

      // Add filters
      if (this.filters.authors.length > 0) {
        params.append('authors', this.filters.authors.join(','))
      }
      if (this.filters.kinds.length > 0) {
        params.append('kinds', this.filters.kinds.join(','))
      }
      if (this.filters.since) {
        params.append('since', this.filters.since.toString())
      }
      if (this.filters.until) {
        params.append('until', this.filters.until.toString())
      }

      const response = await fetch(`/peer/api/events?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      // Store events
      this.events = data.events || []
      this.pagination.hasMore = data.hasMore || false

      // Update newest timestamp
      if (this.events.length > 0) {
        this.newestEventTimestamp = Math.max(...this.events.map((e) => e.created_at))
      }

      // Render events
      this.clearFeed()
      this.appendEvents(this.events)
    } catch (error) {
      console.error('Error loading events:', error)
      this.showError('Failed to load events. Please try again.')
    } finally {
      this.isLoading = false
      this.hideLoading()
    }
  }

  /**
   * Load more events (infinite scroll)
   */
  async loadMoreEvents() {
    if (this.isLoading || !this.pagination.hasMore) return

    this.isLoading = true
    this.showLoading()

    try {
      this.pagination.offset += this.pagination.limit

      const params = new URLSearchParams({
        limit: this.pagination.limit.toString(),
        offset: this.pagination.offset.toString(),
      })

      // Add filters
      if (this.filters.authors.length > 0) {
        params.append('authors', this.filters.authors.join(','))
      }
      if (this.filters.kinds.length > 0) {
        params.append('kinds', this.filters.kinds.join(','))
      }
      if (this.filters.since) {
        params.append('since', this.filters.since.toString())
      }
      if (this.filters.until) {
        params.append('until', this.filters.until.toString())
      }

      const response = await fetch(`/peer/api/events?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      // Append new events
      const newEvents = data.events || []
      this.events = [...this.events, ...newEvents]
      this.pagination.hasMore = data.hasMore || false

      // Render new events
      this.appendEvents(newEvents)
    } catch (error) {
      console.error('Error loading more events:', error)
      this.showError('Failed to load more events. Please try again.')
    } finally {
      this.isLoading = false
      this.hideLoading()
    }
  }

  /**
   * Load and display new events (manual refresh)
   */
  async loadNewEvents() {
    this.newEventCount = 0
    this.hideNewEventNotification()

    // Reload feed from beginning
    this.pagination.offset = 0
    await this.loadEvents()

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /**
   * Apply filters to event feed
   * @param {Object} filters - Filter object { authors, kinds, since, until }
   */
  async applyFilters(filters) {
    this.filters = { ...filters }
    this.pagination.offset = 0
    this.pagination.hasMore = true
    await this.loadEvents()
  }

  /**
   * Clear all filters and reload feed
   */
  async clearFilters() {
    this.filters = {
      authors: [],
      kinds: [],
      since: null,
      until: null,
    }
    this.pagination.offset = 0
    this.pagination.hasMore = true
    await this.loadEvents()
  }

  /**
   * Render a single event
   * @param {Object} event - Nostr event
   * @returns {string} HTML string
   */
  renderEvent(event) {
    const eventId = this.escapeHtml(event.id)
    const pubkey = this.escapeHtml(event.pubkey)
    const pubkeyShort = `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`
    const timestamp = this.formatTimestamp(event.created_at)
    const timestampAbs = new Date(event.created_at * 1000).toLocaleString()
    const kind = event.kind
    const kindLabel = this.getKindLabel(kind)
    const content = this.renderContent(event.content, kind)
    const tags = this.renderTags(event.tags)

    // Check for Arweave reference
    const arweaveTag = event.tags.find((t) => t[0] === 'arweave')
    const arweaveLink = arweaveTag
      ? `<div class="arweave-link">
           <a href="https://arweave.net/${this.escapeHtml(arweaveTag[1])}" target="_blank" rel="noopener noreferrer">
             View on Arweave
           </a>
         </div>`
      : ''

    const eventIdShort = `${eventId.slice(0, 8)}...${eventId.slice(-8)}`

    return `
      <div class="event-card" data-event-id="${eventId}">
        <div class="event-header">
          <div class="event-author">
            <span class="author-pubkey" title="${pubkey}">${pubkeyShort}</span>
            <span class="event-timestamp" title="${timestampAbs}">${timestamp}</span>
          </div>
          <div class="event-kind-badge kind-${kind}">${kindLabel}</div>
        </div>
        <div class="event-body">
          ${content}
        </div>
        ${arweaveLink}
        <div class="event-tags">
          ${tags}
        </div>
        <div class="event-footer">
          <span class="event-id" title="${eventId}">ID: ${eventIdShort}</span>
          <button class="btn-copy-id" data-event-id="${eventId}" title="Copy event ID">
            Copy ID
          </button>
        </div>
      </div>
    `
  }

  /**
   * Render event content with truncation and expand/collapse
   * @param {string} content - Event content
   * @param {number} kind - Event kind
   * @returns {string} HTML string
   */
  renderContent(content, kind) {
    const escapedContent = this.escapeHtml(content)
    const maxLength = 500

    if (!escapedContent || escapedContent.trim() === '') {
      return '<p class="event-content-empty">Content stored on Arweave</p>'
    }

    // Render markdown for long-form
    if (kind === 30023) {
      return `<div class="event-content markdown">${this.renderMarkdown(escapedContent)}</div>`
    }

    // Truncate long content
    if (escapedContent.length > maxLength) {
      const truncated = escapedContent.slice(0, maxLength)
      return `
        <div class="event-content">
          <div class="content-truncated">
            ${this.nl2br(truncated)}...
          </div>
          <button class="btn-expand-content">Show more</button>
        </div>
      `
    }

    return `<div class="event-content">${this.nl2br(escapedContent)}</div>`
  }

  /**
   * Render event tags
   * @param {Array} tags - Nostr tags array
   * @returns {string} HTML string
   */
  renderTags(tags) {
    if (!tags || tags.length === 0) return ''

    const relevantTags = tags.filter((t) => ['e', 'p', 't', 'arweave'].includes(t[0]))
    const displayLimit = 5

    const tagHtml = relevantTags
      .slice(0, displayLimit)
      .map((tag) => {
        const [key, value] = tag
        const escapedKey = this.escapeHtml(key)
        const escapedValue = this.escapeHtml(value || '')
        const valueShort =
          escapedValue.length > 16 ? `${escapedValue.slice(0, 8)}...${escapedValue.slice(-8)}` : escapedValue

        return `<span class="tag tag-${escapedKey}" title="${escapedKey}: ${escapedValue}">${escapedKey}: ${valueShort}</span>`
      })
      .join(' ')

    const moreTagsCount = relevantTags.length - displayLimit
    const moreTags = moreTagsCount > 0 ? `<span class="tag tag-more">+${moreTagsCount} more</span>` : ''

    return `${tagHtml} ${moreTags}`
  }

  /**
   * Append events to the feed
   * @param {Array} events - Array of events to append
   */
  appendEvents(events) {
    if (!events || events.length === 0) return

    const fragment = document.createDocumentFragment()
    events.forEach((event) => {
      const div = document.createElement('div')
      div.innerHTML = this.renderEvent(event)
      fragment.appendChild(div.firstElementChild)
    })

    this.container.appendChild(fragment)

    // Attach event listeners for copy buttons
    this.attachEventListeners()
  }

  /**
   * Prepend events to the feed (for real-time updates)
   * @param {Array} events - Array of events to prepend
   */
  prependEvents(events) {
    if (!events || events.length === 0) return

    const fragment = document.createDocumentFragment()
    events.forEach((event) => {
      const div = document.createElement('div')
      div.innerHTML = this.renderEvent(event)
      fragment.appendChild(div.firstElementChild)
    })

    this.container.insertBefore(fragment, this.container.firstChild)

    // Attach event listeners for copy buttons
    this.attachEventListeners()
  }

  /**
   * Clear all events from the feed
   */
  clearFeed() {
    this.container.innerHTML = ''
  }

  /**
   * Attach event listeners to event cards
   */
  attachEventListeners() {
    // Copy ID buttons
    const copyButtons = this.container.querySelectorAll('.btn-copy-id')
    copyButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const eventId = e.target.getAttribute('data-event-id')
        navigator.clipboard.writeText(eventId).then(() => {
          e.target.textContent = 'Copied!'
          setTimeout(() => {
            e.target.textContent = 'Copy ID'
          }, 2000)
        })
      })
    })

    // Expand content buttons
    const expandButtons = this.container.querySelectorAll('.btn-expand-content')
    expandButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const eventCard = e.target.closest('.event-card')
        const truncatedDiv = eventCard.querySelector('.content-truncated')
        const eventId = eventCard.getAttribute('data-event-id')
        const event = this.events.find((ev) => ev.id === eventId)

        if (event) {
          truncatedDiv.innerHTML = this.nl2br(this.escapeHtml(event.content))
          e.target.remove()
        }
      })
    })
  }

  /**
   * Show loading indicator
   */
  showLoading() {
    if (this.loadingIndicator) {
      this.loadingIndicator.classList.remove('hidden')
    }
  }

  /**
   * Hide loading indicator
   */
  hideLoading() {
    if (this.loadingIndicator) {
      this.loadingIndicator.classList.add('hidden')
    }
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    const errorDiv = document.getElementById('error-message')
    if (errorDiv) {
      errorDiv.textContent = message
      errorDiv.classList.remove('hidden')
      setTimeout(() => {
        errorDiv.classList.add('hidden')
      }, 5000)
    }
  }

  /**
   * Show new event notification
   * @param {number} count - Number of new events
   */
  showNewEventNotification(count) {
    let notification = document.getElementById('new-event-notification')
    if (!notification) {
      notification = document.createElement('div')
      notification.id = 'new-event-notification'
      notification.className = 'new-event-notification'
      this.container.parentElement.insertBefore(notification, this.container)
    }

    notification.innerHTML = `
      <span>${count} new event${count > 1 ? 's' : ''}</span>
      <button id="load-new-events-btn" class="btn btn-small">Load new events</button>
    `

    notification.classList.remove('hidden')

    // Attach click handler
    document.getElementById('load-new-events-btn').addEventListener('click', this.loadNewEvents)
  }

  /**
   * Hide new event notification
   */
  hideNewEventNotification() {
    const notification = document.getElementById('new-event-notification')
    if (notification) {
      notification.classList.add('hidden')
    }
  }

  /**
   * Get kind label for display
   * @param {number} kind - Event kind
   * @returns {string} Kind label
   */
  getKindLabel(kind) {
    const labels = {
      1: 'Short Note',
      4: 'DM',
      7: 'Reaction',
      30023: 'Article',
      1063: 'File',
      71: 'Video',
      22: 'Short Video',
      20: 'Picture',
    }
    return labels[kind] || `Kind ${kind}`
  }

  /**
   * Format Unix timestamp to relative time
   * @param {number} timestamp - Unix timestamp
   * @returns {string} Relative time string
   */
  formatTimestamp(timestamp) {
    const now = Math.floor(Date.now() / 1000)
    const diff = now - timestamp

    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`

    return new Date(timestamp * 1000).toLocaleDateString()
  }

  /**
   * Simple markdown renderer (basic support)
   * @param {string} text - Markdown text
   * @returns {string} HTML string
   */
  renderMarkdown(text) {
    let html = text
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Newlines
    html = this.nl2br(html)
    return html
  }

  /**
   * Convert newlines to <br> tags
   * @param {string} text - Text with newlines
   * @returns {string} HTML with <br> tags
   */
  nl2br(text) {
    return text.replace(/\n/g, '<br>')
  }

  /**
   * Escape HTML entities
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Destroy event feed (cleanup)
   */
  destroy() {
    this.stopPolling()
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect()
    }
    window.removeEventListener('scroll', this.handleScroll)
  }
}

// Make available globally
window.EventFeed = EventFeed
