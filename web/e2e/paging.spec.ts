import { expect, seedNotes, seedReviewSetWithRuns, test } from './fixtures'

/**
 * A long list is reachable to the end (D-084).
 *
 * This is the second half of the guard; the first is TestListsPageAndReportTheRealTotal
 * in internal/api, which proves the endpoint pages. That one passing while the
 * screen still asks for a single page would leave the bug exactly where it
 * was, because the bug was never in one layer: the endpoint truncated, the
 * client never asked for more, and the header stated the truncation as the
 * total.
 *
 * 60 notes, so the default page of 50 cannot hold them.
 */

const SEEDED = 60

test.describe('a list longer than one page', () => {
  test('states the real total and loads the rest on request', async ({ page, email }) => {
    seedNotes(email, SEEDED)

    await page.goto('/notes')

    // The header counts the collection. It used to count the loaded array,
    // which is how an account with 300 notes was told it had 50.
    await expect(page.getByText(`${SEEDED} catatan`)).toBeVisible()

    // The last note is on the second page, so it is not here yet…
    const buried = page.getByRole('button', { name: /catatan 59/ })
    await expect(buried).toHaveCount(0)

    // …and one press of the button is what fetches it. The remaining count is
    // on the button itself: 60 seeded, 50 shown, 10 left.
    const more = page.getByRole('button', { name: /Muat lebih banyak/ })
    await expect(more).toContainText('10 catatan lagi')
    await more.click()

    await expect(buried).toBeVisible()

    // Nothing left to load, so the button goes; the total never moved.
    await expect(more).toHaveCount(0)
    await expect(page.getByText(`${SEEDED} catatan`)).toBeVisible()
  })

  test('search reaches a note that is not on the first page', async ({ page, email }) => {
    seedNotes(email, SEEDED)

    await page.goto('/notes')
    await expect(page.getByText(`${SEEDED} catatan`)).toBeVisible()

    // The search box filtered the loaded rows before D-084, so this title —
    // which lives on page 2 — came back as "no match" and looked exactly like
    // a note that had never been written.
    // The list's own box, not the top bar's — both write the same `?q=`, and
    // a loose match finds two.
    await page.getByPlaceholder('Cari judul…', { exact: true }).fill('catatan 59')

    await expect(page.getByRole('button', { name: /catatan 59/ })).toBeVisible()
    await expect(page.getByText('1 catatan')).toBeVisible()
  })
})

/**
 * A set's history is reachable to the end.
 *
 * The Go half is TestRunHistoryPagesPastTheOldCap. This is the other layer,
 * for the same reason the notes guard has two: the bug was never in one of
 * them. `runsPerPage = 20` was a constant in the handler with no page after
 * it, and the screen rendered whatever list arrived — so the twenty-first
 * sitting of a set was counted in the header, written to the export, and
 * shown nowhere.
 */
test.describe('a run history longer than one page', () => {
  test('states the real count and loads the rest on request', async ({ page, email }) => {
    seedReviewSetWithRuns(email, 'Latihan panjang', SEEDED)

    await page.goto('/review')
    await page.getByRole('link', { name: /Latihan panjang/ }).click()

    // The heading counts every sitting, not the page of them that loaded.
    await expect(page.getByText(`${SEEDED}× dikerjakan`)).toBeVisible()

    // The oldest sitting scored 59 out of 60 and sits last in a newest-first
    // list, so it is on the second page — which nothing could ask for before.
    const oldest = page.getByText(`${SEEDED - 1} / ${SEEDED}`, { exact: true })
    await expect(oldest).toHaveCount(0)

    const more = page.getByRole('button', { name: /Muat lebih banyak/ })
    await expect(more).toContainText('10 percobaan lagi')
    await more.click()

    await expect(oldest).toBeVisible()
    await expect(more).toHaveCount(0)
    await expect(page.getByText(`${SEEDED}× dikerjakan`)).toBeVisible()
  })
})
