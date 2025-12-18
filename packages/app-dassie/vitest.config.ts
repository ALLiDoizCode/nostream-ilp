import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.spec.ts"],
    exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
    globals: true,
  },
})
