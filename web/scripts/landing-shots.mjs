/**
 * Capture the product screenshots the landing page imports by name.
 *
 * Ten files — five screens x two themes — into the landing repo's
 * src/assets/screenshots/. The names are fixed there by SHOTS in consts.ts and
 * a missing one is a build error, which is the intent.
 *
 *   node scripts/landing-shots.mjs [--out DIR] [--base URL]
 *
 * Needs the dev stack up (`make db-up`, `make dev-api`, `make dev-web`) and the
 * demo account seeded (`go run ./cmd/konku seed-demo`). Nothing here retouches
 * anything: every pixel is the running application against seeded content.
 *
 * Two properties this script exists to guarantee, both of which a human taking
 * ten screenshots by hand gets wrong:
 *
 *  1. The light and dark file of a pair is the *same screen in the same state*.
 *     Theme is set in localStorage before the first paint (web/public/theme.js
 *     is a blocking classic script, so a reload is enough and there is no flash
 *     to wait out), and every screen is driven to its state by the same code in
 *     both passes. The timer goes further and freezes Date.now, because a
 *     countdown photographed twice is otherwise two different readings.
 *
 *  2. review-recall shows the prompt with the answer still hidden. The section
 *     beside that image claims the server does not send the answer with the
 *     prompt; the script asserts the reveal button is still there and that no
 *     card back reached the page, and refuses to write the file otherwise.
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
}

const BASE = args.get('base') ?? 'http://localhost:5173'
const OUT =
  args.get('out') ??
  path.resolve(
    process.cwd(),
    '../../konku-landing/src/assets/screenshots',
  )

const EMAIL = args.get('email') ?? 'demo@konku.app'
const PASSWORD = process.env.SHOTS_PASSWORD ?? 'demo-shots-2026-pass'

const VIEWPORT = { width: 1440, height: 900 }
const SCALE = 2

/** Remaining on the timer, in ms: a 20-minute session with 13:41 left. */
const TIMER_REMAINING_MS = 13 * 60_000 + 41_000

/** Which domain the running session is tagged with, by label. */
const TIMER_DOMAIN = 'Coding'

/**
 * The instant the timer page is told it is, in both passes.
 *
 * Fixed here rather than read inside the page, because the light and dark
 * captures happen half a minute apart and the panel beside the ring states the
 * clock time the session will end at. Two files that disagree about that read
 * as a glitch when the browser swaps them, exactly as two different countdowns
 * would.
 */
const FROZEN = Date.now()

const THEMES = ['light', 'dark']

/**
 * The five screens, in the order they are captured.
 *
 * A list rather than five calls, so `--only` can take a subset. Recapturing one
 * pair is the common case after a fix lands in the app: re-running all five to
 * change one is slower and rewrites eight files that were already signed off.
 */
const SCREENS = [
  ['review-recall', reviewRecall],
  ['notes-list', notesList],
  ['card-flip', cardFlip],
  ['review-home', reviewHome],
  ['timer-running', timerRunning],
]

const only = args.get('only')
const wanted = new Set(only ? only.split(',').map((n) => n.trim()) : SCREENS.map(([n]) => n))
for (const name of wanted) {
  if (!SCREENS.some(([n]) => n === name)) {
    throw new Error(`--only: unknown screen "${name}"`)
  }
}

/**
 * What each screen said, per theme, so the pair can be compared afterwards.
 *
 * The rendered text of the two files of a pair has to be identical. Every
 * screen here is driven by the same code in both passes, but "driven the same"
 * is not "landed the same" — the dark pass of one run photographed the note the
 * light pass had already navigated away from, because it waited on the URL and
 * the URL is not the picture. Text is the cheapest thing that would have caught
 * it, and it catches a stale count or a rolled-over clock too.
 */
const rendered = new Map()

async function main() {
  await mkdir(OUT, { recursive: true })

  const browser = await chromium.launch()
  const written = []

  try {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        colorScheme: theme,
        reducedMotion: 'reduce',
      })

      // theme.js reads this before the first paint. The view-mode keys are the
      // localStorage fallback behind ?view=, set so the two agree.
      await context.addInitScript((t) => {
        try {
          localStorage.setItem('konku.theme', t)
          localStorage.setItem('konku:notes-view', 'list')
          localStorage.setItem('konku:cards-view', 'list')
        } catch {
          /* nothing to do; the page has a default */
        }
      }, theme)

      await signIn(context)

      const page = await context.newPage()

      for (const [name, capture] of SCREENS) {
        if (!wanted.has(name)) continue
        // timerRunning needs its own page, so it takes the context.
        written.push(await capture(name === 'timer-running' ? context : page, theme))
      }

      await context.close()
    }
  } finally {
    await browser.close()
  }

  comparePairs()

  console.log('\nWrote:')
  for (const f of written) console.log('  ' + f)
}

/**
 * Sign in through the API rather than the form.
 *
 * The context's request shares its cookie jar with the pages, so the session
 * cookie is in place before the first navigation — which keeps every capture
 * from starting on the login screen. Origin is explicit because enforceOrigin
 * reads every write as cross-site without it.
 */
async function signIn(context) {
  const res = await context.request.post(`${BASE}/api/auth/login`, {
    headers: { Origin: BASE, 'Content-Type': 'application/json' },
    data: { email: EMAIL, password: PASSWORD },
  })
  if (!res.ok()) {
    throw new Error(`login failed: ${res.status()} ${await res.text()}`)
  }
  const me = await res.json()
  if (me.email !== EMAIL) {
    throw new Error(`signed in as ${me.email}, expected ${EMAIL}`)
  }
}

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  // The spinner is what the first paint of every screen is; nothing should be
  // left by the time a capture is taken.
  await page.locator('[role="status"]').first().waitFor({ state: 'detached' }).catch(() => {})
  // Two frames, so anything React scheduled has been committed and painted
  // before the capture rather than one tick after it.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  )
}

/**
 * Height bounds for the fitted viewport, in CSS pixels.
 *
 * MIN keeps a screen from being cropped so tight it reads as a cropped
 * fragment rather than an application; MAX is the nominal 900 and nothing is
 * ever made taller than it.
 *
 * MIN was 560, and on the review screen it was the thing setting the height:
 * that content ends at 420, so the floor was holding 140px of empty surface
 * open under the hero image of the whole page. A floor that decides the answer
 * is not a floor. 400 sits under every screen here, which puts the padding
 * back in charge and leaves MIN doing only the job it is named for.
 */
const FIT_MIN = 400
const FIT_MAX = VIEWPORT.height
/** Breathing room under the last element of the page's own content. */
const FIT_PAD = 72

/**
 * Shrink the viewport to the content before capturing.
 *
 * Every one of these screens is a short column in a 900px window, so a fixed
 * viewport gave captures that were 50-60% empty surface — the review screen
 * worst of all, and that one is the landing page's hero. Cropping the PNG
 * afterwards would do it at the wrong moment: the border radii and the 2x
 * pixel density come from the browser, not from the file.
 *
 * The measurement is `<main>`'s own content bottom, not `body.scrollHeight` —
 * the sidebar is full-height by design and pins Pengaturan to its foot, so
 * body height is always the viewport and would measure nothing. Re-pinning
 * happens for free once the viewport changes.
 */
async function fitViewport(page) {
  const bottom = await page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body
    let low = 0
    for (const el of main.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      // Skip anything not laid out, and anything the sidebar pins low.
      if (r.width === 0 && r.height === 0) continue
      low = Math.max(low, r.bottom)
    }
    return Math.ceil(low)
  })

  const height = Math.min(FIT_MAX, Math.max(FIT_MIN, bottom + FIT_PAD))
  if (height !== page.viewportSize()?.height) {
    await page.setViewportSize({ width: VIEWPORT.width, height })
    // One frame for the sidebar to re-pin against the new height.
    await page.waitForTimeout(120)
  }
  return { height, bottom }
}

/**
 * Fail if the two files of a pair are not the same screen in the same state.
 */
function comparePairs() {
  const names = [...new Set([...rendered.keys()].map((k) => k.split('\u0000')[0]))]
  const mismatched = names.filter(
    (n) => rendered.get(`${n}\u0000light`) !== rendered.get(`${n}\u0000dark`),
  )
  if (mismatched.length) {
    for (const n of mismatched) {
      console.error(`\n${n}: the light and dark captures show different content`)
      console.error('  light:', JSON.stringify(rendered.get(`${n}\u0000light`)?.slice(0, 400)))
      console.error('  dark: ', JSON.stringify(rendered.get(`${n}\u0000dark`)?.slice(0, 400)))
    }
    throw new Error(`mismatched pairs: ${mismatched.join(', ')}`)
  }
  console.log(
    `\nAll ${names.length} captured pair${names.length === 1 ? '' : 's'}` +
      ' render identical text in both themes.',
  )
}

async function shot(page, name, theme) {
  const file = path.join(OUT, `${name}-${theme}.png`)
  await guardNoEmail(page)
  rendered.set(
    `${name}\u0000${theme}`,
    await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim()),
  )
  const { height, bottom } = await fitViewport(page)
  await page.screenshot({ path: file, animations: 'disabled' })
  const slack = height - bottom
  console.log(
    `  ${name}-${theme}: ${VIEWPORT.width}x${height}` +
      ` (content ends at ${bottom}, ${slack}px of slack below it)`,
  )
  // Restore, so the next screen measures from the nominal window rather than
  // from whatever the previous one happened to need.
  await page.setViewportSize(VIEWPORT)
  return file
}

/**
 * No address in a PNG.
 *
 * The account menu is the only place the app renders an email, and it is a
 * closed dropdown on every screen here — but "should be closed" is not a check.
 * This asserts on the rendered text of the whole page instead, so a menu left
 * open, a debug panel or a seeded note that happens to contain an address all
 * fail the same way.
 */
async function guardNoEmail(page) {
  const text = await page.evaluate(() => document.body.innerText)
  const found = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g)
  if (found) {
    throw new Error(`an email address is visible on screen: ${found.join(', ')}`)
  }
}

/* ---------------------------------------------------------------- screens */

/**
 * The hero: a due card's prompt, answer still hidden.
 *
 * Stops at the reveal. Two assertions before the file is written — the reveal
 * button is still on screen, and the card's back is not anywhere in the DOM.
 * The second one is the real check: recall-before-reveal is the server refusing
 * to send the answer (D-003), and a hidden-but-present answer would falsify the
 * claim this image sits beside without changing a pixel.
 */
async function reviewRecall(page, theme) {
  await page.goto(`${BASE}/review/due`)
  await settle(page)

  const reveal = page.getByRole('button', { name: 'Tampilkan jawaban' })
  await reveal.waitFor({ state: 'visible' })

  const prompt = (await page.locator('main p').first().innerText()).trim()
  if (!prompt) throw new Error('review-recall: no prompt on screen')

  // The card on screen is the first one the due queue handed out. Ask for its
  // back down a separate channel and check the page does not contain it.
  const due = await page.request.get(`${BASE}/api/review/due`)
  const shown = (await due.json()).cards.find((c) => c.front.trim() === prompt)
  if (!shown) throw new Error(`review-recall: no due card matches the prompt "${prompt}"`)

  const full = await page.request.get(`${BASE}/api/cards/${shown.id}`)
  const back = (await full.json()).back
  if (!back) throw new Error('review-recall: could not read the card back to check against')

  const html = await page.content()
  if (html.includes(back)) {
    throw new Error('review-recall: the answer is present in the DOM')
  }

  console.log(
    `review-recall (${theme}): prompt "${prompt}" — reveal button present, back absent from the DOM`,
  )
  return shot(page, 'review-recall', theme)
}

/**
 * The list column beside an open note's preview.
 *
 * List view opens its top row on arrival (useAutoSelect), and the top row is
 * whatever was written last — which on this account is an empty untitled note,
 * a preview that shows nothing about the product. So it opens the newest note
 * that actually has a title, the way a person landing here would. Which note
 * is chosen comes from the API rather than a hardcoded string, so the pair
 * stays in step and the script survives a reseed.
 */
async function notesList(page, theme) {
  await page.goto(`${BASE}/notes?view=list`)
  await settle(page)
  await page.waitForURL(/\/notes\/[0-9a-f-]{36}/)

  const res = await page.request.get(`${BASE}/api/notes?limit=50`)
  const titled = (await res.json()).items.find(
    (n) => n.title && n.title !== 'Tanpa judul' && n.domainId,
  )
  if (!titled) throw new Error('notes-list: no titled note to open')

  await page.getByRole('button', { name: titled.title }).click()
  await page.waitForURL(`**/notes/${titled.id}`)
  // The URL is not the picture. It changes in the same tick as the click, and
  // the preview behind it is a fresh fetch and a re-render — the dark pass of
  // an earlier run photographed the previous note because it waited on the URL
  // and nothing else. Wait for the heading the preview actually paints.
  await page
    .getByRole('heading', { level: 1, name: titled.title })
    .waitFor({ state: 'visible' })
  await settle(page)

  console.log(`notes-list (${theme}): opened "${titled.title}"`)
  return shot(page, 'notes-list', theme)
}

/** A peeked card, front face. The flashcard starts on its front. */
async function cardFlip(page, theme) {
  await page.goto(`${BASE}/cards?view=list`)
  await settle(page)
  await page.waitForURL(/\/cards\/[0-9a-f-]{36}/)

  // The peek is a fetch behind the URL, so wait on what it paints: the front
  // of the card auto-select opened, and the control that would turn it over —
  // which is still offering the back, i.e. the front is the face on show.
  const top = (await (await page.request.get(`${BASE}/api/cards?limit=1`)).json()).items[0]
  if (!top) throw new Error('card-flip: no cards on the account')
  await page.getByText(top.front, { exact: true }).first().waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Lihat jawaban' }).waitFor({ state: 'visible' })
  await settle(page)

  console.log(`card-flip (${theme}): front face of "${top.front}"`)
  return shot(page, 'card-flip', theme)
}

/** "Ulangan hari ini" with the due count, above the saved latihan. */
async function reviewHome(page, theme) {
  await page.goto(`${BASE}/review`)
  await settle(page)
  await page.getByRole('heading', { name: 'Latihan' }).waitFor({ state: 'visible' })
  return shot(page, 'review-home', theme)
}

/**
 * A session running, mid-countdown — and the same reading in both themes.
 *
 * The timer is driven from a wall-clock target rather than a decrementing
 * counter (useTimer), so the state it restores from is one instant in
 * localStorage. Freezing Date.now to the moment the page initialises and
 * writing a target relative to that frozen value makes the reading a constant:
 * both files show 13:41 of a 20-minute session, which is what keeps the pair
 * from reading as a glitch when the browser swaps them.
 *
 * Its own page, because the freeze must be installed before anything runs.
 */
async function timerRunning(context, theme) {
  // Tagged with a domain, because an untagged session shows "Tanpa domain" and
  // says nothing about what the field is for. Resolved by label so the id is
  // never pasted in here.
  const domains = await (await context.request.get(`${BASE}/api/domains`)).json()
  const domain = domains.find((d) => d.label === TIMER_DOMAIN && !d.archivedAt)
  if (!domain) throw new Error(`timer-running: no domain labelled ${TIMER_DOMAIN}`)

  const page = await context.newPage()
  await page.addInitScript(
    ({ frozen, remaining, domainId }) => {
      Date.now = () => frozen
      try {
        localStorage.setItem(
          'konku.timer',
          JSON.stringify({
            status: 'running',
            durationMinutes: 20,
            domainId,
            targetAt: frozen + remaining,
            remainingMs: null,
            logged: false,
          }),
        )
      } catch {
        /* the page falls back to idle, and the assertion below catches it */
      }
    },
    { frozen: FROZEN, remaining: TIMER_REMAINING_MS, domainId: domain.id },
  )

  await page.goto(`${BASE}/timer`)
  await settle(page)

  const reading = await page.getByText(/^\d+:\d\d$/).first().innerText()
  if (reading !== '13:41') {
    throw new Error(`timer-running: expected 13:41 on the clock, got ${reading}`)
  }
  await page.getByRole('button', { name: 'Jeda' }).waitFor({ state: 'visible' })

  const file = await shot(page, 'timer-running', theme)
  await page.close()
  return file
}

await main()
