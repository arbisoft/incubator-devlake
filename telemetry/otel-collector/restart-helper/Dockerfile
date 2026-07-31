FROM golang:1.22-alpine AS builder

WORKDIR /src
COPY go.mod main.go ./
RUN go build -o /out/otel-restart-helper .

FROM alpine:3.20

COPY --from=builder /out/otel-restart-helper /usr/local/bin/otel-restart-helper
EXPOSE 9199
ENTRYPOINT ["/usr/local/bin/otel-restart-helper"]
