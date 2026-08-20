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

That last bullet is about **repo content**, and the precision matters: deploying
Konku edits no file in `Katzelabs/platform`. It does reach into the platform's
**state on the box**, which is a different thing and a heavier one. Four steps on
this page do:

- `make net`, below — creates a docker network. Idempotent, and the lightest of
  the four.
- `make provision`, next section — creates a database, a role and extensions
  inside the **shared** Postgres cluster.
- the `konku_app` role block, next section — runs `psql` as the `postgres`
  superuser in that same shared cluster.
- `make backup-now` and `ship-backups.sh`, **Deploy** step 2 — dumps *every*
  database on the instance, other tenants included, and copies it off the box to
  remote storage, deleting old objects there as it goes.

Those four act on a cluster holding other tenants' live data, and the last one
also sends that data off the machine. They belong to whoever operates the
platform. If that is you, carry straight on. If it is not — if you hold
Konku-scoped access rather than the box — treat the four as hand-backs to the
operator and run the rest of this page yourself; nothing else here reaches
outside Konku.

The network was called `shared` in this repo until 2026-08-17 and never existed
under that name on the box. It is `platform`, created once by the platform
stack:

```bash
cd ~/projects/platform && make net      # idempotent; `make up` also does it
```

### Roles and database

**Two roles, and both must exist. They are not alternatives.**

| Role | Created by | Used as |
|---|---|---|
| `konku` | `make provision` below; owns the database | `MIGRATION_DATABASE_URL` |
| `konku_app` | the hand-written block below — **not** `make provision` | `DATABASE_URL` |

The difference is load-bearing (D-059). A table owner bypasses its own RLS
policies, so an app connecting as the owner has RLS in name only: everything
works, every test passes, and the tenancy guarantee is decorative.

`make provision NAME=konku` creates the database and the owner role, both named
`konku`, and stops there. Reading that script can leave the impression that
`konku` and `konku_app` are two names for the same principal, or a choice
between conventions. They are two roles with different privileges, created by
two different steps, and the deploy needs both.

`make provision` creates the **owner** and the database, and installs the
extensions — pgvector is untrusted and needs superuser, which is why it is done
here rather than by Konku's own migrations (D-025):

```bash
cd ~/projects/platform
make provision NAME=konku PASS='<owner password>' EXT=vector
```

**Choose that password before you run the command, and have it saved.** You need
it again, character for character, as `MIGRATION_DATABASE_URL` in the next
section — a variable this page marks **Not optional**. If you want a generated
one, generate it into your password manager first and paste it in; what must not
happen is generating it *inside* the command.

Until the first real run this page said
`PASS="$(openssl rand -base64 24 | tr -d '/+=')"`, and that is a hard stop half
way through the deploy. `provision-db.sh` does not echo the password back — its
closing block prints a literal `<password>` placeholder — so a value produced by
command substitution exists in Postgres and nowhere else the instant the command
returns. Nothing later on this page can recover it, and the deploy cannot be
completed without it. The command looks careful, which is why it survived being
written down and never run.

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
starts.** This is the ordering trap this page has always documented, and it is
not something `make provision` can do for you. **Run the whole block** — the
`GRANT` is not optional and not a follow-up; a role created without it
authenticates and is then refused at the database door (D-090):

```bash
cd ~/projects/platform      # both paths below resolve only from here
docker compose --env-file .env -f compose/postgres.yml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U postgres -d konku \
  -c "DO \$\$ BEGIN
     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'konku_app') THEN
       CREATE ROLE konku_app LOGIN PASSWORD '<app password>';
     ELSE
       ALTER ROLE konku_app WITH LOGIN PASSWORD '<app password>';
     END IF;
   END \$\$;" \
  -c "GRANT CONNECT ON DATABASE konku TO konku_app;"
```

**The `.env` in that command is the platform's, not Konku's.** Both of its
relative paths — `compose/postgres.yml` and `--env-file .env` — exist only under
`~/projects/platform`; Konku has no `compose/` directory at all. The `cd` is
written out rather than inherited from the `make provision` block above, because
this step sits under its own heading and reads as self-contained, and anyone who
opens a fresh terminal for it starts in the wrong directory.

The ambiguity is the real bug and the missing `cd` was only how it bit: the same
literal `--env-file .env` appears again under **Deploy**, where it means *Konku's*
`.env` because that block cd's to `~/projects/konku`. One string, two files, told
apart by nothing but the working directory. Keep every block's `cd` explicit
here for that reason, even where it looks redundant.

Why it cannot be skipped or reordered:

- `cmd/konku` opens the pool and **pings it before it migrates** — the ping is
  there so a bad `DATABASE_URL` fails at startup instead of on the first
  request.
- `konku_app` is created by migration `00006`, as `NOLOGIN` with no password,
  because a password in a migration is a secret in git.
- So on a fresh database the first boot tries to authenticate as a role that
  does not exist yet, dies, and `restart: unless-stopped` turns that into a
  loop.
- **`LOGIN` and a password are necessary but not sufficient.** `provision-db.sh`
  revokes `CONNECT` on the database from `PUBLIC` and grants it to the **owner
  alone**, so a hand-created second role starts with no route into the database
  at all. Nothing in `migrations/` supplies it either: `00006` grants `USAGE ON
  SCHEMA public` and table privileges, all of which live *inside* the database
  and are unreachable until `CONNECT` exists. That is why the `GRANT` sits in
  the block above and cannot be deferred to a migration (D-090).

The `IF NOT EXISTS` guard in `00006` means creating the role early is safe:
the migration finds it and only applies its grants. This is the same thing CI
does before running the image, and the same thing `make db-app-role` does
locally.

**`store: connecting to database` has two causes and one symptom.** Both end in
the same restart loop behind the same log line, and they take different fixes,
so read the rest of the line before acting on it:

| The line continues | What happened | Fix |
|---|---|---|
| `FATAL: password authentication failed`, or the role cannot log in | the `00006` `NOLOGIN` trap — the role does not exist yet, or exists without `LOGIN` | the `CREATE ROLE` above |
| `FATAL: permission denied for database "konku" (SQLSTATE 42501)` | authentication **succeeded**. The role is fine and has no `CONNECT` | the `GRANT` above |

Both read like a network problem and neither is one. A
`tls error: server refused TLS connection` line alongside either of them is
**benign noise, not the cause** — pgx defaults to `sslmode=prefer`, tries TLS,
and falls back to plaintext over the internal Docker network. It appears on
healthy boots too. Chasing it is this section's own warning happening one level
further down.

**Check both of these before going further.** The first is the one that silently
invalidates everything else, and was found in local dev. The second is what the
first boot of this deploy actually died on:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'konku_app';
-- both flags must be f

SELECT has_database_privilege('konku_app','konku','CONNECT');   -- must be t
```

They fail in opposite directions and both are cheap. Too much privilege makes
RLS decorative and nothing complains; too little and the container never boots.

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

**`ALLOW_SIGNUP` and `DEV` are not `.env` variables**, and writing them there
does nothing whatsoever. Both are literals in `docker-compose.prod.yml`
(`ALLOW_SIGNUP: "false"`, `DEV: "false"`), which is deliberate and explained in
`.env.prod.example` under "Not set here, and that is deliberate": they are
decisions rather than deployment details, and an `.env` on the box is the wrong
place to be able to open public signup or turn off Secure cookies by typo.

Both are already `false` in the compose file, so the first deploy needs nothing
done here. Where it bites is later: opening signup at `07` L10 is a **compose
edit, reviewed like any other change**, not an `.env` edit. Anyone who reaches
for `.env` gets a flag that has no effect and no error to explain why. That is
after S6.

---

## Deploy

**By digest, never by tag.** A tag can be moved after it was tested, and then
"what is running in production" is a question nobody can answer (D-061).

`<digest>` below is a placeholder, and this page deliberately does not contain
the value. **The digest to deploy is pinned in `04-ship.md` §S1** — take it from
there. It is not repeated here because a literal written in two files is a
literal that drifts, and one of the two then answers "what are we running" with
a stale value while looking authoritative, which is the D-061 failure wearing a
different hat.

While you are in that file: **`v0.1.0` must never be deployed.** It published a
correct image that its own release workflow could not verify, so nothing
attests to what is in it. `v0.1.1` is the first verified release.

```bash
# 1. ON YOUR LAPTOP, in your Konku checkout — not on the box. This is the only
#    step here that is not run on the VPS. It verifies the digest you intend to
#    run before it touches the box, by pulling the image and running it against
#    the *dev* database on host port 5433 with dev credentials. Nothing listens
#    on 5433 on the VPS, so run there it simply fails after ~30s.
#
#    NEVER run it bare. With REF omitted, `make release-verify` takes a
#    different branch entirely: it starts a local registry:2 and runs
#    `docker buildx build --platform linux/amd64,linux/arm64 --push .` — a build
#    on whatever machine you are sitting on, which is the thing this section
#    prohibits three paragraphs below. A forgotten `REF=` does not error; it
#    quietly does that instead.
make release-verify REF=ghcr.io/katzelabs/konku@sha256:<digest>

# 2. Back up first. Every deploy runs migrations.
#
#    The heaviest command on this page, and not Konku-scoped. `make backup-now`
#    writes a dump into ~/projects/platform/backups/ containing EVERY database
#    on the shared instance, Tuan Tanah included — pg_dumpall takes no
#    per-database scope. `ship-backups.sh` then rclone-copies that multi-tenant
#    dump off the box to Cloudflare R2 and enforces remote retention by
#    DELETING (--min-age 7d for daily, --min-age 28d for weekly). Other
#    tenants' data leaves the machine, and objects are removed irreversibly at
#    the far end. This is an operator step — see the boundary note under
#    "Before the first deploy" — and it has a known defect, under "Backups".
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

**Export the hostname first.** Four of the checks below interpolate
`$KONKU_HOST` and nothing has put it in your shell. Compose reads `.env` for its
own interpolation; it does not export anything to you, and `.env` is not a file
you have sourced.

```bash
export KONKU_HOST=konkuapp.katzeapps.com
```

Skipping this does not produce a missing-variable error. The first check becomes
`curl -s https:///readyz`, which fails with a URL error — and a failing `/readyz`
curl reads exactly like the outage these checks exist to detect. You would be
looking at the application.

```bash
# The process is alive, and the schema is the one this binary expects.
curl -s https://$KONKU_HOST/readyz          # {"status":"ok","schema_version":N}

# Docker agrees, which is what the restart policy acts on.
docker inspect --format '{{.State.Health.Status}}' konku-app-1   # healthy

# HSTS is actually emitted. VERIFIED 2026-08-20 against the running edge — the
# first time this label has ever been exercised against a live Caddy. At the
# CURRENT value, plain YAML double-quoting is sufficient and the label survives
# caddy-docker-proxy intact:
#
#     docker-compose.prod.yml:221 (six leading spaces, key unquoted)
#       caddy.header.Strict-Transport-Security: "max-age=300"
#     produces
#       strict-transport-security: max-age=300
#
# That result does NOT extend to the raised value. `max-age=31536000;
# includeSubDomains` contains a space, its quoting is still unexercised, and
# nothing here has tested it. See "HSTS: raise it deliberately" — and re-run
# this exact line immediately after any raise.
curl -sI https://$KONKU_HOST | grep -i strict-transport-security

# The rest of the security header set, in production. This is D-088's first
# deviation vindicated rather than merely argued: internal/api/security.go sets
# all of these, the edge adds only HSTS, and Caddy's `header` directive REPLACES
# rather than merges — so importing the shared `security_headers` snippet would
# have swapped this set for a weaker one and silently dropped the HSTS label
# along with it. Seeing the full set AND HSTS in one response is the proof.
curl -sI https://$KONKU_HOST | grep -iE 'content-security-policy|cross-origin-|x-frame-options|permissions-policy|referrer-policy|x-content-type-options'

# The edge actually generated a route for this host. Checking the app answers
# is not the same as checking the edge knows about it.
docker exec edge-caddy-1 wget -qO- http://127.0.0.1:2019/config/ \
  | grep -o "$KONKU_HOST"

# Metrics are reachable on the platform network.
docker run --rm --network platform alpine:3.21 \
  wget -qO- http://konku-app-1:9090/metrics | head -3

# And NOT published on the host. These two are the authoritative checks: they
# read the port table rather than asking the port a question.
#
# Expect 9090 to be listening. Cockpit holds it permanently on this box (VPS
# Infra P1.1), so "nothing on 9090" is NOT the passing result — seeing no
# output at all would itself be surprising. The two are told apart by shape:
# Cockpit is a single dual-stack socket and renders as a lone `*:9090`, while a
# Docker-published port shows a `0.0.0.0:9090` line AND a `[::]` one, or is
# attributed to docker-proxy. A lone `*:9090` is Cockpit. A `0.0.0.0:9090` line
# is Konku leaking.
#
# sudo is required, not decorative: without it `ss -ltnp` prints the socket but
# no process name, and identifying the owner is the whole point of the check.
sudo ss -ltnp | grep 9090
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

**That value needs quoting the current one does not, and the line above is not
known to be enough.** Be precise about what has and has not been established:

- **Verified 2026-08-20.** The *current* label,
  `caddy.header.Strict-Transport-Security: "max-age=300"`, emits
  `strict-transport-security: max-age=300` through the running edge. Plain YAML
  double quotes, nothing more.
- **Still unverified.** `max-age=31536000; includeSubDomains` contains a space,
  and a caddy-docker-proxy label value with a space in it needs *inner* quoting
  inside the YAML string — something the current value never exercises, because
  it is a single token that works under any quoting. `docker-compose.prod.yml`
  carries this warning in a comment beside the label, which is the file you will
  not have open at the moment you follow this section.

So the verified result above is **not** clearance to paste the raised value. It
establishes that the label mechanism works; it says nothing about the form the
spaced value needs.

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

  **Those two numbers are asserted here and confirmed nowhere.** `PLATFORM.md`'s
  Backups section states no retention figures at all, and
  `BACKUP_RETENTION_DAYS` lives in a third place again. So this paragraph is
  currently the only written statement of the margin a public privacy promise
  depends on, and it is a statement no document backs. Check both against the
  platform's actual configuration before quoting the four days to anyone;
  treating them as established because they are written down here is the shape
  of the failure, not a check against it.

- **A pre-deploy `make backup-now` lands in the nightly series, and neither
  document says so.** `backup-now` writes `pg_dumpall_manual_*`; `ship-backups.sh`
  globs `pg_dumpall_*.sql.gz`. The glob matches the manual file, so the ad-hoc
  dump taken in **Deploy** step 2 is copied into `daily/` beside the scheduled
  ones. The retention window above is counted over that series, so an
  unscheduled dump changes what "7 daily" actually spans — and it does it
  quietly, in the direction of a shorter real window, against a margin that is
  four days to begin with. This is a defect in the platform's scripts. The fix
  belongs there and nothing in this repo can make it; what this page can do is
  stop the margin being quoted as though deploys did not affect it.

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
