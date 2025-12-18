import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Enable retry for flaky tests (AC 8)
    retry: process.env.CI ? 1 : 0, // Retry once in CI, no retry locally

    // Increase timeouts for CI environment (AC 8)
    testTimeout: process.env.CI ? 20000 : 10000, // 2x timeout in CI

    // Global test configuration
    globals: true,
    environment: 'node',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'test/**',
        '**/*.spec.ts',
        '**/*.test.ts',
      ],
    },

    // Test file patterns
    include: [
      'test/**/*.spec.ts',
      'test/**/*.test.ts',
    ],

    // Exclude patterns
    exclude: [
      'node_modules/**',
      'dist/**',
      '.test-reports/**',
      '.coverage/**',
    ],

    // Reporter configuration
    reporters: process.env.CI
      ? ['verbose', 'json', 'junit']
      : ['verbose'],

    // Output directory for test results
    outputFile: {
      json: './test-results/results.json',
      junit: './test-results/junit.xml',
    },

    // Setup files
    setupFiles: [],

    // Hook timeouts
    hookTimeout: 30000,

    // Pool options for parallel test execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: process.env.CI ? 4 : undefined,
      },
    },

    // Test isolation
    isolate: true,

    // Watch mode configuration (for local development)
    watch: false,
    watchExclude: [
      'node_modules/**',
      'dist/**',
    ],
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, './test'),
    },
  },
})
