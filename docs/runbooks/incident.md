# Incident

Writing-only: this one cannot be rehearsed. It exists so that the decisions
that are hardest to make well under pressure — what to tell people, and when —
are made in advance (D-064).

---

## The order

1. **Stop the bleeding.** Roll back (`rollback.md`) or restore
   (`restore.md`). Do not debug a live outage in production if a rollback is
   available; the previous digest is one command away and understanding can
   wait.
2. **Say something**, if the bar below is met.
3. **Write it down**, afterwards, always.

Diagnosis comes after mitigation. The temptation to find the cause first is
strong and it is wrong: every minute spent understanding is a minute of
outage, and the cause is still there to be found afterwards.

## What counts as an incident

| | Incident? |
|---|---|
| The service is down or unusable for more than a few minutes | **yes** |
| Data was lost, or restored from a backup | **yes** |
| Anyone's data was visible to anyone else | **yes — always**, however briefly |
| A deploy was rolled back | no, but write it down |
| 5xx above 0.1% for five minutes | yes, if users noticed |
| A slow hour | no |

The third row has no threshold on purpose. Multi-tenant but never social
(D-039) means cross-tenant exposure is the one failure this product cannot
absorb quietly, and "it was only for a minute" is not a reason to stay silent.

## Telling users

**A cross-tenant leak is disclosed. Always, promptly, in plain language.**
That is the whole argument for RLS being a launch requirement (D-059) — the
cost of the failure is not a bug report, it is a disclosure.

For everything else, the bar is: **would a user rather have heard it from us?**
Downtime they noticed, yes. Downtime at 04:00 that nobody hit, no.

Say, in Bahasa Indonesia, on whatever channel exists:

- what happened, in one sentence, without jargon
- whether their data was affected, explicitly — including "no" when it is no
- what has been done
- what happens next, if anything is required of them

Do not say "we take security seriously". Do not blame a provider. Do not
promise it cannot happen again. Rule 6 applies to operators too: an outage is
a normal event, and the copy stays calm and direct.

## Writing it down

Append to this file. Not a separate system, because a separate system is one
more thing to remember and this is the file you will already have open.

```
## YYYY-MM-DD — one-line summary

**Impact.**       Who was affected, for how long, and how it showed up.
**Detected by.**  An alert, a user, or noticing by accident. If the last one,
                  that is the most important finding in the entry.
**Cause.**        What actually happened. Not who.
**Fixed by.**     What was done, and the digest or dump involved.
**Told users?**   Yes or no, and why.
**Follow-ups.**   What would have caught it sooner, or made it smaller.
```

**"Detected by" is the field that earns this document.** Three incidents in a
row detected by a user is a monitoring problem, and it is only visible if the
field is filled in honestly every time.

## Known gaps, as of 2026-08-09

Recorded so an incident does not surface them as a surprise:

- **No alerts are wired up.** The three are defined (`06` P3) and the signals
  for two exist, but routing needs a real endpoint and is `04-ship.md` S5.
  Right now detection is "the operator notices".
- **The backup alert has no signal at all.** `make db-dump` is manual, so
  there is nothing yet that could fail to complete.
- **Backups are local only.** They survive `docker compose down -v` and a bad
  migration; they do not survive losing the machine. Off-site arrives with
  restic in `04-ship.md`.
- **The restore drill has only been run against dev compose**, on a 64 KB
  dump. See the caveat at the bottom of `restore.md`.

---

## Log
