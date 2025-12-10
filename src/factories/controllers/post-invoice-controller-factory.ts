import { IController } from '../../@types/controllers'
import { PostInvoiceController } from '../../controllers/invoices/post-invoice-controller'
import { getMasterDbClient } from '../../database/client'
import { UserRepository } from '../../repositories/user-repository'
import { createPaymentsService } from '../payments-service-factory'
import { slidingWindowRateLimiterFactory } from '../rate-limiter-factory'
import { createSettings } from '../settings-factory'

export const createPostInvoiceController = (): IController => {
  const dbClient = getMasterDbClient()
  const userRepository = new UserRepository(dbClient)
  const paymentsService = createPaymentsService()

  return new PostInvoiceController(
    userRepository,
    paymentsService,
    createSettings,
    slidingWindowRateLimiterFactory,
  )
}
