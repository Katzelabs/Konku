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

`todo` · ~3 h · no deps

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
new tables.

---

## L2 — Mail

`todo` · ~3 h · needs L1

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
Choosing a provider whose free tier survives a hobby launch is still this
task's job — decide it here, with the flow in front of you (see the open
question in `DECISIONS.md`).

**Done when:** signing up locally puts a verification mail in the catcher, and
clicking its link verifies the account.

---

## L3 — Signup and verification

`todo` · ~5 h · needs L2

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
first one exists, and an unverified account cannot read or write anything.

---

## L4 — Password reset

`todo` · ~4 h · needs L2

- `POST /api/auth/forgot` — **always 204**, known address or not. Same
  existence-leak reasoning as the not-found rule (D-039)
- `POST /api/auth/reset` — single-use, 1-hour, constant-time compare against
  the stored hash
- A successful reset **revokes every existing session**. Resetting a password
  is what someone does when they think their account is compromised, and a
  reset that leaves the attacker's session alive does nothing

**Done when:** a used token fails, an expired token fails, a token for another
account fails, and all three fail identically from the client's point of view.

---

## L5 — Active sessions screen

`todo` · ~3 h · needs L1

List where the account is signed in — last seen, user agent, approximate
location — and revoke one or all. Server-side sessions (D-039) make this a
query rather than a feature; the columns arrive in L1.

Pair it with the session-ID rotation from P4, which is what makes the list
trustworthy.

**Done when:** revoking a session from one browser signs the other one out on
its next request.

---

## L6 — Export everything

`todo` · ~5 h · needs L1

Notes and cards as markdown, the rest — schedules, review history, sessions,
domains, categories, exams and attempts — as JSON. One archive.

This is what makes "no lock-in" true rather than a claim, it is a legal
expectation, and the git vault export (D-026) is most of the work already
except that cards now need their own representation too (D-055).

**Done when:** the archive contains every row the account owns, and opening
the notes folder in Obsidian works.

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
