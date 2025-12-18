#!/usr/bin/env tsx
/**
 * Run benchmark tests and save results
 */

import { execSync } from 'child_process'
import * as path from 'path'

async function main() {
  console.log('🚀 Running benchmark tests...\n')

  try {
    // Run benchmark tests using vitest
    execSync(
      'pnpm vitest run test/btp-nips/benchmarks/ --reporter=verbose',
      {
        cwd: path.join(__dirname, '../packages/app-nostream'),
        stdio: 'inherit',
        env: {
          ...process.env,
          CI: 'true', // Enable CI mode for consistent behavior
        },
      }
    )

    console.log('\n✓ Benchmarks completed successfully')
  } catch (error) {
    console.error('\n❌ Benchmarks failed')
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
