# PRD — Konku (Learning System)

**Status:** v4 — free-product rescope (D-093 – D-100). Supersedes v3's production framing, which raised the engineering bar and left the product scoped for one person.
**Last updated:** 2026-08-24
**Companion docs:** `GOALS.md` (the design's origin — read first), `TECH.md` (architecture), `DECISIONS.md` (what was decided and why)
**Owner:** solo maintainer, real users

---

## 1. What this is

A learning system built around one job: **nothing you learn disappears silently.**

You learn something, spend ~15 seconds capturing it, and the system takes over the remembering-to-remember. A focus timer and a light weekly structure sit around that core to keep you showing up.

Server-backed, self-hostable, and run as a real service. Web app (PWA), agent-accessible via MCP.

**Free, open, and bilingual** (D-093). Signup is open to anyone, the app ships in Bahasa Indonesia and English, and free is a permanent property rather than a launch price: there is no billing code, no tier, and no feature gating, ever. If hosting cost outgrows the operator the answer is the single binary anyone can run, not a paywall over data already in the database (D-096).

**Multi-tenant, not social.** Each account is an isolated private knowledge base. There is no sharing, no collaboration, no visibility between users — multi-user here means the data model is scoped by owner, nothing more (D-039).

**Built and operated to a production standard** (D-057), and now **scoped as a product a stranger can succeed at** (D-093): CI as a merge gate, RLS behind the application's tenancy checks, observability, tested restores, real accounts with verification and recovery. What *does not* change is the design: every constraint from `GOALS.md` — never punitive, no gamification, no social, capture cost above everything — is a product constraint now, not a personal preference. They were never justified by the audience being one person.

### Core thesis

Learning fails not from lack of information but from lack of **structure** and **retention**. Retention is the part software can fully solve; structure is the part it can only support.

---

## 2. Problems and what the app can honestly do about them

From `GOALS.md`. Sorted by how much software can actually touch them — this ordering drives feature priority.

| # | Problem | Software can solve it? | Mechanism in the app |
|---|---|---|---|
| 5 | Cepat paham tapi cepat lupa | **Fully** | Spaced repetition. This is the product. |
| 4 | Susah fokus lama | **Mostly** | Focus is trainable — measure the curve, raise duration gradually |
| 2 | Gampang hilang motivasi | **If honest** | Evidence of retained knowledge, not effort logs |
| 1 | Kurang disiplin | **Partly** | Remove decisions, lower the cost of starting |
| 3 | Gampang terdistraksi | **Barely** | Timer gives a clear start and end. That is the whole scope. |

**Explicit non-scope:** nothing aimed at problem 3 beyond the timer. No site blockers, no strict modes, no "you left the session" penalties. They don't work on your own device and every one of them is a guilt mechanic, which `GOALS.md` rules out.

### Non-goals

- Teams, sharing, collaboration, social, leaderboards — accounts never see each other's data
- Content delivery — the app does not teach, it schedules and retains
- Heavy gamification: badges, XP, levels, losable streaks
- Real-time collaboration
- Bidirectional file sync with an external editor
- **Growth mechanics** — referrals, engagement notifications, streak-recovery offers, ads. Production means the engineering bar, not a growth surface (D-057). Note the line D-093 draws: *distribution* is allowed — a landing page, a README, telling people this exists. What is banned is a mechanism that works on the user rather than informing them
- **Billing, tiers, and feature gating** — no paid plan, no supporter tier held open as an option, no usage-based upsell. Refusing the option matters more than refusing the feature: a tier kept alive quietly sizes every future decision against it (D-096)
- **Operator-funded inference** — AI features spend the user's own Claude subscription over MCP, or the user's own API key. Never the operator's (D-097)
- **Cross-account analytics** — how people study is the most useful data this product could collect and it is other people's learning history. Metrics are computed per account, for that account (D-066)

---

## 3. User

The design target is one specific person: technical (comfortable with code, self-hosts), studies 1–2 hours/day imperfectly, speaks Indonesian. `GOALS.md` is their context, and every product decision is still made for them.

**They are no longer the only person who will see it** (D-093). Signup is open, so the reader of every screen is now somebody who has not read `GOALS.md` and did not choose these opinions — which is why activation, not capture, is the headline risk (§5.13), and why the app cannot assume its user is fluent in the design's Indonesian (§5.14).

The audience is now **people who learn like them** — not a broader market reached by softening the opinions. The opinions are the product; widening the audience by removing them produces the mediocre SRS app that already exists in quantity (D-057). A second account is an isolated copy of the same experience, never a reason to add sharing, comparison, or social mechanics.

**Language rule (amended by D-094):** all user-facing copy ships in **both Bahasa Indonesia and English**. Indonesian is the source language and the fallback; a string is not shippable until English exists. Code, comments, commits and docs stay English, unchanged. This covers server-side copy too — `writeError` messages and every transactional mail — not only React (§5.14).

### The operator is a role too

Running this for other people creates obligations that a personal instance did not have, and they are part of the product rather than a deployment detail (D-066):

- Every account can **export everything** and **delete everything**, self-service
- A privacy policy and terms that describe *this* product honestly
- Users hear about an outage from the operator, not from a blank screen
- Per-user quotas, because an unbounded write path on a shared VPS is an outage waiting for one bad actor

---

## 4. The central model: notes and cards are one system

This is the most important product decision in the document.

> A **Note** (markdown) is the atom. **Cards** live inside the note's markdown. The scheduler runs over cards. There is no separate "review item" object.

Why it matters:

- **Capture cost collapses.** Adding a card is typing `::` in a note you're already writing — no separate flow, no context switch. Capture cost is the single biggest risk to this product working at all.
- **Cards keep their context.** Fail a review, open the source note, re-read the thing you actually forgot.
- **Agent access stays simple.** "Generate flashcards on this topic" is a handful of card writes, not a document rewrite.

> **Superseded by D-055.** Cards were embedded in note markdown when this was written, and the paragraphs above argue for that. They are their own feature now: their own rows, their own screens, no containment. Notes and cards relate through shared categories and domains. The reasoning for the reversal — including what it cost — is in `DECISIONS.md` D-055; the section is left standing because the argument it makes is the one that was weighed against.

### Card types

| Type | Shape | Grading |
|---|---|---|
| `basic` | a markdown front and back | self |
| `cloze` | `text with {{a blank}}` | self |
| `feynman` | an explain-it prompt | LLM-graded (M2), self before that |

Only `basic` ships. Cloze and feynman are **Later** under the v4 milestones (D-031, restated in D-055) — cloze is the largest remaining gap against Anki for the audience this targets, and it moves up the moment activation is answered. Editing a card never resets its schedule — see `TECH.md` §4.

---

## 5. Features

### 5.1 Notes (P0)

- Markdown, one note per topic. Title, body, domain tag, shared categories.
- Editor: plain textarea + preview, shipped; CodeMirror 6 later (see `DECISIONS.md` D-018).
- Soft delete with a **Terhapus** view and bulk restore — recoverable means a screen, not a toast (D-056).
- `[[wikilinks]]` between notes, backlinks panel — Later.
- Full-text search (Postgres FTS) — **Later** under the v4 milestones; semantic search later still, and behind the user's own key (D-097). Title search already runs in SQL against `notes_title_trgm_idx` (D-084).

### 5.2 Ulangan (P0 — the product)

One feature with two ways in (D-075). **Ujian used to be a separate section and is not one any more** — it was the same act under a different name, and it now lives here as a saved *latihan*.

#### The scheduled queue — the default path

- Cards are their own resource, scheduled independently (D-055). They are not parsed from notes — that was true until D-055 and is the single most common stale assumption in this document's history.
- Interval ladder: **`[1, 3, 7, 14, 30, 90, 180]` days**.
- On add → `stage = 0`, `nextReviewDate = today + 1`.
- On **ingat** → `stage++`, reschedule by the ladder.
- On **lupa** → `stage = 0`, reschedule to tomorrow, `lapses++`.
- Past the last interval → terminal **`sudah dikuasai`** state, retires from the queue but stays in history. Also markable manually at any stage.
- **Recall before reveal (mandatory).** The review screen shows only the prompt. You attempt recall, *then* reveal, *then* self-rate. Showing the answer immediately turns the whole thing into passive re-reading, which `GOALS.md` says explicitly does not work. This one hidden div is the difference between a retention system and a list of things you once wrote down.
- **Due list is capped** at ~10 cards/day, oldest first, with the rest quietly deferred. Coming back to 40 due items after two weeks away is demotivating regardless of styling.
- Overdue is surfaced calmly — a count, no red, no alarm.
- **It leads the screen.** `/review` opens on "Ulangan hari ini" with a Mulai button; saved latihan sit underneath. Making the configurable half the front door would turn the automatic queue into something you have to choose, which is the failure it exists to prevent (D-075).

#### Saved latihan (P1 — built)

Practice over cards that already exist. Not a second question bank — a second place for knowledge to live is what D-005 collapsed and D-055 was careful not to reintroduce.

- A set configures **how many questions, which domains, which categories, and in what form**. Domains OR together, categories OR together, and the two groups AND: Matematika + "rumus" means cards that are both. Empty means the whole knowledge base.
- Two selection modes: `fixed` pins a card set so scores are comparable across runs; `random` draws N cards at run time — better practice, non-comparable scores.
- Two formats (D-076): `recall` is the same prompt→reveal→self-rate as the queue; `choice` offers four options and grades on the server. Format belongs to the set, not the card — the same card is recall in one and multiple choice in another.
- **Distractors are sampled from the user's other cards' answers and snapshotted with the draw** (D-077). Nothing is authored per card. A question that cannot reach four distinct options is asked as plain recall instead.
- **An answer inside a set never moves the schedule** (D-049). It is a `review_logs` row with `source = 'set'`. Advancing the ladder on cards that were not due scrambles the capped due list, and a `lupa` in a practice run wiping a month of real progress is a punishment mechanic.
- A choice answer is **tagged** `format = 'choice'` so the retention metric can exclude recognition-level evidence. Recognising an answer among four is easier than recalling it, and the UI says so.
- Runs are **resumable** — the draw *and its options* are snapshotted at start (D-050, D-077), so closing the tab does not cost the run or reshuffle the choices.
- Scores are a count, not a grade. No percentages framed as pass/fail, no letter grades, no red (D-054).
- Sets **archive and unarchive**; one that has been run cannot be deleted (D-051).

Review over **notes** is not built. Cards only for now.

### 5.3 Focus timer (P0)

- Durations 15 / 20 / 25 / 30 / 45 min. **Default 20.** Short durations first in the UI, deliberately.
- Start / pause / reset. Works offline (client-side).
- On completion: log the session (domain, duration, timestamp).
- **Capture is fused into session end.** Timer finishes → "Apa yang kamu pelajari?" → one field, pre-tagged with the session's domain, skippable. Never a separate act of discipline.
- No break timer. Cut — see `DECISIONS.md` D-010.

### 5.4 Progressive focus (P1)

Treats session length as a trainable variable the app manages, not a picker the user operates.

- After N consecutive completed sessions at the current duration, the app quietly offers the next step up as the default. No challenge framing, no celebration.
- Show the duration curve over months. This is the visible evidence for problem 4.

### 5.5 Weekly structure (P1)

- A weekly **quota**, not a day-by-day scoreboard: 3× general, 2× math, 1× psychology, 1× music. Filled in any order, any day.
- The day→domain rota still appears on the home screen as a **suggestion** ("Hari ini: Matematika") to remove the what-should-I-study decision — but it is not scored.
- Rationale: seven checkboxes resetting weekly is seven visible failure slots per week, which contradicts the forgiveness principle. A week at 5/7 reads as "5 done," not "2 missed."

### 5.6 Streak & consistency (P1)

- **Streak counts weeks, not days.** A week counts if the quota is met (or a threshold like ≥4 sessions). A missed Tuesday is invisible; a genuinely dead week breaks it.
- 7-day activity strip for daily texture — informational, not a score, nothing to lose.
- No grace-rule special-casing needed; changing the unit removes the problem instead of patching it.

### 5.7 Retention metric (P1)

The headline number, replacing a stats dashboard:

> "Kamu masih ingat 38 dari 45 topik yang dipelajari 3 bulan lalu."

Computed from `review_logs`: reviews at long intervals (30d+) rated *ingat* vs *lupa*. Effort metrics ("12 jam bulan ini") decay in motivating power; proof of retained knowledge compounds. This is also the only number that maps directly to the success criterion in `GOALS.md`.

### 5.8 AI features (Later — and the user pays)

**Nothing here is operator-funded** (D-097). MCP (§5.9) spends the user's existing Claude subscription and costs nothing; everything below requires the account's own API key, encrypted at rest, revocable, visible in the account screen, never exported, and never used for anything the user did not explicitly trigger.

Ranked by value — build in this order:

1. **Generate cards from a note.** Model proposes 3–5 cards, user accepts / edits / rejects. Attacks capture cost, the biggest risk. Highest value by a wide margin.
2. **Grade a Feynman explanation.** User types their recall from memory; model compares against the source note and reports what was missed; user then self-rates. Self-grading is unreliable — you always feel like you remembered. This makes recall honest and no consumer SRS app does it well.
3. **Semantic search** across notes (pgvector).
4. **Chat over notes** — lowest value, most commonly built. Comes free via MCP; do not build a bespoke one.

### 5.9 MCP server and API tokens (v1.5 — the first AI work that ships)

Exposes the same operations as the HTTP API so an existing Claude subscription can read and write the knowledge base directly. Built **before** in-app LLM features: zero API cost, zero key management, zero prompt engineering, and immediately useful. Under D-096 that ordering stops being a preference and becomes the only one the economics permit (D-097).

API tokens get **their own table**, not `auth_tokens`. That one is single-use and expiring by construction — `used_at IS NULL AND expires_at > now()` inside the claiming UPDATE — and its `kind` CHECK admits only `verify` and `reset`. An API token is long-lived and multi-use, the opposite invariant.

### 5.10 Activity log (P2)

Reverse-chronological log of sessions, reviews, and quota fills. Filterable by domain. Scaffolding — defer.

### 5.11 Exams

Folded into §5.2 by D-075. Ujian is no longer a separate feature.

### 5.12 Accounts and data (P0 for public launch)

The account surface that a real service owes its users (D-058, D-066). None of it is a feature anyone will thank you for; all of it is required before strangers' data is in the database.

- **Signup** behind `ALLOW_SIGNUP` — on for the public instance, off for a private deployment, which keeps the seeded-account model.
- **Email verification required before the account is usable.** The reset link is the only recovery path there is, so an unverified address is an unrecoverable account and an unverified signup form is a spam relay.
- **Password reset** — single-use, 1-hour, stored hashed. Identical response for a known and unknown address, same existence-leak reasoning as the not-found rule.
- **Active sessions screen** — see where you are signed in, revoke one or all. Server-side sessions make this a query, not a feature.
- **Export everything** — notes, cards, schedules, review history — as markdown plus JSON. This is what makes "no lock-in" true rather than a claim.
- **Delete everything**, self-service, within 30 days including from ageing backups. The export is offered first.
- **Per-user settings** finally get somewhere to live: default timer duration, progressive-focus N, rota preference. They were constants under one user.

Copy stays in Indonesian and stays non-punitive. A verification screen that scolds you for not clicking the link is still a guilt mechanic.

### 5.13 The first ten minutes (P0 — the new headline risk)

D-098. The risk this product manages used to be capture cost — would notes and cards actually get written (D-030). Daily use answered that. With signup open the risk is **activation**: whether somebody who has not read `GOALS.md` gets from a signup form to their first review.

What exists today is the honest measure of the gap: on the **app** origin `/` is a login form and the catch-all route is the login screen, a verified account lands in an empty app, and there is no import. The marketing site is not the gap — it exists, it is bilingual, and every claim on it is traceable to the app.

- **What `/` does for a signed-out visitor.** The marketing site already exists and is already bilingual — `Katzelabs/konku-landing`, Astro, at `konku.katzeapps.com`, English at `/en`. The gap is between it and the app origin: `konkuapp.katzeapps.com/` is a login form, so somebody handed the app's URL gets a password field and no explanation. A redirect or a thin in-app entry, and the two must not drift.
- **First run ends with a card, not a dashboard.** Choose or rename domains — five are seeded — then write the first card *inside* the flow. An account whose first review happens on day one is a different account from one that lands on an empty list.
- **Import: Anki, CSV, and a markdown folder.** The single largest switching cost for this audience, all of whom already keep a knowledge base somewhere. Asking them to retype it is asking them to leave.
- **Empty states that teach** — never apologise, never guilt (UX principle 2).
- **A feedback path.** There is no support surface at all today; `POST /api/client-error` reports crashes to Sentry and nothing carries a sentence a human wrote.

Rejected: product tours, demo mode without an account, onboarding checklists with progress bars (D-098).

### 5.14 Two languages (P0)

D-094. Indonesian is the source and the fallback, English is first-class, and a string is not shippable until both exist. Typed message catalogs keyed by id; locale resolved **account setting → `Accept-Language` → `id`**, with the setting living in `user_settings` beside the timer defaults.

**The server speaks to users too**, and that is the half that gets missed: `writeError` messages are user-facing Indonesian literals today, and every transactional mail is a template. Both need the same catalog and the same resolution order.

Two mechanisms (rule 9): `make check-i18n` fails on a user-facing literal in a feature folder or a handler, and a test fails when a key exists in one catalog and not the other. `/privacy` and `/terms` become two documents that must say the same thing, and L9's coverage test runs against both.

### 5.15 Reminders (P1, opt-in, off by default)

D-100. One optional daily email at an hour the user picks, stating how many cards are due — a fact, not a nudge.

`GOALS.md` rules out notifications that create anxiety or guilt. It does not rule out being told a number, and the alternative is worse than it looks: a spaced-repetition queue nobody is reminded of rots silently for everyone except the person who built it. The copy rules are the safeguard — it states a count, never says *missed*, *behind*, *streak*, *terlewat* or *jangan sampai*, does not send at all on a day with nothing due, and never reports what was not done yesterday.

Rejected: default-on, web push before the PWA work, weekly statistics summaries, anything about consecutive days.

### 5.16 Operator surface (P0 for open signup)

D-095. Not a feature anybody will thank you for; all of it is required before strangers can register.

- **Suspend an account** — `users.suspended_at` plus `cmd/konku suspend-user`, in the shape `seed-user` already established. A CLI on the box, not an admin UI: an admin UI is a second authorisation model over every table and is the wrong first answer to a problem that has not happened.
- **A daily signup ceiling that alerts rather than blocks.** A spike is either good news or an attack and the operator should learn which within the hour.
- **A capacity rule.** One container, `mem_limit: 512m`, a pgx pool capped at 10 against a shared Postgres. When signups outpace that, `ALLOW_SIGNUP` goes back to `false` rather than the service degrading for the accounts already in it.
- **Self-hosting is a supported configuration** (D-096), not an accident of `ALLOW_SIGNUP=false`. What it lacks is a document.

---

## 6. Domains

Domains are **per-user**: create, rename, recolor, reorder, set a weekly quota, archive (D-046). Global domains were the one shared mutable thing in an otherwise isolated knowledge base — one user renaming "Matematika" would rename it for everyone.

`seed-user` and signup seed these five, and any of them can be changed or archived afterwards:

| Slug | Display label | Weekly quota |
|---|---|---|
| `general` | Pengetahuan Umum | 3× |
| `math` | Matematika | 2× |
| `psychology` | Psikologi | 1× |
| `music` | Musik | 1× |
| `coding` | Coding | 0× |

Quota 0 means a valid tag with no scheduled sessions that does not count toward the week — how coding stays out of the rota without special-casing (D-034).

A domain that notes or sessions reference **archives, never deletes** (D-051); an unreferenced one still deletes cleanly.

---

## 7. UX principles

Constraints, not preferences. Derived from `GOALS.md`.

1. **Low friction to start.** One click from home to a running session. The main failure mode is not starting.
2. **Forgiving, never punitive.** No guilt copy, no shaming empty states, no aggressive red. A missed day is normal; the UI treats it as normal.
3. **Progress must be visible, and honest.** Retention first, effort second.
4. **Calm by default.** Minimal animation, no notification spam. The app competes with short-form content for attention — it should feel like the opposite of that.
5. **Indonesian copy: plain, direct, active voice, sentence case, no filler.**

---

## 8. Milestones

Execution detail in `docs/tasks/` for `01`–`09`, and in ClickUp for everything from `10` onward (Development & Engineering → Konku). Technical breakdown in `TECH.md` §12.

**The ordering rule that outranks the ambition** (D-057, amended by D-067): daily use starts *now*, locally, and continues throughout. Everything that can be built without a server gets built before the server is touched. The risk D-030 exists to manage — months building a learning tool and none learning — is not solved by deferring work; it is solved by using the app while doing it.

The deploy comes late because it is a short list of genuinely server-bound tasks (HTTPS, backups on the box, mail deliverability, phone access), and doing the local work first makes it one careful afternoon instead of a moving target.

**Reading older documents.** The milestones were renamed when production entered scope. Decisions and completed task files written before D-057 use the old names, and are left as written rather than retconned:

| Old name | Now |
|---|---|
| MVP / M1 | MVP — built |
| v0.2 | v1.0 (accounts, RLS — gates launch) and v1.2 (product depth — does not) |
| v0.3 / M2 | v1.3 — differentiators |
| Later / M3 | Later — polish |

A shorter-lived rename also happened inside this document: an earlier draft of §8 had **v0.9 as a private launch preceding the hardening work**. D-067 folded it into v1.1 once it became clear the deploy was not a prerequisite for any of it.

**The v4 rescope renumbered again** (D-093). v1.0 and v1.1 keep their contents; everything above them was re-filled, because the ordering changed rather than the ambition:

| v3 said | v4 says |
|---|---|
| v1.2 — product depth | split: language and activation take v1.2 and v1.3; **honest progress** (retention metric, quota, strip, week streak, progressive focus, mark-mastered) becomes v1.4; cloze, feynman and full-text search drop to **Later** |
| v1.3 — differentiators | MCP and API tokens become **v1.5** — they are now the *first* AI work, and the only kind with no marginal cost (D-097). LLM features drop to **Later**, behind the user's own key |
| Later — polish | PWA and offline reads come **forward** into v1.6 with reminders, because reviewing on a phone is the behaviour the product depends on |

One line in the v3 list was already stale when it was written: the **home screen** is built.

### MVP — "catat & ingat" — **built**

The retention loop, the focus timer that feeds it, real auth, and the schema-v2 features that followed.

- **Retention loop:** notes CRUD, cards as their own resource (D-055), shared categories, the scheduler, review with recall-before-reveal, soft delete with a Terhapus view
- **Focus timer:** 15–45 min, default 20, session logged on completion, **capture-at-session-end** — "Apa yang kamu pelajari?", one skippable field
- **Auth:** argon2id, server-side revocable sessions, rate-limited login, seed-user CLI, `user_id` scoping on every table since the first migration
- **Schema v2:** per-user domains with a UI, review sets over existing cards, resumable runs

**What it existed to test:** not whether spaced repetition works — that is known — but *whether notes and cards actually get written*. That question is answered by daily use, which is what the next milestone is for.

### v1.0 — Production readiness — **all local, no server** (`06`, then `07` L1–L9)

Everything that has to be true before a stranger's data is in the database, and none of it needs the VPS (D-067). Built against `docker-compose.yml`, gated by GitHub Actions.

- **CI first** — merge gate on `main` before anything below lands (D-061)
- **Security** — Postgres RLS with `FORCE` and a non-owner role (D-059) · security headers and CSP · origin checks and session rotation (D-060) · body size limits · `govulncheck`
- **Observability** — request logging with IDs · `/healthz` + `/readyz` split · metrics with pgx pool saturation · error tracking (D-062)
- **Testing** — frontend unit tests, e2e on the core loop, a tenancy test per resource, migration tests (D-063)
- **Operations** — runbooks, a timed restore drill, **and a backup for the local database**, which is now real data (D-064, D-067)
- **Accounts** — signup, verification, reset, sessions screen, export, deletion, quotas, policy — built and tested against a local SMTP catcher (D-058, D-066)

Throughout: **the app is in daily use on `make dev-web`.** That is the gate, not a formality.

### v1.1 — Ship and open (`04-ship.md`, then [ticket 10](https://app.clickup.com/t/86eyqky74))

The genuinely server-bound residue: VPS deploy over HTTPS · deploy-by-digest and one rehearsed rollback · nightly off-site backups with a production restore · **the real sending domain (SPF/DKIM/DMARC)** · monitoring and alert routing · **two weeks of use from your phone**.

Then `ALLOW_SIGNUP` flips to `true` — **fully open, no invite code and no waitlist** (D-095). Three things gate the flip and none of them is a new control: mail deliverability (S4), alert routing (S5), and the operator surface in §5.16. Everything else the flip depends on was built for it already — per-IP and per-address rate limits (D-058), mandatory verification (`07` L3/L4), and per-account quotas (`07` L8).

Two of these carry real risk and cannot be de-risked earlier: mail deliverability, because verification mail landing in spam is an outage that looks like a signup bug; and whether review actually happens in dead time, which a laptop-only instance never tested.

### v1.2 — Bilingual ([ticket 11](https://app.clickup.com/t/86eyqky8c))

The catalog shape is not invented here: `Katzelabs/konku-landing/src/i18n` already runs it — `id.ts` original, `en.ts` translated from it, a `Copy` type making a missing key a compile error. Adopt it.

D-094. Catalogs, locale resolution on both sides, the Go-side error messages and mail templates, `/privacy` and `/terms` in two languages, and the two mechanisms that keep them from drifting.

**It runs before the activation work and that ordering is the whole point.** Everything v1.3 adds is new copy. Writing it in Indonesian and translating afterwards means writing it twice, and the second pass is the one that gets skipped.

### v1.3 — The first ten minutes ([ticket 12](https://app.clickup.com/t/86eyqky9x))

D-098, authored bilingual from the first line. Landing page · first-run that ends with a card · **import from Anki, CSV and a markdown folder** · empty states that teach · a feedback path.

This is where the headline risk now lives. Everything before it made the service trustworthy; none of it made the product learnable.

### v1.4 — Honest progress ([ticket 13](https://app.clickup.com/t/86eyqkyag))

The promise the PRD has been making since D-004 and has never shipped: the **retention metric**. Plus weekly quota, the 7-day strip, the week streak (D-007), progressive focus (D-012) and mark-mastered.

Second in line rather than first because a number computed over an empty account is not evidence of anything — it needs accounts with a month of history behind it, which v1.3 is what produces.

### v1.5 — Agent access ([ticket 14](https://app.clickup.com/t/86eyn10be))

API tokens and the MCP server (D-017, D-097). The first AI work, the only kind with zero marginal cost, and the most useful thing this product can offer the technical half of its audience.

### v1.6 — Phone ([ticket 15](https://app.clickup.com/t/86eyqkyc3))

PWA, installable, offline reads · opt-in daily reminders (D-100).

Reviewing during dead time is the behaviour the whole retention loop assumes, and it is the one a laptop-only instance never tested.

### Later

Cloze and feynman card types · full-text search · review over **notes** · BYO-key card generation and Feynman grading · semantic search · CodeMirror editor · wikilinks and backlinks · git vault export · activity log.

---

## 9. Success criteria

### Product — from `GOALS.md`, made measurable

- Sessions run consistently over **weeks**, not one enthusiastic week
- **Retention rate at 30d+ intervals stays high** — the headline metric
- Average session duration trends from ~15 min toward ~45 min without being forced
- Progress is visible as real data, not a feeling

Measured per account, for that account, never aggregated across users (D-066).

### Activation — the operator's only aggregate numbers

D-099 draws the line, because a free product needs to know whether people get started and rule 11 forbids aggregating other people's learning history. Both are right; the boundary has to be exact or one of them loses quietly.

**Allowed** — account-lifecycle counters, aggregate, no content, no per-user breakdown: signups · verifications completed · accounts that created a card within 7 days · accounts active in the last 28 days · imports run and failed · errors.

**Forbidden, unchanged:** what anybody studies, per-account retention rates, note or card content, any per-user dashboard, any cohort table keyed to an identity.

**The mechanism is the boundary.** These are Prometheus counters incremented in handlers, beside `konku_quota_rejections_total` — *a counter cannot be broken down by user because it never held one.* No analytics SDK, no third party in the page, no nightly cohort job (D-099).

### Operational — the production bar (D-057)

These are the numbers that say the service is being run rather than merely deployed. Modest on purpose: a target a solo operator can actually honour beats an ambitious one missed quietly.

| | Target |
|---|---|
| Availability | 99% monthly — ~7 h of downtime, planned or not |
| RPO / RTO | 24 h / **2 h**, proven by a **quarterly restore drill** (D-064) |
| Unhandled 5xx | Below 0.1% of requests, alerting above it |
| Time to detect an outage | The operator finds out before a user reports it |
| Restore drill | Performed and **written down** every quarter, timed |
| Data export / deletion | Self-service, no operator involvement |
| Cross-tenant leaks | Zero, backed by RLS and a tenancy test per resource |

The one that matters most is the restore drill. Everything else degrades noisily; a backup that has never been restored fails silently, once, permanently.

**RTO is now a measured number rather than a guess** (`06` P10). The first drill ran 2026-08-09 against dev compose: dump → restore into an empty database → policies and grants verified → the app served the restored database → login succeeded, in **6 seconds** for a 64 KB dump.

**Re-measured against production on 2026-08-20**, as this section required. Konku-only dump and restore into an isolated scratch instance: **1.3 seconds** for an 80 KB dump — 0.62 s out, 0.63 s back — with 20 tables, 19 policies, RLS enabled and forced on all 19 user tables, all three extensions and schema 12 verified on the far side. The procedure transferred to production; the commands did not, and `restore.md` now carries a production section because none of the dev-stack commands accept the platform's `pg_dumpall` format.

Six seconds is a floor, not the target. What the drill establishes is that the *procedure* has no unknown steps in it, which is the part that costs an hour when it is missing. The 2 h target adds what the drill cannot rehearse on a laptop: noticing, fetching the dump from off-site, provisioning a database if the host is gone, and DNS or proxy work. It replaces 4 h because the procedure turned out to be written down and mechanical; it is not 30 min because **detection is currently "the operator notices"** — no alerts are routed until `04-ship.md` S5, and that is the dominant term.

**The 2 h target stands, and the production drill did not move it.** The restore itself is seconds; the target is dominated by the terms the drill still cannot rehearse, and detection remains the largest — no alerts are routed until `04-ship.md` S5. A faster restore does not shorten the time it takes to notice.

Two findings from the production drill bear on this number and are not yet closed. `make restore` on the platform side cannot restore one tenant — it replays every database into the live instance — so a Konku-only recovery currently runs the hand-written path in `restore.md` rather than a tested target. And a single-database dump does not carry its roles, so a restore onto a fresh instance is gated on recreating `konku` and `konku_app` first (D-090). Neither is slow; both are steps that are easy to discover at the worst possible moment.

Re-measure again once there is real data, and revise this number rather than defending it.
