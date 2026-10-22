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

package e2e

import (
	"sort"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/helpers/e2ehelper"
	"github.com/apache/incubator-devlake/plugins/claude_otel/impl"
	otelmodels "github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/apache/incubator-devlake/server/services"
)

var initOnce sync.Once

func seed(t *testing.T) {
	tester := e2ehelper.NewDataFlowTester(t, "claude_otel", impl.ClaudeOtel{})
	initOnce.Do(services.InitResources)
	for _, table := range []dal.Tabler{
		&models.Project{}, &models.ProjectMetricSetting{}, &models.Blueprint{}, &models.BlueprintConnection{},
		&models.BlueprintScope{}, &models.BlueprintLabel{}, &models.Pipeline{}, &models.DbPipelineLabel{},
		&models.Task{}, &otelmodels.OtelConnectionProject{},
	} {
		tester.FlushTabler(table)
	}
	create := func(rows ...interface{}) {
		for _, row := range rows {
			require.NoError(t, tester.Dal.Create(row))
		}
	}
	project := func(name string) *models.Project {
		return &models.Project{BaseProject: models.BaseProject{Name: name}}
	}
	blueprint := func(id uint64, projectName, cron string, manual bool) *models.Blueprint {
		return &models.Blueprint{
			Model: common.Model{ID: id}, Name: projectName + "-bp", ProjectName: projectName,
			Mode: "NORMAL", Enable: true, CronConfig: cron, IsManual: manual,
		}
	}
	pipeline := func(id, blueprintId uint64, status string) *models.Pipeline {
		return &models.Pipeline{Model: common.Model{ID: id}, Name: "p", BlueprintId: blueprintId, Status: status}
	}
	connection := func(blueprintId uint64, plugin string, id uint64) *models.BlueprintConnection {
		return &models.BlueprintConnection{BlueprintId: blueprintId, PluginName: plugin, ConnectionId: id}
	}
	create(
		project("A"), project("B"), project("C"), project("D"),
		blueprint(1, "A", "0 0 * * *", false), connection(1, "github", 1),
		pipeline(1, 1, models.TASK_FAILED), pipeline(2, 1, models.TASK_COMPLETED),
		blueprint(2, "B", "0 0 * * *", true), connection(2, "gitlab", 2),
		pipeline(3, 2, models.TASK_FAILED),
		blueprint(3, "C", "5 4 * * *", false),
		&otelmodels.OtelConnectionProject{ConnectionId: 7, ProjectName: "C"},
		blueprint(4, "D", "0 0 * * 1", false), connection(4, "github", 1),
		pipeline(4, 4, models.TASK_FAILED),
		blueprint(5, "D", "0 0 1 * *", false),
		pipeline(5, 5, models.TASK_COMPLETED),
	)
}

func projectNames(t *testing.T, query *services.ProjectQuery) ([]string, int64) {
	projects, count, err := services.GetProjects(query)
	require.NoError(t, err)
	names := make([]string, 0, len(projects))
	for _, p := range projects {
		names = append(names, p.Name)
	}
	sort.Strings(names)
	return names, count
}

func blueprintIds(t *testing.T, query *services.BlueprintQuery) []uint64 {
	blueprints, _, err := services.GetBlueprints(query, false)
	require.NoError(t, err)
	ids := make([]uint64, 0, len(blueprints))
	for _, bp := range blueprints {
		ids = append(ids, bp.ID)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}

func TestProjectFilters(t *testing.T) {
	seed(t)
	cases := []struct {
		name  string
		query services.ProjectQuery
		want  []string
	}{
		{"github:1 uses the project blueprint, so D matches through its first blueprint", services.ProjectQuery{Connection: []string{"github:1"}}, []string{"A", "D"}},
		{"gitlab:2", services.ProjectQuery{Connection: []string{"gitlab:2"}}, []string{"B"}},
		{"claude_otel:7", services.ProjectQuery{Connection: []string{"claude_otel:7"}}, []string{"C"}},
		{"github:1 or claude_otel:7", services.ProjectQuery{Connection: []string{"github:1", "claude_otel:7"}}, []string{"A", "C", "D"}},
		{"unknown connection", services.ProjectQuery{Connection: []string{"github:99"}}, []string{}},
		{"failed is the latest pipeline of the first blueprint only", services.ProjectQuery{LastRunStatus: []string{"TASK_FAILED"}}, []string{"B", "D"}},
		{"completed excludes D whose newer blueprint is not the shown one", services.ProjectQuery{LastRunStatus: []string{"TASK_COMPLETED"}}, []string{"A"}},
		{"project without pipelines never matches a status", services.ProjectQuery{LastRunStatus: []string{"TASK_COMPLETED", "TASK_FAILED", "TASK_RUNNING"}}, []string{"A", "B", "D"}},
		{"completed and gitlab:2", services.ProjectQuery{LastRunStatus: []string{"TASK_COMPLETED"}, Connection: []string{"gitlab:2"}}, []string{}},
		{"failed and github:1", services.ProjectQuery{LastRunStatus: []string{"TASK_FAILED"}, Connection: []string{"github:1"}}, []string{"D"}},
		{"no filter", services.ProjectQuery{}, []string{"A", "B", "C", "D"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			names, count := projectNames(t, &tc.query)
			require.Equal(t, tc.want, names)
			require.Equal(t, int64(len(tc.want)), count)
		})
	}
}

func TestBlueprintFilters(t *testing.T) {
	seed(t)
	cases := []struct {
		name  string
		query services.BlueprintQuery
		want  []uint64
	}{
		{"github:1", services.BlueprintQuery{Connection: []string{"github:1"}}, []uint64{1, 4}},
		{"claude_otel matches nothing", services.BlueprintQuery{Connection: []string{"claude_otel:7"}}, []uint64{}},
		{"projectName B", services.BlueprintQuery{ProjectName: []string{"B"}}, []uint64{2}},
		{"projectName B and D", services.BlueprintQuery{ProjectName: []string{"B", "D"}}, []uint64{2, 4, 5}},
		{"daily or manual", services.BlueprintQuery{Type: []string{"DAILY", "MANUAL"}}, []uint64{1, 2}},
		{"custom", services.BlueprintQuery{Type: []string{"CUSTOM"}}, []uint64{3}},
		{"ALL among types", services.BlueprintQuery{Type: []string{"DAILY", "ALL"}}, []uint64{1, 2, 3, 4, 5}},
		{"types and project", services.BlueprintQuery{Type: []string{"WEEKLY", "MONTHLY"}, ProjectName: []string{"D"}}, []uint64{4, 5}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, blueprintIds(t, &tc.query))
		})
	}
}
