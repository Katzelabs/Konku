import { expect, makeCardsDue, test } from './fixtures'

/**
 * The core loop, end to end (06 P6):
 *
 *   sign in -> write a note -> write a card -> review it (reveal, then rate)
 *   -> run a session -> capture at session end
 *
 * Nothing else. The value of this tier is that it catches the things unit
 * tests structurally cannot — a broken build, a missing embedded asset, a CSP
 * that blocks the bundle, an origin check that rejects the app's own writes —
 * and every test added beyond the core loop is one more thing to keep green
 * for a smaller return.
 */

test.describe('the core loop', () => {
  test('sign in lands on home', async ({ page, email }) => {
    // The `email` fixture has already signed in through the real form.
    expect(email).toContain('@example.com')
    await expect(page).toHaveURL(/\/home/)
  })

  test('write a note and it survives a reload', async ({ page, email }) => {
    void email

    await page.goto('/notes')
    await page.getByRole('button', { name: 'Catatan baru' }).click()
    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}/)

    await page.getByPlaceholder('Judul', { exact: true }).fill('Catatan dari e2e')
    await page.getByPlaceholder('Tulis di sini…').fill('Isi catatan yang ditulis oleh e2e.')
    await page.getByRole('button', { name: 'Simpan' }).click()

    // Wait for the editor's own "Tersimpan", not for a timeout. Navigating
    // away the instant after clicking races the PATCH, and the resulting
    // failure looks like a broken save rather than a broken test.
    await expect(page.getByText('Tersimpan', { exact: true })).toBeVisible()

    // A save that only lives in React state is not a save. Reloading is what
    // proves it reached the database and came back.
    await page.reload()
    await expect(page.getByPlaceholder('Judul', { exact: true })).toHaveValue('Catatan dari e2e')

    await page.goto('/notes')
    await expect(page.getByText('Catatan dari e2e')).toBeVisible()
  })

  test('write a card, review it, and rating advances the queue', async ({ page, email }) => {

    await page.goto('/cards/new')
    await page.getByPlaceholder('Apa itu prior?').fill('Ibu kota Indonesia?')
    await page.getByPlaceholder('Keyakinan awal sebelum melihat data.').fill('Jakarta')
    await page.getByRole('button', { name: 'Simpan' }).click()

    // Creating a card redirects to its own page. Waiting for that is what
    // makes the save complete rather than in flight.
    await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}/)

    await page.goto('/cards')
    await expect(page.getByText('Ibu kota Indonesia?')).toBeVisible()

    // A card written today is due tomorrow (srs.Intervals[0] is 1), so bring
    // it forward. Everything after this point is the real interface.
    makeCardsDue(email)

    // /review/due, not /review: since D-075 the bare route is the review-sets
    // home and the due queue moved under it. This test is about recall before
    // reveal and about a rating advancing the queue, so it goes straight to
    // the screen that does both rather than asserting the new landing page's
    // shape as a side effect.
    await page.goto('/review/due')
    await expect(page.getByText('Ibu kota Indonesia?')).toBeVisible()

    // Recall before reveal is the whole design: the answer must not be on
    // screen until it is asked for (D-011). If it were, the review would be
    // recognition rather than recall and the schedule would mean nothing.
    await expect(page.getByText('Jakarta')).toBeHidden()

    await page.getByRole('button', { name: 'Tampilkan jawaban' }).click()
    await expect(page.getByText('Jakarta')).toBeVisible()

    await page.getByRole('button', { name: 'Ingat', exact: true }).click()

    // One card, rated: the queue is empty and says so without scolding.
    await expect(page.getByRole('button', { name: 'Tampilkan jawaban' })).toBeHidden()
  })

  test('a finished session asks what was learned, and the answer is kept', async ({
    page,
    email,
  }) => {
    void email

    // The shortest session is fifteen minutes, so the end state is seeded
    // rather than waited for. What is under test is the capture prompt and the
    // write behind it — not setInterval. The stored shape is the timer's own,
    // and useTimer.test.ts covers the transitions that produce it.
    await page.goto('/timer')
    await page.evaluate(() => {
      localStorage.setItem(
        'konku.timer',
        JSON.stringify({
          status: 'running',
          durationMinutes: 20,
          domainId: null,
          targetAt: Date.now() - 1000, // ended a second ago
          remainingMs: null,
          logged: false,
        }),
      )
    })
    await page.reload()

    // D-036: the prompt is the single mechanism the MVP exists to test, and it
    // must appear wherever you were when the session ended.
    await expect(page.getByText('Apa yang kamu pelajari?')).toBeVisible()

    await page.getByPlaceholder('Satu baris saja cukup.').fill('Belajar RLS di Postgres.')
    await page.getByRole('button', { name: 'Simpan' }).click()

    await expect(page.getByText('Apa yang kamu pelajari?')).toBeHidden()

    // The capture becomes a note, which is the point of asking.
    await page.goto('/notes')
    await expect(page.getByText('Belajar RLS di Postgres.')).toBeVisible()
  })

  test('the session is recorded in the log', async ({ page, email }) => {
    void email

    await page.goto('/timer')
    await page.evaluate(() => {
      localStorage.setItem(
        'konku.timer',
        JSON.stringify({
          status: 'running',
          durationMinutes: 20,
          domainId: null,
          targetAt: Date.now() - 1000,
          remainingMs: null,
          logged: false,
        }),
      )
    })
    await page.reload()

    await expect(page.getByText('Apa yang kamu pelajari?')).toBeVisible()
    // "Lewati" is an equal option, not a lesser one — skipping still logs the
    // session, because the session happened (GOALS.md, rule 6).
    await page.getByRole('button', { name: 'Lewati' }).click()

    await expect(page.getByText('Apa yang kamu pelajari?')).toBeHidden()
    await expect(page.getByText('20').first()).toBeVisible()
  })
})

/**
 * The build-level guarantees, which only an end-to-end run can see.
 */
test.describe('the served application', () => {
  test('runs with no CSP violations and no console errors', async ({ page, email }) => {
    void email

    const problems: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(msg.text())
    })
    page.on('pageerror', (err) => problems.push(String(err)))

    for (const path of ['/home', '/notes', '/cards', '/review', '/timer', '/domains']) {
      await page.goto(path)
      await expect(page.locator('#root')).not.toBeEmpty()
    }

    // Strict CSP with no unsafe-inline (D-060). A violation surfaces here as a
    // console error, and React failing to mount would empty #root above.
    expect(problems.filter((p) => /content security policy|refused to/i.test(p))).toEqual([])
    expect(problems).toEqual([])
  })

  test('a deep link is served by the SPA fallback, not a 404', async ({ page, email }) => {
    void email

    // go:embed + the SPA fallback: reloading a client-side route has to return
    // the shell rather than 404, or every bookmark breaks.
    const res = await page.goto('/notes')
    expect(res?.status()).toBe(200)
    await expect(page.locator('#root')).not.toBeEmpty()
  })
})
