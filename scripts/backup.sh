#!/usr/bin/env bash
#
# Nightly backup for the VPS (04-ship S3, D-064).
#
# **It does not just dump. It restores what it dumped and compares row counts,
# in the same run.** A backup nobody has restored is a hope, not a mechanism
# (hard rule 9) — and the failure this guards against is not a cron that stops
# running, which the alert catches, but a cron that keeps running and writes
# files nobody can read back. That one is silent for months and is discovered
# on the worst possible day.
#
# So "the backup ran" and "the backup is restorable" are one signal here. If
# the verify fails the whole script fails, and S5's third alert fires.
#
# Per-database, never pg_dumpall: Postgres is shared with other projects on
# this box, and restoring Konku must never disturb them.
#
# Run from cron on the VPS:
#
#   15 3 * * *  /opt/konku/scripts/backup.sh >> /var/log/konku-backup.log 2>&1
#
# Required environment (see /opt/konku/backup.env):
#
#   PGHOST PGPORT              the shared Postgres
#   BACKUP_OWNER_URL           the owner role — pg_dump needs to read everything
#   RESTIC_REPOSITORY          e.g. s3:s3.eu-central-003.backblazeb2.com/konku-backups
#   RESTIC_PASSWORD_FILE       the repo passphrase, chmod 600, NOT in this repo
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   the B2/S3 application key
#
# Optional:
#
#   HEARTBEAT_URL              pinged only on total success (S5's alert 3)
#   WORK_DIR                   defaults to /var/tmp/konku-backup

set -euo pipefail

WORK_DIR="${WORK_DIR:-/var/tmp/konku-backup}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="${WORK_DIR}/konku-${STAMP}.dump"

# The scratch database the verify restores into. Dropped and recreated every
# run, and named so that nobody mistakes it for anything: this box hosts other
# projects, and a restore target with a plausible name is an accident waiting.
VERIFY_DB="konku_backup_verify"

# Row counts must match within this fraction, **or one row, whichever is
# larger**.
#
# Not exact, because the dump is not taken with the application stopped — a note
# written between the dump and the verify is a normal thing, not a corrupt
# backup. What this catches is a dump that came back empty, short, or missing
# tables.
#
# The one-row floor is what keeps small tables from crying wolf: on a 10-row
# `users` table a single signup during the run is 10% drift, and an alert that
# fires on ordinary activity is an alert you learn to ignore — which costs you
# the night the backup is genuinely broken.
TOLERANCE_PERCENT=2
MIN_ROW_SLACK=1

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

fail() {
  log "FAILED: $*"
  # Deliberately no heartbeat ping on this path. The alert is the *absence* of
  # a ping, so a failure that still pinged would be a backup that reports
  # itself healthy while being broken — the exact thing this script exists to
  # make impossible.
  exit 1
}

cleanup() {
  rm -f "${DUMP}"
  # Leave no scratch database behind holding a copy of everyone's notes.
  psql "${BACKUP_OWNER_URL}" -v ON_ERROR_STOP=1 -c \
    "DROP DATABASE IF EXISTS ${VERIFY_DB}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for var in BACKUP_OWNER_URL RESTIC_REPOSITORY RESTIC_PASSWORD_FILE; do
  [ -n "${!var:-}" ] || fail "${var} is not set"
done

mkdir -p "${WORK_DIR}"
chmod 700 "${WORK_DIR}"

# ---------------------------------------------------------------------------
# 1. Dump
# ---------------------------------------------------------------------------

log "dumping konku"
pg_dump -Fc -d "${BACKUP_OWNER_URL}" -f "${DUMP}" \
  || fail "pg_dump exited non-zero"

[ -s "${DUMP}" ] || fail "the dump is empty"

# A readable archive, checked before it is uploaded. pg_restore -l parses the
# table of contents without touching a database, so a truncated or
# version-mismatched file fails here rather than in an emergency.
pg_restore -l "${DUMP}" >/dev/null || fail "the dump is not a readable archive"

log "dumped $(du -h "${DUMP}" | cut -f1)"

# ---------------------------------------------------------------------------
# 2. Restore it, into a scratch database, and count
# ---------------------------------------------------------------------------
#
# This is the half that makes the rest worth anything.

log "restoring into ${VERIFY_DB}"
psql "${BACKUP_OWNER_URL}" -v ON_ERROR_STOP=1 -q -c \
  "DROP DATABASE IF EXISTS ${VERIFY_DB}" || fail "could not drop ${VERIFY_DB}"
psql "${BACKUP_OWNER_URL}" -v ON_ERROR_STOP=1 -q -c \
  "CREATE DATABASE ${VERIFY_DB}" || fail "could not create ${VERIFY_DB}"

# The verify database's URL: the same connection with the database swapped.
VERIFY_URL="$(printf '%s' "${BACKUP_OWNER_URL}" | sed -E "s#/[^/?]+(\?|\$)#/${VERIFY_DB}\1#")"

# --no-owner and --no-privileges: the scratch database does not need konku_app
# to exist to prove the *data* came back, and demanding the full grant graph
# here would make this fail for reasons that are not about the backup. The
# grants and policies are checked properly during the real drill in
# docs/runbooks/restore.md, which is a different exercise on a different
# cadence.
pg_restore --no-owner --no-privileges -d "${VERIFY_URL}" "${DUMP}" \
  || fail "pg_restore could not load the dump — THE BACKUP IS NOT RESTORABLE"

# Compare the tables that hold what a user would actually lose. Not every
# table: this is a smoke test with a tolerance, and the point is catching a
# dump that came back empty or short, not auditing the schema.
TABLES="users notes cards card_schedules review_logs focus_sessions domains categories"

for table in ${TABLES}; do
  live=$(psql "${BACKUP_OWNER_URL}" -tA -c "SELECT count(*) FROM ${table}" 2>/dev/null) \
    || fail "could not count ${table} on the live database"
  restored=$(psql "${VERIFY_URL}" -tA -c "SELECT count(*) FROM ${table}" 2>/dev/null) \
    || fail "${table} is missing from the restored copy"

  if [ "${live}" -eq 0 ]; then
    # An empty table on both sides is fine and says nothing. Note it, so a
    # backup that is verifying nothing does not read as a backup that passed.
    log "  ${table}: 0 rows on both sides (nothing verified here)"
    continue
  fi

  # Checked before the tolerance, because the tolerance cannot express it: on a
  # one-row table the slack above would let "restored nothing at all" pass, and
  # that is the single most important case to catch. A table that has rows and
  # came back with none is never acceptable drift.
  if [ "${restored}" -eq 0 ]; then
    fail "${table}: live=${live} restored=0 — the table came back empty"
  fi

  allowed=$(( live * TOLERANCE_PERCENT / 100 ))
  [ "${allowed}" -lt "${MIN_ROW_SLACK}" ] && allowed="${MIN_ROW_SLACK}"

  gap=$(( live - restored ))
  [ "${gap}" -lt 0 ] && gap=$(( -gap ))

  if [ "${gap}" -gt "${allowed}" ]; then
    fail "${table}: live=${live} restored=${restored} (${gap} rows adrift, ${allowed} allowed) — the dump is short"
  fi
  log "  ${table}: live=${live} restored=${restored}"
done

log "restore verified"

# ---------------------------------------------------------------------------
# 3. Off the box
# ---------------------------------------------------------------------------
#
# A backup on the same machine as the database is not a backup. It survives a
# bad migration and `docker compose down -v`; it does not survive losing the
# machine, which is the case that ends the project.

log "uploading to restic"
restic backup --tag konku --tag nightly "${DUMP}" \
  || fail "restic backup failed"

# Retention is a **promise**, not a preference. The privacy policy (07 L9)
# tells users their data is gone from backups within 30 days of deleting their
# account, and that is only true if these add up to 30 days or fewer. Changing
# them without changing the policy makes the policy a false statement.
log "pruning to the 30-day retention promised in /privacy"
restic forget --tag konku --keep-daily 30 --prune \
  || fail "restic forget/prune failed"

# Cheap, and the one thing that catches a repository that is subtly corrupt
# rather than merely absent.
restic check --read-data-subset=1/30 \
  || fail "restic check found a problem with the repository"

log "backup complete"

# Only here, after every check passed. See fail() for why this is not in a
# trap: the alert is the absence of this ping.
if [ -n "${HEARTBEAT_URL:-}" ]; then
  curl -fsS --max-time 20 "${HEARTBEAT_URL}" >/dev/null \
    || log "WARNING: backup succeeded but the heartbeat ping failed"
fi
