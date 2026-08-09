# 06 — Production hardening

Everything that has to be true before a stranger's data is in the database.

**~42 h** · needs 05 · followed by `07-public-launch.md` · **the VPS is not
touched by any task in this file**

Nothing here adds a feature a user would notice. That is the point — this is
the gap between an app that works and a service that can be run (D-057). The
order below is not arbitrary: P1 changes the store layer and is cheapest with
the least data in the database, and P8 assumes the tests from P5–P7 exist.

**All of it is local**, against `docker-compose.yml` and GitHub Actions
(D-067). Where a task has a half that genuinely needs the box — alert routing,
the VPS side of the release pipeline — that half is named and deferred to
`04-ship.md` rather than blocking the local work.

**The prerequisite is behavioural, and it starts today.** Run `make db-up &&
make dev-api && make dev-web` and **use the app every day while doing this
work**. D-030's failure mode is not solved by deferring hardening; it is solved
by using the thing. If capture is not happening, fixing that outranks every
task below (D-067).

---

## P0 — CI skeleton

`done` · ~1 h · no deps · **do this first**

Branch protection is on `main`: the four CI checks are required, force-pushes
and deletions are off, `enforce_admins` is true. Reviews are required at a
count of **0** — a solo operator cannot approve their own PR, so a 1 there
deadlocks the repository rather than protecting it.

Moved here from `04-ship.md` — GitHub Actions needs no server, and it should be
gating every task below rather than arriving after them (D-067).

`.github/workflows/ci.yml` — the repo is on GitHub (`Katzelabs/Konku`) and
**nothing runs on push at all**; there is no `.github/` directory.

- Postgres service container (`pgvector/pgvector:pg17`) for integration tests
- `go vet ./...`, `go test ./...`, `make check-pure`
- `make sqlc && git diff --exit-code` — generated code must match the queries
- `cd web && npm ci && npm run typecheck && npm run build`
- `docker build .` so a broken Dockerfile is caught before deploy day
- **Branch protection on `main`:** green CI required, no direct pushes (D-061)

`make check-pure` in CI is the point: `internal/srs` importing nothing is the
one architectural rule, and rules that are not enforced decay. (It guarded
`internal/card` too, until D-055 deleted that package.)

The remaining gates — `govulncheck`, frontend tests, e2e — arrive in P8, once
those tests exist. Do not block this task on them.

**Done when:** a PR that makes `internal/srs` import `internal/store` fails CI,
and `main` cannot be pushed to directly.

---

## P1 — Postgres RLS

`done` · ~10 h · no deps · **the largest single item here**

**The dev `konku` role is a SUPERUSER with BYPASSRLS** — it is the Postgres
image's bootstrap user. `FORCE` does not apply to superusers, so connecting the
app or the tests as `konku` leaves every policy inert. The non-owner role was
not the "prefer" nice-to-have D-059 framed it as; without it this task ships
nothing. `make db-app-role` grants LOGIN, and the test harness **fails** rather
than skips if it finds itself on a BYPASSRLS role.

Two details that cost a debugging round each, recorded so they are not
rediscovered:

- **Postgres does not short-circuit `OR`.** A policy written as
  `setting IS NULL OR id = setting::uuid` still evaluates the cast and raises
  `invalid input syntax for type uuid: ""`. Both branches use the `NULLIF`
  form. The empty string, not "unset", is what a committed `SET LOCAL` leaves
  behind on a pooled connection.
- **`SET LOCAL` takes no bind parameters.** `set_config(..., true)` is the
  parameterised equivalent.

**On the "removing `FORCE` turns it red" criterion below:** it does not, and
cannot, once the app connects as a non-owner. `FORCE` only governs the *table
owner*; for `konku_app`, plain `ENABLE` already applies. The two requirements
in this task each make the other redundant for the app path. `FORCE` is still
correct — it is what protects against someone later pointing `DATABASE_URL` at
the owner — so it is asserted directly by `TestEveryUserTableIsProtected`
instead, as a schema invariant across every table carrying a `user_id`.

D-039 deferred this as "defense in depth, worth doing, not worth blocking the
MVP on." Correct then — the only data a scoping bug could leak was your own.
With other people's notes in the same tables, one forgotten `WHERE user_id`
stops being a bug and becomes a breach that has to be disclosed (D-059).

- Policy per owned table: `user_id = current_setting('app.user_id')::uuid`
- **`ALTER TABLE ... FORCE ROW LEVEL SECURITY` on every one of them.** A table
  owner bypasses its own policies by default and the app connects as the
  database owner, so without `FORCE` every policy is inert and every naive
  test of them passes
- A **non-owner application role** (`konku_app`), `GRANT`-ed only what it
  needs, so migrations and the running app are not the same principal
- `store.WithUserTx(ctx, userID, fn)` issuing `SET LOCAL app.user_id` — this
  is the real work. `SET LOCAL` is transaction-scoped, so every user-scoped
  read has to move inside a transaction, and today most of them do not
- History tables (`review_logs`, `exam_attempt_cards`) carry `user_id` and get
  policies like everything else, even though they have no FK to `cards`
  (D-050)

**The `WHERE user_id` predicate stays.** Two independent mechanisms is the
entire point; RLS *instead of* the application predicate is not obviously
safer than the application predicate alone.

**Done when:** the tenancy suite (P7) passes with the application `WHERE`
clause temporarily removed from one query, and fails if `FORCE` is dropped.
Both directions matter — the second is what proves the policies are on.

---

## P2 — Request logging, health, and metrics

`done` · ~5 h · no deps

`/api/health` is **gone**, not aliased — nothing but this document referenced
it. `/healthz` and `/readyz` sit outside `/api` because they are operational
endpoints, not product surface. `/readyz` also compares the live schema
version against the one this process migrated to, which is the only warning
you get when a rollback moves the schema underneath a running container.

`METRICS_ADDR` defaults to `127.0.0.1:9090` and is served by a **second
listener**, not a route with auth on it: a separate socket cannot be exposed
by a Caddy misconfiguration, and there is a test asserting the application
listener never serves Prometheus output.

Adds **prometheus/client_golang**, which D-065 requires be justified by an
obligation: pool saturation is unobservable without it, and D-028's cap of 10
on a shared instance makes exhaustion the likeliest way this falls over.

Today: JSON `slog` to stdout, chi's `RequestID`, and `/api/health` pinging the
database. A good start that cannot be operated against — nothing records how
long a request took, nothing counts errors (D-062).

- **Request-logging middleware**: method, path, status, duration, request ID,
  and `user_id` when there is one. Never the body, never a token, never an
  email address (hard rule 10)
- **The request ID travels into the error response**, so a screenshot maps to
  a log query
- **Split `/api/health` into `/healthz` and `/readyz`.** Liveness says the
  process is alive; readiness says the database is reachable and migrations
  applied. Conflated, a database blip looks like a dead container to anything
  watching, and the correct response to the two is opposite: restart versus
  do not restart
- **`/metrics`** (`prometheus/client_golang`), bound to localhost or behind
  auth: request rate, latency histogram, error rate, and **pgx pool
  saturation**. The pool is capped at 10 on a shared instance (D-028), which
  makes exhaustion the likeliest way this app falls over

**Done when:** you can answer "what was slow in the last hour" and "how close
is the pool to its cap" without adding code.

---

## P3 — Error tracking

`done` (instrumentation) · `todo` (a real DSN, and the three destinations in
`04-ship.md` S5) · ~3 h · needs P2

**Verified without a DSN, on purpose.** `sentry-go` accepts a custom
`Transport`, so the tests capture the event exactly as it would go over the
wire — same `BeforeSend`, same serialisation — and assert on the payload.
"No PII in it" is therefore a check that runs on every CI build rather than
something eyeballed once in the Sentry UI. A real DSN adds proof of delivery,
which is Sentry's job rather than this codebase's.

**Two mechanisms, and both were mutation-tested** (hard rule 9). Nothing that
could carry PII is ever attached — the event is built field by field, and no
code path reaches for `r.Header` or `r.Body`. `BeforeSend` then strips
`Request`, `User` beyond the id, breadcrumbs and `ServerName` on the way out
anyway. Breaking the first alone leaves the suite green; breaking both turns it
red. The second exists precisely because the first depends on everyone
remembering.

`/api/__panic` exercises the panic path end to end and is **dev-gated with a
test asserting it 404s when `Dev=false`** — an endpoint that reliably burns a
500 is a denial-of-service primitive handed over for free.

chi's `Recoverer` is replaced, so a panic now returns the standard error shape
with its request id instead of a stack trace on stdout.

A `Recoverer` writing to stdout on a box nobody reads is not an alert.

- Sentry on panics and 5xx, tagged with the release so a regression points at
  a deploy
- A dev DSN is enough to build and verify this — Sentry does not care that the
  process is on your laptop
- **Never send a request body, a token, or an email address** in the event
  context. Sentry makes it easy to attach the whole request; hard rule 10 says
  do not (D-062)

**The three alerts themselves need a real endpoint to watch and move to
`04-ship.md` S5** (D-067). Decide them here so the instrumentation supports
them, wire the destinations at deploy:

1. `/readyz` failing 2 min → the service is down
2. 5xx above 0.1% for 5 min → something shipped broken
3. The nightly backup did not complete → the only one otherwise entirely silent

**Decided here, so the instrumentation supports them:**

| Alert | Signal it reads | Exists? |
|---|---|---|
| Service down | `/readyz` non-200 for 2 min | yes — P2, and it fails on schema drift as well as an unreachable database |
| Shipped broken | `konku_http_requests_total{status="5xx"}` over the same by `status` | yes — P2, and the class label makes it a ratio rather than a regex |
| Backup did not complete | absence of a fresh dump in `$KONKU_BACKUP_DIR` | **no** — `make db-dump` is manual, so there is nothing to miss yet. The alert and the schedule arrive together in `04-ship.md` |

The third is the one worth stating plainly: it is currently the only one of
the three with no signal behind it, because nothing runs the backup on a
timer. Writing the alert now would be writing an alert that can never fire.

A fourth waits for something real to justify it. An alert that fires and gets
ignored is worse than no alert.

**Done when:** a deliberately panicking handler produces a Sentry event with a
request ID and no PII in it.

---

## P4 — Browser hardening

`done` · ~4 h · no deps

**The inline-style problem does not exist, and this was measured rather than
reasoned about.** The concern was that `style-src 'self'` blocks `style`
attributes, and five components set styles inline — two of them domain colours,
which are user data and the one documented exception to the token rule (D-053).

React does not emit a `style` attribute. `setValueForStyles` does
`node = node.style` and assigns properties, which is CSSOM, and **CSP does not
govern CSSOM**. Under the exact production policy:

| what the code does | result |
|---|---|
| `el.style.width = '50%'` — what React does | applied, **no violation** |
| `el.setAttribute('style', 'width: 50%')` | **blocked**, `style-src-attr` violation |

So D2 option (b) needed no code changes at all. The real application was then
loaded under the production policy in headless Chrome: React mounted, the
stylesheet and bundle both loaded, and **zero CSP violations**.

**The caveat that makes this true, and could stop being true:** it holds
because the app is client-rendered only. Server-side rendering would put
`style="..."` into the HTML, and every one of those five components would start
violating. If SSR is ever introduced, this decision has to be revisited.

`enforceOrigin` exempts **bodyless** requests from the Content-Type rule. That
is a deliberate narrowing: `POST /auth/logout` carries nothing, and demanding a
Content-Type describing no content is a strange requirement to put on a client
— including the Bearer-token consumer D-040 anticipates. It costs nothing,
because a bodyless cross-site POST is still stopped twice, by `SameSite=Lax`
and by the Origin check.

HSTS stays with Caddy, which is the only component that knows whether the
connection was actually TLS. Guessing from a forwarded header and getting it
wrong is not something you can take back within its `max-age`.

- Security-header middleware: CSP with **no `unsafe-inline`**,
  `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`. HSTS
  from Caddy
- Reject state-changing requests whose `Origin` is present and not ours, or
  whose `Content-Type` is not `application/json` — this is the CSRF control,
  and there is deliberately no synchroniser token (D-060)
- `SameSite=Lax`, not `Strict`: `Strict` breaks arriving from a verification
  email, which `07` makes a normal path
- **Session ID rotates on login**, so a fixated session cannot survive
  authentication
- `http.MaxBytesReader` on every request body. An unbounded note body is a
  memory-exhaustion primitive the moment anyone can sign up

Getting CSP right will require removing any inline style or script Vite emits.
Budget for that; it is the part that takes the time.

**Done when:** the app runs with no CSP violations in the console, a
cross-origin `fetch` with a valid cookie is refused, and the session ID before
login differs from the one after.

---

## P5 — Frontend tests

`done` · ~6 h · no deps

49 tests. Vitest + Testing Library + jsdom, `npm run test`.

**The timezone is pinned in `vitest.config.ts`.** The bug hard rule 5 guards
against — using `toISOString()` — only diverges from correct behaviour in a
timezone where local 23:00 has already rolled over in UTC. CI runs on UTC,
where a broken implementation and a correct one agree exactly, so an unpinned
suite would have passed while testing nothing at all.

**On the braces rule, the mechanism in CLAUDE.md is wrong.** It says the
failing refetch "rejects, and the `mutate` callbacks are then skipped
entirely". They are not skipped. `refetchQueries` wraps every fetch in
`.catch(noop)` unless `throwOnError` is set, and the app does not set it, so
the invalidate promise resolves either way. What actually happens is that
`mutate`'s callbacks — and the mutation's own `isSuccess` — wait for the
refetch and its full retry schedule to settle. Same symptom, different cause,
and the rule is just as important. The wording is worth correcting.

Two mechanisms (hard rule 9): a behavioural test that holds a refetch open and
shows the coupling, and a source check over every shipped `queries.ts` so a
*new* mutation written the wrong way fails without anyone remembering to test
it. The source check uses a capture rather than a negative lookahead, because
`=>\s*(?!\{)` looks correct and is not — `\s*` backtracks, the lookahead
succeeds against a space, and every well-written mutation is reported as an
offender.

**There are currently zero.** Both of the last two shipped bugs lived here:
the login rate limiter that was broken because nothing asserted a 429, and the
mutation `onSuccess` returning the invalidate promise so a delete dialog would
not close (D-063).

Vitest + Testing Library, on the parts where a bug is silent:

- `lib/date.ts` — local `YYYY-MM-DD`, the 11pm case explicitly
- The API client's error path — one error shape, and a 401 from `/auth/me`
  treated as "signed out" rather than an error
- The timer's state transitions
- **Every mutation's cache invalidation**, and that `onSuccess` uses braces.
  This is the one that would have caught the stuck dialog

**Done when:** `npm run test` exists, passes, and a mutation written with
`onSuccess: () => qc.invalidateQueries(...)` fails it.

---

## P6 — End-to-end

`done` · ~5 h · needs P5

Runs against the **built binary**, not the Vite dev server. That is the whole
value of this tier: it exercises the embedded assets, the SPA fallback, the
strict CSP and the origin check, none of which exist in front of `vite dev`. A
suite run against the dev server would pass on a build that cannot serve
itself. Two of the seven tests exist only for that — a console-error sweep
across six routes, and a deep link returning the shell rather than a 404.

`seed-user` gained **`-password-stdin`**, because e2e has no terminal to prompt
at. It is a flag that says "read stdin", not a flag that carries the password,
so the secret still never reaches `argv`, `ps` or shell history — the same
shape as `docker login --password-stdin`. The unasked-for pipe is still
refused; that check exists to catch an accident, and an explicit flag is not
one.

**A card written today is due tomorrow** (`srs.Intervals[0]` is 1), so the
review screen cannot be reached through the UI alone on the day a card is
created. The fixture moves the schedule forward rather than changing the
design; everything from the review screen onwards is the real interface. The
same applies to the timer: the shortest session is fifteen minutes, so the
finished state is seeded and the *capture prompt* is what gets tested.

**On the "breaking the review reveal makes it fail" criterion:** it takes
breaking *both* gates. Recall-before-reveal has two independent mechanisms —
the answer query is not enabled, and the element is not rendered — so
defeating either one alone still leaves the answer genuinely invisible, and
the suite still passes because nothing is actually wrong. With both defeated
the answer appears before it is asked for, and `toBeHidden` catches it.

Playwright, against the compose stack. The core loop only:

sign in → write a note → write a card → review it (reveal, then rate) →
run a session → capture at session end.

The auth flows from `07` get added there, not here — an auth flow that half
works locks people out of their own data, so it is tested with the feature.

**Done when:** `npx playwright test` runs green locally and in CI, and
breaking the review reveal makes it fail.

---

## P7 — Tenancy and migration suites

`done` · ~4 h · needs P1

Seven resources, every mutating and reading route on each, asserted over HTTP.
403 is checked for explicitly and reported as its own failure, because a
handler that returns "forbidden" turns the API into an oracle for other
people's ids — that is the failure this suite exists to catch, and it is not
the same failure as a wrong status code.

A second test covers the **lists**, which the per-resource probes cannot: a
scoping bug in a list leaks rows wholesale rather than one id at a time.

Both accounts are created once for the whole suite rather than per subtest.
Fourteen logins from `127.0.0.1` trip the login rate limiter, and the
resulting 429s look exactly like tenancy failures.

Migration tests run each case in its own scratch database, created and dropped
by the test, so a failure cannot leave the dev database half-migrated. Three
properties: the chain applies to an empty database (and lands with row
security actually on), each migration applies to the schema of the one before
it, and the last one rolls back **and re-applies** — a rollback you cannot
undo is a one-way door, and `rollback.md` is fiction without it (P10).

- **One tenancy test per resource** — notes, cards, categories, domains,
  exams, attempts, sessions, review. User B gets **404**, not 403, for user
  A's row (D-039). This is the suite P1 is verified against
- Every migration applies to an empty database **and** to the previous
  release's schema
- A test asserting `TestScheduleSurvivesCardEdit` still holds — it survived
  the parser's deletion because the property is what matters (D-055)

**Done when:** removing `AND user_id = $2` from any single query still leaves
the suite green (RLS caught it) and removing `FORCE ROW LEVEL SECURITY` turns
it red (the application predicate alone is not what is being tested).

---

## P8 — CI becomes the full gate

`todo` · ~2 h · needs P0, P5, P6, P7

P0 built the skeleton. Add what now exists to add:

- `govulncheck ./...` and `npm audit`
- `npm run test` (P5) and `npx playwright test` (P6)
- Keep every check required for merge

**Done when:** a PR with a known-vulnerable dependency, a failing frontend
test, or a broken review flow cannot be merged.

---

## P9 — Build and publish the release artifact

`todo` · ~2 h · needs P8

The half of the release pipeline that needs no server (D-067):

- `release.yml`: a tag builds the image and pushes it to a registry (GHCR)
- Verify the published image **runs against dev compose** — pull it by digest,
  point it at the local Postgres, hit `/readyz`. This is what catches a broken
  Dockerfile or a missing embedded asset before deploy day
- **No auto-deploy on merge.** The gap between "tests pass" and "I want this
  live" is where a solo operator's judgment lives (D-061)

**The VPS side — pulling by digest, rollout, rollback — is `04-ship.md` S3.**

**Done when:** a tag produces an image you have pulled by digest and run
locally, and `docker build` on a server is never required.

---

## P10 — Runbooks and the restore drill

`todo` · ~3 h · needs P11

Write the runbooks now, not when they are needed — the moment they are needed
is the moment nobody is thinking clearly (D-064). All four can be written and
three can be rehearsed without a server.

| File | Answers | Rehearsable now? |
|---|---|---|
| `restore.md` | Dump → database → verify login → timed result | **yes**, against dev compose |
| `rollback.md` | Redeploy the previous digest, including when the bad release also migrated | **yes**, using P9's local image run |
| `secrets.md` | Rotating `SESSION_SECRET` (invalidates sessions — must not crash the process), the database password, SMTP credentials | **yes** — verify rotation logs users out instead of panicking |
| `incident.md` | How users are told, and where it gets written down afterwards | writing only |

**Do the first restore drill against dev compose and time it.** What is being
measured is RTO, and the number in `PRD.md` §9 should be one you measured. The
drill repeats quarterly, and repeats against production once it exists.

**Done when:** you have restored a dump into an empty database from the runbook
without improvising, and rotating `SESSION_SECRET` logged you out rather than
crashing the process.

---

## P11 — Back up the local database

`done` · ~2 h · no deps · **do this early, not last**

**Deliberately local-only for now.** `make db-dump` writes outside the repo and
outside the Docker volume, which covers the two failure modes that are actually
likely today — `docker compose down -v` and a bad migration. It does **not**
cover losing the laptop. Restic to B2 is `04-ship.md`, where the same tooling
has to exist for the box anyway; doing it twice was the only alternative.

Daily use starts now and it is local (D-067), which means a Docker volume is
about to hold weeks of real notes and review history — the thing this project
exists to stop disappearing. `review_logs` in particular cannot be
reconstructed after the fact (D-029).

- A `make db-dump` target: `pg_dump -Fc` into a directory that is **not** the
  Docker volume and **not** the repo
- Somewhere off the machine. Even a synced folder counts at this stage; restic
  to B2 is better and is the same tooling `04` will use on the box
- Restore it once, into an empty local database (this is P10's drill)

Not gold-plating. Losing your first three weeks of real notes to a
`docker compose down -v` would be the most on-the-nose failure this codebase is
capable of.

**Done when:** `make db-dump` produces a file outside the volume, and you have
restored one.
