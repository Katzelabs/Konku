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
DATABASE_URL ?= postgres://konku:konku@localhost:5433/konku?sslmode=disable
DEV ?= true

.PHONY: help setup dev dev-api dev-web build test test-integration sqlc lint check check-pure migrate-up migrate-down db-up db-down clean

help:
	@grep -E '^[a-zA-Z-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## Install dependencies
	go mod download
	cd web && npm install

db-up: ## Start the dev Postgres (port 5433)
	docker compose up -d db

db-down: ## Stop the dev Postgres
	docker compose down

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
check-pure: ## Assert srs/ imports nothing from internal/
	@! grep -rn "konku/internal/" internal/srs --include="*.go" \
		|| (echo "IMPURE: srs/ imports internal/" && exit 1)
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

clean: ## Remove build output
	rm -rf bin internal/web/dist/* web/node_modules
	touch internal/web/dist/.gitkeep

test-integration: ## Run integration tests against the dev Postgres
	TEST_DATABASE_URL="postgres://konku:konku@localhost:5433/konku?sslmode=disable" go test ./internal/store/ ./internal/api/ -v

sqlc: ## Regenerate type-safe Go from SQL
	sqlc generate
