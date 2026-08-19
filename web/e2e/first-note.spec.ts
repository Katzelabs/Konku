import { expect, test } from './fixtures'

/**
 * The first note opens in the editor, even when the editor arrives late.
 *
 * The index hands over to the editor by navigating, but three things happen at
 * once: creating the note invalidates the list, the editor is `lazy()` (D-086),
 * and React Router runs the navigation as a transition — so the index stays
 * mounted and live while the editor's chunk is still in flight. If the refetch
 * lands inside that window it takes the list from empty to one row with nothing
 * peeked, which is the exact condition `useAutoSelect` answers: it replaces the
 * pending navigation with a peek at the same URL, and the new note opens in the
 * read-only preview with no field to type in.
 *
 * That window only opens when the list was empty, so this is a brand new
 * account writing its first note — the first thing the product does to
 * somebody, and a capture-cost failure (hard rule 7).
 *
 * It is here rather than in a unit test because the race is between a real
 * chunk and a real refetch, which is a thing only a browser has. The unit half
 * is `auto-select.test.tsx`, which guards the hook's contract; this is the half
 * that guards the wiring in NotesPage. Both, per hard rule 9.
 *
 * The delay is what makes it deterministic. Without it the chunk wins on any
 * developer machine and the bug is invisible until a loaded CI runner finds it
 * — which is how it shipped, and then sat in a red CI for six days.
 */
test('the first note opens in the editor when its chunk is slow', async ({
  page,
  email,
}) => {
  void email

  await page.goto('/notes')
  await expect(page.getByRole('button', { name: 'Catatan baru' })).toBeVisible()

  // Everything this screen needs is loaded by now, so this only slows what the
  // click goes on to fetch: the editor's chunk. The list refetch is an API call
  // and stays fast, which is the CI ordering exactly.
  await page.route('**/assets/**.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })

  await page.getByRole('button', { name: 'Catatan baru' }).click()
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}/)

  // The editor, not the peek. The peek renders the same note at the same URL
  // and has no title field, so this is the assertion that tells them apart.
  await expect(page.getByPlaceholder('Judul', { exact: true })).toBeVisible({
    timeout: 15_000,
  })

  // And it is a working editor, not just a mounted one.
  await page.getByPlaceholder('Judul', { exact: true }).fill('Catatan pertama')
  await expect(page.getByPlaceholder('Judul', { exact: true })).toHaveValue(
    'Catatan pertama',
  )
})
