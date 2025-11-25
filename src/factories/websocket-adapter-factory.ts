/* eslint-disable sort-imports */
import { IncomingMessage } from 'http'
import { WebSocket } from 'ws'

import { IEventRepository, IUserRepository } from '../@types/repositories'
import { IWebSocketServerAdapter } from '../@types/adapters'
import { WebSocketAdapter } from '../adapters/web-socket-adapter'
import { FreeTierTracker } from '../services/payment/free-tier-tracker'
import { createSettings } from './settings-factory'
import { messageHandlerFactory } from './message-handler-factory'
import { slidingWindowRateLimiterFactory } from './rate-limiter-factory'
/* eslint-enable sort-imports */


export const webSocketAdapterFactory = (
  eventRepository: IEventRepository,
  userRepository: IUserRepository,
  freeTierTracker: FreeTierTracker,
) => ([client, request, webSocketServerAdapter]: [WebSocket, IncomingMessage, IWebSocketServerAdapter]) =>
    new WebSocketAdapter(
      client,
      request,
      webSocketServerAdapter,
      messageHandlerFactory(eventRepository, userRepository, freeTierTracker),
      slidingWindowRateLimiterFactory,
      createSettings,
    )
