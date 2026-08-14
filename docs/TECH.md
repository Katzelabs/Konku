# TECH.md — Architecture & Technical Requirements

**Status:** v2 — production framing (D-057)
**Last updated:** 2026-08-09
**Companion docs:** `PRD.md` (product), `DECISIONS.md` (rationale + open questions)

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | **Go** | single binary, monolith |
| Router | **chi** | thin; handlers stay `http.HandlerFunc` (D-042) |
| Database | **Postgres 17** (`pgvector/pgvector:pg17`) | shared instance in prod, own container in dev |
| DB access | **pgx + sqlc** | write SQL, generate type-safe Go. No ORM (D-043) |
| Tenancy | `WHERE user_id` **plus** Postgres RLS | two independent mechanisms (D-059) |
| Migrations | **goose** | embedded in the binary, runs at startup |
| Logging | stdlib **`log/slog`** | JSON to stdout; no zap, no logrus |
| Metrics | **`prometheus/client_golang`** | `/metrics`, not public (D-062) |
| Error tracking | **Sentry** | panics and 5xx (D-062) |
| Email | stdlib **`net/smtp`** | verification and reset only; no SDK (D-065) |
| Config | **`os.Getenv`** | no Viper |
| Frontend | **React + TypeScript + Vite** | embedded in the Go binary via `go:embed` |
| Server state | **TanStack Query** | Zustand only for the timer (D-044) |
| Styling | **Tailwind v4** | tokens in `theme.css`, no config file (D-053) |
| Editor | textarea + preview → CodeMirror 6 (later) | markdown is the source of truth |
| Frontend tests | **Vitest + Testing Library** | dev only (D-063) |
| E2E | **Playwright** | core loop and auth flows, in CI (D-063) |
| CI/CD | **GitHub Actions** | merge gate on `main`, deploys from tags (D-061) |
| Reverse proxy | Caddy | automatic TLS, lives in the shared infra stack |
| Cache/queue | **none** | Redis only when there is a real job queue — see D-023 |
| Mobile | PWA; native optional later | API-first keeps Flutter/RN/Swift cheap |

**Non-stdlib backend dependencies: chi, pgx, goose, `x/crypto`, `x/term`, `google/uuid`, `prometheus/client_golang`, `sentry-go`.** The budget was amended, not abandoned — a new dependency names the production obligation it discharges or it does not go in (D-065).

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
├── .github/workflows/          # ci.yml (merge gate) · release.yml (D-061)
├── docs/
│   ├── runbooks/               # restore, rollback, secret rotation (D-064)
│   └── tasks/
├── migrations/                 # goose, embedded, runs at startup
├── cmd/konku/
│   ├── main.go
│   └── seed_user.go            # `konku seed-user` — private deployments
├── internal/
│   ├── srs/                    # ★ PURE — intervals, scheduling
│   ├── auth/                   # argon2id, sessions, tokens, middleware
│   ├── mail/                   # verification + reset, net/smtp
│   ├── store/                  # queries/ · gen/ · notes.go · cards.go
│   ├── api/                    # chi routes, handlers, one error shape, SPA
│   ├── obs/                    # request logging, metrics, health (D-062)
│   ├── config/
│   └── web/
│       ├── embed.go            # //go:embed all:dist
│       └── dist/               # Vite writes straight here (.gitkeep committed)
├── e2e/                        # Playwright, core loop + auth (D-063)
└── web/                        # the React app
    ├── package.json  vite.config.ts  tsconfig.json
    └── src/
        ├── api/                # client.ts · types.ts
        ├── features/           # auth · notes · cards · review · timer
        ├── components/ui/
        └── lib/date.ts         # local YYYY-MM-DD, never UTC
```

**`srs` imports nothing from `internal/`.** Enforced by `make check-pure`, which runs in CI (D-061) — if it needs `store`, the design went wrong. It guarded `internal/card` too, until D-055 deleted that package.

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

1. **Pure logic stays pure.** `internal/srs` is a Go package with no database and no HTTP imports. Table-driven tests. It carries the product's value and is the easiest thing to get subtly wrong.
2. **One chokepoint per operation.** All card creation — UI, API, MCP, LLM — flows through the same store method. No second way to write a card.
3. **Storage is a deployment detail.** The app reads `DATABASE_URL` and knows nothing about whether Postgres is shared.
4. **Dates are local `YYYY-MM-DD` strings, not UTC timestamps.** A session at 23:00 belongs to that day, not the next. Classic bug source — get it right in the pure layer first.
5. **Every guarantee has two mechanisms or it is a hope.** Tenancy is the `WHERE` clause *and* RLS (D-059); cross-tenant writes are handler validation *and* composite foreign keys (D-047); the rules are documented *and* enforced in CI (D-061). One mechanism plus discipline is what fails at 2am.
6. **Failures are visible.** A degraded database, a spiking error rate, a backup that did not run — each has a signal that reaches the operator before it reaches a user (D-062).

---

## 3. Data model

```sql
users            -- id, email, password_hash (argon2id), created_at,
                 -- email_verified_at, deleted_at             (D-058, D-066)
user_settings    -- user_id, default_duration_minutes, focus_step_n,
                 -- rota_enabled                              (D-058)
auth_sessions    -- id, user_id, expires_at, created_at,
                 -- last_seen_at, user_agent, ip              (sessions screen, D-060)
auth_tokens      -- id, user_id, kind ('verify'|'reset'), token_hash,
                 -- expires_at, used_at                       (single-use, D-058)
domains          -- id, user_id, slug, label, color, weekly_quota,
                 -- sort_order, archived_at        (per-user, D-046)

notes            -- id, user_id, title, content_md, domain_id,
                 -- created_at, updated_at, tsv (generated), embedding (v1.3)

cards            -- id (uuid), user_id, domain_id?, type ('basic'|'cloze'|'feynman'),
                 -- front, back (both markdown), deleted_at,
                 -- created_at, updated_at        (standalone, D-055)

categories       -- id, user_id, slug, label, archived_at   (shared, D-055)
note_categories  -- user_id, note_id, category_id
card_categories  -- user_id, card_id, category_id

card_schedules   -- card_id, user_id, stage, next_review_date, lapses, state
                 -- state: 'learning' | 'mastered'

review_logs      -- card_id, user_id, rating ('ingat'|'lupa'), reviewed_at,
                 -- interval_before, interval_after,
                 -- source ('due'|'set'), run_id                 (D-049, D-075)
                 -- format ('recall'|'choice')                   (D-077)

focus_sessions   -- id, user_id, domain_id, duration_minutes,
                 -- session_date, completed_at

review_sets      -- id, user_id, title, selection ('fixed'|'random'),
                 -- question_count, time_limit_minutes, archived_at,
                 -- format ('recall'|'choice')          (D-048, D-075, D-076)
review_set_domains    -- set_id, user_id, domain_id     -- empty = unfiltered
review_set_categories -- set_id, user_id, category_id   -- AND'ed with domains
review_set_cards -- set_id, user_id, card_id, position
                 -- the pinned set, selection = 'fixed' only
review_runs      -- id, set_id, user_id, started_at, finished_at,
                 -- run_date, total_count, correct_count
review_run_cards -- run_id, user_id, card_id, position,
                 -- options text[], correct_index
                 -- the draw and its options, snapshotted at start so a run
                 -- resumes without reshuffling either   (D-050, D-077)
```

There is no answers table: an answer inside a set is a `review_logs` row with `source = 'set'`, and it never moves `card_schedules` (D-049).

`review_run_cards.correct_index` is stored and **never serialized** — `ListRunQuestions` does not select it, and it is read one row at a time on the request that grades. Shipping it with the question list would put the answer key one dev-tools glance away (D-077).

Auth tokens are stored **hashed**, single-use and expiring — a leaked database dump must not be a set of working password-reset links (D-058).

**`user_id` is denormalized onto every owned table** — including `cards`, `card_schedules` and `review_logs`, which could reach it through joins. Deliberate: it keeps every scoped query a single indexed predicate instead of a join-to-check, and it is what makes Postgres RLS a drop-in (D-059) rather than a rewrite.

**Ownership is enforced in the `WHERE` clause, never fetch-then-check.** `SELECT ... WHERE id = $1 AND user_id = $2` — a wrong owner returns "not found," so the API cannot leak whether another user's note exists. Every store method takes a `userID` parameter; none of them are callable without one.

**RLS backs it, it does not replace it** (D-059). Every owned table carries a policy on `user_id = current_setting('app.user_id')::uuid`, applied by `SET LOCAL` inside the transaction that runs the query — so user-scoped reads move into `WithUserTx`. Two details decide whether this is real RLS or the appearance of it: **`ALTER TABLE ... FORCE ROW LEVEL SECURITY`**, because a table owner bypasses its own policies and the app currently connects as the database owner; and a **non-owner application role** (`konku_app`), so migrations and the running app are not the same principal.

**Writes are guarded by composite foreign keys, not by handler discipline** (D-047). The `WHERE` clause protects reads; it does nothing for a request body carrying someone else's `domainId`. Every owned reference therefore carries the owner — `FOREIGN KEY (user_id, domain_id) REFERENCES domains (user_id, id)` — so a cross-tenant write is rejected by Postgres. History tables (`review_logs`, `review_run_cards`) are the deliberate exception: no FK to `cards`, so deleting a card cannot erase retention evidence (D-050).

**Domains, review sets and categories archive; they do not delete** (D-051). Every reference is `ON DELETE NO ACTION`, so a referenced row cannot be removed and an unreferenced one still can. Handlers map `foreign_key_violation` to a 409, never a 500.

**`review_logs` is non-negotiable and must exist from day one.** It is what makes the retention metric computable, and it cannot be reconstructed retroactively. Log every single review.

**Derived, never stored:** streak, due/upcoming split, retention rate, all stats. Single source of truth.

**Markdown storage:** `TEXT` column, for note bodies and for both sides of a card. Size is a non-issue — 10,000 notes is tens of megabytes. Benefits: free FTS via a generated `tsvector`, pgvector later without a storage migration.

---

## 4. Cards

A card is a row: a uuid, a markdown front, a markdown back, an optional domain, and any number of categories. It is created and edited on its own screens (`/cards`, `/cards/:id`) and belongs to no note.

**It did not always work this way.** Cards used to be written inline in note markdown as `Apa itu prior? :: Keyakinan awal`, with a stable ID (`<!-- c:k3n8 -->`) that a parser assigned and wrote back into the document, and a sync that diffed the `cards` table by ID on every save. D-055 removed all of it — the syntax, `internal/card`, its TypeScript mirror, and the sync transaction.

### What the stable IDs were protecting, and why it still holds

The parser existed for one reason worth restating: **if cards are matched by content, fixing a typo destroys that card's review history and resets its schedule.** Silent, and unrecoverable.

That requirement did not go away; the mechanism did. A card is now identified by a uuid primary key and an edit is an `UPDATE`, so the schedule is not on the path of a text change at all. `TestScheduleSurvivesCardEdit` was kept and rewritten rather than deleted with the parser, because the property is what matters and the test is the only thing that notices if it stops being true.

### Deletion

Soft delete, always. `deleted_at` is set and the schedule and review history stay untouched, so restoring is a real undo. Two reasons: a finished review run renders its questions by joining `cards`, so a hard delete would blank out past results; and a destructive button should be recoverable.

### Recall before reveal reaches the list

`GET /cards` returns prompts only — no `back` — exactly like the due list and a run's question list. This is not caution about the management screen; it is that an index visited daily which ships every answer leaves D-003 one dev-tools glance from being defeated. The editor fetches a single card when it needs the answer.

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
POST   /api/notes                     create              (+ bulk-delete, bulk-restore)
GET    /api/notes/:id                 read
PATCH  /api/notes/:id                 update markdown
GET    /api/notes?q=&deleted=         list, Terhapus view  (D-056)
POST   /api/cards                     create              (+ bulk-delete, bulk-restore)
GET    /api/cards                     prompts only, never `back` (D-003)
GET    /api/categories                shared by notes and cards (D-055)
GET    /api/review/due                capped due list
GET    /api/review/due/:cardId/answer reveal, as its own request (D-003)
POST   /api/review/due/:cardId        {rating} → reschedule + log
GET    /api/review/sets?archived=     saved configurations (D-075)
POST   /api/review/sets/:id/runs      start; draw + options snapshotted (D-050)
POST   /api/review/runs/:id/:cardId   {rating} or {choice} → review_logs,
                                      graded server-side, schedule unmoved (D-049)
POST   /api/sessions                  log a completed focus session
GET    /api/domains                   per-user, editable (D-046)
GET    /api/stats/retention           headline metric
```

**A card is addressed by its own uuid.** It used to take a note *and* an ID together, because card IDs were unique only within the note they were parsed out of — the primary key was `(note_id, id)`. D-055 made cards their own resource with a uuid primary key, and the note segment went with it.

**The two index lists are paginated** (D-084). `GET /api/notes` and `GET /api/cards` take `?limit=` (default 50, capped at 200) and `?offset=`, and answer with an envelope rather than a bare array:

```json
{ "items": [ … ], "total": 312, "limit": 50, "offset": 0 }
```

`total` is how many rows match the filters before `LIMIT`, computed by a `count(*) OVER ()` on the list query itself — one round trip, and one copy of the `WHERE` clause, so the number and the rows cannot describe different sets. An offset past the end is an empty page with the real total, not a 400. Both lists order with `id` as a tiebreaker so a page boundary cannot land inside a tie. `?q=` searches titles on notes and both sides on cards, `ILIKE` against the trigram indexes; ranked full-text stays deferred (D-031). The settings lists — domains, categories — still answer with a bare array.

Public and account endpoints added by D-058:

```
POST   /api/auth/signup               behind ALLOW_SIGNUP; rate-limited
POST   /api/auth/verify               single-use token → email_verified_at
POST   /api/auth/forgot               always 204, known address or not
POST   /api/auth/reset                single-use token + new password
GET    /api/auth/sessions             active sessions; DELETE one or all (D-060)
POST   /api/account/export            markdown + JSON, everything (D-066)
DELETE /api/account                   deletion, export offered first (D-066)
```

**MCP server talks to the HTTP API with a token, never directly to Postgres.** Keeps the boundary honest and forces the API to actually be complete. It can be a separate small Go binary. Tokens are scoped to a user like any other credential.

### Auth (D-039, D-058, D-060)

- **argon2id** password hashing (`golang.org/x/crypto/argon2`)
- **Server-side sessions** in Postgres, not signed cookies — revocable, so logout actually logs out, and an active-sessions screen is a query rather than a feature
- Middleware resolves the session to a `userID` into the request context. Handlers cannot reach the store without one — every store method requires it as a parameter
- **The session ID rotates on login**, so a fixated session cannot survive authentication
- **Every unauthenticated write path is rate-limited** — login, signup, verify-resend, forgot-password — by IP *and* by target address. Per-IP alone lets an attacker mailbomb one victim from many hosts
- **Public signup is a flag.** `ALLOW_SIGNUP` is `true` on the public instance and `false` for a private deployment, which keeps the `cmd/konku seed-user` model. Default off — the correct default for a self-hosted box regardless of intent
- **Email verification is required before the account is usable.** The reset link is the only recovery path, so an unverified address is an unrecoverable account and an unverified signup form is a spam relay
- **Password reset** tokens are single-use, 1-hour, stored hashed, compared in constant time. `/forgot` answers identically for a known and an unknown address — the same existence-leak reasoning as the not-found rule
- No OAuth, no roles, no magic-link-only login (D-058)

### CSRF and browser hardening (D-060)

Same-origin (D-040) JSON with `SameSite=Lax; Secure; HttpOnly` already blocks the cross-site form POST and forces a preflight on the cross-site `fetch`. So there is **no synchroniser token**, and instead:

- Reject state-changing requests whose `Origin` is present and not ours, or whose `Content-Type` is not `application/json`
- `SameSite=Lax`, not `Strict` — `Strict` breaks arriving from a verification email, which D-058 makes a normal path
- A security-header middleware: CSP with no `unsafe-inline`, `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`; HSTS from Caddy
- `http.MaxBytesReader` on every request body. An unbounded note body is a memory-exhaustion primitive once anyone can sign up

**Revisit the token decision** if the API ever accepts form-encoded bodies or the frontend moves to a second origin. Either makes it necessary and the paragraph above wrong.

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

Handlers only ever see a `userID` and never know which credential produced it. MCP support in v1.3 is then a new *resolver*, not a new API surface.

### Contract

- Hand-written `web/src/api/types.ts` mirroring the Go structs, plus one `client.ts` wrapping `fetch`. OpenAPI codegen is deliberately skipped — real setup cost to solve a drift problem that does not exist at ~8 endpoints.
- **One error shape from every endpoint:** `{"error": {"code": "...", "message": "..."}}`. The client gets a single error path instead of per-endpoint special cases. `message` is user-facing and therefore in Bahasa Indonesia; `code` is stable and for the client to branch on.

---

## 7. Security

The threat model is small and specific: **one tenant reading another's knowledge base**, and **an account being taken over or locked out**. Everything below serves one of those two. Nothing here is defending against a nation-state; it is defending against one wrong `WHERE` clause and one reused password.

| Control | Mechanism | Decision |
|---|---|---|
| Tenancy (read) | `WHERE user_id = $n`, never fetch-then-check | D-039 |
| Tenancy (read, second layer) | RLS with `FORCE`, `SET LOCAL app.user_id` | D-059 |
| Tenancy (write) | Composite FKs `(user_id, x_id)` — Postgres rejects it | D-047 |
| Existence leaks | Wrong owner gets **404**, never 403 | D-039 |
| Passwords | argon2id | D-039 |
| Session theft | Server-side, revocable, rotated on login, `HttpOnly` | D-060 |
| CSRF | `SameSite=Lax` + origin and content-type checks | D-060 |
| XSS | React elements only, **never `innerHTML`, no `rehype-raw`**; CSP with no `unsafe-inline` | D-018, D-060 |
| Brute force | Per-IP **and** per-address rate limits on every unauthenticated write | D-058 |
| Resource exhaustion | `MaxBytesReader`, per-user quotas, pgx pool capped at 10 | D-028, D-066 |
| Leaked dump | Reset and verification tokens stored hashed, single-use, 1 h | D-058 |
| Vulnerable deps | `govulncheck` and `npm audit` in CI | D-061 |
| Secret rotation | Documented procedure; rotating `SESSION_SECRET` invalidates sessions rather than crashing | D-066 |

**Never logged:** request bodies, tokens, password hashes, email addresses. Logs carry a `user_id` and a request ID, which is enough to debug and not enough to leak (D-062).

**The markdown renderer is a security boundary.** `react-markdown` + `remark-gfm` emit React elements. Adding `rehype-raw` or reaching for `dangerouslySetInnerHTML` turns every note into stored XSS, and with multiple accounts it stops being self-inflicted (D-018).

---

## 8. Observability

Today the app has JSON `slog` to stdout, chi's `RequestID`, and `/api/health` pinging the database. Good start; not enough to operate against — nothing records how long a request took, nothing counts errors, and nothing says a deploy broke something except a user noticing (D-062).

### Logs

Request-logging middleware emitting method, path, status, duration, request ID, and `user_id` when there is one. **The request ID travels into the error response**, so a user's screenshot maps to a log query.

### Health

Two endpoints, not one — the current `/api/health` conflates them, which makes a database blip look like a dead container to anything watching:

| | Answers | Fails when |
|---|---|---|
| `/healthz` | Is the process alive? | The process is wedged. Restart it. |
| `/readyz` | Can it serve? | Database unreachable or migrations unapplied. Do **not** restart; look. |

### Metrics

`/metrics`, bound to localhost or behind auth. Request rate, latency histogram, error rate, and **pgx pool saturation** — the last one matters most, because D-028 caps the pool at 10 on a shared instance, so pool exhaustion is the likeliest way this app falls over.

### Errors and alerts

Sentry on panics and 5xx. A `Recoverer` writing to stdout on a box nobody reads is not an alert.

Three alerts, chosen because each has an action attached:

1. `/readyz` failing for 2 minutes → the service is down
2. 5xx rate above 0.1% for 5 minutes → something shipped broken
3. The nightly backup did not complete → the one failure that is otherwise silent

An alert that fires and gets ignored is worse than no alert, so the list stays this short until something real justifies a fourth.

**No distributed tracing.** One process, one database, no mesh — a latency histogram plus the request ID answers what a trace would. Revisit when the MCP server becomes a second deployable.

---

## 9. CI/CD and release

There is no `.github/` in this repository yet. Every rule this project has — `internal/srs` imports nothing, sqlc must not drift, the frontend must typecheck — is currently enforced by remembering to run `make check` (D-061).

**On every PR** (`ci.yml`), all required:

```
go vet ./...
go test ./...            # Postgres service container, integration tests included
make check-pure          # srs imports nothing from internal/
make sqlc && git diff --exit-code   # generated code matches the queries
govulncheck ./...
cd web && npm ci && npm run typecheck && npm run test && npm run build
npx playwright test      # core loop + auth flows, against the compose stack
docker build .           # a broken Dockerfile caught before deploy day
```

**Branch protection on `main`:** green CI required, no direct pushes.

**Release** (`release.yml`): a tag builds the image, pushes it to a registry, and the VPS deploys **that image by digest**. Never `docker build` on the VPS — it makes "what is running in production" unanswerable.

**Rollout:** back up → deploy → verify `/readyz` → keep the previous tag one command away. Migrations still run at startup, so a bad migration is the case the backup exists for; expand-then-contract for anything destructive.

**No auto-deploy on merge.** The gap between "tests pass" and "I want this live" is where a solo operator's judgment lives.

---

## 10. Testing strategy

Backend coverage is real — 13 test files, table-driven, integration tests against a live Postgres. **The frontend has zero tests**, and it is where the last two shipped bugs came from: a login rate limiter that was broken because nothing asserted a 429, and a mutation `onSuccess` returning the invalidate promise so a delete dialog would not close (D-063).

| Tier | Tool | Covers |
|---|---|---|
| Pure unit | `go test` | `internal/srs` — intervals, due list, retention, weekly streak |
| Integration | `go test` + Postgres | Every store method, `WithTx`, migrations up and down |
| API | `httptest` | Handlers, error shape, **one tenancy test per resource** |
| Frontend unit | Vitest + Testing Library | Date helpers, API client error path, timer, cache invalidation on every mutation |
| E2E | Playwright | Sign in → note → card → review → session → capture; signup → verify → reset |

**The tenancy test is not optional.** One per resource, asserting user B gets **404** for user A's row. With RLS landing (D-059), the same suite doubles as the proof that policies are actually on — which matters because a missing `FORCE ROW LEVEL SECURITY` makes every policy inert while every naive test still passes.

**Assert behaviour, not wiring.** The rate limiter shipped broken precisely because nothing asserted a 429.

**No coverage-percentage gate.** A number gates test volume, not test quality, and neither shipped bug above would have been caught by one. The gate is the table.

---

## 11. Infrastructure

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

### Backups — a backup is a restore you have performed (D-064)

- Nightly **per-database** `pg_dump -Fc konku` (not `pg_dumpall`) — restoring konku must not disturb other running projects
- Push off the VPS with restic → B2/S3, encrypted, with a retention policy. A backup on the same machine as the database is not a backup.
- **The job alerts on failure.** A silent cron that stopped working in March is the standard way this goes wrong, and it is the third of the three alerts in §8 for exactly that reason.
- **A restore drill every quarter**, into the dev database, timed, with the result written down in `docs/runbooks/`. What is being measured is RTO. An untested dump is a hypothesis.
- **Targets: RPO 24 h, RTO 4 h.** Modest on purpose — they are what a solo operator can honour, and a target missed quietly is worse than a modest one met.
- Account deletion propagates into backups as they age out (D-066).

### Runbooks (`docs/runbooks/`)

Written before they are needed, because the moment they are needed is the moment nobody is thinking clearly. One file each:

- **restore.md** — dump → dev database → verify login → timed result
- **rollback.md** — redeploy the previous image digest, and what to do when the bad release also migrated
- **secrets.md** — rotating `SESSION_SECRET` (invalidates sessions, must not crash the process), the database password, and SMTP credentials
- **incident.md** — how users are told, and where it gets written down afterwards

### Git vault export (second line of defense)

A background job writes the whole vault to `/var/lib/konku/vault/*.md` and commits to a local git repo.

Buys: free version history per note, an Obsidian-readable folder, and zero lock-in.

**Strictly one-way.** Writes only ever go through the API. Allowing edits both on disk and in the app creates a bidirectional sync problem with conflict resolution — a multi-week project that has sunk better-resourced apps. Resist it.

---

## 12. Build order

**Done.** Repo skeleton and dev compose · goose migrations and schema · auth with argon2id and server-side sessions · notes CRUD · **the scheduler** · cards as their own resource and shared categories (D-055) · review API and screen with recall-before-reveal · focus timer with capture-at-session-end · per-user domains · review sets with resumable runs · soft delete on both resources.

**Next, in order.** The sequencing rule is D-067's: use it daily starting now, build everything that needs no server, then deploy, then open. Steps 1–8 are **local**, against `docker-compose.yml`.

1. **CI** (§9) — first, because everything after it should be gated by it
2. **RLS** (§7) — the store-layer change (`WithUserTx`) is the largest single item; cheapest with the least data in the database
3. **Observability** (§8) — request logging, `/healthz` + `/readyz`, metrics, Sentry
4. **Browser hardening** (§7) — headers, origin checks, session rotation, body limits
5. **Test tiers** (§10) — frontend unit, e2e, tenancy suite, migration tests
6. **Local backup + runbooks** (§11) — daily use makes the dev volume real data, and `review_logs` cannot be reconstructed (D-029)
7. **Accounts** (D-058) — signup, verification, reset, sessions screen, against a local SMTP catcher
8. **Obligations** (D-066) — export, deletion, quotas, policy
9. **Deploy** — HTTPS, deploy-by-digest, backups on the box, **the real sending domain**, alert routing
10. **Two weeks from a phone**, then **`ALLOW_SIGNUP=true`**

Items 2 and 7 carry the correctness risk: RLS is where a subtle mistake silently disables the protection it appears to add, and auth flows are where a mistake locks people out of their own data. Item 9's mail configuration carries the *schedule* risk — it is the only thing here that cannot be verified before the deploy.

---

## 13. PWA scope

Three very different amounts of work — do not conflate them:

| | Effort |
|---|---|
| Installable + cached shell + offline **reads** | 1–2 days — do this |
| Timer works offline | free, it is client-side already |
| Offline **writes** with sync and conflict resolution | a project on its own — defer until genuinely needed |

Build offline writes when you are actually on a train with no signal wanting to review — not before.

---

## 14. Tripwires: when to move konku off the shared Postgres

None are on the horizon today, and the migration is a ten-minute `pg_dump` / `pg_restore` plus a connection-string change (D-024).

- Konku needs a different Postgres major version
- An extension requires a forked image (TimescaleDB, Citus)
- Real noisy-neighbor load in either direction
- Materially different backup RPO — likelier now: other people's data raises what a lost day costs (D-064)
- **Public signup is open and account growth is real.** The pool is capped at 10 for the sake of every other project on that box (D-028); sustained saturation is the signal, and §8's pool metric is what surfaces it

The one that is no longer a tripwire is "the app stops being single-user" — it already has, and shared Postgres is still the right call. What changes the answer is load, not tenancy.

**MongoDB is not used by konku.** It exists on the VPS for other projects. This app's data is relational in exactly the ways that matter — note → cards → schedules → logs, with card sync needing to commit transactionally alongside the note. Markdown being "document-shaped" is not a reason; it is a text column.
