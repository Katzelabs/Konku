import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { test as base, expect } from '@playwright/test'

/**
 * A fresh account per test file.
 *
 * Each run seeds its own user rather than sharing one, so a test cannot depend
 * on residue from the last run — and so nothing here can touch the real
 * account in the dev database. The password goes in over stdin, never in argv:
 * `seed-user -password-stdin` exists for exactly this, and keeps the secret
 * out of `ps` and out of the Playwright report.
 */

export const PASSWORD = 'kata-sandi-e2e-yang-panjang'

const APP_DB =
  process.env.E2E_DATABASE_URL ??
  'postgres://konku_app:konku_app_dev@localhost:5433/konku?sslmode=disable'
const OWNER_DB =
  process.env.E2E_MIGRATION_DATABASE_URL ??
  'postgres://konku:konku@localhost:5433/konku?sslmode=disable'

export function seedAccount(): string {
  const email = `e2e-${randomUUID()}@example.com`

  execFileSync('./bin/konku', ['seed-user', '-email', email, '-password-stdin'], {
    cwd: '..',
    input: `${PASSWORD}\n`,
    env: {
      ...process.env,
      DATABASE_URL: APP_DB,
      MIGRATION_DATABASE_URL: OWNER_DB,
      DEV: 'true',
      METRICS_ADDR: '',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  return email
}

/**
 * Runs SQL as the database owner.
 *
 * The owner is a superuser and therefore bypasses RLS, which is exactly why
 * the application never connects as it (D-059). Test *setup* is the one place
 * that legitimately needs to reach past a policy.
 *
 * Two ways of getting there, because the database is reached differently in
 * the two places this suite runs: a `psql` client against the owner URL works
 * everywhere it is installed, including CI, where Postgres is a service
 * container and there is no compose project to exec into. `docker compose
 * exec` is the fallback for a laptop without a Postgres client.
 */
let usePsqlClient: boolean | undefined

function haveLocalPsql(): boolean {
  if (usePsqlClient === undefined) {
    try {
      execFileSync('psql', ['--version'], { stdio: 'ignore' })
      usePsqlClient = true
    } catch {
      usePsqlClient = false
    }
  }
  return usePsqlClient
}

function psql(sql: string) {
  if (haveLocalPsql()) {
    execFileSync('psql', [OWNER_DB, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    return
  }

  execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'db', 'psql', '-q', '-U', 'konku', '-d', 'konku', '-c', sql],
    { cwd: '..', stdio: ['ignore', 'ignore', 'pipe'] },
  )
}

/** Deletes the account and everything it cascades to. */
export function removeAccount(email: string) {
  psql(`DELETE FROM users WHERE email = '${email}'`)
}

/**
 * Fills an account past one page of notes (D-084).
 *
 * Written straight to the database rather than through the editor: this is
 * setup for a test about *reading* a long list, and 60 round trips through the
 * real editor would add a minute to the suite to arrive at the same state.
 * The titles are numbered from the newest backwards, so `catatan 00` is the
 * top row and the highest number is the one that only the last page holds.
 */
export function seedNotes(email: string, n: number) {
  psql(
    `INSERT INTO notes (user_id, title, content_md, created_at, updated_at)
     SELECT u.id,
            'catatan ' || to_char(i, 'FM00'),
            'isi',
            now() - make_interval(secs => i),
            now() - make_interval(secs => i)
       FROM users u, generate_series(0, ${n - 1}) AS i
      WHERE u.email = '${email}'`,
  )
}

/**
 * A saved review set with `n` finished sittings behind it.
 *
 * Straight to the database for the same reason seedNotes is: sixty sittings
 * driven through the real screens would take a minute to reach a state this
 * test only wants to read. The scores are all distinct — run i scored i out of
 * n — so a single row can be named, and the oldest sitting is the one only the
 * second page holds.
 */
export function seedReviewSetWithRuns(email: string, title: string, n: number) {
  psql(
    `WITH u AS (SELECT id FROM users WHERE email = '${email}'),
          s AS (
            INSERT INTO review_sets (user_id, title, selection, question_count, format)
            SELECT u.id, '${title}', 'random', 1, 'recall' FROM u
            RETURNING id, user_id
          )
     INSERT INTO review_runs (set_id, user_id, run_date, started_at, finished_at,
                              total_count, correct_count)
     SELECT s.id, s.user_id, CURRENT_DATE,
            now() - make_interval(secs => i + 1),
            now() - make_interval(secs => i),
            ${n}, i
       FROM s, generate_series(0, ${n - 1}) AS i`,
  )
}

/**
 * Brings this account's cards forward so they are due now.
 *
 * A card written today is scheduled for *tomorrow* — srs.Intervals[0] is 1,
 * because reviewing something ten seconds after writing it tests nothing. That
 * is correct product behaviour and it means the review screen cannot be
 * reached through the UI alone on the day a card is created. So the clock is
 * moved rather than the design: everything from the review screen onwards is
 * still driven through the real interface.
 */
export function makeCardsDue(email: string) {
  psql(
    `UPDATE card_schedules s SET next_review_date = CURRENT_DATE
       FROM users u WHERE u.email = '${email}' AND s.user_id = u.id`,
  )
}

interface Fixtures {
  email: string
}

export const test = base.extend<Fixtures, { account: string }>({
  email: async ({ page }, use) => {
    const email = seedAccount()

    // Sign in through the real form. There is no shortcut that sets a cookie
    // directly, on purpose: login is part of the loop being tested.
    await page.goto('/')
    await page.getByLabel('Email').fill(email)
    // Exact: the reveal toggle beside this input is labelled "Tampilkan kata
    // sandi", and getByLabel matches substrings, so the loose form now finds
    // two controls.
    await page.getByLabel('Kata sandi', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Masuk' }).click()
    await expect(page).toHaveURL(/\/home/)

    await use(email)

    removeAccount(email)
  },
})

export { expect }
