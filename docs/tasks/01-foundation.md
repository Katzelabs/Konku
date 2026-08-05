# 01 — Foundation

Database wiring, the store layer with tenancy, and auth. Nothing feature-shaped
works until this is done.

**~13 h** · blocks everything

---

## F1 — Open the pgx pool and run migrations at startup

`todo` · ~1.5 h · no deps

Replace the `TODO(MVP)` in `cmd/konku/main.go`.

- Add `jackc/pgx/v5` and `pressly/goose/v3`
- Open a `pgxpool` from `cfg.DatabaseURL`
- **Cap the pool: `MaxConns = 10`.** Postgres `max_connections` defaults to 100
  and this runs on a *shared* instance — an uncapped pool starves every other
  project on the box (D-028)
- `//go:embed migrations/*.sql` and run goose Up at startup, so deploy is just
  "run the binary"
- Close the pool in the existing graceful-shutdown path
- Fail fast and loud if migrations error — never serve against a half-migrated
  schema

**Done when:** `make db-up && go run ./cmd/konku` creates all 8 tables and the
5 seeded domains; `/api/health` still returns ok; SIGTERM closes the pool
cleanly.

---

## F2 — sqlc setup

`todo` · ~1 h · needs F1

`sqlc.yaml` does not exist yet.

- Config: engine postgres, queries `internal/store/queries/`, schema
  `migrations/`, output `internal/store/gen/`, `sql_package: pgx/v5`
- `emit_pointers_for_null_types: true` so nullable columns don't silently
  become zero values — `next_review_date` is NULL for mastered cards and
  reading that as `0001-01-01` would put mastered cards back in the due list
- Add `make sqlc` and wire it into `make check` so drift between SQL and Go
  fails CI rather than at runtime
- Commit `internal/store/gen/` — generated code is reviewed code

**Done when:** `make sqlc` regenerates cleanly and `go build ./...` passes.

---

## F3 — Store package, every method scoped by user_id

`todo` · ~3 h · needs F2

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

**Done when:** an integration test against the dev Postgres proves user A
cannot read, update, or delete user B's note — and gets *not found*, not
*forbidden*.

---

## F4 — argon2id password hashing

`todo` · ~1.5 h · needs F1

`internal/auth/password.go`. Add `golang.org/x/crypto`.

- `Hash(password) (string, error)` and `Verify(hash, password) (bool, error)`
- argon2id with a per-password random salt, encoded in the standard
  `$argon2id$v=19$m=...,t=...,p=...$salt$hash` form so parameters can be raised
  later without invalidating existing hashes
- Constant-time comparison
- Table-driven tests, including a wrong password and a malformed hash

**Done when:** hashing the same password twice gives different output and both
verify.

---

## F5 — Server-side sessions and auth middleware

`todo` · ~3 h · needs F3, F4

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

**Done when:** login sets a cookie, `/api/auth/me` returns the user, logout
makes the same cookie 401, and an authenticated route without a cookie is 401.

---

## F6 — seed-user CLI

`todo` · ~1 h · needs F4, F3

Finish `cmd/konku/seed_user.go`.

- Prompt for the password on stdin with `term.ReadPassword` so it never lands
  in shell history — do **not** accept it as a flag
- Confirm by re-entry, enforce a minimum length, hash with F4, insert
- Refuse politely if the email already exists

**Done when:** `go run ./cmd/konku seed-user -email you@example.com` creates an
account that can log in.

---

## F7 — Login screen

`todo` · ~1.5 h · needs F5

`web/src/features/auth/`.

- `LoginPage.tsx` — email, password, submit. Indonesian copy, plain and direct
- `useAuth.ts` — TanStack Query around `/api/auth/me`, mutations for
  login/logout
- Any 401 from the API client redirects here
- Errors show the server's `message` field verbatim; it is already Indonesian
- **No signup link.** There is no public signup in the MVP (D-039)

**Done when:** a wrong password shows a calm inline message — no red alarm
styling, per the never-punitive constraint — and a correct one lands on the
note list.
