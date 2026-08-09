#!/usr/bin/env bash
#
# Verify a release image by digest, against the dev database (06 P9).
#
# Building an image proves it compiles. This proves it *runs*: that it starts,
# migrates, serves the embedded frontend, and reports ready — which is what
# catches a missing asset or a broken entrypoint before deploy day rather than
# during it.
#
# Two modes:
#
#   make release-verify                  build locally, push to a throwaway
#                                        registry, pull back by digest, run it
#   make release-verify REF=ghcr.io/...@sha256:...
#                                        verify an image that already exists
#
# The second is what `04-ship.md` runs against a real GHCR digest before a
# deploy, and what `rollback.md` runs against the previous one.
#
# Always by digest, never by tag: a tag can be moved after it was tested, and
# then "what is running in production" is unanswerable (D-061).

set -euo pipefail

REGISTRY_NAME=konku-verify-registry
REGISTRY_PORT=5001
CONTAINER=konku-verify
APP_PORT=8096

# The dev database, reached from inside the container. host.docker.internal is
# how a container sees the host's published ports on Docker Desktop; on Linux
# the --add-host below provides the same name.
DB_HOST=host.docker.internal
APP_DB="postgres://konku_app:${APP_DB_PASSWORD:-konku_app_dev}@${DB_HOST}:5433/konku?sslmode=disable"
OWNER_DB="postgres://konku:konku@${DB_HOST}:5433/konku?sslmode=disable"

REF="${REF:-}"
started_registry=false

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  if [ "$started_registry" = true ]; then
    docker rm -f "$REGISTRY_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [ -z "$REF" ]; then
  echo "==> No REF given: building and publishing to a throwaway registry"

  docker rm -f "$REGISTRY_NAME" >/dev/null 2>&1 || true
  docker run -d --name "$REGISTRY_NAME" -p "${REGISTRY_PORT}:5000" registry:2 >/dev/null
  started_registry=true

  # Wait for it rather than sleeping a guessed amount.
  for _ in $(seq 1 30); do
    if curl -fsS "http://localhost:${REGISTRY_PORT}/v2/" >/dev/null 2>&1; then break; fi
    sleep 1
  done

  # Both platforms, exactly as release.yml publishes them. Cross-compiled
  # rather than emulated — see the Dockerfile.
  docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --build-arg "VERSION=${VERSION:-local-verify}" \
    -t "localhost:${REGISTRY_PORT}/konku:verify" \
    --push . >/dev/null

  DIGEST=$(docker buildx imagetools inspect \
    "localhost:${REGISTRY_PORT}/konku:verify" --format '{{.Manifest.Digest}}')
  REF="localhost:${REGISTRY_PORT}/konku@${DIGEST}"

  echo "==> Published ${REF}"
  echo "==> Architectures in the manifest:"
  docker buildx imagetools inspect "localhost:${REGISTRY_PORT}/konku:verify" \
    | grep -E "Platform|MediaType: application/vnd.oci.image.manifest" | sed 's/^/    /'
fi

echo "==> Pulling by digest"
docker pull --quiet "$REF" >/dev/null

echo "==> Running it against the dev database"
docker run -d --name "$CONTAINER" \
  --add-host host.docker.internal:host-gateway \
  -p "${APP_PORT}:8080" \
  -e DATABASE_URL="$APP_DB" \
  -e MIGRATION_DATABASE_URL="$OWNER_DB" \
  -e SESSION_SECRET=verify-only-not-a-real-secret \
  -e DEV=false \
  -e METRICS_ADDR= \
  -e SENTRY_DSN= \
  "$REF" >/dev/null

ready=""
for _ in $(seq 1 30); do
  if ready=$(curl -fsS "http://localhost:${APP_PORT}/readyz" 2>/dev/null); then break; fi
  sleep 1
done

if [ -z "$ready" ]; then
  echo "FAIL: the image never became ready"
  docker logs "$CONTAINER" | tail -30
  exit 1
fi
echo "    /readyz -> $ready"

case "$ready" in
  *'"status":"ok"'*) ;;
  *) echo "FAIL: /readyz did not report ok"; exit 1 ;;
esac

# schema_version 0 would mean the container served without migrating, which
# /readyz alone would still call ready on an empty database.
case "$ready" in
  *'"schema_version":0'*) echo "FAIL: the image did not run its migrations"; exit 1 ;;
esac

# The embedded frontend. A binary that serves the API but 404s the app is a
# broken release that /readyz cannot see — exactly the dist/.gitkeep gotcha.
if ! curl -fsS "http://localhost:${APP_PORT}/" | grep -q '<div id="root">'; then
  echo "FAIL: the embedded frontend is not being served"
  exit 1
fi
echo "    / -> the embedded frontend is served"

# And the release stamp, so the running container can say what it is.
echo "    version -> $(docker logs "$CONTAINER" 2>&1 | grep -o '"version":"[^"]*"' | head -1)"

echo "==> OK: ${REF}"
