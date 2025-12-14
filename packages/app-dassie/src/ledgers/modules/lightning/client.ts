import LightningClient from "@asoltys/clightning-client"
import { homedir } from "node:os"
import path from "node:path"

import { settlementLightning as logger } from "../../../logger/instances"

export interface LightningNodeInfo {
  id: string // Node public key
  alias: string
  color: string
  numPeers: number
  numActiveChannels: number
  numPendingChannels: number
  blockHeight: number
  network: string
}

export interface LightningChannel {
  channelId: string
  shortChannelId?: string | undefined
  peerPubkey: string
  capacity: bigint
  localBalance: bigint
  remoteBalance: bigint
  state: "pending" | "active" | "closing" | "closed"
}

export interface LightningInvoice {
  bolt11: string
  paymentHash: string
  paymentSecret: string
  expiresAt: number
}

export interface LightningPaymentResult {
  paymentPreimage: string
  paymentHash: string
  amountSent: bigint
  feePaid: bigint
}

export interface CreateLightningClientOptions {
  network: "testnet" | "mainnet"
  socketPath?: string
}

/**
 * Wrapper around Core Lightning RPC client.
 * Provides simplified interface for Dassie settlement module.
 */
export class ClnClient {
  private client: LightningClient
  private network: "testnet" | "mainnet"

  constructor(options: CreateLightningClientOptions) {
    this.network = options.network

    // Default socket path for CLN
    const defaultSocketPath =
      options.network === "testnet"
        ? path.join(homedir(), ".lightning", "testnet", "lightning-rpc")
        : path.join(homedir(), ".lightning", "lightning-rpc")

    const socketPath = options.socketPath ?? defaultSocketPath

    logger.info("initializing CLN client", { socketPath, network: this.network })

    this.client = new LightningClient(socketPath)
  }

  /**
   * Get information about the Lightning node.
   */
  async getInfo(): Promise<LightningNodeInfo> {
    try {
      const info = await this.client.getinfo()

      return {
        id: info.id,
        alias: info.alias,
        color: info.color,
        numPeers: info.num_peers,
        numActiveChannels: info.num_active_channels,
        numPendingChannels: info.num_pending_channels,
        blockHeight: info.blockheight,
        network: info.network,
      }
    } catch (error) {
      logger.error("failed to get node info", { error })
      throw new Error(`Failed to get node info: ${String(error)}`)
    }
  }

  /**
   * Open a Lightning channel with a peer.
   *
   * @param peerPubkey - Public key of the peer
   * @param capacitySats - Channel capacity in satoshis
   * @returns Channel ID
   */
  async openChannel(
    peerPubkey: string,
    capacitySats: bigint,
  ): Promise<string> {
    try {
      logger.info("opening Lightning channel", { peerPubkey, capacitySats })

      // CLN fundchannel command
      const result = await this.client.fundchannel({
        id: peerPubkey,
        amount: capacitySats.toString(),
      })

      const channelId = result.txid

      logger.info("channel opened", { channelId, peerPubkey })

      return channelId
    } catch (error) {
      logger.error("failed to open channel", { error, peerPubkey })
      throw new Error(`Failed to open channel: ${String(error)}`)
    }
  }

  /**
   * Close a Lightning channel.
   *
   * @param channelId - Channel ID or short channel ID
   * @param force - Whether to force-close the channel
   */
  async closeChannel(channelId: string, force = false): Promise<void> {
    try {
      logger.info("closing Lightning channel", { channelId, force })

      // Force close (unilateral) or cooperative close
      await this.client.close(
        force
          ? {
              id: channelId,
              unilateraltimeout: 86_400, // 24 hours
            }
          : {
              id: channelId,
            },
      )

      logger.info("channel closed", { channelId })
    } catch (error) {
      logger.error("failed to close channel", { error, channelId })
      throw new Error(`Failed to close channel: ${String(error)}`)
    }
  }

  /**
   * Send a Lightning payment via invoice.
   *
   * @param bolt11 - BOLT11 payment request
   * @returns Payment result with preimage
   */
  async sendPayment(bolt11: string): Promise<LightningPaymentResult> {
    try {
      logger.info("sending Lightning payment", { bolt11: bolt11.slice(0, 20) + "..." })

      const result = await this.client.pay({
        bolt11,
      })

      const paymentPreimage = result.payment_preimage
      const paymentHash = result.payment_hash
      const amountSent = BigInt(result.amount_sent_msat) / 1000n
      const feePaid = BigInt(result.amount_sent_msat) - BigInt(result.amount_msat)

      logger.info("payment sent successfully", { paymentHash })

      return {
        paymentPreimage,
        paymentHash,
        amountSent,
        feePaid: feePaid / 1000n,
      }
    } catch (error) {
      logger.error("failed to send payment", { error })
      throw new Error(`Failed to send payment: ${String(error)}`)
    }
  }

  /**
   * Create a Lightning invoice.
   *
   * @param amountSats - Amount in satoshis
   * @param label - Unique label for the invoice
   * @param description - Invoice description
   * @param expirySeconds - Invoice expiry time in seconds (default: 3600)
   * @returns Invoice details
   */
  async createInvoice(
    amountSats: bigint,
    label: string,
    description: string,
    expirySeconds = 3600,
  ): Promise<LightningInvoice> {
    try {
      logger.info("creating Lightning invoice", { amountSats, label })

      // CLN expects amount in millisatoshis
      const amountMsat = amountSats * 1000n

      const result = await this.client.invoice({
        amount_msat: amountMsat.toString(),
        label,
        description,
        expiry: expirySeconds,
      })

      const bolt11 = result.bolt11
      const paymentHash = result.payment_hash
      const paymentSecret = result.payment_secret
      const expiresAt = result.expires_at

      logger.info("invoice created", { paymentHash, label })

      return {
        bolt11,
        paymentHash,
        paymentSecret,
        expiresAt,
      }
    } catch (error) {
      logger.error("failed to create invoice", { error })
      throw new Error(`Failed to create invoice: ${String(error)}`)
    }
  }

  /**
   * List all channels.
   *
   * @returns Array of channel information
   */
  async listChannels(): Promise<LightningChannel[]> {
    try {
      const result = await this.client.listfunds()

      const channels: LightningChannel[] = []

      for (const channel of result.channels) {
        channels.push({
          channelId: channel.funding_txid,
          shortChannelId: channel.short_channel_id,
          peerPubkey: channel.peer_id,
          capacity: BigInt(channel.amount_msat) / 1000n,
          localBalance: BigInt(channel.our_amount_msat) / 1000n,
          remoteBalance: BigInt(channel.amount_msat) / 1000n - BigInt(channel.our_amount_msat) / 1000n,
          state: this.mapChannelState(channel.state),
        })
      }

      return channels
    } catch (error) {
      logger.error("failed to list channels", { error })
      throw new Error(`Failed to list channels: ${String(error)}`)
    }
  }

  /**
   * Get balance across all channels.
   *
   * @returns Total balance in satoshis
   */
  async getBalance(): Promise<bigint> {
    try {
      const channels = await this.listChannels()

      let totalBalance = 0n

      for (const channel of channels) {
        if (channel.state === "active") {
          totalBalance += channel.localBalance
        }
      }

      return totalBalance
    } catch (error) {
      logger.error("failed to get balance", { error })
      throw new Error(`Failed to get balance: ${String(error)}`)
    }
  }

  /**
   * Connect to a peer (required before opening channel).
   *
   * @param peerPubkey - Public key of the peer
   * @param host - Host address (e.g., "127.0.0.1:9735")
   */
  async connectPeer(peerPubkey: string, host: string): Promise<void> {
    try {
      logger.info("connecting to peer", { peerPubkey, host })

      await this.client.connect({
        id: `${peerPubkey}@${host}`,
      })

      logger.info("connected to peer", { peerPubkey })
    } catch (error) {
      // Ignore "already connected" errors
      if (String(error).includes("already connected")) {
        logger.debug?.("peer already connected", { peerPubkey })
        return
      }

      logger.error("failed to connect to peer", { error, peerPubkey })
      throw new Error(`Failed to connect to peer: ${String(error)}`)
    }
  }

  /**
   * Map CLN channel state to our simplified state.
   */
  private mapChannelState(clnState: string): "pending" | "active" | "closing" | "closed" {
    switch (clnState.toUpperCase()) {
      case "CHANNELD_NORMAL": {
        return "active"
      }
      case "OPENINGD":
      case "CHANNELD_AWAITING_LOCKIN": {
        return "pending"
      }
      case "CLOSINGD_SIGEXCHANGE":
      case "CLOSINGD_COMPLETE":
      case "AWAITING_UNILATERAL": {
        return "closing"
      }
      case "FUNDING_SPEND_SEEN":
      case "ONCHAIN": {
        return "closed"
      }
      default: {
        logger.warn("unknown channel state", { clnState })
        return "pending"
      }
    }
  }
}

/**
 * Create a Lightning client for the given network.
 */
export async function createLightningClient(
  options: CreateLightningClientOptions,
): Promise<ClnClient> {
  const client = new ClnClient(options)

  // Verify connectivity by getting node info
  try {
    const info = await client.getInfo()
    logger.info("CLN client connected successfully", {
      nodeId: info.id,
      network: info.network,
      blockHeight: info.blockHeight,
    })
  } catch (error) {
    logger.error("failed to connect to CLN node", { error })
    throw new Error(
      `Failed to connect to CLN node: ${String(error)}. Ensure CLN is running and the socket path is correct.`,
    )
  }

  return client
}
