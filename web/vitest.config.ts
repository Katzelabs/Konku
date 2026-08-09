import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Pin the timezone before any worker starts.
//
// Hard rule 5 says a session at 23:00 belongs to that day, and the bug it
// guards against — using toISOString() — only shows up in a timezone where
// local 23:00 has already rolled over in UTC. CI runs on UTC, where a broken
// implementation and a correct one agree exactly, so an unpinned suite would
// pass while testing nothing.
//
// America/New_York is chosen for being west of UTC, which makes the documented
// late-evening case the one that actually diverges. (East of UTC the
// equivalent risk is early morning instead; one run can only pin one zone, and
// the rule is written around the evening case.)
process.env.TZ = 'America/New_York'

// Separate from vite.config.ts on purpose: the app build writes into the Go
// package that embeds it (build.outDir), and a test run has no business
// touching internal/web/dist.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // The frontend had zero tests before this (D-063). Both of the last two
    // shipped bugs lived here, so the suite covers the parts where a bug is
    // silent rather than the parts that are easy to render.
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
