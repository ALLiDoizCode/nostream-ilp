/**
 * SDL Validation Tests (TEST-001)
 * Validates Akash SDL configuration for Story 2.13
 */

import { describe, it, expect } from 'vitest'
import * as yaml from 'yaml'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SDL_PATH = path.resolve(__dirname, '../../../../akash/deploy.yaml')
const sdlContent = fs.readFileSync(SDL_PATH, 'utf-8')
const sdl = yaml.parse(sdlContent)

describe('Akash SDL Validation', () => {

  describe('Schema Structure', () => {
    it('should have valid SDL version 2.0', () => {
      expect(sdl.version).toBe('2.0')
    })

    it('should define all 4 required services', () => {
      const services = Object.keys(sdl.services)
      expect(services).toEqual(
        expect.arrayContaining(['nostream', 'dassie', 'postgres', 'redis'])
      )
      expect(services).toHaveLength(4)
    })

    it('should define compute profiles for all services', () => {
      const profiles = Object.keys(sdl.profiles.compute)
      expect(profiles).toEqual(
        expect.arrayContaining(['nostream', 'dassie', 'postgres', 'redis'])
      )
    })

    it('should define placement pricing for all services', () => {
      const pricing = Object.keys(sdl.profiles.placement.dcloud.pricing)
      expect(pricing).toEqual(
        expect.arrayContaining(['nostream', 'dassie', 'postgres', 'redis'])
      )
    })

    it('should define deployment profiles for all services', () => {
      const deployments = Object.keys(sdl.deployment)
      expect(deployments).toEqual(
        expect.arrayContaining(['nostream', 'dassie', 'postgres', 'redis'])
      )
    })
  })

  describe('Service Configuration', () => {
    it('nostream should use production-tagged image', () => {
      expect(sdl.services.nostream.image).toMatch(/nostream-ilp:v\d+\.\d+\.\d+-mainnet/)
    })

    it('dassie should use production-tagged image', () => {
      expect(sdl.services.dassie.image).toMatch(/dassie-node:v\d+\.\d+\.\d+-mainnet/)
    })

    it('nostream should expose global ports 443 and 8080', () => {
      const exposed = sdl.services.nostream.expose
      expect(exposed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ port: 443, to: [{ global: true }] }),
          expect.objectContaining({ port: 8080, to: [{ global: true }] })
        ])
      )
    })

    it('dassie should expose port 7768 internally only', () => {
      const exposed = sdl.services.dassie.expose
      expect(exposed).toHaveLength(1)
      expect(exposed[0]).toEqual({
        port: 7768,
        to: [{ service: 'nostream' }]
      })
      expect(exposed[0].to).not.toContainEqual({ global: true })
    })

    it('nostream should depend on postgres, redis, and dassie', () => {
      const dependencies = sdl.services.nostream.depends_on
      expect(dependencies).toEqual(
        expect.arrayContaining(['postgres', 'redis', 'dassie'])
      )
    })
  })

  describe('Environment Variables', () => {
    it('nostream should have Dassie RPC configuration', () => {
      const env = sdl.services.nostream.env
      const envVars = env.map((e: string) => e.split('=')[0])

      expect(envVars).toContain('DASSIE_RPC_URL')
      expect(envVars).toContain('DASSIE_RPC_TOKEN')
      expect(envVars).toContain('BTP_NIPS_ENABLED')
    })

    it('dassie should have settlement module variables', () => {
      const env = sdl.services.dassie.env
      const envVars = env.map((e: string) => e.split('=')[0])

      expect(envVars).toContain('SETTLEMENT_BASE_ENABLED')
      expect(envVars).toContain('SETTLEMENT_BASE_RPC_URL')
      expect(envVars).toContain('SETTLEMENT_CRONOS_ENABLED')
    })
  })

  describe('Resource Allocation', () => {
    it('dassie should have correct CPU allocation (0.35 units)', () => {
      const cpu = sdl.profiles.compute.dassie.resources.cpu.units
      expect(cpu).toBe(0.35)
    })

    it('dassie should have correct memory allocation (512Mi)', () => {
      const memory = sdl.profiles.compute.dassie.resources.memory.size
      expect(memory).toBe('512Mi')
    })

    it('dassie should have correct storage allocation (5Gi)', () => {
      const storage = sdl.profiles.compute.dassie.resources.storage.size
      expect(storage).toBe('5Gi')
    })

    it('total CPU should be 1.2 units', () => {
      const { nostream, dassie, postgres, redis } = sdl.profiles.compute
      const totalCpu =
        nostream.resources.cpu.units +
        dassie.resources.cpu.units +
        postgres.resources.cpu.units +
        redis.resources.cpu.units

      expect(totalCpu).toBeCloseTo(1.2, 1)
    })
  })

  describe('Pricing', () => {
    it('dassie pricing should be 200 uAKT/block', () => {
      const dassiePricing = sdl.profiles.placement.dcloud.pricing.dassie
      expect(dassiePricing.denom).toBe('uakt')
      expect(dassiePricing.amount).toBe(200)
    })

    it('total pricing should be 1,150 uAKT/block', () => {
      const pricing = sdl.profiles.placement.dcloud.pricing
      const total =
        pricing.nostream.amount +
        pricing.dassie.amount +
        pricing.postgres.amount +
        pricing.redis.amount

      expect(total).toBe(1150)
    })

    it('estimated monthly cost should be under $10 (at $5/AKT)', () => {
      const blocksPerMonth = 30 * 24 * 60 * 10 // 30 days, 6s blocks
      const uAKTPerBlock = 1150
      const aktPerMonth = (uAKTPerBlock * blocksPerMonth) / 1_000_000
      const usdPerMonth = aktPerMonth * 5 // $5/AKT assumption

      expect(usdPerMonth).toBeLessThan(10)
      expect(usdPerMonth).toBeCloseTo(6.04, 1)
    })
  })

  describe('Deployment Profiles', () => {
    it('all services should have count=1', () => {
      Object.values(sdl.deployment).forEach((deployment: any) => {
        expect(deployment.dcloud.count).toBe(1)
      })
    })

    it('all services should reference correct profiles', () => {
      expect(sdl.deployment.nostream.dcloud.profile).toBe('nostream')
      expect(sdl.deployment.dassie.dcloud.profile).toBe('dassie')
      expect(sdl.deployment.postgres.dcloud.profile).toBe('postgres')
      expect(sdl.deployment.redis.dcloud.profile).toBe('redis')
    })
  })
})
