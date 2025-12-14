import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseClient } from '../../../src/@types/base'
import { FreeTierRepository } from '../../../src/repositories/free-tier-repository'

describe('FreeTierRepository', () => {
  let mockDbClient: DatabaseClient
  let repository: FreeTierRepository

  beforeEach(() => {
    // Create mock database client with Knex-like interface
    mockDbClient = vi.fn() as any
    mockDbClient.raw = vi.fn()

    repository = new FreeTierRepository(mockDbClient)
  })

  describe('getEventCount', () => {
    it('should return event count for existing pubkey', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ event_count: 50 }),
        }),
      })

      mockDbClient = vi.fn().mockReturnValue({ select: mockSelect }) as any
      repository = new FreeTierRepository(mockDbClient)

      const count = await repository.getEventCount('test-pubkey')

      expect(count).toBe(50)
      expect(mockDbClient).toHaveBeenCalledWith('pubkey_event_counts')
    })

    it('should return 0 for non-existent pubkey', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(undefined),
        }),
      })

      mockDbClient = vi.fn().mockReturnValue({ select: mockSelect }) as any
      repository = new FreeTierRepository(mockDbClient)

      const count = await repository.getEventCount('non-existent-pubkey')

      expect(count).toBe(0)
    })
  })

  describe('incrementEventCount', () => {
    it('should call database raw with correct SQL for increment', async () => {
      const mockRaw = vi.fn().mockResolvedValue(undefined)
      mockDbClient.raw = mockRaw

      await repository.incrementEventCount('test-pubkey')

      expect(mockRaw).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO pubkey_event_counts'),
        expect.arrayContaining(['test-pubkey'])
      )
      expect(mockRaw).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array)
      )
    })
  })

  describe('isWhitelisted', () => {
    it('should return true for whitelisted pubkey', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ exists: true }),
        }),
      })

      mockDbClient = vi.fn().mockReturnValue({ select: mockSelect }) as any
      mockDbClient.raw = vi.fn((sql: string) => sql)
      repository = new FreeTierRepository(mockDbClient)

      const result = await repository.isWhitelisted('whitelisted-pubkey')

      expect(result).toBe(true)
      expect(mockDbClient).toHaveBeenCalledWith('free_tier_whitelist')
    })

    it('should return false for non-whitelisted pubkey', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(undefined),
        }),
      })

      mockDbClient = vi.fn().mockReturnValue({ select: mockSelect }) as any
      mockDbClient.raw = vi.fn((sql: string) => sql)
      repository = new FreeTierRepository(mockDbClient)

      const result = await repository.isWhitelisted('non-whitelisted-pubkey')

      expect(result).toBe(false)
    })
  })

  describe('addToWhitelist', () => {
    it('should call database raw with correct SQL for adding to whitelist', async () => {
      const mockRaw = vi.fn().mockResolvedValue(undefined)
      mockDbClient.raw = mockRaw

      await repository.addToWhitelist('test-pubkey', 'Test description')

      expect(mockRaw).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO free_tier_whitelist'),
        expect.arrayContaining(['test-pubkey', 'Test description'])
      )
      expect(mockRaw).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array)
      )
    })
  })

  describe('removeFromWhitelist', () => {
    it('should call database delete for removing from whitelist', async () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined)
      const mockWhere = vi.fn().mockReturnValue({ delete: mockDelete })

      mockDbClient = vi.fn().mockReturnValue({ where: mockWhere }) as any
      repository = new FreeTierRepository(mockDbClient)

      await repository.removeFromWhitelist('test-pubkey')

      expect(mockDbClient).toHaveBeenCalledWith('free_tier_whitelist')
      expect(mockWhere).toHaveBeenCalledWith('pubkey', 'test-pubkey')
      expect(mockDelete).toHaveBeenCalled()
    })
  })
})
