# 01 — Foundation

Database wiring, the store layer with tenancy, and auth. Nothing feature-shaped
works until this is done.

**Complete.** ~13 h · unblocked 02 and 03

---

## F1 — Open the pgx pool and run migrations at startup

`done` · ~1.5 h · no deps

**Delivered:**

- `migrations/embed.go` — the migrations directory is now a Go package, so the
  `.sql` files stay usable by the goose CLI (`make migrate-up`) *and* get
  embedded in the binary
- `internal/store/store.go` — `Open` parses, caps and **pings** before
  returning, so a bad database fails at startup instead of on first request
- `internal/store/migrate.go` — goose over a `*sql.DB` borrowed from the same
  pgx pool via `stdlib.OpenDBFromPool`, with goose's output routed through
  `slog` so startup logs stay structured
- `/api/health` now pings the database — a health check that cannot fail tells
  you nothing

**Verified:**

| Check | Result |
|---|---|
| 8 tables + `goose_db_version` created | ✅ |
| 5 domains seeded, `coding` at quota 0 (D-034) | ✅ |
| Restart is idempotent | `schema up to date, version 1` |
| **Pool cap under 25 concurrent requests** | **exactly 10 backends** |
| SIGTERM releases connections | 1 → 0 backends |
| Unreachable DB / bad credentials / malformed URL | clear error, **exit 1** |

Exit 1 matters: `restart: unless-stopped` then retries, and a broken deploy
fails loudly instead of serving 500s.

**Note for F2 —** `go get` bumped the go directive to **1.25.7** (goose
requires it). The Dockerfile pin moved `golang:1.24-alpine` → `1.25-alpine`.
CI (S1) must use 1.25.

---

## F2 — sqlc setup

`done` · ~1 h · needs F1

`sqlc.yaml` does not exist yet.

- Config: engine postgres, queries `internal/store/queries/`, schema
  `migrations/`, output `internal/store/gen/`, `sql_package: pgx/v5`
- `emit_pointers_for_null_types: true` so nullable columns don't silently
  become zero values — `next_review_date` is NULL for mastered cards and
  reading that as `0001-01-01` would put mastered cards back in the due list
- Add `make sqlc` and wire it into `make check` so drift between SQL and Go
  fails CI rather than at runtime
- Commit `internal/store/gen/` — generated code is reviewed code

**Delivered:** `sqlc.yaml` with overrides applied **by `db_type`, not by
column** — otherwise `sqlc.arg(today)` comes back as `pgtype.Date` and every
caller has to convert. `uuid` → `uuid.UUID`, `timestamptz` → `time.Time`,
`date` → `time.Time`.

`make sqlc-diff` is wired into `make check`, so stale generated code fails the
build instead of surfacing at runtime.

**Correction to the plan:** dates could not be mapped to `string`. pgx cannot
decode a Postgres `date` (OID 1082) into a string in binary format. They map to
`time.Time` and `internal/store/date.go` converts to and from `srs.Date` at the
boundary, UTC only — the *only* place in the codebase that conversion happens.
Everything above the store still deals in local `YYYY-MM-DD`. Guarded by
`TestNoTimezoneShift`, which checks both an east-of-UTC early morning (Jakarta,
the user's own timezone) and a west-of-UTC late night.

---

## F3 — Store package, every method scoped by user_id

`done` · ~3 h · needs F2

`internal/store/` is empty. This is where D-039 is enforced or lost.

- `store.go`: the pool, plus a `WithTx(ctx, fn)` helper — F5 and C3 both need
  real transactions
- Write the SQL in `queries/*.sql`; sqlc generates the Go
- **Every method takes a `userID` and puts it in the `WHERE` clause.** No
  method may be callable without one — that is the whole tenancy model
- **Never fetch-then-check.** `WHERE id = $1 AND user_id = $2` returns
  "not found" for another user's row, so the API cannot be used to probe
  whether someone else's note exists

Methods needed by the MVP: create/get/update/list notes; upsert/soft-delete
cards; get/update card schedules; list due schedules; insert review log;
insert focus session; user + session CRUD for auth.

**Delivered:** queries in `internal/store/queries/{users,notes,cards,sessions}.sql`,
generated into `internal/store/gen/`, plus `WithTx` for the C3 sync
transaction.

**No hand-written passthrough wrappers.** Every query carries `user_id` in its
`WHERE` clause, so the generated params structs cannot be built without an
owner — the tenancy rule is enforced by the SQL itself rather than by a layer
of boilerplate that could forget it.

**Verified** (`make test-integration`, against the dev Postgres):

| Test | Guards |
|---|---|
| `TestTenantIsolation` | read / update / delete / list of another user's note all return `ErrNoRows` — *not found*, never *forbidden* (D-039) |
| `TestScheduleSurvivesCardEdit` | editing card text leaves `stage` and `next_review_date` untouched (D-019) |
| `TestSoftDeleteRestoresHistory` | deleting a card line and restoring it brings its schedule back |
| `TestWithTxRollsBack` | a mid-transaction failure leaves nothing behind |
| `TestDueCardsExcludeMastered` | NULL `next_review_date` stays out of the due list |

Integration tests skip unless `TEST_DATABASE_URL` is set, so `go test ./...`
stays green without Docker. `make test-integration` runs them.

---

## F4 — argon2id password hashing

`done` · ~1.5 h · needs F1

`internal/auth/password.go`. Add `golang.org/x/crypto`.

- `Hash(password) (string, error)` and `Verify(hash, password) (bool, error)`
- argon2id with a per-password random salt, encoded in the standard
  `$argon2id$v=19$m=...,t=...,p=...$salt$hash` form so parameters can be raised
  later without invalidating existing hashes
- Constant-time comparison
- Table-driven tests, including a wrong password and a malformed hash

**Delivered:** `internal/auth/password.go`. PHC-encoded
`$argon2id$v=19$m=65536,t=3,p=N$salt$hash`, per-password random salt,
constant-time compare. Verify uses the **stored** parameters rather than the
current constants, so raising the tuning later does not lock anyone out of
their own account — covered by `TestVerifyUsesStoredParams`.

6 tests including malformed hashes, a bcrypt hash, and a wrong argon2 version.

---

## F5 — Server-side sessions and auth middleware

`done` · ~3 h · needs F3, F4

`internal/auth/session.go` and `middleware.go`.

- Sessions live in Postgres, not signed cookies — logout must actually revoke
  (D-039). Random 256-bit ID, `expires_at` from `cfg.SessionTTL`
- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` unless `cfg.Dev`, `Path=/`
- Middleware resolves **cookie *or* `Authorization: Bearer`** to a `userID` in
  the request context. Handlers never learn which was used — that is what makes
  the v0.3 MCP server a new resolver rather than a new API surface (D-040)
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- **Rate-limit login** — the only unauthenticated write path in the app.
  In-memory per-IP is fine for one user
- Expired sessions are deleted lazily on lookup; no cron needed at this scale
- Uncomment the `requireUser` group in `internal/api/server.go`

**Delivered:** `internal/auth/session.go` (domain) + `internal/api/auth.go`
(HTTP) + `internal/api/ratelimit.go`. The split keeps cookies and middleware
out of the auth package.

Login always runs a password verification even when the email is unknown, so
response timing does not reveal whether an account exists. Both failures return
an identical body — verified by `TestLoginFailuresAreIndistinguishable`.

**Bug found and fixed by the tests:** the rate limiter keyed on
`r.RemoteAddr`, which is `IP:port`. The source port changes with every TCP
connection, so each login attempt got its own bucket and rate limiting was
silently a no-op. It only worked behind Caddy, where chi's RealIP rewrites
RemoteAddr to a bare IP — i.e. it failed exactly when the proxy was bypassed,
which is when it matters most. Now strips the port via `net.SplitHostPort`.

Also corrected: an unauthenticated request used to be told its session had
expired, which is wrong for someone who never signed in.

---

## F6 — seed-user CLI

`done` · ~1 h · needs F4, F3

Finish `cmd/konku/seed_user.go`.

- Prompt for the password on stdin with `term.ReadPassword` so it never lands
  in shell history — do **not** accept it as a flag
- Confirm by re-entry, enforce a minimum length, hash with F4, insert
- Refuse politely if the email already exists

**Delivered:** prompts twice with `term.ReadPassword`, enforces 12 characters,
and **refuses to read from a pipe** — a piped password defeats the point of
keeping it out of shell history. Reports a duplicate email as a plain message
rather than a Postgres constraint error.

---

## F7 — Login screen

`done` · ~1.5 h · needs F5

`web/src/features/auth/`.

- `LoginPage.tsx` — email, password, submit. Indonesian copy, plain and direct
- `useAuth.ts` — TanStack Query around `/api/auth/me`, mutations for
  login/logout
- Any 401 from the API client redirects here
- Errors show the server's `message` field verbatim; it is already Indonesian
- **No signup link.** There is no public signup in the MVP (D-039)

**Delivered:** `web/src/features/auth/{LoginPage.tsx,useAuth.ts}`, with `App.tsx`
switching on session state.

A 401 from `/auth/me` is treated as a **normal answer** meaning "signed out",
not an error — otherwise the app flashes a failure state on every cold load for
a logged-out visitor. Logout calls `queryClient.clear()` so one account's
cached notes cannot leak into the next session. Errors render in slate, not
red, per the never-punitive constraint.
