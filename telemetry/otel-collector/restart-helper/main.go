package main

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	defaultAddress       = ":9199"
	defaultDockerSocket  = "/var/run/docker.sock"
	defaultContainerName = "otel-collector"
	defaultHealthURL     = "http://otel-collector:13133/healthz"
	defaultTimeout       = 45 * time.Second
)

type config struct {
	address          string
	token            string
	dockerSocket     string
	containerName    string
	healthURL        string
	timeout          time.Duration
	dockerHTTPClient *http.Client
}

func main() {
	cfg := loadConfig()
	if cfg.token == "" {
		log.Fatal("OTEL_RESTART_HELPER_TOKEN is required")
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/apply", cfg.applyHandler)

	log.Printf("otel restart helper listening on %s for container %s", cfg.address, cfg.containerName)
	if err := http.ListenAndServe(cfg.address, mux); err != nil {
		log.Fatal(err)
	}
}

func loadConfig() config {
	timeout := defaultTimeout
	if raw := strings.TrimSpace(os.Getenv("OTEL_RESTART_TIMEOUT_SECONDS")); raw != "" {
		if parsed, err := time.ParseDuration(raw); err == nil {
			timeout = parsed
		} else if parsed, err := time.ParseDuration(raw + "s"); err == nil {
			timeout = parsed
		} else {
			log.Fatalf("invalid OTEL_RESTART_TIMEOUT_SECONDS %q: use a duration like 45s or a whole number of seconds", raw)
		}
	}
	cfg := config{
		address:       firstNonEmpty(os.Getenv("OTEL_RESTART_HELPER_ADDRESS"), defaultAddress),
		token:         os.Getenv("OTEL_RESTART_HELPER_TOKEN"),
		dockerSocket:  firstNonEmpty(os.Getenv("OTEL_RESTART_DOCKER_SOCKET"), defaultDockerSocket),
		containerName: firstNonEmpty(os.Getenv("OTEL_RESTART_CONTAINER"), defaultContainerName),
		healthURL:     firstNonEmpty(os.Getenv("OTEL_COLLECTOR_HEALTH_URL"), defaultHealthURL),
		timeout:       timeout,
	}
	cfg.dockerHTTPClient = newDockerClient(cfg.dockerSocket)
	return cfg
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (cfg config) applyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !cfg.authorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), cfg.timeout)
	defer cancel()

	if err := cfg.restartCollector(ctx); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if err := cfg.waitHealthy(ctx); err != nil {
		http.Error(w, err.Error(), http.StatusGatewayTimeout)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ready"}`))
}

func (cfg config) authorized(r *http.Request) bool {
	if strings.TrimSpace(cfg.token) == "" {
		return false
	}
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	presented := strings.TrimPrefix(auth, "Bearer ")
	return subtle.ConstantTimeCompare([]byte(presented), []byte(cfg.token)) == 1
}

func (cfg config) restartCollector(ctx context.Context) error {
	path := fmt.Sprintf("/containers/%s/restart?t=10", url.PathEscape(cfg.containerName))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://docker"+path, nil)
	if err != nil {
		return err
	}
	res, err := cfg.dockerHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("restart request failed: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode >= http.StatusOK && res.StatusCode < http.StatusMultipleChoices {
		return nil
	}
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1024))
	return fmt.Errorf("docker restart failed with status %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
}

func newDockerClient(dockerSocket string) *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, "unix", dockerSocket)
			},
		},
	}
}

func (cfg config) waitHealthy(ctx context.Context) error {
	client := &http.Client{Timeout: 2 * time.Second}
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.healthURL, nil)
		if err != nil {
			return err
		}
		res, err := client.Do(req)
		if err == nil {
			_, _ = io.Copy(io.Discard, res.Body)
			_ = res.Body.Close()
			if res.StatusCode >= http.StatusOK && res.StatusCode < http.StatusMultipleChoices {
				return nil
			}
		}

		select {
		case <-ctx.Done():
			return errors.New("collector did not become healthy before timeout")
		case <-ticker.C:
		}
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
