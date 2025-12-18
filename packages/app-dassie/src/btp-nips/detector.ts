/**
 * BTP-NIPs packet detection module
 * Detects BTP-NIPs packets embedded in ILP STREAM packet data fields
 */

/**
 * BTP-NIPs protocol version
 */
export const BTP_NIPS_VERSION = 0x01

/**
 * Check if packet data contains a BTP-NIPs packet
 * BTP-NIPs packets are identified by:
 * - Byte 0: Protocol version (0x01)
 * - Byte 1: Message type (0x01-0x07)
 * - Bytes 2-3: Payload length (uint16 big-endian)
 * - Bytes 4+: JSON payload
 *
 * @param data ILP packet data field
 * @returns true if data contains a BTP-NIPs packet, false otherwise
 */
export function isBtpNipsPacket(data: Uint8Array): boolean {
  // Check minimum packet size (4 byte header)
  if (data.length < 4) {
    return false
  }

  // Check version byte (first byte should be 0x01)
  if (data[0] !== BTP_NIPS_VERSION) {
    return false
  }

  // Check message type (second byte should be 0x01-0x07)
  const messageType = data[1]
  if (messageType < 0x01 || messageType > 0x07) {
    return false
  }

  // Check payload length matches buffer size
  const payloadLength = (data[2]! << 8) | data[3]!
  const expectedTotalLength = 4 + payloadLength

  if (data.length !== expectedTotalLength) {
    return false
  }

  return true
}

/**
 * Extract BTP-NIPs payload from ILP packet data
 *
 * @param data ILP packet data containing BTP-NIPs packet
 * @returns BTP-NIPs packet data (full packet including header)
 * @throws Error if data is not a valid BTP-NIPs packet
 */
export function extractBtpNipsPacket(data: Uint8Array): Uint8Array {
  if (!isBtpNipsPacket(data)) {
    throw new Error('Not a valid BTP-NIPs packet')
  }

  return data
}

/**
 * Get BTP-NIPs message type from packet
 *
 * @param data BTP-NIPs packet data
 * @returns message type (0x01-0x07)
 */
export function getBtpNipsMessageType(data: Uint8Array): number {
  if (data.length < 2) {
    throw new Error('Invalid BTP-NIPs packet: too short')
  }

  return data[1]!
}
