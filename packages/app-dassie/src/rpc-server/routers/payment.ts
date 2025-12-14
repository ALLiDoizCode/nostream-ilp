import { z } from "zod"

import { createRouter } from "@dassie/lib-rpc/server"

import { LedgerStore } from "../../accounting/stores/ledger"
import type { AccountPath } from "../../accounting/types/account-paths"
import { payment as logger } from "../../logger/instances"
import { MakePayment } from "../../open-payments/functions/make-payment"
import { resolvePaymentPointer } from "../../utils/resolve-payment-pointer"
import { getChannelState } from "../functions/get-channel-state"
import { updateChannelNonce } from "../functions/update-channel-nonce"
import { verifyPaymentSignature } from "../functions/verify-payment-signature"
import { protectedRoute } from "../route-types/protected"

const MAX_NONCE_JUMP = 1000n

export const paymentRouter = createRouter({
  resolvePaymentPointer: protectedRoute
    .input(
      z.object({
        paymentPointer: z.string(),
      }),
    )
    .query(async ({ input: { paymentPointer } }) => {
      return resolvePaymentPointer(paymentPointer)
    }),
  createPayment: protectedRoute
    .input(
      z.object({
        paymentId: z.string(),
        paymentPointer: z.string(),
        amount: z.string(),
      }),
    )
    .mutation(
      async ({
        input: { paymentId, paymentPointer, amount },
        context: { sig },
      }) => {
        // TODO: Validate paymentId length
        // TODO: Verify paymentId is unique
        logger.debug?.("creating payment", { paymentPointer, amount })

        const makePayment = sig.reactor.use(MakePayment)
        await makePayment({
          id: paymentId,
          destination: paymentPointer,
          amount: BigInt(amount),
        })
      },
    ),
  verifyPaymentClaim: protectedRoute
    .input(
      z.object({
        channelId: z.string(),
        amountSats: z.number(),
        nonce: z.number(),
        signature: z.string(),
        currency: z.enum(["BTC", "BASE", "AKT", "XRP"]),
      }),
    )
    .mutation(({ input, context: { sig } }) => {
      const { channelId, amountSats, nonce, signature, currency } = input

      logger.debug?.("verifying payment claim", {
        channelId,
        amountSats,
        nonce,
        currency,
      })

      // Step 1: Look up channel state
      const channel = getChannelState(sig.reactor, channelId)

      if (!channel) {
        return {
          valid: false,
          reason: "channel-not-found" as const,
        }
      }

      // Step 2: Check if channel is expired
      const now = Date.now()
      if (channel.status === "expired" || BigInt(now) > channel.expiration) {
        return {
          valid: false,
          reason: "channel-expired" as const,
        }
      }

      // Step 3: Validate amount
      if (amountSats <= 0) {
        return {
          valid: false,
          reason: "invalid-amount" as const,
        }
      }

      if (BigInt(amountSats) > channel.capacitySats) {
        return {
          valid: false,
          reason: "insufficient-balance" as const,
        }
      }

      // Step 4: Validate nonce
      const nonceBigInt = BigInt(nonce)

      if (nonceBigInt <= channel.highestNonce) {
        return {
          valid: false,
          reason: "invalid-nonce" as const,
        }
      }

      if (nonceBigInt > channel.highestNonce + MAX_NONCE_JUMP) {
        return {
          valid: false,
          reason: "nonce-too-high" as const,
        }
      }

      // Step 5: Verify signature
      const signatureValid = verifyPaymentSignature(
        currency,
        channelId,
        amountSats,
        nonce,
        signature,
        channel.senderPubkey,
      )

      if (!signatureValid) {
        return {
          valid: false,
          reason: "invalid-signature" as const,
        }
      }

      // Step 6: Update ledger
      try {
        const ledger = sig.reactor.use(LedgerStore)

        // Update the channel's highest nonce
        updateChannelNonce(sig.reactor, channelId, nonceBigInt)

        // Record revenue in the ledger
        const channelAccountPath =
          `${currency.toLowerCase()}:assets/settlement/${channelId}` as AccountPath
        const revenueAccountPath =
          `${currency.toLowerCase()}:revenue/relay-fees` as AccountPath

        // Create accounts if they don't exist
        if (!ledger.getAccount(channelAccountPath)) {
          ledger.createAccount(channelAccountPath)
        }

        if (!ledger.getAccount(revenueAccountPath)) {
          ledger.createAccount(revenueAccountPath)
        }

        // Create transfer to record the payment
        const transfer = ledger.createTransfer({
          debitAccountPath: channelAccountPath,
          creditAccountPath: revenueAccountPath,
          amount: BigInt(amountSats),
          pending: false,
        })

        if ("state" in transfer && transfer.state === "posted") {
          logger.info("payment claim verified and recorded", {
            channelId,
            amountSats,
            nonce,
          })

          return {
            valid: true,
            amountSats,
          }
        } else {
          logger.error("ledger transfer failed", { transfer })
          return {
            valid: false,
            reason: "ledger-error" as const,
          }
        }
      } catch (error) {
        logger.error("error updating ledger", { error })
        return {
          valid: false,
          reason: "ledger-error" as const,
        }
      }
    }),
})
