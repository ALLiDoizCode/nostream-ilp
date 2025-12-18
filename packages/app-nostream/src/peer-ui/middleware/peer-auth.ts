import { NextFunction, Request, Response } from 'express'
import { createLogger } from '../../factories/logger-factory'

const logger = createLogger('peer-ui:auth')

/**
 * HTTP Basic Auth middleware for peer UI access
 *
 * Validates credentials against PEER_UI_USERNAME and PEER_UI_PASSWORD environment variables.
 * Falls back to DASHBOARD credentials if PEER_UI credentials are not set.
 * Returns 401 Unauthorized if credentials are missing, invalid, or password is not configured.
 */
export const peerAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    logger('Unauthorized peer UI access attempt - missing auth header from %s', req.ip)
    res
      .status(401)
      .setHeader('WWW-Authenticate', 'Basic realm="Peer UI"')
      .send('Unauthorized')
    return
  }

  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString()
  const [username, password] = credentials.split(':')

  // Use PEER_UI credentials if set, otherwise fall back to DASHBOARD credentials
  const validUsername = process.env.PEER_UI_USERNAME || process.env.DASHBOARD_USERNAME || 'admin'
  const validPassword = process.env.PEER_UI_PASSWORD || process.env.DASHBOARD_PASSWORD

  if (!validPassword) {
    logger('CRITICAL: Neither PEER_UI_PASSWORD nor DASHBOARD_PASSWORD environment variable is set')
    res.status(500).send('Peer UI authentication not configured')
    return
  }

  if (username !== validUsername || password !== validPassword) {
    logger('Failed peer UI login attempt - invalid credentials for user "%s" from %s', username, req.ip)
    res
      .status(401)
      .setHeader('WWW-Authenticate', 'Basic realm="Peer UI"')
      .send('Unauthorized')
    return
  }

  // Authentication successful
  logger('Peer UI access granted for user "%s" from %s', username, req.ip)
  next()
}
