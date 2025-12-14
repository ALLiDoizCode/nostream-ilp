import { BTPNIPsPacket, NostrEvent, NostrMessageType } from '../types'
import {
  parseBTPNIPsPacket,
  serializeBTPNIPsPacket,
} from '../parser'

/**
 * BTP-NIPs Parser Usage Examples
 *
 * This file demonstrates how to use the BTP-NIPs parser for common scenarios.
 * Run with: npx tsx src/btp-nips/examples/parser-usage.ts
 */

// ============================================================================
// Example 1: Parse Incoming ILP Packet Data
// ============================================================================

/**
 * Simulates receiving an ILP STREAM packet and parsing its BTP-NIPs data
 */
function example1_parseIncomingPacket() {
  console.log('\n=== Example 1: Parse Incoming ILP Packet ===\n')

  // Simulated ILP packet data (would come from Dassie)
  const payloadJson = JSON.stringify({
    payment: { amount: '1000', currency: 'msat', purpose: 'event_publish' },
    nostr: {
      id: 'abc123',
      pubkey: 'pubkey_xyz',
      created_at: 1234567890,
      kind: 1,
      tags: [['p', 'alice']],
      content: 'Hello from ILP!',
      sig: 'signature',
    },
    metadata: { timestamp: 1234567890, sender: 'g.dassie.alice' },
  })
  const payloadBuffer = Buffer.from(payloadJson, 'utf-8')
  const headerBuffer = Buffer.from([0x01, 0x01, 0x00, payloadBuffer.length])
  const ilpPacketData = Buffer.concat([headerBuffer, payloadBuffer])

  try {
    // Parse BTP-NIPs packet
    const packet = parseBTPNIPsPacket(ilpPacketData)

    console.log('✅ Packet parsed successfully!')
    console.log('Protocol Version:', packet.header.version)
    console.log('Message Type:', NostrMessageType[packet.header.messageType])
    console.log('Payment Amount:', packet.payload.payment.amount, packet.payload.payment.currency)
    console.log('Sender:', packet.payload.metadata.sender)
    console.log('Nostr Event Content:', (packet.payload.nostr as NostrEvent).content)
  } catch (error) {
    console.error('❌ Failed to parse packet:', error)
  }
}

// ============================================================================
// Example 2: Create and Serialize EVENT Packet
// ============================================================================

/**
 * Creates a BTP-NIPs EVENT packet and serializes it for sending via ILP
 */
function example2_createEventPacket() {
  console.log('\n=== Example 2: Create and Serialize EVENT Packet ===\n')

  // Create a BTP-NIPs packet with EVENT message
  const packet: BTPNIPsPacket = {
    header: {
      version: 1,
      messageType: NostrMessageType.EVENT,
      payloadLength: 0, // Will be calculated automatically
    },
    payload: {
      payment: {
        amount: '2000',
        currency: 'msat',
        purpose: 'event_publish',
      },
      nostr: {
        id: 'event_hash_12345',
        pubkey: 'user_pubkey_67890',
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [
          ['e', 'reply_to_event_id'],
          ['p', 'mentioned_pubkey'],
        ],
        content: 'This is a test event sent via BTP-NIPs over ILP!',
        sig: 'schnorr_signature_here',
      } as NostrEvent,
      metadata: {
        timestamp: Math.floor(Date.now() / 1000),
        sender: 'g.dassie.bob',
      },
    },
  }

  // Serialize packet
  const buffer = serializeBTPNIPsPacket(packet)

  console.log('✅ Packet serialized successfully!')
  console.log('Buffer Length:', buffer.length, 'bytes')
  console.log('Header (hex):', buffer.slice(0, 4).toString('hex'))
  console.log('First 50 bytes (hex):', buffer.slice(0, 50).toString('hex'))

  // This buffer would now be embedded in ILP STREAM packet data field
  console.log('\n📤 Ready to send via ILP STREAM packet.data')
}

// ============================================================================
// Example 3: Create and Serialize REQ Packet (Subscription)
// ============================================================================

/**
 * Creates a BTP-NIPs REQ packet for subscribing to events
 */
function example3_createReqPacket() {
  console.log('\n=== Example 3: Create REQ Packet (Subscription) ===\n')

  const packet: BTPNIPsPacket = {
    header: {
      version: 1,
      messageType: NostrMessageType.REQ,
      payloadLength: 0,
    },
    payload: {
      payment: {
        amount: '5000',
        currency: 'msat',
        purpose: 'subscription',
      },
      nostr: {
        subscriptionId: 'sub-abc-123',
        filters: [
          {
            kinds: [1], // Text notes
            authors: ['alice_pubkey', 'bob_pubkey'],
            since: Math.floor(Date.now() / 1000) - 3600, // Last hour
            limit: 100,
          },
          {
            kinds: [7], // Reactions
            '#e': ['specific_event_id'], // Reactions to specific event
          },
        ],
      },
      metadata: {
        timestamp: Math.floor(Date.now() / 1000),
        sender: 'g.dassie.carol',
        ttl: 3600, // 1 hour subscription
      },
    },
  }

  const buffer = serializeBTPNIPsPacket(packet)

  console.log('✅ REQ packet created!')
  console.log('Subscription ID:', (packet.payload.nostr as any).subscriptionId)
  console.log('Number of Filters:', (packet.payload.nostr as any).filters.length)
  console.log('Payment Amount:', packet.payload.payment.amount, packet.payload.payment.currency)
  console.log('Buffer Length:', buffer.length, 'bytes')
}

// ============================================================================
// Example 4: Error Handling for Malformed Packets
// ============================================================================

/**
 * Demonstrates error handling when parsing malformed packets
 */
function example4_errorHandling() {
  console.log('\n=== Example 4: Error Handling ===\n')

  // Example 4a: Invalid version
  try {
    const invalidVersion = Buffer.from([0x02, 0x01, 0x00, 0x00]) // version=2
    parseBTPNIPsPacket(invalidVersion)
  } catch (error) {
    console.log('❌ Caught expected error (invalid version):', (error as Error).message)
  }

  // Example 4b: Truncated packet
  try {
    const truncated = Buffer.from([0x01, 0x01]) // Only 2 bytes
    parseBTPNIPsPacket(truncated)
  } catch (error) {
    console.log('❌ Caught expected error (truncated):', (error as Error).message)
  }

  // Example 4c: Malformed JSON payload
  try {
    const malformedJson = Buffer.concat([
      Buffer.from([0x01, 0x01, 0x00, 0x10]), // Header
      Buffer.from('{ invalid json }', 'utf-8'), // Bad JSON
    ])
    parseBTPNIPsPacket(malformedJson)
  } catch (error) {
    console.log('❌ Caught expected error (malformed JSON):', (error as Error).message)
  }

  // Example 4d: Missing required fields
  try {
    const missingFields = Buffer.concat([
      Buffer.from([0x01, 0x01, 0x00, 0x00]),
      Buffer.from(JSON.stringify({ payment: { amount: '100', currency: 'msat', purpose: 'test' } }), 'utf-8'),
    ])
    // Update payload length
    const payloadLen = missingFields.length - 4
    missingFields.writeUInt16BE(payloadLen, 2)

    parseBTPNIPsPacket(missingFields)
  } catch (error) {
    console.log('❌ Caught expected error (missing fields):', (error as Error).message)
  }

  console.log('\n✅ All error cases handled gracefully!')
}

// ============================================================================
// Example 5: Round-Trip Test (Serialize → Parse → Verify)
// ============================================================================

/**
 * Demonstrates round-trip serialization and parsing
 */
function example5_roundTrip() {
  console.log('\n=== Example 5: Round-Trip Test ===\n')

  const original: BTPNIPsPacket = {
    header: {
      version: 1,
      messageType: NostrMessageType.EVENT,
      payloadLength: 0,
    },
    payload: {
      payment: { amount: '3000', currency: 'msat', purpose: 'tip' },
      nostr: {
        id: 'event_xyz',
        pubkey: 'user_abc',
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Round-trip test message 🚀',
        sig: 'signature',
      } as NostrEvent,
      metadata: { timestamp: 1234567890, sender: 'g.dassie.dave' },
    },
  }

  // Serialize
  const serialized = serializeBTPNIPsPacket(original)
  console.log('📤 Serialized packet:', serialized.length, 'bytes')

  // Parse
  const parsed = parseBTPNIPsPacket(serialized)
  console.log('📥 Parsed packet successfully')

  // Verify
  const contentMatches = (parsed.payload.nostr as NostrEvent).content === (original.payload.nostr as NostrEvent).content
  const senderMatches = parsed.payload.metadata.sender === original.payload.metadata.sender
  const amountMatches = parsed.payload.payment.amount === original.payload.payment.amount

  console.log('\n✅ Round-trip verification:')
  console.log('  Content matches:', contentMatches)
  console.log('  Sender matches:', senderMatches)
  console.log('  Amount matches:', amountMatches)
  console.log('  Full match:', contentMatches && senderMatches && amountMatches)
}

// ============================================================================
// Run All Examples
// ============================================================================

function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║       BTP-NIPs Parser Usage Examples                     ║')
  console.log('╚═══════════════════════════════════════════════════════════╝')

  example1_parseIncomingPacket()
  example2_createEventPacket()
  example3_createReqPacket()
  example4_errorHandling()
  example5_roundTrip()

  console.log('\n✅ All examples completed successfully!\n')
}

// Run if executed directly
if (require.main === module) {
  main()
}

export {
  example1_parseIncomingPacket,
  example2_createEventPacket,
  example3_createReqPacket,
  example4_errorHandling,
  example5_roundTrip,
}
