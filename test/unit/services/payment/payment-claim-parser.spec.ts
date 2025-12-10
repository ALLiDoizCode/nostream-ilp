import {
import { PaymentClaim } from '@/@types/payment-claim'
import { describe, expect, it } from 'vitest'

  extractPaymentClaim,
  isValidAmount,
  isValidChannelId,
  isValidCurrency,
  isValidNonce,
  isValidSignature,
  NostrEvent,
  validateClaimFormat,
} from '@/services/payment/payment-claim-parser'
describe('extractPaymentClaim', () => {
  describe('valid payment claims', () => {
    it('should extract BTC payment claim with Lightning channel ID', () => {
      const event: NostrEvent = {
        id: 'abc123def456',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'lnbc1p0xq3wnpp5j0v8z', '1000', '42', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
          ['p', 'mentioned_pubkey'],
        ],
        content: 'Hello paid Nostr!',
        sig: 'event_signature_hex',
      }

      const claim = extractPaymentClaim(event)

      expect(claim).not.toBeNull()
      expect(claim).toEqual({
        channelId: 'lnbc1p0xq3wnpp5j0v8z',
        amountSats: 1000,
        nonce: 42,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC',
      })
    })

    it('should extract BASE payment claim with contract address format', () => {
      const event: NostrEvent = {
        id: 'def456abc789',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000100,
        kind: 1,
        tags: [
          ['payment', 'ilp', '0x1234567890abcdef1234567890abcdef12345678:42', '5000', '128', '304502210a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b20220c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0', 'BASE'],
        ],
        content: 'Paid with BASE',
        sig: 'event_signature_hex',
      }

      const claim = extractPaymentClaim(event)

      expect(claim).not.toBeNull()
      expect(claim?.channelId).toBe('0x1234567890abcdef1234567890abcdef12345678:42')
      expect(claim?.currency).toBe('BASE')
    })

    it('should extract AKT payment claim with CosmWasm contract format', () => {
      const event: NostrEvent = {
        id: 'ghi789jkl012',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000200,
        kind: 30023,
        tags: [
          ['d', 'my-article'],
          ['title', 'My Article'],
          ['payment', 'ilp', 'akash1qj5y3z2h9x8w7v6u5t4s3r2q1p0o9n8m7l6k5j:10', '10000', '256', '3046022100b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2022100c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3', 'AKT'],
        ],
        content: 'Article content',
        sig: 'event_signature_hex',
      }

      const claim = extractPaymentClaim(event)

      expect(claim).not.toBeNull()
      expect(claim?.currency).toBe('AKT')
      expect(claim?.amountSats).toBe(10000)
    })

    it('should extract XRP payment claim with XRP channel ID format', () => {
      const event: NostrEvent = {
        id: 'mno345pqr678',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000300,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6C7D8E9F0A1B2', '2000', '64', '304502210d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d102202e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f', 'XRP'],
        ],
        content: 'Paid with XRP',
        sig: 'event_signature_hex',
      }

      const claim = extractPaymentClaim(event)

      expect(claim).not.toBeNull()
      expect(claim?.currency).toBe('XRP')
    })

    it('should extract payment claim at beginning of tags array', () => {
      const event: NostrEvent = {
        id: 'test1',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_test1', '1000', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
          ['p', 'some_pubkey'],
        ],
        content: 'Content',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).not.toBeNull()
    })

    it('should extract payment claim in middle of tags array', () => {
      const event: NostrEvent = {
        id: 'test2',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['p', 'pubkey1'],
          ['payment', 'ilp', 'channel_test2', '1000', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
          ['e', 'event_id'],
        ],
        content: 'Content',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).not.toBeNull()
    })

    it('should extract payment claim at end of tags array', () => {
      const event: NostrEvent = {
        id: 'test3',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['p', 'pubkey1'],
          ['e', 'event_id'],
          ['payment', 'ilp', 'channel_test3', '1000', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
        ],
        content: 'Content',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).not.toBeNull()
    })

    it('should handle nonce = 0 (first payment in channel)', () => {
      const event: NostrEvent = {
        id: 'test_nonce_zero',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_new', '100', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
        ],
        content: 'First payment',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).not.toBeNull()
      expect(claim?.nonce).toBe(0)
    })

    it('should handle amount = 1 (minimum valid payment)', () => {
      const event: NostrEvent = {
        id: 'test_min_amount',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_min', '1', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
        ],
        content: 'Minimum payment',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).not.toBeNull()
      expect(claim?.amountSats).toBe(1)
    })

    it('should handle amount = MAX_SAFE_INTEGER', () => {
      const event: NostrEvent = {
        id: 'test_max_amount',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_max', String(Number.MAX_SAFE_INTEGER), '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
        ],
        content: 'Maximum payment',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).not.toBeNull()
      expect(claim?.amountSats).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('should handle payment tag with extra fields (length > 7)', () => {
      const event: NostrEvent = {
        id: 'test_extra_fields',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_extra', '1000', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC', 'extra_field1', 'extra_field2'],
        ],
        content: 'Extra fields',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).not.toBeNull()
      expect(claim?.currency).toBe('BTC')
    })
  })

  describe('invalid payment claims', () => {
    it('should return null for event with no payment tag', () => {
      const event: NostrEvent = {
        id: 'no_payment',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['p', 'some_pubkey'],
          ['e', 'some_event'],
        ],
        content: 'Free event',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })

    it('should return null for payment tag with wrong length (< 7 fields)', () => {
      const event: NostrEvent = {
        id: 'short_tag',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_short', '1000'],
        ],
        content: 'Malformed payment',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })

    it('should return null for payment tag with negative amount', () => {
      const event: NostrEvent = {
        id: 'negative_amount',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_neg', '-1000', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
        ],
        content: 'Negative amount',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })

    it('should return null for payment tag with zero amount', () => {
      const event: NostrEvent = {
        id: 'zero_amount',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_zero', '0', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
        ],
        content: 'Zero amount',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })

    it('should return null for payment tag with non-numeric amount', () => {
      const event: NostrEvent = {
        id: 'non_numeric_amount',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_nonnumeric', 'abc', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
        ],
        content: 'Non-numeric amount',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })

    it('should return null for payment tag with negative nonce', () => {
      const event: NostrEvent = {
        id: 'negative_nonce',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_negnonce', '1000', '-1', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
        ],
        content: 'Negative nonce',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })

    it('should return null for payment tag with non-numeric nonce', () => {
      const event: NostrEvent = {
        id: 'non_numeric_nonce',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_nonnumericnonce', '1000', 'xyz', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
        ],
        content: 'Non-numeric nonce',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })

    it('should return null for payment tag with too short signature', () => {
      const event: NostrEvent = {
        id: 'short_sig',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_shortsig', '1000', '0', '304402207f8b', 'BTC'],
        ],
        content: 'Short signature',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })

    it('should return null for payment tag with non-hex signature', () => {
      const event: NostrEvent = {
        id: 'non_hex_sig',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_nonhexsig', '1000', '0', 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ', 'BTC'],
        ],
        content: 'Non-hex signature',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })

    it('should return null for payment tag with unsupported currency', () => {
      const event: NostrEvent = {
        id: 'unsupported_currency',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_unsupported', '1000', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'ETH'],
        ],
        content: 'Unsupported currency',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })

    it('should return null for payment tag with lowercase currency', () => {
      const event: NostrEvent = {
        id: 'lowercase_currency',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_lowercase', '1000', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'btc'],
        ],
        content: 'Lowercase currency',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })

    it('should return null for payment tag with empty channelId', () => {
      const event: NostrEvent = {
        id: 'empty_channel',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', '', '1000', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
        ],
        content: 'Empty channel',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('should use first valid payment tag when multiple exist', () => {
      const event: NostrEvent = {
        id: 'multiple_tags',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', 'channel_first', '1000', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
          ['payment', 'ilp', 'channel_second', '2000', '1', '304502210a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b20220c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0', 'BTC'],
        ],
        content: 'Multiple payments',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).not.toBeNull()
      expect(claim?.channelId).toBe('channel_first')
    })

    it('should handle empty tags array', () => {
      const event: NostrEvent = {
        id: 'empty_tags',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [],
        content: 'No tags',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })

    it('should handle very long channelId (within limits)', () => {
      const longChannelId = 'a'.repeat(256)
      const event: NostrEvent = {
        id: 'long_channel',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', longChannelId, '1000', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
        ],
        content: 'Long channel ID',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).not.toBeNull()
      expect(claim?.channelId.length).toBe(256)
    })

    it('should reject channelId exceeding max length', () => {
      const tooLongChannelId = 'a'.repeat(257)
      const event: NostrEvent = {
        id: 'too_long_channel',
        pubkey: 'user_pubkey_hex',
        created_at: 1700000000,
        kind: 1,
        tags: [
          ['payment', 'ilp', tooLongChannelId, '1000', '0', '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031', 'BTC'],
        ],
        content: 'Too long channel ID',
        sig: 'sig',
      }

      const claim = extractPaymentClaim(event)
      expect(claim).toBeNull()
    })
  })
})

describe('validateClaimFormat', () => {
  describe('valid claims', () => {
    it('should validate a valid BTC claim', () => {
      const claim: PaymentClaim = {
        channelId: 'channel_abc123',
        amountSats: 1000,
        nonce: 42,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC',
      }

      expect(validateClaimFormat(claim)).toBe(true)
    })

    it('should validate a valid BASE claim with long channelId', () => {
      const claim: PaymentClaim = {
        channelId: '0x1234567890abcdef1234567890abcdef12345678:42',
        amountSats: 5000,
        nonce: 128,
        signature: '304502210a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b20220c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
        currency: 'BASE',
      }

      expect(validateClaimFormat(claim)).toBe(true)
    })

    it('should validate a valid AKT claim with nonce = 0', () => {
      const claim: PaymentClaim = {
        channelId: 'akash1qj5y3z2h9x8w7v6u5t4s3r2q1p0o9n8m7l6k5j:10',
        amountSats: 10000,
        nonce: 0,
        signature: '3046022100b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2022100c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3',
        currency: 'AKT',
      }

      expect(validateClaimFormat(claim)).toBe(true)
    })

    it('should validate a valid XRP claim with max safe integer amount', () => {
      const claim: PaymentClaim = {
        channelId: 'A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6C7D8E9F0A1B2',
        amountSats: Number.MAX_SAFE_INTEGER,
        nonce: 999,
        signature: '304502210d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d102202e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f',
        currency: 'XRP',
      }

      expect(validateClaimFormat(claim)).toBe(true)
    })
  })

  describe('invalid channelId', () => {
    it('should reject empty channelId', () => {
      const claim = {
        channelId: '',
        amountSats: 1000,
        nonce: 0,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject channelId that is too short', () => {
      const claim = {
        channelId: 'short',
        amountSats: 1000,
        nonce: 0,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject null channelId', () => {
      const claim = {
        channelId: null as any,
        amountSats: 1000,
        nonce: 0,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject undefined channelId', () => {
      const claim = {
        channelId: undefined as any,
        amountSats: 1000,
        nonce: 0,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })
  })

  describe('invalid amountSats', () => {
    it('should reject zero amount', () => {
      const claim = {
        channelId: 'channel_zero_amount',
        amountSats: 0,
        nonce: 0,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject negative amount', () => {
      const claim = {
        channelId: 'channel_neg_amount',
        amountSats: -1000,
        nonce: 0,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject non-integer amount', () => {
      const claim = {
        channelId: 'channel_float_amount',
        amountSats: 1000.5,
        nonce: 0,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject amount greater than MAX_SAFE_INTEGER', () => {
      const claim = {
        channelId: 'channel_huge_amount',
        amountSats: Number.MAX_SAFE_INTEGER + 1,
        nonce: 0,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })
  })

  describe('invalid nonce', () => {
    it('should reject negative nonce', () => {
      const claim = {
        channelId: 'channel_neg_nonce',
        amountSats: 1000,
        nonce: -1,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject non-integer nonce', () => {
      const claim = {
        channelId: 'channel_float_nonce',
        amountSats: 1000,
        nonce: 42.5,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject nonce greater than MAX_SAFE_INTEGER', () => {
      const claim = {
        channelId: 'channel_huge_nonce',
        amountSats: 1000,
        nonce: Number.MAX_SAFE_INTEGER + 1,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })
  })

  describe('invalid signature', () => {
    it('should reject empty signature', () => {
      const claim = {
        channelId: 'channel_empty_sig',
        amountSats: 1000,
        nonce: 0,
        signature: '',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject signature that is too short', () => {
      const claim = {
        channelId: 'channel_short_sig',
        amountSats: 1000,
        nonce: 0,
        signature: '304402207f8b',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject signature with non-hex characters', () => {
      const claim = {
        channelId: 'channel_nonhex_sig',
        amountSats: 1000,
        nonce: 0,
        signature: 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject signature with 0x prefix', () => {
      const claim = {
        channelId: 'channel_0x_sig',
        amountSats: 1000,
        nonce: 0,
        signature: '0x04402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject null signature', () => {
      const claim = {
        channelId: 'channel_null_sig',
        amountSats: 1000,
        nonce: 0,
        signature: null as any,
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject undefined signature', () => {
      const claim = {
        channelId: 'channel_undefined_sig',
        amountSats: 1000,
        nonce: 0,
        signature: undefined as any,
        currency: 'BTC' as const,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })
  })

  describe('invalid currency', () => {
    it('should reject empty currency', () => {
      const claim = {
        channelId: 'channel_empty_curr',
        amountSats: 1000,
        nonce: 0,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: '' as any,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject unsupported currency', () => {
      const claim = {
        channelId: 'channel_unsupported_curr',
        amountSats: 1000,
        nonce: 0,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'ETH' as any,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject lowercase currency', () => {
      const claim = {
        channelId: 'channel_lowercase_curr',
        amountSats: 1000,
        nonce: 0,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: 'btc' as any,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject null currency', () => {
      const claim = {
        channelId: 'channel_null_curr',
        amountSats: 1000,
        nonce: 0,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: null as any,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })

    it('should reject undefined currency', () => {
      const claim = {
        channelId: 'channel_undefined_curr',
        amountSats: 1000,
        nonce: 0,
        signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031',
        currency: undefined as any,
      }

      expect(validateClaimFormat(claim)).toBe(false)
    })
  })
})

describe('helper validation functions', () => {
  describe('isValidChannelId', () => {
    it('should accept valid channel IDs', () => {
      expect(isValidChannelId('channel_abc123')).toBe(true)
      expect(isValidChannelId('lnbc1p0xq3wnpp5j0v8z')).toBe(true)
      expect(isValidChannelId('0x1234567890abcdef1234567890abcdef12345678:42')).toBe(true)
    })

    it('should reject invalid channel IDs', () => {
      expect(isValidChannelId('')).toBe(false)
      expect(isValidChannelId('short')).toBe(false)
      expect(isValidChannelId(null)).toBe(false)
      expect(isValidChannelId(undefined)).toBe(false)
      expect(isValidChannelId('a'.repeat(257))).toBe(false)
    })
  })

  describe('isValidAmount', () => {
    it('should accept valid amounts', () => {
      expect(isValidAmount(1)).toBe(true)
      expect(isValidAmount(1000)).toBe(true)
      expect(isValidAmount(Number.MAX_SAFE_INTEGER)).toBe(true)
    })

    it('should reject invalid amounts', () => {
      expect(isValidAmount(0)).toBe(false)
      expect(isValidAmount(-1)).toBe(false)
      expect(isValidAmount(1.5)).toBe(false)
      expect(isValidAmount(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
      expect(isValidAmount(null as any)).toBe(false)
      expect(isValidAmount(undefined as any)).toBe(false)
    })
  })

  describe('isValidNonce', () => {
    it('should accept valid nonces', () => {
      expect(isValidNonce(0)).toBe(true)
      expect(isValidNonce(42)).toBe(true)
      expect(isValidNonce(Number.MAX_SAFE_INTEGER)).toBe(true)
    })

    it('should reject invalid nonces', () => {
      expect(isValidNonce(-1)).toBe(false)
      expect(isValidNonce(1.5)).toBe(false)
      expect(isValidNonce(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
      expect(isValidNonce(null as any)).toBe(false)
      expect(isValidNonce(undefined as any)).toBe(false)
    })
  })

  describe('isValidSignature', () => {
    it('should accept valid signatures', () => {
      expect(isValidSignature('304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031')).toBe(true)
      expect(isValidSignature('304502210a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b20220c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0')).toBe(true)
    })

    it('should reject invalid signatures', () => {
      expect(isValidSignature('')).toBe(false)
      expect(isValidSignature('304402207f8b')).toBe(false)
      expect(isValidSignature('0x04402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901020304050607080910111213141516171819202122232425262728293031')).toBe(false)
      expect(isValidSignature('ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ')).toBe(false)
      expect(isValidSignature(null as any)).toBe(false)
      expect(isValidSignature(undefined as any)).toBe(false)
    })
  })

  describe('isValidCurrency', () => {
    it('should accept valid currencies', () => {
      expect(isValidCurrency('BTC')).toBe(true)
      expect(isValidCurrency('BASE')).toBe(true)
      expect(isValidCurrency('AKT')).toBe(true)
      expect(isValidCurrency('XRP')).toBe(true)
    })

    it('should reject invalid currencies', () => {
      expect(isValidCurrency('ETH')).toBe(false)
      expect(isValidCurrency('btc')).toBe(false)
      expect(isValidCurrency('')).toBe(false)
      expect(isValidCurrency(null)).toBe(false)
      expect(isValidCurrency(undefined)).toBe(false)
    })
  })
})
