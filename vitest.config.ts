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
      // main.ts and view.ts are the page's DOM wiring; the e2e covers them, no Node spec can load them.
      // The same holds for the WebAssembly spike page's wiring, its worker and its audio worklet.
      exclude: [
        'src/**/*.test.ts',
        'src/web/main.ts',
        'src/web/view.ts',
        'src/web/wasm/main.ts',
        'src/web/wasm/view.ts',
        'src/web/wasm/worker.ts',
        'src/web/wasm/audio-worklet.ts',
      ],
      reporter: ['text-summary', 'html'],
      thresholds: {
        'src/script/**': { lines: 90, branches: 90 },
        'src/gen3/**': { lines: 90, branches: 90 },
        'src/patch/**': { lines: 90, branches: 90 },
      },
    },
  },
})
