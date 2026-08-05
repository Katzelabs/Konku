import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  build: {
    // Write straight into the Go package that embeds it. go:embed cannot
    // reach outside its module, and having the module at the repo root means
    // no copy step and no stale-dist bugs (D-032).
    outDir: '../internal/web/dist',
    emptyOutDir: true,
  },

  server: {
    port: 5173,
    proxy: {
      // Not just convenience: the proxy keeps development same-origin, so
      // session cookies behave identically in dev and prod. Pointing the app
      // straight at localhost:8080 would reintroduce the CORS problems that
      // D-040 exists to avoid.
      '/api': 'http://localhost:8080',
    },
  },
})
