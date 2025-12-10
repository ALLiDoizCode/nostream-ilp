import { EventMessageHandler } from '../handlers/event-message-handler'
import { IEventRepository, IUserRepository } from '../@types/repositories'
import { IWebSocketAdapter } from '../@types/adapters'
import { IncomingMessage, MessageType } from '../@types/messages'
import { SubscribeMessageHandler } from '../handlers/subscribe-message-handler'
import { UnsubscribeMessageHandler } from '../handlers/unsubscribe-message-handler'
import { createSettings } from './settings-factory'
import { eventStrategyFactory } from './event-strategy-factory'
import { getDassieClient } from './dassie-client-factory'
import { getDegradedModeManager } from './degraded-mode-manager-factory'
import { slidingWindowRateLimiterFactory } from './rate-limiter-factory'

import type { FreeTierTracker } from '../services/payment/free-tier-tracker'

/* eslint-disable sort-imports */
/* eslint-enable sort-imports */

export const messageHandlerFactory = (
  eventRepository: IEventRepository,
  userRepository: IUserRepository,
  freeTierTracker: FreeTierTracker,
) => ([message, adapter]: [IncomingMessage, IWebSocketAdapter]) => {
  switch (message[0]) {
    case MessageType.EVENT:
      {
        const dassieClient = getDassieClient()
        const degradedModeManager = getDegradedModeManager()
        return new EventMessageHandler(
          adapter,
          eventStrategyFactory(eventRepository),
          userRepository,
          createSettings,
          slidingWindowRateLimiterFactory,
          dassieClient,
          freeTierTracker,
          degradedModeManager,
        )
      }
    case MessageType.REQ:
      return new SubscribeMessageHandler(adapter, eventRepository, createSettings)
    case MessageType.CLOSE:
      return new UnsubscribeMessageHandler(adapter)
    default:
      throw new Error(`Unknown message type: ${String(message[0]).substring(0, 64)}`)
  }
}
