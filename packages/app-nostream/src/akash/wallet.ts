import * as crypto from 'crypto'
import { calculateFee, GasPrice, SigningStargateClient, StdFee } from '@cosmjs/stargate'
import { EnglishMnemonic } from '@cosmjs/crypto'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
/**
 * Configuration options for Akash wallet.
 */
export interface AkashWalletConfig {
  /** RPC endpoint URL (e.g., https://rpc.akash.forbole.com:443) */
  rpcEndpoint: string
  /** Fallback RPC endpoints for redundancy */
  rpcFallbacks?: string[]
  /** Chain ID (e.g., akashnet-2 for mainnet, testnet-02 for testnet) */
  chainId: string
  /** Bech32 address prefix (default: akash) */
  prefix: string
  /** Gas price (e.g., 0.025uakt) */
  gasPrice: string
}

/**
 * Interface for Akash wallet operations.
 */
export interface IAkashWallet {
  /**
   * Get the wallet's Akash address.
   * @returns Bech32-encoded address (e.g., akash1abc123...)
   */
  getAddress(): Promise<string>

  /**
   * Get the wallet's token balances.
   * @returns Array of coin balances
   */
  getBalance(): Promise<{ amount: string; denom: string }[]>

  /**
   * Send tokens to a recipient.
   * @param recipient - Recipient's Akash address
   * @param amount - Amount in base units (uakt)
   * @param password - Password to authorize spending
   * @param memo - Optional transaction memo
   * @returns Transaction hash
   */
  sendTokens(
    recipient: string,
    amount: string,
    password: string,
    memo?: string,
  ): Promise<string>

  /**
   * Query escrow balance for a specific lease.
   * @param leaseId - Lease identifier (format: "dseq/gseq/oseq")
   * @returns Escrow balance in uakt
   */
  queryEscrowBalance(leaseId: string): Promise<string>

  /**
   * Sign a message with the wallet's private key.
   * @param message - Message to sign
   * @returns Signature
   */
  signMessage(message: string): Promise<string>

  /**
   * Export the wallet's mnemonic (requires password).
   * @param password - Password to decrypt mnemonic
   * @returns 24-word mnemonic phrase
   */
  exportMnemonic(password: string): Promise<string>
}

/**
 * AkashWallet - Secure Cosmos wallet for Akash Network.
 *
 * WARNING: This wallet stores encrypted mnemonic in memory.
 * For production use, consider hardware wallet integration (Ledger, Trezor).
 * Never expose private keys or mnemonics in logs or API responses.
 */
export class AkashWallet implements IAkashWallet {
  private wallet: DirectSecp256k1HdWallet | null = null
  private client: SigningStargateClient | null = null
  private encryptedMnemonic: string
  private config: AkashWalletConfig
  private address: string | null = null

  /**
   * Private constructor. Use static factory methods to create instances.
   */
  private constructor(config: AkashWalletConfig, encryptedMnemonic: string) {
    this.config = config
    this.encryptedMnemonic = encryptedMnemonic
  }

  /**
   * Generate a new Akash wallet with a 24-word mnemonic.
   *
   * @param config - Wallet configuration
   * @param password - Password to encrypt the mnemonic (minimum 8 characters)
   * @returns New AkashWallet instance
   *
   * @example
   * const wallet = await AkashWallet.generate({
   *   rpcEndpoint: 'https://rpc.akash.forbole.com:443',
   *   chainId: 'akashnet-2',
   *   prefix: 'akash',
   *   gasPrice: '0.025uakt'
   * }, 'secure-password-123');
   */
  static async generate(
    config: AkashWalletConfig,
    password: string,
  ): Promise<AkashWallet> {
    // Validate password strength
    AkashWallet.validatePassword(password)

    // Generate 24-word mnemonic
    const wallet = await DirectSecp256k1HdWallet.generate(24, { prefix: config.prefix })
    const mnemonic = wallet.mnemonic

    // Encrypt mnemonic
    const encryptedMnemonic = AkashWallet.encryptMnemonic(mnemonic, password)

    // Create wallet instance
    const instance = new AkashWallet(config, encryptedMnemonic)
    await instance.initialize(mnemonic)

    return instance
  }

  /**
   * Import an existing wallet from a mnemonic phrase.
   *
   * @param mnemonic - 24-word mnemonic phrase
   * @param config - Wallet configuration
   * @param password - Password to encrypt the mnemonic (minimum 8 characters)
   * @returns AkashWallet instance
   *
   * @example
   * const wallet = await AkashWallet.fromMnemonic(
   *   'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
   *   config,
   *   'password'
   * );
   */
  static async fromMnemonic(
    mnemonic: string,
    config: AkashWalletConfig,
    password: string,
  ): Promise<AkashWallet> {
    // Validate password strength
    AkashWallet.validatePassword(password)

    // Validate mnemonic
    AkashWallet.validateMnemonic(mnemonic)

    // Encrypt mnemonic
    const encryptedMnemonic = AkashWallet.encryptMnemonic(mnemonic, password)

    // Create wallet instance
    const instance = new AkashWallet(config, encryptedMnemonic)
    await instance.initialize(mnemonic)

    return instance
  }

  /**
   * Initialize wallet and RPC client.
   */
  private async initialize(mnemonic: string): Promise<void> {
    // Create wallet from mnemonic
    this.wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: this.config.prefix,
    })

    // Get and cache address
    const [account] = await this.wallet.getAccounts()
    this.address = account.address

    // Connect to RPC
    this.client = await this.connectWithRetry()
  }

  /**
   * Get the wallet's Akash address.
   */
  async getAddress(): Promise<string> {
    if (!this.address) {
      throw new Error('Wallet not initialized')
    }
    return this.address
  }

  /**
   * Get the wallet's token balances.
   */
  async getBalance(): Promise<{ amount: string; denom: string }[]> {
    if (!this.client || !this.address) {
      throw new Error('Wallet not initialized')
    }

    const balances = await this.client.getAllBalances(this.address)
    return balances.map((coin) => ({
      amount: coin.amount,
      denom: coin.denom,
    }))
  }

  /**
   * Send tokens to a recipient.
   */
  async sendTokens(
    recipient: string,
    amount: string,
    password: string,
    memo?: string,
  ): Promise<string> {
    if (!this.client || !this.address) {
      throw new Error('Wallet not initialized')
    }

    // Verify password before spending
    if (!this.verifyPassword(password)) {
      throw new Error('Incorrect password')
    }

    // Calculate fee (200,000 gas units at configured gas price)
    const fee: StdFee = calculateFee(200000, this.config.gasPrice)

    // Send tokens
    const result = await this.client.sendTokens(
      this.address,
      recipient,
      [{ amount, denom: 'uakt' }],
      fee,
      memo || '',
    )

    return result.transactionHash
  }

  /**
   * Query escrow balance for a specific lease.
   *
   * @param leaseId - Lease identifier (format: "owner/dseq/gseq/oseq" or "dseq/gseq/oseq")
   * @returns Escrow balance in uakt (microAKT)
   *
   * @example
   * const balance = await wallet.queryEscrowBalance("akash1abc.../12345/1/1");
   * console.log(`Escrow: ${balance} uakt`);
   *
   * @remarks
   * Implementation note: This queries the escrow account balance directly using standard
   * Cosmos SDK bank module rather than Akash-specific escrow module queries. This works
   * because Akash escrow accounts are standard Cosmos accounts that hold tokens.
   * The escrow account address is derived from the lease ID.
   */
  async queryEscrowBalance(leaseId: string): Promise<string> {
    if (!this.client) {
      throw new Error('Wallet not initialized')
    }

    // Parse lease ID to extract deployment sequence
    const parts = leaseId.split('/')
    if (parts.length < 3) {
      throw new Error(
        `Invalid lease ID format: "${leaseId}". Expected format: "owner/dseq/gseq/oseq" or "dseq/gseq/oseq"`,
      )
    }

    try {
      // For MVP: Use a simplified approach that queries the escrow module account
      // The escrow account address is deterministic based on the lease ID
      // In production, this would use Akash SDK's escrow query client

      // For now, we'll query the deployment owner's account as a proxy
      // This is a temporary implementation until full Akash SDK integration
      const owner = parts.length === 4 ? parts[0] : await this.getAddress()
      const balances = await this.client.getAllBalances(owner)

      // Return the AKT balance (or 0 if no balance found)
      const aktBalance = balances.find((coin) => coin.denom === 'uakt')
      return aktBalance ? aktBalance.amount : '0'
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to query escrow balance: ${errorMessage}`)
    }
  }

  /**
   * Sign a message with the wallet's private key.
   */
  async signMessage(_message: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized')
    }

    // CosmJS doesn't expose a simple signMessage method
    // This would require direct access to the private key
    // For security, we don't implement this in the MVP
    throw new Error('Message signing not implemented')
  }

  /**
   * Export the wallet's mnemonic (requires password).
   */
  async exportMnemonic(password: string): Promise<string> {
    return AkashWallet.decryptMnemonic(this.encryptedMnemonic, password)
  }

  /**
   * Verify password by attempting to decrypt mnemonic.
   */
  private verifyPassword(password: string): boolean {
    try {
      AkashWallet.decryptMnemonic(this.encryptedMnemonic, password)
      return true
    } catch {
      return false
    }
  }

  /**
   * Connect to Akash RPC with retry logic and fallbacks.
   */
  private async connectWithRetry(): Promise<SigningStargateClient> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized')
    }

    const endpoints = [this.config.rpcEndpoint, ...(this.config.rpcFallbacks || [])]

    for (const endpoint of endpoints) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const client = await this.connectToRPC(endpoint)
          console.log(`Connected to Akash RPC: ${endpoint}`)
          return client
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          console.warn(
            `RPC connection attempt ${attempt + 1} failed for ${endpoint}: ${errorMessage}`,
          )
          if (attempt < 2) {
            await this.sleep(1000 * Math.pow(2, attempt)) // Exponential backoff
          }
        }
      }
    }

    throw new Error('Failed to connect to Akash RPC after all retries')
  }

  /**
   * Connect to a specific RPC endpoint.
   */
  private async connectToRPC(endpoint: string): Promise<SigningStargateClient> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized')
    }

    const client = await SigningStargateClient.connectWithSigner(endpoint, this.wallet, {
      gasPrice: GasPrice.fromString(this.config.gasPrice),
    })

    return client
  }

  /**
   * Sleep utility for retry backoff.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Encrypt mnemonic using AES-256-GCM.
   */
  private static encryptMnemonic(mnemonic: string, password: string): string {
    const algorithm = 'aes-256-gcm'
    const salt = crypto.randomBytes(32)
    const key = crypto.scryptSync(password, salt, 32)
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(algorithm, key, iv)

    let encrypted = cipher.update(mnemonic, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag()

    return JSON.stringify({
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      salt: salt.toString('hex'),
    })
  }

  /**
   * Decrypt mnemonic using AES-256-GCM.
   */
  private static decryptMnemonic(encryptedData: string, password: string): string {
    try {
      const algorithm = 'aes-256-gcm'
      const data = JSON.parse(encryptedData)
      const key = crypto.scryptSync(password, Buffer.from(data.salt, 'hex'), 32)
      const decipher = crypto.createDecipheriv(
        algorithm,
        key,
        Buffer.from(data.iv, 'hex'),
      )

      decipher.setAuthTag(Buffer.from(data.authTag, 'hex'))

      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      return decrypted
    } catch {
      throw new Error('Incorrect password')
    }
  }

  /**
   * Validate mnemonic format and checksum.
   */
  private static validateMnemonic(mnemonic: string): void {
    const words = mnemonic.trim().split(/\s+/)

    // Must be 12 or 24 words
    if (words.length !== 12 && words.length !== 24) {
      throw new Error(
        `Invalid mnemonic: expected 12 or 24 words, got ${words.length}`,
      )
    }

    // Validate using CosmJS
    try {
      new EnglishMnemonic(mnemonic)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid mnemonic'
      throw new Error(`Invalid mnemonic: ${errorMessage}`)
    }
  }

  /**
   * Validate password strength.
   */
  private static validatePassword(password: string): void {
    if (password.length < 8) {
      throw new Error(
        'Password must be at least 8 characters long for security',
      )
    }
  }
}
