#!/usr/bin/env tsx
/**
 * Archive benchmark results for historical tracking
 */

import { archiveBenchmarkResults, loadBenchmarkBaseline } from './benchmark-utils'

async function main() {
  console.log('📦 Archiving benchmark results...\n')

  try {
    const results = await loadBenchmarkBaseline('benchmark-results.json')

    if (!results) {
      console.log('⚠️  No benchmark results found to archive')
      return
    }

    await archiveBenchmarkResults(results)

    console.log('\n✓ Benchmark results archived successfully')
  } catch (error) {
    console.error('Error archiving benchmarks:', error)
    process.exit(1)
  }
}

main()
