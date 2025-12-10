import express from 'express'
import helmet from 'helmet'
import router from '../routes'
import { createSettings } from './settings-factory'

export const createWebApp = (): express.Application => {
  const app = express()
  app
    .disable('x-powered-by')
    .use((req, res, next) => {
      const settings = createSettings()

      const relayUrl = new URL(settings.info.relay_url)
      const webRelayUrl = new URL(relayUrl.toString())
      webRelayUrl.protocol = (relayUrl.protocol === 'wss:') ? 'https:' : ':'

      const directives = {
        /**
         * TODO: Remove 'unsafe-inline'
         */
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'", settings.info.relay_url as string, webRelayUrl.toString()],
        'default-src': ["'self'"],
        'script-src-attr': ["'unsafe-inline'"],
        'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net/npm/', 'https://unpkg.com/', 'https://cdnjs.cloudflare.com/ajax/libs/'],
        'style-src': ["'self'", 'https://cdn.jsdelivr.net/npm/'],
        'font-src': ["'self'", 'https://cdn.jsdelivr.net/npm/'],
      }

      return helmet.contentSecurityPolicy({ directives })(req, res, next)
    })
    .use('/favicon.ico', express.static('./resources/favicon.ico'))
    .use('/css', express.static('./resources/css'))
    .use('/dashboard', express.static('./dist/dashboard/static'))
    .use(router)

  return app
}