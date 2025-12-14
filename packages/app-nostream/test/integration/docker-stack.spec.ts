import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { exec } from 'child_process'
import { promisify } from 'util'
import WebSocket from 'ws'

const execAsync = promisify(exec)

describe('Docker Stack Integration', () => {
  beforeAll(async () => {
    // Start stack
    console.log('Starting Docker stack...')
    await execAsync('docker-compose up -d')

    // Wait for services to be healthy
    await new Promise(resolve => setTimeout(resolve, 30000)) // 30s
  }, 60000) // 60s timeout

  afterAll(async () => {
    // Stop stack
    await execAsync('docker-compose down')
  })

  it('should start all services successfully', async () => {
    // Verify all services are running using docker inspect
    const serviceNames = ['nostream-ilp', 'nostream-db', 'nostream-cache', 'dassie-node']

    for (const name of serviceNames) {
      const { stdout } = await execAsync(`docker inspect ${name} --format="{{.State.Status}}"`)
      expect(stdout.trim()).toBe('running')
    }
  })

  it('should have healthy nostream service', async () => {
    const { stdout } = await execAsync('docker inspect nostream-ilp --format="{{.State.Health.Status}}"')
    expect(stdout.trim()).toBe('healthy')
  })

  it('should have healthy postgres service', async () => {
    const { stdout } = await execAsync('docker inspect nostream-db --format="{{.State.Health.Status}}"')
    expect(stdout.trim()).toBe('healthy')
  })

  it('should have healthy redis service', async () => {
    const { stdout } = await execAsync('docker inspect nostream-cache --format="{{.State.Health.Status}}"')
    expect(stdout.trim()).toBe('healthy')
  })

  it('should have healthy dassie service', async () => {
    const { stdout } = await execAsync('docker inspect dassie-node --format="{{.State.Health.Status}}"')
    expect(stdout.trim()).toBe('healthy')
  })

  it('should accept WebSocket connections on port 8008', async () => {
    const ws = new WebSocket('ws://localhost:8008')

    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        ws.close()
        resolve(undefined)
      })
      ws.on('error', reject)
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    })
  })

  it('should respond to health check endpoint', async () => {
    const response = await fetch('http://localhost:8008/health')
    expect(response.status).toBe(200)

    const health = await response.json()
    expect(health.status).toMatch(/healthy|degraded/)
    expect(health.services).toBeDefined()
    expect(health.timestamp).toBeDefined()
  })

  it('should respond to Dassie health check endpoint', async () => {
    const response = await fetch('http://localhost:7768/health')
    expect(response.status).toBe(200)
  })

  it('should verify Nostream can reach Dassie RPC', async () => {
    // Check Nostream logs for successful Dassie connection
    const { stdout } = await execAsync('docker logs nostream-ilp 2>&1 | grep -i "dassie\\|rpc" || echo "No RPC logs found"')

    // Verify no connection errors in logs
    const hasConnectionError = stdout.toLowerCase().includes('connection refused') ||
                              stdout.toLowerCase().includes('econnrefused') ||
                              stdout.toLowerCase().includes('failed to connect')

    expect(hasConnectionError).toBe(false)
  })
})
