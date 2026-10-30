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

package services

import (
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

const (
	existsConnection = "EXISTS (SELECT 1 FROM _devlake_blueprint_connections fbc WHERE fbc.blueprint_id = " + projectBlueprintID + " AND ("
	otelProjectsIn   = "projects.name IN (SELECT project_name FROM _tool_claude_code_otel_connection_projects WHERE connection_id IN ?)"
)

func TestOtelConnectionProjectTableMatchesPlugin(t *testing.T) {
	assert.Equal(t, models.OtelConnectionProjectTable, otelConnectionProjectTable)
}

func TestGetProjectsFilters(t *testing.T) {
	t.Run("connection filter builds one EXISTS over blueprint connections", func(t *testing.T) {
		captured := useCapturingDal(t)
		_, _, err := GetProjects(&ProjectQuery{Connection: []string{"github:1", "gitlab:2"}})
		assert.NoError(t, err)
		wheres := whereExprs(captured.list)
		if assert.Len(t, wheres, 1) {
			assert.Equal(t, "("+existsConnection+"(fbc.plugin_name = ? AND fbc.connection_id = ?) OR (fbc.plugin_name = ? AND fbc.connection_id = ?)))"+")", wheres[0].Expr)
			assert.Equal(t, []interface{}{"github", uint64(1), "gitlab", uint64(2)}, wheres[0].Params)
		}
	})

	t.Run("connection plugin is split at the last colon", func(t *testing.T) {
		captured := useCapturingDal(t)
		_, _, err := GetProjects(&ProjectQuery{Connection: []string{"a:b:3"}})
		assert.NoError(t, err)
		assert.Equal(t, []interface{}{"a:b", uint64(3)}, whereExprs(captured.list)[0].Params)
	})

	t.Run("claude_otel connection filter queries the otel project table", func(t *testing.T) {
		captured := useCapturingDal(t)
		_, _, err := GetProjects(&ProjectQuery{Connection: []string{"claude_otel:7", "claude_otel:8"}})
		assert.NoError(t, err)
		wheres := whereExprs(captured.list)
		if assert.Len(t, wheres, 1) {
			assert.Equal(t, "("+otelProjectsIn+")", wheres[0].Expr)
			assert.Equal(t, []interface{}{[]uint64{7, 8}}, wheres[0].Params)
		}
	})

	t.Run("mixed connection filters are OR'd", func(t *testing.T) {
		captured := useCapturingDal(t)
		_, _, err := GetProjects(&ProjectQuery{Connection: []string{"github:1", "claude_otel:7"}})
		assert.NoError(t, err)
		wheres := whereExprs(captured.list)
		if assert.Len(t, wheres, 1) {
			assert.Equal(t, "("+existsConnection+"(fbc.plugin_name = ? AND fbc.connection_id = ?))) OR "+otelProjectsIn+")", wheres[0].Expr)
			assert.Equal(t, []interface{}{"github", uint64(1), []uint64{7}}, wheres[0].Params)
		}
	})

	t.Run("missing otel table drops the otel branch", func(t *testing.T) {
		captured := useCapturingDalWithOtelTable(t, false)
		_, _, err := GetProjects(&ProjectQuery{Connection: []string{"github:1", "claude_otel:7"}})
		assert.NoError(t, err)
		wheres := whereExprs(captured.list)
		if assert.Len(t, wheres, 1) {
			assert.NotContains(t, wheres[0].Expr, "_tool_claude_code_otel")
			assert.Equal(t, []interface{}{"github", uint64(1)}, wheres[0].Params)
		}

		captured = useCapturingDalWithOtelTable(t, false)
		_, _, err = GetProjects(&ProjectQuery{Connection: []string{"claude_otel:7"}})
		assert.NoError(t, err)
		wheres = whereExprs(captured.list)
		if assert.Len(t, wheres, 1) {
			assert.Equal(t, "1 = 0", wheres[0].Expr)
		}
	})

	t.Run("invalid connection value is BadInput", func(t *testing.T) {
		for _, value := range []string{"", "github", ":1", "github:", "github:0", "github:-1", "github:abc", "secret-value-x"} {
			captured := useCapturingDal(t)
			_, _, err := GetProjects(&ProjectQuery{Connection: []string{value}})
			if assert.Error(t, err, value) {
				assert.Equal(t, http.StatusBadRequest, err.GetType().GetHttpCode())
				assert.Contains(t, err.Error(), "invalid connection filter")
				assert.False(t, value != "" && strings.Contains(err.Error(), value))
			}
			assert.Nil(t, captured.list)
		}
	})

	t.Run("last run status filters on the latest pipeline of the project blueprint", func(t *testing.T) {
		captured := useCapturingDal(t)
		_, _, err := GetProjects(&ProjectQuery{LastRunStatus: []string{"TASK_FAILED", "TASK_RUNNING"}})
		assert.NoError(t, err)
		wheres := whereExprs(captured.list)
		if assert.Len(t, wheres, 1) {
			assert.Equal(t, "(SELECT lp.status FROM _devlake_pipelines lp WHERE lp.blueprint_id = "+projectBlueprintID+" ORDER BY lp.id DESC LIMIT 1) IN ?", wheres[0].Expr)
			assert.Equal(t, []interface{}{[]string{"TASK_FAILED", "TASK_RUNNING"}}, wheres[0].Params)
		}
	})

	t.Run("invalid last run status is BadInput", func(t *testing.T) {
		captured := useCapturingDal(t)
		_, _, err := GetProjects(&ProjectQuery{LastRunStatus: []string{"TASK_FAILED", "bogus'; DROP"}})
		if assert.Error(t, err) {
			assert.Equal(t, http.StatusBadRequest, err.GetType().GetHttpCode())
			assert.NotContains(t, err.Error(), "DROP")
		}
		assert.Nil(t, captured.list)
	})

	t.Run("count uses the same filters as the page", func(t *testing.T) {
		captured := useCapturingDal(t)
		keyword := "x"
		_, _, err := GetProjects(&ProjectQuery{
			Keyword:       &keyword,
			Connection:    []string{"github:1", "claude_otel:7"},
			LastRunStatus: []string{"TASK_FAILED"},
		})
		assert.NoError(t, err)
		assert.Len(t, whereExprs(captured.list), 3)
		assert.Equal(t, whereExprs(captured.list), whereExprs(captured.count))
	})

	t.Run("no filter params add no clause", func(t *testing.T) {
		captured := useCapturingDal(t)
		_, _, err := GetProjects(&ProjectQuery{})
		assert.NoError(t, err)
		assert.Empty(t, clausesOfType(captured.list, dal.WhereClause))
	})
}

func TestGetBlueprintsFilters(t *testing.T) {
	list := func(t *testing.T, query *BlueprintQuery) []dal.DalClause {
		t.Helper()
		captured := useCapturingDal(t)
		_, _, err := GetBlueprints(query, false)
		assert.NoError(t, err)
		assert.Equal(t, whereExprs(captured.list), whereExprs(captured.count))
		return whereExprs(captured.list)
	}

	t.Run("single type behaves as before", func(t *testing.T) {
		wheres := list(t, &BlueprintQuery{Type: []string{"DAILY"}})
		if assert.Len(t, wheres, 1) {
			assert.Equal(t, "is_manual = ? AND cron_config = ?", wheres[0].Expr)
			assert.Equal(t, []interface{}{false, "0 0 * * *"}, wheres[0].Params)
		}
		assert.Empty(t, list(t, &BlueprintQuery{}))
	})

	t.Run("multiple types are OR'd", func(t *testing.T) {
		wheres := list(t, &BlueprintQuery{Type: []string{"DAILY", "MANUAL"}})
		if assert.Len(t, wheres, 1) {
			assert.Equal(t, "(is_manual = ? AND cron_config = ?) OR (is_manual = ?)", wheres[0].Expr)
			assert.Equal(t, []interface{}{false, "0 0 * * *", true}, wheres[0].Params)
		}
	})

	t.Run("ALL among types disables the type filter", func(t *testing.T) {
		assert.Empty(t, list(t, &BlueprintQuery{Type: []string{"DAILY", "ALL"}}))
	})

	t.Run("unknown type is BadInput", func(t *testing.T) {
		useCapturingDal(t)
		_, _, err := GetBlueprints(&BlueprintQuery{Type: []string{"DAILY", "HOURLY"}}, false)
		if assert.Error(t, err) {
			assert.Equal(t, http.StatusBadRequest, err.GetType().GetHttpCode())
		}
	})

	t.Run("isManual still wins over types", func(t *testing.T) {
		manual := true
		wheres := list(t, &BlueprintQuery{IsManual: &manual, Type: []string{"DAILY", "WEEKLY"}})
		if assert.Len(t, wheres, 1) {
			assert.Equal(t, "is_manual = ?", wheres[0].Expr)
			assert.Equal(t, []interface{}{true}, wheres[0].Params)
		}
	})

	t.Run("connection filter builds an EXISTS", func(t *testing.T) {
		wheres := list(t, &BlueprintQuery{Connection: []string{"github:1", "claude_otel:7"}})
		if assert.Len(t, wheres, 1) {
			assert.Equal(t, "EXISTS (SELECT 1 FROM _devlake_blueprint_connections fbc WHERE fbc.blueprint_id = _devlake_blueprints.id AND ((fbc.plugin_name = ? AND fbc.connection_id = ?) OR (fbc.plugin_name = ? AND fbc.connection_id = ?)))", wheres[0].Expr)
			assert.Equal(t, []interface{}{"github", uint64(1), "claude_otel", uint64(7)}, wheres[0].Params)
		}
	})

	t.Run("invalid connection value is BadInput", func(t *testing.T) {
		useCapturingDal(t)
		_, _, err := GetBlueprints(&BlueprintQuery{Connection: []string{"github"}}, false)
		if assert.Error(t, err) {
			assert.Equal(t, http.StatusBadRequest, err.GetType().GetHttpCode())
		}
	})

	t.Run("projectName filter uses IN", func(t *testing.T) {
		wheres := list(t, &BlueprintQuery{ProjectName: []string{"a", "b"}})
		if assert.Len(t, wheres, 1) {
			assert.Equal(t, "_devlake_blueprints.project_name IN ?", wheres[0].Expr)
			assert.Equal(t, []interface{}{[]string{"a", "b"}}, wheres[0].Params)
		}
	})
}
