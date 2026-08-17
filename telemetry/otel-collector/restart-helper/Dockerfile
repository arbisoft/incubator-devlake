FROM golang:1.22-alpine AS builder

WORKDIR /src
COPY go.mod main.go ./
RUN go build -o /out/otel-restart-helper .

FROM alpine:3.20

# wget is required for HEALTHCHECK. This process MUST remain root: it talks to
# /var/run/docker.sock to restart the collector. Do not add a USER directive.
RUN apk add --no-cache wget
COPY --from=builder /out/otel-restart-helper /usr/local/bin/otel-restart-helper
EXPOSE 9199
# Exec form: no shell, so no `||`. wget already exits non-zero on failure.
HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=5s CMD wget -qO- http://127.0.0.1:9199/health
ENTRYPOINT ["/usr/local/bin/otel-restart-helper"]
