# Konku

**Konku** — *Konsisten-ku*, "my consistency". The name is the thesis: small
consistency beats occasional intensity.

Learning system. One job: **nothing you learn disappears silently.**

Markdown notes, flashcards as their own feature, a spaced-repetition scheduler
over those cards, exams over the cards you already have, a focus timer that
feeds capture, and (later) MCP access so Claude can read and write the
knowledge base directly. Notes and cards share categories and domains; neither
contains the other.

Multi-tenant, never social — an account is an isolated private knowledge base.

Go + Postgres + React, one binary, self-hostable.

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
  srs/              ★ PURE — the spaced-repetition scheduler
  auth/             argon2id, server-side sessions, middleware
  store/            Postgres; every method takes a userID
  api/              chi routes, one error shape, SPA fallback
  config/
  web/              embeds the built frontend
migrations/         goose
web/                the React app (Vite writes into internal/web/dist)
docs/               GOALS · PRD · TECH · DECISIONS · DESIGN · tasks/
```

## The rules that matter

- **`srs/` imports nothing from `internal/`.** It carries the product's value
  and must stay trivially testable. `make check-pure` enforces it.
- **Editing a card's text never resets its schedule.** A card is a uuid, and
  an edit is an `UPDATE` — fixing a typo must not destroy review history.
- **A note or card and its category links commit in one transaction.**
- **Every query is scoped by `user_id` in the `WHERE` clause**, never
  fetch-then-check — a wrong owner gets "not found", not a probe-able 403.
- **Dates are local `YYYY-MM-DD` strings, never UTC.** An 11pm session belongs
  to that day.
- **Never punitive.** No guilt copy, no losable streaks, no gamification.
- **User-facing copy in Bahasa Indonesia. Code, comments, docs in English.**
- **Every guarantee has two mechanisms or it is a hope** — tenancy is the
  `WHERE` clause *and* RLS, cross-tenant writes are validated *and* blocked by
  composite foreign keys.

## Status

The MVP is built and the loop runs end to end. What follows is hardening it to
a production standard (`06`), building the account surface (`07` L1–L9),
deploying (`04`), and opening signup (`07` L10) — in that order, deliberately.
Everything before the deploy is local work against `docker-compose.yml`.

## Docs

Read `docs/GOALS.md` first — it explains why this exists. `docs/DECISIONS.md`
records what was decided *and what was rejected*; check it before proposing
anything, because a lot of obvious-seeming ideas were cut deliberately.
D-057 – D-066 are why this is built like a production service.

`docs/tasks/` is the execution plan — start at
[`docs/tasks/README.md`](docs/tasks/README.md).
