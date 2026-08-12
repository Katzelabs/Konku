import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end, against the real binary (06 P6).
 *
 * The core loop only: sign in, write a note, write a card, review it, run a
 * session, capture at the end. The auth flows from 07 get tested with the
 * feature, because an auth flow that half works locks people out of their own
 * data.
 *
 * It drives the *built binary* rather than the Vite dev server. That is the
 * whole point of an end-to-end tier here: it exercises the embedded assets,
 * the SPA fallback, the strict CSP, and the origin check — none of which exist
 * in front of `vite dev`. A suite run against the dev server would pass on a
 * build that cannot serve itself.
 *
 * The inverse is equally true, so it has its own tier: this suite stays green
 * on a dev server nobody can POST through, which is a state the project has
 * actually been in. See playwright.dev-proxy.config.ts.
 */

const PORT = 8099
const BASE_URL = `http://127.0.0.1:${PORT}`

// The app pool connects as the non-owner role so RLS applies (D-059); the
// owner is used once for migrations.
const APP_DB =
  process.env.E2E_DATABASE_URL ??
  'postgres://konku_app:konku_app_dev@localhost:5433/konku?sslmode=disable'
const OWNER_DB =
  process.env.E2E_MIGRATION_DATABASE_URL ??
  'postgres://konku:konku@localhost:5433/konku?sslmode=disable'

export default defineConfig({
  testDir: './e2e',
  // Serial: every test drives one account against one database. Parallel
  // workers would interleave writes to the same review queue and the failures
  // would look like scheduler bugs.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // `make build` embeds the frontend into the binary, so this is the same
    // artifact a deploy would run.
    command: `cd .. && make build && \
      DATABASE_URL='${APP_DB}' \
      MIGRATION_DATABASE_URL='${OWNER_DB}' \
      PORT=${PORT} \
      DEV=false \
      SESSION_SECRET=e2e-session-secret-not-used-anywhere-else \
      METRICS_ADDR= \
      SENTRY_DSN= \
      ./bin/konku`,
    url: `${BASE_URL}/readyz`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
