# Restore from a dump

**Rehearsed: 2026-08-09, against dev compose. Measured: 6 seconds** for a 64 KB
dump (9 notes, 4 cards, 1 account). See "What the number means" at the bottom
before quoting it.

Written before it was needed, because the moment it is needed is the moment
nobody is thinking clearly (D-064).

---

## When to use this

- A `docker compose down -v`, or any other accidental volume loss
- A migration that destroyed data rather than moving it
- Corruption, or a restore drill

**If the database is merely unreachable, this is the wrong runbook.** `/readyz`
returning `database_unreachable` means the process is fine and Postgres is not;
restoring would replace good data with older data. Check Postgres first.

## Before you touch anything

1. **Take a dump of the current state, even if you think it is worthless.**

   ```bash
   make db-dump
   ```

   A restore overwrites. If the current database still holds anything the dump
   does not, this is the only chance to keep it. A failed dump here is a
   reason to stop and think, not to press on.

2. **Find the dump you mean to restore.** Newest is not always right — if the
   damage happened yesterday, yesterday's dump contains it.

   ```bash
   ls -lt "${KONKU_BACKUP_DIR:-$HOME/Backups/konku}"/*.dump
   ```

3. **Check it is readable before trusting it.** `pg_restore -l` lists the
   archive's table of contents without writing anything.

   ```bash
   pg_restore -l <dump> | head
   ```

   `make db-dump` already does this check at write time and refuses to keep an
   unreadable file, so a failure here means the file was damaged afterwards.

## Restore

Into a scratch database first — always. Verifying a restore in a copy costs
seconds and cannot make anything worse.

```bash
make db-restore FILE=<dump>            # restores into konku_restore
```

Then verify, in this order. Each step rules out a different failure:

```bash
# 1. The rows are there.
docker compose exec -T db psql -U konku -d konku_restore \
  -c "select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc;"
```

`n_live_tup` is an estimate from the statistics collector and reads low or
stale right after a bulk load. Run `ANALYZE;` first, or use `count(*)` on the
tables you care about, before concluding anything is missing.

```bash
# 2. Row-level security survived the dump. Expect 15 policies.
docker compose exec -T db psql -tA -U konku -d konku_restore \
  -c "select count(*) from pg_policy;"

# 3. The application role can still read. Expect t.
docker compose exec -T db psql -tA -U konku -d konku_restore \
  -c "select has_table_privilege('konku_app','notes','SELECT');"
```

Steps 2 and 3 matter because a restored database that the app cannot connect to
looks exactly like a successful restore until you try to use it. `pg_dump -Fc`
does carry policies and grants — this is verifying that, not hoping for it.

```bash
# 4. It actually serves.
DATABASE_URL="postgres://konku_app:${APP_DB_PASSWORD:-konku_app_dev}@localhost:5433/konku_restore?sslmode=disable" \
MIGRATION_DATABASE_URL="postgres://konku:konku@localhost:5433/konku_restore?sslmode=disable" \
DEV=false SESSION_SECRET=drill PORT=8095 METRICS_ADDR= ./bin/konku
```

```bash
curl -s localhost:8095/readyz     # {"schema_version":N,"status":"ok"}
```

```bash
# 5. Logging in works. This is the step that proves the restore, because it
#    exercises the schema, the grants and the policies together.
curl -s -i -X POST localhost:8095/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}' | head -1
```

## Promote it

Only once the scratch copy verifies:

```bash
make db-restore FILE=<dump> RESTORE_DB=konku CONFIRM=yes
```

`CONFIRM=yes` is required and deliberately awkward — this drops the live
database. Restart the app afterwards; it migrates on start, so a dump from an
older schema is rolled forward automatically.

## What the number means

Six seconds is a 64 KB dump on a laptop against a container that was already
running. It is a floor, not an RTO. What it does establish is that the
*procedure* has no unknown steps in it, which is the part that actually costs
an hour when it is missing.

A realistic production restore adds: noticing (minutes to hours), fetching the
dump from off-site, provisioning a database if the host is gone, and DNS or
proxy work. `PRD.md` §9 carries the target the drill is measured against.

**The drill repeats quarterly, and repeats against production once it exists.**
A backup that has never been restored fails silently, once, permanently.
