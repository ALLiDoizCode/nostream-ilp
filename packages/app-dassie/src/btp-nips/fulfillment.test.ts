import { describe, it, expect } from 'vitest'
import { sha256 } from '@noble/hashes/sha2.js'
import {
  serializeResponse,
  createFulfillment,
  createRejection,
  verifyFulfillment,
  ILP_ERROR_CODES,
} from './fulfillment.js'
import type { BtpNipsResponse, NostrEvent } from './types.js'

describe('fulfillment - serializeResponse', () => {
  it('should serialize OK response', () => {
    const response: BtpNipsResponse = {
      type: 'OK',
      eventId: 'abc123',
      accepted: true,
      message: '',
    }

    const serialized = serializeResponse(response)
    expect(JSON.parse(serialized)).toEqual(['OK', 'abc123', true, ''])
  })

  it('should serialize OK rejection response', () => {
    const response: BtpNipsResponse = {
      type: 'OK',
      eventId: 'abc123',
      accepted: false,
      message: 'duplicate: event already exists',
    }

    const serialized = serializeResponse(response)
    expect(JSON.parse(serialized)).toEqual(['OK', 'abc123', false, 'duplicate: event already exists'])
  })

  it('should serialize EOSE response', () => {
    const response: BtpNipsResponse = {
      type: 'EOSE',
      subId: 'sub_123',
    }

    const serialized = serializeResponse(response)
    expect(JSON.parse(serialized)).toEqual(['EOSE', 'sub_123'])
  })

  it('should serialize EVENT response', () => {
    const event: NostrEvent = {
      id: 'event123',
      pubkey: 'pubkey123',
      created_at: 1234567890,
      kind: 1,
      tags: [],
      content: 'Hello',
      sig: 'sig123',
    }

    const response: BtpNipsResponse = {
      type: 'EVENT',
      subId: 'sub_123',
      event,
    }

    const serialized = serializeResponse(response)
    expect(JSON.parse(serialized)).toEqual(['EVENT', 'sub_123', event])
  })

  it('should serialize NOTICE response', () => {
    const response: BtpNipsResponse = {
      type: 'NOTICE',
      message: 'Error: something went wrong',
    }

    const serialized = serializeResponse(response)
    expect(JSON.parse(serialized)).toEqual(['NOTICE', 'Error: something went wrong'])
  })
})

describe('fulfillment - createFulfillment', () => {
  it('should create fulfillment with zero buffer when no fulfillment provided', () => {
    const response: BtpNipsResponse = {
      type: 'OK',
      eventId: 'abc123',
      accepted: true,
      message: '',
    }

    const condition = Buffer.alloc(32) // Zero condition
    const fulfillment = createFulfillment(response, condition)

    expect(fulfillment.fulfillment).toBeInstanceOf(Buffer)
    expect(fulfillment.fulfillment.length).toBe(32)
    expect(fulfillment.fulfillment).toEqual(Buffer.alloc(32)) // Zero fulfillment
    expect(fulfillment.data).toBeInstanceOf(Buffer)
    expect(fulfillment.data.toString('utf-8')).toContain('OK')
  })

  it('should create fulfillment with provided fulfillment', () => {
    const response: BtpNipsResponse = {
      type: 'OK',
      eventId: 'abc123',
      accepted: true,
      message: '',
    }

    // Generate valid fulfillment/condition pair
    const providedFulfillment = Buffer.from('abcdefghijklmnopqrstuvwxyz123456') // Exactly 32 bytes
    const condition = Buffer.from(sha256(providedFulfillment))

    const fulfillment = createFulfillment(response, condition, providedFulfillment)

    expect(fulfillment.fulfillment).toEqual(providedFulfillment)
    expect(fulfillment.data).toBeInstanceOf(Buffer)
    expect(fulfillment.data.toString('utf-8')).toContain('OK')
  })

  it('should throw error if provided fulfillment does not match condition', () => {
    const response: BtpNipsResponse = {
      type: 'OK',
      eventId: 'abc123',
      accepted: true,
      message: '',
    }

    const providedFulfillment = Buffer.from('abcdefghijklmnopqrstuvwxyz123456') // Exactly 32 bytes
    const wrongCondition = Buffer.from('12345678901234567890123456789012') // Exactly 32 bytes (different)

    expect(() => {
      createFulfillment(response, wrongCondition, providedFulfillment)
    }).toThrow(/Fulfillment verification failed/)
  })

  it('should include serialized response in data field', () => {
    const response: BtpNipsResponse = {
      type: 'EOSE',
      subId: 'sub_456',
    }

    const condition = Buffer.alloc(32)
    const fulfillment = createFulfillment(response, condition)

    const responseData = JSON.parse(fulfillment.data.toString('utf-8'))
    expect(responseData).toEqual(['EOSE', 'sub_456'])
  })
})

describe('fulfillment - createRejection', () => {
  it('should create rejection with default error code', () => {
    const error = new Error('Invalid packet format')
    const rejection = createRejection(error)

    expect(rejection.code).toBe('F99') // TEMPORARY_FAILURE
    expect(rejection.message).toBe('Invalid packet format')
    expect(rejection.data).toBeInstanceOf(Buffer)

    const responseData = JSON.parse(rejection.data.toString('utf-8'))
    expect(responseData).toEqual(['NOTICE', 'Invalid packet format'])
  })

  it('should create rejection with specified error code', () => {
    const error = new Error('Invalid packet')
    const rejection = createRejection(error, 'INVALID_PACKET')

    expect(rejection.code).toBe('F01')
    expect(rejection.message).toBe('Invalid packet')
  })

  it('should create rejection with APPLICATION_ERROR code', () => {
    const error = new Error('Application error')
    const rejection = createRejection(error, 'APPLICATION_ERROR')

    expect(rejection.code).toBe('F02')
    expect(rejection.message).toBe('Application error')
  })

  it('should include error message in NOTICE response', () => {
    const error = new Error('Connection lost')
    const rejection = createRejection(error)

    const responseData = JSON.parse(rejection.data.toString('utf-8'))
    expect(responseData[0]).toBe('NOTICE')
    expect(responseData[1]).toBe('Connection lost')
  })
})

describe('fulfillment - verifyFulfillment', () => {
  it('should verify valid fulfillment/condition pair', () => {
    // Generate random 32-byte fulfillment
    const fulfillment = Buffer.from('abcdefghijklmnopqrstuvwxyz123456') // Exactly 32 bytes
    const condition = Buffer.from(sha256(fulfillment))

    const isValid = verifyFulfillment(fulfillment, condition)
    expect(isValid).toBe(true)
  })

  it('should reject mismatched fulfillment/condition pair', () => {
    const fulfillment = Buffer.from('abcdefghijklmnopqrstuvwxyz123456') // Exactly 32 bytes
    const wrongCondition = Buffer.from('12345678901234567890123456789012') // Exactly 32 bytes (different)

    const isValid = verifyFulfillment(fulfillment, wrongCondition)
    expect(isValid).toBe(false)
  })

  it('should reject fulfillment with incorrect length', () => {
    const shortFulfillment = Buffer.from('too-short')
    const condition = Buffer.alloc(32)

    const isValid = verifyFulfillment(shortFulfillment, condition)
    expect(isValid).toBe(false)
  })

  it('should reject condition with incorrect length', () => {
    const fulfillment = Buffer.alloc(32)
    const shortCondition = Buffer.from('too-short')

    const isValid = verifyFulfillment(fulfillment, shortCondition)
    expect(isValid).toBe(false)
  })

  it('should verify zero fulfillment/condition pair', () => {
    const fulfillment = Buffer.alloc(32) // All zeros
    const condition = Buffer.from(sha256(fulfillment))

    const isValid = verifyFulfillment(fulfillment, condition)
    expect(isValid).toBe(true)
  })
})

describe('fulfillment - ILP_ERROR_CODES', () => {
  it('should export standard ILP error codes', () => {
    expect(ILP_ERROR_CODES.TEMPORARY_FAILURE).toBe('F99')
    expect(ILP_ERROR_CODES.INVALID_PACKET).toBe('F01')
    expect(ILP_ERROR_CODES.APPLICATION_ERROR).toBe('F02')
    expect(ILP_ERROR_CODES.INSUFFICIENT_DESTINATION).toBe('F03')
  })
})
