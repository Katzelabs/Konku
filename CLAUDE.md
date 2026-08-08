# Konku

*Konsisten-ku* — "my consistency". The name is the thesis: small consistency beats occasional intensity.

Personal learning system. Self-hosted, multi-tenant but never social. One job: **nothing you learn disappears silently.**

Notes (markdown) with flashcards embedded inline, a spaced-repetition scheduler over those cards, a focus timer, and MCP access so Claude can read and write the knowledge base directly.

Module: `github.com/Katzelabs/Konku` · Go 1.25 · remote `Katzelabs/Konku`

## Current state

**Building the MVP.** `01-foundation` is complete: pgx pool, embedded goose migrations, sqlc, the store layer with per-user scoping, argon2id auth with server-side sessions, and a login screen. `internal/srs` (the scheduler) is done and tested.

`02-card-engine` is complete: `card.Parse` / `card.Insert` (basic `Q :: A`, stable IDs written back into the markdown, a fixed point on re-parse) and `store.CreateNoteWithCards` / `store.UpdateNoteWithCards` — the note update and the card diff-by-ID in one transaction.

`03-app` is complete: notes, review, session and domain endpoints, and the React app — note list, editor with autosave and preview, review screen, focus timer, capture-at-session-end. The loop runs end to end.

**In progress: schema v2** — migration `00002_domains_and_exams.sql` makes domains per-user and adds exams (D-046 → D-052). The migration is written and tested; the store layer, queries, handlers and UI are not. `docs/tasks/04-ship.md` follows.

Note: a card is addressed by note *and* ID (`/api/review/{noteID}/{cardID}`). Card IDs are unique within their note, never within the account.

Scope is the **MVP** in `PRD.md` §8 **plus schema v2**. Cloze/feynman card types, full-text search, public signup and password reset stay deferred to v0.2 (D-031, D-038, D-039). **Do not reintroduce them.** Domains UI is no longer deferred — per-user domains require it (D-046).

## Read these first

| Doc | What it is |
|---|---|
| `docs/GOALS.md` | Personal context — who the user is, the five problems this exists to solve. **Read first.** Written in Indonesian. |
| `docs/tasks/` | **MVP execution plan** — 4 files, build order, acceptance criteria. What to build next. |
| `docs/DECISIONS.md` | Why things were decided, and **what was rejected**. Check before proposing anything — a lot of obvious-seeming ideas were cut deliberately. |
| `docs/PRD.md` | Product: features, priorities, milestones |
| `docs/TECH.md` | Architecture, data model, card syntax, infra |
| `docs/DESIGN.md` | **The design system** — tokens, components, and the rules. Read before touching any UI. |

## Commands

```bash
make db-up             # dev Postgres on :5433
make dev-api           # Go on :8080
make dev-web           # Vite on :5173  ← open this one
make check             # vet, typecheck, tests, purity, sqlc drift
make test-integration  # needs make db-up first
make sqlc              # after editing internal/store/queries/*.sql
go run ./cmd/konku seed-user -email you@example.com
```

## Hard rules

1. **`internal/card` and `internal/srs` import nothing from `internal/`.** They carry the product's value and stay trivially testable. `make check-pure` enforces it.
2. **Cards match by stable ID, never by content.** Matching by content means fixing a typo destroys that card's review history. Silent and unrecoverable (D-019).
3. **Note update + card sync commit in one transaction.**
4. **Every query is scoped by `user_id` in the `WHERE` clause**, never fetch-then-check. A wrong owner gets *not found*, never *forbidden* — otherwise the API can be used to probe for other users' data (D-039).
5. **Dates are local `YYYY-MM-DD`.** An 11pm session belongs to that day.
6. **Never punitive.** No guilt copy, no shaming empty states, no aggressive red, no losable streaks, no gamification. A missed day is normal and the UI treats it as normal. Hard constraint from `GOALS.md`, not a preference.
7. **Capture cost is the thing to protect.** Anything that adds friction to writing a note or a card works against the product.
8. **User-facing copy in Bahasa Indonesia. Code, comments, commits, docs in English.**

## Conventions already established — follow them

**Data access.** `store.Q()` returns the sqlc queries; `store.WithTx(ctx, fn)` for transactions. Write SQL in `internal/store/queries/*.sql`, run `make sqlc`. **Never hand-edit `internal/store/gen/`.** No hand-written passthrough wrappers around generated code — the `user_id` in the SQL is what enforces tenancy.

**Dates.** `internal/store/date.go` (`ToTime`, `ToTimePtr`, `FromTime`, `FromTimePtr`) is the *only* place a date crosses between `srs.Date` and `time.Time`. It uses UTC exclusively. Never call `In()`, `Local()` or `UTC()` on a date elsewhere. An empty `srs.Date` means "not scheduled" and maps to SQL NULL.

**HTTP.** Handlers are plain `http.HandlerFunc`. Use `writeJSON` / `writeError` / `writeInternal` / `writeNotFound` — one error shape `{"error":{"code","message"}}`, with `message` user-facing and therefore Indonesian. Authenticated handlers get the user from `api.UserFrom(ctx)`. New authenticated routes go inside the `requireUser` group in `server.go`.

**Errors.** Wrap with `%w` and a package prefix (`fmt.Errorf("store: ...: %w", err)`). Internal errors are logged, never returned to the client verbatim.

**Tests.** Table-driven. Integration tests live beside their package, skip unless `TEST_DATABASE_URL` is set, and clean up via `t.Cleanup`. Assert behaviour, not wiring — the login rate limiter shipped broken precisely because nothing asserted a 429.

**Frontend.** Feature folders under `web/src/features/`. TanStack Query owns all server state; `useState`/Zustand only for genuine client state, which is essentially just the timer (D-044). A 401 from `/auth/me` is a normal "signed out" answer, not an error.

**Design system.** Tailwind **v4** — tokens live in `web/src/styles/theme.css`, there is no `tailwind.config.js`. Build screens from `web/src/components/ui/`; a raw palette class (`bg-slate-100`, `text-red-500`) or a hex value in a feature folder is a bug in the token file, not a shortcut. Domain colours are the one exception — they are user data. See `docs/DESIGN.md` and the live style guide at `/design` (dev only). The palette has no green and no `success` token on purpose (D-054).

## Stack

Go + **chi** (single binary, monolith) · Postgres 17 + pgvector via **pgx + sqlc** · **goose** migrations, embedded and run at startup · stdlib `log/slog` · React + TS + Vite + **Tailwind v4** + **TanStack Query**, embedded via `go:embed` · Caddy · Docker Compose.

`go.mod` at repo root, React in `web/` (D-032). Vite writes straight into `internal/web/dist` — no copy step. Non-stdlib backend deps are exactly **chi, pgx, goose, x/crypto, x/term, google/uuid** — keep the list short (D-045). Frontend runtime deps beyond React/Router/Query are **clsx, tailwind-merge, cva, lucide-react** and three Radix packages (dialog, slot, switch) — same discipline (D-053). No ORM (D-043), no Gin/Echo/Fiber (D-042), no Redis (D-023), no MongoDB (D-027), no Node process in production (D-041).

Prod runs on a self-hosted VPS against a **shared** Postgres (own database + own role), so the pgx pool is capped at 10 connections — an uncapped pool can starve every other project on the box (D-028). Dev compose ships its own Postgres on 5433.

## Gotchas

- `internal/web/dist/.gitkeep` is committed and **must stay** — `//go:embed all:dist` is a compile-time error on a missing directory, so a fresh clone would not build. Vite's `emptyOutDir` deletes it; `make build` puts it back.
- `make` runs each recipe line in its own shell — a guard clause with `exit 0` does not skip the following line.
