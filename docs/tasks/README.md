# Tasks

MVP execution plan. **~48.5 h remaining** of the ~62 h scoped in `PRD.md` §8.

These four files are the source of truth for MVP work. `docs/backlog.csv` stays
as the ClickUp-import artifact and covers v0.2 / v0.3 / Later.

| File | Scope | Remaining |
|---|---|---|
| [01-foundation.md](01-foundation.md) | DB wiring, store with user scoping, auth | ~7.5 h |
| [02-card-engine.md](02-card-engine.md) | Markdown parser, card sync transaction | ~9 h |
| [03-app.md](03-app.md) | API endpoints, React screens, timer | ~26 h |
| [04-ship.md](04-ship.md) | CI, deploy, backups, validation | ~6 h |

## Build order

```
01 Foundation ──► 02 Card engine ──► 03 App ──► 04 Ship
```

Strictly sequential at the file level. Inside a file, dependencies are noted
per task. **02 is the highest-risk work** — a bug there silently corrupts
review history rather than throwing, so it gets tests before it gets callers.

## Already done (~13.5 h)

- Repo skeleton, `go.mod` at root, Makefile, Dockerfile, dev compose
- `internal/srs` — the scheduler, complete with table-driven tests
- `migrations/00001_init.sql` — full schema with `user_id` on every owned table
- `internal/config`, `internal/api` error shape + SPA fallback + chi routing
- `internal/web` embed, Vite writing straight into it, verified fresh-clone build
- React shell with TanStack Query wired, typed API client
- **F1** — pgx pool capped at 10, goose migrations embedded and run at startup
- **F2** — sqlc wired up, drift checked in `make check`
- **F3** — store queries with `user_id` scoping, `WithTx`, 7 integration tests

## Rules that outrank any task here

1. `internal/card` and `internal/srs` import nothing from `internal/` — `make check-pure`
2. Cards match by **stable ID**, never by content
3. Note update + card sync commit in **one transaction**
4. Every query scoped by `user_id` in the `WHERE` clause, never fetch-then-check
5. Dates are local `YYYY-MM-DD`, never UTC
6. Never punitive — no guilt copy, no losable streaks
7. User-facing copy in Bahasa Indonesia; code, comments, docs in English

## Status legend

`todo` · `wip` · `done` · `blocked`
