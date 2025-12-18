
/**
 * Peer Discovery Module
 * ILP node discovery and announcement management
 *
 * Epic 6: Peer Networking & Social Graph Integration
 */

export * from './ilp-address-generator'
export * from './announcement-publisher'
export * from './announcement-query'
export { validateNodeAnnouncement, validateNodeAnnouncementDetailed, ValidationErrorCode } from './announcement-validator'
export type { ValidationResult as AnnouncementValidationResult } from './announcement-validator'
export * from './address-resolver'

// Story 6.3: Follow List Integration exports
export { FollowListMonitor } from './follow-list-monitor'
export type { OnFollowAddedCallback, OnFollowRemovedCallback } from './follow-list-monitor'
export { FollowListStore, getFollowListStore } from './follow-list-store'
export { AutoSubscriber, getAutoSubscriber, setAutoSubscriber } from './auto-subscriber'
export type { ChannelOpeningPrompt } from './auto-subscriber'
export { ChannelRequiredError } from './auto-subscriber'
export { PaymentChannelManager, getPaymentChannelManager } from './payment-channel-manager'
export type { OpenChannelResult, CloseChannelResult, ChannelState } from './payment-channel-manager'
export { SubscriptionPreferencesManager, getSubscriptionPreferencesManager } from './subscription-preferences'
export type { SubscriptionPreferences } from './subscription-preferences'
export { SubscriptionRenewalJob, getSubscriptionRenewalJob, setSubscriptionRenewalJob } from './subscription-renewal'
export type { SubscriptionRenewalConfig, RenewalRunStats } from './subscription-renewal'
