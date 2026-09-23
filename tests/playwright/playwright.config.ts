// COUNCIL-2026-031 — browser + API suite configuration.
//
// The app and a local Supabase stack must already be running (CI: e2e.yml;
// locally: see docs/TESTING.md). This config never starts or seeds anything,
// and the setup project refuses to run against a non-local Supabase.
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.APP_BASE_URL ?? 'http://127.0.0.1:3000'
const isCI = !!process.env.CI

export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // More than ~4 concurrent sessions exhausts the local Supabase auth
  // container's DB connections ("cannot assign requested address"), which
  // surfaces as random redirects to /login. Override with PW_WORKERS.
  workers: Number(process.env.PW_WORKERS ?? 4),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [['list'], ['html', { outputFolder: '../../playwright-report', open: 'never' }], ['github']]
    : [['list'], ['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'setup', testMatch: /fixtures\/auth\.setup\.ts/ },
    {
      name: 'api',
      testMatch: /api\/.*\.spec\.ts/,
      dependencies: ['setup'],
    },
    {
      name: 'browser',
      testMatch: /browser\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Mobile viewport: only specs tagged @mobile (core learner + public pages).
      name: 'mobile',
      testMatch: /browser\/.*\.spec\.ts/,
      grep: /@mobile/,
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'] },
    },
    {
      // Post-release production checks (D8). Never runs against the CI stack.
      name: 'prod-synthetic',
      testMatch: /prod\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: process.env.SYNTHETIC_BASE_URL },
      retries: 1,
      fullyParallel: false,
    },
  ],
})
