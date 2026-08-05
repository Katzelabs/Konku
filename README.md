# Konku

**Konku** — *Konsisten-ku*, "my consistency". The name is the thesis: small
consistency beats occasional intensity.

Personal learning system. One job: **nothing you learn disappears silently.**

Markdown notes with flashcards embedded inline, a spaced-repetition scheduler
over those cards, a focus timer that feeds capture, and (later) MCP access so
Claude can read and write the knowledge base directly.

Go + Postgres + React, one binary, self-hosted.

## Quick start

```bash
make setup          # go mod download + npm install
make db-up          # Postgres on :5433
go run ./cmd/konku seed-user -email you@example.com

make dev-api        # terminal 1 — Go on :8080
make dev-web        # terminal 2 — Vite on :5173  ← open this
```

Vite proxies `/api` to the Go server, which keeps development same-origin so
session cookies behave exactly as they do in production.

No `.env` needed to start: the Makefile defaults to the dev Postgres from
`make db-up`. Copy `.env.example` to `.env` when you want to override
something — make loads it automatically.

```bash
make build          # frontend → embedded → bin/konku
make check          # vet, typecheck, tests, purity check
```

## Layout

```
cmd/konku/          server binary + seed-user
internal/
  card/             ★ PURE — parse cards from markdown, stable IDs
  srs/              ★ PURE — the spaced-repetition scheduler
  auth/             argon2id, server-side sessions, middleware
  store/            Postgres; every method takes a userID
  api/              chi routes, one error shape, SPA fallback
  config/
  web/              embeds the built frontend
migrations/         goose
web/                the React app (Vite writes into internal/web/dist)
docs/               GOALS · PRD · TECH · DECISIONS · backlog.csv
```

## The rules that matter

- **`card/` and `srs/` import nothing from `internal/`.** They carry the
  product's value and must stay trivially testable. `make check-pure` enforces
  it.
- **Cards are matched by stable ID, never by content.** Matching by content
  means fixing a typo destroys that card's review history.
- **Note update and card sync commit in one transaction.**
- **Every query is scoped by `user_id` in the `WHERE` clause**, never
  fetch-then-check — a wrong owner gets "not found", not a probe-able 403.
- **Dates are local `YYYY-MM-DD` strings, never UTC.** An 11pm session belongs
  to that day.
- **Never punitive.** No guilt copy, no losable streaks, no gamification.
- **User-facing copy in Bahasa Indonesia. Code, comments, docs in English.**

## Docs

Read `docs/GOALS.md` first — it explains why this exists. `docs/DECISIONS.md`
records what was decided *and what was rejected*; check it before proposing
anything, because a lot of obvious-seeming ideas were cut deliberately.

`docs/tasks/` is the MVP execution plan — start at
[`docs/tasks/README.md`](docs/tasks/README.md).
