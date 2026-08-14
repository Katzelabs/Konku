# Before you run a second instance

**Not rehearsed, because there has never been a second instance.** This exists
so that the day there is one, the consequences below are read *before* rather
than discovered afterwards.

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
