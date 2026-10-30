/*
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements.  See the NOTICE file distributed with
this work for additional information regarding copyright ownership.
The ASF licenses this file to You under the Apache License, Version 2.0
(the "License"); you may not use this file except in compliance with
the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// Package gate is the reverse proxy that checks datasource queries before Grafana runs them.
package gate

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/grafana/query-gate/internal/config"
	"github.com/apache/incubator-devlake/grafana/query-gate/internal/identity"
	"github.com/apache/incubator-devlake/grafana/query-gate/internal/policy"
	"github.com/apache/incubator-devlake/grafana/query-gate/internal/request"
	"github.com/apache/incubator-devlake/grafana/query-gate/internal/templates"
)

const (
	maxBodyBytes = 16 << 20
	readyTimeout = 5 * time.Second
)

// Event names written to the log.
const (
	eventRejected      = "rejected"
	eventWouldReject   = "would_reject"
	eventIdentityError = "identity_error"
)

const (
	reasonUnauthenticated = "unauthenticated"
	reasonAdminOnly       = "path is reserved for administrators"
	reasonMethod          = "method not allowed"
	reasonEncoding        = "content encoding not allowed"
	reasonContentType     = "content type must be application/json"
	reasonTooLarge        = "request body too large"
	reasonBadBody         = "invalid request body"
	reasonAmbiguous       = "ambiguous key"
)

// Gate is the HTTP handler that gates and proxies requests.
type Gate struct {
	cfg      config.Config
	upstream *url.URL
	proxy    *httputil.ReverseProxy
	ident    *identity.Client
	sets     func() *templates.Set
	logger   *slog.Logger
	health   *http.Client
}

// New returns the gate handler.
func New(cfg config.Config, upstream *url.URL, ident *identity.Client, sets func() *templates.Set, logger *slog.Logger) http.Handler {
	g := &Gate{cfg: cfg, upstream: upstream, ident: ident, sets: sets, logger: logger, health: &http.Client{Timeout: readyTimeout}}
	g.proxy = &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(upstream)
			pr.Out.Host = pr.In.Host
			pr.Out.Header["X-Forwarded-For"] = pr.In.Header["X-Forwarded-For"]
			pr.SetXForwarded()
			for _, h := range []string{"X-Forwarded-Proto", "X-Forwarded-Host", "Forwarded"} {
				if v := pr.In.Header.Values(h); len(v) > 0 {
					pr.Out.Header[h] = v
				}
			}
		},
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			logger.Error("upstream error", "path", r.URL.Path, "error", err.Error())
			writeJSON(w, http.StatusBadGateway, map[string]string{"message": "Upstream unavailable"})
		},
	}
	return g
}

// verdict describes why a request is rejected.
type verdict struct {
	status   int
	reason   string
	message  map[string]string
	location string
	refID    string
	sqlHash  string
}

func (v *verdict) body() map[string]string {
	if v.message != nil {
		return v.message
	}
	return map[string]string{"message": "Blocked by the query gate: " + v.reason, "messageId": "querygate.blocked"}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	data, _ := json.Marshal(v)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(data)
}

func (g *Gate) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		switch r.URL.Path {
		case "/gate/healthz":
			writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "mode": g.cfg.Mode, "templates": g.sets().Len()})
			return
		case "/gate/readyz":
			g.ready(w, r)
			return
		}
	}
	if g.cfg.Mode == config.ModeOff {
		g.proxy.ServeHTTP(w, r)
		return
	}
	class := policy.ClassifyRequest(r.Method, r.URL.Path, g.cfg.RootPath)
	if class == policy.Pass {
		g.proxy.ServeHTTP(w, r)
		return
	}
	g.gated(w, r, class)
}

func (g *Gate) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), readyTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, g.upstream.Scheme+"://"+g.upstream.Host+g.cfg.RootPath+"/api/health", nil)
	if err == nil {
		var resp *http.Response
		if resp, err = g.health.Do(req); err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
				return
			}
		}
	}
	writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
}

func (g *Gate) gated(w http.ResponseWriter, r *http.Request, class policy.Class) {
	cookie := strings.Join(r.Header.Values("Cookie"), "; ")
	authorization := r.Header.Get("Authorization")
	if cookie == "" && authorization == "" {
		g.decide(w, r, &verdict{status: http.StatusUnauthorized, reason: reasonUnauthenticated, message: map[string]string{"message": "Unauthorized"}}, identity.Identity{}, nil)
		return
	}
	id, status, err := g.ident.Lookup(r.Context(), cookie, authorization)
	if status != nil {
		if status.ContentType != "" {
			w.Header().Set("Content-Type", status.ContentType)
		}
		w.WriteHeader(status.Code)
		_, _ = w.Write(status.Body)
		return
	}
	if err != nil {
		g.logEvent(eventIdentityError, r, identity.Identity{}, &verdict{reason: err.Error()})
		if g.cfg.Mode == config.ModeEnforce {
			writeJSON(w, http.StatusBadGateway, map[string]string{"message": "Query gate could not verify the session"})
			return
		}
		g.proxy.ServeHTTP(w, r)
		return
	}
	if id.AdminFor(r) {
		g.proxy.ServeHTTP(w, r)
		return
	}
	if class == policy.AdminOnly {
		g.decide(w, r, &verdict{status: http.StatusForbidden, reason: reasonAdminOnly}, id, nil)
		return
	}
	g.query(w, r, id)
}

// decide logs a rejection, then answers it in enforce mode or forwards the original body in report mode.
func (g *Gate) decide(w http.ResponseWriter, r *http.Request, v *verdict, id identity.Identity, original []byte) {
	if g.cfg.Mode == config.ModeEnforce {
		g.logEvent(eventRejected, r, id, v)
		writeJSON(w, v.status, v.body())
		return
	}
	g.logEvent(eventWouldReject, r, id, v)
	if original != nil {
		setBody(r, original)
	}
	g.proxy.ServeHTTP(w, r)
}

func setBody(r *http.Request, body []byte) {
	r.Body = io.NopCloser(bytes.NewReader(body))
	r.ContentLength = int64(len(body))
	r.TransferEncoding = nil
	r.Header.Set("Content-Length", strconv.Itoa(len(body)))
}

func (g *Gate) query(w http.ResponseWriter, r *http.Request, id identity.Identity) {
	if r.Method != http.MethodPost {
		g.decide(w, r, &verdict{status: http.StatusForbidden, reason: reasonMethod}, id, nil)
		return
	}
	for _, enc := range r.Header.Values("Content-Encoding") {
		if e := strings.TrimSpace(enc); e != "" && !strings.EqualFold(e, "identity") {
			g.decide(w, r, &verdict{status: http.StatusUnsupportedMediaType, reason: reasonEncoding}, id, nil)
			return
		}
	}
	if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type"))), "application/json") {
		g.decide(w, r, &verdict{status: http.StatusUnsupportedMediaType, reason: reasonContentType}, id, nil)
		return
	}
	original, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		v := &verdict{status: http.StatusBadRequest, reason: reasonBadBody}
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			v = &verdict{status: http.StatusRequestEntityTooLarge, reason: reasonTooLarge}
		}
		// A body that could not be read in full cannot be forwarded, so report mode answers it too.
		g.logEvent(eventRejected, r, id, v)
		writeJSON(w, v.status, v.body())
		return
	}
	req, canonical, err := request.Parse(original)
	if err != nil {
		reason := reasonBadBody
		if errors.Is(err, request.ErrAmbiguousKey) {
			reason = reasonAmbiguous
		}
		g.decide(w, r, &verdict{status: http.StatusBadRequest, reason: reason}, id, original)
		return
	}
	if v := g.checkQueries(req, id); v != nil {
		g.decide(w, r, v, id, original)
		return
	}
	setBody(r, canonical)
	g.proxy.ServeHTTP(w, r)
}

func (g *Gate) checkQueries(req *request.Request, id identity.Identity) *verdict {
	for _, q := range req.Queries {
		needsMatch, reason := request.CheckQuery(q, g.cfg.MySQLUIDs)
		if reason != "" {
			return &verdict{status: http.StatusForbidden, reason: string(reason), refID: q.RefID, sqlHash: hashSQL(q.RawSQL)}
		}
		if !needsMatch {
			continue
		}
		if m := g.sets().Match(q.RawSQL, templates.Caller{Login: id.Login, Email: id.Email}); !m.Accepted {
			return &verdict{status: http.StatusForbidden, reason: string(m.Reason), location: m.Location, refID: q.RefID, sqlHash: hashSQL(q.RawSQL)}
		}
	}
	return nil
}

func hashSQL(sql string) string {
	if sql == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(sql))
	return hex.EncodeToString(sum[:])[:16]
}

func (g *Gate) logEvent(event string, r *http.Request, id identity.Identity, v *verdict) {
	g.logger.Warn("query gate",
		"event", event,
		"mode", string(g.cfg.Mode),
		"reason", v.reason,
		"login", id.Login,
		"admin", id.AdminFor(r),
		"method", r.Method,
		"path", r.URL.Path,
		"location", v.location,
		"ref_id", v.refID,
		"sql_sha256", v.sqlHash,
		"dashboard_uid", r.Header.Get("X-Dashboard-Uid"),
		"panel_id", r.Header.Get("X-Panel-Id"),
	)
}
