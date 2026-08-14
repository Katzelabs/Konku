import { expect, test as base } from '@playwright/test'
import { PASSWORD, removeAccount, seedAccount } from '../e2e/fixtures'

/**
 * The dev proxy passes a write through, and still refuses a cross-site one.
 *
 * Two tests, and the second is the reason this file is not one line longer
 * than it needs to be. Asserting only that login works through Vite would be
 * satisfied by deleting enforceOrigin — the fastest way to make a stubborn 403
 * go away, and a real one, since the middleware is the thing that appears to
 * be in the way. So the same proxy, on the same port, in the same run, must
 * also still reject a forged Origin. A change that breaks either half fails
 * here.
 *
 * Login stands in for every state-changing request. enforceOrigin runs above
 * the router (server.go) and never looks at the path, so there is no route
 * whose treatment differs — including `/api/auth/signup`, the one this was
 * first reported against.
 */

// The bare test, not the signed-in fixture from ../e2e/fixtures: the whole
// question here is whether signing in through the proxy works at all, and a
// fixture that signs in during setup would report the failure as a broken
// fixture rather than a failed assertion.
const test = base.extend<{ email: string }>({
  email: async ({}, use) => {
    const email = seedAccount()
    await use(email)
    removeAccount(email)
  },
})

test.describe('the dev proxy', () => {
  test('passes a same-origin write through to the API', async ({ page, email }) => {
    await page.goto('/')

    const login = page.waitForResponse(
      (res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST',
    )

    await page.getByLabel('Email').fill(email)
    // exact, because the reveal toggle beside the field is labelled
    // "Tampilkan kata sandi" and a substring match resolves to both.
    await page.getByLabel('Kata sandi', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Masuk' }).click()

    // Asserted before the URL, because the status is the diagnostic one. A
    // failure here says "the proxy rewrote something"; a failure on the URL
    // alone says "login is broken" and sends the next person into the auth
    // code, which is where this bug was not.
    const res = await login
    expect(
      res.status(),
      'POST /api/auth/login through the Vite proxy was rejected. A 403 here means ' +
        'the proxy changed the Host header and enforceOrigin read the request as ' +
        'cross-site: check that server.proxy in vite.config.ts still sets ' +
        'changeOrigin: false. Vite turns the string shorthand into changeOrigin: true.',
    ).toBe(200)

    await expect(page).toHaveURL(/\/home/)
  })

  test('still refuses a write stamped with someone else’s origin', async ({ request, email }) => {
    // Playwright's request context is not a browser, so it can send an Origin
    // the browser would never let a page forge. That is what makes this the
    // control: the request reaches the API through the identical proxy hop.
    const res = await request.post('/api/auth/login', {
      headers: { Origin: 'http://situs-lain.example', 'Content-Type': 'application/json' },
      data: { email, password: PASSWORD },
    })

    expect(
      res.status(),
      'a cross-origin POST through the dev proxy was NOT refused — enforceOrigin is ' +
        'either gone or no longer reached in development.',
    ).toBe(403)

    // Pins it to the origin check rather than any other 403 the API can
    // produce: an unverified account answers 403 too, and a test that only
    // counted the status would pass on that instead.
    const body = await res.json()
    expect(body.error.message).toContain('situs lain')
  })
})
