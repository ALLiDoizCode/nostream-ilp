import { bufferToUint8Array } from "@dassie/lib-type-utils"
import type { Reactor } from "@dassie/lib-reactive"

import type { LedgerId } from "../../../../accounting/constants/ledgers"
import type { NodeId } from "../../../../peer-protocol/types/node-id"
import { settlementLightning as logger } from "../../../../logger/instances"
import type {
  SettlementSchemeActorMethods,
  SettlementSchemeHostMethods,
} from "../../../types/settlement-scheme-module"
import type { ClnClient } from "../client"
import type { LightningPeerState } from "../types/peer-state"

interface CreateSettlementEngineParameters {
  client: ClnClient
  host: SettlementSchemeHostMethods
  ledgerId: LedgerId
}

interface PeeringInfoData {
  nodePubkey: string
}

interface PeeringRequestData {
  nodePubkey: string
  channelCapacity: bigint
}

interface SettlementMessage {
  type: "invoice_request" | "invoice" | "payment_preimage"
  invoiceBolt11?: string
  preimage?: string
  amount?: bigint
}

export const CreateLightningSettlementEngine = (_reactor: Reactor) => {
  // const nodeIdSignal = reactor.use(NodeIdSignal) // Reserved for future use

  return async function createLightningSettlementEngine({
    client,
    host,
    ledgerId,
  }: CreateSettlementEngineParameters): Promise<
    SettlementSchemeActorMethods<LightningPeerState>
  > {
    // Get our Lightning node info
    const nodeInfo = await client.getInfo()
    const ourNodePubkey = nodeInfo.id

    logger.info("Lightning settlement engine initialized", {
      nodePubkey: ourNodePubkey,
      network: nodeInfo.network,
    })

    // Track pending settlements
    const pendingSettlements = new Map<string, {
      peerId: NodeId
      amount: bigint
      invoice?: string
    }>()

    /**
     * Generate peering info to share with peers.
     * Returns our Lightning node public key.
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- Synchronous data transformation
    const getPeeringInfo = async () => {
      const data: PeeringInfoData = {
        nodePubkey: ourNodePubkey,
      }

      return {
        data: bufferToUint8Array(
          Buffer.from(JSON.stringify(data), "utf8"),
        ),
      }
    }

    /**
     * Create a peering request to initiate channel opening.
     */
    const createPeeringRequest = async ({
      peerId,
      peeringInfo,
    }: {
      peerId: NodeId
      peeringInfo: Uint8Array
    }) => { // eslint-disable-line @typescript-eslint/require-await -- Returns pre-computed data
      const peerInfoData = JSON.parse(
        Buffer.from(peeringInfo).toString("utf8"),
      ) as PeeringInfoData

      logger.info("creating Lightning peering request", {
        peerId,
        peerPubkey: peerInfoData.nodePubkey,
      })

      // Default channel capacity: 1M sats (0.01 BTC)
      const DEFAULT_CHANNEL_CAPACITY = 1_000_000n

      const requestData: PeeringRequestData = {
        nodePubkey: ourNodePubkey,
        channelCapacity: DEFAULT_CHANNEL_CAPACITY,
      }

      return {
        data: bufferToUint8Array(
          Buffer.from(JSON.stringify(requestData), "utf8"),
        ),
      }
    }

    /**
     * Accept an incoming peering request and open a channel.
     */
    const acceptPeeringRequest = async ({
      peerId,
      data,
    }: {
      peerId: NodeId
      data: Uint8Array
    }) => {
      const requestData = JSON.parse(
        Buffer.from(data).toString("utf8"),
      ) as PeeringRequestData

      const peerPubkey = requestData.nodePubkey
      const capacity = requestData.channelCapacity

      logger.info("accepting Lightning peering request", {
        peerId,
        peerPubkey,
        capacity,
      })

      try {
        // Connect to peer (assuming they're reachable at default port)
        // In production, peer address should be in peering request
        // For now, skip connection as we can't infer address from pubkey
        logger.warn("peer connection skipped - address not in peering request", {
          peerPubkey,
        })

        // Open channel
        const channelId = await client.openChannel(peerPubkey, capacity)

        const peerState: LightningPeerState = {
          channelId,
          peerPubkey,
          capacity,
          localBalance: capacity, // We funded the channel, so we have full balance initially
          remoteBalance: 0n,
          status: "pending",
        }

        logger.info("Lightning channel opened", {
          peerId,
          channelId,
          capacity,
        })

        const responseData = {
          channelId,
          accepted: true,
        }

        return {
          peeringResponseData: bufferToUint8Array(
            Buffer.from(JSON.stringify(responseData), "utf8"),
          ),
          peerState,
        }
      } catch (error) {
        logger.error("failed to accept peering request", {
          error,
          peerId,
          peerPubkey,
        })
        return false
      }
    }

    /**
     * Finalize peering after peer accepts our request.
     */
    const finalizePeeringRequest = async ({
      peerId,
      peeringInfo: _peeringInfo,
      data,
    }: {
      peerId: NodeId
      peeringInfo: Uint8Array
      data: Uint8Array
    }) => {
      const responseData = JSON.parse(
        Buffer.from(data).toString("utf8"),
      ) as { channelId: string; accepted: boolean }

      if (!responseData.accepted) {
        throw new Error("Peer rejected peering request")
      }

      logger.info("peering request accepted by peer", {
        peerId,
        channelId: responseData.channelId,
      })

      // We don't know the exact state since peer opened the channel
      // In practice, we'd query our Lightning node for channel details
      const channels = await client.listChannels()
      const channel = channels.find((c) => c.channelId === responseData.channelId)

      if (!channel) {
        throw new Error(`Channel ${responseData.channelId} not found in our node`)
      }

      const peerState: LightningPeerState = {
        channelId: channel.channelId,
        shortChannelId: channel.shortChannelId ?? undefined,
        peerPubkey: channel.peerPubkey,
        capacity: channel.capacity,
        localBalance: channel.localBalance,
        remoteBalance: channel.remoteBalance,
        status: channel.state,
      }

      return { peerState }
    }

    /**
     * Prepare a settlement (outgoing payment to peer).
     * Generate an invoice request that peer will fulfill.
     */
    const prepareSettlement = async ({
      amount,
      peerId,
      peerState,
    }: {
      amount: bigint
      peerId: NodeId
      peerState: LightningPeerState
    }) => { // eslint-disable-line @typescript-eslint/require-await -- Generates settlement instruction synchronously
      logger.info("preparing Lightning settlement", {
        amount,
        peerId,
        channelId: peerState.channelId,
      })

      const settlementId = `settlement-${peerId}-${Date.now()}`

      // Convert internal units to satoshis (divide by 10 to go from scale 9 to scale 8)
      const amountSats = amount / 10n

      if (amountSats < 1n) {
        throw new Error("Settlement amount too small (minimum 1 sat)")
      }

      // Request invoice from peer
      const message: SettlementMessage = {
        type: "invoice_request",
        amount: amountSats,
      }

      pendingSettlements.set(settlementId, {
        peerId,
        amount: amountSats,
      })

      return {
        message: bufferToUint8Array(
          Buffer.from(JSON.stringify(message), "utf8"),
        ),
        settlementId,
        execute: async () => {
          logger.info("executing Lightning settlement", { settlementId })

          // Wait for invoice from peer (via handleMessage)
          // Poll for invoice with timeout
          const maxWaitMs = 30_000 // 30 seconds
          const startTime = Date.now()

          while (Date.now() - startTime < maxWaitMs) {
            const pending = pendingSettlements.get(settlementId)
            if (pending?.invoice) {
              // Pay the invoice
              try {
                const result = await client.sendPayment(pending.invoice)

                logger.info("Lightning payment sent", {
                  settlementId,
                  paymentHash: result.paymentHash,
                  amountSent: result.amountSent,
                })

                // Send preimage to peer as proof
                const proofMessage: SettlementMessage = {
                  type: "payment_preimage",
                  preimage: result.paymentPreimage,
                }

                await host.sendMessage({
                  peerId,
                  message: bufferToUint8Array(
                    Buffer.from(JSON.stringify(proofMessage), "utf8"),
                  ),
                })

                // Finalize settlement
                host.finalizeOutgoingSettlement({ settlementId })

                pendingSettlements.delete(settlementId)

                // Update peer state with new balances
                const channels = await client.listChannels()
                const updatedChannel = channels.find(
                  (c) => c.channelId === peerState.channelId,
                )

                if (updatedChannel) {
                  return {
                    peerState: {
                      ...peerState,
                      localBalance: updatedChannel.localBalance,
                      remoteBalance: updatedChannel.remoteBalance,
                    },
                  }
                }

                return {}
              } catch (error) {
                logger.error("Lightning payment failed", {
                  error,
                  settlementId,
                })
                host.cancelOutgoingSettlement({ settlementId })
                pendingSettlements.delete(settlementId)
                throw error
              }
            }

            // Wait a bit before checking again
            await new Promise((resolve) => {
              setTimeout(resolve, 100)
            })
          }

          // Timeout waiting for invoice
          logger.error("timeout waiting for invoice", { settlementId })
          host.cancelOutgoingSettlement({ settlementId })
          pendingSettlements.delete(settlementId)
          throw new Error("Timeout waiting for invoice from peer")
        },
      }
    }

    /**
     * Handle incoming settlement (peer paying us).
     * This is called when we receive proof of payment.
     */
    const handleSettlement = async ({
      amount,
      peerId,
      settlementSchemeData,
      peerState: _peerState,
    }: {
      amount: bigint
      peerId: NodeId
      settlementSchemeData: Uint8Array
      peerState: LightningPeerState
    }) => { // eslint-disable-line @typescript-eslint/require-await -- Processes settlement synchronously
      const message = JSON.parse(
        Buffer.from(settlementSchemeData).toString("utf8"),
      ) as SettlementMessage

      logger.info("handling Lightning settlement", {
        amount,
        peerId,
        messageType: message.type,
      })

      // Verify we received payment by checking preimage
      if (message.type === "payment_preimage" && message.preimage) {
        // In production, verify the preimage matches the invoice we sent
        // For now, trust the peer and report the incoming settlement

        const amountInternal = amount * 10n // Convert sats to internal units

        host.reportIncomingSettlement({
          ledgerId,
          peerId,
          amount: amountInternal,
        })

        logger.info("incoming settlement confirmed", {
          peerId,
          amount: amountInternal,
        })
      }
    }

    /**
     * Handle messages from peer (invoice exchange, etc.).
     */
    const handleMessage = async ({
      peerId,
      message: messageData,
    }: {
      peerId: NodeId
      message: Uint8Array
    }) => {
      const message = JSON.parse(
        Buffer.from(messageData).toString("utf8"),
      ) as SettlementMessage

      logger.debug?.("received Lightning message", {
        peerId,
        messageType: message.type,
      })

      if (message.type === "invoice_request" && message.amount) {
        // Peer is requesting an invoice from us
        const amountSats = message.amount
        const label = `settlement-${peerId}-${Date.now()}`
        const description = `ILP settlement from ${peerId}`

        try {
          const invoice = await client.createInvoice(
            amountSats,
            label,
            description,
          )

          // Send invoice to peer
          const invoiceMessage: SettlementMessage = {
            type: "invoice",
            invoiceBolt11: invoice.bolt11,
          }

          await host.sendMessage({
            peerId,
            message: bufferToUint8Array(
              Buffer.from(JSON.stringify(invoiceMessage), "utf8"),
            ),
          })

          logger.info("invoice sent to peer", {
            peerId,
            paymentHash: invoice.paymentHash,
            amount: amountSats,
          })
        } catch (error) {
          logger.error("failed to create invoice", { error, peerId })
        }
      } else if (message.type === "invoice" && message.invoiceBolt11) {
        // Peer sent us an invoice to pay
        // Store it in pending settlements
        for (const [settlementId, pending] of pendingSettlements.entries()) {
          if (pending.peerId === peerId && !pending.invoice) {
            pending.invoice = message.invoiceBolt11
            logger.info("received invoice for settlement", {
              settlementId,
              peerId,
            })
            break
          }
        }
      }
    }

    /**
     * Handle deposits (on-chain funds added to Lightning node).
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- Logs deposit synchronously
    const handleDeposit = async ({ amount }: { amount: bigint }) => {
      logger.info("Lightning deposit received", { amount })
      host.reportDeposit({ ledgerId, amount })
    }

    /**
     * Get total balance across all channels.
     */
    const getBalance = () => {
      // Note: This is synchronous but client.getBalance() is async
      // In practice, we should track balance reactively
      // For now, return 0 and rely on async balance tracking
      logger.debug?.("getBalance called (stub - use async tracking)")
      return 0n
    }

    return {
      getPeeringInfo,
      createPeeringRequest,
      acceptPeeringRequest,
      finalizePeeringRequest,
      prepareSettlement,
      handleSettlement,
      handleMessage,
      handleDeposit,
      getBalance,
    }
  }
}
