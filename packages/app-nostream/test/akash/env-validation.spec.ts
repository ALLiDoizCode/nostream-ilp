/**
 * Environment Variable Validation Tests (TEST-001)
 * Validates .env.mainnet configuration for Story 2.13
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ENV_PATH = path.resolve(__dirname, '../../../../akash/.env.mainnet')

const envContent = fs.readFileSync(ENV_PATH, 'utf-8')
const envVars: Record<string, string> = {}

// Parse env file
envContent.split('\n').forEach((line) => {
  line = line.trim()
  if (line && !line.startsWith('#')) {
    const [key, ...valueParts] = line.split('=')
    if (key) {
      envVars[key.trim()] = valueParts.join('=').trim()
    }
  }
})

describe('Environment Variable Validation', () => {

  describe('Core Required Variables', () => {
    it('should have SECRET variable', () => {
      expect(envVars.SECRET).toBeDefined()
    })

    it('SECRET should be at least 32 chars and hexadecimal', () => {
      expect(envVars.SECRET.length).toBeGreaterThanOrEqual(32)
      expect(envVars.SECRET).toMatch(/^[0-9a-fA-F]+$/)
    })

    it('should have DB_PASSWORD variable', () => {
      expect(envVars.DB_PASSWORD).toBeDefined()
      expect(envVars.DB_PASSWORD.length).toBeGreaterThanOrEqual(16)
    })

    it('should have REDIS_PASSWORD variable', () => {
      expect(envVars.REDIS_PASSWORD).toBeDefined()
      expect(envVars.REDIS_PASSWORD.length).toBeGreaterThanOrEqual(16)
    })

    it('should have DASSIE_RPC_TOKEN variable', () => {
      expect(envVars.DASSIE_RPC_TOKEN).toBeDefined()
    })

    it('DASSIE_RPC_TOKEN should be at least 32 chars and hexadecimal', () => {
      expect(envVars.DASSIE_RPC_TOKEN.length).toBeGreaterThanOrEqual(32)
      expect(envVars.DASSIE_RPC_TOKEN).toMatch(/^[0-9a-fA-F]+$/)
    })

    it('should have DOMAIN variable', () => {
      expect(envVars.DOMAIN).toBeDefined()
      expect(envVars.DOMAIN.length).toBeGreaterThan(0)
    })
  })

  describe('Dashboard Authentication', () => {
    it('should have DASHBOARD_USERNAME variable', () => {
      expect(envVars.DASHBOARD_USERNAME).toBeDefined()
    })

    it('should have DASHBOARD_PASSWORD variable', () => {
      expect(envVars.DASHBOARD_PASSWORD).toBeDefined()
      expect(envVars.DASHBOARD_PASSWORD.length).toBeGreaterThanOrEqual(12)
    })

    it('should warn if using default dashboard password', () => {
      if (envVars.DASHBOARD_PASSWORD === 'changeme_after_deployment') {
        console.warn(
          '⚠️  WARNING: DASHBOARD_PASSWORD is using default value. Generate a secure password before production deployment.'
        )
      }
    })
  })

  describe('Settlement Modules', () => {
    it('should have Base L2 settlement configuration', () => {
      expect(envVars.SETTLEMENT_BASE_ENABLED).toBeDefined()
      expect(envVars.SETTLEMENT_BASE_RPC_URL).toBeDefined()
    })

    it('should have Cronos settlement configuration', () => {
      expect(envVars.SETTLEMENT_CRONOS_ENABLED).toBeDefined()
      expect(envVars.SETTLEMENT_CRONOS_RPC_URL).toBeDefined()
    })

    it('Cronos settlement should be disabled per QA gate ARCH-001', () => {
      // QA gate ARCH-001: Epic 2 scope is Base L2 only, Cronos removed from scope
      expect(envVars.SETTLEMENT_CRONOS_ENABLED).toBe('false')
    })

    it('should have factory address variables', () => {
      expect(envVars.SETTLEMENT_BASE_FACTORY_ADDRESS).toBeDefined()
      expect(envVars.SETTLEMENT_CRONOS_FACTORY_ADDRESS).toBeDefined()
    })

    it('should have private key variables (may be empty if settlement disabled)', () => {
      expect(envVars.SETTLEMENT_BASE_RELAY_PRIVATE_KEY).toBeDefined()
      expect(envVars.SETTLEMENT_CRONOS_RELAY_PRIVATE_KEY).toBeDefined()
    })

    it('should not have exposed private keys in test environment', () => {
      // This test ensures we're not accidentally committing real keys
      // In production, these would be filled in but should never be in version control
      const baseKey = envVars.SETTLEMENT_BASE_RELAY_PRIVATE_KEY
      const cronosKey = envVars.SETTLEMENT_CRONOS_RELAY_PRIVATE_KEY

      // Both should be empty in the template
      expect(baseKey).toBe('')
      expect(cronosKey).toBe('')
    })
  })

  describe('Settlement Module Consistency', () => {
    it('should validate enabled modules have required configuration', () => {
      if (envVars.SETTLEMENT_BASE_ENABLED === 'true') {
        expect(envVars.SETTLEMENT_BASE_RPC_URL).not.toBe('')
        // Private key check is omitted - operators will fill this in
      }

      if (envVars.SETTLEMENT_CRONOS_ENABLED === 'true') {
        expect(envVars.SETTLEMENT_CRONOS_RPC_URL).not.toBe('')
        // Private key check is omitted - operators will fill this in
      }
    })
  })

  describe('URL Format Validation', () => {
    it('Base RPC URL should be valid HTTPS URL', () => {
      if (envVars.SETTLEMENT_BASE_RPC_URL) {
        expect(envVars.SETTLEMENT_BASE_RPC_URL).toMatch(/^https:\/\//)
      }
    })

    it('Cronos RPC URL should be valid HTTPS URL', () => {
      if (envVars.SETTLEMENT_CRONOS_RPC_URL) {
        expect(envVars.SETTLEMENT_CRONOS_RPC_URL).toMatch(/^https:\/\//)
      }
    })

    it('Domain should be valid format', () => {
      expect(envVars.DOMAIN).toMatch(/^[a-zA-Z0-9.-]+$/)
    })
  })
})
