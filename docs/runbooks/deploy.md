# Deploy to the VPS

**Not rehearsed. The app has never been deployed.** This is written before it
is needed, like the rest of `docs/runbooks/`, and the first run through it is
`04-ship.md` S1–S3 and S5 — expect to correct it as you go, and correct it *in
this file* rather than in your memory.

Covers the first deploy, subsequent deploys, backups and alerts. Rolling back
has its own page: `rollback.md`.

---

## Before the first deploy

The box is **shared**. Postgres, Caddy and Mongo already serve other projects
on the `shared` Docker network, and every step below is written so that a
mistake here costs Konku and not them.

```bash
docker network create shared     # once, if the infra stack is not already up
```

### Roles and database

Two principals, and the difference is load-bearing (D-059). A table owner
bypasses its own RLS policies, so an app connecting as the owner has RLS in
name only.

```sql
CREATE ROLE konku LOGIN PASSWORD '...';        -- owns the schema, runs migrations
CREATE DATABASE konku OWNER konku;
REVOKE CONNECT ON DATABASE konku FROM PUBLIC;
\c konku
CREATE EXTENSION IF NOT EXISTS vector;         -- from day one (D-025)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE ROLE konku_app LOGIN PASSWORD '...';    -- the running app
```

**Check the app role cannot bypass RLS before going further.** This is the one
that silently invalidates everything else, and it is the bug that was found in
local dev:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'konku_app';
-- both flags must be f
```

### Environment

Every variable `docker-compose.prod.yml` expects:

| Variable | Notes |
|---|---|
| `KONKU_IMAGE` | **a digest ref**, `ghcr.io/katzelabs/konku@sha256:…` |
| `KONKU_HOST` | the hostname Caddy routes |
| `DATABASE_URL` | **`konku_app`** — never the owner, never `postgres` |
| `MIGRATION_DATABASE_URL` | the owner. **Not optional** |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `SENTRY_DSN` | closes `06` P3 |
| `SMTP_URL` / `MAIL_FROM` | Resend, `smtps://` on 465 (D-068) |
| `PUBLIC_BASE_URL` | must equal `https://$KONKU_HOST` |

Two of these fail in ways worth stating, because neither is obvious from the
symptom:

- **`MIGRATION_DATABASE_URL` unset falls back to `DATABASE_URL`**, which has no
  DDL rights. Migrations run at startup and failure is fatal by design, so the
  container will not survive its first boot on a fresh database.
- **`PUBLIC_BASE_URL` wrong is discovered after the mail is delivered.** Every
  verification and reset link is built against it. It is not cosmetic.
- **`KONKU_IMAGE` unset refuses to start**, on purpose. A default would be the
  D-061 failure exactly — running something other than the artifact that was
  verified — and it would be silent.

`ALLOW_SIGNUP=false` and `DEV=false` for the first deploy. Opening signup is
`07` L10 and comes after S6.

---

## Deploy

**By digest, never by tag.** A tag can be moved after it was tested, and then
"what is running in production" is a question nobody can answer (D-061).

```bash
# 1. Verify the digest you intend to run, before it touches the box.
make release-verify REF=ghcr.io/katzelabs/konku@sha256:<digest>

# 2. Back up first. Every deploy runs migrations.
/opt/konku/scripts/backup.sh

# 3. Point the compose file at that exact digest. Record it somewhere the
#    next deploy can read: rolling back means knowing what the previous one
#    was, and `docker inspect` after the fact is not a plan.
echo 'KONKU_IMAGE=ghcr.io/katzelabs/konku@sha256:<digest>' >> /opt/konku/.env

# 4. Pull and start, on the box.
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 4. Watch it come up. Migrations run at startup.
docker compose -f docker-compose.prod.yml logs -f app
```

**Never `docker build` on the server.** The image is built and published by CI
and pulled here.

### Verify, in this order

```bash
# The process is alive, and the schema is the one this binary expects.
curl -s https://$KONKU_HOST/readyz          # {"status":"ok","schema_version":N}

# Docker agrees, which is what the restart policy acts on.
docker inspect --format '{{.State.Health.Status}}' konku-app-1   # healthy

# HSTS is actually emitted. NOT yet verified anywhere — the header comes from
# the caddy-docker-proxy label, and the label quoting has never been exercised
# against a running Caddy.
curl -sI https://$KONKU_HOST | grep -i strict-transport-security

# Metrics are reachable on the shared network and NOT from the internet.
docker run --rm --network shared alpine:3.21 \
  wget -qO- http://app:9090/metrics | head -3
curl -s --max-time 5 https://$KONKU_HOST:9090/metrics   # must fail
```

Then sign in from your phone. That is the check the others stand in for.

### HSTS: raise it deliberately

It ships at `max-age=300`. **Leave it there until you have watched a
certificate renew.** HSTS cannot be withdrawn inside its own window — if
renewal is broken and the policy is a year, the site is unreachable for a year
in every browser that saw it once. Once renewal has demonstrably worked:

```
caddy.header.Strict-Transport-Security: "max-age=31536000; includeSubDomains"
```

`includeSubDomains` only if **every** host under `katzeapps.com` can serve TLS.
The apex is shared across projects, so this commits them too.

---

## Backups

`scripts/backup.sh`, nightly from cron:

```
15 3 * * *  /opt/konku/scripts/backup.sh >> /var/log/konku-backup.log 2>&1
```

Its config lives in `/opt/konku/backup.env`, `chmod 600`, never in the repo.

**It dumps, then restores what it dumped into a scratch database and compares
row counts, in the same run.** That is the point: "the backup ran" and "the
backup is restorable" are one signal rather than two. A cron that stops running
is caught by the alert; a cron that keeps running and writes files nobody can
read back is silent for months and is discovered on the worst possible day.

The script fails loudly and pings nothing on failure — **the alert is the
absence of the heartbeat**, so a failure that still pinged would be a backup
reporting itself healthy while broken.

Two properties that must be changed together with something else:

- **Retention is 30 days because `/privacy` says so.** `--keep-daily 30` is a
  promise to users that their data is gone from backups within 30 days of
  deleting their account. Changing it without changing the policy makes the
  policy false.
- **The verify uses `--no-owner --no-privileges`.** It proves the *data* came
  back. It does not prove the grants and policies did — that is the full drill
  in `restore.md`, which is a different exercise on a different cadence, and
  it is the one that produces the RTO number in `PRD.md` §9.

Restic pushes off the box. A backup on the same machine as the database
survives a bad migration and `docker compose down -v`; it does not survive
losing the machine, which is the case that ends the project.

---

## Alerts

Three, from `04-ship.md` S5. **Trigger each one deliberately** — an alert
nobody has seen fire is an alert you are guessing about.

| Alert | Condition | How to test it |
|---|---|---|
| Service down | `/readyz` failing 2 min | stop the app container |
| Shipped broken | 5xx above 0.1% for 5 min | `/api/__panic` is dev-only, so force a 500 another way |
| Backup did not complete | no heartbeat in 26 h | point `BACKUP_OWNER_URL` at nothing and run the script |

The second alert needs something scraping `/metrics`, which nothing does yet.
Standing up a Prometheus on the `shared` network is part of S5 and is what
makes the metrics bind (D-081) worth anything.

**The status page must not live on this box.** An app that is down cannot serve
the page saying it is down. GitHub Pages from `Katzelabs/Konku` is enough.
Until it exists, email to the affected accounts is the whole channel, which is
what `incident.md` says to use.

---

## What to write down afterwards

This file is unrehearsed, so the first run is also its review.

- Every command that needed correcting — **here**, in the same session
- The restore timing from the real drill → `restore.md` and `PRD.md` §9
- Whether the HSTS label produced the header, and at what quoting
- `CLAUDE.md`'s "Current state" still says the app has never been deployed.
  That sentence is the deploy's last step.
