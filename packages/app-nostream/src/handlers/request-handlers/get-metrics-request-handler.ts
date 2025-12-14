import { NextFunction, Request, Response } from 'express'
import { register } from '../../services/metrics'

/**
 * Prometheus metrics endpoint handler
 *
 * Returns metrics in Prometheus text format for scraping.
 *
 * Metrics exposed:
 * - nostream_dassie_connection_state: Dassie connection state (0-3)
 * - nostream_degraded_mode_active: Whether degraded mode is active (0-1)
 * - nostream_degraded_mode_queue_size: Number of queued verifications
 * - nostream_service_health_status: Health status per service (0-2)
 *
 * @param _req - Express request
 * @param res - Express response
 * @param next - Express next function
 */
export const getMetricsRequestHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get metrics in Prometheus format
    const metrics = await register.metrics()

    res
      .status(200)
      .setHeader('content-type', register.contentType)
      .send(metrics)

    next()
  } catch (error) {
    console.error('Metrics endpoint failed:', error)

    res
      .status(500)
      .setHeader('content-type', 'text/plain')
      .send('# Error generating metrics\n')

    next(error)
  }
}
