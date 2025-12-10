import { createGetAdmissionCheckController } from '../../factories/controllers/get-admission-check-controller-factory'
import { withController } from '../../handlers/request-handlers/with-controller-request-handler'
import { Router } from 'express'
import type { Router as RouterType } from 'express'

const admissionRouter: RouterType = Router()

admissionRouter
  .get('/check/:pubkey', withController(createGetAdmissionCheckController))

export default admissionRouter