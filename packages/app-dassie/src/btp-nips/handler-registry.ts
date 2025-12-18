import type { BtpNipsPacket, BtpNipsResponse } from './types'

/**
 * ILP context passed to BTP-NIPs handlers
 */
export interface IlpContext {
  /** ILP address of the sender */
  sender: string
  /** Payment amount in msats (string to avoid precision loss) */
  amount: string
  /** ILP execution condition (SHA-256 hash of fulfillment preimage) */
  condition: Buffer
  /** Optional fulfillment preimage (if already computed) */
  fulfillment?: Buffer
}

/**
 * BTP-NIPs packet handler interface
 * Handlers process specific message types (EVENT, REQ, CLOSE, etc.)
 */
export interface BtpNipsHandler {
  /** Message type this handler processes */
  type: 'EVENT' | 'REQ' | 'CLOSE' | 'NOTICE' | 'EOSE' | 'OK' | 'AUTH'

  /**
   * Process a BTP-NIPs packet
   * @param packet - Deserialized BTP-NIPs packet
   * @param ilpContext - ILP payment context
   * @returns Promise resolving to BTP-NIPs response
   */
  handle(packet: BtpNipsPacket, ilpContext: IlpContext): Promise<BtpNipsResponse>
}

/**
 * Registry for BTP-NIPs packet handlers
 * Routes packets to appropriate handler based on message type
 */
export class HandlerRegistry {
  private handlers = new Map<string, BtpNipsHandler>()

  /**
   * Register a handler for a specific message type
   * @param handler - Handler to register
   * @throws Error if handler for this type already exists
   */
  register(handler: BtpNipsHandler): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(`Handler already registered for type: ${handler.type}`)
    }
    this.handlers.set(handler.type, handler)
  }

  /**
   * Unregister a handler for a specific message type
   * @param type - Message type to unregister
   * @returns true if handler was found and removed, false otherwise
   */
  unregister(type: string): boolean {
    return this.handlers.delete(type)
  }

  /**
   * Route a packet to the appropriate handler
   * @param packet - Deserialized BTP-NIPs packet
   * @param ilpContext - ILP payment context
   * @returns Promise resolving to BTP-NIPs response
   * @throws Error if no handler registered for packet type
   */
  async route(
    packet: BtpNipsPacket,
    ilpContext: IlpContext,
  ): Promise<BtpNipsResponse> {
    const handler = this.handlers.get(packet.type)
    if (!handler) {
      throw new Error(
        `No handler registered for packet type: ${packet.type} (0x${packet.header.messageType.toString(16).padStart(2, '0')})`,
      )
    }
    return await handler.handle(packet, ilpContext)
  }

  /**
   * Check if a handler is registered for a given message type
   * @param type - Message type to check
   * @returns true if handler exists
   */
  has(type: string): boolean {
    return this.handlers.has(type)
  }

  /**
   * Get list of all registered message types
   * @returns Array of registered message type strings
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys())
  }
}
