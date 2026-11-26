import { defineConfig, devices } from '@playwright/test'

// The page's e2e (plan S5b §5): the build machine only, never in CI. The game's frames are
// ROM-derived, so no screenshot, video or trace is written; the specs compare frames in memory.
// Port 5178 is the lane's e2e port (plan D12); 5173, 5174, 5176, 5177 and 8090 belong to others.
const PORT = 5178
const BASE_URL = `http://localhost:${String(PORT)}`

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${String(PORT)} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
  },
})
