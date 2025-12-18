import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  type DassieJsonConfig,
  configFileExists,
  loadConfigFromFile,
} from './json-config-loader.js'

const TEST_DIR = join(process.cwd(), 'test-config-temp')
const TEST_CONFIG_PATH = join(TEST_DIR, 'test-config.json')

const VALID_CONFIG: DassieJsonConfig = {
  nodeId: 'test-node-0',
  ilpAddress: 'g.dassie.test-node-0',
  rpc: {
    port: 7768,
    authToken: 'test-token-must-be-at-least-32-characters-long',
  },
  settlement: {
    scheme: 'mock',
    autoSettle: true,
    threshold: 10_000,
  },
  peers: {
    bootstrap: ['g.dassie.node1', 'g.dassie.node2'],
    maxPeers: 10,
  },
  btpNips: {
    enabled: true,
    maxEventSize: 65_536,
  },
}

describe('json-config-loader', () => {
  beforeEach(async () => {
    // Clean up test directory
    await rm(TEST_DIR, { recursive: true, force: true })
    await mkdir(TEST_DIR, { recursive: true })

    // Clear environment variables
    delete process.env['DASSIE_CONFIG_PATH']
    delete process.env['DASSIE_NODE_ID']
    delete process.env['DASSIE_ILP_ADDRESS']
    delete process.env['DASSIE_RPC_PORT']
    delete process.env['DASSIE_RPC_AUTH_TOKEN']
    delete process.env['DASSIE_SETTLEMENT_SCHEME']
    delete process.env['DASSIE_BTP_NIPS_ENABLED']
  })

  describe('loadConfigFromFile', () => {
    it('should load valid config.json', async () => {
      await writeFile(TEST_CONFIG_PATH, JSON.stringify(VALID_CONFIG))

      const config = await loadConfigFromFile(TEST_CONFIG_PATH)

      expect(config).toEqual(VALID_CONFIG)
    })

    it('should throw error if config file is missing', async () => {
      await expect(
        loadConfigFromFile(join(TEST_DIR, 'nonexistent.json')),
      ).rejects.toThrow(/Configuration file not found/)
    })

    it('should throw error if config has invalid JSON', async () => {
      await writeFile(TEST_CONFIG_PATH, '{ invalid json }')

      await expect(loadConfigFromFile(TEST_CONFIG_PATH)).rejects.toThrow(
        /Invalid JSON/,
      )
    })

    it('should throw error if nodeId is missing', async () => {
      const invalidConfig = { ...VALID_CONFIG }
      delete (invalidConfig as Partial<DassieJsonConfig>).nodeId

      await writeFile(TEST_CONFIG_PATH, JSON.stringify(invalidConfig))

      await expect(loadConfigFromFile(TEST_CONFIG_PATH)).rejects.toThrow(
        /nodeId.*Required/,
      )
    })

    it('should throw error if ilpAddress has invalid format', async () => {
      const invalidConfig = { ...VALID_CONFIG, ilpAddress: 'invalid-address' }

      await writeFile(TEST_CONFIG_PATH, JSON.stringify(invalidConfig))

      await expect(loadConfigFromFile(TEST_CONFIG_PATH)).rejects.toThrow(
        /Invalid ILP address format/,
      )
    })

    it('should throw error if rpc.port is out of range', async () => {
      const invalidConfig = {
        ...VALID_CONFIG,
        rpc: { ...VALID_CONFIG.rpc, port: 99999 },
      }

      await writeFile(TEST_CONFIG_PATH, JSON.stringify(invalidConfig))

      await expect(loadConfigFromFile(TEST_CONFIG_PATH)).rejects.toThrow(
        /Port must be 1-65535/,
      )
    })

    it('should throw error if rpc.authToken is too short', async () => {
      const invalidConfig = {
        ...VALID_CONFIG,
        rpc: { ...VALID_CONFIG.rpc, authToken: 'short' },
      }

      await writeFile(TEST_CONFIG_PATH, JSON.stringify(invalidConfig))

      await expect(loadConfigFromFile(TEST_CONFIG_PATH)).rejects.toThrow(
        /Auth token must be at least 32 characters/,
      )
    })

    it('should throw error if peers.bootstrap is empty', async () => {
      const invalidConfig = {
        ...VALID_CONFIG,
        peers: { ...VALID_CONFIG.peers, bootstrap: [] },
      }

      await writeFile(TEST_CONFIG_PATH, JSON.stringify(invalidConfig))

      await expect(loadConfigFromFile(TEST_CONFIG_PATH)).rejects.toThrow(
        /At least one bootstrap peer required/,
      )
    })

    it('should use default values for optional fields', async () => {
      const minimalConfig = {
        nodeId: 'test-node-0',
        ilpAddress: 'g.dassie.test-node-0',
        rpc: {
          port: 7768,
          authToken: 'test-token-must-be-at-least-32-characters-long',
        },
        settlement: {
          scheme: 'mock',
          autoSettle: true,
          threshold: 10_000,
        },
        peers: {
          bootstrap: ['g.dassie.node1'],
        },
      }

      await writeFile(TEST_CONFIG_PATH, JSON.stringify(minimalConfig))

      const config = await loadConfigFromFile(TEST_CONFIG_PATH)

      expect(config.peers.maxPeers).toBe(10)
      expect(config.btpNips?.enabled).toBe(true)
      expect(config.btpNips?.maxEventSize).toBe(65_536)
    })
  })

  describe('environment variable overrides', () => {
    it('should override nodeId from environment', async () => {
      await writeFile(TEST_CONFIG_PATH, JSON.stringify(VALID_CONFIG))
      process.env['DASSIE_NODE_ID'] = 'overridden-node-id'

      const config = await loadConfigFromFile(TEST_CONFIG_PATH)

      expect(config.nodeId).toBe('overridden-node-id')
    })

    it('should override ilpAddress from environment', async () => {
      await writeFile(TEST_CONFIG_PATH, JSON.stringify(VALID_CONFIG))
      process.env['DASSIE_ILP_ADDRESS'] = 'g.dassie.overridden'

      const config = await loadConfigFromFile(TEST_CONFIG_PATH)

      expect(config.ilpAddress).toBe('g.dassie.overridden')
    })

    it('should override rpc.port from environment', async () => {
      await writeFile(TEST_CONFIG_PATH, JSON.stringify(VALID_CONFIG))
      process.env['DASSIE_RPC_PORT'] = '9999'

      const config = await loadConfigFromFile(TEST_CONFIG_PATH)

      expect(config.rpc.port).toBe(9999)
    })

    it('should override rpc.authToken from environment', async () => {
      await writeFile(TEST_CONFIG_PATH, JSON.stringify(VALID_CONFIG))
      process.env['DASSIE_RPC_AUTH_TOKEN'] =
        'overridden-token-must-be-at-least-32-characters'

      const config = await loadConfigFromFile(TEST_CONFIG_PATH)

      expect(config.rpc.authToken).toBe(
        'overridden-token-must-be-at-least-32-characters',
      )
    })

    it('should override settlement.scheme from environment', async () => {
      await writeFile(TEST_CONFIG_PATH, JSON.stringify(VALID_CONFIG))
      process.env['DASSIE_SETTLEMENT_SCHEME'] = 'lightning'

      const config = await loadConfigFromFile(TEST_CONFIG_PATH)

      expect(config.settlement.scheme).toBe('lightning')
    })

    it('should override btpNips.enabled from environment', async () => {
      await writeFile(TEST_CONFIG_PATH, JSON.stringify(VALID_CONFIG))
      process.env['DASSIE_BTP_NIPS_ENABLED'] = 'false'

      const config = await loadConfigFromFile(TEST_CONFIG_PATH)

      expect(config.btpNips?.enabled).toBe(false)
    })
  })

  describe('configFileExists', () => {
    it('should return true if config file exists', async () => {
      await writeFile(TEST_CONFIG_PATH, JSON.stringify(VALID_CONFIG))

      const exists = await configFileExists(TEST_CONFIG_PATH)

      expect(exists).toBe(true)
    })

    it('should return false if config file does not exist', async () => {
      const exists = await configFileExists(join(TEST_DIR, 'nonexistent.json'))

      expect(exists).toBe(false)
    })
  })
})
