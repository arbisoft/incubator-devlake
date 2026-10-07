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

package projectlifecycle

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	coremodels "github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/plugin"
	otelimpl "github.com/apache/incubator-devlake/plugins/claude_otel/impl"
	otelmodels "github.com/apache/incubator-devlake/plugins/claude_otel/models"
	otelservice "github.com/apache/incubator-devlake/plugins/claude_otel/service"
	"github.com/apache/incubator-devlake/test/helper"
	"github.com/stretchr/testify/require"
)

const (
	serverEndpoint = "http://localhost:8089"
	holdTimeout    = 10 * time.Second
	blockedWindow  = 750 * time.Millisecond
)

// gatePlugin parks a project hook on its lock-holding transaction until the test releases it.
type gatePlugin struct {
	mu      sync.Mutex
	armed   string
	entered chan struct{}
	release chan struct{}
}

func (g *gatePlugin) Description() string { return "holds project hooks open for lock tests" }
func (g *gatePlugin) RootPkgPath() string { return "plugins/test_project_gate" }
func (g *gatePlugin) Name() string        { return "test_project_gate" }

func (g *gatePlugin) arm(projectName string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.armed = projectName
	g.entered = make(chan struct{})
	g.release = make(chan struct{})
}

func (g *gatePlugin) hold(projectName string) {
	g.mu.Lock()
	if g.armed != projectName {
		g.mu.Unlock()
		return
	}
	entered, release := g.entered, g.release
	g.armed = ""
	g.mu.Unlock()
	close(entered)
	<-release
}

func (g *gatePlugin) BeforeRenameProject(_ dal.Transaction, oldName string, _ string) errors.Error {
	g.hold(oldName)
	return nil
}

func (g *gatePlugin) BeforeDeleteProject(_ dal.Transaction, projectName string) errors.Error {
	g.hold(projectName)
	return nil
}

type fixture struct {
	t    *testing.T
	db   dal.Dal
	gate *gatePlugin
	seq  *atomic.Int64
}

func (f *fixture) at(t *testing.T) *fixture {
	return &fixture{t: t, db: f.db, gate: f.gate, seq: f.seq}
}

func newFixture(t *testing.T) *fixture {
	gate := &gatePlugin{}
	client := helper.StartDevLakeServer(t, []plugin.PluginMeta{otelimpl.ClaudeOtel{}, gate})
	return &fixture{t: t, db: client.GetDal(), gate: gate, seq: &atomic.Int64{}}
}

func (f *fixture) name(prefix string) string {
	return fmt.Sprintf("e2e-%s-%d", prefix, f.seq.Add(1))
}

func (f *fixture) request(method string, path string, body any) (int, string) {
	f.t.Helper()
	var payload bytes.Buffer
	if body != nil {
		require.NoError(f.t, json.NewEncoder(&payload).Encode(body))
	}
	req, err := http.NewRequest(method, serverEndpoint+path, &payload)
	require.NoError(f.t, err)
	req.Header.Set("Content-Type", "application/json")
	res, err := (&http.Client{Timeout: holdTimeout * 3}).Do(req)
	require.NoError(f.t, err)
	defer res.Body.Close()
	var out bytes.Buffer
	_, _ = out.ReadFrom(res.Body)
	return res.StatusCode, out.String()
}

func (f *fixture) createProject(name string) {
	f.t.Helper()
	status, body := f.request(http.MethodPost, "/projects", map[string]any{"name": name, "enable": true})
	require.Equal(f.t, http.StatusCreated, status, body)
}

func (f *fixture) createConnection(projectNames ...string) uint64 {
	f.t.Helper()
	connection := &otelmodels.OtelConnection{
		Name:     f.name("otel"),
		TeamName: "Team",
		TeamSlug: f.name("team"),
		Status:   otelmodels.OtelConnectionStatusActive,
	}
	require.NoError(f.t, f.db.Create(connection))
	for _, projectName := range projectNames {
		require.NoError(f.t, f.db.Create(&otelmodels.OtelConnectionProject{ConnectionId: connection.ID, ProjectName: projectName}))
	}
	f.t.Cleanup(func() {
		_ = f.db.Delete(&otelmodels.OtelConnectionProject{}, dal.Where("connection_id = ?", connection.ID))
		_ = f.db.Delete(connection)
	})
	return connection.ID
}

func (f *fixture) placements(connectionID uint64) []string {
	f.t.Helper()
	rows := make([]*otelmodels.OtelConnectionProject, 0)
	require.NoError(f.t, f.db.All(&rows, dal.Where("connection_id = ?", connectionID), dal.Orderby("project_name ASC")))
	names := make([]string, 0, len(rows))
	for _, row := range rows {
		names = append(names, row.ProjectName)
	}
	return names
}

func (f *fixture) projectExists(name string) bool {
	f.t.Helper()
	count, err := f.db.Count(dal.From(&coremodels.Project{}), dal.Where("name = ?", name))
	require.NoError(f.t, err)
	return count > 0
}

func (f *fixture) countOrphanPlacements() int64 {
	f.t.Helper()
	count, err := f.db.Count(
		dal.From(&otelmodels.OtelConnectionProject{}),
		dal.Where("project_name NOT IN (SELECT name FROM projects)"),
	)
	require.NoError(f.t, err)
	return count
}

type httpResult struct {
	status int
	body   string
}

func (f *fixture) async(method string, path string, body any) <-chan httpResult {
	out := make(chan httpResult, 1)
	go func() {
		defer close(out)
		var payload bytes.Buffer
		if body != nil {
			_ = json.NewEncoder(&payload).Encode(body)
		}
		req, err := http.NewRequest(method, serverEndpoint+path, &payload)
		if err != nil {
			out <- httpResult{status: -1, body: err.Error()}
			return
		}
		req.Header.Set("Content-Type", "application/json")
		res, err := (&http.Client{Timeout: holdTimeout * 3}).Do(req)
		if err != nil {
			out <- httpResult{status: -1, body: err.Error()}
			return
		}
		defer res.Body.Close()
		var buf bytes.Buffer
		_, _ = buf.ReadFrom(res.Body)
		out <- httpResult{status: res.StatusCode, body: buf.String()}
	}()
	return out
}

func awaitSignal(t *testing.T, signal <-chan struct{}, what string) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(holdTimeout):
		t.Fatalf("timed out waiting for %s", what)
	}
}

type editResult struct {
	err errors.Error
}

func replacePlacementsAsync(connectionID uint64, projectNames ...string) <-chan editResult {
	out := make(chan editResult, 1)
	go func() {
		defer close(out)
		_, err := otelservice.ReplaceOtelConnectionProjects(connectionID, projectNames)
		out <- editResult{err: err}
	}()
	return out
}

func requireBlocked[T any](t *testing.T, result <-chan T, what string) {
	t.Helper()
	select {
	case <-result:
		t.Fatalf("%s finished while the project row lock was held", what)
	case <-time.After(blockedWindow):
	}
}

func awaitResult[T any](t *testing.T, result <-chan T, what string) T {
	t.Helper()
	select {
	case value := <-result:
		return value
	case <-time.After(holdTimeout):
		t.Fatalf("timed out waiting for %s", what)
		panic("unreachable")
	}
}

func TestProjectLifecycleWithOtelPlacements(t *testing.T) {
	f := newFixture(t)

	t.Run("rename moves every placement of the old name and no other", func(t *testing.T) {
		f := f.at(t)
		oldName, newName, otherName := f.name("old"), f.name("new"), f.name("other")
		f.createProject(oldName)
		f.createProject(otherName)
		first := f.createConnection(oldName, otherName)
		second := f.createConnection(oldName)
		third := f.createConnection(otherName)

		status, body := f.request(http.MethodPatch, "/projects/"+oldName, map[string]any{"name": newName})
		require.Equal(t, http.StatusCreated, status, body)

		require.Equal(t, []string{newName, otherName}, f.placements(first))
		require.Equal(t, []string{newName}, f.placements(second))
		require.Equal(t, []string{otherName}, f.placements(third))
		require.False(t, f.projectExists(oldName))
		require.True(t, f.projectExists(newName))
	})

	t.Run("a rename that fails after the hook rolls the placements back", func(t *testing.T) {
		f := f.at(t)
		oldName, takenName := f.name("old"), f.name("taken")
		f.createProject(oldName)
		f.createProject(takenName)
		connection := f.createConnection(oldName)

		status, _ := f.request(http.MethodPatch, "/projects/"+oldName, map[string]any{"name": takenName})

		require.NotEqual(t, http.StatusOK, status)
		require.Equal(t, []string{oldName}, f.placements(connection))
		require.True(t, f.projectExists(oldName))
		require.Zero(t, f.countOrphanPlacements())
	})

	t.Run("a placement edit waits for a rename and then rejects the old name", func(t *testing.T) {
		f := f.at(t)
		oldName, newName := f.name("old"), f.name("new")
		f.createProject(oldName)
		connection := f.createConnection(oldName)

		f.gate.arm(oldName)
		entered, release := f.gate.entered, f.gate.release
		rename := f.async(http.MethodPatch, "/projects/"+oldName, map[string]any{"name": newName})
		awaitSignal(t, entered, "the rename hook")

		edit := replacePlacementsAsync(connection, oldName)
		requireBlocked(t, edit, "the placement edit")
		close(release)

		renamed := awaitResult(t, rename, "the rename")
		require.Equal(t, http.StatusCreated, renamed.status, renamed.body)
		require.Error(t, awaitResult(t, edit, "the placement edit").err)
		require.Equal(t, []string{newName}, f.placements(connection))
		require.Zero(t, f.countOrphanPlacements())
	})

	t.Run("a placement edit waits for a delete and then rejects the deleted name", func(t *testing.T) {
		f := f.at(t)
		doomed, keeper := f.name("doomed"), f.name("keeper")
		f.createProject(doomed)
		f.createProject(keeper)
		connection := f.createConnection(doomed, keeper)

		f.gate.arm(doomed)
		entered, release := f.gate.entered, f.gate.release
		deletion := f.async(http.MethodDelete, "/projects/"+doomed, nil)
		awaitSignal(t, entered, "the delete hook")

		edit := replacePlacementsAsync(connection, doomed, keeper)
		requireBlocked(t, edit, "the placement edit")
		close(release)

		deleted := awaitResult(t, deletion, "the delete")
		require.Equal(t, http.StatusOK, deleted.status, deleted.body)
		require.Error(t, awaitResult(t, edit, "the placement edit").err)
		require.Equal(t, []string{keeper}, f.placements(connection))
		require.Zero(t, f.countOrphanPlacements())
	})

	t.Run("renames racing placement edits never orphan a placement", func(t *testing.T) {
		f := f.at(t)
		const rounds = 25
		first, second := f.name("race-a"), f.name("race-b")
		f.createProject(first)
		connection := f.createConnection(first)

		var wg sync.WaitGroup
		var serverErrors, renames atomic.Int64
		wg.Add(2)
		go func() {
			defer wg.Done()
			current, next := first, second
			for i := 0; i < rounds; i++ {
				status, _ := f.request(http.MethodPatch, "/projects/"+current, map[string]any{"name": next})
				if status >= http.StatusInternalServerError {
					serverErrors.Add(1)
				}
				if status == http.StatusCreated {
					renames.Add(1)
					current, next = next, current
				}
			}
		}()
		go func() {
			defer wg.Done()
			for i := 0; i < rounds*2; i++ {
				_, err := otelservice.ReplaceOtelConnectionProjects(connection, []string{first})
				if err == nil {
					continue
				}
				_, err = otelservice.ReplaceOtelConnectionProjects(connection, []string{second})
				_ = err
			}
		}()
		wg.Wait()

		require.Zero(t, serverErrors.Load())
		require.NotZero(t, renames.Load())
		require.Zero(t, f.countOrphanPlacements())
	})
}
