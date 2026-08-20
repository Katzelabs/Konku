# Restore from a dump

**Rehearsed twice.** 2026-08-09 against dev compose, **6 seconds** for a 64 KB
dump (9 notes, 4 cards, 1 account). 2026-08-20 against **production**, **1.3
seconds** for an 80 KB dump (1 note, 0 cards, 1 account) — dump 0.62 s, restore
0.63 s. See "What the number means" at the bottom before quoting either.

Everything above `## Production` describes the **dev** stack. Production stores
a different kind of dump and restores by a different route; read that section
before using this page against the box.

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
# 2. Row-level security survived the dump. Expect one policy per RLS table
#    rather than a fixed number — it was 15 here on 2026-08-09 and is 19 in
#    production, and a stale literal makes a correct restore read as failed.
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

## Production: the shared platform

Konku is a tenant of a shared Postgres. Three things differ from everything
above, and each of them breaks a command on this page.

**The dumps are a different format.** Production dumps are gzipped `pg_dumpall`
SQL in `~/projects/platform/backups/`, covering *every* database on the shared
instance. They are not `pg_dump -Fc` archives, so `pg_restore -l` cannot list
one and `make db-restore` cannot read one.

**Never run `make restore` to recover Konku.** It pipes the whole `pg_dumpall
--clean` into the **live** instance, which drops and recreates every database in
it — Tuan Tanah included, rolled back to dump time. It is the right tool for
losing the whole instance and the wrong tool for every other situation. There is
no Konku-only option on it.

**Roles do not travel with a single-database dump.** `pg_dumpall` carries
globals, so a full restore brings `konku` and `konku_app` back with it. A
`pg_dump` of one database does not. Restoring Konku alone onto a fresh instance
needs both roles created *first*, exactly as `deploy.md`'s `### Roles and
database` does it, including the `GRANT CONNECT` — otherwise the restore
succeeds and the app still cannot log in (D-090).

### Restore Konku alone

The single-tenant path `make restore` does not implement. Measured end to end at
**1.3 seconds** on 2026-08-20. Take the dump — this is read-only against
production, `pg_dump` takes `ACCESS SHARE` and blocks nothing:

```bash
docker exec platform-postgres-1 pg_dump -U postgres -Fc konku > /tmp/konku.dump
```

Verify the archive before trusting it, as above. Note the container: **the box
has no `pg_restore` installed**, so the host-side form on this page's dev
section does not work here.

```bash
docker run --rm -i pgvector/pgvector:pg18 pg_restore -l < /tmp/konku.dump | head
```

Restore into a scratch instance that shares nothing with production — own
container, no volume, no network:

```bash
docker run -d --name konku-restore --network none \
  -e POSTGRES_PASSWORD=scratch_only pgvector/pgvector:pg18
docker exec konku-restore psql -U postgres -c "CREATE DATABASE konku_restore;"
docker exec -i konku-restore pg_restore -U postgres -d konku_restore \
  --no-owner --role=postgres < /tmp/konku.dump
docker rm -f konku-restore        # when done
```

`--no-owner --role=postgres` is what lets this run without recreating the roles.
It is correct for *verifying* a dump and wrong for *promoting* one — a real
restore wants the roles, so that ownership and the `FORCE` on every table still
mean something.

Verify against the production shape, which is what the numbers below are:

```bash
docker exec konku-restore psql -U postgres -d konku_restore -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"   -- 20
docker exec konku-restore psql -U postgres -d konku_restore -tAc \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
     AND c.relrowsecurity AND c.relforcerowsecurity;"                             -- 19
docker exec konku-restore psql -U postgres -d konku_restore -tAc \
  "SELECT count(*) FROM pg_policy;"                                               -- 19
docker exec konku-restore psql -U postgres -d konku_restore -tAc \
  "SELECT string_agg(extname,', ' ORDER BY extname) FROM pg_extension;"
   -- pg_trgm, plpgsql, vector
docker exec konku-restore psql -U postgres -d konku_restore -tAc \
  "SELECT max(version_id) FROM goose_db_version;"                                 -- 12
```

`pgvector` is the one worth watching. It is installed at provision time with
`EXT=vector` and needs superuser, so a restore onto an instance without it
fails in a way that looks like a schema problem.

### Restoring the whole instance

If the instance itself is gone, the `pg_dumpall` is the right dump and the
scratch container is still the right first step — restore it there, confirm what
came back, then promote. Restore **via `template1`, never `postgres`**:
`pg_dumpall --clean` drops and recreates the `postgres` database, which kills a
session connected to it mid-restore.

```bash
gunzip -c backups/pg_dumpall_<stamp>.sql.gz \
  | docker exec -i konku-restore psql -U postgres -d template1 -q
```

### What the 2026-08-20 drill found

Both halves ran against a throwaway instance; production was untouched.

- **The single-tenant restore works and is fast** — 0.62 s to dump, 0.63 s to
  restore, 20 tables, 19 policies, RLS enabled *and* forced on all 19 user
  tables, all three extensions, schema 12. Rows came back intact.
- **The nightly dump restored `konku` with zero tables.** The database and both
  roles were present; the schema was not. The dump had run in the sixteen
  minutes between provisioning and the first migration. This is D-091 reached by
  a second route: the coverage check reported success on the same dump. **A
  restore into scratch is the only check that cannot be fooled this way** —
  everything else asks the dump a question, and this one makes it perform.
- Restoring `tuantanah_prod` from the same file worked completely, which is what
  makes the Konku result a timing artefact rather than a broken pipeline.

## What the number means

Six seconds is a 64 KB dump on a laptop; 1.3 seconds is an 80 KB dump on the
box. Both are floors, not an RTO, and the production number is *smaller* only
because the database is nearly empty — it measures the procedure, not the data.
What they establish is that the *procedure* has no unknown steps in it, which is
the part that actually costs an hour when it is missing.

Neither number will survive real data. Re-measure when there is some, and treat
a drill against a near-empty database as proof the steps are right rather than
proof the restore is quick.

A realistic production restore adds: noticing (minutes to hours), fetching the
dump from off-site, provisioning a database if the host is gone, and DNS or
proxy work. `PRD.md` §9 carries the target the drill is measured against.

**The drill repeats quarterly.** It has now run against production once
(2026-08-20); the next is due 2026-11. A backup that has never been restored
fails silently, once, permanently — and as the 2026-08-20 run showed, a backup
that has never been restored can also pass every check that is not a restore.
