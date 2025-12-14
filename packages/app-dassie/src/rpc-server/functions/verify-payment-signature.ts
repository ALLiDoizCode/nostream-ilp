import { secp256k1 } from "@noble/curves/secp256k1"
import { verify as ed25519Verify } from "@noble/ed25519"
import { createHash } from "node:crypto"

export type Currency = "BTC" | "BASE" | "AKT" | "XRP"

/**
 * Creates the message to be signed for payment claim verification.
 * The message format is: channelId + amountSats + nonce
 */
export function createPaymentClaimMessage(
  channelId: string,
  amountSats: number,
  nonce: number,
): Uint8Array {
  const message = `${channelId}${amountSats}${nonce}`
  return createHash("sha256").update(message).digest()
}

/**
 * Verifies a payment claim signature for Bitcoin or BASE (secp256k1)
 */
export function verifySecp256k1Signature(
  message: Uint8Array,
  signature: string,
  publicKey: string,
): boolean {
  try {
    const signatureBytes = Buffer.from(signature, "hex")
    const publicKeyBytes = Buffer.from(publicKey, "hex")

    return secp256k1.verify(signatureBytes, message, publicKeyBytes)
  } catch {
    return false
  }
}

/**
 * Verifies a payment claim signature for XRP (Ed25519)
 */
export function verifyEd25519Signature(
  message: Uint8Array,
  signature: string,
  publicKey: string,
): boolean {
  try {
    const signatureBytes = Buffer.from(signature, "hex")
    const publicKeyBytes = Buffer.from(publicKey, "hex")

    return ed25519Verify(signatureBytes, message, publicKeyBytes)
  } catch {
    return false
  }
}

/**
 * Verifies a payment claim signature based on the currency type
 */
export function verifyPaymentSignature(
  currency: Currency,
  channelId: string,
  amountSats: number,
  nonce: number,
  signature: string,
  publicKey: string,
): boolean {
  const message = createPaymentClaimMessage(channelId, amountSats, nonce)

  switch (currency) {
    case "BTC":
    case "BASE":
    case "AKT": {
      // All use secp256k1
      return verifySecp256k1Signature(message, signature, publicKey)
    }
    case "XRP": {
      return verifyEd25519Signature(message, signature, publicKey)
    }
    default: {
      return false
    }
  }
}
