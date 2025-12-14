import { describe, expect, test, beforeEach, afterEach } from "vitest"

import { EnvironmentConfig } from "./environment-config"

describe("Environment Config - RPC Auth Token", () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  test("accepts valid RPC auth token (32 characters)", () => {
    process.env["DASSIE_RPC_AUTH_TOKEN"] = "a".repeat(32)

    const config = EnvironmentConfig()

    expect(config.rpcAuthToken).toBe("a".repeat(32))
  })

  test("accepts valid RPC auth token (64 characters)", () => {
    process.env["DASSIE_RPC_AUTH_TOKEN"] = "b".repeat(64)

    const config = EnvironmentConfig()

    expect(config.rpcAuthToken).toBe("b".repeat(64))
  })

  test("accepts valid RPC auth token (128 characters)", () => {
    process.env["DASSIE_RPC_AUTH_TOKEN"] = "c".repeat(128)

    const config = EnvironmentConfig()

    expect(config.rpcAuthToken).toBe("c".repeat(128))
  })

  test("returns false when RPC auth token is not set", () => {
    delete process.env["DASSIE_RPC_AUTH_TOKEN"]

    const config = EnvironmentConfig()

    expect(config.rpcAuthToken).toBe(false)
  })

  test("throws error for token shorter than 32 characters", () => {
    process.env["DASSIE_RPC_AUTH_TOKEN"] = "short"

    expect(() => EnvironmentConfig()).toThrow(
      "DASSIE_RPC_AUTH_TOKEN must be at least 32 characters long",
    )
  })

  test("throws error for token with exactly 31 characters", () => {
    process.env["DASSIE_RPC_AUTH_TOKEN"] = "a".repeat(31)

    expect(() => EnvironmentConfig()).toThrow(
      "DASSIE_RPC_AUTH_TOKEN must be at least 32 characters long",
    )
  })

  test("does not affect dev security token validation", () => {
    // Set both tokens
    process.env["DASSIE_RPC_AUTH_TOKEN"] = "a".repeat(64)
    process.env["DASSIE_DEV_SECURITY_TOKEN"] = "b".repeat(64)

    const config = EnvironmentConfig()

    expect(config.rpcAuthToken).toBe("a".repeat(64))
    expect(config.devSecurityToken).toBe("b".repeat(64))
  })

  test("RPC auth token works independently of dev token", () => {
    process.env["DASSIE_RPC_AUTH_TOKEN"] = "a".repeat(64)
    delete process.env["DASSIE_DEV_SECURITY_TOKEN"]

    const config = EnvironmentConfig()

    expect(config.rpcAuthToken).toBe("a".repeat(64))
    expect(config.devSecurityToken).toBe(false)
  })
})
