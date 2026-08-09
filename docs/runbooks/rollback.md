# Roll back a bad release

**Rehearsed: 2026-08-09**, against dev compose. The digest round trip and the
schema-drift detection were both exercised; the VPS steps are marked and are
`04-ship.md` S3.

---

## The short version

```bash
# 1. What is running?
curl -s https://<host>/readyz          # schema_version tells you the schema
docker inspect --format '{{.Image}}' konku   # on the box

# 2. Verify the digest you intend to go back to, BEFORE deploying it.
make release-verify REF=ghcr.io/katzelabs/konku@sha256:<previous>

# 3. Deploy it by digest.        [04-ship.md S3]
```

**Always by digest, never by tag.** A tag can be moved after it was tested. A
digest is the artifact.

## Finding the previous digest

```bash
gh api /orgs/Katzelabs/packages/container/konku/versions \
  --jq '.[] | {digest: .name, tags: .metadata.container.tags, created: .created_at}' | head -20
```

Every release also prints its digest in the workflow summary. If you keep one
number in a deploy log, keep that.

## Verify before you deploy

This is the same check `06` P9 runs at publish time, and it costs seconds:

```bash
make release-verify REF=ghcr.io/katzelabs/konku@sha256:<previous>
```

It pulls the image by digest, runs it against the dev database, and confirms
`/readyz` is ok, the schema is non-zero, and the embedded frontend is served. A
rollback target that does not start is worth discovering here rather than
during an incident.

## The hard case: the bad release also migrated

This is the case worth reading before you need it.

Migrations run at startup and are forward-only. Deploying an older image
against a newer schema does **not** roll the schema back — the old binary
starts, sees a schema it was not built for, and **/readyz reports
`schema_mismatch` and 503**. Rehearsed:

```
readyz: 503 {"reason":"schema_mismatch","status":"unready"}
log: "readiness: schema moved underneath this process" expected=6 actual=7
```

That is the detection working. The instance takes itself out of rotation
rather than serving queries written for a schema that is no longer there — and
it says so in one line, with both numbers.

**What to do about it depends on the migration, and there is no safe generic
answer:**

- **The migration was additive** (a new table, a new nullable column). The old
  binary does not know about it and does not care. The `schema_mismatch`
  readiness check is the only thing objecting. Roll *forward* with a fixed
  release instead, or accept the mismatch knowingly.
- **The migration was destructive** (dropped or renamed a column, rewrote
  data). The old binary cannot run against it, and the schema has to come back
  first. That means **restore from the dump taken before the deploy** —
  `restore.md` — and then deploy the old digest. This is the reason the
  rollout order in D-061 is *back up, deploy, verify* rather than *deploy,
  verify, back up*.

**Take a dump before every deploy.** It is the difference between a rollback
and a rewrite:

```bash
make db-dump
```

## Confirm the rollback landed

```bash
curl -s https://<host>/readyz        # status ok, and the schema_version you expect
```

The running version is also in the startup log and on every Sentry event —
the binary is stamped with its tag (`-X main.version`), so "what is running"
is answerable without shelling into the container.

## Afterwards

Write down what shipped, what broke, and what the digest was, in
`incident.md`'s format. A rollback with no note becomes a mystery in six weeks.
