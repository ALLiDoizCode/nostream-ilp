
/**
 * Peer Discovery Module
 * ILP node discovery and announcement management
 *
 * Epic 6: Peer Networking & Social Graph Integration
 */

export * from './ilp-address-generator.js'
export * from './announcement-publisher.js'
export * from './announcement-query.js'
export * from './announcement-validator.js'
export * from './address-resolver.js'

// Story 6.3: Follow List Integration exports
export { FollowListMonitor } from './follow-list-monitor.js'
export type { OnFollowAddedCallback, OnFollowRemovedCallback } from './follow-list-monitor.js'
export { FollowListStore, getFollowListStore } from './follow-list-store.js'
export { AutoSubscriber, getAutoSubscriber, setAutoSubscriber } from './auto-subscriber.js'
export type { ChannelOpeningPrompt } from './auto-subscriber.js'
export { ChannelRequiredError } from './auto-subscriber.js'
export { PaymentChannelManager, getPaymentChannelManager } from './payment-channel-manager.js'
export type { OpenChannelResult, CloseChannelResult, ChannelState } from './payment-channel-manager.js'
export { SubscriptionPreferencesManager, getSubscriptionPreferencesManager } from './subscription-preferences.js'
export type { SubscriptionPreferences } from './subscription-preferences.js'
export { SubscriptionRenewalJob, getSubscriptionRenewalJob, setSubscriptionRenewalJob } from './subscription-renewal.js'
export type { SubscriptionRenewalConfig, RenewalRunStats } from './subscription-renewal.js'
