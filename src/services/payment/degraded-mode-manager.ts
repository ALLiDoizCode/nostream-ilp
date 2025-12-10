import { degradedModeActive, degradedModeQueueSize } from '../metrics'

import type { Event } from '@/@types/event'
import type { PaymentClaim } from '@/@types/payment-claim'
import type { DassieClient } from './dassie-client'

/**
 * Degraded Mode Manager
 *
 * Manages relay operation when Dassie RPC is unavailable.
 * In degraded mode:
 * - Events are accepted without payment verification
 * - Payment claims are queued for later verification
 * - Queue has size limit to prevent memory exhaustion
 *
 * When Dassie reconnects, queued verifications are processed.
 *
 * @module degraded-mode-manager
 */

/**
 * Queued payment verification
 */
export interface QueuedPaymentVerification {
  /** Nostr event */
  event: Event
  /** Payment claim extracted from event */
  claim: PaymentClaim
  /** When queued (for metrics and audit) */
  queuedAt: Date
}

/**
 * Results from processing queued verifications
 */
export interface ProcessedResults {
  /** Total verifications processed */
  total: number
  /** Valid payment claims */
  valid: number
  /** Invalid payment claims */
  invalid: number
  /** Processing duration in milliseconds */
  durationMs: number
}

/**
 * Logger interface (compatible with Pino)
 */
interface Logger {
  info: (obj: any, msg?: string) => void
  warn: (obj: any, msg?: string) => void
  error: (obj: any, msg?: string) => void
  debug: (obj: any, msg?: string) => void
}

/**
 * Degraded Mode Manager
 *
 * Handles graceful degradation when Dassie RPC is unavailable.
 *
 * @example
 * ```typescript
 * const degradedMode = new DegradedModeManager(dassieClient, logger, 10000)
 *
 * // Enable degraded mode
 * degradedMode.enableDegradedMode()
 *
 * // Queue payment verification
 * degradedMode.queuePaymentVerification(event, claim)
 *
 * // Later, when Dassie reconnects
 * const results = await degradedMode.processQueuedVerifications()
 * console.log(`Processed ${results.total} verifications`)
 * ```
 */
export class DegradedModeManager {
  private isDegradedMode: boolean = false
  private queuedVerifications: QueuedPaymentVerification[] = []
  private readonly maxQueueSize: number
  private dassieClient: DassieClient
  private logger: Logger

  /**
   * Create degraded mode manager
   *
   * @param dassieClient - Dassie RPC client for verification
   * @param logger - Logger instance
   * @param maxQueueSize - Maximum queue size (default: 10000)
   */
  constructor(
    dassieClient: DassieClient,
    logger: Logger,
    maxQueueSize: number = 10000
  ) {
    this.dassieClient = dassieClient
    this.logger = logger
    this.maxQueueSize = maxQueueSize
  }

  /**
   * Enable degraded mode
   *
   * Called when Dassie RPC connection is lost.
   */
  enableDegradedMode(): void {
    if (this.isDegradedMode) {
      return // Already in degraded mode
    }

    this.isDegradedMode = true

    // Update Prometheus metric
    degradedModeActive.set(1)

    this.logger.error(
      {
        event: 'degraded_mode_enabled',
        reason: 'dassie_connection_lost',
        queue_size: this.queuedVerifications.length,
      },
      'Degraded mode enabled - accepting events without payment verification'
    )
  }

  /**
   * Disable degraded mode
   *
   * Called when Dassie RPC connection is restored.
   */
  disableDegradedMode(): void {
    if (!this.isDegradedMode) {
      return // Already disabled
    }

    this.isDegradedMode = false

    // Update Prometheus metric
    degradedModeActive.set(0)

    this.logger.info(
      {
        event: 'degraded_mode_disabled',
        queue_size: this.queuedVerifications.length,
      },
      'Degraded mode disabled - resuming normal payment verification'
    )
  }

  /**
   * Check if currently in degraded mode
   *
   * @returns boolean True if in degraded mode
   */
  isDegraded(): boolean {
    return this.isDegradedMode
  }

  /**
   * Queue payment verification for later processing
   *
   * If queue is full, oldest verification is dropped.
   *
   * @param event - Nostr event
   * @param claim - Payment claim
   */
  queuePaymentVerification(event: Event, claim: PaymentClaim): void {
    // Check queue size limit
    if (this.queuedVerifications.length >= this.maxQueueSize) {
      const dropped = this.queuedVerifications.shift()

      this.logger.warn(
        {
          event: 'degraded_queue_full',
          queue_size: this.maxQueueSize,
          max_queue_size: this.maxQueueSize,
          dropped_event_id: dropped?.event.id,
        },
        `WARNING: Degraded mode queue full (${this.maxQueueSize}) - dropping oldest verification`
      )
    }

    // Add to queue
    this.queuedVerifications.push({
      event,
      claim,
      queuedAt: new Date(),
    })

    // Update Prometheus metric
    degradedModeQueueSize.set(this.queuedVerifications.length)

    this.logger.debug(
      {
        event: 'payment_verification_queued',
        eventId: event.id,
        pubkey: event.pubkey,
        queue_size: this.queuedVerifications.length,
      },
      'Payment verification queued for later processing'
    )
  }

  /**
   * Get current queue size
   *
   * @returns number Number of queued verifications
   */
  getQueueSize(): number {
    return this.queuedVerifications.length
  }

  /**
   * Process all queued payment verifications
   *
   * Verifies each queued claim via Dassie RPC.
   * Invalid claims are logged (events already stored, can't reject retroactively).
   *
   * @returns Promise<ProcessedResults> Processing results
   */
  async processQueuedVerifications(): Promise<ProcessedResults> {
    const startTime = Date.now()
    const total = this.queuedVerifications.length

    if (total === 0) {
      this.logger.info({ event: 'queued_verifications_empty' }, 'No queued verifications to process')
      return { total: 0, valid: 0, invalid: 0, durationMs: 0 }
    }

    this.logger.info(
      { event: 'queued_verifications_processing_start', total },
      `Processing ${total} queued payment verifications`
    )

    const results: ProcessedResults = {
      total,
      valid: 0,
      invalid: 0,
      durationMs: 0,
    }

    const BATCH_SIZE = 100
    // const CONCURRENCY = 10 // Reserved for future parallel processing

    // Process in batches
    while (this.queuedVerifications.length > 0) {
      const batch = this.queuedVerifications.splice(0, BATCH_SIZE)

      // Update queue size metric after splice
      degradedModeQueueSize.set(this.queuedVerifications.length)

      // Process batch with concurrency limit
      const batchPromises = batch.map(qv => this.verifyQueuedClaim(qv))
      const batchResults = await Promise.allSettled(batchPromises)

      // Aggregate results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.valid) {
          results.valid++
        } else {
          results.invalid++

          const qv = batch[index]
          this.logger.warn(
            {
              event: 'queued_verification_invalid',
              eventId: qv.event.id,
              pubkey: qv.event.pubkey,
              reason: result.status === 'fulfilled' ? result.value.error : (result.reason as Error).message,
              queuedAt: qv.queuedAt,
            },
            'Queued payment verification failed - event already stored (cannot reject retroactively)'
          )
        }
      })

      // Check if Dassie disconnected during processing
      if (!this.dassieClient.isConnected()) {
        this.logger.error(
          {
            event: 'queued_verification_interrupted',
            processed: results.valid + results.invalid,
            remaining: this.queuedVerifications.length,
          },
          'Dassie disconnected during queue processing - re-enabling degraded mode'
        )

        this.enableDegradedMode()
        break
      }
    }

    results.durationMs = Date.now() - startTime

    this.logger.info(
      {
        event: 'queued_verifications_processed',
        total: results.total,
        valid: results.valid,
        invalid: results.invalid,
        duration_ms: results.durationMs,
      },
      `Processed ${results.total} queued payment verifications (${results.valid} valid, ${results.invalid} invalid) in ${results.durationMs}ms`
    )

    return results
  }

  /**
   * Verify a single queued payment claim
   *
   * @param qv - Queued verification
   * @returns Promise<PaymentClaimVerification> Verification result
   */
  private async verifyQueuedClaim(qv: QueuedPaymentVerification): Promise<any> {
    try {
      const verification = await this.dassieClient.verifyPaymentClaim(qv.claim)

      this.logger.debug(
        {
          event: 'queued_verification_result',
          eventId: qv.event.id,
          valid: verification.valid,
          queuedAt: qv.queuedAt,
          processingDelay: Date.now() - qv.queuedAt.getTime(),
        },
        `Queued payment claim ${verification.valid ? 'valid' : 'invalid'}`
      )

      return verification
    } catch (error) {
      this.logger.error(
        {
          error,
          eventId: qv.event.id,
        },
        'Error verifying queued payment claim'
      )

      return {
        valid: false,
        error: (error as Error).message,
      }
    }
  }

  /**
   * Clear all queued verifications
   *
   * Used for testing or emergency queue reset.
   */
  clearQueue(): void {
    const cleared = this.queuedVerifications.length

    this.queuedVerifications = []

    this.logger.warn(
      {
        event: 'degraded_queue_cleared',
        cleared_count: cleared,
      },
      `Cleared ${cleared} queued verifications`
    )
  }

  /**
   * Get queue statistics
   *
   * @returns Object with queue stats
   */
  getQueueStats(): {
    size: number
    maxSize: number
    isDegraded: boolean
    oldestQueuedAt: Date | null
  } {
    return {
      size: this.queuedVerifications.length,
      maxSize: this.maxQueueSize,
      isDegraded: this.isDegradedMode,
      oldestQueuedAt: this.queuedVerifications.length > 0
        ? this.queuedVerifications[0].queuedAt
        : null,
    }
  }
}
