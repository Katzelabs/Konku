# 04 — Ship

Getting it onto the VPS, backed up, and into daily use.

**~6 h** · needs 03

---

## S1 — CI

`todo` · ~1 h · no deps

`.github/workflows/ci.yml` — the repo is on GitHub now
(`Katzelabs/Konku`) and nothing runs on push yet.

- Postgres service container (`pgvector/pgvector:pg17`) for integration tests
- `go vet ./...`, `go test ./...`, `make check-pure`
- `cd web && npm ci && npm run typecheck && npm run build`
- Build the Docker image on `main` so a broken Dockerfile is caught before
  deploy day

`make check-pure` in CI is the point: the purity of `card` and `srs` is the one
architectural rule, and rules that are not enforced decay.

**Done when:** a PR that makes `internal/srs` import `internal/store` fails CI.

---

## S2 — VPS deploy

`todo` · ~3 h · needs S1

Follows `TECH.md` §7.

**Shared infra stack** (once, if not already up):
```bash
docker network create shared
# caddy + pgvector/pgvector:pg17 + mongo on that network
```

**Provision konku's database and role:**
```sql
CREATE ROLE konku LOGIN PASSWORD '...';
CREATE DATABASE konku OWNER konku;
REVOKE CONNECT ON DATABASE konku FROM PUBLIC;
\c konku
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

- The app connects as `konku`, **never** as `postgres`
- `pgvector` image from day one even though nothing uses vectors until v0.3 —
  installing it later on a shared instance means coordinated downtime across
  every project on the box (D-025)
- Deploy `docker-compose.prod.yml`, set `KONKU_HOST`, `DATABASE_URL`,
  `SESSION_SECRET` (`openssl rand -base64 32`)
- `ALLOW_SIGNUP=false`, `DEV=false`
- Create the account with `konku seed-user`
- Migrations run themselves at startup (F1)

**Done when:** the app is reachable over HTTPS on your domain and you can log
in from your phone.

---

## S3 — Backups off the VPS

`todo` · ~2 h · needs S2

**Non-negotiable, even in an MVP.** This becomes years of accumulated
knowledge, and a backup on the same machine as the database is not a backup.

- Nightly `pg_dump -Fc konku` — **per-database, not `pg_dumpall`**, so
  restoring Konku never disturbs the other projects sharing that Postgres
- Push off the box with restic to B2 or S3. A couple of dollars a month
- **Test a restore into the dev database.** An untested backup is a hypothesis

**Done when:** you have restored last night's dump into local dev and logged in
against it.

---

## S4 — Use it daily for two weeks

`todo` · not a build task · needs S2

The MVP exists to answer one question: **do you actually write notes and
cards?**

Watch for:

- Sessions where you skip the capture prompt — if that is most of them, capture
  friction is still too high and that is the next thing to fix, not a feature
- Notes with zero cards — writing is happening, card-making is not
- Reviews you avoid — is recall-before-reveal too effortful, or the daily cap
  too high?

If capture is not happening, **fix that before building anything in v0.2**. No
amount of cloze support, full-text search, or MCP compensates for an empty
knowledge base (D-030).

If it *is* happening after two weeks, the MVP succeeded and v0.2 is worth
starting.
