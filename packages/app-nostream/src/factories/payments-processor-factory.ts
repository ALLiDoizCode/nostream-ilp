import { IPaymentsProcessor } from '../@types/clients'
import { NullPaymentsProcessor } from '../payments-processors/null-payments-processor'
import { createLogger } from './logger-factory'
import { createSettings } from './settings-factory'

const debug = createLogger('create-payments-processor')

export const createPaymentsProcessor = (): IPaymentsProcessor => {
  debug('create payments processor')

  const settings = createSettings()

  // All centralized payment processors removed
  // ILP integration will be added in future stories
  if (!settings.payments?.enabled) {
    return new NullPaymentsProcessor()
  }

  // Default to NullPaymentsProcessor until ILP integration (Story 1.2+)
  return new NullPaymentsProcessor()
}
