# 07 — Public launch

The account surface and the obligations that come with other people's data.

**~26 h** · needs `06-production-hardening.md`

Nothing here makes the product better for the person already using it. All of
it is required before anyone else can (D-058, D-066). The copy is still
Indonesian and still non-punitive — a verification screen that scolds you for
not clicking the link is a guilt mechanic like any other.

**L1–L9 are local** and run before the deploy (D-067) — built and tested
against `docker-compose.yml` with a local SMTP catcher. **L10 runs after
`04-ship.md`**, because opening signup on an app that is not deployed is not a
thing you can do.

The one item that cannot be finished locally is **deliverability** (L2). Build
against a catcher; the first real send is `04-ship.md` S4 and it carries real
risk — verification mail landing in spam is an outage that looks like a signup
bug.

---

## L1 — Schema and settings

`done` · ~3 h · no deps · migration `00007_accounts_and_settings.sql`

The tables the rest of this file needs, plus the open question that has been
sitting in `DECISIONS.md` since schema v2.

```sql
users            -- + email_verified_at, deleted_at
user_settings    -- user_id, default_duration_minutes, focus_step_n, rota_enabled
auth_sessions    -- + created_at, last_seen_at, user_agent, ip
auth_tokens      -- id, user_id, kind ('verify'|'reset'), token_hash,
                 -- expires_at, used_at
```

`auth_tokens` stores a **hash**, never the token. A leaked database dump must
not be a set of working password-reset links.

`user_settings` closes the "per-user settings have nowhere to live" open
question — progressive-focus N, default timer duration and rota preference
were constants under one user, and both the account screen and the export need
somewhere to hang.

**Done when:** migration applies clean, and the tenancy suite (P7) covers the
new tables. ✓ — `v7` applies to the `v6` schema and rolls back and reapplies;
`TestEveryUserTableIsProtected`'s floor moved 14 → 16, so both new tables are
proven to have forced RLS and a policy rather than passing vacuously.

Three things settled while building it, worth knowing before L3, L5 and L7:

- `auth_sessions.created_at` **already existed** (`00001`). L1 listed it
  because the session screen needs it, not because it was missing.
- **`auth_tokens.token_hash` is SHA-256, not argon2id.** The token is 256 bits
  of CSPRNG output, so there is no weak input to slow an attacker against;
  argon2 would cost every verification click ~100 ms to defend a space that
  cannot be searched. Password hashing is slow because passwords are weak.
- **Existing accounts are backfilled as verified**, from `created_at`. They were
  created by `konku seed-user`, which is a stronger check than clicking a link.
  Without the backfill, L3 ships and locks the only real account out, with no
  way back in because the reset flow it would need is also L3.

**Open, and L7's to answer:** `users.deleted_at` sits awkwardly against L7's
"deletion is not soft" and its acceptance that no row referencing the old
`user_id` remains. It is built as a marker for a deletion *request*, so lockout
and purge can be separate — the account stops working the moment the user
confirms, and the rows go when the job runs. If L7 decides delete should be one
transaction, the column comes out.

---

## L2 — Mail

`done` · ~3 h · needs L1 · sending domain `katzeapps.com`, registered and
verified with Resend

`internal/mail`, stdlib `net/smtp` against a transactional provider. An SDK
for "send one templated message" is not a trade worth making (D-065).

Two templates, both Indonesian: verification and password reset. Plain text
plus a minimal HTML part.

**Add an SMTP catcher to `docker-compose.yml`** (Mailpit or equivalent, dev
profile only) so the whole flow — send, open, click, verify — is testable
locally and in e2e. `SMTP_URL` in config, pointed at the catcher in dev and at
the provider in production.

**Deliverability is the risk, not the code, and it cannot be tested here**
(D-067). SPF, DKIM and DMARC on a real sending domain are `04-ship.md` S4.

**The provider is decided: Resend, over SMTP, on its own account and its own
domain (D-068).** Resend's SMTP endpoint is why `net/smtp` is enough. Its own
account because the free tier allows one domain and because two projects should
not lose signup together; its own `.com` because cheap TLDs are filtered harder
than correct SPF/DKIM/DMARC can compensate for.

**Buy the domain before starting this task.** DNS verification is wall-clock
delay rather than work, and `04` S1 needs the hostname for Caddy regardless.

**Done when:** signing up locally puts a verification mail in the catcher, and
clicking its link verifies the account. Half of that is L3's — signup does not
exist yet. What is provable today, and is: `make test-mail` sends both messages
through Mailpit and reads them back out of its API with working links in both
MIME parts. CI runs the same thing against a Mailpit service container, so the
send path is gated rather than merely runnable.

Shipped: `internal/mail` (`mail.go`, `message.go`, `templates.go`),
`SMTP_URL` / `MAIL_FROM` / `PUBLIC_BASE_URL` in config, Mailpit behind a
compose `dev` profile, `make mail-up` / `make test-mail`.

Four things settled while building it:

- **`ALLOW_SIGNUP=true` without `SMTP_URL` and `MAIL_FROM` now refuses to
  start.** Open signup with no transport creates accounts that can never be
  verified and never be recovered, and the failure is silent from the
  operator's side because signup itself succeeds. Asserted in
  `internal/config/config_test.go`.
- **No error in `internal/mail` carries the recipient address** (hard rule 10).
  A rejected recipient is the natural place to write one, and the error reaches
  the log the moment a handler logs it. There is a test whose only job is that.
- **Both MIME parts always exist.** An HTML-only message is a well-known spam
  signal, and deliverability is the whole risk here — so it is a test, not a
  formatting preference.
- **The copy has a non-punitive test.** Hard rule 6 applied to the surface
  where guilt copy arrives disguised as urgency: expiry is stated once as a
  fact, "abaikan saja email ini" reassures, and a small banned-words list keeps
  countdown language out.

**The sending identity is settled** (D-068): `katzeapps.com`, one domain shared
across every project and verified once with Resend, with projects separated by
the local part rather than by subdomain. Konku sends as
`konku@katzeapps.com` and is served at `konkuapp.katzeapps.com`.

That domain sends **transactional mail only**. Every project on it shares one
sender reputation and one DMARC policy, so a campaign from any of them
degrades the message that gates account creation here — and the symptom is new
accounts that look stuck with nothing wrong in the logs.

**What remains is not code:** put the real
`smtps://resend:…@smtp.resend.com:465`, `MAIL_FROM` and `PUBLIC_BASE_URL` in
the production environment, and confirm SPF, DKIM and DMARC. The first real
send is `04` S4 and still carries its own risk.

---

## L3 — Signup and verification

`done` · ~5 h · needs L2

- `POST /api/auth/signup`, behind `ALLOW_SIGNUP` (still `false` at this point)
- Creates the account **unverified**, seeds the five default domains the way
  `seed-user` does (D-046), sends the verification mail
- **Verification is required before the account is usable.** Not politeness:
  the reset link is the only recovery path there is, so an unverified address
  is an account that can never be recovered, and an unverified signup form is
  a free spam relay pointed at whatever address an attacker types
- `POST /api/auth/verify` — single-use token, marks `email_verified_at`
- Resend, rate-limited **by address as well as by IP**. Per-IP alone lets an
  attacker mailbomb one victim from many hosts

Signup and resend are unauthenticated write paths, so both go through
`internal/api/ratelimit.go` alongside login.

**Done when:** signing up twice with the same address does not leak that the
first one exists, and an unverified account cannot read or write anything. ✓ —
both are tests in `internal/api/signup_test.go`, the first asserting equal
status, equal body *and* that no second message goes out, the second sweeping
nine routes across every family and requiring 403 with `email_unverified`.

Shipped: `POST /api/auth/signup`, `/auth/verify`, `/auth/resend-verification`,
`requireVerified` around every data route, `auth.Signup` / `VerifyEmail` /
`ResendVerification`, and the `auth_tokens` queries from L1.

Decisions taken while building it:

- **Two ways to create an account, and they differ in verification state.**
  `konku seed-user` creates a *verified* account — the operator typed the
  address at a shell, which is a stronger check than clicking a link. Signup
  creates an unverified one. This is also what keeps the existing test suite
  meaningful rather than blanket-verified.
- **An unverified account can still log in**, and `/auth/me` and `/auth/logout`
  stay reachable. Without that the client has no way to render "check your
  mail" or let someone sign out of it. Everything touching stored content is
  behind `requireVerified`, which is a route group, so a new route is covered
  by default rather than when somebody remembers.
- **403 with `email_unverified`, not 404.** Hard rule 4's not-found rule is
  about another account's rows, where the status is itself information. Here
  the caller is asking about their own account.
- **Verify has its own, looser limiter (30/h) than signup and resend (5/h).**
  It is the one route here that sends nothing, and guessing a 256-bit token is
  not a threat a rate limit addresses — a tight limit would only punish a
  shared office or household IP.
- **A failed send does not fail signup.** The account is committed first, so a
  500 would claim signup did not work when it did, and the retry hits the
  taken-address path, which answers 204 and sends nothing. That is a dead end;
  a logged failure plus a working resend is the recoverable shape.

**The screens**, `web/src/features/auth/`: `SignupPage`, `VerifyPage`,
`VerifyPendingPage`, a shared `AuthLayout`, and a signup link on `LoginPage`
that only appears where signup is open. `App.tsx` routes them: `/verify` is
checked before the session, because the link is opened from a mailbox and
whoever clicks it may be signed out, unverified, or already done.

`GET /api/auth/config` was added for one boolean — `allowSignup`. Without it
the login screen must either show a link that 404s on a closed instance or hide
one that works, and guessing from a failed POST means the user finds out after
filling in the form.

**Two copy rules the screens are tested against**, because both are easy to
break by making the wording friendlier: signup may not say an account was
*created* (it answers 204 for a taken address too), and resend may not say a
message was *sent* (same). Both say what the response actually guarantees.

**A real bug the tests caught, worth remembering.** Verification first used a
mutation, and `main.tsx` wraps the app in `StrictMode` — which mounts,
unmounts and remounts every component in development. A mutation's observer
does not survive that, so the result of a send that had already succeeded was
discarded and the page sat on its spinner forever. A dev-only hang, on the one
screen a new account cannot get past. It is now a query keyed by the token:
React Query shares the in-flight promise, so the double mount cannot spend the
token twice, and the settled result is cached so the remount reads it.

**Verified end to end against Mailpit**, not only in tests: signup → message in
the catcher → the real link from the mail body → 204 → replay 400 → login
reports `emailVerified: true` → `/api/notes` 200 → five seeded domains.

---

## L4 — Password reset

`done` · ~4 h · needs L2

- `POST /api/auth/forgot` — **always 204**, known address or not. Same
  existence-leak reasoning as the not-found rule (D-039)
- `POST /api/auth/reset` — single-use, 1-hour, constant-time compare against
  the stored hash
- A successful reset **revokes every existing session**. Resetting a password
  is what someone does when they think their account is compromised, and a
  reset that leaves the attacker's session alive does nothing

**Done when:** a used token fails, an expired token fails, a token for another
account fails, and all three fail identically from the client's point of view.
✓ — `TestResetTokensAllFailIdentically` is that sentence, with a fourth case:
a genuine, live, unspent **verification** token, which is the closest thing to
a valid token an attacker is legitimately handed. All four compare on status
and on body with the request id redacted.

Shipped: `POST /api/auth/forgot` and `/auth/reset`, `auth.RequestPasswordReset`
and `ResetPassword`, the `DeleteSessionsForUser` and `UpdatePassword` queries,
and two screens — `ForgotPasswordPage` and `ResetPasswordPage`, plus a "Lupa
kata sandi?" link on login.

Four decisions:

- **The whole reset is one transaction**, so a rejected attempt — a too-short
  password, say — leaves the link usable. Claim-then-write would strand
  someone with a dead link *and* their old password, which is the worst of
  both. `ClaimToken` was split so the claim can run inside a caller's
  transaction; verification still claims on the pool.
- **A successful reset also marks the address verified.** Clicking a link sent
  to a mailbox proves exactly what the verification link proves. Without this,
  an unverified account could complete a reset and still be locked out, with
  the recovery path already spent.
- **Reset is offered to unverified accounts**, for the same reason. Refusing
  recovery to the accounts most likely to be stuck buys nothing.
- **`/auth/reset` signs nobody in.** Every session dies, including the
  caller's, and minting a fresh one from a link that may have been fetched by
  a mail scanner would undo half the point. The cookie is cleared so the user
  lands on the login screen rather than on a "session expired" error.

**Reachability matches L3's rule:** `/auth/forgot` and `/auth/reset` are
mounted regardless of `ALLOW_SIGNUP`. Recovery is not a registration feature —
a closed instance still has accounts, and they still have people who forget
passwords. `/auth/forgot` sends mail so it takes the tight limiter;
`/auth/reset` sends none and takes the looser one, like verify.

**Verified end to end against Mailpit:** signup → verify → login → `/notes` 200
→ forgot → real link from the mail body → reset 204 → the old session answers
401 → replay 400 → old password 401 → new password 200 → `/notes` 200 → forgot
for an unregistered address 204.

---

## L5 — Active sessions screen

`done` · ~3 h · needs L1 · migration `00008_session_public_id.sql`

List where the account is signed in — last seen, user agent, approximate
location — and revoke one or all. Server-side sessions (D-039) make this a
query rather than a feature; the columns arrive in L1.

Pair it with the session-ID rotation from P4, which is what makes the list
trustworthy. ✓ — P4 already rotates on login and revokes the credential
presented with it.

**Done when:** revoking a session from one browser signs the other one out on
its next request. ✓ — `TestRevokingASessionSignsTheOtherBrowserOut`, which also
asserts the revoking session is untouched.

Shipped: `GET /api/auth/sessions`, `DELETE /api/auth/sessions/{id}`,
`DELETE /api/auth/sessions` (everywhere else), and the
`Perangkat yang masuk` section in Pengaturan.

**The design problem this task actually contained, which the plan did not
anticipate:** `auth_sessions.id` *is* the credential — sessions are opaque
256-bit strings stored server-side, so the primary key and the cookie value are
the same string. A screen that lists sessions has to name them, and naming them
by id would put every live credential of the account into a JSON response
readable by any script on the page, undoing the reason the cookie is HttpOnly.

Migration `00008` adds `public_id`, a handle that is not a credential. The
query goes further and never selects `id` at all: "which of these is the one
asking" is computed in Postgres as a boolean, so the credential does not enter
Go and cannot be serialised by a later refactor. `TestTheSessionListNeverCarriesTheCredential`
greps the raw response body for the caller's cookie value.

Three smaller decisions:

- **`last_seen_at` is written at most once every five minutes**, not per
  request. Unconditional would be a write on every authenticated request
  against a pool capped at 10 for the sake of every other project on the box
  (D-028), to make a field whose whole job is "roughly when was this last
  used" slightly sharper. A failure to write it is logged, never returned —
  refusing an authenticated request because a bookkeeping write failed turns a
  cosmetic problem into an outage.
- **No geolocation.** L5 said "approximate location"; that needs a GeoIP
  database, which is a dependency, a licence and a refresh cadence (D-065) for
  a field that exists to answer "do I recognise this?" — which the address and
  the browser name already answer. The IP is shown as-is. Revisit if a real
  user ever asks.
- **The User-Agent is parsed in the client, with substring checks**, not by a
  library and not on the server. Same reasoning, and it keeps the stored value
  honest: the raw header is what is kept, bounded at 400 characters because it
  is attacker-controlled on an unauthenticated route.

Mounted under `/api/auth/sessions` because `/api/sessions` has been the focus
timer's since `03`. "Session" genuinely names two unrelated things in this
product, which is what D-052 renamed the table for.

---

## L6 — Export everything

`done` · ~5 h · needs L1

Notes and cards as markdown, the rest — schedules, review history, sessions,
domains, categories, exams and attempts — as JSON. One archive.

This is what makes "no lock-in" true rather than a claim, and it is a legal
expectation.

**Correction to this task as written:** it claimed "the git vault export
(D-026) is most of the work already". It was not. D-026 was decided in v0.2 and
never built — there was no vault export code of any kind, so this was
greenfield rather than a port.

**Done when:** the archive contains every row the account owns, and opening
the notes folder in Obsidian works. ✓ —
`TestExportContainsEveryRowTheAccountOwns` states the first clause literally:
it counts rows per table in the database, counts entries in the corresponding
JSON file, and requires the two to match. A table added later and forgotten in
the export fails there, rather than being discovered by somebody who has
already deleted their account.

Shipped: `internal/export`, `GET /api/export`, and the `Data kamu` section in
Pengaturan.

```
README.md                  what the archive is, in Indonesian
notes/<slug>.md            one file per note, YAML frontmatter
notes/terhapus/<slug>.md   soft-deleted notes
cards/<slug>.md            one file per card
cards/terhapus/<slug>.md   soft-deleted cards
data/*.json                everything else, one file per table
```

Decisions:

- **Soft-deleted notes and cards are in the archive**, in their own folder. A
  deleted row is still one the account owns, and an export that quietly dropped
  it would be the silent disappearance this product exists to prevent — but a
  deleted note reappearing as a live one in a vault is its own kind of loss, so
  it does not go in the folder someone opens in Obsidian.
- **`auth_sessions` and `auth_tokens` are deliberately absent**, and the README
  says so. A session id is a live credential and a token hash is the shadow of
  one; neither is content the user wrote, and an archive gets emailed around
  and dropped in cloud storage. `password_hash` never leaves either, which is
  why the export queries name their columns instead of using `SELECT *`.
- **Everything is read before a single byte is written.** A streaming export
  has already sent 200 and half a file by the time a query fails, so the user
  receives a truncated archive that looks complete. Reading first means a
  failure is an ordinary error response.
- **The frontmatter is hand-written YAML**, not a library (D-065), and every
  value is quoted and escaped — a note titled `Bab 3: "Ingatan"` must not
  produce a file Obsidian refuses to parse. There is a test for exactly that
  title.
- **Filenames are deduplicated.** Two notes may share a title, and a title may
  be empty or entirely punctuation. Silent loss inside the archive that exists
  to prevent silent loss would be a particularly bad bug.

**Verified against a real archive**, not only in tests: signed up, wrote a note
with a domain and a category, made a card, reviewed it, logged a focus session,
downloaded the zip, unzipped it and read the files. 18 files, correct
frontmatter, and a `grep` for `password_hash|argon2|token_hash` across the
whole archive finds nothing.

---

## L7 — Account deletion

`todo` · ~3 h · needs L6

Self-service, offering the export first. Deletion means deletion within 30
days, including from backups as they age out (D-066).

The interesting part is what survives: nothing. Unlike a note or a card, an
account delete is not soft — a "recoverable" deleted account is an account
that was not deleted, and that is the one place in this app where the
soft-delete instinct is wrong.

**Done when:** a deleted account's email can sign up again, and no row
referencing the old `user_id` remains.

---

## L8 — Quotas and limits

`todo` · ~2 h · no deps

Per-user caps on note count, card count, request rate, and body size. Not
monetisation — an unbounded free write path on a shared VPS is an outage
waiting for one bad actor, and the pool is capped at 10 for the sake of every
other project on that box (D-028).

Limits are generous enough that a real user never meets one, and the error
copy says what the limit is rather than just refusing.

**Done when:** exceeding a quota returns a 429 with Indonesian copy naming the
limit, and the metric from P2 shows quota rejections.

---

## L9 — Policy, status, and incident path

`todo` · ~3 h · no deps

- **Privacy policy and terms** describing *this* product: what is stored
  (email, password hash, everything you write), for how long, shared with
  nobody. Short and honest — copy-pasted boilerplate is worse than none
  because it describes a product that is not this one
- A **status page or equivalent**, however small. Users hear about an outage
  from the operator, not from a blank screen
- `docs/runbooks/incident.md` (written in P10) is the other half: when it
  breaks, it gets written down

**Done when:** both documents exist, and someone who has not seen the code
could read the privacy policy and describe what the app stores.

---

## L10 — Open signup

`todo` · ~1 h · **needs `04-ship.md`** — this is the one task in this file that
runs after the deploy

Flip `ALLOW_SIGNUP` to `true` in `docker-compose.prod.yml`.

Before doing it, confirm each of these is actually true rather than assumed:

- [ ] The tenancy suite passes with RLS on and `FORCE` set (P1, P7)
- [ ] A restore drill has been performed and timed **against production**
      (P10, `04` S3)
- [ ] The three alerts have each been triggered deliberately once (`04` S5)
- [ ] Verification mail reaches a Gmail inbox, not spam, from the production
      sender (`04` S4)
- [ ] Export and deletion both work end to end (L6, L7)
- [ ] Quotas are enforced (L8)
- [ ] The privacy policy is accurate (L9)
- [ ] You have used it from your phone for two weeks (`04` S6)

**Open, and answer it here:** what bounds the cost of open signup. Quotas cap
storage per account; they do not cap the number of accounts. Invite codes, a
waitlist, or opening it and watching are all defensible — the answer depends
on how the launch actually goes, and pretending to know now is how you pick
the wrong one (D-066).

**Done when:** someone who is not you has an account, used it for a week, and
nothing in this list turned out to be theoretical.
