import { Request, Response, Router } from 'express'
import { peerAuth } from '../middleware/peer-auth'

const router: Router = Router()

/**
 * Event cost breakdown interface
 */
interface EventCost {
  costMsats: number
  breakdown: {
    relayFee: number
    sizeFee: number
    arweaveCost: number
  }
}

/**
 * Calculate event publishing cost based on kind and size
 * @param kind - Event kind number
 * @param contentSize - Content size in bytes
 * @returns Cost breakdown
 */
function calculateEventCost(kind: number, contentSize: number): EventCost {
  // Base relay fees per kind
  const kindMultipliers: Record<number, number> = {
    1: 0.1,      // Short notes - cheap (100 msats base * 0.1 = 10 msats effective)
    30023: 2.0,  // Long-form - 2x (200 msats relay fee)
    1063: 3.0,   // Files - 3x
    71: 5.0,     // Video - 5x
  }

  const baseRelayFee = 100 // 100 msats base
  const multiplier = kindMultipliers[kind] || 1.0
  const relayFee = Math.floor(baseRelayFee * multiplier)

  // Size fee: Free first 1MB, then 1000 msats per MB
  const sizeMB = contentSize / (1024 * 1024)
  const sizeFee = Math.max(0, Math.floor((sizeMB - 1) * 1000))

  // Arweave cost: 5000 msats per MB for kinds that require Arweave
  const requiresArweave = [30023, 1063, 71, 22, 20].includes(kind)
  const arweavePricePerMB = 5000
  const arweaveCost = requiresArweave ? Math.ceil(sizeMB * arweavePricePerMB) : 0

  const totalCost = relayFee + sizeFee + arweaveCost

  return {
    costMsats: totalCost,
    breakdown: {
      relayFee,
      sizeFee,
      arweaveCost,
    },
  }
}

/**
 * GET /peer/api/cost
 * Calculate cost for publishing an event
 *
 * Query parameters:
 * - kind: Event kind (number)
 * - size: Content size in bytes (number)
 */
router.get('/api/cost', peerAuth, (req: Request, res: Response) => {
  try {
    const kind = parseInt(req.query.kind as string, 10)
    const size = parseInt(req.query.size as string, 10)

    if (isNaN(kind) || isNaN(size)) {
      res.status(400).json({
        error: 'Invalid parameters. Required: kind (number), size (number)',
      })
      return
    }

    if (size < 0 || size > 10 * 1024 * 1024) {
      // 10MB max
      res.status(400).json({
        error: 'Content size must be between 0 and 10MB',
      })
      return
    }

    const cost = calculateEventCost(kind, size)
    res.json(cost)
  } catch (error: any) {
    console.error('Cost calculation error:', error)
    res.status(500).json({
      error: 'Internal server error calculating cost',
    })
  }
})

export default router
export { calculateEventCost }
