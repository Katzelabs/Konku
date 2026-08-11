# 04 — Ship

The work that genuinely requires the VPS, and nothing else.

**~8 h** · needs `06-production-hardening.md` and `07-public-launch.md` L1–L9 ·
followed by `07` L10

**This file runs late on purpose** (D-067). It used to come before the
hardening work, on the reasoning that shipping beats polishing. That reasoning
was right about *using* the app and wrong about *deploying* it — almost
everything left is local work against `docker-compose.yml`, and doing it first
means the deploy is one careful afternoon instead of a moving target.

**CI moved to `06` P0** — GitHub Actions needs no server, and it should be
gating everything that comes before this file.

**Daily use is not deferred to this file.** It starts the day `06` starts, on
`make dev-web`. What waits for the deploy is the part a laptop cannot test:
reviewing on a phone during dead time, which is the behaviour the product
actually depends on (S6).

---

## S1 — VPS deploy

`todo` · ~3 h · no deps

Follows `TECH.md` §11.

**Shared infra stack** (once, if not already up):
```bash
docker network create shared
# caddy + pgvector/pgvector:pg17 + mongo on that network
```

**Provision konku's database and roles:**
```sql
CREATE ROLE konku LOGIN PASSWORD '...';           -- owns the schema, runs migrations
CREATE DATABASE konku OWNER konku;
REVOKE CONNECT ON DATABASE konku FROM PUBLIC;
\c konku
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE ROLE konku_app LOGIN PASSWORD '...';       -- the running app (06 P1)
```

- The app connects as `konku_app`, **never** as `postgres` and — since `06` P1
  — never as the owner either. A table owner bypasses its own RLS policies,
  which is the difference between RLS and the appearance of it (D-059)
- `pgvector` image from day one even though nothing uses vectors until v1.3 —
  installing it later on a shared instance means coordinated downtime across
  every project on the box (D-025)
- Deploy `docker-compose.prod.yml`, set `KONKU_HOST`, `DATABASE_URL`,
  `SESSION_SECRET` (`openssl rand -base64 32`), `SENTRY_DSN`, `SMTP_URL`
- `ALLOW_SIGNUP=false`, `DEV=false`
- Create your account with `konku seed-user`
- Migrations run themselves at startup

**Done when:** the app is reachable over HTTPS on your domain, you can log in
from your phone, and `/readyz` returns ok while `/metrics` is **not** reachable
from the internet.

---

## S2 — Deploy by digest, and roll back once

`todo` · ~1 h · needs S1, `06` P9

`06` P9 already built and published the image and proved it runs. This is the
VPS half (D-061):

- The box pulls the image **by digest** from the registry. Never
  `docker build` on the server — it makes "what is running in production"
  unanswerable
- Rollout: back up → deploy → verify `/readyz` → previous digest one command
  away
- **Actually roll back once**, from `docs/runbooks/rollback.md`, before you
  need to

**Done when:** you have deployed a tag and rolled back to the previous digest
without improvising, and the runbook needed no corrections you did not write
down.

---

## S3 — Backups on the box

`todo` · ~2 h · needs S1

`06` P11 gave the local database a dump and `06` P10 rehearsed the restore.
This is the production version (D-064):

- Nightly `pg_dump -Fc konku` — **per-database, not `pg_dumpall`**, so
  restoring Konku never disturbs the other projects sharing that Postgres
- Push off the box with restic to B2 or S3, encrypted, with a retention
  policy. A couple of dollars a month. A backup on the same machine as the
  database is not a backup
- **The job alerts on failure** (S5). A silent cron that stopped working in
  March is the standard way this goes wrong

**Done when:** you have restored last night's production dump into local dev
and logged in against it — timed, and written into `docs/runbooks/restore.md`.
That number is the RTO in `PRD.md` §9.

---

## S4 — Real mail: the sending domain

`todo` · ~1 h · needs S1, `07` L2

`07` L2 built the flow against a local catcher. Everything below is the part a
catcher cannot test, and it is the item in this whole plan most likely to
surprise you (D-067):

The domain is `katzeapps.com`, already registered and verified with Resend
(D-068). Konku sends as `konku@katzeapps.com`.

- SPF, DKIM and DMARC on `katzeapps.com` — set once, shared by every project
  on it, which is why the DMARC policy is worth getting right rather than
  leaving at `p=none` forever
- `SMTP_URL`, `MAIL_FROM` and `PUBLIC_BASE_URL` set in the production
  environment. `PUBLIC_BASE_URL` must match `KONKU_HOST`
  (`https://konkuapp.katzeapps.com`) — every link in every message is built
  against it, and a wrong value is only discovered after delivery
- A real verification mail to a **Gmail** address, and a real reset mail
- Check the spam folder before declaring victory

**Verification mail landing in spam is an outage that looks like a signup
bug** — new accounts appear stuck, nothing errors, and nothing in the logs is
wrong. Do not discover this after L10.

**Done when:** both mails land in a Gmail inbox from the production sender, and
`mail-tester` or equivalent scores the domain cleanly.

---

## S5 — Monitoring and alert routing

`todo` · ~1 h · needs S1

`06` P3 decided the three alerts and built the instrumentation they need. This
points them at a real endpoint and a destination that reaches you (D-062):

1. `/readyz` failing 2 min → the service is down
2. 5xx above 0.1% for 5 min → something shipped broken
3. The nightly backup did not complete (S3) → the only one otherwise silent

**Trigger each one deliberately.** An alert nobody has ever seen fire is an
alert you are guessing about.

**Done when:** stopping Postgres on the box reaches your phone, and you have
seen all three fire once.

---

## S6 — Use it from your phone for two weeks

`todo` · not a build task · needs S1

You have been using it locally since `06` started. This tests the part a
laptop never could: **does review actually happen in dead time?**

Watch for:

- Sessions where you skip the capture prompt — if that is most of them,
  capture friction is still too high and that is the next thing to fix, not a
  feature
- Notes with zero cards — writing is happening, card-making is not
- Reviews you avoid — is recall-before-reveal too effortful, or the daily cap
  too high?
- Whether you open it at all when you are not at your desk. If not, the
  mobile experience is the gap, and no v1.2 feature closes it

**If capture is not happening, fix that before `07` L10.** Opening signup on a
product whose core loop does not hold for its designer is the wrong order in a
way no amount of hardening compensates for (D-030).

---

## S7 — Write down what shipping taught you

`todo` · ~30 min · needs S6

Two weeks of real use will surface things this plan got wrong. Record them
where they will be found: a new decision in `DECISIONS.md` if it changes a
choice, a line in the relevant task file if it changes the work.

Specifically worth capturing before memory fades: what the deploy actually
took versus the estimate, anything in a runbook that was wrong the first time
it mattered, and any friction in the capture flow — the last one is the
product's central risk and the only two weeks of naive impressions you will
ever have.
