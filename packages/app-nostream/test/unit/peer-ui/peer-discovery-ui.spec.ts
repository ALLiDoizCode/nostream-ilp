import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import fs from 'fs'
import path from 'path'

/**
 * Unit Tests: Peer Discovery UI Component
 *
 * Tests for peer discovery JavaScript component:
 * - Search bar rendering
 * - Peer card rendering
 * - Pagination logic
 * - Loading states
 *
 * Reference: docs/stories/9.6.story.md#Task 2
 */

describe('Peer Discovery UI Component', () => {
  let dom: JSDOM
  let document: Document
  let window: Window
  let PeerDiscovery: any
  let peerDiscovery: any

  beforeEach(() => {
    // Create a DOM environment
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="peer-discovery-container">
            <div class="search-bar"></div>
            <div class="search-results"></div>
            <div class="pagination"></div>
          </div>
          <div id="peer-details-modal" class="modal">
            <div class="modal-body"></div>
          </div>
        </body>
      </html>
    `, {
      url: 'http://localhost',
      runScripts: 'dangerously',
      resources: 'usable',
    })

    document = dom.window.document
    window = dom.window as unknown as Window

    // Make globals available
    global.document = document
    global.window = window
    global.navigator = window.navigator

    // Load the peer-discovery component
    const componentPath = path.join(__dirname, '../../../src/peer-ui/static/components/peer-discovery.js')
    const componentCode = fs.readFileSync(componentPath, 'utf-8')

    // Execute the component code in the JSDOM context
    const scriptElement = document.createElement('script')
    scriptElement.textContent = componentCode
    document.body.appendChild(scriptElement)

    // Get the PeerDiscovery class and instance from window
    PeerDiscovery = (window as any).PeerDiscovery
    peerDiscovery = (window as any).peerDiscovery
  })

  afterEach(() => {
    // Clean up
    dom.window.close()
  })

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      expect(peerDiscovery).toBeDefined()
      expect(peerDiscovery.peers).toEqual([])
      expect(peerDiscovery.isLoading).toBe(false)
      expect(peerDiscovery.searchQuery).toBe('')
      expect(peerDiscovery.currentPage).toBe(0)
      expect(peerDiscovery.limit).toBe(20)
      expect(peerDiscovery.totalResults).toBe(0)
    })

    it('should render search bar on init', async () => {
      const container = document.getElementById('peer-discovery-container')
      await peerDiscovery.init(container)

      const searchInput = document.getElementById('peer-search-input')
      const searchButton = document.getElementById('peer-search-button')

      expect(searchInput).toBeTruthy()
      expect(searchButton).toBeTruthy()
      expect(searchInput?.getAttribute('placeholder')).toContain('Search by pubkey')
    })

    it('should render initial empty state', async () => {
      const container = document.getElementById('peer-discovery-container')
      await peerDiscovery.init(container)

      const resultsContainer = container?.querySelector('.search-results')
      expect(resultsContainer?.textContent).toContain('Enter a search term')
    })
  })

  describe('Search Bar', () => {
    beforeEach(async () => {
      const container = document.getElementById('peer-discovery-container')
      await peerDiscovery.init(container)
    })

    it('should render search input with correct attributes', () => {
      const searchInput = document.getElementById('peer-search-input') as HTMLInputElement

      expect(searchInput).toBeTruthy()
      expect(searchInput.type).toBe('text')
      expect(searchInput.getAttribute('aria-label')).toContain('Search for peers')
    })

    it('should render search button', () => {
      const searchButton = document.getElementById('peer-search-button')

      expect(searchButton).toBeTruthy()
      expect(searchButton?.textContent?.trim()).toBe('Search')
    })

    it('should render search status element', () => {
      const searchStatus = document.getElementById('search-status')

      expect(searchStatus).toBeTruthy()
      expect(searchStatus?.getAttribute('role')).toBe('status')
      expect(searchStatus?.getAttribute('aria-live')).toBe('polite')
    })
  })

  describe('Peer Card Rendering', () => {
    it('should render peer card with operator name', () => {
      const peer = {
        pubkey: '0'.repeat(64),
        ilpAddress: 'g.btp-nips.alice.npub1abc',
        endpoint: 'https://alice-node.akash.network',
        operatorName: 'Alice\'s Relay',
        uptime: 99.9,
        features: ['subscriptions', 'payments'],
      }

      const cardHtml = peerDiscovery.renderPeerCard(peer)

      expect(cardHtml).toContain('Alice\'s Relay')
      expect(cardHtml).toContain('g.btp-nips.alice.npub1abc')
      expect(cardHtml).toContain('https://alice-node.akash.network')
    })

    it('should render peer card without operator name', () => {
      const peer = {
        pubkey: '0'.repeat(64),
        ilpAddress: 'g.btp-nips.bob.npub1def',
        endpoint: 'https://bob-node.akash.network',
        features: [],
      }

      const cardHtml = peerDiscovery.renderPeerCard(peer)

      expect(cardHtml).toContain('Unknown Operator')
    })

    it('should truncate long pubkey', () => {
      const peer = {
        pubkey: 'abcd1234'.repeat(8), // 64 chars
        ilpAddress: 'g.btp-nips.test',
        endpoint: 'https://test.com',
        features: [],
      }

      const cardHtml = peerDiscovery.renderPeerCard(peer)

      // Should contain truncated version
      expect(cardHtml).toContain('abcd1234')
      expect(cardHtml).toContain('...')
    })

    it('should render uptime badge with correct color', () => {
      const highUptimePeer = {
        pubkey: '0'.repeat(64),
        ilpAddress: 'g.btp-nips.test',
        endpoint: 'https://test.com',
        uptime: 99.9,
        features: [],
      }

      const cardHtml = peerDiscovery.renderPeerCard(highUptimePeer)

      expect(cardHtml).toContain('badge-success')
      expect(cardHtml).toContain('99.9% uptime')
    })

    it('should render feature badges', () => {
      const peer = {
        pubkey: '0'.repeat(64),
        ilpAddress: 'g.btp-nips.test',
        endpoint: 'https://test.com',
        features: ['subscriptions', 'payments', 'routing'],
      }

      const cardHtml = peerDiscovery.renderPeerCard(peer)

      expect(cardHtml).toContain('subscriptions')
      expect(cardHtml).toContain('payments')
      expect(cardHtml).toContain('routing')
      expect(cardHtml).toContain('badge-feature')
    })
  })

  describe('Uptime Badge', () => {
    it('should render green badge for high uptime (>= 95%)', () => {
      const badge = peerDiscovery.renderUptimeBadge(99.9)

      expect(badge).toContain('badge-success')
      expect(badge).toContain('99.9% uptime')
    })

    it('should render yellow badge for medium uptime (80-95%)', () => {
      const badge = peerDiscovery.renderUptimeBadge(85.0)

      expect(badge).toContain('badge-warning')
      expect(badge).toContain('85.0% uptime')
    })

    it('should render red badge for low uptime (< 80%)', () => {
      const badge = peerDiscovery.renderUptimeBadge(70.5)

      expect(badge).toContain('badge-danger')
      expect(badge).toContain('70.5% uptime')
    })
  })

  describe('Pagination', () => {
    beforeEach(async () => {
      const container = document.getElementById('peer-discovery-container')
      await peerDiscovery.init(container)
    })

    it('should not render pagination when no results', () => {
      peerDiscovery.totalResults = 0
      peerDiscovery.renderPagination()

      const pagination = document.querySelector('.pagination')
      expect(pagination?.innerHTML).toBe('')
    })

    it('should render pagination with correct page numbers', () => {
      peerDiscovery.totalResults = 50
      peerDiscovery.limit = 20
      peerDiscovery.currentPage = 0
      peerDiscovery.renderPagination()

      const paginationInfo = document.querySelector('.pagination-info')
      expect(paginationInfo?.textContent).toContain('Page 1 of 3')
      expect(paginationInfo?.textContent).toContain('50 total')
    })

    it('should disable Previous button on first page', () => {
      peerDiscovery.totalResults = 50
      peerDiscovery.currentPage = 0
      peerDiscovery.renderPagination()

      const prevButton = document.querySelector('.pagination-controls button:first-child')
      expect(prevButton?.hasAttribute('disabled')).toBe(true)
    })

    it('should disable Next button on last page', () => {
      peerDiscovery.totalResults = 50
      peerDiscovery.limit = 20
      peerDiscovery.currentPage = 2 // Last page (0-indexed)
      peerDiscovery.renderPagination()

      const nextButton = document.querySelector('.pagination-controls button:last-child')
      expect(nextButton?.hasAttribute('disabled')).toBe(true)
    })

    it('should enable both buttons on middle page', () => {
      peerDiscovery.totalResults = 100
      peerDiscovery.limit = 20
      peerDiscovery.currentPage = 2 // Middle page
      peerDiscovery.renderPagination()

      const buttons = document.querySelectorAll('.pagination-controls button')
      expect(buttons[0].hasAttribute('disabled')).toBe(false)
      expect(buttons[1].hasAttribute('disabled')).toBe(false)
    })
  })

  describe('Loading States', () => {
    beforeEach(async () => {
      const container = document.getElementById('peer-discovery-container')
      await peerDiscovery.init(container)
    })

    it('should show loading message', () => {
      peerDiscovery.showLoading()

      const status = document.getElementById('search-status')
      expect(status?.textContent).toBe('Searching...')
    })

    it('should update search status', () => {
      peerDiscovery.updateSearchStatus('Found 5 peers')

      const status = document.getElementById('search-status')
      expect(status?.textContent).toBe('Found 5 peers')
    })

    it('should show error message', () => {
      peerDiscovery.showError('Search failed')

      const status = document.getElementById('search-status')
      expect(status?.textContent).toBe('Search failed')
    })
  })

  describe('Helper Methods', () => {
    it('should truncate pubkey correctly', () => {
      const fullPubkey = 'abcdefgh12345678'.repeat(4) // 64 chars
      const truncated = peerDiscovery.truncatePubkey(fullPubkey)

      expect(truncated).toBe('abcdefgh...12345678')
      expect(truncated.length).toBeLessThan(fullPubkey.length)
    })

    it('should not truncate short pubkey', () => {
      const shortPubkey = 'abc123'
      const truncated = peerDiscovery.truncatePubkey(shortPubkey)

      expect(truncated).toBe(shortPubkey)
    })

    it('should truncate ILP address correctly', () => {
      const longAddress = 'g.btp-nips.alice.npub1abcdefghijklmnopqrstuvwxyz123456789'
      const truncated = peerDiscovery.truncateAddress(longAddress)

      expect(truncated).toContain('...')
      expect(truncated.length).toBeLessThan(longAddress.length)
    })

    it('should escape HTML to prevent XSS', () => {
      const malicious = '<script>alert("xss")</script>'
      const escaped = peerDiscovery.escapeHtml(malicious)

      expect(escaped).not.toContain('<script>')
      expect(escaped).toContain('&lt;script&gt;')
    })

    it('should format timestamp to relative time', () => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()

      const formatted = peerDiscovery.formatTimestamp(oneHourAgo)

      expect(formatted).toContain('hour')
      expect(formatted).toContain('ago')
    })

    it('should calculate payment success rate', () => {
      const reputation = {
        totalPayments: 100,
        failedPayments: 5,
        uptime: 99.0,
        averageResponseTime: 250,
        reliability: 95.0,
      }

      const successRate = peerDiscovery.calculatePaymentSuccessRate(reputation)

      expect(successRate).toBe('95.0')
    })

    it('should return 100% success rate when no payments', () => {
      const reputation = {
        totalPayments: 0,
        failedPayments: 0,
        uptime: 99.0,
        averageResponseTime: 0,
        reliability: 100.0,
      }

      const successRate = peerDiscovery.calculatePaymentSuccessRate(reputation)

      expect(successRate).toBe('100')
    })
  })

  describe('Reliability Badge', () => {
    it('should render green badge for high reliability (>= 90)', () => {
      const badge = peerDiscovery.renderReliabilityBadge(95.5)

      expect(badge).toContain('badge-success')
      expect(badge).toContain('95.5%')
    })

    it('should render yellow badge for medium reliability (70-90)', () => {
      const badge = peerDiscovery.renderReliabilityBadge(80.0)

      expect(badge).toContain('badge-warning')
      expect(badge).toContain('80.0%')
    })

    it('should render red badge for low reliability (< 70)', () => {
      const badge = peerDiscovery.renderReliabilityBadge(60.0)

      expect(badge).toContain('badge-danger')
      expect(badge).toContain('60.0%')
    })
  })
})
