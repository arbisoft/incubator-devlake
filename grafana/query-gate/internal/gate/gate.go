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
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/grafana/query-gate/internal/config"
	"github.com/apache/incubator-devlake/grafana/query-gate/internal/identity"
	"github.com/apache/incubator-devlake/grafana/query-gate/internal/policy"
	"github.com/apache/incubator-devlake/grafana/query-gate/internal/request"
	gatesync "github.com/apache/incubator-devlake/grafana/query-gate/internal/sync"
	"github.com/apache/incubator-devlake/grafana/query-gate/internal/templates"
)

const (
	maxBodyBytes    = 4 << 20
	maxSQLBytes     = 256 << 10
	maxQueries      = 100
	maxProfileBytes = 1 << 20
	bodyReadTimeout = 30 * time.Second
	readyTimeout    = 5 * time.Second
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
	reasonQueryTooLarge   = "query too large"
	reasonTooManyQueries  = "too many queries"
	reasonBadBody         = "invalid request body"
	reasonAmbiguous       = "ambiguous key"
	reasonScopingKey      = "login and email can only be changed by an administrator"
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
	sem      chan struct{}
	status   func() gatesync.Status
}

// New returns the gate handler.
func New(cfg config.Config, upstream *url.URL, ident *identity.Client, sets func() *templates.Set, status func() gatesync.Status, logger *slog.Logger) http.Handler {
	g := &Gate{cfg: cfg, upstream: upstream, ident: ident, sets: sets, status: status, logger: logger, health: &http.Client{Timeout: readyTimeout}, sem: make(chan struct{}, 4*runtime.GOMAXPROCS(0))}
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
	// always makes decide answer the request in every mode.
	always bool
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
			writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "mode": g.cfg.Mode, "templates": g.sets().Len(), "sync": g.status()})
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
	class := policy.ClassifyRequest(r.Method, r.URL.Path, r.URL.EscapedPath(), g.cfg.RootPath)
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
				writeJSON(w, http.StatusOK, map[string]any{"status": "ready", "sync": g.status()})
				return
			}
		}
	}
	writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "unavailable", "sync": g.status()})
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
		if !id.ServerAdmin {
			r.Header.Set("X-Grafana-Org-Id", strconv.FormatInt(id.OrgID, 10))
		}
		g.proxy.ServeHTTP(w, r)
		return
	}
	if class == policy.AdminOnly {
		g.decide(w, r, &verdict{status: http.StatusForbidden, reason: reasonAdminOnly}, id, nil)
		return
	}
	if class == policy.SelfUpdate {
		g.selfUpdate(w, r, id)
		return
	}
	g.query(w, r, id)
}

// decide logs a rejection, then answers it in enforce mode or forwards the original body in report mode.
func (g *Gate) decide(w http.ResponseWriter, r *http.Request, v *verdict, id identity.Identity, original []byte) {
	if g.cfg.Mode == config.ModeEnforce || v.always {
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

func contentEncodingAllowed(r *http.Request) bool {
	for _, enc := range r.Header.Values("Content-Encoding") {
		if e := strings.TrimSpace(enc); e != "" && !strings.EqualFold(e, "identity") {
			return false
		}
	}
	return true
}

// selfUpdate forwards a non-admin profile update unless it changes the caller's login or email.
func (g *Gate) selfUpdate(w http.ResponseWriter, r *http.Request, id identity.Identity) {
	if !contentEncodingAllowed(r) {
		g.decide(w, r, &verdict{status: http.StatusUnsupportedMediaType, reason: reasonEncoding}, id, nil)
		return
	}
	original, v, ok := g.inspectProfile(w, r, id)
	if !ok {
		return
	}
	if v != nil {
		g.decide(w, r, v, id, original)
		return
	}
	setBody(r, original)
	g.proxy.ServeHTTP(w, r)
}

// inspectProfile reads and checks a profile update while holding a slot; ok is false when the client left.
func (g *Gate) inspectProfile(w http.ResponseWriter, r *http.Request, id identity.Identity) (original []byte, v *verdict, ok bool) {
	release, ok := g.acquire(r)
	if !ok {
		return nil, nil, false
	}
	defer release()
	original, v = g.readBody(w, r, maxProfileBytes)
	if v != nil {
		return nil, v, true
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(original, &fields); err != nil || fields == nil {
		return original, &verdict{status: http.StatusBadRequest, reason: reasonBadBody}, true
	}
	for _, f := range []struct{ key, current string }{{"login", id.Login}, {"email", id.Email}} {
		var values []json.RawMessage
		for k, raw := range fields {
			if strings.EqualFold(k, f.key) {
				values = append(values, raw)
			}
		}
		if len(values) > 1 {
			return original, &verdict{status: http.StatusBadRequest, reason: reasonAmbiguous}, true
		}
		if len(values) == 0 {
			continue
		}
		var val string
		if err := json.Unmarshal(values[0], &val); err != nil {
			return original, &verdict{status: http.StatusBadRequest, reason: reasonBadBody}, true
		}
		if val = strings.TrimSpace(val); val != "" && val != f.current {
			return original, &verdict{status: http.StatusForbidden, reason: reasonScopingKey}, true
		}
	}
	return original, nil, true
}

func (g *Gate) query(w http.ResponseWriter, r *http.Request, id identity.Identity) {
	if r.Method != http.MethodPost {
		g.decide(w, r, &verdict{status: http.StatusForbidden, reason: reasonMethod}, id, nil)
		return
	}
	if !contentEncodingAllowed(r) {
		g.decide(w, r, &verdict{status: http.StatusUnsupportedMediaType, reason: reasonEncoding}, id, nil)
		return
	}
	if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type"))), "application/json") {
		g.decide(w, r, &verdict{status: http.StatusUnsupportedMediaType, reason: reasonContentType}, id, nil)
		return
	}
	original, canonical, v, ok := g.inspectQuery(w, r, id)
	if !ok {
		return
	}
	if v != nil {
		g.decide(w, r, v, id, original)
		return
	}
	setBody(r, canonical)
	g.proxy.ServeHTTP(w, r)
}

// acquire takes a checking slot and returns its release, or false when the client left while waiting.
func (g *Gate) acquire(r *http.Request) (func(), bool) {
	select {
	case g.sem <- struct{}{}:
		return func() { <-g.sem }, true
	case <-r.Context().Done():
		return nil, false
	}
}

// readBody reads the request body under the read deadline, returning a verdict when it cannot be read in full.
func (g *Gate) readBody(w http.ResponseWriter, r *http.Request, limit int64) ([]byte, *verdict) {
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Now().Add(bodyReadTimeout))
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, limit))
	_ = rc.SetReadDeadline(time.Time{})
	if err == nil {
		return body, nil
	}
	// A body that could not be read in full cannot be forwarded, so every mode answers it.
	v := &verdict{status: http.StatusBadRequest, reason: reasonBadBody, always: true}
	var tooBig *http.MaxBytesError
	if errors.As(err, &tooBig) {
		v = &verdict{status: http.StatusRequestEntityTooLarge, reason: reasonTooLarge, always: true}
	}
	return nil, v
}

// inspectQuery reads, parses and checks a query body while holding a slot; ok is false when the client left.
func (g *Gate) inspectQuery(w http.ResponseWriter, r *http.Request, id identity.Identity) (original, canonical []byte, v *verdict, ok bool) {
	release, ok := g.acquire(r)
	if !ok {
		return nil, nil, nil, false
	}
	defer release()
	original, v = g.readBody(w, r, maxBodyBytes)
	if v != nil {
		return nil, nil, v, true
	}
	req, canonical, err := request.Parse(original)
	if err != nil {
		reason := reasonBadBody
		if errors.Is(err, request.ErrAmbiguousKey) {
			reason = reasonAmbiguous
		}
		return original, nil, &verdict{status: http.StatusBadRequest, reason: reason}, true
	}
	return original, canonical, g.checkQueries(req, id), true
}

func (g *Gate) checkQueries(req *request.Request, id identity.Identity) *verdict {
	if len(req.Queries) > maxQueries {
		return &verdict{status: http.StatusBadRequest, reason: reasonTooManyQueries, always: true}
	}
	for _, q := range req.Queries {
		if len(q.RawSQL) > maxSQLBytes {
			return &verdict{status: http.StatusRequestEntityTooLarge, reason: reasonQueryTooLarge, refID: q.RefID, sqlHash: hashSQL(q.RawSQL), always: true}
		}
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
