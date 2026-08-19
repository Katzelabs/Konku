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

FROM --platform=$BUILDPLATFORM node:26-alpine AS web
WORKDIR /src
COPY web/package*.json ./web/
RUN cd web && npm ci
COPY web ./web
# Vite writes into ../internal/web/dist, so that path must exist in this stage.
RUN mkdir -p internal/web && cd web && npm run build

FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS build
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
