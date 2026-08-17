export PATH := $(PATH):$(shell go env GOPATH)/bin

# Load .env if it exists. Go does not read .env on its own, and pulling in a
# dotenv library for one convenience would break the short-dependency rule
# (D-045) — make can do it in two lines.
#
# `-include` so a missing .env is not an error; `export` passes everything
# through to the recipes.
-include .env
export

# Defaults, so `make db-up && make dev-api` works on a fresh clone with no
# .env at all. A value in .env wins, because include runs first and ?= does
# not overwrite.
# Two principals (D-059). The app connects as the non-owner konku_app so that
# FORCE ROW LEVEL SECURITY actually applies to it; migrations connect as the
# owner, which is the only role allowed to run DDL.
APP_DB_PASSWORD ?= konku_app_dev
DATABASE_URL ?= postgres://konku_app:$(APP_DB_PASSWORD)@localhost:5433/konku?sslmode=disable
MIGRATION_DATABASE_URL ?= postgres://konku:konku@localhost:5433/konku?sslmode=disable
DEV ?= true

# The dev SMTP catcher (07 L2). Mailpit accepts everything and delivers
# nothing, which is the whole point locally — deliverability is 04-ship S4.
MAILPIT_SMTP_URL ?= smtp://localhost:1025
MAILPIT_API_URL ?= http://localhost:8025

# ...but not into the environment, and this is the only pair that has to opt
# out. `export` above passes every variable through to every recipe, which is
# what a default is for everywhere else — and is exactly wrong here.
# mailpit_test.go skips on an empty MAILPIT_API_URL, so exporting a default
# meant the guard never fired: `make check` ran the catcher tests against a
# catcher that was not running and failed on connection refused, on any machine
# that had not started one. That is the merge gate, so it failed for everybody
# except whoever happened to have Mailpit up.
#
# unexport rather than dropping the defaults: test-mail passes both on its own
# command line below, so the value is still there for the target that wants it,
# from .env or from the operator's shell just the same. What changes is that
# nothing gets it by accident.
unexport MAILPIT_SMTP_URL MAILPIT_API_URL

# Where dumps land. Deliberately outside the repo AND outside the Docker
# volume: a backup that lives in the thing it is backing up is not a backup,
# and `docker compose down -v` is the exact accident this guards against.
# db-dump refuses to write anywhere under $(CURDIR).
KONKU_BACKUP_DIR ?= $(HOME)/Backups/konku

# db-restore drops and recreates its target, so the default is a scratch
# database rather than the one holding real notes. Restoring over `konku`
# needs RESTORE_DB=konku CONFIRM=yes, typed on purpose.
RESTORE_DB ?= konku_restore

.PHONY: help setup dev dev-api dev-web build test test-integration test-mail sqlc sqlc-diff lint check check-pure migrate-up migrate-down db-up db-down db-app-role db-dump db-restore db-upgrade-pg18 mail-up mail-down release-verify clean

help:
	@grep -E '^[a-zA-Z-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## Install dependencies
	go mod download
	cd web && npm install

db-up: ## Start the dev Postgres (port 5433)
	docker compose up -d db

db-down: ## Stop the dev Postgres
	docker compose down

# The SMTP catcher (07 L2). Behind a compose profile so `make db-up` and CI's
# integration job are unaffected by it.
mail-up: ## Start the dev SMTP catcher (SMTP :1025, inbox on :8025)
	docker compose --profile dev up -d mailpit
	@echo "Mailpit inbox: http://localhost:8025"

mail-down: ## Stop the dev SMTP catcher
	docker compose --profile dev stop mailpit

# The migration creates konku_app as NOLOGIN with no password, because a
# credential in a migration is a credential in git. This gives it one.
#
# Idempotent on purpose: the dev volume already holds real data, and an
# initdb script only ever runs on a fresh volume.
#
# Why this exists at all: the dev database's `konku` role is the Postgres
# image's bootstrap user, which is SUPERUSER with BYPASSRLS. FORCE ROW LEVEL
# SECURITY does not apply to it. Connecting the app as `konku` leaves every
# policy inert while every naive test of them still passes (D-059).
db-app-role: ## Grant konku_app LOGIN and set its password
	@docker compose exec -T db psql -v ON_ERROR_STOP=1 -U konku -d konku -c \
		"ALTER ROLE konku_app WITH LOGIN PASSWORD '$(APP_DB_PASSWORD)'" >/dev/null
	@docker compose exec -T db psql -tA -U konku -d konku -c \
		"select 'konku_app: rolsuper=' || rolsuper || ' rolbypassrls=' || rolbypassrls \
		 from pg_roles where rolname='konku_app'"
	@echo "konku_app can log in. Both flags above must be f, or RLS is inert."

# Daily use starts now and it is local (D-067), so the dev volume is about to
# hold weeks of real notes and review history. review_logs in particular cannot
# be reconstructed after the fact (D-029).
#
# pg_dump runs INSIDE the container so its version always matches the server.
# A Homebrew Postgres upgrade on the host is otherwise enough to turn every
# backup into a version-mismatch error, discovered at restore time.
db-dump: ## Dump the dev database to $KONKU_BACKUP_DIR (pg_dump -Fc)
	@refuse() { \
	  echo "refusing: $$1 is inside the repo."; \
	  echo "A dump in the working tree is one git clean away from gone."; \
	  echo "Set KONKU_BACKUP_DIR to somewhere else."; \
	  echo; \
	  echo "If you wrote \$$HOME in .env: make *includes* .env rather than"; \
	  echo "sourcing it, so \$$H expands to nothing and OME/... is left behind."; \
	  echo "Write \$${HOME} instead — that works in make and in a shell."; \
	  exit 1; \
	}; \
	dir="$(KONKU_BACKUP_DIR)"; \
	case "$$dir" in /*) abs="$$dir";; *) abs="$(CURDIR)/$$dir";; esac; \
	case "$$abs/" in "$(CURDIR)"/*) refuse "$$abs";; esac; \
	mkdir -p "$$abs" || exit 1; \
	dir=$$(cd "$$abs" && pwd -P); \
	case "$$dir/" in "$(CURDIR)"/*) refuse "$$dir";; esac; \
	out="$$dir/konku-$$(date +%Y%m%d-%H%M%S).dump"; \
	docker compose exec -T db pg_dump -Fc -U konku -d konku > "$$out" \
	  || { rm -f "$$out"; echo "dump failed (is \`make db-up\` running?)"; exit 1; }; \
	if [ ! -s "$$out" ]; then rm -f "$$out"; echo "dump was empty; refusing to keep it"; exit 1; fi; \
	pg_restore -l "$$out" > /dev/null 2>&1 \
	  || docker compose exec -T db pg_restore -l /dev/stdin < "$$out" > /dev/null \
	  || { rm -f "$$out"; echo "dump is not a readable archive; refusing to keep it"; exit 1; }; \
	echo "wrote $$out ($$(du -h "$$out" | cut -f1))"; \
	echo; \
	echo "This is on the same disk as the database. Get it off the machine —"; \
	echo "a synced folder counts at this stage (06 P11)."

# The other half. A dump that has never been restored is a hope, not a backup
# (PRD section 9), and this is the target P10's drill is timed against.
db-restore: ## Restore a dump into $RESTORE_DB. FILE=path, or the newest dump.
	@file="$(FILE)"; \
	if [ -z "$$file" ]; then \
	  file=$$(ls -t "$(KONKU_BACKUP_DIR)"/*.dump 2>/dev/null | head -1); \
	fi; \
	if [ -z "$$file" ] || [ ! -s "$$file" ]; then \
	  echo "no dump found. Pass FILE=path or run \`make db-dump\` first."; exit 1; \
	fi; \
	if [ "$(RESTORE_DB)" = "konku" ] && [ "$(CONFIRM)" != "yes" ]; then \
	  echo "RESTORE_DB=konku would destroy the live dev database."; \
	  echo "Re-run with CONFIRM=yes if that is genuinely what you want."; \
	  exit 1; \
	fi; \
	echo "restoring $$file into $(RESTORE_DB)"; \
	docker compose exec -T db dropdb -U konku --if-exists "$(RESTORE_DB)" || exit 1; \
	docker compose exec -T db createdb -U konku "$(RESTORE_DB)" || exit 1; \
	docker compose exec -T db pg_restore -U konku -d "$(RESTORE_DB)" --no-owner < "$$file" || exit 1; \
	echo; \
	echo "restored. Row counts in $(RESTORE_DB):"; \
	docker compose exec -T db psql -U konku -d "$(RESTORE_DB)" -c \
	  "select relname, n_live_tup from pg_stat_user_tables where n_live_tup > 0 order by n_live_tup desc;"

# One-time: move the dev database from the pg17 volume to the pg18 one (D-088).
#
# The dev volume holds real notes and real review history, and review_logs
# cannot be reconstructed after the fact (D-029) — so this dumps through a
# throwaway pg17 container rather than trusting anything to happen in place.
# `docker compose up` on pg18 would otherwise just hand you an empty database
# while the pg17 data sits in a volume nothing mounts any more.
#
# Nothing here writes to the pg17 volume: it is mounted read-only, and the
# target is safe to re-run and safe to abandon halfway.
db-upgrade-pg18: ## One-time: migrate the dev database from the pg17 volume to pg18
	@set -e; \
	old=$$(docker volume ls -q -f name='^konku[-_]konku-dev-data$$' | head -1); \
	if [ -z "$$old" ]; then \
	  echo "no pg17 volume found — nothing to upgrade."; \
	  echo "If this is a fresh clone, just run \`make db-up\`."; \
	  exit 0; \
	fi; \
	echo "pg17 volume: $$old"; \
	tmp=$$(mktemp -d); \
	trap 'rm -rf "$$tmp"' EXIT; \
	echo "dumping from a throwaway pg17 (volume mounted read-only)..."; \
	docker run --rm -d --name konku-pg17-dump \
	  -v "$$old":/var/lib/postgresql/data:ro \
	  -e POSTGRES_USER=konku -e POSTGRES_PASSWORD=konku -e POSTGRES_DB=konku \
	  pgvector/pgvector:pg17 >/dev/null; \
	trap 'docker rm -f konku-pg17-dump >/dev/null 2>&1 || true; rm -rf "$$tmp"' EXIT; \
	for i in $$(seq 1 30); do \
	  docker exec konku-pg17-dump pg_isready -U konku -d konku >/dev/null 2>&1 && break; \
	  [ "$$i" = 30 ] && { echo "pg17 never became ready"; docker logs konku-pg17-dump; exit 1; }; \
	  sleep 1; \
	done; \
	docker exec konku-pg17-dump pg_dump -Fc -U konku -d konku > "$$tmp/pg17.dump"; \
	docker rm -f konku-pg17-dump >/dev/null; \
	[ -s "$$tmp/pg17.dump" ] || { echo "the pg17 dump was empty; refusing to continue"; exit 1; }; \
	echo "dumped $$(du -h "$$tmp/pg17.dump" | cut -f1)"; \
	echo "starting pg18..."; \
	docker compose up -d db; \
	for i in $$(seq 1 60); do \
	  docker compose exec -T db pg_isready -U konku -d konku >/dev/null 2>&1 && break; \
	  [ "$$i" = 60 ] && { echo "pg18 never became ready"; docker compose logs db; exit 1; }; \
	  sleep 1; \
	done; \
	rows=$$(docker compose exec -T db psql -tA -U konku -d konku -c \
	  "select count(*) from pg_stat_user_tables" 2>/dev/null || echo 0); \
	if [ "$$rows" != "0" ]; then \
	  echo "the pg18 database already has $$rows tables. Refusing to restore over it."; \
	  echo "If you want to start again: docker compose down && docker volume rm konku_konku-dev-pg18"; \
	  exit 1; \
	fi; \
	echo "restoring into pg18..."; \
	docker compose exec -T db pg_restore -U konku -d konku --no-owner < "$$tmp/pg17.dump"; \
	$(MAKE) --no-print-directory db-app-role; \
	echo; \
	echo "restored. Row counts on pg18:"; \
	docker compose exec -T db psql -U konku -d konku -c \
	  "select relname, n_live_tup from pg_stat_user_tables where n_live_tup > 0 order by n_live_tup desc;"; \
	echo; \
	echo "The pg17 volume ($$old) is untouched. Remove it once you trust this:"; \
	echo "  docker volume rm $$old"

dev-api: ## Run the Go server on :8080
	go run ./cmd/konku

dev-web: ## Run Vite on :5173, proxying /api to :8080
	cd web && npm run dev

dev: ## Print how to run both halves
	@echo "Run in two terminals:"
	@echo "  make dev-api   # Go on :8080"
	@echo "  make dev-web   # Vite on :5173  <- open this one"

build: ## Build the frontend into the Go binary
	cd web && npm run build
	# Vite's emptyOutDir wipes dist/, including the committed .gitkeep that
	# keeps `go build` working on a fresh clone. Put it back.
	@touch internal/web/dist/.gitkeep
	go build -o bin/konku ./cmd/konku
	@echo "built bin/konku"

test: ## Run Go tests
	go test ./...

lint: ## Vet Go code and typecheck the frontend
	go vet ./...
	cd web && npm run typecheck

# The one architectural rule, enforced (D-032). srs carries the product's value
# and must stay trivially testable; if it reaches for the database, the design
# went wrong.
#
# It used to guard internal/card too. D-055 deleted that package along with the
# markdown parser — narrowed rather than dropped, because the rule is the
# reason the scheduler is still testable without a database.
#
# This check itself shipped broken: the pattern was "konku/internal/" while the
# module is github.com/Katzelabs/Konku/internal/, and grep is case-sensitive.
# It reported "srs/ is pure" for a file that imported internal/store outright.
# So the rule is now enforced twice (hard rule 9), because the mechanism that
# was supposed to be the enforcement was itself a hope:
#
#   1. `go list -deps` — authoritative and TRANSITIVE. It resolves imports the
#      way the compiler does, so it cannot be fooled by an alias, a rename or
#      a reach through some third package.
#   2. grep over the source — weaker, but it sees *_test.go, which -deps does
#      not. A test that needs the database means srs stopped being trivially
#      testable, which is the actual property being protected.
#
# MODULE is read from go.mod rather than written out, so a module rename
# cannot silently switch the check off again.
MODULE := $(shell go list -m)

check-pure: ## Assert srs/ imports nothing from internal/
	@deps=$$(go list -deps ./internal/srs) \
		|| { echo "check-pure: go list failed — cannot prove srs is pure"; exit 1; }; \
	bad=$$(printf '%s\n' "$$deps" \
		| grep "^$(MODULE)/internal/" \
		| grep -v "^$(MODULE)/internal/srs$$" || true); \
	if [ -n "$$bad" ]; then \
		echo "IMPURE: internal/srs depends on:"; \
		printf '%s\n' "$$bad" | sed 's/^/  /'; \
		exit 1; \
	fi
	@hits=$$(grep -rn "$(MODULE)/internal/" internal/srs --include="*.go" || true); \
	if [ -n "$$hits" ]; then \
		echo "IMPURE: internal/srs sources reference internal/:"; \
		echo "$$hits" | sed 's/^/  /'; \
		exit 1; \
	fi
	@echo "srs/ is pure"

# sqlc-generated code must match the SQL it came from, or the two drift and
# the mismatch only shows up at runtime.
sqlc-diff: ## Fail if generated code is stale
	@if command -v sqlc >/dev/null 2>&1; then \
		sqlc diff && echo "sqlc generated code is current"; \
	else \
		echo "sqlc not installed (go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest); skipping drift check"; \
	fi

check: lint test check-pure sqlc-diff ## All checks

migrate-up: ## Apply migrations
	goose -dir migrations postgres "$$DATABASE_URL" up

migrate-down: ## Roll back the last migration
	goose -dir migrations postgres "$$DATABASE_URL" down

# Deploys are from an image built by CI and pinned by digest, never from
# `docker build` on the box (D-061). This is how that image is checked before
# it is trusted: pull it by digest, run it against the dev database, and
# confirm it migrates and serves.
#
#   make release-verify                          build and check a local image
#   make release-verify REF=ghcr.io/...@sha256:  check a published one
#
release-verify: ## Run a release image by digest against the dev database
	@./scripts/verify-release.sh

clean: ## Remove build output
	rm -rf bin internal/web/dist/* web/node_modules
	touch internal/web/dist/.gitkeep

# Tests connect as konku_app, NOT as the owner. This is not a detail: FORCE
# ROW LEVEL SECURITY does not apply to a superuser, and `konku` is the
# Postgres image's bootstrap superuser. Run the suite as `konku` and every
# tenancy test passes while proving nothing at all (D-059). The harness
# refuses to run as a BYPASSRLS role for that reason.
test-integration: ## Run integration tests against the dev Postgres
	TEST_DATABASE_URL="$(DATABASE_URL)" \
	TEST_MIGRATION_DATABASE_URL="$(MIGRATION_DATABASE_URL)" \
	go test ./internal/store/ ./internal/api/ -v

# Separate from test-integration because it needs a different service. The mail
# tests skip without MAILPIT_API_URL rather than failing, so `make test` stays
# green on a machine with no catcher running — which is why both variables are
# unexported above and set here, on the one command line that wants them.
test-mail: mail-up ## Run the mail tests against the dev SMTP catcher
	MAILPIT_API_URL="$(MAILPIT_API_URL)" \
	MAILPIT_SMTP_URL="$(MAILPIT_SMTP_URL)" \
	go test ./internal/mail/ -v

sqlc: ## Regenerate type-safe Go from SQL
	sqlc generate
