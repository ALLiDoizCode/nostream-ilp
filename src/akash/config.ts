import { AkashWalletConfig } from './wallet'

/**
 * Akash module configuration.
 */
export interface AkashConfig {
  /** Whether Akash wallet is enabled */
  enabled: boolean

  /** Wallet configuration */
  wallet: {
    /** Optional: Import existing wallet from mnemonic */
    mnemonic?: string
    /** Optional: Encrypted mnemonic from storage */
    encryptedMnemonic?: string
    /** Required: Encryption password */
    password: string
  }

  /** RPC configuration */
  rpc: {
    /** Primary RPC endpoint */
    endpoint: string
    /** Fallback RPC endpoints */
    fallbacks: string[]
  }

  /** Chain configuration */
  chain: {
    /** Chain ID (e.g., akashnet-2, testnet-02) */
    chainId: string
    /** Bech32 address prefix */
    prefix: string
    /** Gas price (e.g., 0.025uakt) */
    gasPrice: string
  }

  /** Deployment lease ID (format: dseq/gseq/oseq) */
  leaseId?: string

  /** Escrow deposit configuration (Story 7.4) */
  escrow?: {
    /** Escrow account address for this lease */
    address: string
    /** Warning threshold in days */
    minDays: number
    /** Auto-deposit target in days */
    targetDays: number
    /** Daily hosting cost in AKT */
    dailyCostAkt: number
    /** Minimum wallet balance to maintain */
    walletMinBalance: number
    /** Check interval in hours */
    checkIntervalHours: number
  }
}

/**
 * Load Akash configuration from environment variables.
 *
 * Environment Variables:
 * - AKASH_WALLET_ENABLED: Enable/disable Akash wallet (default: false)
 * - AKASH_WALLET_MNEMONIC: Import existing wallet from 24-word mnemonic
 * - AKASH_WALLET_ENCRYPTED: Encrypted mnemonic from previous session
 * - AKASH_WALLET_PASSWORD: Password to encrypt/decrypt mnemonic (required if enabled)
 * - AKASH_RPC_ENDPOINT: Primary RPC endpoint (default: https://rpc.akash.forbole.com:443)
 * - AKASH_CHAIN_ID: Chain ID (default: akashnet-2)
 * - AKASH_GAS_PRICE: Gas price (default: 0.025uakt)
 * - AKASH_LEASE_ID: Deployment lease ID (format: dseq/gseq/oseq)
 * - AKASH_ESCROW_ADDRESS: Escrow account address
 * - AKASH_ESCROW_MIN_DAYS: Warning threshold in days (default: 7)
 * - AKASH_ESCROW_TARGET_DAYS: Auto-deposit target in days (default: 30)
 * - AKASH_ESCROW_DAILY_COST_AKT: Daily hosting cost in AKT (default: 1.5)
 * - AKASH_ESCROW_WALLET_MIN_BALANCE: Minimum wallet balance (default: 10.0)
 * - AKASH_ESCROW_CHECK_INTERVAL_HOURS: Check interval in hours (default: 24)
 *
 * @returns Akash configuration
 */
export function loadAkashConfig(): AkashConfig {
  const escrowAddress = process.env.AKASH_ESCROW_ADDRESS

  return {
    enabled: process.env.AKASH_WALLET_ENABLED === 'true',
    wallet: {
      mnemonic: process.env.AKASH_WALLET_MNEMONIC,
      encryptedMnemonic: process.env.AKASH_WALLET_ENCRYPTED,
      password: process.env.AKASH_WALLET_PASSWORD || '',
    },
    rpc: {
      endpoint: process.env.AKASH_RPC_ENDPOINT || 'https://rpc.akash.forbole.com:443',
      fallbacks: [
        'https://akash-rpc.polkachu.com:443',
        'https://rpc-akash.ecostake.com:443',
      ],
    },
    chain: {
      chainId: process.env.AKASH_CHAIN_ID || 'akashnet-2',
      prefix: 'akash',
      gasPrice: process.env.AKASH_GAS_PRICE || '0.025uakt',
    },
    leaseId: process.env.AKASH_LEASE_ID,
    escrow: escrowAddress ? {
      address: escrowAddress,
      minDays: parseFloat(process.env.AKASH_ESCROW_MIN_DAYS || '7'),
      targetDays: parseFloat(process.env.AKASH_ESCROW_TARGET_DAYS || '30'),
      dailyCostAkt: parseFloat(process.env.AKASH_ESCROW_DAILY_COST_AKT || '1.5'),
      walletMinBalance: parseFloat(process.env.AKASH_ESCROW_WALLET_MIN_BALANCE || '10.0'),
      checkIntervalHours: parseFloat(process.env.AKASH_ESCROW_CHECK_INTERVAL_HOURS || '24'),
    } : undefined,
  }
}

/**
 * Convert AkashConfig to AkashWalletConfig.
 *
 * @param config - Akash configuration
 * @returns Wallet configuration
 */
export function toWalletConfig(config: AkashConfig): AkashWalletConfig {
  return {
    rpcEndpoint: config.rpc.endpoint,
    rpcFallbacks: config.rpc.fallbacks,
    chainId: config.chain.chainId,
    prefix: config.chain.prefix,
    gasPrice: config.chain.gasPrice,
  }
}

/**
 * Validate Akash configuration.
 *
 * @param config - Akash configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateAkashConfig(config: AkashConfig): void {
  if (!config.enabled) {
    return // No validation needed if disabled
  }

  // Validate password is provided
  if (!config.wallet.password) {
    throw new Error(
      'AKASH_WALLET_PASSWORD is required when AKASH_WALLET_ENABLED=true',
    )
  }

  // Validate either mnemonic or encryptedMnemonic is provided
  if (!config.wallet.mnemonic && !config.wallet.encryptedMnemonic) {
    throw new Error(
      'Either AKASH_WALLET_MNEMONIC or AKASH_WALLET_ENCRYPTED must be provided',
    )
  }

  // Validate RPC endpoint
  if (!config.rpc.endpoint) {
    throw new Error('AKASH_RPC_ENDPOINT must be a valid URL')
  }

  // Validate chain ID
  if (!config.chain.chainId) {
    throw new Error('AKASH_CHAIN_ID is required')
  }

  // Validate gas price format
  if (!config.chain.gasPrice.match(/^\d+(\.\d+)?uakt$/)) {
    throw new Error(
      'AKASH_GAS_PRICE must be in format: <number>uakt (e.g., 0.025uakt)',
    )
  }
}
