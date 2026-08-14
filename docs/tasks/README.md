# Tasks

Execution plan. The MVP is built; **~74 h remaining** across hardening,
accounts, and shipping.

These eight files are the source of truth. `docs/backlog.csv` stays as the
ClickUp-import artifact and covers the product work that follows (v1.2, v1.3).

| File | Scope | Needs VPS? | Remaining |
|---|---|---|---|
| [01-foundation.md](01-foundation.md) | DB wiring, store with user scoping, auth | — | **done** |
| [02-card-engine.md](02-card-engine.md) | Markdown parser, card sync transaction | — | **done** — superseded by 05 |
| [03-app.md](03-app.md) | API endpoints, React screens, timer | — | **done** |
| [05-cards-and-categories.md](05-cards-and-categories.md) | Standalone cards, categories, Notion-shaped UI | — | **done** |
| [06-production-hardening.md](06-production-hardening.md) | RLS, observability, security, test tiers, CI | **no** | ~42 h |
| [07-public-launch.md](07-public-launch.md) | Accounts, export, deletion, quotas (L1–L9) | **no** | ~26 h |
| [08-review.md](08-review.md) | Ulangan absorbs Ujian; filters and multiple choice | **no** | **done** |
| [09-pagination.md](09-pagination.md) | The index lists page; the header counts the collection | **no** | **done** |
| [04-ship.md](04-ship.md) | Deploy, backups on the box, real mail, open signup | **yes** | ~8 h |

## Build order

```
01 ──► 02 ──► 03 ──► 05 ──► 06 Harden ──► 07 L1–L9 ──► 08 ──► 09 ──► 04 Ship ──► 07 L10
 ✅     ✅     ✅     ✅      ← next          local        ✅     ✅     the VPS      signup on
                              (local)                                   residue
```

**Three files run out of numeric order, all deliberately.** 05 ran before 04
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

- The deploy — Caddy, HTTPS, the shared network, database and role
- Nightly backups running as a cron *on the box*
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
   part only gets tested after the deploy. It is why `04` S4 still exists.

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

No `.github/` at all · no frontend test of any kind · no e2e · no RLS · no
request logging or metrics · no `/healthz` / `/readyz` split · no security
headers · no signup, verification or password reset · no export or account
deletion · no local backup. That is exactly the scope of 06 and 07.

## Rules that outrank any task here

1. `internal/srs` imports nothing from `internal/` — `make check-pure`
2. Editing a card's text never resets its schedule
3. A note or card and its category links commit in **one transaction**
4. Every query scoped by `user_id` in the `WHERE` clause, never fetch-then-check
5. Dates are local `YYYY-MM-DD`, never UTC
6. Never punitive — no guilt copy, no losable streaks
7. User-facing copy in Bahasa Indonesia; code, comments, docs in English
8. Every guarantee has two mechanisms or it is a hope (D-059, D-047, D-061)
9. Logs never carry a body, a token, a hash, or an email address
10. Other people's learning history is never aggregated across accounts

## Status legend

`todo` · `wip` · `done` · `blocked`
