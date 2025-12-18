/**
 * Event Composer Component
 * Handles event creation, validation, preview, and signing
 */

class EventComposer {
  constructor() {
    this.event = null
    this.signedEvent = null
    this.characterLimits = {
      1: 280, // Short text note
      30023: 10000, // Long-form (10KB soft limit, warn but don't block)
    }
  }

  /**
   * Compose a Nostr event from form inputs
   * @param {string} content - Event content
   * @param {number} kind - Event kind
   * @param {string[]} tags - Optional tags
   * @returns {object} NostrEvent structure (unsigned)
   */
  composeEvent(content, kind, tags = []) {
    const event = {
      id: '', // Will be calculated during signing
      pubkey: '', // Will be set during signing
      created_at: Math.floor(Date.now() / 1000),
      kind: parseInt(kind, 10),
      tags: this.parseTags(tags),
      content: content,
      sig: '', // Will be set during signing
    }

    this.event = event
    return event
  }

  /**
   * Parse tags from comma-separated string
   * @param {string|string[]} tags - Tags input
   * @returns {string[][]} Nostr tags array
   */
  parseTags(tags) {
    if (Array.isArray(tags)) {
      return tags
    }

    if (typeof tags === 'string' && tags.trim()) {
      // Simple hashtag parsing: "tag1, tag2" -> [["t", "tag1"], ["t", "tag2"]]
      return tags
        .split(',')
        .map(t => t.trim().replace(/^#/, ''))
        .filter(t => t.length > 0)
        .map(t => ['t', t])
    }

    return []
  }

  /**
   * Validate event content against character limits
   * @param {string} content - Content to validate
   * @param {number} kind - Event kind
   * @returns {object} { valid: boolean, reason?: string, charCount: number, charLimit: number }
   */
  validateContent(content, kind) {
    const charCount = content.length
    const charLimit = this.characterLimits[kind] || 10000

    if (kind === 1 && charCount > charLimit) {
      return {
        valid: false,
        reason: `Content exceeds ${charLimit} character limit for Kind 1`,
        charCount,
        charLimit,
      }
    }

    if (kind === 30023 && charCount > charLimit) {
      // Soft limit for long-form, just warn
      return {
        valid: true,
        warning: `Content exceeds ${charLimit} characters. Consider using Arweave for storage.`,
        charCount,
        charLimit,
      }
    }

    return {
      valid: true,
      charCount,
      charLimit,
    }
  }

  /**
   * Update the preview pane with current event
   * @param {HTMLElement} previewContainer - Preview container element
   * @param {object} event - Event to preview
   * @param {string} pubkey - User's public key (for preview)
   */
  updatePreview(previewContainer, event, pubkey = 'npub...') {
    if (!previewContainer || !event) return

    const pubkeyEl = previewContainer.querySelector('#preview-pubkey')
    const timestampEl = previewContainer.querySelector('#preview-timestamp')
    const kindEl = previewContainer.querySelector('#preview-kind')
    const bodyEl = previewContainer.querySelector('#preview-body')
    const tagsEl = previewContainer.querySelector('#preview-tags')

    if (pubkeyEl) {
      pubkeyEl.textContent = this.formatPubkey(pubkey)
    }

    if (timestampEl) {
      const date = new Date(event.created_at * 1000)
      timestampEl.textContent = date.toLocaleString()
    }

    if (kindEl) {
      kindEl.textContent = event.kind
    }

    if (bodyEl) {
      // Simple rendering - could add markdown support for kind 30023
      if (event.kind === 30023) {
        // Very basic markdown-like rendering
        bodyEl.innerHTML = this.renderMarkdown(event.content)
      } else {
        bodyEl.textContent = event.content
      }
    }

    if (tagsEl) {
      // Use secure tag rendering to prevent XSS
      tagsEl.innerHTML = this.renderTagsSecure(event.tags)
    }
  }

  /**
   * Format pubkey for display (truncate middle)
   * @param {string} pubkey - Public key
   * @returns {string} Formatted pubkey
   */
  formatPubkey(pubkey) {
    if (!pubkey || pubkey === 'npub...') return 'npub...'
    if (pubkey.length > 20) {
      return pubkey.slice(0, 10) + '...' + pubkey.slice(-10)
    }
    return pubkey
  }

  /**
   * Very basic markdown rendering (for preview only)
   * SECURITY: Escapes HTML first, then applies markdown formatting
   * @param {string} content - Markdown content
   * @returns {string} HTML
   */
  renderMarkdown(content) {
    // First escape all HTML to prevent XSS
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    // Then apply safe markdown formatting on escaped content
    return escaped
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>')
  }

  /**
   * Safely render tags to prevent XSS
   * @param {string[][]} tags - Event tags
   * @returns {string} HTML string with escaped content
   */
  renderTagsSecure(tags) {
    if (!tags || tags.length === 0) {
      return '<span class="muted">No tags</span>'
    }

    return tags
      .map(tag => {
        const escapedKey = this.escapeHtml(tag[0])
        const escapedValue = this.escapeHtml(tag[1] || '')
        return `<span class="tag">${escapedKey}: ${escapedValue}</span>`
      })
      .join(' ')
  }

  /**
   * Escape HTML to prevent XSS attacks
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (!text) return ''
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  /**
   * Calculate cost to publish event
   * @param {number} kind - Event kind
   * @param {number} contentSize - Content size in bytes
   * @returns {Promise<object>} Cost breakdown { costMsats, breakdown }
   */
  async calculateCost(kind, contentSize) {
    try {
      const response = await fetch(
        `/peer/api/cost?kind=${kind}&size=${contentSize}`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch cost')
      }
      return await response.json()
    } catch (error) {
      console.error('Cost calculation error:', error)
      return {
        costMsats: 0,
        breakdown: { relayFee: 0, sizeFee: 0, arweaveCost: 0 },
        error: error.message,
      }
    }
  }

  /**
   * Convert msats to USD (approximate)
   * @param {number} msats - Amount in millisatoshis
   * @param {number} btcUsdRate - BTC/USD exchange rate
   * @returns {string} USD amount
   */
  msatsToUsd(msats, btcUsdRate = 45000) {
    const btc = msats / 100000000000 // 1 BTC = 100,000,000,000 msats
    const usd = btc * btcUsdRate
    return usd.toFixed(4)
  }

  /**
   * Get the current unsigned event
   * @returns {object|null} Current event
   */
  getEvent() {
    return this.event
  }

  /**
   * Set the signed event
   * @param {object} signedEvent - Signed Nostr event
   */
  setSignedEvent(signedEvent) {
    this.signedEvent = signedEvent
  }

  /**
   * Get the signed event
   * @returns {object|null} Signed event
   */
  getSignedEvent() {
    return this.signedEvent
  }

  /**
   * Reset the composer state
   */
  reset() {
    this.event = null
    this.signedEvent = null
  }
}

// Export for use in peer.js
if (typeof window !== 'undefined') {
  window.EventComposer = EventComposer
}
