# PRD — Konku (Learning System)

**Status:** v3 — production framing (D-057). Supersedes v2's solo-project scope.
**Last updated:** 2026-08-09
**Companion docs:** `GOALS.md` (the design's origin — read first), `TECH.md` (architecture), `DECISIONS.md` (what was decided and why)
**Owner:** solo maintainer, real users

---

## 1. What this is

A learning system built around one job: **nothing you learn disappears silently.**

You learn something, spend ~15 seconds capturing it, and the system takes over the remembering-to-remember. A focus timer and a light weekly structure sit around that core to keep you showing up.

Server-backed, self-hostable, and run as a real service. Web app (PWA), agent-accessible via MCP.

**Multi-tenant, not social.** Each account is an isolated private knowledge base. There is no sharing, no collaboration, no visibility between users — multi-user here means the data model is scoped by owner, nothing more (D-039).

**Built and operated to a production standard** (D-057): CI as a merge gate, RLS behind the application's tenancy checks, observability, tested restores, real accounts with verification and recovery. What *does not* change is the design: every constraint from `GOALS.md` — never punitive, no gamification, no social, capture cost above everything — is a product constraint now, not a personal preference. They were never justified by the audience being one person.

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
- **Growth mechanics** — referrals, engagement notifications, streak-recovery offers, ads. Production means the engineering bar, not a growth surface (D-057)
- **Cross-account analytics** — how people study is the most useful data this product could collect and it is other people's learning history. Metrics are computed per account, for that account (D-066)

---

## 3. User

The design target is one specific person: technical (comfortable with code, self-hosts), studies 1–2 hours/day imperfectly, speaks Indonesian. `GOALS.md` is their context, and every product decision is still made for them.

The audience is now **people who learn like them** — not a broader market reached by softening the opinions. The opinions are the product; widening the audience by removing them produces the mediocre SRS app that already exists in quantity (D-057). A second account is an isolated copy of the same experience, never a reason to add sharing, comparison, or social mechanics.

**Language rule:** all user-facing copy in **Bahasa Indonesia**. Code, comments, commits, docs in English.

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

Only `basic` ships; cloze and feynman stay deferred to v1.2 (D-031, restated in D-055). Editing a card never resets its schedule — see `TECH.md` §4.

---

## 5. Features

### 5.1 Notes (P0)

- Markdown, one note per topic. Title, body, domain tag, shared categories.
- Editor: plain textarea + preview, shipped; CodeMirror 6 later (see `DECISIONS.md` D-018).
- Soft delete with a **Terhapus** view and bulk restore — recoverable means a screen, not a toast (D-056).
- `[[wikilinks]]` between notes, backlinks panel — Later.
- Full-text search (Postgres FTS) — v1.2; semantic search — v1.3.

### 5.2 Review queue (P0 — the product)

- Cards are their own resource, scheduled independently (D-055). They are not parsed from notes — that was true until D-055 and is the single most common stale assumption in this document's history.
- Interval ladder: **`[1, 3, 7, 14, 30, 90, 180]` days**.
- On add → `stage = 0`, `nextReviewDate = today + 1`.
- On **ingat** → `stage++`, reschedule by the ladder.
- On **lupa** → `stage = 0`, reschedule to tomorrow, `lapses++`.
- Past the last interval → terminal **`sudah dikuasai`** state, retires from the queue but stays in history. Also markable manually at any stage.
- **Recall before reveal (mandatory).** The review screen shows only the prompt. You attempt recall, *then* reveal, *then* self-rate. Showing the answer immediately turns the whole thing into passive re-reading, which `GOALS.md` says explicitly does not work. This one hidden div is the difference between a retention system and a list of things you once wrote down.
- **Due list is capped** at ~10 cards/day, oldest first, with the rest quietly deferred. Coming back to 40 due items after two weeks away is demotivating regardless of styling.
- Overdue is surfaced calmly — a count, no red, no alarm.

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

### 5.8 AI features (v1.3)

Ranked by value — build in this order:

1. **Generate cards from a note.** Model proposes 3–5 cards, user accepts / edits / rejects. Attacks capture cost, the biggest risk. Highest value by a wide margin.
2. **Grade a Feynman explanation.** User types their recall from memory; model compares against the source note and reports what was missed; user then self-rates. Self-grading is unreliable — you always feel like you remembered. This makes recall honest and no consumer SRS app does it well.
3. **Semantic search** across notes (pgvector).
4. **Chat over notes** — lowest value, most commonly built. Comes free via MCP; do not build a bespoke one.

### 5.9 MCP server (v1.3)

Exposes the same operations as the HTTP API so an existing Claude subscription can read and write the knowledge base directly. Built **before** in-app LLM features: zero API cost, zero key management, zero prompt engineering, and immediately useful.

### 5.10 Activity log (P2)

Reverse-chronological log of sessions, reviews, and quota fills. Filterable by domain. Scaffolding — defer.

### 5.11 Exams (P1 — built)

In-app practice tests over cards that already exist. Not a second question bank — a second place for knowledge to live is what D-005 collapsed and D-055 was careful not to reintroduce.

- Two selection modes: `fixed` pins a card set so scores are comparable across attempts; `random` draws N cards at attempt time — better practice, non-comparable scores.
- An exam with no domain draws from the whole knowledge base.
- **An exam answer never moves the schedule** (D-049). It is a `review_logs` row with `source = 'exam'`. Advancing the ladder on cards that were not due scrambles the capped due list, and a `lupa` in a mock test wiping a month of real progress is a punishment mechanic.
- Attempts are **resumable** — the draw is snapshotted at start (D-050), so closing the tab does not cost the run.
- Scores are a count, not a grade. No percentages framed as pass/fail, no letter grades, no red (D-054).

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

Execution detail in `docs/tasks/`. Technical breakdown in `TECH.md` §12.

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

### MVP — "catat & ingat" — **built**

The retention loop, the focus timer that feeds it, real auth, and the schema-v2 features that followed.

- **Retention loop:** notes CRUD, cards as their own resource (D-055), shared categories, the scheduler, review with recall-before-reveal, soft delete with a Terhapus view
- **Focus timer:** 15–45 min, default 20, session logged on completion, **capture-at-session-end** — "Apa yang kamu pelajari?", one skippable field
- **Auth:** argon2id, server-side revocable sessions, rate-limited login, seed-user CLI, `user_id` scoping on every table since the first migration
- **Schema v2:** per-user domains with a UI, exams over existing cards, resumable attempts

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

### v1.1 — Ship and open (`04-ship.md`, then `07` L10)

The genuinely server-bound residue: VPS deploy over HTTPS · deploy-by-digest and one rehearsed rollback · nightly off-site backups with a production restore · **the real sending domain (SPF/DKIM/DMARC)** · monitoring and alert routing · **two weeks of use from your phone**.

Then `ALLOW_SIGNUP` flips to `true`.

Two of these carry real risk and cannot be de-risked earlier: mail deliverability, because verification mail landing in spam is an outage that looks like a signup bug; and whether review actually happens in dead time, which a laptop-only instance never tested.

### v1.2 — Product depth

Cloze and feynman card types · full-text search · mark-mastered · home screen · retention metric · progressive focus · weekly quota and strip.

### v1.3 — Differentiators

MCP server · LLM card generation · LLM-graded Feynman · semantic search.

### Later — Polish

PWA (installable, offline reads) · CodeMirror editor · wikilinks and backlinks · git vault export · activity log.

---

## 9. Success criteria

### Product — from `GOALS.md`, made measurable

- Sessions run consistently over **weeks**, not one enthusiastic week
- **Retention rate at 30d+ intervals stays high** — the headline metric
- Average session duration trends from ~15 min toward ~45 min without being forced
- Progress is visible as real data, not a feeling

Measured per account, for that account, never aggregated across users (D-066).

### Operational — the production bar (D-057)

These are the numbers that say the service is being run rather than merely deployed. Modest on purpose: a target a solo operator can actually honour beats an ambitious one missed quietly.

| | Target |
|---|---|
| Availability | 99% monthly — ~7 h of downtime, planned or not |
| RPO / RTO | 24 h / 4 h, proven by a **quarterly restore drill** (D-064) |
| Unhandled 5xx | Below 0.1% of requests, alerting above it |
| Time to detect an outage | The operator finds out before a user reports it |
| Restore drill | Performed and **written down** every quarter, timed |
| Data export / deletion | Self-service, no operator involvement |
| Cross-tenant leaks | Zero, backed by RLS and a tenancy test per resource |

The one that matters most is the restore drill. Everything else degrades noisily; a backup that has never been restored fails silently, once, permanently.
