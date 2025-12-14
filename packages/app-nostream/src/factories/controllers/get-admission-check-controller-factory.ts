import { GetSubmissionCheckController } from '../../controllers/admission/get-admission-check-controller'
import { getMasterDbClient } from '../../database/client'
import { UserRepository } from '../../repositories/user-repository'
import { slidingWindowRateLimiterFactory } from '../rate-limiter-factory'
import { createSettings } from '../settings-factory'

export const createGetAdmissionCheckController = () => {
  const dbClient = getMasterDbClient()
  const userRepository = new UserRepository(dbClient)
  
  return new GetSubmissionCheckController(
    userRepository,
    createSettings,
    slidingWindowRateLimiterFactory
  )
}
