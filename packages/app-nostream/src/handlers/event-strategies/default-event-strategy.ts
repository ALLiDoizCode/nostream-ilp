import { IWebSocketAdapter } from '../../@types/adapters'
import { Event } from '../../@types/event'
import { IEventStrategy } from '../../@types/message-handlers'
import { IEventRepository } from '../../@types/repositories'
import { WebSocketAdapterEvent } from '../../constants/adapter'
import { createLogger } from '../../factories/logger-factory'
import { createCommandResult } from '../../utils/messages'

const debug = createLogger('default-event-strategy')

export class DefaultEventStrategy implements IEventStrategy<Event, Promise<void>> {
  public constructor(
    private readonly webSocket: IWebSocketAdapter,
    private readonly eventRepository: IEventRepository,
  ) { }

  public async execute(event: Event): Promise<void> {
    debug('received event: %o', event)
    const count = await this.eventRepository.create(event)
    this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, true, (count) ? '' : 'duplicate:'))

    if (count) {
      this.webSocket.emit(WebSocketAdapterEvent.Broadcast, event)
    }
  }
}
