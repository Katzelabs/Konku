# Deploy to the VPS

**Not rehearsed. The app has never been deployed.** This is written before it
is needed, like the rest of `docs/runbooks/`, and the first run through it is
`04-ship.md` S1–S3 and S5 — expect to correct it as you go, and correct it *in
this file* rather than in your memory.

Covers the first deploy, subsequent deploys, backups and alerts. Rolling back
has its own page: `rollback.md`.

---

## Before the first deploy

The box belongs to `Katzelabs/platform`, and **its `PLATFORM.md` is the
contract this page obeys** — read that first. What it means here:

- One process owns `:80`/`:443` for the whole machine: the edge
  (`compose/edge.yml`, caddy-docker-proxy). Konku publishes **no ports**. It
  joins the `platform` network, declares `caddy.*` labels, and the edge picks it
  up within seconds without being restarted.
- One shared Postgres 18 serves every app, each with its own database and role.
- Nothing in the platform repo changes when Konku is deployed.

The network was called `shared` in this repo until 2026-08-17 and never existed
under that name on the box. It is `platform`, created once by the platform
stack:

```bash
cd ~/projects/platform && make net      # idempotent; `make up` also does it
```

### Roles and database

Two principals, and the difference is load-bearing (D-059). A table owner
bypasses its own RLS policies, so an app connecting as the owner has RLS in
name only.

`make provision` creates the **owner** and the database, and installs the
extensions — pgvector is untrusted and needs superuser, which is why it is done
here rather than by Konku's own migrations (D-025):

```bash
cd ~/projects/platform
make provision NAME=konku PASS="$(openssl rand -base64 24 | tr -d '/+=')" EXT=vector
```

`pg_trgm` is *trusted* in PG13+, so migration `00001` creates it itself as the
owner and it does not need listing in `EXT`. Adding it there anyway is harmless.

**`EXT=vector` is not optional, and `PLATFORM.md` leaves it out.** The contract
document writes this operation as `make provision NAME=myapp_prod PASS="…"`,
with no `EXT` argument at all. The argument is real — the platform Makefile
passes it through, and that Makefile's own usage line names Konku as the reason
it exists — so an operator who follows `PLATFORM.md` as written provisions Konku
**without pgvector**, and discovers it later and somewhere less obvious.

This page is the correct one and stays as it is. The gap is in the contract
document, which lives in a repo Konku does not write to, so it is handed back to
the platform's operator rather than fixed here. Do not "reconcile" this by
dropping `EXT=vector` to match the contract; the contract is the incomplete half.

The same two lines also teach different naming: `PLATFORM.md` models
`NAME=myapp_prod`, this page uses `NAME=konku`. Neither is wrong on its own, but
whichever you pick has to match `DATABASE_URL` exactly, and the two documents
model different conventions for one operation.

**Then create the app role by hand, and do it before the container ever
starts.** This is the one ordering trap in the whole deploy, and it is not
something `make provision` can do for you:

```bash
docker compose --env-file .env -f compose/postgres.yml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d konku -c \
  "DO \$\$ BEGIN
     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'konku_app') THEN
       CREATE ROLE konku_app LOGIN PASSWORD '<app password>';
     ELSE
       ALTER ROLE konku_app WITH LOGIN PASSWORD '<app password>';
     END IF;
   END \$\$;"
```

Why it cannot be skipped or reordered:

- `cmd/konku` opens the pool and **pings it before it migrates** — the ping is
  there so a bad `DATABASE_URL` fails at startup instead of on the first
  request.
- `konku_app` is created by migration `00006`, as `NOLOGIN` with no password,
  because a password in a migration is a secret in git.
- So on a fresh database the first boot tries to authenticate as a role that
  does not exist yet, dies, and `restart: unless-stopped` turns that into a
  loop. The log line is `store: connecting to database`, which reads like a
  network problem and is not one.

The `IF NOT EXISTS` guard in `00006` means creating the role early is safe:
the migration finds it and only applies its grants. This is the same thing CI
does before running the image, and the same thing `make db-app-role` does
locally.

**Check the app role cannot bypass RLS before going further.** This is the one
that silently invalidates everything else, and it is the bug that was found in
local dev:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'konku_app';
-- both flags must be f
```

### Environment

`.env.prod.example` is the annotated copy. On the box:

```bash
cd ~/projects/konku
cp .env.prod.example .env && chmod 600 .env && $EDITOR .env
```

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
#    Locally, against the dev database.
make release-verify REF=ghcr.io/katzelabs/konku@sha256:<digest>

# 2. Back up first. Every deploy runs migrations.
cd ~/projects/platform && make backup-now && bash scripts/ship-backups.sh

# 3. Point the compose file at that exact digest. Record it somewhere the
#    next deploy can read: rolling back means knowing what the previous one
#    was, and `docker inspect` after the fact is not a plan.
cd ~/projects/konku
$EDITOR .env                                    # set KONKU_IMAGE=...@sha256:<digest>

# 4. Pull and start, on the box. --env-file is not optional: without it
#    Compose reads .env for interpolation but the `:?` guards still fire on
#    anything the shell has not exported.
docker compose --env-file .env -f docker-compose.prod.yml pull
docker compose --env-file .env -f docker-compose.prod.yml up -d

# 5. Watch it come up. Migrations run at startup.
docker compose --env-file .env -f docker-compose.prod.yml logs -f app
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

# The edge actually generated a route for this host. Checking the app answers
# is not the same as checking the edge knows about it.
docker exec edge-caddy-1 wget -qO- http://127.0.0.1:2019/config/ \
  | grep -o "$KONKU_HOST"

# Metrics are reachable on the platform network.
docker run --rm --network platform alpine:3.21 \
  wget -qO- http://konku-app-1:9090/metrics | head -3

# And NOT published on the host. These two are the authoritative checks: they
# read the port table rather than asking the port a question. Cockpit also uses
# 9090 on this box (VPS Infra P1.1), so a listener here is not by itself a
# Konku leak — confirm which process owns it before concluding it is.
ss -ltnp | grep 9090 || echo "nothing on 9090 — correct"
docker port konku-app-1 || echo "no published ports — correct"

# A curl adds little to those two, and if you run one it must be http://.
# The metrics listener speaks plain HTTP (METRICS_ADDR: 0.0.0.0:9090), so an
# https:// request dies in the TLS handshake whether or not the port is
# published — it fails identically in the safe world and the leaked world,
# which is a false pass on the check you would most want to trust. Worse: if
# Cockpit is bound publicly, https:// can complete a handshake against
# *Cockpit* and return content, reporting a Konku leak that does not exist.
# https:// looks more correct than http:// in a security check. It is not.
# Do not change it back.
curl -s --max-time 5 http://$KONKU_HOST:9090/metrics   # must fail
```

A check that cannot distinguish the safe world from the broken one is not
evidence, however reliably it fails. That is PLATFORM.md's rule 6 — verify the
effect, not the exit code — and until this was corrected it was that rule being
broken inside our own runbook.

Then sign in from your phone. That is the check the others stand in for.

### HSTS: raise it deliberately

It ships at `max-age=300`. **Leave it there until you have watched a
certificate renew.** HSTS cannot be withdrawn inside its own window — if
renewal is broken and the policy is a year, the site is unreachable for a year
in every browser that saw it once. Once renewal has demonstrably worked:

```
caddy.header.Strict-Transport-Security: "max-age=31536000; includeSubDomains"
```

**That value needs quoting the current one does not, and the line above may not
be enough on its own.** `max-age=300` is a single token, so nothing about the
current label depends on how it is quoted. `max-age=31536000; includeSubDomains`
contains a space, and a caddy-docker-proxy label value with a space in it needs
inner quoting inside the YAML string. `docker-compose.prod.yml` carries that
warning in a comment beside the label — which is precisely the file you will not
have open at the moment you follow this section, which is why it is repeated
here.

So treat the raise as a change to verify, not a value to paste: re-run the
`curl -sI` from "Verify, in this order" afterwards. A label that fails to parse
does not announce itself. It simply stops shipping the header, and HSTS
disappearing is invisible from the browser side.

`includeSubDomains` only if **every** host under `katzeapps.com` can serve TLS.
The apex is shared across projects, so this commits them too.

---

## Backups

**Konku configures nothing.** The platform's `postgres-backup` sidecar runs
`pg_dumpall` nightly, which covers *every* database on the shared instance, so
a provisioned tenant is backed up from the moment it exists. `ship-backups.sh`
pushes the newest dump to Cloudflare R2, `check-backups.sh` verifies both and is
silent when healthy, and `r2-restore-test.sh` proves the off-box copy restores.
All of it lives in `Katzelabs/platform` and is already running for Tuan Tanah.

This replaces the restic plan in `04-ship.md` S3 and the per-project
`scripts/backup.sh` cron this page used to describe (D-088). Konku's
`scripts/backup.sh` is now dev-only.

What is worth checking rather than assuming, the first time:

- **Konku's database is actually in the dump.** `pg_dumpall` covers everything
  the *superuser* can see, and provisioning revokes `CONNECT` from `PUBLIC` —
  that does not affect the superuser, but "two healthy-looking 1.2 KB dumps
  taken before the tenant existed" is on PLATFORM.md's list of silent failures
  found on this box. Check the effect:

  ```bash
  cd ~/projects/platform
  gunzip -c "$(ls -t backups/pg_dumpall_*.sql.gz | head -1)" \
    | grep -c 'CREATE DATABASE konku'      # must be 1
  ```

- **Restoring Konku must not disturb the other tenants.** A `pg_dumpall` is one
  file containing every database, so replaying the whole thing is not a
  Konku-only restore. `restore.md` is the drill; the extraction is
  `pg_restore`-into-a-scratch-instance, not `psql < dump` against production.

- **Retention is a promise, not a preference.** `/privacy` tells users their
  data is gone from backups within 30 days of deleting their account. The
  platform keeps 14 days locally and 7 daily + 4 weekly (~28 days) in R2, so
  the promise holds — but it holds by four days, and it is enforced in a
  different repo from the one that makes the promise. Changing
  `BACKUP_RETENTION_DAYS`, or the `--min-age` values in `ship-backups.sh`,
  makes `/privacy` false without anything failing.

- **`/privacy` says the backups are encrypted.** R2 encrypts objects at rest,
  so that is defensible for the off-box copy; the nightly dumps sitting in
  `~/projects/platform/backups` on the VPS are plaintext gzip. Either narrow
  the wording or encrypt the local copy — do not leave it as it is.

---

## Alerts

Three, from `04-ship.md` S5. **Trigger each one deliberately** — an alert
nobody has seen fire is an alert you are guessing about.

| Alert | Condition | How to test it |
|---|---|---|
| Service down | `/readyz` failing 2 min | stop the app container |
| Shipped broken | 5xx above 0.1% for 5 min | `/api/__panic` is dev-only, so force a 500 another way |
| Backup did not complete | the platform watchdog | already wired: `check-backups.sh` at 04:00 → `#alerts` |

The third one is **done and not Konku's** — the platform's watchdog covers
every tenant's dump and speaks only when something is wrong. Do not build a
second one; verify this one sees Konku (above).

The second alert needs something scraping `/metrics`, which nothing does yet.
PLATFORM.md rules out Prometheus/Grafana on this box deliberately (~1 GB of RAM
to watch a handful of containers), so S5 needs a decision rather than the
sidecar this page used to assume: either the silent-cron-watchdog pattern the
platform already uses, or accept that `konku_http_5xx` is scraped by nothing and
the metrics bind (D-081) buys observability by `docker exec` only.

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
