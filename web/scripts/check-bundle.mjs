/*
 * What a signed-out visitor downloads before anything renders.
 *
 * Run after `npm run build`; CI does both. The code splitting in App.tsx is
 * the mechanism, and this is the second one (hard rule 9): a `lazy()` turned
 * back into a static import is a one-line change that nothing else notices,
 * and its whole cost is paid by whoever opens the login screen on mobile data.
 *
 * The budget counts the entry chunk plus everything the browser is told to
 * preload for it — which is exactly the set that has to arrive before React
 * mounts. Route chunks are not counted: they are the point.
 */
import { gzipSync } from 'node:zlib'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Measured at 124 kB gzipped when the split landed (F-09), down from 241 kB
// as one chunk. The headroom is for ordinary growth; a re-added static import
// of any screen costs far more than it.
const BUDGET_KB = 140

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'internal', 'web', 'dist')

let html
try {
  html = readFileSync(join(dist, 'index.html'), 'utf8')
} catch {
  console.error('check-bundle: no build found. Run `npm run build` first.')
  process.exit(1)
}

const entry = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1])
const preload = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map(
  (m) => m[1],
)

const files = [...entry, ...preload]
if (files.length === 0) {
  // A silent zero would pass forever. If the tags ever change shape, that is
  // a broken check, not a small bundle.
  console.error('check-bundle: found no entry script in index.html.')
  process.exit(1)
}

let total = 0
const rows = files.map((href) => {
  const path = join(dist, href.replace(/^\//, ''))
  const raw = statSync(path).size
  const gzip = gzipSync(readFileSync(path), { level: 9 }).length
  total += gzip
  return { href, raw, gzip }
})

const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' kB'
for (const r of rows) console.log(`${kb(r.gzip)} gzip  ${kb(r.raw)} raw   ${r.href}`)
console.log(`${kb(total)} gzip  entry total (budget ${BUDGET_KB} kB)`)

if (total > BUDGET_KB * 1024) {
  console.error(
    `\ncheck-bundle: the signed-out entry is over budget.\n` +
      `Something the login screen does not need is being imported eagerly —\n` +
      `check App.tsx for a screen that stopped being lazy().`,
  )
  process.exit(1)
}
