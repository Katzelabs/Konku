# Multi-stage: Node builds the frontend, Go builds the binary, and the final
# image carries neither toolchain. There is no Node process in production
# (D-041) — Node is a build-time dependency only.
#
# Both build stages are pinned to $BUILDPLATFORM and *cross-compile* rather
# than run under emulation. A multi-arch build matters because the operator's
# machine is arm64 and the VPS is amd64, and the release is verified by running
# it locally before it is deployed (06 P9). Emulating a Node install and a Go
# build under QEMU turns that into a ten-minute job for no benefit: the
# frontend bundle is architecture-independent, and CGO_ENABLED=0 makes the Go
# binary a straight GOARCH swap.

# Node's major must match web/.nvmrc, which is what CI installs. They are two
# hardcoded numbers with nothing linking them, and they were 26 here and 24
# there — so the bundle that shipped was built by a Node the test jobs never
# ran. `make check-toolchains` is what notices now.
FROM --platform=$BUILDPLATFORM node:26-alpine AS web
WORKDIR /src
COPY web/package*.json ./web/
RUN cd web && npm ci
COPY web ./web
# Vite writes into ../internal/web/dist, so that path must exist in this stage.
RUN mkdir -p internal/web && cd web && npm run build

# Go's minor must match the `go` directive in go.mod, which is what CI reads —
# "so the toolchain cannot drift from the module" is already the rule, and this
# is the half of it that lives outside CI. It was 1.26 here against go 1.25.13
# in go.mod, so tests ran on 1.25.13 and the shipped binary was compiled by
# 1.26.6. Well-defined under Go's compatibility promise, and still a binary
# nothing tested. Bump this when go.mod moves, not before.
FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Overwrite the committed .gitkeep placeholder with the real build output.
COPY --from=web /src/internal/web/dist ./internal/web/dist

# Supplied by buildx for the target being produced, not the host doing the
# producing. Without them a multi-arch build silently emits the builder's
# architecture for every platform, and the amd64 tag would not run on the VPS.
ARG TARGETOS
ARG TARGETARCH

# Stamped into the binary so a running container can say which release it is —
# the same value tags the Sentry events (D-062).
ARG VERSION=dev

RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -ldflags="-s -w -X main.version=${VERSION}" -o /konku ./cmd/konku

FROM alpine:3.24
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -u 10001 konku
USER konku
COPY --from=build /konku /usr/local/bin/konku
EXPOSE 8080
ENTRYPOINT ["konku"]
