# DECISIONS.md — Decision Log

**Last updated:** 2026-08-09

Why this file exists: `PRD.md` and `TECH.md` say *what* was decided. This says *why*, and what was **rejected**. Without it, every future session re-litigates the same trade-offs and quietly reintroduces the things that were deliberately cut.

Format: decision · rationale · what was rejected.

---

## Product

### D-001 — Retention is the product; everything else is scaffolding
Of the five problems in `GOALS.md`, only "cepat lupa" is fully solvable by software. If the app did spaced repetition well and nothing else, it would still be worth using. If it did everything else and SRS badly, it is just another timer app.
**Rejected:** treating the timer, schedule, and streak as co-equal features.

### D-002 — Nothing is built to fight distraction (problem 3)
The app runs on the same device as the distraction. Blockers and strict modes do not work there, and every "you left the session" penalty is a guilt mechanic that `GOALS.md` explicitly rules out. The timer's clear start/end is the honest limit of what software can do.
**Rejected:** site blockers, strict/hardcore modes, focus-abandonment penalties.

### D-003 — Recall before reveal is mandatory
The review screen shows only the prompt; answer stays hidden until the user attempts recall. Showing it immediately makes the whole feature passive re-reading, which `GOALS.md` says does not work. One hidden div separates a retention system from a list of things you once wrote down.

### D-004 — Retention is the headline metric, not hours studied
"Kamu masih ingat 38 dari 45 topik dari 3 bulan lalu" beats "12 jam bulan ini." Effort metrics decay in motivating power; proof of retained knowledge compounds. It is also the only number matching the stated success criterion. Computable from `review_logs` at 30d+ intervals.
**Rejected:** a stats dashboard as the primary progress surface.

### D-005 — Notes and cards are one system, not two
The Note (markdown) is the atom; cards live inside its markdown; the scheduler runs over cards. There is no separate "review item."
Three separate models (notes / flashcards / review items) means three capture flows and three places for the same knowledge to live half-updated — the standard failure mode for this category. Unifying collapses capture cost, which is the biggest risk to the product working, and makes MCP card-generation a plain note edit.
**Rejected:** Anki-style standalone decks divorced from source material. *(Explicitly confirmed by the user.)*

### D-006 — Weekly quota, not a seven-day checkbox scoreboard
Seven day-slots resetting each Monday is seven visible failure slots per week, contradicting the forgiveness principle. A quota (3 general / 2 math / 1 psych / 1 music, any order, any day) preserves interleaving without creating misses. A week at 5/7 reads as "5 done," not "2 failed."
The day→domain rota **survives as a home-screen suggestion** — deciding what to study is itself a barrier to starting — but it is not scored.
**Rejected:** the v1 PRD's per-day completion checkboxes.

### D-007 — The streak counts weeks, not days
A daily streak is inherently punitive for someone who says up front there will be off days. Counting weeks makes a missed Tuesday invisible while a genuinely dead week still breaks it — forgiving by design rather than by special-case patch, and a simpler `WeeklyStreak()` with fewer subtle bugs.
**Rejected:** both options the v1 PRD posed (a 1-day-per-week grace buffer, and "best streak" shown alongside current). Both patch the wrong unit.
The 7-day strip stays as informational texture with nothing to lose.

### D-008 — Interval ladder extended, plus a terminal mastered state
`[1, 3, 7, 14, 30]` capped at 30 days means a mastered item returns forever, every 30 days. One item a day for a year is ~12 daily reviews, mostly on things known cold — exactly the accumulating obligation that makes people quit.
Now `[1, 3, 7, 14, 30, 90, 180]` plus a `sudah dikuasai` state that retires the card from the queue while keeping its history. Manually markable at any stage.

### D-009 — The due list is capped (~10/day, oldest first)
Returning after two weeks away to 40 due cards is demotivating regardless of styling. `DueCards()` caps and defers the rest quietly. This lives in the pure scheduler, so it had to be settled before writing it.

### D-010 — No break timer
At a 20-minute default it is ceremony, and it inserts a decision at the exact moment the user should feel finished. Revisit if average session length actually reaches 45 min.
**Rejected:** the v1 PRD's optional 5-minute break timer. *(Answers v1 open question.)*

### D-011 — Capture is fused into the end of the session
Timer completes → "Apa yang kamu pelajari?" → one field, pre-tagged with the session's domain, skippable. A separate "add topic" screen is a second act of discipline, and problem 1 says do not rely on discipline. This single flow decision probably matters more to the product working than the entire data model.

### D-012 — Progressive focus is managed by the app
After N consecutive completed sessions at a duration, the next step up quietly becomes the default. Quiet, not a challenge or a celebration. A manual duration picker puts problem 4 back on the user's discipline, which is problem 1.
The v1 PRD's five buttons plus "average session length" buried in P2 stats is a stopwatch, not a training system.

### D-013 — Source references are just part of the note
With notes as the atom, a source link is a line in the markdown. No separate field, no attachment system.
*(Answers v1 open question.)*

### D-014 — Export is the git vault export, plus `pg_dump`
JSON dump superseded. See D-026.
*(Answers v1 open question.)*

### D-015 — Domains hardcoded; the schedule editor is deferred
The four domains are known. Build the editor when there is a real fifth domain to add. See Q-003.

### D-016 — AI features ranked; build in this order
1. **Generate cards from a note** — attacks capture cost, the biggest risk. Highest value by a wide margin.
2. **LLM-graded Feynman** — self-grading is unreliable; you always feel like you remembered. Makes recall honest; no consumer SRS app does it well. This is the differentiating feature.
3. **Semantic search** (pgvector).
4. **Chat over notes** — lowest value, most commonly built. Comes free via MCP.
**Rejected:** building a bespoke chat interface.

### D-017 — MCP before in-app LLM
Zero API cost, zero key management, zero prompt engineering, zero evals, and the user already pays for Claude. Build the HTTP API tool-shaped first; MCP is then a thin adapter and in-app AI later reuses the same tool layer. Also a stronger portfolio signal than "added a chatbot."

---

## Technical

### D-018 — Markdown is the source of truth; the editor edits markdown
Obsidian-shaped, not Notion-shaped. A WYSIWYG block editor storing JSON means every note round-trips through a lossy converter — and with an agent writing notes via MCP, that is a permanent, recurring bug class.
Ladder: **textarea + preview (M1)** → CodeMirror 6 with markdown mode (M3) → inline decoration, `[[wikilink]]` autocomplete, backlinks. CodeMirror 6 is what Obsidian itself uses.
**Rejected:** BlockNote / TipTap-style block editors with JSON storage, and building an editor from scratch. The editor is the single item most likely to eat this project — it starts undersized on purpose.

### D-019 — Cards are written inline in the markdown with stable embedded IDs
Syntax: `Q :: A`, `{{cloze}}`, `> [!feynman]`, each followed by `<!-- c:xxxx -->`.
Matching cards by content means fixing a typo destroys that card's review history. So the parser assigns IDs, writes them back into the note body, and matches by ID only. Vanished IDs soft-delete, never hard-delete. Note update and card sync commit in one transaction.

### D-020 — Server is the source of truth; local-first is abandoned
Postgres, MCP, and multi-device access together make half-supporting a local-first model cost more than it returns. Client caches; server owns state.
**Rejected:** the v1 PRD's localStorage/IndexedDB persistence.

### D-021 — Go + Postgres + React + PWA
Boring, defensible, hireable — and this is also a portfolio project. The non-trivial parts worth showing are the scheduler, the parser, the MCP server, and LLM-graded recall; plain CRUD plus a chatbot is what everyone has.

### D-022 — Markdown in a Postgres `TEXT` column
Transactional with card sync, free FTS via generated `tsvector`, pgvector later with no storage migration. 10,000 notes is tens of MB.
**Rejected:** files-on-disk as source of truth with metadata in Postgres — no cross-store transactions, file-watcher races, and two backup systems that can disagree.

### D-023 — No Redis in v1
Single user: nothing to cache, no queue pressure, sessions live in a cookie. Adding it now is portfolio theater and reviewers read it as such. There *is* a legitimate reason later — a job queue for LLM calls and embedding generation — and adding it then comes with a real answer to "why is this here."

### D-024 — Shared Postgres in prod, isolated Postgres in dev
Konku is one of several projects on the VPS. Shared wins on the things that bite a solo operator: memory is the scarce resource, one backup pipeline, one upgrade path. Isolation buys little with one operator, no untrusted tenants, and no real load.
The main objection — "clone the repo and it doesn't run" — is solved by two compose files: `docker-compose.yml` self-contained for dev and CI, `docker-compose.prod.yml` app-only joining the external `shared` network. The app only ever reads `DATABASE_URL`.
**The decision is cheap to reverse** (`pg_dump` → new service → `pg_restore`, ~10 min), so it was not worth agonizing over. Tripwires in `TECH.md` §10.

### D-025 — `pgvector/pgvector:pg17` from day one, extensions enabled at creation
pgvector must exist on the server, not just be `CREATE EXTENSION`-ed. On a shared instance, installing it later means changing the image and restarting Postgres — coordinated downtime across every project by then. The pgvector image is a drop-in superset of the official one. Same reasoning for pinning the major version. `pg_trgm` enabled too, for fuzzy search.
Decided while the infra was still fresh with zero projects on it — deliberately.

### D-026 — Git vault export, strictly one-way
A background job writes the vault to `/var/lib/konku/vault/*.md` and commits. Gives free per-note version history, an Obsidian-readable folder, and zero lock-in — and a second line of defense if a Postgres restore goes wrong.
Writes only ever go through the API. Allowing edits both on disk and in the app creates bidirectional sync with conflict resolution: a multi-week project that has sunk better-resourced apps.

### D-027 — MongoDB is not used by konku
Note → cards → schedules → logs is relational, and card sync must commit transactionally with the note. FTS and vectors both live in Postgres. Splitting one app across two stores buys two backup paths and two failure modes for nothing. Markdown being "document-shaped" is not a reason; it is a text column.

### D-028 — Connection pool capped per app
`max_connections` defaults to 100; Go's `database/sql` defaults to unlimited. One app can starve every project on the box. `SetMaxOpenConns(10)` on a shared instance, in every project.

### D-029 — `review_logs` from day one
Retention — the headline metric — cannot be reconstructed retroactively. This is the table people forget and then cannot add later.

### D-030 — M1 ships with no AI, no MCP, no PWA, no stats
The failure mode for this project is spending four months building a learning tool and zero months learning. M1 is a thin vertical slice in daily use; if it is not being used at the end of M1, no amount of M2 fixes that.

### D-031 — MVP is the retention loop only; the focus timer is cut
The original M1 was ~90 h of work, which at 1–2 h/day is 8–9 weeks — too big to be an MVP.
The MVP's job is to test the **riskiest assumption**, and that is not "does spaced repetition work" (known) but "will the user actually write notes and cards." So the MVP is the smallest thing that exercises capture → review, ~35 h.
**Cut to v0.2:** focus timer and session logging (~8 h — a phone timer covers it this month; you cannot phone-timer your way out of forgetting), real auth (replaced by Caddy `basic_auth`), cloze and feynman card types (MVP parses `::` only — one syntax, one rule, small test surface), domains, full-text search, mark-mastered, home screen.
**Kept despite the cutting:** stable card IDs (D-019), recall-before-reveal (D-003), `review_logs` (D-029), off-site backups. Each is cheap now and either impossible or painful to retrofit — the first two silently corrupt data, the last two lose it.

### D-032 — `go.mod` at repo root, React in `web/` *(resolves Q-002)*
Not `server/` + `client/`. Go projects with React frontends overwhelmingly put the module at the root and the frontend in a subdirectory — Prometheus (`web/ui`), Grafana (`public/app`), Gitea (`web_src`), Traefik (`webui`). Asymmetric on purpose: Go *is* the project; the frontend is an asset it serves.

```
konku/
├── go.mod  sqlc.yaml  Makefile  Dockerfile  Caddyfile
├── docker-compose.yml  docker-compose.prod.yml
├── migrations/             # goose, embedded, runs at startup
├── cmd/konku/              # main.go + seed_user.go
├── internal/
│   ├── card/               # PURE — parse, stable IDs, render
│   ├── srs/                # PURE — intervals, scheduling
│   ├── auth/               # argon2id, sessions, middleware
│   ├── store/              # queries/ · gen/ · the card-sync transaction
│   ├── api/                # chi routes, handlers, one error shape
│   ├── config/
│   └── web/
│       ├── embed.go        # //go:embed all:dist
│       └── dist/           # Vite writes straight here
└── web/                    # the React app
```

**Two concrete reasons over `server/` + `client/`:**
1. **Go tooling assumes `go.mod` at root.** Nested, every command becomes `go -C server ...` — Makefile, CI, LSP, and `go install <path>@latest` all get slightly worse, permanently.
2. **The `go:embed` copy step disappears.** Embed cannot reach outside its module, so a nested module would force copying `client/dist` → `server/internal/web/dist` on every build. With the module at root, Vite writes directly into the embedding package via `build.outDir: '../internal/web/dist'`. A whole class of stale-build bugs never exists.

**The enforceable rule: `card` and `srs` import nothing from `internal/`.** If either ever needs `store`, the design went wrong. Greppable in CI.

Commit `internal/web/dist/.gitkeep` — `//go:embed all:dist` is a *compile-time* error on a missing directory, so a fresh clone would otherwise fail `go build`.

**Rejected:** `server/` + `client/` (right for genuinely separate deployables, multiple backends, or a team split by language — none apply). Separate modules for the MCP server — version-bumping your own dependency to change an API. `pkg/` over `internal/` — this is an application; tests demonstrate quality, not import paths. Two repos.

### D-033 — `internal/card` owns both parse and render *(resolves Q-001)*
`Parse(md) []Card` and `Insert(md, card) md` both live in `card`. The write direction is already needed for stable-ID write-back, so this is nearly free.
It also makes the deferred MCP question trivial when v0.3 arrives: `add_card()` becomes a thin wrapper over `card.Insert`, and an agent writing raw markdown goes through `card.Parse`. Both paths hit the same code and cannot drift — the chokepoint is guaranteed without deciding the tool shape now.

### D-034 — Coding is a fifth domain with quota 0 *(resolves Q-003)*
Go, Postgres and CodeMirror cards will accumulate while building this and need somewhere to live. But coding does not belong in the weekly rota — it is already the day job and would compete with the four domains actually being grown.
Quota 0 means: valid tag, no scheduled sessions, does not count toward the week. No special-casing needed; the quota field already exists.

### D-035 — A week is complete at ≥4 sessions *(resolves Q-004)*
Not the full quota of 7. Requiring a perfect week makes the weekly streak nearly as brittle as the daily streak that was cut in D-007, defeating the point. Four is "showed up more days than not" — the honest bar for *konsistensi kecil*.

### D-036 — Feynman grading informs, never rates *(resolves Q-005 in principle)*
The model reports what the recall missed; the user still presses ingat or lupa. An LLM overriding self-assessment is a judgment mechanic, and this app does not have those.
**Still open:** the output format (missed points? a score? a rewrite?). That needs the feature in front of you — decide during v0.3.

### D-037 — Progressive focus suggests, never challenges *(resolves Q-006 in principle)*
The next duration up becomes the pre-selected default; changing it back is one tap and unremarked. No celebration, no "level up," no streak attached to it.
Default N = 5 consecutive completions, tunable once there is real data.

### D-038 — The focus timer is back in the MVP, with capture-at-session-end
Partially reverses D-031. The timer alone would still be cut — it costs ~11 h and does nothing for the MVP's actual question. What earns its place is **capture-at-session-end** (D-011): timer completes → "Apa yang kamu pelajari?" → one skippable field, pre-tagged with the session domain.
The MVP exists to test whether notes and cards actually get written. This is the strongest mechanism in the whole design for making that automatic rather than an act of discipline — so including the timer *serves* the MVP's purpose rather than diluting it. A timer without the capture prompt would not have been worth adding.
MVP grows from ~35 h to ~46 h.

### D-039 — Multi-user data model from day one; single-user operation in the MVP
Supersedes the single-user assumption throughout the v1 PRD.

**Multi-tenant, not social.** Each account is an isolated private knowledge base — no sharing, no collaboration, no visibility between accounts. Every never-punitive and no-social constraint from `GOALS.md` stands unchanged; the primary user is still the only one the product is designed for.

**Why the split.** "Multi-user" decomposes into a data model (expensive to retrofit) and a signup flow (cheap to add anytime). Doing all of it in the MVP costs ~22 h and pushes the MVP back to 8–9 weeks — the size that was just deliberately halved. Doing the data model plus real auth costs ~8 h and leaves nothing painful behind.

**In the MVP:** `user_id` denormalized onto every owned table from the first migration; every store method takes a `userID`; ownership enforced in the `WHERE` clause, never fetch-then-check, so a wrong owner returns "not found" and cannot probe for another user's data; argon2id hashing; server-side revocable sessions; login rate limiting; first account seeded by CLI.

**Deferred to v0.2:** public signup, password reset (needs SMTP), Postgres RLS as defense in depth.

**Rejected:** signed-cookie sessions (not revocable), and fetch-then-check ownership (leaks existence).

### D-040 — One binary, one origin: Go serves both the API and the React build
React is a pure API consumer; Go never renders HTML. The built SPA is embedded via `go:embed` and served from the same origin as `/api/*`, with an `index.html` fallback for client-side routes.

**Why not a separately-deployed SPA** (React on Vercel/Netlify, API on its own domain) — the common default, and worse here for concrete reasons:
- **Cookie auth just works** at same origin. Split origins mean CORS with credentials, preflight on every mutation, `SameSite=None`, and Safari-specific breakage — all self-inflicted given D-039 chose cookie sessions.
- **Service worker scope.** The PWA caches shell and API responses together; one origin makes that trivial.
- **One artifact**, so frontend and backend can never be version-skewed, and one Caddy route instead of two.

Cost: a frontend change requires a Go rebuild. A Makefile concern, not an architectural one.

Dev uses a Vite proxy (`/api` → :8080) specifically to preserve same-origin behaviour in development, so cookies behave identically in both environments.

**Corollary:** browser sessions and machine Bearer tokens resolve through one middleware to a `userID`. Handlers never know which credential was used, so MCP in v0.3 adds a resolver rather than an API surface.

### D-041 — Node is a build-time dependency only; nothing Node runs in production
`client/` has a `package.json` and the full Vite toolchain, but no Node process exists in production. Vite emits static files; Go embeds and serves them (D-040). The Dockerfile is multi-stage — Node stage builds the client, Go stage builds the binary, final image carries neither toolchain.

**Rejected: running a Node server in production** (Next.js, or Express serving React). It would add a second container and runtime to the VPS, a second dependency tree to patch, and either a second origin or a proxy hop faking one — undoing D-040 and reintroducing the CORS and service-worker-scope problems it avoids.

What that would buy is SSR, which is worth nothing here: the app is entirely behind a login, has no SEO surface, and no first-paint requirement a static shell cannot meet. Next.js for an authed personal SPA is pure overhead.

### D-042 — chi for routing; no Go "framework"
There is no Rails or Django in Go. Gin, Echo and Fiber are routers plus middleware helpers — they give no scaffolding, ORM, migrations or codegen, so the usual reason to accept framework lock-in does not exist.

**chi** is a thin router whose handlers *are* `http.HandlerFunc` and whose middleware *is* `func(http.Handler) http.Handler`. Zero lock-in, removable in an afternoon.

**Chosen over stdlib** (which since Go 1.22 has `GET /api/notes/{id}` patterns and would work) for route groups with per-group middleware. The auth surface is mixed — everything under `/api` requires a user *except* login — and getting that wrong is a security bug, not a style issue. chi makes it structurally hard to get wrong.

**Rejected — Gin/Echo:** they replace `http.HandlerFunc` with a custom `Context`, so handlers stop being standard `http.Handler`s. `httptest` gets awkward and the `net/http` middleware ecosystem (otelhttp, rate limiters) no longer plugs in without adapters.

**Rejected — Fiber:** built on `fasthttp`, not `net/http`. It would work here — Fiber has native equivalents for SPA serving, rate limiting, sessions and testing, and its lack of HTTP/2 is neutralised by Caddy terminating in front. The objection is narrower: it buys Express ergonomics and throughput measured in tens of thousands of req/s for an app serving one user, in exchange for ecosystem lock-in and handlers that must be rewritten to migrate. It also works against the stated goal of deepening Go — `net/http` idioms transfer everywhere, `fiber.Ctx` transfers to Fiber.

### D-043 — `pgx` + `sqlc`; no ORM
Write SQL, generate type-safe Go. Full control of every query matters more than usual here because D-039 puts `WHERE user_id = $n` on every single one — that is exactly the predicate an ORM's convenience layer tends to hide or forget.

**Rejected:** GORM and ent — magic, vague errors, and generated SQL you have to reverse-engineer when a query is slow.

### D-044 — TanStack Query for server state; Zustand only for the timer
Supersedes the v1 PRD's "local component state + a small store (Zustand or Context)".

Most of what looks like state in this app is **server cache**: notes, due cards, sessions. TanStack Query gives caching, refetch, loading/error states and optimistic updates for free — and "rate a card, have the due list update correctly" is a solved problem there. Hand-rolling it in Zustand is the standard route to stale-data bugs.

Genuine client state is essentially just the timer: running or not, seconds remaining, selected duration. That is `useState` or a small Zustand store.

**Also rejected:** barrel files (`index.ts` re-exports) — circular imports and worse tree-shaking. Type-based top-level folders (`components/`, `hooks/`, `utils/`) — feature folders instead, so a change to review touches one directory.

### D-045 — Dependencies stay countable
Backend, total non-stdlib: **chi, pgx, goose, `x/crypto`** (argon2). Logging is stdlib `log/slog`; config is `os.Getenv`; validation is hand-written; DI is a struct with fields and a constructor.

Each rejected library — Viper, zap/logrus, Wire/Fx, struct-tag validators — delivers value at a scale this project will never reach, while costing magic and indirection from day one. A dependency list defensible line by line is itself a portfolio signal.

---

## Schema v2 — per-user domains and exams

Migration `00002_domains_and_exams.sql`. These six supersede parts of the original data model in `TECH.md` §3.

### D-046 — Domains are per-user *(supersedes D-015, D-034)*
D-015 hardcoded five global domains because they were known and there was one user. D-039 then made the data model multi-tenant, which leaves global domains as the one shared mutable thing in an otherwise isolated knowledge base: user B renaming "Matematika" renames it for user A. Domains now belong to a user, who can create, rename, recolor, reorder, set quota, and archive them.

**Shape:** surrogate `uuid` PK plus `UNIQUE (user_id, slug)` — *not* a composite `(user_id, slug)` primary key. A composite PK propagates a two-column natural key into `notes`, `focus_sessions` and `exams`, forcing every one of them to carry the slug. The uuid keeps each reference one column wide; the slug survives for seeding and URLs. D-034's quota-0 convention is unchanged and still how coding stays out of the rota.

The five seeded domains move out of the migration and into `seed-user`, since rows can no longer exist without an owner.

**Consequence:** a domains UI stops being deferrable. Per-user domains the user cannot edit are strictly worse than global ones.

**Rejected:** a global catalogue plus a `user_domains` settings join table. It keeps existing FKs untouched but a user can never add a domain that was not shipped, and one label serves everyone — which is the problem, not the workaround.

### D-047 — Cross-tenant references are blocked by composite foreign keys
Hard rule 4 puts `user_id` in the `WHERE` clause of every read. It does nothing for *writes*: with per-user domains, `notes.domain_id -> domains.id` lets an unvalidated `domainId` in a request body attach one user's note to another user's domain. The FK is satisfied, no `WHERE` clause is involved, and the leak is invisible until someone reads the join.

So every owned reference carries the owner and points at a `UNIQUE (user_id, id)`:

```sql
FOREIGN KEY (user_id, domain_id) REFERENCES domains (user_id, id)
```

`user_id` is already denormalized onto every table (D-039), so the columns exist and the cost is one redundant unique index per parent. `MATCH SIMPLE` — the default — is what keeps optional references working: a NULL `domain_id` satisfies the constraint whatever `user_id` says.

Handler-side validation stays, but demoted: it exists to return a 400 with Indonesian copy instead of a 500 on a constraint violation. The database is the guarantee.

**Exception, deliberate:** history tables (`review_logs`, `exam_attempt_cards`) have no FK to `cards`. See D-050.

**Rejected:** validating ownership in the handler alone — that is fetch-then-check wearing a different hat, and D-039 already rejected it.

### D-048 — Exams are in-app practice tests over existing cards
An exam draws from the cards that already exist in notes. It is not a question bank — a second place for knowledge to live is exactly what D-005 collapsed.

Two selection modes. `fixed` pins a card set in `exam_cards`, so scores are comparable across attempts. `random` draws `question_count` cards from the domain at attempt time — better practice, non-comparable scores. A CHECK ties `question_count` to exactly the mode that uses it.

`domain_id` is nullable: an exam with no domain draws from the whole knowledge base.

**Not decided here, on purpose:** whether a random draw includes mastered cards. Currently all live cards, on the grounds that an exam is not a review session. Revisit with real attempts in front of you.

**Rejected:** a separate question bank divorced from notes (D-005), and exams counting toward the weekly rota or streak (D-035 counts focus sessions — sitting a mock test is not a study session).

### D-049 — An exam answer is a review that does not move the schedule
Exam answers are written into `review_logs` with `source = 'exam'` and an `exam_attempt_id`. There is no `exam_answers` table.

**Why one table:** D-029 makes `review_logs` *the* retention record, unreconstructable after the fact. A second answer table would make every retention query a `UNION` forever. A `source` column instead gives the metric a lens — default to `'review'`, include exams when you want them.

**Why the schedule stays put:** advancing the ladder on cards that were not due scrambles the capped oldest-first due list (D-009), and a `lupa` in a mock test resetting a month of real progress is a punishment mechanic (rule 6). For `source = 'exam'`, `interval_before` and `interval_after` are written equal — the schedule did not move.

Reversible: making exams advance the schedule is handler logic, not a migration.

**One answer per question per attempt**, enforced by a partial unique index on `(exam_attempt_id, note_id, card_id)` in `00003`, and the insert is `ON CONFLICT DO NOTHING`. Partial because ordinary reviews are *supposed* to repeat — the same card is rated again every time it comes due. Without it a double-clicked rating writes two rows, and since `FinishAttempt` counts rows the score reads 11/10 and the retention metric double-counts that card.

**Rejected:** an `exam_answers` table, and grading exams into the SRS ladder.

### D-050 — Attempts are resumable; the draw is snapshotted
`exam_attempt_cards` records the question set in presentation order when an attempt starts. Without it a `random` draw exists only in memory, so closing the tab halfway loses every unanswered question, and an edit to `exam_cards` between attempts silently changes what two `fixed` scores are comparing. Remaining questions are the snapshot `LEFT JOIN review_logs` where no log row exists.

`exam_attempt_cards` has **no foreign key to `cards`**, matching `review_logs`. This is history: a hard-deleted note must not take a finished attempt's question list with it. That trades FK-enforced tenancy (D-047) for durability on this one table — the composite FK to `exam_attempts` still pins the owner, and rows are only ever inserted from a user-scoped `SELECT`.

**Rejected:** one-sitting-only attempts. An interruption costing you the run is friction with no upside, and fixed exams would still drift between attempts.

### D-051 — Domains and exams archive; deletion is only for unreferenced rows
Both carry `archived_at`, and every reference to them is `ON DELETE NO ACTION` — explicit, not a leftover default. A domain with notes or sessions cannot be deleted, only hidden from pickers; a domain created by mistake with nothing attached still deletes cleanly. Same for exams: deleting one with attempts would destroy the score history while the individual answers survive in `review_logs`, which is the worst of both.

Same reasoning as card soft-delete (D-019) — history outlives the thing it points at — and it matters more for `focus_sessions`, where the domain *is* the record.

Handlers map `foreign_key_violation` to a 409 with Indonesian copy, never a 500.

### D-052 — `sessions` is renamed to `auth_sessions`
Server-side auth sessions and focus sessions both wanted the name. With exam attempts arriving as a third timed thing, "which sessions table" stops being a joke. One migration line, permanent clarity.

### D-053 — Tokens in CSS, components owned; shadcn is a source, not a dependency
Tailwind **v4**, with every design token declared in `web/src/styles/theme.css` (`@theme`, plus `:root`/`.dark` semantic layers). No `tailwind.config.js` — reintroducing one splits the source of truth for "what colour is that". The upgrade from v3 was done before the token layer existed, when it cost eight renamed utilities; after, it would have meant rewriting the tokens.

Component primitives live in `web/src/components/ui/` and are **ours**. shadcn/ui supplied the starting source for the ones worth not hand-writing; the files were then restyled against the tokens. Radix is pulled in only where behaviour is genuinely hard and invisible when wrong: `Dialog` (focus trap, focus restore, scroll lock, Escape, `aria-modal`) and `Switch`. The modal it replaced had none of those. Everything else — Button, Input, Card, Badge, Separator, Label — is markup, because with a mockup in hand writing them is faster than bending someone else's variants.

The deciding fact was that the Figma mockup's palette *is* Tailwind's defaults — `indigo-600`, `gray-*`, `rounded-xl`, hairline borders. That is shadcn's own look, so adopting it removed work instead of creating override layers. Had the mockup carried a bespoke identity, the call would have gone the other way.

Runtime cost: seven frontend packages (three Radix, `clsx`, `tailwind-merge`, `cva`, `lucide-react`) plus self-hosted Geist. All build-time in the D-041 sense — Vite emits, Go embeds, no Node in production.

`/design` renders every token and variant, gated behind `import.meta.env.DEV` so Rollup drops it from the embedded build. A living style guide is the only thing that reliably stops the same button being reinvented in five feature folders.

**Rejected:** MUI/Mantine/Chakra — a competing styling engine and a house style to override. `tailwind.config.js` on v3 — tokens in JS. Installing shadcn's full catalogue. Hand-rolling the dialog, again.

### D-054 — The Figma mockup is a visual reference; its mechanics are not adopted
The mockup (six 1440px frames: home, notes, cards, exams, timer, settings) is where the palette, the Geist typeface, the 260px sidebar, the two-pane notes layout, the floating focus pill and the card geometry come from. **Its product model is not this product**, and the differences are not gaps to fill later — most are things this file already rejected.

Rejected, with the decision each one contradicts:

- **`Study Streak — 18 Days` / "Personal record is 21 days!"** — D-007. A daily streak is punitive for someone who said up front there will be off days. The weekly streak (D-035) stands.
- **`Cards Reviewed 142 / 200`, `80% of daily target reached`** — D-009. The due-card cap exists so that two weeks away is ten cards, not forty. A daily target inverts the one mechanic protecting against quitting.
- **"You are on track to complete all of your goals today"** — on-track framing manufactures off-track guilt.
- **Four-way grading with a red `Hard` button** — the scheduler is binary (`lupa`/`ingat`), and colouring "forgot" as an error contradicts the entire premise of spaced repetition. No red on a review outcome, ever.
- **`Score: 92% accuracy`, `Grade: B+`, `Action Required`, readiness bars in red/green** — gamification and pass/fail framing.
- **`Cards` as a top-level page with decks, cover art and import** — cards are embedded in notes (`Q :: A`) and addressed by note + ID. There are no decks and no card CRUD outside the note.
- **Timer duration picker (`25m / 45m / 50m / Custom`) and break lengths** — D-014. A manual picker puts problem 4 back on the user's discipline, which is problem 1. Progressive focus raises the default quietly, starting at 15–20 minutes.
- **`Share` on a note** — D-039, multi-tenant but never social.
- **`Pro Member`, avatar upload, push notifications, CSV export** — not in scope.

The mockup also has **no review screen**, which is the product's core loop, and **no domains UI**, which D-046 made mandatory. Its `Settings` page offers a daily review target — the one setting that must not exist.

Recorded here rather than fixed silently because a mockup outlives a conversation: without this entry, the next person to open the Figma file reintroduces the streak.

**Consequence:** the palette has no `success` or `warning` token and no green or amber, and `destructive` is documented as delete-only. Painting a punitive screen requires leaving the design system, which is the point. See `docs/DESIGN.md` §5.

---

## Cards leave the note

### D-055 — Notes and cards are two features, not one *(supersedes D-005; retires D-019; overturns D-054's card clause)*

Cards are their own resource with their own table, their own uuid, and their own CRUD screens. A note is markdown and nothing else. The two relate through shared categories and a shared domain vocabulary, not through containment.

**This reverses D-005, which was recorded as "explicitly confirmed by the user".** It was reversed the same way — proposed, argued against, and confirmed again. Recording that here because a reversal without its reasoning reads like drift, and the next person to find D-005 needs to know it was retired on purpose rather than forgotten.

**The argument against, which was made and overruled:** three models mean three capture flows and three places for knowledge to live half-updated, which is the standard failure mode for this category. D-005 collapsed them precisely to protect capture cost (hard rule 7).

**The argument for, which won:** the two have genuinely different use cases. A note is a place to think; a card is a memorisation instrument. Requiring a note before a card taxes the card — the thing the product's core loop actually runs on (D-001) — to protect a coupling that only ever existed to save a capture flow. A card-first screen is now the shortest path to a card there has ever been, so capture cost went *down* for the artefact that matters most.

**What was given up, honestly:**

- The `Q :: A` syntax, the parser, `internal/card`, and its TypeScript mirror. About 900 lines deleted.
- "Fix the card by fixing the note" — a card no longer has a source note to return to. The review screen now links to the card itself.
- The git vault export (D-026, v0.2) gets a second thing to export. Notes are still markdown files; cards will need their own representation.

**What survives, restated rather than dropped:**

- **Editing a card must never reset its schedule.** That was hard rule 2's entire purpose and the most damaging silent bug this codebase had available. Stable IDs are gone, but the property is now structural: the uuid is the primary key and an edit is an `UPDATE`, so there is no content matching left to get wrong. Guarded by `TestScheduleSurvivesCardEdit`, which was kept and rewritten rather than deleted with the parser.
- **Soft delete**, for a new reason: a finished exam attempt renders its questions by joining `cards`, so a hard delete would blank out past results. It also makes deletion undoable.
- **Recall before reveal (D-003)**, held one level lower than before. The card *list* withholds `back` too, not just the review screen — an index visited daily that ships every answer would leave the mechanism one dev-tools glance from defeat.

**Consequences worth knowing:**

- `cards.domain_id` had to exist before `note_id` could go. Cards inherited their domain by joining notes, so every exam draw and the card filter would otherwise have silently returned nothing rather than erroring.
- Migration `00004` is destructive and was only free because the app had not shipped. `review_logs` cannot be reconstructed (D-029); this was the last moment that was true without cost.
- **Cloze and feynman stay deferred (D-031).** Standalone card CRUD makes a type picker trivial to add, which is exactly why it is worth saying no here explicitly.

---

### D-056 — Deleting a note is soft, and "recoverable" means a screen, not a toast

Notes get `deleted_at` (migration `00005`) and the same delete/restore pair cards have carried since `00001`. Both lists take `?deleted=true` for a **Terhapus** view, and both screens let you tick several rows and act on the selection at once.

**Why notes were not deletable at all until now:** they simply had no endpoint. `notes.sql` carried a `DeleteNote` hard delete that nothing ever called — one `DELETE FROM notes`, one route away from being wired up.

**Why not just wire that up.** Nothing references a note but its own labels, so a hard delete is referentially safe, and that is exactly the trap: it is safe for the *database* and unsafe for the *person*. Shipping it would have put a button in the UI that destroys writing permanently on one click, in an app whose stated thesis is that nothing you learn disappears silently. The card precedent already existed; only its justification differed, and a justification is not a reason to reach a different answer.

**Why a Terhapus view rather than an undo toast alone.** A toast makes recovery a reflex test — miss it, navigate away, and a reversible action has become an irreversible one with extra steps. The undo notice is still there, because it is the fast path, but it is a shortcut *to* the bin, never the only route back. This is also why the selection is not stored in the URL the way `?view=` and `?q=` are: a filter is worth reloading into, a half-made selection of things you were about to delete is not.

**One statement for one and for many.** `SoftDeleteNotes` / `SoftDeleteCards` take a uuid array, and the single-item endpoints pass an array of one. Deleting one is deleting a selection of one, so there is no second code path to keep in step — the alternative is two statements that drift, and the one that drifts is the bulk one nobody tests.

**Bulk answers a count, not 204.** An id that was already deleted, or that names nothing this user owns, does not match, so the rows changed can be fewer than the ids sent. That is not an error — "delete these twelve" is satisfied when one had already gone — but the screen reports the number, so it reports the true one. Tenancy is unchanged: `user_id` is in the `WHERE` clause, so another user's id is silently not counted rather than refused (D-039).

**Consequences worth knowing:**

- `GetNote` and `UpdateNote` both gained `deleted_at IS NULL`. Without it on `UpdateNote`, the note editor's save-on-unmount would **resurrect a note the user had just deleted** — the row would reappear in the list with nobody having restored it. The editor also suppresses that save after a delete, but the SQL is what makes it impossible rather than merely unlikely.
- Category counts now exclude soft-deleted notes and cards. The join rows survive a delete so a restore brings the labels back with the item; counting them would read "12 catatan" beside a list of four.
- A category attached only to deleted notes still cannot be hard-deleted — the join row is a real reference. Archiving remains the normal path (D-051), so no new policy was added for it.

---

## Production

Konku stops being a personal instance. The entries below reverse deferrals that
were correct while there was one user and one operator, and are wrong the
moment a stranger's data is on the box. Each names what it supersedes — none of
the earlier reasoning was mistaken at the time, and the ones that still hold
(dependency discipline, no framework, no Redis) are amended rather than
discarded.

### D-057 — Konku is a product; the personal-project framing is retired *(amends D-021, D-030, D-031; supersedes PRD §3's "solo project, single user")*

The app is built and operated to the same standard as any production service:
CI as a merge gate, observability, security hardening, tested restores, public
accounts. "It's just for me" stops being an argument that closes a discussion.

**What does not change.** Every constraint in `GOALS.md` — never punitive, no
gamification, no social, no losable streaks, capture cost above all — was
recorded as a personal preference and is hereby promoted to a **product
constraint**. They were never justified by the audience being one person; they
were justified by what actually makes people keep learning. Rule 6 and rule 7
outrank growth metrics, and there are no growth metrics.

**What the earlier framing got right, kept.** D-030 and D-031 exist to manage
one failure mode: spending months building a learning tool and none learning.
That risk is real and does not go away because the ambition grew. It is now
managed by ordering rather than by cutting — the personal instance ships and
enters daily use **before** the hardening work starts, and public signup opens
after both. Hardening an app nobody uses is the same mistake wearing a
production badge.

**What is explicitly still out.** Teams, sharing, collaboration, leaderboards,
public profiles, billing, ads, referral mechanics, engagement notifications.
"Production" means the engineering and operational bar, not a growth surface.
Multi-tenant, never social (D-039) is unchanged.

**Rejected:** rewriting the product to be broadly appealing. The design is for
one specific person and people who learn like them; widening the audience by
softening the opinions produces the mediocre SRS app the market already has.

### D-058 — Public accounts ship complete: signup, email verification, reset, and deletion *(supersedes D-039's deferral)*

D-039 deferred signup and password reset to v0.2 on the grounds that a signup
flow is cheap to add anytime. That is still true, and it is now due. All four
land together because three of them alone is a trap.

- **Signup** behind `ALLOW_SIGNUP`, which stays a flag and becomes `true` only
  on the public instance. A private deployment keeps the seeded-account model.
- **Email verification is required before the account is usable.** Not
  politeness — the reset link is the only account-recovery path there is, so an
  unverified address is an account that can never be recovered, and an
  unverified signup form is a free spam relay pointed at whatever address an
  attacker types.
- **Password reset** with single-use, expiring (1 h), constant-time-compared
  tokens stored hashed. The response is identical for a known and an unknown
  address — the same existence-leak reasoning as D-039's not-found rule.
- **Account deletion** that actually deletes, self-service, with the export
  offered first (D-066).

Every one of these is an unauthenticated write path, so every one of them is
rate-limited — by IP *and* by target address, because per-IP alone lets an
attacker mailbomb one victim from many hosts.

**Rejected:** OAuth/social login (a third-party dependency in the auth path and
an account-recovery story you do not own, for a login screen used once a
month). Magic links as the only login method (an email round trip on every
sign-in is friction, and rule 7 is about friction). Unverified accounts with a
"verify later" nag.

### D-059 — Postgres RLS becomes a launch requirement *(supersedes D-039's deferral)*

D-039 called RLS "defense in depth, worth doing, not worth blocking the MVP
on." Correct then: the only data a scoping bug could leak was the operator's
own. With strangers' notes in the same tables, one forgotten `WHERE user_id`
stops being a bug and becomes a breach that must be disclosed. Defense in depth
is exactly what you want backing a rule enforced by 60-odd hand-written
queries.

**Shape.** `user_id` is already denormalized onto every owned table (D-039)
precisely so this would be a drop-in. Policy per table on
`user_id = current_setting('app.user_id')::uuid`, with the setting applied by
`SET LOCAL` inside the transaction that runs the query.

**The cost, stated honestly.** `SET LOCAL` is transaction-scoped, which means
every user-scoped read has to run inside a transaction — today most of them do
not. That is a real store-layer change (`WithUserTx`), not a migration you
apply and forget. It is worth it because the alternative is trusting that
nobody ever writes one query wrong, forever.

**Two details that make the difference between RLS and the appearance of it:**

- **`ALTER TABLE ... FORCE ROW LEVEL SECURITY`.** A table owner bypasses its
  own policies by default, and the app currently connects as `konku`, which
  owns the database. Without `FORCE`, every policy is inert and every test of
  them passes.
- **Prefer a non-owner application role** (`konku_app`, `GRANT`-ed only what it
  needs) so migrations and the running app are not the same principal.

**Rejected:** RLS *instead of* the `WHERE` clause. The application predicate
stays primary; two independent mechanisms is the entire point, and a single
mechanism configured in the database is not obviously safer than a single
mechanism written in Go.

### D-060 — Browser hardening: same-site cookies and origin checks, not a CSRF token

State-changing requests are same-origin (D-040) JSON. Given
`SameSite=Lax; Secure; HttpOnly`, a cross-site form POST does not carry the
session cookie, and a cross-site `fetch` with `Content-Type: application/json`
is preflighted and refused. So the control is:

- `SameSite=Lax` (not `Strict` — `Strict` breaks arriving from an email link,
  which D-058 makes a normal path), `Secure`, `HttpOnly`
- Reject state-changing requests whose `Origin` is present and not our own, and
  whose `Content-Type` is not `application/json`
- **Session ID rotates on login**, so a fixated session cannot survive
  authentication
- A **sessions screen**: list active sessions, revoke one or all. Server-side
  sessions (D-039) already make this a query rather than a feature.

Plus the middleware that should have existed anyway: a security-header set
(`Content-Security-Policy` with no `unsafe-inline`, `frame-ancestors 'none'`,
`X-Content-Type-Options`, `Referrer-Policy`, HSTS from Caddy) and
`http.MaxBytesReader` on every request body — an unbounded note body is a
memory-exhaustion primitive once anyone can sign up.

**Rejected:** a synchroniser-token CSRF layer. It defends against an attack the
cookie policy already blocks, and it costs a token endpoint, a client-side
cache, and a class of confusing 403s. **Revisit if** the API ever accepts
form-encoded bodies or the frontend ever moves to a second origin — either one
makes the token necessary and this entry wrong.

### D-061 — CI is a merge gate, and deploys come from tags

There is no `.github/` in this repository. Every rule this project has —
`internal/srs` imports nothing, sqlc must not drift, the frontend must
typecheck — is enforced by remembering to run `make check`. Rules that are not
enforced decay, and that was already the argument in the CI task (written as
`04-ship.md` S1, moved to `06` P0 by D-067) before
production was on the table.

- **On every PR:** `go vet`, `go test ./...` against a Postgres service
  container, `make check-pure`, sqlc drift check, `npm ci && npm run typecheck
  && npm run build`, frontend tests, e2e (D-063), `govulncheck`, and a Docker
  image build so a broken Dockerfile is caught before deploy day.
- **Branch protection on `main`:** green CI required, no direct pushes.
- **Deploys are from tags**, from an image built by CI and pinned by digest —
  never `docker build` on the VPS, which makes "what is running in production"
  unanswerable.
- **Migrations still run at startup** (D-039 era) and that stays, but the
  rollout is now: back up, deploy, verify `/readyz`, and keep the previous
  image tag one command away.

**Rejected:** a self-hosted runner (a second thing to patch and monitor).
Auto-deploy on merge to `main` — the gap between "tests pass" and "I want this
live" is where a solo operator's judgment lives.

### D-062 — Observability is a feature, not a log file *(amends D-045)*

Today: JSON `slog` to stdout, chi's `RequestID`, and `/api/health` pinging the
database. That is a genuinely good start and it is not enough to operate
against — nothing records how long a request took, nothing counts errors, and
nothing tells you a deploy broke something except a user noticing.

- **Request logging middleware** — method, path, status, duration, request ID,
  and `user_id` when there is one. Never the body, never a token, never an
  email address.
- **The request ID travels**: into every log line, into the error response, so
  a user's screenshot maps to a log query.
- **`/healthz` (liveness — process is up) and `/readyz` (readiness — database
  reachable, migrations applied)** as separate endpoints. The current
  `/api/health` conflates them, which means a database blip looks like a dead
  container to anything watching.
- **Metrics** at `/metrics`, bound to localhost or behind auth: request rate,
  latency histogram, error rate, pgx pool saturation. Pool saturation is the
  one that matters — D-028 caps the pool at 10 on a shared instance, so
  exhaustion is the most likely way this app falls over.
- **Error tracking** (Sentry or equivalent) on panics and 5xx, because a
  `Recoverer` that writes to stdout on a box you do not read is not an alert.
- **Alerts**, few and real: readiness failing, error rate spiking, the nightly
  backup not completing. An alert that fires and is ignored is worse than none.

**On D-045.** The dependency budget is amended, not abandoned — see D-065.

**Rejected:** distributed tracing. One process, one database, no service mesh;
a latency histogram plus the request ID answers everything a trace would, at a
fraction of the setup. Revisit when the MCP server becomes a second deployable.

### D-063 — The test pyramid gets a frontend and an end-to-end tier

Backend coverage is real — 13 test files, table-driven, integration tests
against a live Postgres. **The frontend has zero tests**, and it is where the
last two classes of shipped bug came from: the login rate limiter that was
broken because nothing asserted a 429, and the mutation `onSuccess` returning
the invalidate promise so a delete dialog would not close.

- **Frontend unit tests** (Vitest + Testing Library) on the parts where a bug
  is silent: the date helpers, the API client's error path, the timer
  reduction, and every mutation's cache-invalidation behaviour.
- **End-to-end** (Playwright) on the core loop only — sign in, write a note,
  write a card, review it, complete a session, capture at session end — plus
  the signup → verify → reset flow from D-058, since an auth flow that half
  works locks people out of their own data. Runs in CI against the compose
  stack.
- **A tenancy test that is not optional.** One test per resource asserting that
  user B gets 404, not 403, for user A's row (D-039). With RLS landing (D-059),
  the same suite runs as the proof that policies are actually on.
- **Migration tests**: every migration applies to an empty database and to the
  previous release's schema.

**No coverage-percentage gate.** A number gates test volume, not test quality,
and the tests that would have caught both shipped bugs are behavioural
assertions that a percentage would not have demanded. The gate is the list
above.

**Rejected:** snapshot tests of rendered components (they assert that the
markup is what the markup is, and get regenerated the moment they fail).

### D-064 — A backup is a restore you have performed

`04-ship.md` S3 already says this and already requires one test restore. As a
production obligation it becomes recurring and specific:

- Nightly per-database `pg_dump -Fc konku` (never `pg_dumpall` — restoring
  Konku must not disturb the other projects on the shared instance), pushed off
  the box with restic to B2/S3, encrypted, with a retention policy.
- **The backup job alerts on failure.** A silent cron that stopped working in
  March is the standard way this goes wrong.
- **A restore drill every quarter**, into the dev database, timed, with the
  result written down. What is being measured is RTO, and an untested dump is a
  hypothesis.
- **Stated targets:** RPO 24 h, RTO 4 h. Modest on purpose — they are what a
  solo operator can actually honour, and a target you miss quietly is worse
  than a modest one you meet.
- The git vault export (D-026) remains the second line of defense and now has
  cards to export too (D-055).

### D-065 — The dependency budget is amended, not abandoned *(amends D-045)*

D-045's reasoning stands: a dependency list defensible line by line is worth
having, and Viper/zap/Wire/struct-tag validators still buy nothing here.
Production adds obligations that stdlib genuinely does not cover, so the
budget is revised rather than waived.

**Added, each with the obligation that justifies it:**

| Dependency | Obligation | Why not stdlib |
|---|---|---|
| `prometheus/client_golang` | D-062 metrics | Histograms and an exposition format, hand-rolled badly otherwise |
| `getsentry/sentry-go` | D-062 error tracking | Panic capture, grouping, release tagging |
| Playwright (dev only) | D-063 e2e | No stdlib equivalent; never ships in the image |
| Vitest + Testing Library (dev only) | D-063 frontend tests | Same |

**Still stdlib, deliberately:** logging (`log/slog`), config (`os.Getenv`),
email (`net/smtp` against a transactional provider — an SDK for "send one
templated message" is not a trade worth making), validation, rate limiting
(`internal/api/ratelimit.go` already works and sweeps its own map), and
dependency injection.

**The rule that replaces "keep it short":** a new dependency names the
production obligation it discharges, or it does not go in. "Everyone uses it"
is not an obligation.

### D-066 — Real users create obligations a personal instance did not have

The moment someone else's data is in the database, several things stop being
optional and none of them are features anyone will thank you for.

- **Data export.** Every account can export everything — notes, cards,
  schedules, review history — as markdown plus JSON. It is a legal expectation,
  it is the thing that makes "no lock-in" true rather than a claim, and the
  vault export (D-026) is most of the work already.
- **Deletion means deletion**, within 30 days, including from backups as they
  age out. Offer the export first.
- **A privacy policy and terms** that say what is actually stored (email,
  password hash, everything the user wrote), how long, and who it is shared
  with (nobody). Short and honest; a copy-pasted boilerplate is worse than
  none because it describes a product that is not this one.
- **Per-user quotas.** Note and card counts, request rate, body size. Not
  monetisation — an unbounded free write path on a shared VPS is an outage
  waiting for one bad actor, and D-028 caps the pool at 10 for the sake of
  every other project on that box.
- **A status and incident path.** When it breaks, users find out from the
  operator, and an incident gets written down. Two sentences in a file counts.
- **Secrets are not in `.env` on the VPS forever.** `SESSION_SECRET`, the
  database password, and the SMTP credentials get a rotation procedure, and
  rotating the session secret must invalidate sessions rather than crash the
  process.

**Rejected:** collecting analytics on how people study. It would be the single
most useful data set this product could have, and it is other people's learning
history. The retention metric is computed per-account, for that account, and
never aggregated across users.

### D-067 — Everything buildable is built before the VPS is touched *(re-orders 04, 06, 07; amends D-057's ordering rule)*

D-057 sequenced the work as ship → use → harden → open, and put `04-ship.md`
before `06`. That conflated two different things: **deploying** and **using**.
Once separated, almost nothing in the remaining plan actually needs the box.

**What genuinely requires the VPS**, and it is a short list:

- The deploy itself — Caddy, HTTPS, the shared network, provisioning the
  database and role
- Nightly backups running as a cron *on the box*
- **Email deliverability** — SPF, DKIM and DMARC on a real sending domain
- The half of the release pipeline where the VPS pulls an image by digest
- Uptime monitoring and alert routing against a real endpoint
- Opening signup
- **Phone access**, which is what makes daily review realistic rather than
  theoretical

Everything else — RLS, observability code, security headers, the whole test
pyramid, CI, signup, verification, reset, export, deletion, quotas — is local
work against `docker-compose.yml`, which is self-contained precisely so that
`git clone && docker compose up -d db` works (D-024).

**So the order becomes:** local hardening (`06`) → local account work (`07`
L1–L9) → deploy and the VPS-only residue (`04`) → open signup (`07` L10).

**Three things follow from this, and the first is the one that matters:**

1. **Daily use starts now, locally.** D-030's failure mode — months building a
   learning tool, none learning — is not solved by deferring the work, it is
   solved by *using the app*. The gate was never "deploy"; it was "use it".
   Running `make dev-web` daily satisfies most of what S4 was protecting, and
   it must start immediately rather than at the end of 68 hours of hardening.
   It is a **weaker** gate than the original, honestly: reviewing on a phone
   during dead time is the behaviour the product depends on, and a laptop-only
   instance does not test it. That part of S4 survives the deploy.
2. **The local database becomes real data, so it needs a real backup.** Weeks
   of notes accumulating in a Docker volume with no dump is exactly the failure
   this project's thesis exists to prevent. A local `pg_dump` is now part of
   `06`, not something that waits for the VPS.
3. **Deliverability stays an untested unknown until the deploy.** It is the
   one item here with a real chance of surprising you late, because
   verification mail landing in spam is an outage that looks like a signup bug.
   Build against a local SMTP catcher, and treat the first real send as a task
   with its own risk rather than a formality.

**RLS gets cheaper, not riskier.** Doing it before there is production data was
already the argument in `06` P1; this ordering strengthens it.

**Rejected:** deploying a bare MVP first "to have something live." It buys a URL
and costs a second migration path — schema changes from `07` L1 would then run
against real data instead of dev data, which is the same reasoning that put 05
before 04 in the first place.

---

### D-068 — Resend over SMTP, on its own account and its own domain *(answers D-058's provider question)*

`07` L2 said to decide the provider "with the flow in front of you, not
before". This is that decision.

**Resend, addressed with stdlib `net/smtp`.** Resend exposes a plain SMTP
endpoint (`smtp.resend.com`, username the literal string `resend`, password an
API key), so the transport is already in the standard library and D-065's "name
the obligation this dependency discharges" test never has to be argued. An SDK
for "send one templated message" is not a trade worth making.

**One shared `.com`, one Resend account, all projects.** `katzeapps.com` is
registered and verified with Resend; Konku sends as `konku@katzeapps.com` and
is served at `konkuapp.katzeapps.com`. Other projects get their own local part
and their own subdomain on the same domain.

This is the amendment: the first version of this decision argued for a
*separate* domain and a *separate* Resend account per project, on the grounds
that sender reputation and account suspension are shared blast radius. That
argument is still true and is now an accepted cost rather than a refused one,
because the thing it was protecting against is speculative and the thing it
cost was real — the free tier allows exactly one custom domain, so a domain
per project means paying $20/mo for Pro or juggling an account per project.
One domain for everything makes the free tier fit permanently, and puts SPF,
DKIM and DMARC in one place instead of one place per project.

**What that costs, stated plainly, because it is the part that will bite if it
ever bites:** every project on `katzeapps.com` shares one sender reputation and
one DMARC policy. If another project ever sends bulk or marketing mail from
this domain, Konku's verification mail is what degrades — and the symptom is
new accounts that appear stuck with nothing wrong in the logs (D-067). The rule
that follows: **this domain sends transactional mail only.** Anything
resembling a campaign gets its own domain, not a new local part here.

**Not a cheap TLD, and that part stands.** `.xyz`, `.top`, `.club` and similar
are filtered more aggressively — Spamhaus reports abuse rates above 40% of
registered domains on some of them — and correct SPF/DKIM/DMARC does not fully
compensate for TLD reputation. Saving nine dollars a year to raise the spam
rate on the one message that gates account creation is a bad trade.

**Sending from the apex rather than a `mail.` subdomain** follows from sharing:
a per-project subdomain would mean a separate Resend domain entry per project,
which is the limit this decision exists to stay under. The separation between
projects is the local part.

The domain was never only an email cost. `04-ship.md` S1 needs a hostname for
Caddy's TLS regardless.

**Rejected:**

- **A domain per project.** The clean answer on reputation, and it does not
  survive contact with the pricing: one custom domain on the free tier means
  either $20/mo or an account per project, to isolate a risk that only
  materialises if one of these projects starts sending mail it should not.
  Revisit if that ever happens — the migration is DNS and one env var.
- **Amazon SES.** Genuinely cheaper ($0.10 per 1,000) with effectively
  unlimited verified domains, which would have made per-project domains free.
  Not chosen: 4–16 hours of setup and a support request to leave the sandbox,
  against traffic measured in dozens of messages a month.
- **A free domain** (`.eu.org`, a community subdomain like `is-a.dev`). Shared
  parent-domain reputation, with none of the branding being right.

**What this does not settle: deliverability.** Nothing here can be verified
locally. L2 builds against a Mailpit catcher; the first real send is `04` S4
and it carries its own risk (D-067).

---

### D-069 — Terhapus empties after 30 days, except for anything ever studied *(amends D-019, D-056)*

Soft delete meant nothing ever actually left the database. That was right for
one account and wrong the moment anyone can sign up: the quota in `07` L8
counts **live** rows, so a create-and-delete loop grows the tables without ever
meeting a limit. The write rate limiter bounds how fast; nothing bounded the
total.

**Notes and cards deleted more than 30 days ago are removed for good**, by a
job inside the server process that runs daily.

**A card that was ever reviewed, or ever appeared in an exam attempt, is kept
indefinitely** — the window does not apply to it. This is the part worth
defending. `review_logs` and `exam_attempt_cards` deliberately carry no foreign
key to `cards` (D-050), so the database would happily let a purge orphan them:
retention evidence would survive pointing at nothing, and a finished attempt
would render a question with no text. Only the predicate in the query prevents
that. The history is the part of a card that matters, and D-029's "cannot be
reconstructed retroactively" applies to what the history *refers to* as much as
to the history itself.

What the purge is actually for is the other kind of card — created, never
studied, deleted. That is exactly the churn an abusive script produces and
exactly the row nobody will miss.

**The window is stated in the UI, and that is not optional.** Every delete
dialog, both Terhapus views and the privacy policy now say 30 days; the card
copy says both halves, because "kartu yang pernah kamu ulang bisa dikembalikan
kapan saja" is a different promise from the one made about a note. A trash that
empties itself is ordinary. A trash that empties itself *silently* would be the
disappearance this product exists to prevent, and the copy is what makes the
difference between the two.

**In the process, not in a cron.** A cron is a second thing to install and a
second thing to notice has stopped, and the failure mode of forgetting it is
precisely the unbounded growth the job exists to prevent. The first sweep is
delayed five minutes after boot so a crash loop cannot become a delete loop.

**Rejected:** counting deleted rows against the quota instead. It bounds
storage with no new machinery, and it makes emptying Terhapus a prerequisite
for writing again — friction on capture, which hard rule 7 puts above almost
everything.

**Rejected:** purging cards regardless of history and letting past attempts
render blanks. The `LEFT JOIN` in the attempt query means the score survives,
so this is *nearly* harmless — but "nearly" is doing the work of destroying the
question text of an exam somebody sat, to save a row.

---

## Open questions

None blocking. Deferred details, intentionally left until the feature is being built:

- **Feynman grading output format** (D-036) — v0.3
- **Progressive focus N** (D-037) — currently 5, tune against real session data
- **Do random exam draws include mastered cards?** (D-048) — currently yes.

**Closed:** *per-user settings have nowhere to live* — `user_settings` lands in
migration `00007` (`07` L1), carrying progressive focus N, default timer
duration and the rota preference. The values are still the old constants; D-037
remains open on tuning N, which is now per-account data rather than one
person's.

Opened by the production shift (D-057 – D-066):

- **What bounds the cost of an open signup** (D-066). Quotas cap storage; they do not cap the number of accounts. Invite codes, a waitlist, and "open and watch" are all defensible; the answer depends on how the launch actually goes.
- **The rate limiter is per-process** (`internal/api/ratelimit.go`). Correct for one container, wrong the moment there are two, and D-023 rejected Redis for a problem that did not exist yet. It exists once a second instance does — not before, and running two instances is not currently planned.
- **How much of `GOALS.md` survives having other users.** It is written in the first person about one person's constraints, and D-057 promotes its rules to product constraints without rewriting it. Whether it becomes a product-principles document or stays a personal one that the principles cite is unresolved.
