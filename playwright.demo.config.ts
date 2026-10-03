import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 5493)

export default defineConfig({
  testDir: 'e2e/demo',
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    launchOptions: { slowMo: 60 },
  },
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
