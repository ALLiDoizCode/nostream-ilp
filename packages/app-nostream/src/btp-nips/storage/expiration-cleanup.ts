import { createLogger } from '../../factories/logger-factory'
import { getMasterDbClient } from '../../database/client'

/**
 * BTP-NIPs Expiration Cleanup Actor (NIP-40)
 *
 * Background task that periodically deletes expired events from the database.
 * Runs every hour to clean up events where expires_at < current_time.
 *
 * @module btp-nips/storage/expiration-cleanup
 */

const debug = createLogger('btp-nips:expiration-cleanup')

/**
 * Cleanup interval in milliseconds (1 hour)
 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Expiration Cleanup Service
 *
 * Runs a background task that periodically deletes expired events from the database.
 * Uses a simple setInterval approach for cleanup scheduling.
 *
 * Events with expires_at < current_time are permanently deleted (hard delete).
 */
export class ExpirationCleanupService {
  private intervalId: NodeJS.Timeout | null = null
  private isRunning = false

  /**
   * Start the expiration cleanup service.
   *
   * Begins running cleanup every hour. If already running, this is a no-op.
   *
   * @example
   * ```typescript
   * const service = new ExpirationCleanupService();
   * service.start();
   * ```
   */
  start(): void {
    if (this.isRunning) {
      debug('Expiration cleanup service is already running')
      return
    }

    debug('Starting expiration cleanup service (interval: %d ms)', CLEANUP_INTERVAL_MS)

    // Run cleanup immediately on start
    this.cleanup().catch((error) => {
      debug('Initial cleanup failed (non-critical): %o', error)
    })

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.cleanup().catch((error) => {
        debug('Periodic cleanup failed (non-critical): %o', error)
      })
    }, CLEANUP_INTERVAL_MS)

    this.isRunning = true
  }

  /**
   * Stop the expiration cleanup service.
   *
   * Stops the periodic cleanup task. Safe to call multiple times.
   *
   * @example
   * ```typescript
   * service.stop();
   * ```
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.isRunning = false
    debug('Stopped expiration cleanup service')
  }

  /**
   * Execute cleanup of expired events.
   *
   * Deletes all events where expires_at < current Unix timestamp.
   * This is a hard delete - events are permanently removed from the database.
   *
   * @returns Promise<number> - Number of events deleted
   *
   * @example
   * ```typescript
   * const deletedCount = await service.cleanup();
   * console.log(`Deleted ${deletedCount} expired events`);
   * ```
   */
  async cleanup(): Promise<number> {
    try {
      const currentTime = Math.floor(Date.now() / 1000)
      const db = getMasterDbClient()

      debug('Running expiration cleanup (current time: %d)', currentTime)

      // Delete expired events
      const deletedCount = await db('btp_nips_events')
        .where('expires_at', '<', currentTime)
        .delete()

      if (deletedCount > 0) {
        debug('Cleaned up %d expired events', deletedCount)
      } else {
        debug('No expired events to clean up')
      }

      return deletedCount
    } catch (error) {
      debug('Expiration cleanup failed: %o', error)
      // Graceful degradation - log error but don't crash
      throw error
    }
  }

  /**
   * Check if the cleanup service is currently running.
   *
   * @returns true if the service is running, false otherwise
   */
  isActive(): boolean {
    return this.isRunning
  }
}

/**
 * Singleton instance of ExpirationCleanupService
 */
let serviceInstance: ExpirationCleanupService | null = null

/**
 * Get the singleton instance of ExpirationCleanupService.
 *
 * @returns Shared ExpirationCleanupService instance
 *
 * @example
 * ```typescript
 * const service = getExpirationCleanupService();
 * service.start();
 * ```
 */
export function getExpirationCleanupService(): ExpirationCleanupService {
  if (!serviceInstance) {
    serviceInstance = new ExpirationCleanupService()
  }
  return serviceInstance
}
