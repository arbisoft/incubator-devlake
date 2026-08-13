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
	"sync"
	"time"
)

const (
	defaultAddress       = ":9199"
	defaultDockerSocket  = "/var/run/docker.sock"
	defaultContainerName = "otel-collector"
	defaultHealthURL     = "http://otel-collector:13133/healthz"
	defaultTimeout       = 45 * time.Second
	defaultCooldown      = 30 * time.Second
)

type config struct {
	address          string
	token            string
	dockerSocket     string
	containerName    string
	healthURL        string
	timeout          time.Duration
	cooldown         time.Duration
	dockerHTTPClient *http.Client
	restartState     *restartState
}

type restartState struct {
	mu            sync.Mutex
	inProgress    bool
	lastSucceeded time.Time
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
	cfg := config{
		address:       firstNonEmpty(os.Getenv("OTEL_RESTART_HELPER_ADDRESS"), defaultAddress),
		token:         os.Getenv("OTEL_RESTART_HELPER_TOKEN"),
		dockerSocket:  firstNonEmpty(os.Getenv("OTEL_RESTART_DOCKER_SOCKET"), defaultDockerSocket),
		containerName: firstNonEmpty(os.Getenv("OTEL_RESTART_CONTAINER"), defaultContainerName),
		healthURL:     firstNonEmpty(os.Getenv("OTEL_COLLECTOR_HEALTH_URL"), defaultHealthURL),
		timeout:       durationFromEnv("OTEL_RESTART_TIMEOUT_SECONDS", defaultTimeout),
		cooldown:      durationFromEnv("OTEL_RESTART_COOLDOWN_SECONDS", defaultCooldown),
		restartState:  &restartState{},
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
	if retryAfter, inProgress := cfg.beginRestart(); inProgress {
		http.Error(w, "collector restart already in progress", http.StatusConflict)
		return
	} else if retryAfter > 0 {
		w.Header().Set("Retry-After", fmt.Sprintf("%d", int(retryAfter.Seconds())+1))
		http.Error(w, "collector restart is cooling down", http.StatusTooManyRequests)
		return
	}

	succeeded := false
	defer func() { cfg.finishRestart(succeeded) }()

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
	succeeded = true

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ready"}`))
}

func (cfg config) beginRestart() (time.Duration, bool) {
	cfg.restartState.mu.Lock()
	defer cfg.restartState.mu.Unlock()

	if cfg.restartState.inProgress {
		return 0, true
	}
	// Reject overlapping or rapid successful restarts to avoid collector restart loops.
	if !cfg.restartState.lastSucceeded.IsZero() {
		if remaining := cfg.cooldown - time.Since(cfg.restartState.lastSucceeded); remaining > 0 {
			return remaining, false
		}
	}
	cfg.restartState.inProgress = true
	return 0, false
}

func (cfg config) finishRestart(succeeded bool) {
	cfg.restartState.mu.Lock()
	defer cfg.restartState.mu.Unlock()

	cfg.restartState.inProgress = false
	if succeeded {
		cfg.restartState.lastSucceeded = time.Now()
	}
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

func durationFromEnv(name string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	if parsed, err := time.ParseDuration(raw); err == nil && parsed >= 0 {
		return parsed
	}
	if parsed, err := time.ParseDuration(raw + "s"); err == nil && parsed >= 0 {
		return parsed
	}
	log.Fatalf("invalid %s %q: use a duration like 30s or a whole number of seconds", name, raw)
	return fallback
}
