import { ContextMetadataKey, EventExpirationTimeMetadataKey } from '../constants/base'
import { Event, ExpiringEvent  } from '../@types/event'
import { EventRateLimit, FeeSchedule, Settings } from '../@types/settings'
import { Factory } from '../@types/base'
import { IEventStrategy, IMessageHandler } from '../@types/message-handlers'
import { IRateLimiter } from '../@types/utils'
import { IUserRepository } from '../@types/repositories'
import { IWebSocketAdapter } from '../@types/adapters'
import { IncomingEventMessage } from '../@types/messages'
import { WebSocketAdapterEvent } from '../constants/adapter'
import { calculateRequiredPayment as calcPrice, extractPaymentClaim } from '../services/payment'
import { createCommandResult, createNoticeMessage } from '../utils/messages'
import { createLogger } from '../factories/logger-factory'
import { getEventExpiration, getEventProofOfWork, getPubkeyProofOfWork, getPublicKey, getRelayPrivateKey, isEventIdValid, isEventKindOrRangeMatch, isEventSignatureValid, isExpiredEvent } from '../utils/event'

import type { DassieClient } from '../services/payment/dassie-client'
import type { DegradedModeManager } from '../services/payment/degraded-mode-manager'
import type { FreeTierTracker } from '../services/payment/free-tier-tracker'

/* eslint-disable sort-imports */
/* eslint-enable sort-imports */

const debug = createLogger('event-message-handler')
const debugPayment = debug.extend('payment')

export class EventMessageHandler implements IMessageHandler {
  public constructor(
    protected readonly webSocket: IWebSocketAdapter,
    protected readonly strategyFactory: Factory<IEventStrategy<Event, Promise<void>>, [Event, IWebSocketAdapter]>,
    protected readonly userRepository: IUserRepository,
    private readonly settings: () => Settings,
    private readonly slidingWindowRateLimiter: Factory<IRateLimiter>,
    private readonly dassieClient: DassieClient,
    private readonly freeTierTracker: FreeTierTracker,
    private readonly degradedModeManager: DegradedModeManager,
  ) {}

  public async handleMessage(message: IncomingEventMessage): Promise<void> {
    let [, event] = message

    event[ContextMetadataKey] = message[ContextMetadataKey]

    let reason = await this.isEventValid(event)
    if (reason) {
      debug('event %s rejected: %s', event.id, reason)
      this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, false, reason))
      return
    }

    if (isExpiredEvent(event)) {
      debug('event %s rejected: expired')
      this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, false, 'event is expired'))
      return
    }

    event = this.addExpirationMetadata(event)

    if (await this.isRateLimited(event)) {
      debug('event %s rejected: rate-limited')
      this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, false, 'rate-limited: slow down'))
      return
    }

    reason = this.canAcceptEvent(event)
    if (reason) {
      debug('event %s rejected: %s', event.id, reason)
      this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, false, reason))
      return
    }

    reason = await this.isUserAdmitted(event)
    if (reason) {
      debug('event %s rejected: %s', event.id, reason)
      this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, false, reason))
      return
    }

    // Payment verification (Story 1.4)
    reason = await this.verifyPaymentClaim(event)
    if (reason) {
      debug('event %s rejected: %s', event.id, reason)
      this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, false, reason))
      return
    }

    const strategy = this.strategyFactory([event, this.webSocket])

    if (typeof strategy?.execute !== 'function') {
      this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, false, 'error: event not supported'))
      return
    }

    try {
      await strategy.execute(event)
    } catch (error) {
      console.error('error handling message', message, error)
      this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, false, 'error: unable to process event'))
    }
  }

  protected getRelayPublicKey(): string {
    const relayPrivkey = getRelayPrivateKey(this.settings().info.relay_url)
    return getPublicKey(relayPrivkey)
  }

  protected canAcceptEvent(event: Event): string | undefined {
    if (this.getRelayPublicKey() === event.pubkey) {
      return
    }
    const now = Math.floor(Date.now()/1000)

    const limits = this.settings().limits?.event ?? {}

    if (Array.isArray(limits.content)) {
      for (const limit of limits.content) {
        if (
          typeof limit.maxLength !== 'undefined'
          && limit.maxLength > 0
          && event.content.length > limit.maxLength
          && (
            !Array.isArray(limit.kinds)
            || limit.kinds.some(isEventKindOrRangeMatch(event))
          )
        ) {
          return `rejected: content is longer than ${limit.maxLength} bytes`
        }
      }
    } else if (
      typeof limits.content?.maxLength !== 'undefined'
      && limits.content?.maxLength > 0
      && event.content.length > limits.content.maxLength
      && (
        !Array.isArray(limits.content.kinds)
        || limits.content.kinds.some(isEventKindOrRangeMatch(event))
      )
    ) {
      return `rejected: content is longer than ${limits.content.maxLength} bytes`
    }

    if (
      typeof limits.createdAt?.maxPositiveDelta !== 'undefined'
      && limits.createdAt.maxPositiveDelta > 0
      && event.created_at > now + limits.createdAt.maxPositiveDelta) {
      return `rejected: created_at is more than ${limits.createdAt.maxPositiveDelta} seconds in the future`
    }

    if (
      typeof limits.createdAt?.maxNegativeDelta !== 'undefined'
      && limits.createdAt.maxNegativeDelta > 0
      && event.created_at < now - limits.createdAt.maxNegativeDelta) {
      return `rejected: created_at is more than ${limits.createdAt.maxNegativeDelta} seconds in the past`
    }

    if (
      typeof limits.eventId?.minLeadingZeroBits !== 'undefined'
      && limits.eventId.minLeadingZeroBits > 0
    ) {
      const pow = getEventProofOfWork(event.id)
      if (pow < limits.eventId.minLeadingZeroBits) {
        return `pow: difficulty ${pow}<${limits.eventId.minLeadingZeroBits}`
      }
    }

    if (
      typeof limits.pubkey?.minLeadingZeroBits !== 'undefined'
      && limits.pubkey.minLeadingZeroBits > 0
    ) {
      const pow = getPubkeyProofOfWork(event.pubkey)
      if (pow < limits.pubkey.minLeadingZeroBits) {
        return `pow: pubkey difficulty ${pow}<${limits.pubkey.minLeadingZeroBits}`
      }
    }

    if (
      typeof limits.pubkey?.whitelist !== 'undefined'
      && limits.pubkey.whitelist.length > 0
      && !limits.pubkey.whitelist.some((prefix) => event.pubkey.startsWith(prefix))
    ) {
      return 'blocked: pubkey not allowed'
    }

    if (
      typeof limits.pubkey?.blacklist !== 'undefined'
      && limits.pubkey.blacklist.length > 0
      && limits.pubkey.blacklist.some((prefix) => event.pubkey.startsWith(prefix))
    ) {
      return 'blocked: pubkey not allowed'
    }

    if (
      typeof limits.kind?.whitelist !== 'undefined'
      && limits.kind.whitelist.length > 0
      && !limits.kind.whitelist.some(isEventKindOrRangeMatch(event))) {
      return `blocked: event kind ${event.kind} not allowed`
    }

    if (
      typeof limits.kind?.blacklist !== 'undefined'
      && limits.kind.blacklist.length > 0
      && limits.kind.blacklist.some(isEventKindOrRangeMatch(event))) {
      return `blocked: event kind ${event.kind} not allowed`
    }
  }

  protected async isEventValid(event: Event): Promise<string | undefined> {
    if (!await isEventIdValid(event)) {
      return 'invalid: event id does not match'
    }
    if (!await isEventSignatureValid(event)) {
      return 'invalid: event signature verification failed'
    }
  }

  protected async isRateLimited(event: Event): Promise<boolean> {
    if (this.getRelayPublicKey() === event.pubkey) {
      return false
    }

    const { whitelists, rateLimits } = this.settings().limits?.event ?? {}
    if (!rateLimits || !rateLimits.length) {
      return false
    }

    if (
      typeof whitelists?.pubkeys !== 'undefined'
      && Array.isArray(whitelists?.pubkeys)
      && whitelists.pubkeys.includes(event.pubkey)
    ) {
      return false
    }

    if (
      typeof whitelists?.ipAddresses !== 'undefined'
      && Array.isArray(whitelists?.ipAddresses)
      && whitelists.ipAddresses.includes(this.webSocket.getClientAddress())
    ) {
      return false
    }

    const rateLimiter = this.slidingWindowRateLimiter()

    const toString = (input: any | any[]): string => {
      return Array.isArray(input) ? `[${input.map(toString)}]` : input.toString()
    }

    const hit = ({ period, rate, kinds = undefined }: EventRateLimit) => {
      const key = Array.isArray(kinds)
        ? `${event.pubkey}:events:${period}:${toString(kinds)}`
        : `${event.pubkey}:events:${period}`

      return rateLimiter.hit(
        key,
        1,
        { period, rate },
      )
    }

    let limited = false
    for (const { rate, period, kinds } of rateLimits) {
      // skip if event kind does not apply
      if (Array.isArray(kinds) && !kinds.some(isEventKindOrRangeMatch(event))) {
        continue
      }

      const isRateLimited = await hit({ period, rate, kinds })

      if (isRateLimited) {
        debug('rate limited %s: %d events / %d ms exceeded', event.pubkey, rate, period)

        limited = true
      }
    }

    return limited
  }

  protected async isUserAdmitted(event: Event): Promise<string | undefined> {
    const currentSettings = this.settings()
    if (!currentSettings.payments?.enabled) {
      return
    }

    if (this.getRelayPublicKey() === event.pubkey) {
      return
    }

    const isApplicableFee = (feeSchedule: FeeSchedule) =>
      feeSchedule.enabled
      && !feeSchedule.whitelists?.pubkeys?.some((prefix) => event.pubkey.startsWith(prefix))
      && !feeSchedule.whitelists?.event_kinds?.some(isEventKindOrRangeMatch(event))

    const feeSchedules = currentSettings.payments?.feeSchedules?.admission?.filter(isApplicableFee)
    if (!Array.isArray(feeSchedules) || !feeSchedules.length) {
      return
    }

    // const hasKey = await this.cache.hasKey(`${event.pubkey}:is-admitted`)
    // TODO: use cache
    const user = await this.userRepository.findByPubkey(event.pubkey)
    if (!user || !user.isAdmitted) {
      return 'blocked: pubkey not admitted'
    }

    const minBalance = currentSettings.limits?.event?.pubkey?.minBalance ?? 0n
    if (minBalance > 0n && user.balance < minBalance) {
      return 'blocked: insufficient balance'
    }
  }

  /**
   * Verify payment claim for paid events
   *
   * Checks free tier eligibility first (Story 1.6).
   * If not eligible, extracts payment claim from event tags, verifies with Dassie RPC,
   * and checks if payment amount meets required fee schedule.
   *
   * @param event - Nostr event to verify payment for
   * @returns Error string if payment invalid/missing, undefined if valid
   */
  protected async verifyPaymentClaim(event: Event): Promise<string | undefined> {
    const currentSettings = this.settings()

    // Skip if payments not enabled
    if (!currentSettings.payments?.enabled) {
      return
    }

    // Skip for relay's own events
    if (this.getRelayPublicKey() === event.pubkey) {
      return
    }

    // Check free tier eligibility first (Story 1.6)
    const freeTierStatus = await this.freeTierTracker.checkFreeTierEligibility(event.pubkey)

    if (freeTierStatus.eligible) {
      debugPayment(
        'pubkey %s eligible for free tier (%d events remaining)',
        event.pubkey,
        freeTierStatus.eventsRemaining
      )

      // Send NOTICE if approaching limit (10 events or fewer remaining)
      if (freeTierStatus.eventsRemaining <= 10 && freeTierStatus.eventsRemaining > 0) {
        this.sendNotice(
          `Free tier: ${freeTierStatus.eventsRemaining} free events remaining. Payment will be required after.`
        )
      }

      // Increment event count for non-whitelisted users (non-blocking)
      if (!freeTierStatus.whitelisted) {
        this.freeTierTracker.incrementEventCount(event.pubkey).catch((err) => {
          // Log error but don't block event storage
          debug('Failed to increment event count for %s: %o', event.pubkey, err)
        })
      }

      return // Allow event without payment
    }

    // Free tier exhausted or disabled - require payment

    // STORY 1.7: Check degraded mode (Dassie RPC unavailable)
    if (this.degradedModeManager.isDegraded()) {
      debugPayment('Degraded mode active - queueing payment verification for event %s', event.id)

      const claim = extractPaymentClaim(event)
      if (claim) {
        this.degradedModeManager.queuePaymentVerification(event, claim)
      }

      // Allow event without verification (log for audit)
      debugPayment({
        event: 'payment_verification_skipped_degraded_mode',
        eventId: event.id,
        pubkey: event.pubkey,
        queueSize: this.degradedModeManager.getQueueSize(),
      }, 'Event accepted without payment verification (degraded mode)')

      // Send NOTICE to client
      this.sendNotice('Payment verification temporarily unavailable - event queued for later verification')

      return undefined  // Allow event
    }

    // Extract payment claim from event tags
    const claim = extractPaymentClaim(event)

    // Calculate required payment for this event kind
    const requiredAmount = this.calculateRequiredPayment(event)

    // No payment claim found
    if (!claim) {
      // Check if payment is required for this event kind
      if (requiredAmount > 0n) {
        debugPayment({
          event: 'payment_required',
          event_id: event.id,
          pubkey: event.pubkey,
          event_kind: event.kind,
          required_amount: Number(requiredAmount),
        }, 'Event requires payment but none provided')

        return `restricted: payment required - ${Number(requiredAmount)} sats`
      }
      // Payment not required, allow event
      return
    }

    // Check if Dassie is connected
    if (!this.dassieClient.isConnected()) {
      debugPayment({
        event: 'dassie_unavailable',
        event_id: event.id,
        pubkey: event.pubkey,
      }, 'Dassie client not connected')

      return 'error: payment verification temporarily unavailable'
    }

    // Verify payment claim with timeout
    try {
      const result = await Promise.race([
        this.dassieClient.verifyPaymentClaim(claim),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000)
        ),
      ])

      if (result.valid) {
        // Payment valid - check if amount is sufficient
        if (claim.amountSats < Number(requiredAmount)) {
          debugPayment({
            event: 'insufficient_payment',
            event_id: event.id,
            pubkey: event.pubkey,
            required: Number(requiredAmount),
            provided: claim.amountSats,
          }, `Insufficient payment: need ${Number(requiredAmount)} sats, got ${claim.amountSats} sats`)

          return `restricted: insufficient payment - need ${Number(requiredAmount)} sats, got ${claim.amountSats} sats`
        }

        debugPayment({
          event: 'payment_verified',
          event_id: event.id,
          pubkey: event.pubkey,
          channel_id: claim.channelId.substring(0, 8),
          amount_sats: claim.amountSats,
          currency: claim.currency,
          nonce: claim.nonce,
        }, 'Payment claim verified successfully')

        return
      }

      // Payment verification failed
      const errorMessage = this.formatPaymentError(result.error, claim.amountSats, requiredAmount)

      debugPayment({
        event: 'payment_verification_failed',
        event_id: event.id,
        pubkey: event.pubkey,
        reason: result.error,
        claim: {
          ...claim,
          signature: claim.signature.substring(0, 8) + '...',
        },
      }, `Payment verification failed: ${result.error}`)

      return errorMessage
    } catch (error) {
      if (error instanceof Error && error.message === 'Timeout') {
        debugPayment({
          event: 'verification_timeout',
          event_id: event.id,
          pubkey: event.pubkey,
        }, 'Payment verification timeout')

        return 'error: payment verification timeout'
      }

      debugPayment({
        event: 'verification_error',
        event_id: event.id,
        pubkey: event.pubkey,
        error: error instanceof Error ? error.message : String(error),
      }, 'Payment verification error')

      return 'error: payment verification failed'
    }
  }

  /**
   * Calculate required payment amount for event kind
   *
   * First checks fee schedules (YAML-based configuration) for matching event kind.
   * If no schedule matches, falls back to environment variable-based pricing (Story 1.5).
   *
   * @param event - Nostr event to calculate payment for
   * @returns Required payment amount in satoshis (bigint)
   */
  private calculateRequiredPayment(event: Event): bigint {
    const currentSettings = this.settings()
    const feeSchedules = currentSettings.payments?.feeSchedules?.publication

    // Check YAML-based fee schedules first (backward compatibility)
    if (Array.isArray(feeSchedules) && feeSchedules.length > 0) {
      // Find first matching enabled fee schedule
      for (const schedule of feeSchedules) {
        if (!schedule.enabled) {
          continue
        }

        // Check if event kind matches whitelist
        if (schedule.whitelists?.event_kinds) {
          const matches = schedule.whitelists.event_kinds.some(isEventKindOrRangeMatch(event))
          if (matches) {
            return schedule.amount
          }
        }
      }
    }

    // Fall back to environment variable-based pricing (Story 1.5)
    return calcPrice('store', event)
  }

  /**
   * Format error message from Dassie verification result
   *
   * Maps Dassie error codes to user-friendly error messages.
   *
   * @param error - Error code from Dassie
   * @param providedAmount - Amount provided in claim
   * @param requiredAmount - Amount required by fee schedule
   * @returns Formatted error message
   */
  private formatPaymentError(error: string | undefined, providedAmount: number, requiredAmount: bigint): string {
    switch (error) {
      case 'insufficient_balance':
        return `restricted: insufficient payment - need ${Number(requiredAmount)} sats, got ${providedAmount} sats`
      case 'invalid_signature':
        return 'restricted: invalid payment signature'
      case 'invalid_nonce':
        return 'restricted: invalid payment nonce (replay attack?)'
      case 'channel_expired':
        return 'restricted: payment channel expired'
      case 'channel_not_found':
        return 'restricted: payment channel not found'
      default:
        return 'error: payment verification failed'
    }
  }

  /**
   * Send NOTICE message to client
   *
   * @param message - Human-readable notice message
   */
  private sendNotice(message: string): void {
    this.webSocket.emit(WebSocketAdapterEvent.Message, createNoticeMessage(message))
  }

  protected addExpirationMetadata(event: Event): Event | ExpiringEvent {
    const eventExpiration: number = getEventExpiration(event)
    if (!eventExpiration) {
      return event
    }

    const expiringEvent: ExpiringEvent = {
      ...event,
      [EventExpirationTimeMetadataKey]: eventExpiration,
    }

    return expiringEvent
  }
}
