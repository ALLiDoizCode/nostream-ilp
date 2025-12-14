import type { Client, Wallet } from "xrpl"

import { assert } from "@dassie/lib-logger"
import type { Reactor } from "@dassie/lib-reactive"
import { bufferToUint8Array, isFailure } from "@dassie/lib-type-utils"

import type { LedgerId } from "../../../../accounting/constants/ledgers"
import { NodeIdSignal } from "../../../../ilp-connector/computed/node-id"
import { settlementXrpl as logger } from "../../../../logger/instances"
import type {
  SettlementSchemeActorMethods,
  SettlementSchemeHostMethods,
} from "../../../types/settlement-scheme-module"
import { getXrplPaymentChannelConfig } from "../config"
import { XRP_VALUE_FACTOR } from "../constants/asset-scale"
import { XRP_SETTLEMENT_MEMO_TYPE } from "../constants/settlement-memo-type"
import { peeringInfoSchema } from "../oer-schemas/peering-info-data"
import { peeringRequestSchema } from "../oer-schemas/peering-request-data"
import { peeringResponseSchema } from "../oer-schemas/peering-response-data"
import { settlementProofSchema } from "../oer-schemas/settlement-proof"
import type { XrplPeerState } from "../types/peer-state"
import type {
  XrpPaymentClaim,
  XrplPaymentChannelState,
} from "../types/payment-channel-state"
import { createPaymentChannel } from "./create-payment-channel"
import { getAccountInfo } from "./get-account-info"
import { IsSettlement } from "./is-settlement"
import {
  PaymentChannelCache,
  queryPaymentChannel,
} from "./query-payment-channel"
import {
  isChannelExpired,
  settlePaymentChannel,
  shouldSettleChannel,
} from "./settlement-strategy"
import { verifyPaymentClaim } from "./verify-payment-channel"

interface CreateSettlementModuleParameters {
  client: Client
  wallet: Wallet
  host: SettlementSchemeHostMethods
  ledgerId: LedgerId
}

export const CreateSettlementEngine = (reactor: Reactor) => {
  const isSettlement = reactor.use(IsSettlement)
  const nodeIdSignal = reactor.use(NodeIdSignal)

  return async function createSettlementEngine({
    client,
    wallet,
    host,
    ledgerId,
  }: CreateSettlementModuleParameters) {
    await client.request({
      command: "subscribe",
      accounts: [wallet.address],
    })

    const ownAccountInfo = await getAccountInfo(client, wallet.address)

    let balance =
      ownAccountInfo ?
        BigInt(ownAccountInfo.result.account_data.Balance) * XRP_VALUE_FACTOR
      : 0n

    // Payment channel state and configuration
    const config = getXrplPaymentChannelConfig()
    const channelCache = new PaymentChannelCache()

    client.on("transaction", (transaction) => {
      if (transaction.meta?.AffectedNodes) {
        for (const node of transaction.meta.AffectedNodes) {
          // Did this transaction affect our balance?
          if (
            "ModifiedNode" in node &&
            node.ModifiedNode.LedgerEntryType === "AccountRoot" &&
            node.ModifiedNode.FinalFields?.["Account"] === wallet.address &&
            typeof node.ModifiedNode.FinalFields["Balance"] === "string" &&
            typeof node.ModifiedNode.PreviousFields?.["Balance"] === "string" &&
            node.ModifiedNode.FinalFields["Balance"] !==
              node.ModifiedNode.PreviousFields["Balance"]
          ) {
            const newBalance =
              BigInt(node.ModifiedNode.FinalFields["Balance"]) *
              XRP_VALUE_FACTOR
            const oldBalance =
              BigInt(node.ModifiedNode.PreviousFields["Balance"]) *
              XRP_VALUE_FACTOR

            balance = newBalance

            const isSettlementResult = isSettlement(transaction)

            if (newBalance > oldBalance) {
              // If a transaction increased our balance, it's either an incoming settlement or a deposit.
              if (
                isSettlementResult.isSettlement &&
                isSettlementResult.direction === "incoming"
              ) {
                // If it is tagged as a settlement, process it as such
                const amount = newBalance - oldBalance
                host.reportIncomingSettlement({
                  ledgerId,
                  peerId: isSettlementResult.peerId,
                  amount,
                })
              } else {
                // Otherwise it's a deposit.
                const amount = newBalance - oldBalance
                host.reportDeposit({ ledgerId, amount })
              }
            } else {
              // If a transaction decreased our balance, it's either an outgoing settlement or a withdrawal
              if (
                isSettlementResult.isSettlement &&
                isSettlementResult.direction === "outgoing"
              ) {
                assert(
                  logger,
                  !!transaction.transaction.hash,
                  "expected transaction hash to be present",
                )
                host.finalizeOutgoingSettlement({
                  settlementId: transaction.transaction.hash,
                })
              } else {
                const amount = oldBalance - newBalance
                host.reportWithdrawal({ ledgerId, amount })
              }
            }
          }
        }
      }
    })

    return {
      getPeeringInfo() {
        return {
          data: peeringInfoSchema.serializeOrThrow({
            address: wallet.address,
          }),
        }
      },
      createPeeringRequest: () => {
        return {
          data: peeringRequestSchema.serializeOrThrow({
            address: wallet.address,
          }),
        }
      },
      acceptPeeringRequest: async ({ peerId, data }) => {
        const parseResult = peeringRequestSchema.parse(data)

        if (isFailure(parseResult)) {
          logger.debug?.("failed to parse peering request data", {
            peer: peerId,
          })
          return false
        }

        const { address } = parseResult.value

        if (!(await getAccountInfo(client, address))) {
          logger.debug?.("peer account not found", {
            peer: peerId,
            address,
          })
          return false
        }

        return {
          peeringResponseData: peeringResponseSchema.serializeOrThrow(),
          peerState: {
            address,
          },
        }
      },
      finalizePeeringRequest: ({ peeringInfo }) => {
        // If we get here, we have successfully parsed these bytes before, so if parsing fails now, it's a bug, so we
        // just throw.
        const peeringInfoParseResult =
          peeringInfoSchema.parseOrThrow(peeringInfo)

        return {
          peerState: {
            address: peeringInfoParseResult.value.address,
          },
        }
      },
      prepareSettlement: async ({ peerId, amount, peerState }) => {
        logger.info("preparing settlement", { to: peerId, amount })

        const prepared = await client.autofill({
          TransactionType: "Payment" as const,
          Account: wallet.address,
          // Divide by 10^3 because the XRP Ledger uses 3 less decimal places than the internal representation.
          // We also round up to the nearest integer.
          Amount: String((amount + XRP_VALUE_FACTOR - 1n) / XRP_VALUE_FACTOR),
          Destination: peerState.address,
          Memos: [
            {
              Memo: {
                MemoType: XRP_SETTLEMENT_MEMO_TYPE,
                MemoData: Buffer.from(nodeIdSignal.read()).toString("hex"),
              },
            },
          ],
        })

        const signed = wallet.sign(prepared)

        const transactionHash = bufferToUint8Array(
          Buffer.from(signed.hash, "hex"),
        )

        return {
          message: settlementProofSchema.serializeOrThrow({
            transactionHash,
          }),
          settlementId: signed.hash,
          execute: async () => {
            logger.info("submitting settlement transaction", {
              to: peerId,
              amount,
              xrplAmount: prepared.Amount,
              hash: signed.hash,
            })
            const submitResult = await client.submitAndWait(signed.tx_blob)

            logger.info("settlement transaction processed, notifying peer", {
              to: peerId,
              amount,
              submitResult,
            })

            return {}
          },
        }
      },
      handleSettlement: ({ peerId, amount }) => {
        logger.info("received settlement claim", { from: peerId, amount })

        // Nothing to do here because we process settlements based on the on-ledger transaction.
      },
      handleMessage: () => {
        // no-op
      },
      handleDeposit: () => {
        throw new Error("not implemented")
      },
      getBalance: () => balance,

      // Payment Channel Methods (Extension beyond SettlementSchemeActorMethods)

      /**
       * Create a new payment channel
       */
      createPaymentChannel: async (parameters: {
        recipientAddress: string
        amountDrops: string
        settleDelay?: number
        expiration?: number
      }) => {
        const result = await createPaymentChannel({
          client,
          wallet,
          recipientAddress: parameters.recipientAddress,
          amountDrops: parameters.amountDrops,
          settleDelay: parameters.settleDelay ?? config.defaultSettleDelay,
          expiration: parameters.expiration,
        })

        // Cache the new channel
        channelCache.set(result.channelId, result.channelState)

        return result
      },

      /**
       * Verify a payment claim off-chain
       */
      verifyPaymentClaim: async (claim: XrpPaymentClaim) => {
        // Try to get channel state from cache
        let channelState = channelCache.get(claim.channelId)

        // If not cached, query from XRPL
        if (!channelState) {
          channelState = await queryPaymentChannel(
            client,
            wallet.address,
            claim.channelId,
          )

          if (!channelState) {
            return {
              valid: false,
              reason: "channel-not-found",
            }
          }

          // Cache the queried channel
          channelCache.set(claim.channelId, channelState)
        }

        // Verify the claim
        const result = verifyPaymentClaim(claim, channelState)

        // If valid, update cache with new state
        if (result.valid && result.updatedChannelState) {
          channelCache.set(claim.channelId, result.updatedChannelState)

          // Check if we should settle
          if (shouldSettleChannel(result.updatedChannelState, config)) {
            logger.info("settlement strategy triggered for channel", {
              channelId: claim.channelId,
            })

            // Note: Actual settlement would be triggered by background actor
            // This is just logging the trigger condition
          }
        }

        return result
      },

      /**
       * Settle a payment channel (submit PaymentChannelClaim transaction)
       */
      settlePaymentChannel: async (channelId: string) => {
        // Get channel state from cache or query
        let channelState = channelCache.get(channelId)

        if (!channelState) {
          channelState = await queryPaymentChannel(client, wallet.address, channelId)

          if (!channelState) {
            throw new Error(`Channel not found: ${channelId}`)
          }
        }

        // For settlement, we need the claim signature from the sender
        // In a real implementation, this would be retrieved from local storage
        // where we stored it during claim verification
        // For now, this method signature needs the signature to be passed
        throw new Error(
          "settlePaymentChannel requires claim signature - use settlePaymentChannelWithSignature",
        )
      },

      /**
       * Settle a payment channel with provided signature
       */
      settlePaymentChannelWithSignature: async (
        channelId: string,
        claimSignature: string,
      ) => {
        // Get channel state from cache or query
        let channelState = channelCache.get(channelId)

        if (!channelState) {
          channelState = await queryPaymentChannel(client, wallet.address, channelId)

          if (!channelState) {
            throw new Error(`Channel not found: ${channelId}`)
          }
        }

        const result = await settlePaymentChannel({
          client,
          wallet,
          channelState,
          claimSignature,
        })

        // Update cache
        channelCache.set(channelId, result.updatedChannelState)

        return result
      },

      /**
       * Get payment channel state (from cache or query XRPL)
       */
      getPaymentChannelState: async (channelId: string) => {
        // Try cache first
        let channelState = channelCache.get(channelId)

        if (!channelState) {
          // Query from XRPL
          channelState = await queryPaymentChannel(client, wallet.address, channelId)

          if (channelState) {
            channelCache.set(channelId, channelState)
          }
        }

        return channelState
      },

      /**
       * Check if a channel should be settled
       */
      shouldSettleChannel: (channelState: XrplPaymentChannelState) => {
        return shouldSettleChannel(channelState, config)
      },

      /**
       * Check if a channel has expired
       */
      isChannelExpired,
    } satisfies SettlementSchemeActorMethods<XrplPeerState> & {
      // Payment channel extensions
      createPaymentChannel: (parameters: {
        recipientAddress: string
        amountDrops: string
        settleDelay?: number
        expiration?: number
      }) => Promise<{
        channelId: string
        txHash: string
        ledgerIndex: number
        channelState: XrplPaymentChannelState
      }>
      verifyPaymentClaim: (claim: XrpPaymentClaim) => Promise<{
        valid: boolean
        reason?: string
        amountSats?: number
        updatedChannelState?: XrplPaymentChannelState
      }>
      settlePaymentChannel: (channelId: string) => Promise<never>
      settlePaymentChannelWithSignature: (
        channelId: string,
        claimSignature: string,
      ) => Promise<{
        txHash: string
        ledgerIndex: number
        amountClaimed: string
        updatedChannelState: XrplPaymentChannelState
      }>
      getPaymentChannelState: (
        channelId: string,
      ) => Promise<XrplPaymentChannelState | undefined>
      shouldSettleChannel: (channelState: XrplPaymentChannelState) => boolean
      isChannelExpired: (channelState: XrplPaymentChannelState) => boolean
    }
  }
}
