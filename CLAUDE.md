# Konku

*Konsisten-ku* — "my consistency". The name is the thesis: small consistency beats occasional intensity.

Learning system. Multi-tenant but never social. One job: **nothing you learn disappears silently.**

Notes (markdown), flashcards as their own feature, a spaced-repetition scheduler over those cards, exams over existing cards, a focus timer, and MCP access so Claude can read and write the knowledge base directly. Notes and cards share categories and domains; neither contains the other (D-055).

Module: `github.com/Katzelabs/Konku` · Go 1.25 · remote `Katzelabs/Konku`

**This is built and operated like a production service** (D-057). Real accounts, real users, real obligations: CI as a merge gate, RLS behind the application's tenancy checks, observability, tested restores, self-service export and deletion. "It's just for me" is no longer an argument that closes a discussion.

What that does **not** change: every constraint from `GOALS.md` — never punitive, no gamification, no social, capture cost above everything — is now a *product* constraint rather than a personal preference. They were never justified by the audience being one person. There are no growth metrics, no engagement mechanics, and no cross-account analytics (D-066).

## Current state

**The MVP is built.** Notes, cards as their own feature, shared categories, the scheduler, review with recall-before-reveal, exams with resumable attempts, per-user domains, the focus timer with capture-at-session-end, soft delete with a Terhapus view, argon2id auth with server-side sessions. `01`, `02` (superseded by D-055), `03` and `05` are all done. 22+ tests pass across unit and integration.

**`06-production-hardening.md` is done** apart from two items that need the box itself: a real Sentry DSN (P3) and a real tag to publish to GHCR (P9). **`07` L1 is done** — migration `00007` adds `user_settings` and `auth_tokens`, verification and deletion-request columns on `users`, and the session-screen columns on `auth_sessions`.

**`07` L2 is done** — `internal/mail` over stdlib `net/smtp`, Resend in production (D-068), Mailpit behind a compose `dev` profile for local and CI testing. The app is served at `konkuapp.katzeapps.com` and sends as `konku@katzeapps.com`; `katzeapps.com` is shared across projects, verified once with Resend, and carries **transactional mail only**. **`07` L3 and L4 are done** — signup, verification, resend, password reset, `requireVerified` around every data route, and five signed-out screens.

**`07` L5 is done** — migration `00008` adds `auth_sessions.public_id`, and the sessions screen lists and revokes logins. The raw session id is the credential and never leaves the server; the list addresses sessions by `public_id` and computes "is this the current one" in SQL.

**`07` L6 is done** — `internal/export` builds the whole archive: notes and cards as markdown with YAML frontmatter, everything else as JSON, credentials never. `GET /api/export`.

**`07` L7 is done** — `DELETE /api/account` removes the account and everything it owns in one cascading statement. Not soft, no tombstone: migration `00009` drops `users.deleted_at`, which L1 had left open for this task. It is the only endpoint that re-authenticates.

**`07` L8 is done** — per-account caps on notes (5.000), cards (20.000) and write rate (300/min), all configurable, with `konku_quota_rejections_total` in the metrics. Body size was already bounded.

**`07` L9 is done** — `/privacy` and `/terms` written against what the code actually stores, with a coverage test that fails when a new feature stores something the policy does not mention. The status page is decided (email primary, a static page off the VPS secondary) but hosting it is `04` S5.

**`07` L1–L9 are complete. Next: `04-ship.md`**, then `07` L10.

**The order is deliberate and runs out of numeric sequence** (D-067). Almost nothing left needs the VPS — RLS, observability, security headers, the test pyramid, CI, signup, verification, reset, export, deletion and quotas are all local work against `docker-compose.yml`. What genuinely requires the box is short: the deploy itself, backups running there, **email deliverability** (SPF/DKIM/DMARC), the VPS half of the release pipeline, alert routing, phone access, and opening signup. So the local work happens first and `04-ship.md` becomes one careful afternoon.

**Daily use is not deferred.** It starts now, on `make dev-web`, and continues throughout the hardening work. D-030's failure mode — months building a learning tool and none learning — is solved by *using the app*, not by deferring the work. If capture is not happening, fixing that outranks every task in `06`. Two consequences: the **local database is now real data and needs a dump** (`06` P11), and laptop-only use is a weaker test than the original gate, which is why `04` S6 still exists.

What is genuinely missing right now, in case it looks otherwise: **the app has never been deployed**, there is no status page, and **signup is still closed** (`ALLOW_SIGNUP=false`). Those are `04-ship.md` and `07` L10. Everything else in `06` and `07` L1–L9 has landed.

Note: a card is addressed by its own uuid (`/api/review/{cardID}`). It used to take a note *and* an ID, because card IDs were unique only within the note they were parsed out of.

Deferred, and **do not reintroduce**: cloze/feynman card types, full-text search, MCP, in-app LLM (D-031, D-055). Standalone card CRUD makes a type picker easy, which is exactly why the deferral is restated in D-055. Public signup and password reset are **no longer deferred** — they are `07` (D-058). Domains UI is no longer deferred either (D-046).

## Read these first

| Doc | What it is |
|---|---|
| `docs/GOALS.md` | Where the design comes from — the five problems this exists to solve. **Read first.** Written in Indonesian. Its rules are product constraints now (D-057). |
| `docs/tasks/` | **Execution plan** — build order, acceptance criteria. What to build next. |
| `docs/DECISIONS.md` | Why things were decided, and **what was rejected**. Check before proposing anything — a lot of obvious-seeming ideas were cut deliberately. D-057 – D-066 are the production shift. |
| `docs/PRD.md` | Product: features, priorities, milestones, operational targets |
| `docs/TECH.md` | Architecture, data model, security, observability, CI/CD, testing, infra |
| `docs/DESIGN.md` | **The design system** — tokens, components, and the rules. Read before touching any UI. |
| `docs/runbooks/` | Restore, rollback, secret rotation, incident. Written before they are needed. |

## Commands

```bash
make db-up             # dev Postgres on :5433
make dev-api           # Go on :8080
make dev-web           # Vite on :5173  ← open this one
make check             # vet, typecheck, tests, purity, sqlc drift
make test-integration  # needs make db-up first
make sqlc              # after editing internal/store/queries/*.sql
make db-dump           # pg_dump -Fc into $KONKU_BACKUP_DIR (refuses inside the repo)
make db-restore        # restore the newest dump into konku_restore
go run ./cmd/konku seed-user -email you@example.com
```

## Hard rules

1. **`internal/srs` imports nothing from `internal/`.** It carries the product's value and stays trivially testable. `make check-pure` enforces it. (It guarded `internal/card` too, until D-055 deleted that package.)
2. **Editing a card's text never resets its schedule.** Fixing a typo must not destroy review history — silent and unrecoverable. Stable IDs used to provide this; the uuid primary key provides it now, and `TestScheduleSurvivesCardEdit` guards it either way (D-019 → D-055).
3. **A note or card and its category links commit in one transaction.**
4. **Every query is scoped by `user_id` in the `WHERE` clause**, never fetch-then-check. A wrong owner gets *not found*, never *forbidden* — otherwise the API can be used to probe for other users' data (D-039). RLS backs this up; it does not replace it (D-059).
5. **Dates are local `YYYY-MM-DD`.** An 11pm session belongs to that day.
6. **Never punitive.** No guilt copy, no shaming empty states, no aggressive red, no losable streaks, no gamification. A missed day is normal and the UI treats it as normal. Product constraint from `GOALS.md`, not a preference (D-057).
7. **Capture cost is the thing to protect.** Anything that adds friction to writing a note or a card works against the product.
8. **User-facing copy in Bahasa Indonesia. Code, comments, commits, docs in English.**
9. **Every guarantee has two mechanisms or it is a hope.** Tenancy is the `WHERE` clause *and* RLS; cross-tenant writes are handler validation *and* composite foreign keys (D-047); the rules here are written down *and* enforced by `make check` in CI. One mechanism plus discipline is what fails at 2am.
10. **Logs never carry a request body, a token, a password hash, or an email address.** A `user_id` and a request ID are enough to debug and not enough to leak (D-062).
11. **Other people's learning history is never aggregated.** Every metric is computed per account, for that account. It would be the most useful data set this product could have, and that is not a reason (D-066).

## Conventions already established — follow them

**Data access.** `store.Q()` returns the sqlc queries; `store.WithTx(ctx, fn)` for transactions. Write SQL in `internal/store/queries/*.sql`, run `make sqlc`. **Never hand-edit `internal/store/gen/`.** No hand-written passthrough wrappers around generated code — the `user_id` in the SQL is what enforces tenancy.

**Dates.** `internal/store/date.go` (`ToTime`, `ToTimePtr`, `FromTime`, `FromTimePtr`) is the *only* place a date crosses between `srs.Date` and `time.Time`. It uses UTC exclusively. Never call `In()`, `Local()` or `UTC()` on a date elsewhere. An empty `srs.Date` means "not scheduled" and maps to SQL NULL.

**HTTP.** Handlers are plain `http.HandlerFunc`. Use `writeJSON` / `writeError` / `writeInternal` / `writeNotFound` — one error shape `{"error":{"code","message"}}`, with `message` user-facing and therefore Indonesian. Authenticated handlers get the user from `api.UserFrom(ctx)`. New authenticated routes go inside the `requireUser` group in `server.go`.

**Errors.** Wrap with `%w` and a package prefix (`fmt.Errorf("store: ...: %w", err)`). Internal errors are logged, never returned to the client verbatim.

**Tests.** Table-driven. Integration tests live beside their package, skip unless `TEST_DATABASE_URL` is set, and clean up via `t.Cleanup`. Assert behaviour, not wiring — the login rate limiter shipped broken precisely because nothing asserted a 429, and a delete dialog shipped stuck because nothing asserted that it closed.

**A new resource ships with a tenancy test.** One test asserting user B gets **404**, not 403, for user A's row (D-039). It is the one test that is not negotiable, and once RLS lands it doubles as the proof that policies are actually on — a missing `FORCE ROW LEVEL SECURITY` leaves every policy inert while naive tests still pass (D-059).

**Security.** Never `dangerouslySetInnerHTML`, never `rehype-raw` — the markdown renderer emits React elements and that is what keeps a note from being stored XSS (D-018). Every unauthenticated write path is rate-limited by IP *and* by target address. Request bodies are bounded by `http.MaxBytesReader`. Auth tokens are stored hashed, single-use, and expiring (D-058).

**Observability.** New failure paths get a log line with the request ID and an actionable message, not a swallowed error. `slog` is already JSON to stdout. Handlers return the one error shape; internal detail goes to the log, never to the client (D-062).

**Frontend.** Feature folders under `web/src/features/`. TanStack Query owns all server state; `useState`/Zustand only for genuine client state, which is essentially just the timer (D-044). A 401 from `/auth/me` is a normal "signed out" answer, not an error.

**A one-shot action driven by the URL is a query keyed by that URL value, not a mutation** — even when it POSTs. `main.tsx` wraps the app in `StrictMode`, so in dev React mounts, unmounts and remounts everything, and a mutation's observer does not survive that: the result of a call that already succeeded is discarded and the screen sits on its spinner forever. Email verification shipped that way and hung on the one screen a new account cannot get past. Keying by the token fixes both halves — React Query shares the in-flight promise so the double mount cannot fire twice, and the settled result is cached so the remount reads it (`useVerifyToken`).

A mutation's `onSuccess` must **never return the invalidate promise** — always braces: `onSuccess: () => { qc.invalidateQueries(...) }`. TanStack Query awaits whatever that callback returns before it runs the callbacks passed to `mutate`, so returning it makes them wait on a refetch. After a delete that refetch asks for the row just deleted, takes a 404 and rejects, and the `mutate` callbacks are then skipped entirely. The symptom is a dialog that will not close and a panel left open on something that no longer exists — the mutation itself succeeded, so nothing looks wrong on the server side.

**Design system.** Tailwind **v4** — tokens live in `web/src/styles/theme.css`, there is no `tailwind.config.js`. Build screens from `web/src/components/ui/`; a raw palette class (`bg-slate-100`, `text-red-500`) or a hex value in a feature folder is a bug in the token file, not a shortcut. Domain colours are the one exception — they are user data. See `docs/DESIGN.md` and the live style guide at `/design` (dev only). The palette has no green and no `success` token on purpose (D-054).

## Stack

Go + **chi** (single binary, monolith) · Postgres 17 + pgvector via **pgx + sqlc** · **goose** migrations, embedded and run at startup · stdlib `log/slog` · React + TS + Vite + **Tailwind v4** + **TanStack Query**, embedded via `go:embed` · Caddy · Docker Compose.

`go.mod` at repo root, React in `web/` (D-032). Vite writes straight into `internal/web/dist` — no copy step. Non-stdlib backend deps today are exactly **chi, pgx, goose, x/crypto, x/term, google/uuid**; `06` adds **prometheus/client_golang** and **sentry-go**, and nothing else without an argument. Frontend runtime deps beyond React/Router/Query are **clsx, tailwind-merge, cva, lucide-react, react-markdown, remark-gfm** and three Radix packages (dialog, slot, switch) — same discipline (D-053). The markdown pair replaced a hand-written renderer and must keep its property: **React elements, never `innerHTML`, and no `rehype-raw`** (D-018). No ORM (D-043), no Gin/Echo/Fiber (D-042), no Redis (D-023), no MongoDB (D-027), no Node process in production (D-041).

**The dependency budget was amended, not abandoned** (D-065). The rule that replaced "keep the list short": a new dependency names the production obligation it discharges, or it does not go in. "Everyone uses it" is not an obligation. Logging, config, email (`net/smtp`), validation, rate limiting and DI all stay stdlib.

Prod runs on a self-hosted VPS against a **shared** Postgres (own database + own role), so the pgx pool is capped at 10 connections — an uncapped pool can starve every other project on the box (D-028). Pool saturation is the likeliest way this app falls over, which is why it is the metric worth watching (D-062). Dev compose ships its own Postgres on 5433.

## Gotchas

- `internal/web/dist/.gitkeep` is committed and **must stay** — `//go:embed all:dist` is a compile-time error on a missing directory, so a fresh clone would not build. Vite's `emptyOutDir` deletes it; `make build` puts it back.
- `make` runs each recipe line in its own shell — a guard clause with `exit 0` does not skip the following line.
