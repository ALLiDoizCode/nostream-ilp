import type { Hex } from "viem"
import { settlementCronos as logger } from "../../../../logger/instances"
import type { CronosRpcClient } from "../client"
import type { CronosSettlementConfig } from "../config"
import type { CronosChannelState } from "../types/peer-state"

export interface OpenChannelParams {
  recipient: Hex
  amount: bigint
  duration: number // seconds
}

export interface OpenChannelResult {
  channelId: Hex
  txHash: Hex
  expiration: number
}

export interface CloseChannelParams {
  channelId: Hex
  claimAmount: bigint
  nonce: number
  signature: Hex
}

export interface CloseChannelResult {
  txHash: Hex
  settled: boolean
}

/**
 * Open a new payment channel on Cronos with ERC-20 AKT tokens.
 *
 * @param client - Cronos RPC client
 * @param config - Configuration
 * @param params - Channel parameters
 * @returns Channel ID and transaction hash
 */
export async function openChannel(
  client: CronosRpcClient,
  config: CronosSettlementConfig,
  params: OpenChannelParams,
): Promise<OpenChannelResult> {
  logger.info("opening payment channel", {
    recipient: params.recipient,
    amount: params.amount.toString(),
    duration: params.duration,
  })

  // Calculate expiration timestamp
  const expiration = Math.floor(Date.now() / 1000) + params.duration

  try {
    // CRITICAL: ERC-20 requires approval before opening channel
    // Step 1: Check and ensure sufficient allowance
    await client.ensureAllowance(params.amount)

    // Step 2: Call contract's openChannel function (NO value parameter for ERC-20)
    const hash = await client.channelContract.write.openChannel(
      [params.recipient, params.amount, BigInt(expiration)],
      {
        gas: BigInt(config.gasLimit),
      },
    )

    logger.info("channel opening transaction sent", { txHash: hash })

    // Wait for transaction confirmation (2-6 blocks on Cronos testnet)
    const receipt = await client.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    })

    // Extract channelId from ChannelOpened event logs
    const channelOpenedEvent = receipt.logs.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (log: any) =>
        log.address.toLowerCase() === config.contractAddress.toLowerCase(),
    )

    if (!channelOpenedEvent || !channelOpenedEvent.topics[1]) {
      throw new Error("ChannelOpened event not found in transaction receipt")
    }

    const channelId = channelOpenedEvent.topics[1] as Hex

    logger.info("channel opened successfully", {
      channelId,
      txHash: hash,
      expiration,
    })

    return {
      channelId,
      txHash: hash,
      expiration,
    }
  } catch (error) {
    logger.error("failed to open channel", { error })
    throw error
  }
}

/**
 * Close a payment channel on Cronos with the final claim.
 *
 * @param client - Cronos RPC client
 * @param config - Configuration
 * @param params - Close parameters (final claim)
 * @returns Transaction hash
 */
export async function closeChannel(
  client: CronosRpcClient,
  config: CronosSettlementConfig,
  params: CloseChannelParams,
): Promise<CloseChannelResult> {
  logger.info("closing payment channel", {
    channelId: params.channelId,
    claimAmount: params.claimAmount.toString(),
    nonce: params.nonce,
  })

  try {
    // Call contract's closeChannel function (same as Base - signature verification is identical)
    const hash = await client.channelContract.write.closeChannel(
      [
        params.channelId,
        params.claimAmount,
        BigInt(params.nonce),
        params.signature,
      ],
      {
        gas: BigInt(config.gasLimit),
      },
    )

    logger.info("channel closing transaction sent", { txHash: hash })

    // Wait for confirmation
    const receipt = await client.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    })

    // Verify ChannelClosed event was emitted
    const channelClosedEvent = receipt.logs.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (log: any) =>
        log.address.toLowerCase() === config.contractAddress.toLowerCase(),
    )

    if (!channelClosedEvent) {
      logger.warn("ChannelClosed event not found in receipt")
    }

    logger.info("channel closed successfully", {
      txHash: hash,
      claimAmount: params.claimAmount.toString(),
    })

    return {
      txHash: hash,
      settled: true,
    }
  } catch (error) {
    logger.error("failed to close channel", { error })
    throw error
  }
}

/**
 * Get channel state from the on-chain contract.
 *
 * @param client - Cronos RPC client
 * @param channelId - Channel ID
 * @returns Channel state
 */
export async function getChannelFromContract(
  client: CronosRpcClient,
  channelId: Hex,
): Promise<CronosChannelState> {
  logger.info("fetching channel state from contract", { channelId })

  try {
    const channel = await client.channelContract.read.getChannel([channelId])

    return {
      channelId,
      sender: channel[0] as string,
      recipient: channel[1] as string,
      balance: channel[2] as bigint,
      highestNonce: Number(channel[3]),
      highestClaimAmount: 0n, // Not stored on-chain
      expiration: Number(channel[4]),
      isClosed: channel[5] as boolean,
      lastClaimTime: Date.now(),
      totalClaims: 0,
      createdAt: Date.now(),
    }
  } catch (error) {
    logger.error("failed to fetch channel state", { error, channelId })
    throw error
  }
}

/**
 * Check if a channel should be settled based on strategy.
 * CRITICAL: AKT uses 6 decimals, so threshold amounts are smaller than ETH (18 decimals).
 *
 * @param channel - Channel state
 * @param config - Configuration
 * @returns True if channel should be settled
 */
export function shouldSettleChannel(
  channel: CronosChannelState,
  config: CronosSettlementConfig,
): boolean {
  const now = Math.floor(Date.now() / 1000)

  return (
    // 1. Threshold reached (e.g., 100 AKT = 100_000_000 with 6 decimals)
    channel.highestClaimAmount >= config.settlementThreshold ||
    // 2. Time-based settlement
    now - Math.floor(channel.lastClaimTime / 1000) >=
      config.settlementInterval ||
    // 3. Near expiration (24 hours remaining)
    channel.expiration - now < 86400 ||
    // 4. High claim count (batching efficiency)
    channel.totalClaims >= 100
  )
}
