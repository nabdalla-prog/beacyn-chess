import { defineConfig, devices } from '@playwright/test'

// Uses a system Chromium when CHROMIUM_PATH is set (e.g. /usr/bin/chromium),
// otherwise Playwright's own browser (`npx playwright install chromium`).
const executablePath = process.env.CHROMIUM_PATH
const launchOptions = executablePath ? { executablePath } : {}

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions } },
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions } },
  ],
})
