# Tasks

MVP execution plan. **~6 h remaining** — only shipping is left.

These five files are the source of truth for MVP work. `docs/backlog.csv` stays
as the ClickUp-import artifact and covers v0.2 / v0.3 / Later.

| File | Scope | Remaining |
|---|---|---|
| [01-foundation.md](01-foundation.md) | DB wiring, store with user scoping, auth | **done** |
| [02-card-engine.md](02-card-engine.md) | Markdown parser, card sync transaction | **done** — superseded by 05 |
| [03-app.md](03-app.md) | API endpoints, React screens, timer | **done** |
| [05-cards-and-categories.md](05-cards-and-categories.md) | Standalone cards, categories, Notion-shaped UI | **done** |
| [04-ship.md](04-ship.md) | CI, deploy, backups, validation | ~6 h |

## Build order

```
01 Foundation ──► 02 Card engine ──► 03 App ──► 05 Cards & categories ──► 04 Ship
   ✅ done          ✅ done            ✅ done      ✅ done                   ← next
```

**05 runs before 04**, out of numeric order: it reshapes the schema, and
shipping first would mean migrating real data instead of dev data.

Strictly sequential at the file level. Inside a file, dependencies are noted
per task.

**02's parser is deleted by 05.** The file stays for the history — it records
why stable IDs existed and what they protected, which `D-055` had to argue
against to remove them.

## Already done (~21 h)

- Repo skeleton, `go.mod` at root, Makefile, Dockerfile, dev compose
- `internal/srs` — the scheduler, complete with table-driven tests
- `migrations/00001_init.sql` — full schema with `user_id` on every owned table
- `internal/config`, `internal/api` error shape + SPA fallback + chi routing
- `internal/web` embed, Vite writing straight into it, verified fresh-clone build
- React shell with TanStack Query wired, typed API client
- **F1** — pgx pool capped at 10, goose migrations embedded and run at startup
- **F2** — sqlc wired up, drift checked in `make check`
- **F3** — store queries with `user_id` scoping, `WithTx`, integration tests
- **F4–F7** — argon2id, server-side sessions, rate-limited login, seed-user CLI, login screen

**01-foundation is complete.** 22 tests pass across unit and integration.

## Rules that outrank any task here

1. `internal/srs` imports nothing from `internal/` — `make check-pure`
2. Editing a card's text never resets its schedule
3. A note or card and its category links commit in **one transaction**
4. Every query scoped by `user_id` in the `WHERE` clause, never fetch-then-check
5. Dates are local `YYYY-MM-DD`, never UTC
6. Never punitive — no guilt copy, no losable streaks
7. User-facing copy in Bahasa Indonesia; code, comments, docs in English

## Status legend

`todo` · `wip` · `done` · `blocked`
