import { Router } from 'express'
import { peerAuth } from '../middleware/peer-auth'
import peerDiscoveryRouter from './peer-discovery'
import subscriptionManagerRouter from './subscription-manager'
import channelManagerRouter from './channel-manager'
import publishEventRouter from './publish-event'
import eventFeedRouter from './event-feed'

const router: Router = Router()

/**
 * Peer UI root - serves peer.html
 * Protected by HTTP Basic Auth
 */
router.get('/', peerAuth, (req, res) => {
  res.sendFile('peer.html', { root: './dist/peer-ui/static' })
})

/**
 * Mount peer UI API routes
 */
router.use(peerDiscoveryRouter)
router.use(subscriptionManagerRouter)
router.use(channelManagerRouter)
router.use(publishEventRouter)
router.use(eventFeedRouter)

export default router
