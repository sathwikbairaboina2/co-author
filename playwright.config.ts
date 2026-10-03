import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 5490)

export default defineConfig({
  testDir: 'e2e',
  testIgnore: ['**/demo/**'],
  timeout: 30_000,
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
