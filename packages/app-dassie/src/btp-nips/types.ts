/**
 * BTP-NIPs type definitions
 * Based on Epic 5 Story 5.1 specification
 */

import type { Database as BetterSqlite3Database } from 'better-sqlite3'

/**
 * Database instance interface (simplified for testing)
 * In production, this will be the full Dassie DatabaseInstance type
 */
export interface DatabaseInstance {
  raw: BetterSqlite3Database
  [key: string]: unknown
}

/**
 * Nostr event structure (NIP-01)
 */
export interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

/**
 * Nostr filter structure (NIP-01)
 */
export interface NostrFilter {
  ids?: string[]
  authors?: string[]
  kinds?: number[]
  since?: number
  until?: number
  limit?: number
  [key: `#${string}`]: string[] | undefined
}

/**
 * BTP-NIPs message types
 */
export enum BtpNipsMessageType {
  EVENT = 0x01,
  REQ = 0x02,
  CLOSE = 0x03,
  NOTICE = 0x04,
  EOSE = 0x05,
  OK = 0x06,
  AUTH = 0x07,
}

/**
 * BTP-NIPs packet header (4 bytes)
 */
export interface BtpNipsHeader {
  version: number // Byte 0: Protocol version (1)
  messageType: BtpNipsMessageType // Byte 1: Message type
  payloadLength: number // Bytes 2-3: Payload size (uint16 big-endian)
}

/**
 * BTP-NIPs payment information
 */
export interface BtpNipsPayment {
  amount: string // Payment amount in msats
  currency: string // Currency code (e.g., "msat")
  purpose?: string // Payment purpose description
}

/**
 * BTP-NIPs metadata
 */
export interface BtpNipsMetadata {
  timestamp: number // Unix timestamp
  sender: string // ILP address of sender
  ttl?: number // Time-to-live in seconds
}

/**
 * BTP-NIPs packet payload base
 */
export interface BtpNipsPayloadBase {
  payment: BtpNipsPayment
  metadata: BtpNipsMetadata
}

/**
 * EVENT packet payload
 */
export interface BtpNipsEventPayload extends BtpNipsPayloadBase {
  nostr: NostrEvent
}

/**
 * REQ packet payload
 */
export interface BtpNipsReqPayload extends BtpNipsPayloadBase {
  nostr: NostrFilter[]
}

/**
 * CLOSE packet payload
 */
export interface BtpNipsClosePayload extends BtpNipsPayloadBase {
  nostr: {
    subId: string
  }
}

/**
 * Generic BTP-NIPs payload (union type)
 */
export type BtpNipsPayload =
  | BtpNipsEventPayload
  | BtpNipsReqPayload
  | BtpNipsClosePayload

/**
 * Complete BTP-NIPs packet
 */
export interface BtpNipsPacket {
  type: 'EVENT' | 'REQ' | 'CLOSE' | 'NOTICE' | 'EOSE' | 'OK' | 'AUTH'
  header: BtpNipsHeader
  payload: BtpNipsPayload
}

/**
 * BTP-NIPs response types
 */
export type BtpNipsResponse =
  | { type: 'OK'; eventId: string; accepted: boolean; message: string }
  | { type: 'EOSE'; subId: string }
  | { type: 'EVENT'; subId: string; event: NostrEvent }
  | { type: 'NOTICE'; message: string }
