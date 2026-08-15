/*
 * Generates the app icons from one description of the mark.
 *
 * `node scripts/icons.mjs`, run by hand and only when the mark changes — the
 * output is committed, so a build, a clone and CI never need this file. It
 * exists so the PNGs are reproducible: a home-screen icon has to be a raster
 * (iOS ignores SVG for apple-touch-icon), and a raster nobody can regenerate
 * is a binary blob that quietly becomes wrong the day the accent changes.
 *
 * Node stdlib only — zlib and a CRC table are the whole of a PNG encoder, and
 * an image library would be a dependency with no production obligation behind
 * it (D-065).
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// indigo-600, the `--primary` of the light theme (styles/theme.css). The icon
// does not follow the theme: a home-screen shortcut is a fixed image, and one
// that matched the dark palette would be a different-looking app on half the
// phones.
const INK = [0x4f, 0x46, 0xe5]
const PAPER = [0xff, 0xff, 0xff]

/*
 * The mark, in unit coordinates: a K with a round-capped stem and two arms
 * meeting just left of centre. Everything below is drawn from these numbers,
 * the SVG included, so the vector and the rasters cannot drift apart.
 */
const RADIUS = 0.22 // corner radius of the tile
const STROKE = 0.108 // full width of a limb
const STEM = [0.325, 0.265, 0.325, 0.735]
const UPPER = [0.7, 0.265, 0.4, 0.5]
const LOWER = [0.4, 0.5, 0.715, 0.735]
const LIMBS = [STEM, UPPER, LOWER]

/** Distance from a point to a line segment, in unit coordinates. */
function distToSegment(x, y, [x1, y1, x2, y2]) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

/** Inside the rounded tile? */
function inTile(x, y, bleed) {
  // A maskable icon is cropped to whatever shape the launcher wants — a
  // circle, a squircle, a rounded square of its own choosing. Rounding the
  // corners ourselves would put a transparent notch inside that crop, so this
  // variant is a full square and the launcher does the shaping. The mark sits
  // inside the inner 80%, which is the safe zone that survives every crop.
  if (bleed) return true
  const cx = Math.min(Math.max(x, RADIUS), 1 - RADIUS)
  const cy = Math.min(Math.max(y, RADIUS), 1 - RADIUS)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= RADIUS * RADIUS
}

/** Inside any limb of the K? */
function inMark(x, y) {
  return LIMBS.some((limb) => distToSegment(x, y, limb) <= STROKE / 2)
}

/**
 * Rasterise at `size` px, 4x4 supersampled.
 *
 * The alpha comes out of the tile's own coverage, so the corners are round
 * against whatever the launcher puts behind them rather than against a colour
 * guessed here.
 */
function raster(size, bleed = false) {
  const px = Buffer.alloc(size * size * 4)
  const S = 4
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S) / size
          const v = (y + (sy + 0.5) / S) / size
          if (!inTile(u, v, bleed)) continue
          const c = inMark(u, v) ? PAPER : INK
          r += c[0]
          g += c[1]
          b += c[2]
          a += 255
        }
      }
      const n = S * S
      const i = (y * size + x) * 4
      // Straight (un-premultiplied) alpha: the colour is the average of the
      // samples that landed on the tile, not of all of them, or every edge
      // pixel would be darkened by the transparent ones beside it.
      const covered = a / 255
      px[i] = covered ? Math.round(r / covered) : 0
      px[i + 1] = covered ? Math.round(g / covered) : 0
      px[i + 2] = covered ? Math.round(b / covered) : 0
      px[i + 3] = Math.round(a / n)
    }
  }
  return px
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

function png(size, bleed = false) {
  const px = raster(size, bleed)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  // Filter byte 0 on every scanline: these are tiny images and deflate does
  // the work. A filter search would be code with nothing to say.
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    px.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function svg() {
  const d = LIMBS.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">
  <rect width="1" height="1" rx="${RADIUS}" fill="#4f46e5"/>
  <path d="${d}" stroke="#fff" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
`
}

writeFileSync(join(publicDir, 'favicon.svg'), svg())
// 180 is what iOS asks for; 192 and 512 are what a web app manifest wants.
for (const size of [180, 192, 512]) {
  writeFileSync(join(publicDir, `icon-${size}.png`), png(size))
}
writeFileSync(join(publicDir, 'icon-maskable-512.png'), png(512, true))
// A raster favicon as well as the SVG one: Safari only grew SVG favicon
// support recently, and the fallback is two kilobytes.
writeFileSync(join(publicDir, 'favicon-32.png'), png(32))
console.log('wrote favicon.svg, favicon-32.png, icon-180/192/512.png, icon-maskable-512.png')
