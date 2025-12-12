/**
 * Akash Deployment API Routes
 *
 * Provides REST API for peer-to-peer deployment:
 * - Peers can pay to deploy new relay nodes
 * - Automated deployment to Akash Network
 * - Self-hosting capabilities
 */

import { Router, Request, Response } from 'express'
import { akashCLI } from '../services/akash/akash-cli-service'
import path from 'path'

const router = Router()

/**
 * GET /api/akash/status
 * Check Akash CLI availability
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const isAvailable = await akashCLI.isAvailable()

    if (!isAvailable) {
      return res.status(503).json({
        available: false,
        message: 'Akash CLI not installed or not accessible',
      })
    }

    const version = await akashCLI.getVersion()

    res.json({
      available: true,
      version,
      networks: ['mainnet', 'testnet', 'sandbox'],
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to check Akash CLI status',
      details: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * POST /api/akash/wallet/create
 * Create new Akash wallet for peer deployment
 *
 * Body: { walletName: string }
 */
router.post('/wallet/create', async (req: Request, res: Response) => {
  try {
    const { walletName } = req.body

    if (!walletName) {
      return res.status(400).json({ error: 'walletName required' })
    }

    const wallet = await akashCLI.createWallet(walletName)

    res.json({
      success: true,
      wallet: {
        name: wallet.name,
        address: wallet.address,
        mnemonic: wallet.mnemonic, // IMPORTANT: Save this securely!
      },
      warning: 'Save mnemonic securely - it cannot be recovered',
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create wallet',
      details: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * POST /api/akash/wallet/import
 * Import existing wallet from mnemonic
 *
 * Body: { walletName: string, mnemonic: string }
 */
router.post('/wallet/import', async (req: Request, res: Response) => {
  try {
    const { walletName, mnemonic } = req.body

    if (!walletName || !mnemonic) {
      return res.status(400).json({ error: 'walletName and mnemonic required' })
    }

    const wallet = await akashCLI.importWallet(walletName, mnemonic)

    res.json({
      success: true,
      wallet: {
        name: wallet.name,
        address: wallet.address,
      },
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to import wallet',
      details: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * GET /api/akash/wallet/:walletName/balance
 * Get wallet balance
 *
 * Query: ?network=mainnet|testnet|sandbox
 */
router.get('/wallet/:walletName/balance', async (req: Request, res: Response) => {
  try {
    const { walletName } = req.params
    const network = (req.query.network as string) || 'mainnet'

    if (!['mainnet', 'testnet', 'sandbox'].includes(network)) {
      return res.status(400).json({ error: 'Invalid network' })
    }

    const address = await akashCLI.getWalletAddress(walletName)
    const balance = await akashCLI.getBalance(walletName, network as any)

    res.json({
      wallet: walletName,
      address,
      network,
      balance: {
        akt: balance,
        uakt: balance * 1_000_000,
      },
      sufficient: balance >= 5,
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get balance',
      details: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * POST /api/akash/deploy
 * Deploy peer node to Akash Network
 *
 * Body: {
 *   walletName: string,
 *   network: 'mainnet' | 'testnet' | 'sandbox',
 *   sdlPath?: string  // Optional, defaults to akash/deploy.yaml
 * }
 */
router.post('/deploy', async (req: Request, res: Response) => {
  try {
    const { walletName, network, sdlPath } = req.body

    if (!walletName || !network) {
      return res.status(400).json({ error: 'walletName and network required' })
    }

    if (!['mainnet', 'testnet', 'sandbox'].includes(network)) {
      return res.status(400).json({ error: 'Invalid network' })
    }

    // Use default SDL path if not provided
    const finalSDLPath = sdlPath || path.join(process.cwd(), 'akash/deploy.yaml')

    // Deploy
    const result = await akashCLI.deploy({
      walletName,
      network,
      sdlPath: finalSDLPath,
    })

    res.json({
      success: true,
      deployment: {
        dseq: result.dseq,
        provider: result.provider,
        leaseId: result.leaseId,
        uri: result.uri,
        cost: {
          uaktPerBlock: result.cost.uaktPerBlock,
          aktPerMonth: result.cost.aktPerMonth,
          estimatedUSDPerMonth: result.cost.aktPerMonth * 5, // Assuming $5/AKT
        },
        network,
      },
      nextSteps: [
        'Wait 5-10 minutes for containers to start',
        `Check logs: GET /api/akash/deployment/${result.dseq}/logs`,
        `Access service at: ${result.uri}`,
      ],
    })
  } catch (error) {
    res.status(500).json({
      error: 'Deployment failed',
      details: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * GET /api/akash/deployment/:dseq/logs
 * Get deployment logs
 *
 * Query: ?walletName=xxx&provider=xxx&network=xxx
 */
router.get('/deployment/:dseq/logs', async (req: Request, res: Response) => {
  try {
    const { dseq } = req.params
    const { walletName, provider, network } = req.query

    if (!walletName || !provider || !network) {
      return res.status(400).json({
        error: 'walletName, provider, and network query params required',
      })
    }

    const logs = await akashCLI.getLogs(
      walletName as string,
      dseq,
      provider as string,
      network as any
    )

    res.json({
      dseq,
      provider,
      logs,
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get logs',
      details: error instanceof Error ? error.message : String(error),
    })
  }
})

/**
 * DELETE /api/akash/deployment/:dseq
 * Close deployment and reclaim funds
 *
 * Body: { walletName: string, network: string }
 */
router.delete('/deployment/:dseq', async (req: Request, res: Response) => {
  try {
    const { dseq } = req.params
    const { walletName, network } = req.body

    if (!walletName || !network) {
      return res.status(400).json({ error: 'walletName and network required' })
    }

    await akashCLI.closeDeployment(walletName, dseq, network)

    res.json({
      success: true,
      message: `Deployment ${dseq} closed successfully`,
      note: 'Unused deposit will be refunded to your wallet',
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to close deployment',
      details: error instanceof Error ? error.message : String(error),
    })
  }
})

export default router
