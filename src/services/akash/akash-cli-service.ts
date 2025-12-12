/**
 * Akash CLI Service
 *
 * Provides programmatic access to Akash CLI for peer node deployment.
 * This service wraps the Akash CLI installed in the container, enabling
 * peers to deploy other peer nodes and pay for hosting.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'

const execAsync = promisify(exec)

export interface AkashDeploymentConfig {
  sdlPath: string;
  walletName: string;
  network: 'mainnet' | 'testnet' | 'sandbox';
  envVars?: Record<string, string>;
}

export interface AkashDeploymentResult {
  dseq: string;
  provider: string;
  leaseId: string;
  uri: string;
  cost: {
    uaktPerBlock: number;
    aktPerMonth: number;
  };
}

export interface AkashWalletInfo {
  name: string;
  address: string;
  mnemonic?: string;
}

/**
 * Akash CLI Service
 * Uses installed Akash CLI for deployment operations
 */
export class AkashCLIService {
  private readonly networkConfigs = {
    mainnet: {
      rpcUrl: 'https://rpc.akashnet.net:443',
      chainId: 'akashnet-2',
    },
    testnet: {
      rpcUrl: 'https://rpc.testnet.akash.network:443',
      chainId: 'testnet-02',
    },
    sandbox: {
      rpcUrl: 'https://rpc.sandbox-2.aksh.pw:443',
      chainId: 'sandbox-2',
    },
  }

  /**
   * Check if Akash CLI is installed and available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('akash version')
      return stdout.includes('akash')
    } catch (error) {
      return false
    }
  }

  /**
   * Get Akash CLI version
   */
  async getVersion(): Promise<string> {
    const { stdout } = await execAsync('akash version')
    return stdout.trim()
  }

  /**
   * Create new Akash wallet
   */
  async createWallet(walletName: string): Promise<AkashWalletInfo> {
    const { stdout } = await execAsync(
      `akash keys add ${walletName} --keyring-backend test --output json`
    )

    const result = JSON.parse(stdout)

    return {
      name: result.name,
      address: result.address,
      mnemonic: result.mnemonic,
    }
  }

  /**
   * Import wallet from mnemonic
   */
  async importWallet(walletName: string, mnemonic: string): Promise<AkashWalletInfo> {
    // Write mnemonic to temp file for import
    const tempFile = `/tmp/mnemonic-${Date.now()}.txt`
    await fs.writeFile(tempFile, mnemonic)

    try {
      const { stdout } = await execAsync(
        `echo "${mnemonic}" | akash keys add ${walletName} --recover --keyring-backend test --output json`
      )

      const result = JSON.parse(stdout)

      return {
        name: result.name,
        address: result.address,
      }
    } finally {
      // Clean up temp file
      await fs.unlink(tempFile).catch(() => {})
    }
  }

  /**
   * Get wallet address
   */
  async getWalletAddress(walletName: string): Promise<string> {
    const { stdout } = await execAsync(
      `akash keys show ${walletName} -a --keyring-backend test`
    )
    return stdout.trim()
  }

  /**
   * Check wallet balance
   */
  async getBalance(walletName: string, network: 'mainnet' | 'testnet' | 'sandbox'): Promise<number> {
    const config = this.networkConfigs[network]
    const address = await this.getWalletAddress(walletName)

    const { stdout } = await execAsync(
      `akash query bank balances ${address} --node ${config.rpcUrl} --output json`
    )

    const result = JSON.parse(stdout)
    const aktBalance = result.balances.find((b: any) => b.denom === 'uakt')

    return aktBalance ? parseInt(aktBalance.amount) / 1_000_000 : 0
  }

  /**
   * Deploy to Akash Network
   */
  async deploy(config: AkashDeploymentConfig): Promise<AkashDeploymentResult> {
    const networkConfig = this.networkConfigs[config.network]

    // Step 1: Verify wallet has sufficient balance
    const balance = await this.getBalance(config.walletName, config.network)
    if (balance < 5) {
      throw new Error(`Insufficient balance: ${balance} AKT (minimum 5 AKT required)`)
    }

    // Step 2: Create deployment
    const { stdout: deployOutput } = await execAsync(
      `akash tx deployment create ${config.sdlPath} \
        --from ${config.walletName} \
        --node ${networkConfig.rpcUrl} \
        --chain-id ${networkConfig.chainId} \
        --keyring-backend test \
        --gas auto \
        --gas-prices 0.025uakt \
        --gas-adjustment 1.5 \
        --yes \
        --output json`
    )

    const deployResult = JSON.parse(deployOutput)

    // Extract DSEQ from transaction logs
    const dseq = this.extractDSEQ(deployResult)

    // Step 3: Wait for bids (retry for up to 3 minutes)
    const bids = await this.waitForBids(config.walletName, dseq, config.network)

    if (bids.length === 0) {
      throw new Error('No provider bids received after 3 minutes')
    }

    // Step 4: Accept lowest bid
    const lowestBid = bids.sort((a, b) =>
      parseInt(a.price.amount) - parseInt(b.price.amount)
    )[0]

    await this.acceptBid(config.walletName, lowestBid, config.network)

    // Step 5: Return deployment result
    return {
      dseq,
      provider: lowestBid.bid_id.provider,
      leaseId: this.formatLeaseId(lowestBid.bid_id),
      uri: `https://${lowestBid.bid_id.provider}.provider.akash.network`,
      cost: {
        uaktPerBlock: parseInt(lowestBid.price.amount),
        aktPerMonth: this.calculateMonthlyAKT(parseInt(lowestBid.price.amount)),
      },
    }
  }

  /**
   * Wait for provider bids
   */
  private async waitForBids(
    walletName: string,
    dseq: string,
    network: 'mainnet' | 'testnet' | 'sandbox',
    timeoutMs: number = 180000
  ): Promise<any[]> {
    const config = this.networkConfigs[network]
    const address = await this.getWalletAddress(walletName)
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      const { stdout } = await execAsync(
        `akash query market bid list \
          --owner ${address} \
          --dseq ${dseq} \
          --node ${config.rpcUrl} \
          --output json`
      )

      const result = JSON.parse(stdout)
      if (result.bids && result.bids.length > 0) {
        return result.bids
      }

      // Wait 5 seconds before retry
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    return []
  }

  /**
   * Accept bid and create lease
   */
  private async acceptBid(
    walletName: string,
    bid: any,
    network: 'mainnet' | 'testnet' | 'sandbox'
  ): Promise<void> {
    const config = this.networkConfigs[network]

    await execAsync(
      `akash tx market lease create \
        --dseq ${bid.bid_id.dseq} \
        --gseq ${bid.bid_id.gseq} \
        --oseq ${bid.bid_id.oseq} \
        --provider ${bid.bid_id.provider} \
        --from ${walletName} \
        --node ${config.rpcUrl} \
        --chain-id ${config.chainId} \
        --keyring-backend test \
        --gas auto \
        --gas-prices 0.025uakt \
        --yes`
    )
  }

  /**
   * Close deployment
   */
  async closeDeployment(
    walletName: string,
    dseq: string,
    network: 'mainnet' | 'testnet' | 'sandbox'
  ): Promise<void> {
    const config = this.networkConfigs[network]

    await execAsync(
      `akash tx deployment close \
        --dseq ${dseq} \
        --from ${walletName} \
        --node ${config.rpcUrl} \
        --chain-id ${config.chainId} \
        --keyring-backend test \
        --gas auto \
        --gas-prices 0.025uakt \
        --yes`
    )
  }

  /**
   * Get deployment logs
   */
  async getLogs(
    walletName: string,
    dseq: string,
    provider: string,
    network: 'mainnet' | 'testnet' | 'sandbox'
  ): Promise<string> {
    const config = this.networkConfigs[network]

    const { stdout } = await execAsync(
      `akash provider service-logs \
        --dseq ${dseq} \
        --provider ${provider} \
        --from ${walletName} \
        --node ${config.rpcUrl} \
        --keyring-backend test`
    )

    return stdout
  }

  /**
   * Extract DSEQ from deployment transaction result
   */
  private extractDSEQ(txResult: any): string {
    // Try to extract from logs
    if (txResult.logs && txResult.logs.length > 0) {
      for (const log of txResult.logs) {
        for (const event of log.events || []) {
          if (event.type === 'akash.v1') {
            const dseqAttr = event.attributes.find((attr: any) => attr.key === 'dseq')
            if (dseqAttr) {
              return dseqAttr.value
            }
          }
        }
      }
    }

    // Fallback: try to extract from raw log
    if (txResult.raw_log) {
      const match = txResult.raw_log.match(/dseq:(\d+)/)
      if (match) {
        return match[1]
      }
    }

    throw new Error('Could not extract DSEQ from transaction result')
  }

  /**
   * Format lease ID
   */
  private formatLeaseId(bidId: any): string {
    return `${bidId.owner}/${bidId.dseq}/${bidId.gseq}/${bidId.oseq}/${bidId.provider}`
  }

  /**
   * Calculate monthly AKT cost from per-block pricing
   */
  private calculateMonthlyAKT(uaktPerBlock: number): number {
    const blocksPerMonth = 1_051_200 // 30 days × 24 hours × 60 min × 60 sec / 6 sec
    return (uaktPerBlock * blocksPerMonth) / 1_000_000
  }
}

/**
 * Singleton instance
 */
export const akashCLI = new AkashCLIService()
