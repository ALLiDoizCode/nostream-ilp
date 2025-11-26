import { NextFunction, Request, Response } from 'express'

import { createLogger } from '../../factories/logger-factory'

const logger = createLogger('dashboard:auth')

/**
 * HTTP Basic Auth middleware for dashboard access
 *
 * Validates credentials against DASHBOARD_USERNAME and DASHBOARD_PASSWORD environment variables.
 * Returns 401 Unauthorized if credentials are missing, invalid, or password is not configured.
 */
export const dashboardAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    logger('Unauthorized dashboard access attempt - missing auth header from %s', req.ip)
    res
      .status(401)
      .setHeader('WWW-Authenticate', 'Basic realm="Dashboard"')
      .send('Unauthorized')
    return
  }

  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString()
  const [username, password] = credentials.split(':')

  const validUsername = process.env.DASHBOARD_USERNAME || 'admin'
  const validPassword = process.env.DASHBOARD_PASSWORD

  if (!validPassword) {
    logger('CRITICAL: DASHBOARD_PASSWORD environment variable not set')
    res.status(500).send('Dashboard authentication not configured')
    return
  }

  if (username !== validUsername || password !== validPassword) {
    logger('Failed dashboard login attempt - invalid credentials for user "%s" from %s', username, req.ip)
    res
      .status(401)
      .setHeader('WWW-Authenticate', 'Basic realm="Dashboard"')
      .send('Unauthorized')
    return
  }

  // Authentication successful
  logger('Dashboard access granted for user "%s" from %s', username, req.ip)
  next()
}
