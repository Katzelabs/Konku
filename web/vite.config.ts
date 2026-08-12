import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Tailwind v4 runs as a Vite plugin, not through PostCSS. The design tokens
  // live in CSS (`@theme` in src/styles/theme.css) rather than a JS config —
  // that is the whole reason for being on v4 (see docs/DESIGN.md).
  plugins: [react(), tailwindcss()],

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
      //
      // changeOrigin MUST stay false, and it cannot be written as the string
      // shorthand: Vite expands `'/api': 'http://localhost:8080'` to
      // `{ target, changeOrigin: true }`, which rewrites the Host header to
      // the proxy target. The browser still sends Origin: http://localhost:5173,
      // so enforceOrigin (internal/api/security.go) compares 5173 against 8080,
      // decides the write is cross-site and answers 403 to every POST, PUT and
      // DELETE in dev. Passing Host through is what makes "same-origin in dev"
      // true rather than merely intended.
      '/api': { target: 'http://localhost:8080', changeOrigin: false },
    },
  },
})
