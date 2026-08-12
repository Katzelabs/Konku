# 08 — Ulangan absorbs Ujian

**Needs the VPS?** No. Local work against `docker-compose.yml`.
**Status:** done.

Runs out of numeric sequence, like `05` and `04` before it (D-067). It landed
between `07` L1–L9 and `04-ship.md` because it reshapes the schema, and
shipping first would have meant migrating real user data instead of dev data —
the same reasoning that put `05` before `04`.

## Why

Konku had two top-level features doing the same thing. **Ulangan** (`/review`)
was the SRS due queue; **Ujian** (`/exams`) was a saved, repeatable practice
test. They sat side by side in the nav with Timer between them, shared the
prompt → reveal → `ingat`/`lupa` interaction, and had shared one answers table
since `00002`. The split was build order, not product (D-075).

Merging was also the moment to close the two real gaps in the exam config —
it filtered on a *single* domain and could not filter on categories at all —
and to add a question format, so a set can be asked as *pilihan ganda* instead
of Anki-style recall.

## What shipped

**R1 — Migration `00012`.** `exams` → `review_sets`, `exam_attempts` →
`review_runs`, plus the two child tables, every index, constraint and RLS
policy. `review_logs.exam_attempt_id` → `run_id`, and its `source` vocabulary
`'review'|'exam'` → `'due'|'set'`. Round-trips: `goose down` collapses
multi-domain sets back to one `domain_id` and drops the option snapshots, and
says so.

**R2 — Filters.** `review_set_domains` and `review_set_categories`, both
carrying `user_id` and pointing at `UNIQUE (user_id, id)` (D-047). Empty means
unfiltered, which is what the old nullable `domain_id` meant. Domains OR,
categories OR, the two groups AND.

**R3 — Question format** (D-076). `review_sets.format` is `recall` or
`choice`. On the set, never on the card: the same card is recall in one set and
multiple choice in another, and putting it on `cards.type` would have been the
type picker D-055 refused.

**R4 — Multiple choice** (D-077). Distractors are sampled from the backs of the
user's other cards, one pool per run, and snapshotted into
`review_run_cards.options` with `correct_index`. Grading is server-side and
`correct_index` is never serialized. A question that cannot reach four distinct
options is asked as recall instead, so a three-card account can still press
mulai. `review_logs.format` tags the answer so retention can exclude
recognition.

**R5 — One API tree.** `/api/review/{due,sets,runs}`. `/api/exams` and
`/api/attempts` are gone. Sets gained `unarchive`, which exams never had.

**R6 — One screen.** `/review` leads with "Ulangan hari ini" and a Mulai
button; saved latihan sit underneath. `/review/due`, `/review/sets/:id`,
`/review/runs/:id`. The nav has one Ulangan entry where it had two.

**R7 — Everything downstream.** Export archive filenames, the two new join
tables in the archive, the purge predicate, the privacy policy and its coverage
test, PRD §5.2, the TECH data model and route table.

## Acceptance

- [x] `make check` green — vet, typecheck, unit tests, `check-pure`, sqlc drift
- [x] Integration suite green as `konku_app`, including `TestMigrationsApplyToAnEmptyDatabase`, the per-version ladder through v12, and `TestTheLastMigrationRollsBackAndReapplies`
- [x] Tenancy: user B gets **404** on every `/review/sets` and `/review/runs` path (D-039). Non-negotiable.
- [x] `TestChoiceOptionsAreSnapshotted` — resume returns byte-identical options
- [x] `TestCorrectIndexIsNeverSerialized` — the run detail JSON has no answer key
- [x] `TestChoiceAnswerIsTaggedAndDoesNotMoveTheSchedule`
- [x] `TestChoiceFallsBackToRecall` — a 2-card account still starts a choice run
- [x] `TestDrawRespectsCategories`, `TestDrawRespectsMultipleDomains`
- [x] Verified against the running binary: options differ per question, resume is
      stable, `source='set'` / `format='choice'`, zero schedules moved

## Not in scope

**Review over notes.** Cards only. A note has no `back` to withhold and no
ladder to sit on, so it is a different interaction rather than a filter on this
one — see the open question in `DECISIONS.md`. Nothing in `00012` blocks it.

**`time_limit_minutes`** is still stored, still validated, and still has no UI.
It was unused before this task and is unused after it; growing the scope to
wire it up was not part of the merge.
