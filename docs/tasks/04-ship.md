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

`todo` · ~2 h · no deps

Follows `TECH.md` §11 and `docs/runbooks/deploy.md`. **The box is already
standing** — that is the change since this file was written (D-088). The
platform stack, the standalone edge, the shared Postgres 18, the nightly dumps
and the off-box shipping all exist and are serving Tuan Tanah. Konku is a tenant
of it, and `Katzelabs/platform/PLATFORM.md` is the contract.

Tracked as **VPS Infra P3.2** (the `shared` → `platform` rename, done) and
**P3.3** (this deploy) in ClickUp.

**The network already exists.** No infra stack to stand up:
```bash
cd ~/projects/platform && make net      # idempotent, and `make up` does it too
```

**Provision konku's database and the owner role:**
```bash
cd ~/projects/platform
make provision NAME=konku PASS="$(openssl rand -base64 24 | tr -d '/+=')" EXT=vector
```

**Then create `konku_app` by hand, before the first `up`.** This is the one
ordering trap and `make provision` cannot do it for you — the app pings its pool
before it migrates, and the role is created `NOLOGIN` by migration `00006`, so a
fresh database boots into a restart loop whose log line reads like a network
problem. Exact statement in `deploy.md`.

- The app connects as `konku_app`, **never** as `postgres` and — since `06` P1
  — never as the owner either. A table owner bypasses its own RLS policies,
  which is the difference between RLS and the appearance of it (D-059).
  `rolsuper` and `rolbypassrls` must both be `f`; check before going further
- `pgvector` is installed by provisioning, not by Konku's migrations: untrusted
  extensions need superuser. It goes in from day one even though nothing uses
  vectors until v1.3 — installing it later on a shared instance means
  coordinated downtime across every project on the box (D-025)
- Deploy `docker-compose.prod.yml`. `.env.prod.example` is the annotated list;
  copy it to `.env` on the box, `chmod 600`. The required ones are guarded with
  `:?` so a missing value refuses to start and names itself: `KONKU_IMAGE` (a
  **digest**), `KONKU_HOST`, `DATABASE_URL` (as **`konku_app`**),
  **`MIGRATION_DATABASE_URL`** (as the owner `konku`),
  `SESSION_SECRET` (`openssl rand -base64 32`), `PUBLIC_BASE_URL`. `SENTRY_DSN`,
  `SMTP_URL` and `MAIL_FROM` are unguarded because signup is closed until L10
- The host in both URLs is `postgres` — the platform service name over the
  `platform` network. Never `localhost`, and never the `127.0.0.1:5432`
  mapping, which exists for `psql` from the box's shell and is unreachable from
  a container
- **`MIGRATION_DATABASE_URL` is not optional here.** Unset, it falls back to
  `DATABASE_URL` — which is the role with no DDL rights — and migrations run
  at startup with a failure that is fatal by design. The container would not
  survive its first boot
- `PUBLIC_BASE_URL` must equal `https://$KONKU_HOST`. Every link in every
  message is built against it, and a wrong value is only discovered after the
  mail has been delivered (S4)
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

`todo` · ~30 min · needs S1

**Mostly already done, and not by us** (D-088). The platform runs a nightly
`pg_dumpall` covering every database on the instance, ships the newest dump to
Cloudflare R2 with 7 daily + 4 weekly retention, and has a watchdog at 04:00
that is silent when healthy and already alerting for Tuan Tanah. This item is
now *verifying it covers Konku*, not building it. The restic plan in D-064 is
superseded — a second pipeline beside it would double the thing that can rot
unnoticed.

- **Check Konku is actually in the dump**, rather than assuming a provisioned
  tenant is: `gunzip -c <newest> | grep -c 'CREATE DATABASE konku'`. Two
  healthy-looking dumps taken before a tenant existed is on PLATFORM.md's list
  of silent failures already found on this box
- **A `pg_dumpall` is one file containing every tenant**, which the per-database
  plan existed to avoid. Restoring Konku alone is `pg_restore` into a scratch
  instance, never `psql <` against production. Write that into `restore.md`
  before the drill, not during it
- **Retention is at most 30 days, and that is a promise rather than a
  preference.** The privacy policy (`07` L9) tells users their data is gone from
  backups within 30 days of deleting their account. 14 days locally and ~28 in
  R2 satisfies it — by four days, enforced in a repo that does not contain the
  promise. Note the coupling somewhere the next person editing
  `ship-backups.sh` will see it
- **`/privacy` also says the backups are encrypted.** True of R2, which encrypts
  at rest; not true of the plaintext gzip in `~/projects/platform/backups` on
  the VPS. Narrow the wording or encrypt the local copy — this is a published
  legal document making a claim about a thing we control
- The watchdog already covers failure (S5). Do not build a second one

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

**Also stand up the status page** (`07` L9). It must not live on the VPS: an
app that is down cannot serve the page saying it is down, and a status page on
the same box is decoration. A static page published from `Katzelabs/Konku` via
GitHub Pages is enough and costs nothing. Until it exists, email to the
affected accounts is the whole channel — which is acceptable at this size, and
is what `docs/runbooks/incident.md` says to use.

**Done when:** stopping Postgres on the box reaches your phone, you have seen
all three fire once, and the status page is reachable while the app is not.

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
