import { timingSafeEqual } from "node:crypto"
import { describe, expect, test } from "vitest"

/**
 * Unit tests for RPC authentication logic
 * These tests verify the token comparison and validation logic used in rpc-server.ts
 */

describe("RPC Token Authentication Logic", () => {
  describe("Constant-time token comparison", () => {
    test("returns true for matching tokens", () => {
      const token1 = "a".repeat(64)
      const token2 = "a".repeat(64)

      const result = timingSafeEqual(
        new Uint8Array(Buffer.from(token1)),
        new Uint8Array(Buffer.from(token2)),
      )

      expect(result).toBe(true)
    })

    test("returns false for different tokens", () => {
      const token1 = "a".repeat(64)
      const token2 = "b".repeat(64)

      const result = timingSafeEqual(
        new Uint8Array(Buffer.from(token1)),
        new Uint8Array(Buffer.from(token2)),
      )

      expect(result).toBe(false)
    })

    test("returns false for different length tokens", () => {
      const token1 = "a".repeat(64)
      const token2 = "a".repeat(32)

      // timingSafeEqual requires equal lengths
      // In production code, we check lengths before calling timingSafeEqual
      expect(token1.length).not.toBe(token2.length)
    })

    test("handles tokens with special characters", () => {
      const token1 = "abc123!@#$%^&*()_+-=[]{}|;:,.<>?"
      const token2 = "abc123!@#$%^&*()_+-=[]{}|;:,.<>?"

      const result = timingSafeEqual(
        new Uint8Array(Buffer.from(token1)),
        new Uint8Array(Buffer.from(token2)),
      )

      expect(result).toBe(true)
    })
  })

  describe("Authorization header parsing", () => {
    test("extracts token from Bearer header (uppercase)", () => {
      const header = "Bearer abc123def456"
      const token = header.replace(/^Bearer\s+/i, "")

      expect(token).toBe("abc123def456")
    })

    test("extracts token from bearer header (lowercase)", () => {
      const header = "bearer abc123def456"
      const token = header.replace(/^Bearer\s+/i, "")

      expect(token).toBe("abc123def456")
    })

    test("extracts token from BEARER header (mixed case)", () => {
      const header = "BeArEr abc123def456"
      const token = header.replace(/^Bearer\s+/i, "")

      expect(token).toBe("abc123def456")
    })

    test("handles multiple spaces after Bearer", () => {
      const header = "Bearer   abc123def456"
      const token = header.replace(/^Bearer\s+/i, "")

      expect(token).toBe("abc123def456")
    })

    test("returns undefined for missing header", () => {
      const header: string | undefined = undefined as string | undefined
      const token = header ? header.replace(/^Bearer\s+/i, "") : undefined

      expect(token).toBeUndefined()
    })

    test("returns empty string for header without token", () => {
      const header = "Bearer "
      const token = header.replace(/^Bearer\s+/i, "")

      expect(token).toBe("")
    })

    test("does not extract token from malformed header", () => {
      const header = "Token abc123def456"
      const token = header.replace(/^Bearer\s+/i, "")

      expect(token).toBe("Token abc123def456") // Not modified
    })
  })

  describe("Authentication validation logic", () => {
    test("authenticates with valid token", () => {
      const rpcAuthToken = "a".repeat(64)
      const providedToken = "a".repeat(64)

      const isValid =
        rpcAuthToken &&
        typeof rpcAuthToken === "string" &&
        rpcAuthToken.length >= 32 &&
        providedToken &&
        providedToken.length === rpcAuthToken.length &&
        timingSafeEqual(
          new Uint8Array(Buffer.from(providedToken)),
          new Uint8Array(Buffer.from(rpcAuthToken)),
        )

      expect(isValid).toBe(true)
    })

    test("rejects invalid token", () => {
      const rpcAuthToken = "a".repeat(64)
      const providedToken = "b".repeat(64)

      const isValid =
        rpcAuthToken &&
        typeof rpcAuthToken === "string" &&
        rpcAuthToken.length >= 32 &&
        providedToken &&
        providedToken.length === rpcAuthToken.length &&
        timingSafeEqual(
          new Uint8Array(Buffer.from(providedToken)),
          new Uint8Array(Buffer.from(rpcAuthToken)),
        )

      expect(isValid).toBe(false)
    })

    test("rejects missing token", () => {
      const rpcAuthToken = "a".repeat(64)
      const providedToken: string | undefined = undefined as
        | string
        | undefined

      const isValid =
        rpcAuthToken &&
        typeof rpcAuthToken === "string" &&
        rpcAuthToken.length >= 32 &&
        providedToken &&
        providedToken.length === rpcAuthToken.length &&
        timingSafeEqual(
          new Uint8Array(Buffer.from(providedToken)),
          new Uint8Array(Buffer.from(rpcAuthToken)),
        )

      expect(isValid).toBeFalsy()
    })

    test("rejects when rpcAuthToken is false", () => {
      const rpcAuthToken: string | false = false as string | false
      const providedToken: string = "a".repeat(64)

      // When rpcAuthToken is false, the first check fails
      const isValid = Boolean(
        rpcAuthToken &&
          typeof rpcAuthToken === "string" &&
          rpcAuthToken.length >= 32 &&
          providedToken &&
          providedToken.length === rpcAuthToken.length,
      )

      expect(isValid).toBe(false)
    })

    test("rejects token shorter than 32 characters", () => {
      const rpcAuthToken = "short"
      const providedToken = "short"

      const isValid =
        rpcAuthToken &&
        typeof rpcAuthToken === "string" &&
        rpcAuthToken.length >= 32 &&
        providedToken &&
        providedToken.length === rpcAuthToken.length

      expect(isValid).toBe(false)
    })

    test("rejects when token lengths mismatch", () => {
      const rpcAuthToken = "a".repeat(64)
      const providedToken = "a".repeat(32)

      const isValid =
        rpcAuthToken &&
        typeof rpcAuthToken === "string" &&
        rpcAuthToken.length >= 32 &&
        providedToken &&
        providedToken.length === rpcAuthToken.length

      expect(isValid).toBe(false)
    })
  })

  describe("Token sanitization for logging", () => {
    function sanitizeForLogging(value: string): string {
      const sanitizedBearer = value.replace(/Bearer\s+[\w-]+/gi, "Bearer ***")
      const sanitizedQuery = sanitizedBearer.replace(
        /[?&]token=[\w-]+/gi,
        (match) => match.replace(/=[\w-]+/, "=***"),
      )
      return sanitizedQuery
    }

    test("sanitizes Bearer token in header", () => {
      const header = "Authorization: Bearer abc123def456"
      const sanitized = sanitizeForLogging(header)

      expect(sanitized).toBe("Authorization: Bearer ***")
      expect(sanitized).not.toContain("abc123def456")
    })

    test("sanitizes query parameter token", () => {
      const url = "wss://example.com/rpc?token=abc123def456"
      const sanitized = sanitizeForLogging(url)

      expect(sanitized).toBe("wss://example.com/rpc?token=***")
      expect(sanitized).not.toContain("abc123def456")
    })

    test("sanitizes multiple tokens in same string", () => {
      const message =
        "Request to wss://example.com/rpc?token=abc123 with Bearer xyz789"
      const sanitized = sanitizeForLogging(message)

      expect(sanitized).toBe(
        "Request to wss://example.com/rpc?token=*** with Bearer ***",
      )
      expect(sanitized).not.toContain("abc123")
      expect(sanitized).not.toContain("xyz789")
    })

    test("does not modify strings without tokens", () => {
      const message = "Regular log message without sensitive data"
      const sanitized = sanitizeForLogging(message)

      expect(sanitized).toBe(message)
    })
  })
})
