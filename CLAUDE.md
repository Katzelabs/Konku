# Konku

Personal learning system. Self-hosted, multi-tenant but never social. One job: **nothing you learn disappears silently.**

Notes (markdown) with flashcards embedded inline, a spaced-repetition scheduler over those cards, a focus timer, and MCP access so Claude can read and write the knowledge base directly.

## Current state

**Design phase — no code yet.** The four docs below are the entire project.

Scope is the **MVP** in `PRD.md` §8, ~62 h across 22 tasks in `docs/backlog.csv`: the retention loop (notes → cards → review), the focus timer with capture-at-session-end, and real auth. Cloze/feynman cards, domains, search, public signup and password reset are deliberately deferred to v0.2 (D-031, D-038, D-039). Do not reintroduce them.

**Multi-tenant, not social** (D-039): accounts are isolated knowledge bases. `user_id` is on every owned table and every store method; ownership goes in the `WHERE` clause, never fetch-then-check.

**All blocking decisions are settled** (D-032 … D-037). Next step is the repo skeleton per the layout in D-032.

## Read these first

| Doc | What it is |
|---|---|
| `docs/GOALS.md` | Personal context — who the user is, the five problems this exists to solve. **Read first.** Written in Indonesian. |
| `docs/PRD.md` | Product: features, priorities, milestones |
| `docs/TECH.md` | Architecture, data model, card syntax, infra |
| `docs/DECISIONS.md` | Why things were decided, and **what was rejected**. Check before proposing anything — a lot of obvious-seeming ideas were cut deliberately. |

## Rules

- **User-facing copy in Bahasa Indonesia. Code, comments, commits, and docs in English.**
- **Never punitive.** No guilt copy, no shaming empty states, no aggressive red, no losable streaks, no gamification. A missed day is normal and the UI treats it as normal. This is a hard constraint from `GOALS.md`, not a preference.
- **Capture cost is the thing to protect.** Any change that adds friction to writing a note or a card is working against the product.
- **The scheduler and the markdown parser stay pure** — no DB, no HTTP, no React imports. Table-driven tests. These two carry the product's value.
- Dates are local `YYYY-MM-DD` strings, never UTC timestamps. An 11pm session belongs to that day.

## Stack

Go + **chi** (single binary, monolith) · Postgres 17 + pgvector via **pgx + sqlc** · **goose** migrations (embedded) · stdlib `log/slog` · React + TS + Vite + Tailwind + **TanStack Query**, embedded via `go:embed` · Caddy · Docker Compose.

`go.mod` at repo root, React in `web/` (D-032). Non-stdlib backend deps are exactly **chi, pgx, goose, x/crypto** — keep it that way (D-045). No ORM (D-043), no Gin/Echo/Fiber (D-042), no Redis (D-023), no MongoDB (D-027), no Node process in production (D-041).

Prod runs on a self-hosted VPS against a **shared** Postgres (own database + own role); dev compose ships its own Postgres on port 5433.
