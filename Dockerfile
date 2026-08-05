# Multi-stage: Node builds the frontend, Go builds the binary, and the final
# image carries neither toolchain. There is no Node process in production
# (D-041) — Node is a build-time dependency only.

FROM node:24-alpine AS web
WORKDIR /src
COPY web/package*.json ./web/
RUN cd web && npm ci
COPY web ./web
# Vite writes into ../internal/web/dist, so that path must exist in this stage.
RUN mkdir -p internal/web && cd web && npm run build

FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Overwrite the committed .gitkeep placeholder with the real build output.
COPY --from=web /src/internal/web/dist ./internal/web/dist
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /konku ./cmd/konku

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -u 10001 konku
USER konku
COPY --from=build /konku /usr/local/bin/konku
EXPOSE 8080
ENTRYPOINT ["konku"]
