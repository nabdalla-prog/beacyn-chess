import { defineConfig, devices } from '@playwright/test'

// Uses a system Chromium when CHROMIUM_PATH is set (e.g. /usr/bin/chromium),
// otherwise Playwright's own browser (`npx playwright install chromium`).
const executablePath = process.env.CHROMIUM_PATH
const launchOptions = executablePath ? { executablePath } : {}

// Tests run against the production build served from the real Pages sub-path,
// or against a deployed site when E2E_URL is set (e.g. the live GitHub Pages URL).
const basePath = process.env.BASE_PATH ?? '/Beacyn-chess/'
const baseURL = process.env.E2E_URL ?? `http://localhost:4173${basePath}`

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_URL
    ? undefined
    : {
        command: 'npm run build && npx vite preview --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions } },
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions } },
  ],
})
