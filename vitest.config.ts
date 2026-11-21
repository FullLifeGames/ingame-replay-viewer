import { defineConfig } from 'vitest/config'

// The unit specs run in Node; devbox allows four workers at most (AGENTS.md).
export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 4,
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/web/main.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: {
        'src/script/**': { lines: 90, branches: 90 },
        'src/gen3/**': { lines: 90, branches: 90 },
        'src/patch/**': { lines: 90, branches: 90 },
      },
    },
  },
})
