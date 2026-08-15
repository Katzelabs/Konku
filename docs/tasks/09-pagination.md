# 09 — The index lists page, and say how many there are

**Needs the VPS?** No. Local work against `docker-compose.yml`.
**Status:** done.
**ClickUp:** [86eymcdn9](https://app.clickup.com/t/86eymcdn9) (urgent).

Runs before `04-ship.md` for the same reason `05` and `08` did (D-067): it is
local work, and it is a data-loss-shaped bug. Shipping first would mean the
first real accounts hit the ceiling before the fix does.

## Why

Both index screens truncate and then report the truncated count as the total.

**Catatan.** `useNotes` sends no `limit`, so `handleListNotes` applies its
`defaultLimit = 50` (`internal/api/notes.go:368`). It also sends no `offset`,
and there is no UI that could. The header renders `{notes?.length ?? 0}
catatan` (`NotesPage.tsx:221`) — with 300 notes it says "50 catatan" and note
51 is unreachable through the app. The search box makes it worse: `filtered`
is a client-side `title.includes(q)` over the 50 already in memory
(`NotesPage.tsx:140`), so searching for a note written last month returns
nothing and looks like an answer.

**Kartu.** `useCards` sends `limit=500`, the server clamps to `cardListLimit =
500`, and `ListCards` has **no `OFFSET` at all** — the SQL ends `LIMIT $2`
(`internal/store/queries/cards.sql:90`). Card 501 is unreachable by any
request the API can express. The screen at least says so
(`Menampilkan 500 kartu pertama`, `CardsPage.tsx:371`) with a comment that
reads "If this ever trips, paging is the fix". This is that.

**The ceilings are reachable by design.** `07` L8 set the per-account caps at
5.000 notes and 20.000 cards. The product's one job is that nothing you learn
disappears silently, and a note that exists, counts against your quota, is
returned by `/api/export`, and cannot be opened from the UI is exactly that
failure — with the added insult that the header states a total which is not
one.

**Verdict: build it.** Not a nice-to-have and not a v0.2 item.

## Scope note

The task says "paginate". Notes search is in scope anyway: filtering the
loaded page is a small lie at 50 rows and a large one at page 1 of 12, so
paging the list without moving search to the server makes the screen worse,
not better. It is P5 below and it is the only thing here that is not literally
in the ticket.

Ranked full-text search stays deferred (D-031). This is `ILIKE`, exactly what
cards already do.

## Steps

### P1 — One paginated response shape

New `internal/api/list.go`:

```go
type page[T any] struct {
    Items  []T   `json:"items"`
    Total  int64 `json:"total"`
    Limit  int   `json:"limit"`
    Offset int   `json:"offset"`
}
```

`defaultLimit`/`maxLimit` move out of `notes.go` into it and both lists share
them: **default 50, max 200**. `cardListLimit = 500` is deleted.

Breaking change to `GET /api/notes` and `GET /api/cards` — both return a bare
array today. Every consumer is in this repo (`NotesPage`, `CardsPage`,
`HomePage`; `features/review/queries.ts` imports `cardKeys` only), so it is a
rename, not a migration. No API version to bump — nothing external consumes
this.

Also delete the stale comment at `cards.go:82` about the exam picker: D-077
made sets filter-based and `useCards` has exactly one caller now.

**Offset, not keyset.** Notes sort by `updated_at DESC`, which mutates, so
offset paging can in principle shift a row across a page boundary. It does not
survive contact with how the screen actually works: every note and card
mutation invalidates the whole `notes`/`cards` key, and TanStack refetches
every loaded page of an infinite query on invalidate, so any local edit
recomputes the loaded pages consistently from offset 0. The remaining window
is an edit from a second device between two page fetches. Keyset on
`(updated_at, id)` would close that and costs a cursor in the URL, a
compound-comparison `WHERE`, and no `total`; at a 5.000-row ceiling it is not
worth it.

### P2 — `total` from the same query

Add `count(*) OVER () AS total` to both `ListNotes` and `ListCards`, so the
filtered total arrives with the page rather than in a second round trip that
can disagree with it. Zero rows returns zero rows, and `total` falls back to
`0` — which is correct.

Add `LIMIT $2 OFFSET $3` to `ListCards`; it has never had an offset. Run `make
sqlc`.

The count is **after** the filters and after the `deleted` switch, so Terhapus
reports its own total and a domain filter reports the filtered total.

### P3 — Server tests

In `notes_test.go` and `cards_test.go`, table-driven, against the existing
integration harness:

- seed 3, `?limit=2` → 2 items, `total: 3`
- `?limit=2&offset=2` → 1 item, `total: 3`
- `?offset=99` → 0 items, `total: 3` (not an error)
- `total` respects `?deleted=true` and a `?domainId=` filter
- cards specifically: `?offset=` actually skips — the parameter it never had

### P4 — The hooks

`api/types.ts` gets `Page<T>`. `useNotes` and `useCards` become
`useInfiniteQuery` with `pageParam` as the offset and `getNextPageParam`
returning `offset + limit` while `loaded < total`, `undefined` otherwise. Both
return the flattened rows, `total`, `hasNextPage`, `fetchNextPage` and
`isFetchingNextPage`.

`HomePage` slices `useNotes()` to 6 (`HomePage.tsx:157`) and must not mount an
infinite list to do it: give it `useRecentNotes(6)`, a plain `useQuery` that
requests `limit=6`, keyed under `noteKeys.all` so the existing mutation
invalidations still reach it.

`CARD_LIMIT` is deleted from `cards/queries.ts`.

### P5 — Notes search moves to the server

`ListNotes` gets the same optional `query` parameter `ListCards` has, matched
with `ILIKE` against `title` only — the placeholder says "judul" and must keep
not promising more. `handleListNotes` reads `?q=`, `useNotes` sends it, and
`filtered` disappears from `NotesPage`; `useAutoSelect` and `useSelection`
then read the page rows directly.

**No migration was needed.** `notes_title_trgm_idx` has existed since `00001`
— the planned `00013` mirroring `cards_front_trgm_idx` would have created an
index that was already there.

### P6 — The screens

- The header meta reads `total`, not `items.length`. This is the half of the
  bug that misinforms rather than hides.
- A **"Muat lebih banyak"** button under the list, with the remaining count
  ("Muat lebih banyak (250 lagi)"). Explicitly **not** scroll-triggered
  autoload: in list view the left column is a scroll container beside a live
  preview and auto-select opens the top row on arrival (D-078), so loading on
  scroll would move the ground under both.
- Delete the `cards.length >= CARD_LIMIT` notice — it is replaced by a real
  control.
- The selection bar counts real ids and stays correct, but a **select-all**
  over a paged list selects what is loaded while the header states a larger
  total. Label it for what it does, or drop it to the visible rows and say so.
  Never let one number imply the other.
- Loading state on the button, error state on a failed next page that keeps
  the loaded rows on screen.
- Copy stays non-punitive: it is "muat lebih banyak", never "kamu punya
  terlalu banyak".

### P7 — The regression guard

The `06` rule applies: assert behaviour. Two tests, because it broke in two
layers.

- Go: seed 51 notes, page to the last one, assert it is reachable and that
  `total` is 51.
- Playwright (`web/e2e`): seed past one page, click "Muat lebih banyak",
  assert a second-page row appears and the header total never changed.

### P8 — Write it down

- `DECISIONS.md` **D-084** — the list endpoints return `{items,total}` and page
  by offset; why offset and not keyset; why the total is a window function and
  not a second query.
- `CLAUDE.md` — the state paragraph, and the D-078 index-screen paragraph
  which currently describes the lists as if they were whole.
- `docs/TECH.md` — the list response shape, if it documents endpoint shapes.

## What the plan got wrong

Three things, found while building it.

**`/cards` had a second consumer.** `usePickableCards` in
`features/review/setQueries.ts` called `api.get('/cards')` directly rather than
through `useCards`, so a grep for importers of `cards/queries` missed it — and
P1's claim that `useCards` "has exactly one caller" was wrong. It was worse
than a missed call site: the picker built its own single-domain request and
dropped the filter entirely when a set named more than one domain, so a
two-domain fixed set was offered every card in the account. It is
`useCards({ domainIds })` now, filters, paging and all, and the picker got the
same **Muat lebih banyak** treatment.

**A row-carried total cannot describe an empty page.** P2 said an empty result
"returns zero rows, and `total` falls back to 0 — which is correct". It is
correct for an empty list and wrong for `?offset=9999` against 51 notes, which
would report "0 catatan" to an account holding 51 — the same lie, reached by a
different door. `pageTotal` in `internal/api/list.go` re-asks *the same query*
for one row from the top instead of introducing a second count with its own
copy of the `WHERE` clause. The test that caught it is in `paging_test.go`.

**The migration was unnecessary.** See P5.

One thing the plan did not mention and should have: both list queries needed
`id` as an ordering tiebreaker. Without a total order a page boundary landing
inside a tie serves one row twice and skips another — a list that loses
something while paging, which is the failure this task exists to fix.

## What it missed, swept later (D-087)

The scope here was "the two index screens", and that was the right scope for
the ticket. It was not the whole of the bug. An audit of every remaining list
endpoint found the identical failure in the review feature:

- **A set's run history** was twenty rows embedded in the set detail, drawn by
  a query with a hardcoded `LIMIT` and **no `OFFSET`** — exactly what `ListCards`
  had. The twenty-first sitting was counted in `runCount`, exported, and
  unreachable. It is `GET /api/review/sets/{id}/runs` now.
- **`/api/review/sets`** had no `LIMIT` in its SQL at all, with three correlated
  subqueries per row.
- **`/api/sessions`** returned a bounded slice with no `total`, so thirty rows
  looked the same whether the log held thirty or three hundred.

Two lists were deliberately left alone, and D-087 says why at length: paging
`/domains` or `/categories` would break the searchable pickers that filter them
client-side, and `/review/due` is capped by D-009 on purpose.

The lesson for the next task of this shape: the grep that finds the bug is not
"which screens truncate" but **"which `:many` queries have a `LIMIT` and no
`OFFSET`, or no `LIMIT` at all"**. Both halves are wrong in different ways, and
neither is visible from the screen.

## Acceptance

- With 300 notes and 1.200 cards seeded, every one of them is reachable
  through the UI without editing a URL.
- Both headers state the true total under every filter, including Terhapus.
- Searching a note whose title is on page 6 finds it.
- `make check` and `make test-integration` pass.
