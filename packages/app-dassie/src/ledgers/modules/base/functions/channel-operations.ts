import type { Hex } from "viem"
import { settlementBase as logger } from "../../../../logger/instances"
import type { BaseRpcClient } from "../client"
import type { BaseSettlementConfig } from "../config"
import type { BaseChannelState } from "../types/peer-state"

export interface OpenChannelParams {
  tokenAddress: Hex // address(0) for native ETH, ERC-20 address for tokens
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
 * Open a new payment channel on Base L2.
 *
 * @param client - Base RPC client
 * @param config - Configuration
 * @param params - Channel parameters
 * @returns Channel ID and transaction hash
 */
export async function openChannel(
  client: BaseRpcClient,
  config: BaseSettlementConfig,
  params: OpenChannelParams,
): Promise<OpenChannelResult> {
  logger.info("opening payment channel", {
    tokenAddress: params.tokenAddress,
    recipient: params.recipient,
    amount: params.amount.toString(),
    duration: params.duration,
  })

  // Calculate expiration timestamp
  const expiration = Math.floor(Date.now() / 1000) + params.duration

  // Determine if this is a native ETH channel or ERC-20 token channel
  const isNativeETH =
    params.tokenAddress === "0x0000000000000000000000000000000000000000"

  try {
    // Call contract's openChannel function with MultiToken factory signature
    const hash = await client.contract.write.openChannel(
      [params.tokenAddress, params.recipient, params.amount, BigInt(expiration)],
      {
        value: isNativeETH ? params.amount : 0n, // Only send ETH if native token
        gas: BigInt(config.gasLimit),
      },
    )

    logger.info("channel opening transaction sent", { txHash: hash })

    // Wait for transaction confirmation (1-2 blocks on Base Sepolia)
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
 * Close a payment channel on Base L2 with the final claim.
 *
 * @param client - Base RPC client
 * @param config - Configuration
 * @param params - Close parameters (final claim)
 * @returns Transaction hash
 */
export async function closeChannel(
  client: BaseRpcClient,
  config: BaseSettlementConfig,
  params: CloseChannelParams,
): Promise<CloseChannelResult> {
  logger.info("closing payment channel", {
    channelId: params.channelId,
    claimAmount: params.claimAmount.toString(),
    nonce: params.nonce,
  })

  try {
    // Call contract's closeChannel function
    const hash = await client.contract.write.closeChannel(
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
 * @param client - Base RPC client
 * @param channelId - Channel ID
 * @returns Channel state
 */
export async function getChannelFromContract(
  client: BaseRpcClient,
  channelId: Hex,
): Promise<BaseChannelState> {
  logger.info("fetching channel state from contract", { channelId })

  try {
    const channel = await client.contract.read.getChannel([channelId])

    return {
      channelId,
      sender: channel[0] as string,
      recipient: channel[1] as string,
      tokenAddress: channel[2] as string, // Multi-token support
      balance: channel[3] as bigint,
      highestNonce: Number(channel[4]),
      highestClaimAmount: 0n, // Not stored on-chain
      expiration: Number(channel[5]),
      isClosed: channel[6] as boolean,
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
 *
 * @param channel - Channel state
 * @param config - Configuration
 * @returns True if channel should be settled
 */
export function shouldSettleChannel(
  channel: BaseChannelState,
  config: BaseSettlementConfig,
): boolean {
  const now = Math.floor(Date.now() / 1000)

  return (
    // 1. Threshold reached
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
