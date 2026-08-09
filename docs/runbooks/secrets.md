# Rotate a secret

**Rehearsed: 2026-08-09**, against dev compose.

---

## Read this first: `SESSION_SECRET` does not do what its name says

`06` P10 was written expecting that rotating `SESSION_SECRET` would log
everyone out. **It does not.** Rehearsed, with a live session in hand:

| action | process | the existing session |
|---|---|---|
| restart with a new `SESSION_SECRET` | alive (`/healthz` 200) | **still valid (200)** |
| `DELETE FROM auth_sessions` | alive | **revoked (401)** |

The reason is D-039: sessions are opaque 256-bit random identifiers stored
server-side, not signed cookies carrying claims. Nothing is signed, so there is
no signing key to invalidate. `SESSION_SECRET` is currently **loaded,
validated as required outside dev, and never read by any code path.**

This matters more than a stale comment. An operator responding to a leaked
session token would rotate `SESSION_SECRET`, see the process come back healthy,
and believe access had been revoked when every stolen cookie still worked.
**Revoking sessions means deleting rows.**

---

## Revoke all sessions

```bash
psql "$MIGRATION_DATABASE_URL" -c "DELETE FROM auth_sessions;"
```

Everyone is signed out on their next request; the next page load shows the
login screen. No restart is needed — sessions are resolved per request.

To revoke one account's sessions only:

```bash
psql "$MIGRATION_DATABASE_URL" -c \
  "DELETE FROM auth_sessions WHERE user_id = '<uuid>';"
```

Use the owner connection: `konku_app` is subject to the RLS policy on
`auth_sessions` and would only see rows for whoever `app.user_id` is set to,
which for a psql session is nobody.

## Rotate the database password

The application role is `konku_app` (non-owner, D-059). Rotating its password
does not touch the owner.

```bash
# 1. Set the new password.
psql "$MIGRATION_DATABASE_URL" -c \
  "ALTER ROLE konku_app WITH PASSWORD '<new>';"

# 2. Update DATABASE_URL wherever it lives (.env locally, the compose
#    environment on the box) and restart the app.

# 3. Confirm.
curl -s localhost:8080/readyz        # {"schema_version":N,"status":"ok"}
```

Existing pooled connections keep working until they are recycled
(`maxConnLifetime` is 5 minutes), so there is a window where the app is healthy
on the old password. That is a grace period, not a success signal — verify
after a restart, not before.

Locally, `make db-app-role` does step 1 from `APP_DB_PASSWORD`, and prints
`rolsuper` and `rolbypassrls` so a role that would make RLS inert is obvious
immediately.

## Rotate the owner password

Only migrations use it. Change it, update `MIGRATION_DATABASE_URL`, and restart
— migrations run at startup, so a wrong value fails loudly and immediately
rather than at the next deploy.

## Rotate `SENTRY_DSN`

Set the new DSN and restart. An empty DSN disables reporting rather than
erroring, so a mistyped variable degrades to "no error tracking" quietly —
check the startup log for `sentry enabled` after a change.

## SMTP credentials

Not applicable yet. Email arrives with signup and password reset in
`07-public-launch.md` (D-058); this section gets written with the feature
rather than guessed at now.

## What is safe to rotate without a restart

Nothing. Configuration is read once at startup by design (`internal/config`),
which is why every entry above ends in a restart and a `/readyz` check.

## Open question for the next person

`SESSION_SECRET` should either be **used** or **removed**. Right now it is a
required production variable that protects nothing, and its name actively
misleads. Removing it is a one-line config change plus a deployment note;
using it would mean signing something that is currently opaque and random,
which D-039 deliberately chose not to do. Left as a decision rather than
silently deleted, because it is currently required and dropping it would break
a deploy that sets it.
