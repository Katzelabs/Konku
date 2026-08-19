import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end, against the *dev server* — the one configuration the main suite
 * structurally cannot see.
 *
 * `playwright.config.ts` drives the built binary on purpose: it exercises the
 * embedded assets, the SPA fallback and the strict CSP, none of which exist in
 * front of `vite dev`. The inverse is just as true and is why this file
 * exists. Everything the browser sends to the API in development goes through
 * Vite's proxy first, and that proxy can rewrite headers the API makes
 * decisions on. A suite that only ever runs against the binary stays green on
 * a dev server nobody can POST through.
 *
 * That is not hypothetical. `'/api': 'http://localhost:8080'` — the string
 * shorthand — is expanded by Vite to `{ target, changeOrigin: true }`, and
 * changeOrigin overwrites the Host header with the proxy target. The browser
 * still sends `Origin: http://localhost:5173`, so enforceOrigin compared 5173
 * against 8080, concluded the write was cross-site, and answered 403 to every
 * POST, PUT and DELETE in development. Signing in was impossible. The unit
 * tests could not catch it — they are httptest-based, where Origin and Host
 * agree by construction — and neither could the e2e suite, which never starts
 * Vite. This is the second mechanism hard rule 9 asks for.
 *
 * Two servers, both on their real dev ports, because the ports are hardcoded
 * in vite.config.ts and hardcoding them is part of what is under test.
 *
 * Run it with `npm run e2e:dev-proxy`, and stop `make dev-web` first.
 */

const VITE_ORIGIN = 'http://localhost:5173'
const API_PORT = 8080

// Same database as the main suite, reached the same way: the app pool connects
// as the non-owner role so RLS applies (D-059), the owner runs migrations.
const APP_DB =
  process.env.E2E_DATABASE_URL ??
  'postgres://konku_app:konku_app_dev@localhost:5433/konku?sslmode=disable'
const OWNER_DB =
  process.env.E2E_MIGRATION_DATABASE_URL ??
  'postgres://konku:konku@localhost:5433/konku?sslmode=disable'

export default defineConfig({
  testDir: './e2e-dev',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Same reasoning as the main config: line for the log, html so a failure
  // leaves something to upload. Its own output directories, so the two suites
  // cannot clear each other's evidence.
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report-dev-proxy' }]]
    : 'list',
  outputDir: 'test-results-dev-proxy',

  use: {
    // The browser must load the app from Vite, not from the API. Going
    // straight to :8080 would make every request same-origin and test nothing.
    baseURL: VITE_ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      // `go build` rather than `make build`: the frontend is served by Vite
      // here, so embedding it would be a slower way to produce the same API.
      // The binary is still needed on disk — seedAccount shells out to
      // `konku seed-user`.
      //
      // DEV=true is the configuration being tested, and it is also required:
      // the session cookie is Secure unless Dev is set, and this suite speaks
      // http. It changes nothing about enforceOrigin, which is the point —
      // the origin check has no development bypass to accidentally rely on.
      command: `cd .. && go build -o bin/konku ./cmd/konku && \
        DATABASE_URL='${APP_DB}' \
        MIGRATION_DATABASE_URL='${OWNER_DB}' \
        PORT=${API_PORT} \
        DEV=true \
        SESSION_SECRET=e2e-dev-proxy-secret-not-used-anywhere-else \
        METRICS_ADDR= \
        SENTRY_DSN= \
        ./bin/konku`,
      url: `http://127.0.0.1:${API_PORT}/readyz`,
      // The API is not what this suite is testing, and a running `make
      // dev-api` is the same binary from the same source. Reusing it saves a
      // rebuild on every local run.
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Never reused, even locally, and that is deliberate: the Vite config is
      // the artefact under test, and a dev server started before an edit is
      // still running the old proxy. Reusing one would report a pass for a
      // configuration that is no longer on disk — the precise false green this
      // suite exists to prevent.
      //
      // --strictPort so a busy 5173 is a loud failure rather than Vite quietly
      // moving to 5174 while Playwright talks to whatever answers on 5173.
      command: 'npm run dev -- --strictPort',
      url: VITE_ORIGIN,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
