# TECH.md — Architecture & Technical Requirements

**Status:** v1
**Last updated:** 2026-08-05
**Companion docs:** `PRD.md` (product), `DECISIONS.md` (rationale + open questions)

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | **Go** | single binary, monolith |
| Router | **chi** | thin; handlers stay `http.HandlerFunc` (D-042) |
| Database | **Postgres 17** (`pgvector/pgvector:pg17`) | shared instance in prod, own container in dev |
| DB access | **pgx + sqlc** | write SQL, generate type-safe Go. No ORM (D-043) |
| Migrations | **goose** | embedded in the binary, runs at startup |
| Logging | stdlib **`log/slog`** | no zap, no logrus |
| Config | **`os.Getenv`** | no Viper |
| Frontend | **React + TypeScript + Vite** | embedded in the Go binary via `go:embed` |
| Server state | **TanStack Query** | Zustand only for the timer (D-044) |
| Styling | Tailwind | |
| Editor | textarea + preview (MVP) → CodeMirror 6 (later) | markdown is the source of truth |
| Reverse proxy | Caddy | automatic TLS, lives in the shared infra stack |
| Cache/queue | **none in v1** | Redis only when there is a real job queue — see D-023 |
| Mobile | PWA; native optional later | API-first keeps Flutter/RN/Swift cheap |

**Total non-stdlib backend dependencies: chi, pgx, goose, `x/crypto`** (D-045).

**Server is the source of truth.** The v1 PRD's local-first design is abandoned — the moment there is Postgres, MCP, and multi-device access, half-supporting both models costs more than it returns. Client caches; server owns state.

---

## 1b. Repo layout

`go.mod` at repo root, React in `web/` (D-032). Node is build-time only — no Node process runs in production (D-041).

```
konku/
├── go.mod  go.sum  sqlc.yaml
├── Makefile  Dockerfile  Caddyfile  .env.example
├── docker-compose.yml          # dev, self-contained (postgres :5433)
├── docker-compose.prod.yml     # app only, joins external `shared` network
├── docs/
├── migrations/                 # goose, embedded, runs at startup
├── cmd/konku/
│   ├── main.go
│   └── seed_user.go            # `konku seed-user` — no public signup
├── internal/
│   ├── card/                   # ★ PURE — parse, stable IDs, render
│   ├── srs/                    # ★ PURE — intervals, scheduling
│   ├── auth/                   # argon2id, sessions, middleware
│   ├── store/                  # queries/ · gen/ · notes.go (card-sync tx)
│   ├── api/                    # chi routes, handlers, one error shape, SPA
│   ├── config/
│   └── web/
│       ├── embed.go            # //go:embed all:dist
│       └── dist/               # Vite writes straight here (.gitkeep committed)
└── web/                        # the React app
    ├── package.json  vite.config.ts  tsconfig.json
    └── src/
        ├── api/                # client.ts · types.ts
        ├── features/           # auth · notes · review · timer
        ├── components/ui/
        └── lib/date.ts         # local YYYY-MM-DD, never UTC
```

**`card` and `srs` import nothing from `internal/`.** Enforce it in CI with a grep — if either needs `store`, the design went wrong.

**No copy step.** Vite writes directly into the embedding package:

```ts
// vite.config.ts
build: { outDir: '../internal/web/dist', emptyOutDir: true }
```

```make
build:  ; cd web && npm run build && cd .. && go build -o bin/konku ./cmd/konku
dev:    ; vite on 5173 proxying /api → :8080, go run ./cmd/konku
```

Commit `internal/web/dist/.gitkeep` — `//go:embed all:dist` is a compile-time error if the directory is missing, so a fresh clone would otherwise fail `go build`.

---

## 2. Architecture principles

1. **Pure logic stays pure.** The scheduler and the markdown parser are Go packages with no database and no HTTP imports. Table-driven tests. These two carry the product's value and are the easiest things to get subtly wrong — they are also what a portfolio reviewer will actually read.
2. **One chokepoint per operation.** All card creation — UI, API, MCP, LLM — flows through the same parser/sync path. No second way to write a card.
3. **Storage is a deployment detail.** The app reads `DATABASE_URL` and knows nothing about whether Postgres is shared.
4. **Dates are local `YYYY-MM-DD` strings, not UTC timestamps.** A session at 23:00 belongs to that day, not the next. Classic bug source — get it right in the pure layer first.

---

## 3. Data model

```sql
users            -- id, email, password_hash (argon2id), created_at
sessions         -- id, user_id, expires_at        (server-side, revocable)
domains          -- id, label, color, weekly_quota (global, not per-user)

notes            -- id, user_id, title, content_md, domain_id,
                 -- created_at, updated_at, tsv (generated), embedding (v0.3)

cards            -- id (stable, embedded in the note markdown), user_id, note_id,
                 -- type ('basic'|'cloze'|'feynman'), front, back, source_span

card_schedules   -- card_id, user_id, stage, next_review_date, lapses, state
                 -- state: 'learning' | 'mastered'

review_logs      -- card_id, user_id, rating ('ingat'|'lupa'), reviewed_at,
                 -- interval_before, interval_after

focus_sessions   -- id, user_id, domain_id, duration_minutes, completed_at
```

**`user_id` is denormalized onto every owned table** — including `cards`, `card_schedules` and `review_logs`, which could reach it through joins. Deliberate: it keeps every scoped query a single indexed predicate instead of a join-to-check, and it is what makes Postgres RLS a drop-in later (v0.2) rather than a rewrite.

**Ownership is enforced in the `WHERE` clause, never fetch-then-check.** `SELECT ... WHERE id = $1 AND user_id = $2` — a wrong owner returns "not found," so the API cannot leak whether another user's note exists. Every store method takes a `userID` parameter; none of them are callable without one.

**`review_logs` is non-negotiable and must exist from day one.** It is what makes the retention metric computable, and it cannot be reconstructed retroactively. Log every single review.

**Derived, never stored:** streak, due/upcoming split, retention rate, all stats. Single source of truth.

**Markdown storage:** `TEXT` column. Size is a non-issue — 10,000 notes is tens of megabytes. Benefits: transactional writes alongside card sync, free FTS via a generated `tsvector`, pgvector later without a storage migration.

---

## 4. Card syntax and the parser

Cards are written inline in the note's markdown:

```markdown
# Teorema Bayes

P(A|B) = P(B|A)·P(A) / P(B)

Apa itu prior? :: Keyakinan awal sebelum melihat data <!-- c:k3n8 -->

Rumus Bayes adalah {{P(B|A)·P(A) / P(B)}} <!-- c:m2p1 -->

> [!feynman] Jelaskan kenapa Bayes berguna untuk update keyakinan <!-- c:x9f4 -->
```

### The stable-ID requirement

On every note save, the parser re-reads the markdown and syncs the `cards` table.

**If cards are matched by content, fixing a typo destroys that card's review history and resets its schedule.** So:

- Every card carries a stable ID embedded in the note as an HTML comment (`<!-- c:k3n8 -->`).
- The parser assigns IDs to new cards and **writes them back into the note body**.
- Sync matches by ID only, never by content.
- A card whose ID disappears from the markdown is soft-deleted, not hard-deleted — accidental deletion should not vaporize months of review history.

This is ~150 lines of Go plus a thorough test file, and it is the difference between a system you trust and one that silently eats your progress. Obsidian's SR plugin solves the same problem the same way with block refs.

### Transactionality

Note update and card sync **commit together**. A note saved with cards half-synced is a corrupt state with no obvious repair path.

---

## 5. Scheduler

Pure package, no DB imports.

```go
Intervals = []int{1, 3, 7, 14, 30, 90, 180}   // days

NextSchedule(cur Schedule, rating Rating, today Date) Schedule
DueCards(cards []Schedule, today Date, limit int) []CardID
RetentionRate(logs []ReviewLog, minInterval int) float64
WeeklyStreak(sessions []Session, quota Quota) int
```

Rules:

- `ingat` → `stage++`; past the last index → `state = 'mastered'`, leaves the queue
- `lupa` → `stage = 0`, due tomorrow, `lapses++`
- `DueCards` caps output (default 10) and returns oldest-due first
- Manual "sudah dikuasai" sets `state = 'mastered'` at any stage

---

## 6. API and MCP

**Design the HTTP API tool-shaped from the start.** Same operations serve three surfaces: React app, MCP server, and (later) an in-app assistant.

```
POST   /api/notes                 create
GET    /api/notes/:id             read
PATCH  /api/notes/:id             update markdown → triggers card sync
GET    /api/notes?q=&domain=      search
GET    /api/review/due            capped due list
POST   /api/review/:cardId        {rating} → reschedule + log
POST   /api/sessions              log a completed focus session
GET    /api/stats/retention       headline metric
```

**MCP server talks to the HTTP API with a token, never directly to Postgres.** Keeps the boundary honest and forces the API to actually be complete. It can be a separate small Go binary. Tokens are scoped to a user like any other credential.

### Auth (D-039)

- **argon2id** password hashing (`golang.org/x/crypto/argon2`)
- **Server-side sessions** in Postgres, not signed cookies — revocable, so logout actually logs out
- Middleware resolves the session to a `userID` into the request context. Handlers cannot reach the store without one — every store method requires it as a parameter
- **Rate-limit the login endpoint.** It is the only unauthenticated write path in the app
- **No public signup in the MVP.** First account seeded via `cmd/konku seed-user`; registration sits behind `ALLOW_SIGNUP`, default off — the correct default for a self-hosted box regardless of intent
- No OAuth, no roles, no password reset in the MVP (reset needs SMTP — v0.2)

**Postgres RLS is deliberately v0.2, not MVP.** Application-level scoping via `WHERE user_id = $n` is the primary control and is sufficient alone. RLS is defense in depth, and doing it correctly with a shared connection pool needs `SET LOCAL` per transaction — worth doing, not worth blocking the MVP on.

### Client/server shape (D-040)

**One binary, one origin.** Go serves `/api/*` and the built React app via `go:embed`. The React app is a pure API consumer; the Go server never renders HTML.

```
/api/*           → Go handlers (JSON only)
/assets/*        → embedded static build
everything else  → index.html          ← SPA fallback, required for
                                          client-side routes to survive refresh
```

**Why same-origin rather than a separately-deployed SPA:**

- **Cookie auth just works.** `SameSite=Lax; Secure; HttpOnly` and nothing more. Split origins mean CORS with credentials, preflight on every mutation, `SameSite=None`, and Safari-specific breakage.
- **Service worker scope.** The PWA registers at `/` and caches shell plus API responses — trivial on one origin, a cross-origin caching problem on two.
- **One artifact.** Frontend and backend can never be version-skewed, and it is one Caddy route instead of two.

Cost: a frontend change requires a Go rebuild. That is a Makefile concern, not an architectural one.

**Dev:** Vite on 5173 proxying `/api` → Go on 8080. The proxy is not just convenience — it keeps dev **same-origin**, so cookie behaviour is identical in dev and prod. Pointing the frontend directly at `localhost:8080` reintroduces the CORS problems this design avoids.

### Two credentials, one middleware

```
Browser  → session cookie  ┐
                           ├→ middleware → userID in request context
MCP/CLI  → Bearer token    ┘
```

Handlers only ever see a `userID` and never know which credential produced it. MCP support in v0.3 is then a new *resolver*, not a new API surface.

### Contract

- Hand-written `web/src/api/types.ts` mirroring the Go structs, plus one `client.ts` wrapping `fetch`. OpenAPI codegen is deliberately skipped — real setup cost to solve a drift problem that does not exist at ~8 endpoints.
- **One error shape from every endpoint:** `{"error": {"code": "...", "message": "..."}}`. The client gets a single error path instead of per-endpoint special cases. `message` is user-facing and therefore in Bahasa Indonesia; `code` is stable and for the client to branch on.

---

## 7. Infrastructure

### Topology

```
infra/docker-compose.yml     caddy · postgres (pgvector) · mongo   → network: shared
konku/docker-compose.prod.yml   app only                            → network: shared (external)
other-project/...               app only                            → network: shared (external)
```

```bash
docker network create shared
```

### Prod: shared Postgres, isolated database and role

```sql
CREATE ROLE konku LOGIN PASSWORD '...';
CREATE DATABASE konku OWNER konku;
REVOKE CONNECT ON DATABASE konku FROM PUBLIC;
\c konku
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Both extensions are enabled at creation even though nothing uses them until M2 — `CREATE EXTENSION` is invisible to other projects, and it makes semantic search purely application work later.

The app connects as `konku`, **never** as `postgres`.

### Dev: self-contained

`docker-compose.yml` ships its own Postgres so `git clone && docker compose up` works, on port 5433 to avoid collisions. Also what CI uses for integration tests.

### Connection pool — the failure you will actually hit

Postgres `max_connections` defaults to 100. Go's `database/sql` defaults to **unlimited** open connections, so one app can starve every other project on the box.

```go
db.SetMaxOpenConns(10)
db.SetMaxIdleConns(5)
db.SetConnMaxLifetime(5 * time.Minute)
```

Set this in every project on the shared instance. PgBouncer only past ~6–8 apps.

### Backups

- Nightly **per-database** `pg_dump -Fc konku` (not `pg_dumpall`) — restoring konku must not disturb other running projects
- Push off the VPS with restic → B2/S3. A backup on the same machine as the database is not a backup.
- Set this up in M1, not "later." This becomes years of accumulated knowledge.

### Git vault export (second line of defense)

A background job writes the whole vault to `/var/lib/konku/vault/*.md` and commits to a local git repo.

Buys: free version history per note, an Obsidian-readable folder, and zero lock-in.

**Strictly one-way.** Writes only ever go through the API. Allowing edits both on disk and in the app creates a bidirectional sync problem with conflict resolution — a multi-week project that has sunk better-resourced apps. Resist it.

---

## 8. Build order (M1)

1. Repo skeleton, Docker Compose (dev), goose migrations, schema
2. Auth (single user, session cookie)
3. Notes CRUD — API + Postgres
4. **Markdown → cards parser with stable IDs + tests** ← the real work
5. **Scheduler package + tests** ← the other real work
6. Review API (`due`, `rate`) and review screen with recall-before-reveal
7. Focus timer + session logging + capture-at-session-end
8. React shell: notes list, note editor (textarea + preview), review, timer
9. Deploy: Caddy + shared Postgres + `pg_dump` + restic off-site

Items 4 and 5 are where the correctness risk lives. Write them first, test them hard, and keep them free of DB and HTTP imports.

---

## 9. PWA scope (M3)

Three very different amounts of work — do not conflate them:

| | Effort |
|---|---|
| Installable + cached shell + offline **reads** | 1–2 days — do this |
| Timer works offline | free, it is client-side already |
| Offline **writes** with sync and conflict resolution | a project on its own — defer until genuinely needed |

Build offline writes when you are actually on a train with no signal wanting to review — not before.

---

## 10. Tripwires: when to move konku off the shared Postgres

Currently none are on the horizon, and the migration is a ten-minute `pg_dump` / `pg_restore` plus a connection-string change.

- Konku needs a different Postgres major version
- An extension requires a forked image (TimescaleDB, Citus)
- Real noisy-neighbor load in either direction
- Materially different backup RPO
- The app stops being single-user

**MongoDB is not used by konku.** It exists on the VPS for other projects. This app's data is relational in exactly the ways that matter — note → cards → schedules → logs, with card sync needing to commit transactionally alongside the note. Markdown being "document-shaped" is not a reason; it is a text column.
