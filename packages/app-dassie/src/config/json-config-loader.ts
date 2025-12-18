import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'

/**
 * Configuration schema for Dassie node from config.json
 * Supports both file-based and environment variable configuration
 */
export const dassieJsonConfigSchema = z.object({
  nodeId: z.string().min(1, 'Node ID required'),
  ilpAddress: z
    .string()
    .regex(/^g\.[a-z0-9.-]+$/i, 'Invalid ILP address format'),

  rpc: z.object({
    port: z.number().int().min(1).max(65535, 'Port must be 1-65535'),
    authToken: z.string().min(32, 'Auth token must be at least 32 characters'),
  }),

  settlement: z.object({
    scheme: z.enum(['mock', 'lightning', 'on-chain', 'base', 'cosmos', 'xrp']),
    autoSettle: z.boolean(),
    threshold: z.number().int().positive('Threshold must be positive'),
  }),

  peers: z.object({
    bootstrap: z
      .array(z.string())
      .min(1, 'At least one bootstrap peer required'),
    maxPeers: z.number().int().positive().optional().default(10),
  }),

  btpNips: z
    .object({
      enabled: z.boolean().default(true),
      maxEventSize: z.number().int().positive().default(65536),
    })
    .default({ enabled: true, maxEventSize: 65536 }),
})

export type DassieJsonConfig = z.infer<typeof dassieJsonConfigSchema>

/**
 * Load configuration from config.json file
 * @param configPath Path to config.json (defaults to DASSIE_CONFIG_PATH env var or ./config.json)
 * @returns Validated configuration object
 * @throws Error if config file is missing or invalid
 */
export async function loadConfigFromFile(
  configPath?: string,
): Promise<DassieJsonConfig> {
  // Determine config file path
  const path =
    configPath ??
    process.env['DASSIE_CONFIG_PATH'] ??
    resolve(process.cwd(), 'config.json')

  try {
    // Read and parse JSON file
    const fileContent = await readFile(path, 'utf-8')
    const jsonData = JSON.parse(fileContent) as unknown

    // Validate with Zod schema
    const config = dassieJsonConfigSchema.parse(jsonData)

    // Apply environment variable overrides
    const finalConfig = applyEnvironmentOverrides(config)

    return finalConfig
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `Configuration file not found: ${path}. Please create a config.json file or set DASSIE_CONFIG_PATH environment variable.`,
      )
    }

    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in configuration file: ${path}. ${error.message}`,
      )
    }

    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ')
      throw new Error(`Configuration validation failed: ${errorMessages}`)
    }

    throw error
  }
}

/**
 * Apply environment variable overrides to configuration
 * Environment variables take precedence over config.json values
 */
function applyEnvironmentOverrides(config: DassieJsonConfig): DassieJsonConfig {
  const overrides: Partial<DassieJsonConfig> = {}

  // Override nodeId
  if (process.env['DASSIE_NODE_ID']) {
    overrides.nodeId = process.env['DASSIE_NODE_ID']
  }

  // Override ILP address
  if (process.env['DASSIE_ILP_ADDRESS']) {
    overrides.ilpAddress = process.env['DASSIE_ILP_ADDRESS']
  }

  // Override RPC settings
  if (process.env['DASSIE_RPC_PORT']) {
    overrides.rpc = {
      ...config.rpc,
      port: Number.parseInt(process.env['DASSIE_RPC_PORT'], 10),
    }
  }

  if (process.env['DASSIE_RPC_AUTH_TOKEN']) {
    overrides.rpc = {
      ...(overrides.rpc ?? config.rpc),
      authToken: process.env['DASSIE_RPC_AUTH_TOKEN'],
    }
  }

  // Override settlement scheme
  if (process.env['DASSIE_SETTLEMENT_SCHEME']) {
    overrides.settlement = {
      ...config.settlement,
      scheme: process.env['DASSIE_SETTLEMENT_SCHEME'] as
        | 'mock'
        | 'lightning'
        | 'on-chain'
        | 'base'
        | 'cosmos'
        | 'xrp',
    }
  }

  // Override BTP-NIPs settings
  if (process.env['DASSIE_BTP_NIPS_ENABLED']) {
    overrides.btpNips = {
      ...(config.btpNips ?? { enabled: true, maxEventSize: 65536 }),
      enabled: process.env['DASSIE_BTP_NIPS_ENABLED'] === 'true',
    }
  }

  return { ...config, ...overrides }
}

/**
 * Check if config.json exists at the specified path
 * @param configPath Path to config.json
 * @returns true if file exists, false otherwise
 */
export async function configFileExists(configPath?: string): Promise<boolean> {
  const path =
    configPath ??
    process.env['DASSIE_CONFIG_PATH'] ??
    resolve(process.cwd(), 'config.json')

  try {
    await readFile(path, 'utf-8')
    return true
  } catch {
    return false
  }
}
