# Self-hosting Konku

Konku is free permanently — no billing, no tier, no feature gating, ever
(D-096). Self-hosting is the pressure valve behind that promise: if hosting
cost ever outgrows the operator, the answer is that you can run your own copy,
not that a paid tier appears. That makes this a **supported configuration**
rather than something you might be able to figure out, and this page is what
makes the claim true.

---

## Read this before anything else: what "supported" means here

**Supported** means: the image is published, the configuration is documented,
the traps that bit the operator's own deploy are written down below rather than
left for you to rediscover, and a bug report about self-hosting is a real bug
report.

**Not supported** means: no SLA, no guaranteed response time, no managed
upgrade path, and no promise that a given release has been tested on your
distribution, your Postgres, or your reverse proxy.

**And be careful with this page in particular.** Everything on it is grounded
in files in this repository — the compose file, the Makefile, the migrations,
`internal/config/config.go`, the CI workflows and `docs/runbooks/deploy.md`.
**But the standalone stack below has never been run end to end.** The
operator's own deployment is a *tenant* of a shared platform (D-088): shared
Postgres, shared Caddy edge, a network it does not own. None of that is yours,
so the compose file here is a different stack from the one in production, and
it is written rather than rehearsed.

That distinction matters because of what happened the one time this project's
deploy runbook was executed for real: it produced **28 corrections in a single
session**, including a first boot that failed outright (D-090). A procedure
written before it is run is a hypothesis. Sections below are marked
**Unverified** where they are exactly that.

Corrections belong in this file. If a step here is wrong, fix the step.

---

## What you are running

One Go binary. The React frontend is compiled into it with `go:embed`, so there
is no Node process in production (D-041) and no static-file server to configure.
It serves the API and the app from a single origin.

You need three things:

| Component | Why |
|---|---|
| The Konku container | the whole application |
| Postgres 18 | the only datastore. No Redis, no Mongo (D-023, D-027) |
| A TLS-terminating reverse proxy | **not optional** — see "HTTPS is mandatory" |

Migrations run at startup, so a deploy is "run the binary". There is no
separate migration step to remember and no way to forget it.

### Prerequisites

- A machine with Docker and the Compose plugin. 1 GB of RAM is probably enough
  — the app container is capped at 512 MB below and Postgres wants the rest,
  but that is arithmetic off the memory limit rather than a measured figure.
  Nothing in this repository states a minimum.
- A hostname with a DNS A/AAAA record pointing at the machine, **before** you
  start Caddy — it requests a certificate for that name and ACME fails if the
  record is not there yet.
- Ports 80 and 443 reachable from the internet, for ACME and for you.
- An SMTP account, if you want signup, password reset, or any account you did
  not create by hand. See "Mail" — it is required less often than you would
  expect, and its absence costs more than you would expect.

---

## Getting the image

Releases are published to GitHub Container Registry by CI, for `linux/amd64`
and `linux/arm64`:

```
ghcr.io/katzelabs/konku
```

**Deploy by digest, never by tag** (D-061). A tag can be moved after it was
tested, and then "what is running" is a question nobody can answer:

```bash
# Resolve a tag to its digest, once, on your machine.
docker buildx imagetools inspect ghcr.io/katzelabs/konku:v0.1.1 \
  --format '{{.Manifest.Digest}}'
```

Put the resulting `ghcr.io/katzelabs/konku@sha256:…` in your `.env`. Every
release also prints its digest in the workflow run summary.

**`v0.1.0` must never be deployed.** Its release workflow published an image it
then failed to verify, so nothing attests to what is in it. The tag was left
where it is rather than moved — a tag that moves is the exact thing deploying by
digest exists to prevent. **`v0.1.1` is the first verified release.**

**Unverified:** whether the GHCR package is public. If `docker pull` returns
`denied` or `manifest unknown`, the package is private and you will need to
build from source instead:

```bash
git clone https://github.com/Katzelabs/Konku && cd Konku
docker build -t konku:local .
```

That is the same Dockerfile CI uses. It cross-compiles for `$BUILDPLATFORM`, so
building on an arm64 laptop for an amd64 server works without QEMU. If you
build your own image, substitute `konku:local` for `KONKU_IMAGE` below and skip
the digest discipline — you built it, you know what is in it.

---

## The stack

**Unverified as a whole.** Every value in it is taken from a file in this repo
(`docker-compose.yml`, `docker-compose.prod.yml`, `internal/config/config.go`,
the Dockerfile), but this combination has not been booted. Expect to correct it,
and correct it here.

`docker-compose.yml` in this repo is the **dev** stack — one Postgres on port
5433, no app container, no TLS. `docker-compose.prod.yml` is the **platform
tenant** stack — no database, no proxy, an external `platform` network and
`caddy.*` labels for a shared edge that is not yours. Neither runs standalone.
This is the third one.

Put these three files in a directory of their own — say `~/konku` — not in a
clone of the repo. Nothing here needs the source.

### `docker-compose.yml`

```yaml
name: konku

services:
  db:
    # pg18. The app is developed, tested and deployed against 18; running a
    # different major means your data lives on an engine nothing tested.
    #
    # pgvector rather than stock postgres — see "About pgvector" below. It is
    # not required by anything in the schema today.
    image: pgvector/pgvector:pg18
    restart: unless-stopped
    environment:
      # This is the OWNER role. The app does not connect as it. See "Two roles".
      POSTGRES_USER: konku
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
      POSTGRES_DB: konku
    volumes:
      # PG18 CHANGED THIS PATH. Up to pg17 the image used
      # PGDATA=/var/lib/postgresql/data; from pg18 it is
      # /var/lib/postgresql/18/docker. Mounting the old path on pg18 makes the
      # volume an unused mount and the real data lives inside the container,
      # lost on the next recreate. Mount the PARENT and let the image own the
      # subdirectory.  (docker-library/postgres#1259)
      - konku-pg18:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U konku -d konku"]
      interval: 5s
      timeout: 3s
      retries: 10
    # No `ports:`. Postgres is reachable from the other containers on this
    # network and from nowhere else. Publishing 5432 puts your database on the
    # internet; use `docker compose exec db psql` when you need a shell.

  app:
    # A DIGEST ref, never a tag (D-061):
    #   KONKU_IMAGE=ghcr.io/katzelabs/konku@sha256:...
    # `:?` rather than a default, deliberately — a default would silently run
    # something other than the artifact you checked.
    image: ${KONKU_IMAGE:?set KONKU_IMAGE to a digest ref, e.g. ghcr.io/katzelabs/konku@sha256:...}
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      # TWO PRINCIPALS, and the difference is load-bearing (D-059).
      #
      # konku_app is the non-owner role that FORCE ROW LEVEL SECURITY actually
      # applies to — see "Two roles" below for why it cannot be the owner.
      #
      # konku_app MUST be able to log in BEFORE this container first starts.
      # It is created by migration 00006 as NOLOGIN with no password, and the
      # app pings the pool before it migrates. See "Setup, in order" — this is
      # the one step that cannot be reordered.
      # No `sslmode` parameter, matching .env.prod.example. pgx defaults to
      # `prefer`: it attempts TLS, and falls back to plaintext when the server
      # refuses. Over a private Docker network that is the right trade, and it
      # is why `tls error: server refused TLS connection` appears in the log on
      # a perfectly healthy boot — see Troubleshooting.
      DATABASE_URL: postgres://konku_app:${APP_DB_PASSWORD:?set APP_DB_PASSWORD}@db:5432/konku
      # The owner, used once at startup for migrations and then closed.
      # Unset falls back to DATABASE_URL, which has no DDL rights at all, and
      # migrations are fatal by design — so the container will not survive its
      # first boot on a fresh database.
      MIGRATION_DATABASE_URL: postgres://konku:${POSTGRES_PASSWORD:?}@db:5432/konku

      SESSION_SECRET: ${SESSION_SECRET:?set SESSION_SECRET, openssl rand -base64 32}

      # Must equal https://$KONKU_HOST. Every verification and reset link is
      # built against it, and a wrong value is only discovered after the mail
      # has already been delivered.
      PUBLIC_BASE_URL: ${PUBLIC_BASE_URL:?set PUBLIC_BASE_URL to https://your.host}

      # Literals rather than variables, on purpose. These are decisions, not
      # deployment details, and a .env is the wrong place to be able to open
      # public signup or turn off Secure cookies by typo. Changing either is an
      # edit to this file, which is a thing you notice doing.
      ALLOW_SIGNUP: "false"
      DEV: "false"

      # Stated rather than left to the binary's default, because three places
      # have to agree: this, the healthcheck URL below, and the proxy upstream
      # in the Caddyfile. Nothing checks that they agree; a mismatch is a 502
      # with "connection refused" buried in the proxy's log.
      PORT: "8080"

      # Mail. Empty is legal and means signup stays closed — read "Mail" before
      # deciding that is what you want.
      SMTP_URL: ${SMTP_URL:-}
      MAIL_FROM: ${MAIL_FROM:-}

      # Error tracking. Empty disables it; sentry-go treats an empty DSN as a
      # no-op client, so nothing has to check whether it is on.
      SENTRY_DSN: ${SENTRY_DSN:-}
      SENTRY_ENVIRONMENT: production

      # /metrics on its own listener. Empty disables it entirely, which is the
      # right default for a single-box install with nothing scraping.
      #
      # If you DO scrape it, set 0.0.0.0:9090 and still publish no port: a
      # container has its own network namespace, so 127.0.0.1 inside it is the
      # container's loopback and nothing outside can reach it. Not publishing
      # is what keeps it private, not the bind address (D-081).
      METRICS_ADDR: ""

    healthcheck:
      # /healthz and NOT /readyz. The correct response to each is the opposite
      # of the other (D-062): readiness goes red on a database blip, and
      # restarting the container is exactly the wrong answer to that — it
      # throws away the warm pool to fix something that was never the
      # container's fault. Liveness is the one that means "restart me".
      #
      # busybox wget, because the image is alpine and has it. No curl.
      test: ["CMD", "wget", "-q", "-T", "3", "--spider", "http://127.0.0.1:8080/healthz"]
      interval: 30s
      timeout: 5s
      # Generous: migrations run at startup and a cold start on a new migration
      # is legitimately slow. Too short turns a normal deploy into a restart
      # loop.
      start_period: 30s
      retries: 3

    # The argon2id hashing ceiling is 4 x 64 MiB (internal/auth/password.go).
    mem_limit: 512m

    # The binary is CGO_ENABLED=0 static, runs as uid 10001, and writes nothing
    # to disk — the export is built in memory and streamed, and logs go to
    # stdout. So none of this costs anything.
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    tmpfs:
      - /tmp:size=64m

    # No `ports:`. The proxy is the only thing that publishes one, and that is
    # a security control, not tidiness — see "Never publish the app's port".

  # NOTHING BELOW COMES FROM THIS REPOSITORY. Konku's production edge is a
  # shared caddy-docker-proxy owned by another repo, configured by labels on
  # the app container rather than by a Caddyfile. A standalone Caddy container
  # is a different thing, and the image name, the config path and the two
  # volumes are Caddy's documented defaults rather than anything Konku states.
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      - app
    ports:
      - "80:80"
      - "443:443"
    environment:
      KONKU_HOST: ${KONKU_HOST:?set KONKU_HOST, e.g. konku.example.com}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      # Certificates live here. Losing this volume means re-issuing on the next
      # start, which is fine occasionally and will hit the certificate
      # authority's rate limits if it happens repeatedly.
      - konku-caddy-data:/data
      - konku-caddy-config:/config

volumes:
  konku-pg18:
  konku-caddy-data:
  konku-caddy-config:
```

### `Caddyfile`

```caddyfile
{$KONKU_HOST} {
	# HSTS lives HERE and nowhere else. internal/api/security.go deliberately
	# omits it: only the component that terminates TLS knows whether the
	# connection was really secure, and the app would have to guess from a
	# forwarded header.
	#
	# max-age starts short on purpose. HSTS cannot be withdrawn inside its own
	# window — if renewal turns out to be broken, a year-long policy makes the
	# site unreachable for a year in every browser that saw it once. Raise it
	# once you have watched a certificate actually renew — a first issuance is
	# not a renewal, and how long that takes depends on your CA's certificate
	# lifetime and your proxy's renewal window. Watch for it; do not calculate
	# it from this comment.
	header Strict-Transport-Security "max-age=300"

	reverse_proxy app:8080
}
```

**Do not add a `header` block for the other security headers.** The application
already sets Content-Security-Policy, X-Content-Type-Options, Referrer-Policy,
X-Frame-Options, Permissions-Policy, COOP and CORP itself
(`internal/api/security.go`). Caddy's `header` directive **sets rather than
merges**, and two `header` directives in one site block do not combine — Caddy
keeps the first and silently drops the second. So adding a second one gives you
one set of headers, no warning, and quite possibly no HSTS. This is D-088's
first deviation and it was verified against a running edge on 2026-08-20.

**Verified in this repo, not in your stack:** that the app emits its own header
set, and that a single `header` line for HSTS at the proxy produces
`strict-transport-security: max-age=300`. The `reverse_proxy app:8080` line
here is the standalone equivalent of a label-generated upstream and is
**unverified**.

### `.env`

`chmod 600` it. Compose reads it for interpolation; the `:?` guards in the
compose file refuse to start on anything missing and name the variable.

```bash
KONKU_IMAGE=ghcr.io/katzelabs/konku@sha256:0000000000000000000000000000000000000000000000000000000000000000
KONKU_HOST=konku.example.com
PUBLIC_BASE_URL=https://konku.example.com

# openssl rand -base64 32   (two DIFFERENT values)
POSTGRES_PASSWORD=
APP_DB_PASSWORD=

# openssl rand -base64 32
SESSION_SECRET=

# Optional. See "Mail".
SMTP_URL=
MAIL_FROM=

# Optional. Empty means nobody sees production errors.
SENTRY_DSN=
```

---

## Every environment variable

Read from `internal/config/config.go`. The compose file above sets the ones
that matter; this is the complete surface, including what you can override.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | **yes** | — | the `konku_app` role. Never the owner, never a superuser |
| `MIGRATION_DATABASE_URL` | **in practice** | falls back to `DATABASE_URL` | the owner. The fallback cannot run DDL, so on a fresh database the fallback is a container that never boots |
| `SESSION_SECRET` | **yes** unless `DEV=true` | — | see the warning below — it does *not* do what its name says |
| `PORT` | no | `8080` | must match your proxy upstream and the healthcheck |
| `DEV` | no | `false` | **never true in production.** It turns off `Secure` on the session cookie |
| `ALLOW_SIGNUP` | no | `false` | `true` additionally requires `SMTP_URL` and `MAIL_FROM`, or the process refuses to start |
| `SMTP_URL` | only with signup | — | `smtps://user:key@host:465` or `smtp://host:1025` |
| `MAIL_FROM` | only with signup | — | e.g. `Konku <konku@example.com>` |
| `PUBLIC_BASE_URL` | effectively | `http://localhost:5173` | the origin every verification and reset link is built against. The default is a dev value and will send your users to their own laptop |
| `SESSION_TTL_DAYS` | no | `30` | how long a login lasts |
| `SENTRY_DSN` | no | empty | empty disables error tracking silently |
| `SENTRY_ENVIRONMENT` | no | `development` | set it to `production` |
| `SENTRY_RELEASE` | no | the build stamp | **leave it unset.** The binary stamps its own version; setting this overrides it with something you have to keep in sync by hand |
| `METRICS_ADDR` | no | `127.0.0.1:9090` | empty **string** disables it. Inside a container the default is unreachable by design |
| `MAX_NOTES` | no | `5000` | per account |
| `MAX_CARDS` | no | `20000` | per account |
| `MAX_WRITES_PER_MINUTE` | no | `300` | per account |
| `MAX_LOGIN_ATTEMPTS` | no | `10` | per **IP**, per five minutes — shared by everyone behind one address |

Anything unset, unparseable or non-positive in the four numeric settings falls
back to its default, so a typo cannot refuse every write.

**`SESSION_SECRET` does not sign anything.** Sessions are opaque 256-bit random
identifiers stored server-side (D-039), so there is no signing key and rotating
this logs nobody out. It is required outside dev, loaded, validated — and read
by no code path. If you are responding to a stolen session token, **delete rows**:

```bash
docker compose exec -T db psql -U konku -d konku -c "DELETE FROM auth_sessions;"
```

That is rehearsed and documented in `docs/runbooks/secrets.md`. Rotating
`SESSION_SECRET` instead gives you a healthy process and every stolen cookie
still working.

---

## Two roles, and why you cannot collapse them

| Role | Created by | Used as |
|---|---|---|
| `konku` | the Postgres image, from `POSTGRES_USER` | `MIGRATION_DATABASE_URL` — owns the schema, runs DDL |
| `konku_app` | **you, by hand, before the first `up`** | `DATABASE_URL` — the running application |

Every table that holds user rows has `ENABLE ROW LEVEL SECURITY` *and* `FORCE
ROW LEVEL SECURITY` with a `user_id = current_setting('app.user_id')` policy
(migration `00006`). Three things separate that from the appearance of it:

1. **`FORCE`**, because a table owner bypasses its own policies by default.
2. **A non-owner role**, because `FORCE` does not apply to `SUPERUSER` or
   `BYPASSRLS` roles — and `konku`, as the image's bootstrap user, is both.
3. **Explicit grants and no `ALTER DEFAULT PRIVILEGES`**, so a new table is
   inaccessible until someone writes its policy.

Point 2 is the one that bites a self-hoster. Set `DATABASE_URL` to
`postgres://konku:…` and everything works, every screen loads, and every
row-level security policy in the database is inert. Nothing complains. The
check is one query and you should run it (below).

---

## Setup, in order

**The order is the whole point of this section.** Step 2 cannot move.

### 1. Start Postgres alone

```bash
cd ~/konku
docker compose up -d db
docker compose ps db          # wait for (healthy)
```

### 2. Create `konku_app` — before the app container ever starts

This is the trap. Here is what happens if you skip it:

- `cmd/konku` opens the pool and **pings it before it migrates**, deliberately,
  so a bad `DATABASE_URL` fails at startup instead of on the first request.
- `konku_app` is created by migration `00006`, as **`NOLOGIN` with no
  password**, because a password in a migration is a secret in git.
- So on a fresh database the first boot authenticates as a role that does not
  exist yet, dies, and `restart: unless-stopped` turns that into a loop —
  whose log line, `store: connecting to database`, reads like a network
  problem.

Migration `00006` guards the role with `IF NOT EXISTS`, which is what makes
creating it early safe: the migration finds it and applies its grants. This is
the same thing CI does before running the published image, and the same thing
`make db-app-role` does for local development.

Run the whole block. Substitute your `APP_DB_PASSWORD`:

```bash
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U konku -d konku \
  -c "DO \$\$ BEGIN
     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'konku_app') THEN
       CREATE ROLE konku_app LOGIN PASSWORD '<APP_DB_PASSWORD>';
     ELSE
       ALTER ROLE konku_app WITH LOGIN PASSWORD '<APP_DB_PASSWORD>';
     END IF;
   END \$\$;" \
  -c "GRANT CONNECT ON DATABASE konku TO konku_app;"
```

**About that `GRANT`.** On the operator's platform it is mandatory: the
provisioner revokes `CONNECT` from `PUBLIC` and grants it to the owner alone,
so a hand-created second role starts with no route into the database and the
first production boot restart-looped eleven times on `FATAL: permission denied
for database "konku" (SQLSTATE 42501)` — authentication succeeding and the
door still shut (D-090). A **stock** Postgres image does not revoke `CONNECT`
from `PUBLIC`, so on the stack above the grant is very likely redundant. It is
idempotent, it costs nothing, and if you ever harden the database the way a
multi-tenant instance should be hardened, it is the line you will wish you had
kept. Keep it.

Then check both directions before going further. They fail opposite ways and
both are cheap:

```bash
# Too much privilege makes RLS decorative and nothing complains.
docker compose exec -T db psql -tA -U konku -d konku -c \
  "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='konku_app';"
# both flags must be f

# Too little and the container never boots.
docker compose exec -T db psql -tA -U konku -d konku -c \
  "SELECT has_database_privilege('konku_app','konku','CONNECT');"
# must be t
```

### 3. Start the app and the proxy

```bash
docker compose up -d
docker compose logs -f app
```

Migrations run at startup; expect a run of `goose: OK 000NN_….sql` lines. The
process is fatal on migration failure on purpose — serving against a
half-migrated schema produces errors that look like application bugs.

### 4. Verify

```bash
export KONKU_HOST=konku.example.com   # nothing has put this in your shell

curl -s https://$KONKU_HOST/readyz      # {"status":"ok","schema_version":N}
curl -sI https://$KONKU_HOST | grep -i strict-transport-security
curl -sI https://$KONKU_HOST | grep -iE 'content-security-policy|x-frame-options|referrer-policy'

# Assert on the BODY, never the status code: the SPA serves index.html for any
# unmatched path, so /metrics, /admin and /.env all answer 200. Count metric
# output instead. (/api/* is excluded from the catch-all and is the one
# namespace whose 404s you can trust.)
curl -s https://$KONKU_HOST/metrics | grep -cE '^# (HELP|TYPE)'   # must be 0
```

Then sign in from your phone, and write one note. That is the check the others
stand in for — and creating something is what exercises the write path a
misconfigured proxy breaks.

---

## The first account

`ALLOW_SIGNUP` is `false` in the compose file above, so create your account
from the command line:

```bash
docker compose exec app konku seed-user -email you@example.com
```

It prompts for the password twice and never takes it as a flag — flags land in
shell history and in `ps`. Minimum 12 characters. For automation:

```bash
printf '%s' "$PASSWORD" | docker compose exec -T app konku seed-user \
  -email you@example.com -password-stdin
```

**An account created this way is already verified.** `CreateUser` sets
`email_verified_at`, so it can use every data route immediately. That is what
makes a mail-less install viable at all — read the next section before
concluding it is a good idea.

**Unverified:** the exact `docker compose exec` invocation. The binary is at
`/usr/local/bin/konku` and the image's `ENTRYPOINT` is `konku`, so
`docker compose run --rm app seed-user -email …` should work equivalently if
the app container is not running.

---

## Mail

Konku sends transactional mail over stdlib `net/smtp` (D-065, D-068). There is
no mail provider SDK and no queue.

**When you need it:**

| You want | SMTP required? |
|---|---|
| A single account you create with `seed-user` | no |
| Public signup (`ALLOW_SIGNUP=true`) | **yes** — the process refuses to start without it |
| Password reset for anyone, including you | **yes** |
| Email change, verification resend | **yes** |

`config.Load` refuses `ALLOW_SIGNUP=true` with an empty `SMTP_URL` or
`MAIL_FROM`, and the reason is worth stating: verification gates every data
route, so an account created without a working transport is unverifiable — and
because the reset link is the only recovery path there is, it is also
unrecoverable. Signup itself returns 204. The damage is a mailbox that stays
empty and a user who thinks the product is broken.

**The cost of running without mail is real and it is not obvious.** There is no
`konku set-password` subcommand — `seed-user` is the only account-creating CLI
and it refuses an address that already exists. So on a mail-less install, an
account whose password is lost has **no recovery path that this repository
provides**. Deleting the user row cascades away every note, card and review log
they own. If you run without SMTP, put the password in a password manager and
treat that as the backup it is.

### Configuring it

```bash
SMTP_URL=smtps://user:password@smtp.example.com:465
MAIL_FROM=Konku <konku@example.com>
```

**`smtps://`, not `smtp://`, on 465.** That is implicit TLS. `net/smtp` refuses
to send credentials over an unencrypted connection, which is the behaviour you
want — but it means a `smtp://` URL to a provider expecting TLS fails at
authentication rather than falling back.

Deliverability is a separate problem from configuration, and it is the half
that cannot be tested from a laptop. **Set SPF, DKIM and DMARC on your sending
domain before you open signup.** A verification mail in a spam folder is an
outage that looks exactly like a signup bug, and you will debug the wrong thing
for an afternoon. Send transactional mail only from that domain; a newsletter
from the same domain degrades the reputation your verification mail depends on.

### Testing it without sending anything

Mailpit accepts every message and delivers none. Add it temporarily — the
image, its version and the two environment variables are lifted from this
repo's `docker-compose.yml`; the loopback port binding is not, and is there
because that inbox has no authentication in front of it:

```yaml
  mailpit:
    image: axllent/mailpit:v1.27
    ports:
      - "127.0.0.1:8025:8025"   # the inbox, loopback only
    environment:
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1
```

with `SMTP_URL=smtp://mailpit:1025` on the app, and read the messages at
`http://127.0.0.1:8025` over an SSH tunnel. Sign up, verify, reset — the whole
flow works against it. Remove it before you go live.

### Opening signup

Once mail works: change `ALLOW_SIGNUP: "false"` to `"true"` in the compose file
and `docker compose up -d app`. It is a literal in the compose file rather than
an `.env` variable on purpose — writing `ALLOW_SIGNUP=true` in `.env` does
nothing at all and produces no error to explain why.

Consider what you are opening. Konku has no admin surface and no way for an
operator to suspend an account; the per-account quotas (`MAX_NOTES`,
`MAX_CARDS`, `MAX_WRITES_PER_MINUTE`) are what stand between an open signup
form and an unbounded write path. They are configurable for exactly that
reason.

---

## HTTPS is mandatory, and here is the failure if you skip it

The session cookie is named `__Host-konku_session` when `DEV=false`. The
`__Host-` prefix is enforced by the **browser**, which refuses to store the
cookie unless it is `Secure`, `Path=/` and carries no `Domain`. `Secure` is set
from `!cfg.Dev`.

So on a plain-HTTP install with `DEV=false`, login returns 200, sets a cookie
the browser silently declines to store, and the next request is signed out.
Nothing logs an error. It does not look like a security feature; it looks like
login is broken.

The answer is TLS, not `DEV=true`. `DEV=true` in production turns off `Secure`
on your session cookie for everyone.

### Never publish the app's port

`internal/api/server.go` installs chi's `middleware.RealIP` unconditionally,
which rewrites `RemoteAddr` from `X-Forwarded-For` / `X-Real-IP`. That is
correct behind a proxy that overwrites those headers, and it is the comment on
the line: *"trustworthy because Caddy sits in front"*.

Expose port 8080 directly and it stops being true. Every IP-keyed limit in the
app — the login limiter (`MAX_LOGIN_ATTEMPTS`, per IP per five minutes) and the
client-error endpoint's 30/hour — keys on a header the client controls, and a
spoofed `X-Forwarded-For` per request defeats all of them. The compose file
above publishes no port on the app for that reason, not for tidiness.

### If you use nginx instead of Caddy

**Whatever proxy you use, it must pass the browser's `Host` header through
unchanged.** A proxy that rewrites `Host` to the upstream's name breaks every
write.

The grounded half: `enforceOrigin` is the CSRF control (D-060) and it works by
comparing the `Origin` header's host against `r.Host` — the host the request
was addressed to. There is no synchroniser token. So if the browser sends
`Origin: https://konku.example.com` while the app sees `Host: app:8080`, every
write is a 403 reading *"Permintaan ditolak karena berasal dari situs lain."*
Reads work fine, which makes it look like a permissions bug rather than a proxy
bug. This is the same class of failure as the documented Vite gotcha —
`changeOrigin: true` breaks development for exactly this reason.

**The proxy-specific half is general knowledge, not from this repository.**
nginx is documented as defaulting to `proxy_set_header Host $proxy_host;`,
which is the rewrite described above, so `proxy_set_header Host $host;` is the
setting to add. Caddy's `reverse_proxy` and Traefik are both documented as
preserving `Host`. **None of that is verified here** — Caddy's behaviour is
attested only through the production edge, which is a different Caddy
configuration, and nginx and Traefik have never been put in front of this app
by anyone who wrote this page.

Do not take any of it on faith. Whatever proxy you put in front, confirm a
*write* succeeds before believing the install works — signing in and creating
one note exercises exactly this path.

---

## About pgvector

`docs/TECH.md` names the database as `pgvector/pgvector:pg18`, and the
platform's provisioning step installs the extension. **Nothing in the schema
uses it today.** No migration issues `CREATE EXTENSION vector` and no column in
`migrations/` or query in `internal/store/queries/` uses a `vector` type — the
only `tsvector` hits are Postgres's own full-text type in `00001`. Verified by
reading the migrations, not inferred.

What the schema *does* require is `pg_trgm`, and migration `00001` creates it
itself: `pg_trgm` is a **trusted** extension in PG13+, so the database owner can
install it without superuser.

So `postgres:18` would work today. Use the pgvector image anyway — it is the
same Postgres with an extra extension available, it costs nothing, and it means
a future release that does use embeddings is a pull rather than a database
migration. If you already run a stock Postgres 18 and would rather not switch,
you can; just know that a future release may ask you to.

---

## Backups, and a restore you have actually tested

**Konku ships no backup mechanism for your install.** The operator's deployment
uses the platform's `pg_dumpall` pipeline, which is a different repository and
not yours. `scripts/backup.sh` in this repo is dev-only. This is on you.

A dump that has never been restored is a hope, not a backup.

### Dump

```bash
mkdir -p ~/backups/konku
docker compose exec -T db pg_dump -Fc -U konku -d konku \
  > ~/backups/konku/konku-$(date +%Y%m%d-%H%M%S).dump
```

Run `pg_dump` **inside the container** so its version always matches the
server. A Postgres upgrade on the host is otherwise enough to turn every backup
into a version-mismatch error, discovered at restore time.

Check it is a readable archive before you trust it — this is what the dev
`make db-dump` does at write time and refuses to keep a file that fails:

```bash
docker compose exec -T db pg_restore -l /dev/stdin < <newest.dump> > /dev/null
```

Put it on a cron, and **get it off the machine**. A backup on the same disk as
the database protects you from `docker compose down -v` and a bad migration —
which are the likely accidents — and from nothing else.

`pg_dump -Fc` carries RLS policies and grants, so a restore does not silently
lose the tenancy layer. Verify that rather than hoping for it, below.

### Restore drill — run it once, before you need it

Into a **scratch database** first, always. The steps mirror
`docs/runbooks/restore.md`, which has been rehearsed twice.

```bash
docker compose exec -T db dropdb -U konku --if-exists konku_restore
docker compose exec -T db createdb -U konku konku_restore
docker compose exec -T db pg_restore -U konku -d konku_restore --no-owner < <dump>
```

Then, in this order — each step rules out a different failure:

```bash
# 1. The rows are there. ANALYZE first; n_live_tup is an estimate and reads
#    low right after a bulk load.
docker compose exec -T db psql -U konku -d konku_restore -c "ANALYZE;" -c \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"

# 2. RLS survived the dump. Expect one policy per RLS table — 19 in the
#    operator's production database. Do not assert a fixed number; a stale
#    literal makes a correct restore read as failed.
docker compose exec -T db psql -tA -U konku -d konku_restore -c \
  "SELECT count(*) FROM pg_policy;"

# 3. The application role can still read. Expect t.
docker compose exec -T db psql -tA -U konku -d konku_restore -c \
  "SELECT has_table_privilege('konku_app','notes','SELECT');"
```

Steps 2 and 3 matter because a restored database the app cannot connect to
looks exactly like a successful restore until you try to use it.

Promoting the scratch copy means pointing `DATABASE_URL` and
`MIGRATION_DATABASE_URL` at it, or dropping and recreating `konku` from the
same dump. Do the second only with the app stopped.

### Retention is a promise, not a preference

`/privacy` tells users their data is **gone from backups within 30 days** of
deleting their account. That is a deletion promise, so retention *below* 30 days
satisfies it and retention *above* 30 days breaks it. The instinct that more
retention is safer is correct almost everywhere else and is exactly backwards
on this line. If you host other people, keep your longest-lived copy under 30
days — or edit the policy text to match what you actually do.

**Dumps are not encrypted.** `pg_dump -Fc` is compressed, not encrypted, and
nothing in this repo encrypts it for you (D-092 narrowed the privacy policy to
say so rather than widening the pipeline). If you copy dumps to object storage,
whatever at-rest encryption the provider offers is the provider's doing, not
yours. Encrypt them yourself if you need that; the argument against is a key
that must outlive the oldest backup and must not be lost.

---

## Upgrades

A deploy is: back up, change the digest, `up -d`, watch the log.

```bash
# 1. Back up first. Every deploy runs migrations.
docker compose exec -T db pg_dump -Fc -U konku -d konku > ~/backups/konku/pre-upgrade.dump

# 2. Resolve the new tag to a digest and put it in .env.
docker buildx imagetools inspect ghcr.io/katzelabs/konku:vX.Y.Z --format '{{.Manifest.Digest}}'
$EDITOR .env                      # KONKU_IMAGE=ghcr.io/katzelabs/konku@sha256:...

# 3. Pull and start.
docker compose pull app
docker compose up -d app

# 4. Watch it come up. Migrations run at startup.
docker compose logs -f app
curl -s https://$KONKU_HOST/readyz
```

**Record the digest you were on before.** Rolling back means knowing what the
previous one was, and `docker inspect` after the fact is not a plan.

### Rolling back

A rollback is a deploy with an older digest. There is no separate path, and
there should not be — a rollback route exercised only in an emergency is a
route nobody knows works.

**But migrations are forward-only.** Deploying an older image against a newer
schema does not roll the schema back. The old binary starts, sees a schema it
was not built for, and takes itself out of rotation:

```
readyz: 503 {"reason":"schema_mismatch","status":"unready"}
log: "readiness: schema moved underneath this process" expected=6 actual=7
```

That is the detection working. What to do about it depends on the migration and
there is no safe generic answer:

- **Additive** (a new table, a new nullable column) — the old binary does not
  know about it and does not care; only the readiness check objects. Roll
  *forward* with a fixed release, or accept the mismatch knowingly.
- **Destructive** (a dropped or renamed column, rewritten data) — the schema has
  to come back first. That means restoring the dump you took in step 1 and
  *then* deploying the old digest.

Which is why the order is back up, deploy, verify — and not deploy, verify,
back up.

Read the release notes before upgrading. This project ships breaking schema
changes as ordinary migrations.

---

## Things that will surprise you

**A daily purge runs inside the process.** Notes and cards deleted more than 30
days ago are removed for good, by a goroutine in the server rather than a cron
on your box (D-069) — a card that was ever reviewed or drawn into a practice
run is exempt and kept indefinitely. Nothing to install, and no way to turn it
off.

**The pgx pool is capped at 10 connections** (D-028), sized for a shared
Postgres. On a dedicated box that is conservative, and it is not configurable by
environment variable.

**Configuration is read once at startup**, so nothing is safe to change without
a restart. Point your restart policy at `/healthz` and your alerting at
`/readyz` — the compose healthcheck above explains why they must not be swapped.

**Users can export and delete their own accounts.** `GET /api/export` builds the
whole archive — notes and cards as markdown with YAML frontmatter, everything
else as JSON, credentials never. `DELETE /api/account` removes the account and
everything it owns in one cascading statement, not soft, no tombstone. You do
not have to build either.

**User-facing copy is Indonesian** (English is landing per D-094 — check the
release you are running). The 403 a misconfigured proxy produces will be in
Indonesian. Docs, logs and code are English.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Restart loop, `store: connecting to database` + `FATAL: password authentication failed` | `konku_app` does not exist or has no `LOGIN` — the `00006` ordering trap | the `CREATE ROLE` block in Setup step 2 |
| Restart loop, `store: connecting to database` + `permission denied for database … 42501` | authentication **succeeded**; the role has no `CONNECT` | the `GRANT CONNECT` in the same block |
| `tls error: server refused TLS connection` in the log | benign — pgx tries TLS and falls back, on healthy boots too (see the `DATABASE_URL` comment) | ignore it. Chasing it costs an afternoon |
| Container exits immediately naming a variable | a `:?` guard in the compose file | set the variable it names |
| Migrations never run, container dies on first boot | `MIGRATION_DATABASE_URL` unset — it falls back to `DATABASE_URL`, which has no DDL rights | set it to the owner |
| Login returns 200, next request is signed out | plain HTTP with `DEV=false`; the browser is refusing a `__Host-` cookie that is not `Secure` | terminate TLS. Not `DEV=true` |
| Every write is 403, reads are fine | the proxy is rewriting `Host`, so `enforceOrigin` sees a cross-site write | `proxy_set_header Host $host;` |
| 502 from the proxy, "connection refused" | `PORT`, the proxy upstream and the healthcheck disagree | make all three 8080 |
| `/readyz` 503 `schema_mismatch` | an older binary against a newer schema | see "Rolling back" |
| Verification mail never arrives | deliverability, not configuration | SPF, DKIM, DMARC. Check the provider's log before the app's |
| Tenancy tests would pass but RLS is inert | `DATABASE_URL` points at a superuser or `BYPASSRLS` role | the two `pg_roles` checks in Setup step 2 |
| `/metrics` returns 200 from the public host | it is not leaking — that is `index.html` from the SPA catch-all | assert on the body, never the status |

---

## What has *not* been verified

Stated plainly, because a guide that claims verified steps it never ran is
worse than one that admits the gap:

- **The compose file, the Caddyfile and the whole standalone stack.** Written
  from the repository's own files and never booted. Every individual value has a
  source; the combination does not.
- **`docker compose exec app konku seed-user`.** The path and entrypoint are
  right; the invocation is inferred.
- **Whether `ghcr.io/katzelabs/konku` is publicly pullable.**
- **HSTS at the raised value.** `"max-age=300"` is verified through a running
  Caddy. `max-age=31536000; includeSubDomains` contains a space and its quoting
  has never been exercised. Re-run the `curl -sI` check immediately after any
  raise — a header that stops shipping does not announce itself.
- **The restore drill against a self-hosted stack.** It is rehearsed twice
  against the operator's dev compose and once against production, in a different
  topology.

And separately from "never run here" — these are **general knowledge about
other software**, not claims this repository makes. They are the ones most
likely to be wrong at the version you are running, so check them against that
software's own documentation rather than against this page:

- The standalone **Caddy** container: image name, `/etc/caddy/Caddyfile`, the
  `/data` and `/config` volumes. Konku's production edge is a
  caddy-docker-proxy configured by labels, which is a different thing.
- **`Host` header behaviour** in nginx, Caddy and Traefik, and the
  `proxy_set_header Host $host;` fix. What Konku's code does with `Host` is
  grounded; what your proxy sends is not.
- **Certificate-authority rate limits** on repeated re-issuance, and how long
  you will wait to watch a renewal.
- The **memory floor** in Prerequisites — arithmetic off `mem_limit`, not a
  measurement.

If you run any of these and they work, or they do not, correct this page.
