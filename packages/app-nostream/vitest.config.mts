import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    globals: true,
    testTimeout: 120000, // 2 minutes per test (Docker startup is slow)
    hookTimeout: 60000, // 1 minute for beforeEach/afterEach
  },
})
