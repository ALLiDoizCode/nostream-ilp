import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

describe('Payment Processor Cleanup Verification', () => {
  const srcDir = join(__dirname, '../../src')

  it('should not have payment processor directories except null-payments-processor', () => {
    const paymentsProcessorsDir = join(srcDir, 'payments-processors')
    expect(existsSync(paymentsProcessorsDir)).toBe(true)

    const files = readdirSync(paymentsProcessorsDir)
    const tsFiles = files.filter(f => f.endsWith('.ts'))

    expect(tsFiles).toHaveLength(1)
    expect(tsFiles[0]).toBe('null-payments-processor.ts')
  })

  it('should not have callback controller directories', () => {
    const callbacksDir = join(srcDir, 'controllers/callbacks')
    expect(existsSync(callbacksDir)).toBe(false)
  })

  it('should not have payment processor factories', () => {
    const factoriesDir = join(srcDir, 'factories/payments-processors')
    expect(existsSync(factoriesDir)).toBe(false)
  })

  it('should not have callback routes', () => {
    const callbackRoutesFile = join(srcDir, 'routes/callbacks/index.ts')
    expect(existsSync(callbackRoutesFile)).toBe(false)
  })

  it('should not import payment processors in source code', async () => {
    const { readFileSync } = await import('fs')
    const { glob } = await import('glob')

    const sourceFiles = await glob('src/**/*.ts', {
      cwd: join(__dirname, '../..'),
      ignore: ['src/payments-processors/null-payments-processor.ts']
    })

    const forbiddenImports = [
      'zebedee',
      'nodeless',
      'opennode',
      'lnbits-payment',
      'lnurl-payments',
    ]

    for (const file of sourceFiles) {
      const fullPath = join(__dirname, '../..', file)
      const content = readFileSync(fullPath, 'utf-8')

      for (const forbidden of forbiddenImports) {
        expect(content).not.toContain(forbidden)
      }
    }
  })

  it('should have NullPaymentsProcessor available', async () => {
    const { NullPaymentsProcessor } = await import('../../src/payments-processors/null-payments-processor')
    expect(NullPaymentsProcessor).toBeDefined()

    const processor = new NullPaymentsProcessor()
    expect(processor).toBeDefined()
  })

  it('should create payments processor factory without errors', async () => {
    const { createPaymentsProcessor } = await import('../../src/factories/payments-processor-factory')

    // Should not throw
    expect(() => createPaymentsProcessor()).not.toThrow()

    const processor = createPaymentsProcessor()
    expect(processor).toBeDefined()
  })
})
