import { getMasterDbClient, getReadReplicaDbClient } from '../database/client'
import { EventRepository } from '../repositories/event-repository'
import { InvoiceRepository } from '../repositories/invoice-repository'
import { UserRepository } from '../repositories/user-repository'
import { PaymentsService } from '../services/payments-service'
import { createPaymentsProcessor } from './payments-processor-factory'
import { createSettings } from './settings-factory'

export const createPaymentsService = () => {
  const dbClient = getMasterDbClient()
  const rrDbClient = getReadReplicaDbClient()
  const invoiceRepository = new InvoiceRepository(dbClient)
  const userRepository = new UserRepository(dbClient)
  const paymentsProcessor = createPaymentsProcessor()
  const eventRepository = new EventRepository(dbClient, rrDbClient)

  return new PaymentsService(
    dbClient,
    paymentsProcessor,
    userRepository,
    invoiceRepository,
    eventRepository,
    createSettings
  )
}
