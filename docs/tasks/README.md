# Tasks

Execution plan.

**Rescoped 2026-08-24** (D-093 – D-100). The app is deployed and hardened;
`06`, `07` L1–L9, `08` and `09` are done and `04` S1–S3 are done. What changed
is not the bar but the *audience*: Konku is a free, open, bilingual product now,
and tickets `10`–`15` are the work that follows from that. The old `07`
L10 — one line reading "flip `ALLOW_SIGNUP`" — is replaced by [ticket
10](https://app.clickup.com/t/86eyqky74), which asks what the operator does on the day an account misbehaves.

**Everything from `10` onward is tracked in ClickUp, not here.** `01`–`09` stay
as written — they are the record of what was built and why, and several
decisions argue against them by name. The rescope's six milestones live in
Development & Engineering → **Konku**
([list](https://app.clickup.com/90182053080/v/l/li/901820494086)), with the full
spec in each ticket's description.

`docs/backlog.csv` is an older ClickUp-import artifact and is **stale against
this rescope**: it still carries the v0.2/v0.3 ordering, operator-funded AI, and
a restic backup plan superseded by D-088.

| File | Scope | Needs VPS? | Remaining |
|---|---|---|---|
| [01-foundation.md](01-foundation.md) | DB wiring, store with user scoping, auth | — | **done** |
| [02-card-engine.md](02-card-engine.md) | Markdown parser, card sync transaction | — | **done** — superseded by 05 |
| [03-app.md](03-app.md) | API endpoints, React screens, timer | — | **done** |
| [05-cards-and-categories.md](05-cards-and-categories.md) | Standalone cards, categories, Notion-shaped UI | — | **done** |
| [06-production-hardening.md](06-production-hardening.md) | RLS, observability, security, test tiers, CI | **no** | **done** |
| [07-public-launch.md](07-public-launch.md) | Accounts, export, deletion, quotas (L1–L9) | **no** | **done** — L10 replaced by `10` |
| [08-review.md](08-review.md) | Ulangan absorbs Ujian; filters and multiple choice | **no** | **done** |
| [09-pagination.md](09-pagination.md) | The index lists page; the header counts the collection | **no** | **done** |
| [04-ship.md](04-ship.md) | Deploy, backups, real mail, alerting, phone | **yes** | S4–S6, ~4 h |

## The rescope's six, in ClickUp

Full spec in each ticket's description — sub-items, acceptance criteria, and
what each one deliberately excludes. Only `10` is broken out into subtasks;
the rest get broken out when they are picked up, because the ClickUp
integration has a hard ~20-write cap per window.

| Ticket | Scope | Needs VPS? | Est. |
|---|---|---|---|
| [10 — Open](https://app.clickup.com/t/86eyqky74) | Suspend, signup ceiling, capacity rule, self-hosting doc, flip | partly | ~7 h |
| [11 — Bilingual](https://app.clickup.com/t/86eyqky8c) | ID + EN, both sides of the wire — plus the landing repo's stale promise | no | ~21 h |
| [12 — The first ten minutes](https://app.clickup.com/t/86eyqky9x) | What `/` does signed-out, onboarding, **import**, empty states, feedback | no | ~21 h |
| [13 — Honest progress](https://app.clickup.com/t/86eyqkyag) | Retention metric, weekly quota, week streak, progressive focus | no | ~16 h |
| [14 — Agent access](https://app.clickup.com/t/86eyn10be) | API tokens and the MCP server | no | ~12 h |
| [15 — Phone](https://app.clickup.com/t/86eyqkyc3) | PWA, offline reads, opt-in reminders | no | ~14 h |

## Build order

```
01 ─► 02 ─► 03 ─► 05 ─► 06 ─► 07 L1–L9 ─► 08 ─► 09 ─► 04 S1–S3 ─► 04 S4–S6 ─► 10 ─► 11 ─► 12 ─► 13 ─► 14 ─► 15
 ✅    ✅    ✅    ✅    ✅      ✅          ✅    ✅     ✅ shipped    ← next     open  lang  first  prog  mcp  phone
                                                                    mail+alert        (ID+EN) run
```

**Three orderings in that line are load-bearing and are not preferences.**

**`04` S4–S5 before `10`.** Mail deliverability and alert routing are what
opening signup depends on — a verification mail in spam is an outage that
presents as a signup bug, and "the operator notices" stops being an acceptable
detection story the moment strangers depend on the service (D-095).

**`11` before `12`.** Everything `12` adds is new copy. Written in Indonesian
and translated afterwards it is written twice, and the second pass is the one
that gets skipped (D-094).

**`12` before `13`.** A retention metric over an empty account is a zero with a
sentence around it. It needs accounts with 30-day-old reviews, which is what the
activation work produces.

**`10` runs before `11` and `12` even though the landing page does not exist
yet**, and that is deliberate: real strangers hitting the first ten minutes
early is the only way `12` gets designed against something true rather than
against a guess (D-095 rejected the waitlist for this reason).

**Four files ran out of numeric order before the rescope, all deliberately.** 05 ran before 04
because it reshaped the schema and shipping first would have meant migrating
real data instead of dev data. **04 now runs after 06 and most of 07** for the
same reason plus a simpler one: almost none of the remaining work needs the box
(D-067). **08 slotted in ahead of 04** on the 05 argument exactly: it renames
four tables, and doing that after the first deploy would mean migrating
strangers' data rather than a dev volume. **09 went ahead of 04** because it is
a data-loss-shaped bug: both index lists truncated silently at a ceiling the
`07` L8 quotas make reachable, and shipping first would mean real accounts
hitting it before the fix does.

### What actually requires the VPS

A short list, and everything not on it is local work against
`docker-compose.yml`:

- The deploy — joining the `platform` network, provisioning the database and
  **both** roles, and pointing DNS at the box. TLS is the platform edge's and
  needs nothing from us (D-088)
- ~~Nightly backups running as a cron *on the box*~~ — the platform's
  `pg_dumpall` already covers every tenant and ships off-box. What is left is
  verifying Konku is in the dump, which is not a build task
- **Email deliverability** — SPF, DKIM, DMARC on a real sending domain
- The half of the release pipeline where the VPS pulls an image by digest
- Uptime monitoring and alert routing against a real endpoint
- Opening signup
- **Phone access**, which is what makes daily review realistic

### The gate that did not go away

> **Use the app daily, starting now, locally.** `make db-up && make dev-api &&
> make dev-web`.

D-030's failure mode — months building a learning tool and none learning — is
not solved by deferring work, it is solved by *using the app*. The gate was
never "deploy"; it was "use it". Do not spend 68 hours on hardening an app you
are not opening every day (D-067).

Two consequences worth taking seriously:

1. **Your local database is now real data.** Weeks of notes in a Docker volume
   with no dump is exactly the failure this project's thesis exists to prevent
   — hence `06` P11.
2. **Laptop-only use is a weaker test than the original gate.** Reviewing on a
   phone during dead time is the behaviour the product depends on, and that
   part only gets tested after the deploy. It is why `04` S6 still exists, and
   why ticket 15 moved forward out of "Later".

Strictly sequential at the file level. Inside a file, dependencies are noted
per task.

**02's parser is deleted by 05.** The file stays for the history — it records
why stable IDs existed and what they protected, which `D-055` had to argue
against to remove them.

## Already done

The full MVP plus schema v2:

- Repo skeleton, `go.mod` at root, Makefile, Dockerfile, dev compose
- `internal/srs` — the scheduler, complete with table-driven tests
- Migrations `00001`–`00005`, `user_id` on every owned table from the start
- pgx pool capped at 10, goose embedded and run at startup, sqlc with drift
  checked in `make check`
- argon2id, server-side sessions, rate-limited login, seed-user CLI
- Notes, cards (their own resource, D-055), shared categories, per-user
  domains, exams with resumable attempts, focus sessions
- React app: note list and editor with autosave, card list and editor, review
  with recall-before-reveal, exams, timer with capture-at-session-end, the
  Terhapus view for both resources
- 22+ tests across unit and integration

## Not built yet, in case it looks otherwise

*(This list described the state before `06` and `07`; all of it now exists.)*

What is genuinely missing as of the rescope: **no landing page** — `/` is a
login form · **no onboarding** · **no import** of any kind · **no English** ·
**the retention metric, the headline number of the entire PRD, is not built** ·
no weekly quota, strip or week streak · no progressive focus · no reminders · no
service worker, so no offline · no MCP or API tokens · no way for the operator
to suspend an account · no feedback path. That is exactly the scope of 10–15.

## The rescope in one paragraph

D-057 retired "it is just for me" as an *engineering* argument and left the
*product* scoped for one person. D-093 closes that: signup opens fully, the app
is bilingual, the first ten minutes get built, and free is permanent — no
billing code, no tier, self-hosting as the pressure valve (D-096). AI is the
user's cost, so MCP comes first and everything after it is BYO-key (D-097).
What did **not** change is `GOALS.md`: never punitive, no gamification, no
social, no losable streaks, no cross-account analytics. A public audience makes
softening those tempting for exactly the reason D-057 already rejected.

## Rules that outrank any task here

1. `internal/srs` imports nothing from `internal/` — `make check-pure`
2. Editing a card's text never resets its schedule
3. A note or card and its category links commit in **one transaction**
4. Every query scoped by `user_id` in the `WHERE` clause, never fetch-then-check
5. Dates are local `YYYY-MM-DD`, never UTC
6. Never punitive — no guilt copy, no losable streaks
7. User-facing copy in **Bahasa Indonesia and English**, Indonesian authored
   first and used as the fallback (D-094 amends this rule); code, comments and
   docs in English
8. Every guarantee has two mechanisms or it is a hope (D-059, D-047, D-061)
9. Logs never carry a body, a token, a hash, or an email address
10. Other people's learning history is never aggregated across accounts. The
    only aggregate numbers are account-lifecycle counters that never held a
    user id (D-099)
11. No billing code, no tier, no feature gating, and no operator-funded
    inference (D-096, D-097)

## Status legend

`todo` · `wip` · `done` · `blocked`
