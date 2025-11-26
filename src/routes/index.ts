/* eslint-disable sort-imports */
import { nodeinfo21Handler, nodeinfoHandler } from '../handlers/request-handlers/nodeinfo-handler'
import admissionRouter from './admissions'
import dashboardMetricsRouter from '../dashboard/routes/metrics'
import { getHealthRequestHandler } from '../handlers/request-handlers/get-health-request-handler'
import { getMetricsRequestHandler } from '../handlers/request-handlers/get-metrics-request-handler'
import { getTermsRequestHandler } from '../handlers/request-handlers/get-terms-request-handler'
import invoiceRouter from './invoices'
import { rateLimiterMiddleware } from '../handlers/request-handlers/rate-limiter-middleware'
import { rootRequestHandler } from '../handlers/request-handlers/root-request-handler'
import express from 'express'
/* eslint-enable sort-imports */

const router: express.Router = express.Router()

router.get('/', rootRequestHandler)
router.get('/healthz', getHealthRequestHandler)
router.get('/metrics', getMetricsRequestHandler)
router.get('/terms', getTermsRequestHandler)

router.get('/.well-known/nodeinfo', nodeinfoHandler)
router.get('/nodeinfo/2.1', nodeinfo21Handler)
router.get('/nodeinfo/2.0', nodeinfo21Handler)

router.use('/invoices', rateLimiterMiddleware, invoiceRouter)
router.use('/admissions', rateLimiterMiddleware, admissionRouter)
router.use('/dashboard', dashboardMetricsRouter)
// Callbacks route removed - payment processor webhooks no longer needed

export default router
