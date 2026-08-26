# Before you run a second instance

**Not rehearsed, because there has never been a second instance.** This exists
so that the day there is one, the consequences below are read *before* rather
than discovered afterwards.

For the other half of the question — when *this* one instance runs out of room,
and why the answer is not a second one — see
[Capacity: when to stop accepting signups](#capacity-when-to-stop-accepting-signups)
below.

---

## The short version

**Running two app containers is a security change, not just a capacity one.**
Every rate limiter and quota in this application is per-process and in-memory
(D-023). Two instances behind a load balancer means every limit is doubled, and
an attacker who reconnects until they land on the other instance gets a fresh
budget for free.

Nothing warns you. The app starts, serves, and passes every health check.

## What actually loosens

`internal/api/ratelimit.go` holds one `map[string]*window` per process. These
are the limiters that split in half:

| Limiter | Intended | With two instances |
|---|---|---|
| Login, per IP | 10 / 5 min | 20 / 5 min |
| Signup + forgot, per IP | 5 / hour | 10 / hour |
| Signup + resend, per address | 3 / hour | 6 / hour |
| Verify + reset, per IP | 30 / hour | 60 / hour |
| Writes, per account | 300 / min | 600 / min |
| `DELETE /account`, per account | 5 / hour | 10 / hour |
| `GET /export`, per account | 5 / hour | 10 / hour |

The last two are the ones to think hardest about. `DELETE /account`
re-authenticates, so its limiter is the bound on **guessing a password** with a
stolen cookie — doubling it doubles the guesses. And `GET /export` is bounded
because each call holds an open transaction and a whole account in memory
against a pool capped at 10 per process (D-028): two instances is twenty
connections against a *shared* Postgres, which is a promise made to every other
project on that box.

## What does not loosen

Anything enforced in Postgres. The note and card quotas are `count(*)` inside a
user-scoped transaction, so they are correct at any number of instances. So is
every tenancy guarantee: the `WHERE user_id` clause and RLS are both
per-statement, not per-process.

Session storage is server-side and in the database, so a login on one instance
resolves on the other. Sessions are not the problem here.

## Before scaling, decide each of these

1. **Where do the limiters live?** D-023 rejected Redis for a problem that did
   not exist. A second instance is that problem existing. The alternative is
   limiting at Caddy, which is one process and already sees every request —
   cheaper than a new datastore, and worth pricing first.
2. **What is the pool cap now?** `maxConns` is 10 *per process*
   (`internal/store/store.go`). It has to become 10 across the deployment, or
   D-028's promise to the co-tenant projects quietly stops being true.
3. **Are the sweeps still safe?** `PurgeExpired` and `DeleteExpiredAuthTokens`
   are opportunistic and cross-user. Two instances running them concurrently is
   harmless — they are idempotent deletes — but the daily purge of soft-deleted
   notes and cards (D-069) should run on exactly one, or it is doing the same
   scan twice for nothing.
4. **What happens to the metrics?** `/metrics` is per-process (D-081), so a
   scraper needs to find both and the dashboards need to sum rather than assume
   one target.

## The honest summary

The limiters being per-process is **correct today and recorded as a known
limitation** in `DECISIONS.md` under open questions, in `internal/api/quota.go`,
and here. One container is the deployment, and this is the cheapest thing that
works for it.

It stops being correct the moment a second container starts, and the reason
this page exists is that nothing in the system will tell you so.

---

# Capacity: when to stop accepting signups

**Not rehearsed either, and written before `ALLOW_SIGNUP` was ever flipped**
(ticket 10, D-095). The point is that the decision below is *read* at 2am
rather than invented at 2am.

The question this answers: **at what point does the operator stop accepting new
accounts, and what happens instead?**

---

## The rule

When any ceiling below is crossed, **close the tap** — `ALLOW_SIGNUP: "false"`
in `docker-compose.prod.yml`, then `up -d` — rather than let the service
degrade for the accounts already in it (D-095).

Three things about that lever, because an operator will hesitate over a lever
they think is drastic:

- It is **reversible in about a minute** and costs nothing.
- It does **nothing at all to existing accounts**. Nobody who already has an
  account notices. That is what makes it the correct first move rather than a
  last resort.
- It is a **reviewed compose edit**, not an `.env` entry, on purpose. Opening
  and closing signup are both changes somebody reads.

There is no paid tier to sell into and there will never be one (D-096). If the
cost has outgrown the operator rather than the box having run out, the answer is
`docs/SELF-HOSTING.md` — the single binary anyone can run — not a price list.

## What we are actually renting

| | |
|---|---|
| The box | Contabo VPS, 4 vCPU / 7.8 GB / 145 GB, Ubuntu 24.04 |
| Whose it is | `Katzelabs/platform`'s. Konku is one tenant of ~10–15 (D-088) |
| Konku's container | `mem_limit: 512m`, one instance, no published ports |
| Konku's database | Own database and roles on the **shared** Postgres 18 |
| Konku's connections | **10**, `maxConns` in `internal/store/store.go` (D-028) |

Note what does *not* appear in that table: any resource that grows when an
account signs up. The pool is 10 whether there is one user or ten thousand.
What grows is **contention** for the same fixed slice, and every threshold below
is a way of seeing that contention before a user does.

## The ceilings, nearest first

| # | Ceiling | The number | Grounded in | Visible where |
|---|---|---|---|---|
| 1 | Verification mail | Resend free plan, shared by every project on `katzeapps.com` | D-068 | Resend dashboard only |
| 2 | Container memory | 512 MiB, of which argon2 may claim 256 MiB | `mem_limit` + `maxConcurrentHashes` × `argonMemory` | `process_resident_memory_bytes` |
| 3 | Connection pool | 10 | D-028, `store.go` | `konku_pgx_pool_*` |
| 4 | Disk | 145 GB, shared, times backup retention | PLATFORM.md, `BACKUP_RETENTION_DAYS: 14` | `df -h`, `pg_database_size` |

They are ordered by how soon each is likely to be met, not by severity. The
first one is not even ours.

### 1. Verification mail, and it is the one we do not control

Every signup costs at least one message, and mail is the only ceiling here that
a third party can move without telling us. Resend is on the **free plan** and
one domain serves every project (D-068) — that was a deliberate trade, and this
is the bill for it.

**At the time of writing the free plan is 100 messages/day and 3.000/month.
Confirm the current figure in the Resend dashboard before opening signup, and
correct this line if it has changed.** It is shared with every other project
sending from `katzeapps.com`.

The arithmetic: one signup is one verification mail; a resend is another (up to
3/hour per address); a password reset is one more. So N signups a day costs
somewhere between N and 1.5N messages, and **at 100/day the honest ceiling is
roughly 60–70 signups a day, shared**.

**What you see when this is met: nothing in our metrics.** Konku counts mail
sends nowhere. The symptom is accounts stuck at "check your email", which
presents as a signup bug — which is exactly why D-095 gates the flip on `04` S4
and puts deliverability before the tap. Watch the dashboard, not `/metrics`.

The local half of the same signal, run as the **owner** role (`users` carries a
forced RLS policy, so `konku_app` sees nothing here):

```sql
-- signups per day, last two weeks
select date(created_at) as day, count(*)
from users group by 1 order by 1 desc limit 14;

-- accounts that never got verified: mail trouble looks like this first
select count(*) from users
where email_verified_at is null and created_at < now() - interval '24 hours';
```

**Threshold and action.** Unverified-older-than-24h above **20% of the last
7 days' signups**, or the Resend daily allowance above 50% three days running:
close the tap and fix mail first. Moving to a paid Resend plan is a legitimate
call — it is the operator's hosting cost, not a charge to users, so D-096 does
not forbid it — but the order is *close, then decide*, never the reverse.

### 2. Container memory

512 MiB total. A Go binary idles around 15–30 MB on this box (PLATFORM.md), so
almost all of that headroom exists for two things:

- **argon2.** Four concurrent hashes at 64 MiB each is **256 MiB — half the
  container** (`internal/auth/password.go`). `hashSlots` is what bounds it, and
  the comment there is worth reading: the limiters in front of the hashing
  endpoints are per-IP and per-address, so without that semaphore 100 source
  addresses buy 6.4 GB resident and an OOM for every co-tenant. Opening signup
  raises exactly this traffic.
- **`GET /export`.** `export.Load` holds an account whole in memory, on purpose
  (a streamed export can send half a file and then fail, which is the failure the
  feature exists to prevent).

One observation that belongs here rather than in a task: **the export's own
backstop cannot save the process.** `maxContentBytes` is 512 MiB of note and
card text — the entire container limit — so an account approaching it OOMs the
container long before `ErrTooLarge` is returned. What actually protects the box
is the 5/hour limiter and the fact that real accounts are single-digit MB. That
is true today and is fine today; it stops being fine if account sizes ever reach
even 100 MiB, and the fix then is a real ceiling or a streaming export, not a
bigger container.

**Observable:** `process_resident_memory_bytes` on `/metrics`, or
`docker stats konku-app-1`.

**Threshold and action.** Steady-state RSS **above 256 MiB** means one burst of
four concurrent hashes can OOM the container — act before opening the tap wider.
Between 128 and 256 MiB, find out what grew. An OOM here is not loud: `restart:
unless-stopped` brings the container back and it reads as a blip.

### 3. The connection pool

10, per process, and D-028's promise to the co-tenant projects is that it stays
10. Postgres itself runs at the image default — `compose/postgres.yml` in the
platform repo sets no `command:` and no `max_connections`, so it is 100, of
which 3 are reserved for superusers — and Konku's 10 is a tenth of the box's
entire budget already.

`metrics.go` already names the leading indicator:
`konku_pgx_pool_empty_acquires_total` climbs **while latency is still fine**,
which is the window in which this is a decision rather than an incident.

**Do this before flipping the flag:** scrape once and write the numbers down.

```bash
docker run --rm --network platform alpine:3.21 \
  wget -qO- http://konku-app-1:9090/metrics | grep -E '^konku_pgx_pool|^process_resident'
```

A counter you have never read has no threshold, only a value.

**Thresholds and actions.**

| Signal | Reading | Action |
|---|---|---|
| `konku_pgx_pool_empty_acquires_total` | rising at all, from a flat baseline | The pool is now the constraint. Investigate before it is latency. |
| `konku_pgx_pool_acquired_conns / _max_conns` | ≥ 0.8 at two consecutive scrapes | Same, more urgently. |
| `konku_pgx_pool_empty_acquire_wait_seconds_total` | rising faster than ~1 s per minute | Users are already waiting. Close the tap. |

**Raising `maxConns` is not the first answer.** It is a promise to every other
project on that Postgres (D-028), so it is a platform conversation, not a Konku
commit. And running a second container to get a second pool is the wrong answer
twice over — see everything above this section.

**What is honestly not known: how many concurrent users saturate 10
connections.** Nothing measures how long a request holds a connection. The
usable approximation, from two scrapes a few minutes apart:

```
connections in use ≈ (requests/second) × (mean request duration)
```

Both halves are on `/metrics` — `konku_http_requests_total` for the rate, and
the `_sum`/`_count` pair of `konku_http_request_duration_seconds` for the mean.
When that product passes about 8, the pool is the ceiling. The measurement that
would settle it properly is a load test against a restored copy (`restore.md`
already builds one) with the pool instrumented for hold time; until somebody
does that, the arithmetic above is the estimate and should be treated as one.

### 4. Disk

145 GB, shared with every tenant, and Konku's live bytes are not the whole
story: the platform keeps **14 nightly `pg_dumpall` copies on the box**
(`BACKUP_RETENTION_DAYS: 14`) plus 7 daily and 4 weekly off-box in R2. Those
dumps hold every tenant, and they are compressed, so growth here multiplies by
something between 1 and 15 — closer to the low end, but not 1.

Two grounded numbers, 250× apart:

- **Worst case at the quotas.** 5.000 notes × 256 KiB is ~1.25 GiB, and 20.000
  cards × 2 sides × 16 KiB is ~640 MiB: about **2 GiB of text per account**,
  before the generated `tsvector` column and the trigram index from `00001`.
- **Real case.** The whole tenant database was **~8 MB** at the pg18 move, after
  a year of one operator actually using it (PLATFORM.md).

Do not plan against either in isolation. The quotas were deliberately set past
anything a person reaches (`internal/api/quota.go`), so they do **not** pace disk
growth — real use does, and real use is three orders of magnitude below them.
What the worst case does tell you is the blast radius of a script: a handful of
accounts written to the quota ceiling would be a disk incident, and
`konku_quota_rejections_total` is the series that says somebody tried.

**Observables** — nothing in `/metrics` reports disk:

```bash
df -h                                   # on the box
psql -c "select pg_size_pretty(pg_database_size('konku'))"        # as the owner
psql -d konku -c "select relname, pg_size_pretty(pg_total_relation_size(c.oid))
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' order by pg_total_relation_size(c.oid) desc limit 10"
```

**Threshold and action.** Box disk above **70%**: stop and find what is growing
before assuming it is Konku — it is at least as likely to be the dumps or
another tenant. Konku's own database doubling month over month: find the table
before finding the users.

## What is missing today, and it is the honest part

Three gaps, all of which make the thresholds above harder to act on than they
read:

1. **Nothing counts signups.** D-099's account-lifecycle counters (ticket 13)
   do not exist yet — `internal/api/metrics.go` registers four `konku_` series
   and none of them is an account count. So the daily signup ceiling D-095 asks
   for is the SQL in §1, run by hand, not an alert.
2. **Nothing scrapes `/metrics`.** PLATFORM.md rules out Prometheus/Grafana on
   this box deliberately, and `deploy.md` records the consequence: the metrics
   bind buys observability by `docker exec` only. Every number in this page is
   read by the `docker run --rm --network platform` incantation above. **A
   threshold nothing watches is a threshold somebody has to remember**, which is
   the real reason the action attached to each one is "close the tap" rather
   than "tune it".
3. **No suspend switch.** D-095 names it as the first thing gating the flip, and
   until it lands the operator's whole answer to one abusive account is a manual
   `UPDATE` on the box. Capacity and abuse are the same page in practice: one
   account can consume the write-rate budget of many.

## The escalation ladder

In order. Each step is only taken because the one above it was not enough.

1. **Close the tap.** Free, reversible, invisible to existing accounts.
2. **Find out which ceiling it actually was.** The four sections above, in that
   order — mail is more often the answer than the pool.
3. **Buy the specific headroom, if it is cheap and specific.** A paid Resend
   plan is buyable by Konku alone. More RAM or a bigger box is a platform
   decision affecting every tenant and is not Konku's to make.
4. **Self-host.** `docs/SELF-HOSTING.md`. If hosting cost has outgrown the
   operator, this is the answer D-096 chose *in advance*, precisely so that this
   moment is not when it gets decided.

**Not on the ladder: a second app container.** The first half of this page is
the whole argument — two instances double every rate limit, halve the value of
every per-process quota, and doubling the pool breaks the promise D-028 made to
the co-tenants. Konku scales up before it scales out, and mostly it does
neither: it closes the tap.

**Also not on the ladder: a paid tier, usage pricing, or a degraded free
service.** There are none and there will not be (D-096). The quotas in this page
are a capacity control, and the moment they are treated as a lever against a
price list they stop being an honest number.

## Open measurements

Four things this page states as estimates and should not have to:

1. **Resend's current free-plan allowance**, confirmed in the dashboard on the
   day signup opens, and written into §1.
2. **A baseline scrape** of the six `konku_pgx_pool_*` series and
   `process_resident_memory_bytes`, taken the day before the flip. Every pool
   threshold is relative to a number nobody has recorded yet.
3. **Mean connection hold time per request.** Not measured anywhere. The
   histogram arithmetic in §3 is the approximation; a load test against a
   restored copy is what would settle it.
4. **Real bytes per active account**, after a month of strangers rather than one
   operator: `pg_database_size('konku')` divided by the account count. The whole
   disk section extrapolates from a single data point of ~8 MB.

## The honest summary

One container on somebody else's box, with a tenth of a shared Postgres and half
a gigabyte of RAM, is enough for a great many accounts — because the resources
this application consumes barely move with the number of accounts. What moves is
the mail bill, the size of a burst, and the disk.

None of the four ceilings will announce itself. Three of them are only visible
by hand, and the first one is only visible in somebody else's dashboard. So the
rule is deliberately blunt and deliberately early: **when the numbers say stop,
close the tap, and keep the service good for the people already inside it.**
