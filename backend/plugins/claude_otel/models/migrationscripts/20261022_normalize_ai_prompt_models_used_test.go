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

package migrationscripts

import (
	"testing"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
)

func TestBaseModelIDs20261022(t *testing.T) {
	for _, test := range []struct {
		name, in, want string
	}{
		{"single model unchanged", "claude-opus-5-5", "claude-opus-5-5"},
		{"sorted", "claude-opus-5-5,claude-haiku-4-5", "claude-haiku-4-5,claude-opus-5-5"},
		{"snapshot date dropped", "claude-haiku-4-5-20251001,claude-opus-5-5", "claude-haiku-4-5,claude-opus-5-5"},
		{"variant dropped", "claude-sonnet-4-5[1m]", "claude-sonnet-4-5"},
		{"date and variant", "claude-sonnet-4-20250514[1m]", "claude-sonnet-4"},
		{"duplicates merged", "claude-sonnet-4-20250514,claude-sonnet-4", "claude-sonnet-4"},
		{"empty entries skipped", "claude-opus-5-5,, ", "claude-opus-5-5"},
		{"already normalized", "claude-haiku-4-5,claude-sonnet-4-5", "claude-haiku-4-5,claude-sonnet-4-5"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := baseModelIDs20261022(test.in); got != test.want {
				t.Fatalf("baseModelIDs20261022(%q) = %q, want %q", test.in, got, test.want)
			}
		})
	}
}

// fakeDal20261022 stubs the two dal.Dal methods the migration calls. Migration scripts can't
// import the generated mocks (see core/migration/linter), so the embedded nil dal.Dal panics on
// any other call.
type fakeDal20261022 struct {
	dal.Dal
	t             *testing.T
	pluck         func(dest interface{}, clauses ...dal.Clause) errors.Error
	updateColumns func(set []dal.DalSet, clauses ...dal.Clause) errors.Error
	pluckCalls    int
	updateCalls   int
}

func (f *fakeDal20261022) Pluck(column string, dest interface{}, clauses ...dal.Clause) errors.Error {
	f.pluckCalls++
	if column != "models_used" {
		f.t.Fatalf("Pluck() column = %q, want models_used", column)
	}
	return f.pluck(dest, clauses...)
}

func (f *fakeDal20261022) UpdateColumns(entityOrTable interface{}, set []dal.DalSet, clauses ...dal.Clause) errors.Error {
	f.updateCalls++
	if entityOrTable != aiPromptsTable20261022 {
		f.t.Fatalf("UpdateColumns() table = %v, want %s", entityOrTable, aiPromptsTable20261022)
	}
	if f.updateColumns == nil {
		f.t.Fatal("UpdateColumns() called, want no updates")
	}
	return f.updateColumns(set, clauses...)
}

// Each distinct value the rule changes is rewritten once for all its prompts; values already
// in the new form are not written, so a rerun is a no-op.
func TestNormalizeModelsUsed20261022UpdatesOnlyChangedValues(t *testing.T) {
	updates := make(map[string]string)
	database := &fakeDal20261022{
		t: t,
		pluck: func(destination interface{}, clauses ...dal.Clause) errors.Error {
			where := clauses[1].Data.(dal.DalClause)
			if where.Expr != "provider = ? AND models_used <> ''" || where.Params[0] != aiProviderClaude20261022 {
				t.Fatalf("Pluck() where = %q %v", where.Expr, where.Params)
			}
			*destination.(*[]string) = []string{"claude-opus-5-5", "claude-opus-5-5,claude-haiku-4-5-20251001", "claude-sonnet-4-5[1m]"}
			return nil
		},
		updateColumns: func(set []dal.DalSet, clauses ...dal.Clause) errors.Error {
			where := clauses[0].Data.(dal.DalClause)
			if where.Expr != "provider = ? AND models_used = ?" || where.Params[0] != aiProviderClaude20261022 || len(set) != 1 || set[0].ColumnName != "models_used" {
				t.Fatalf("UpdateColumns() set = %v where = %q %v", set, where.Expr, where.Params)
			}
			updates[where.Params[1].(string)] = set[0].Value.(string)
			return nil
		},
	}

	if err := normalizeModelsUsed20261022(database); err != nil {
		t.Fatalf("normalizeModelsUsed20261022() error = %v", err)
	}
	want := map[string]string{
		"claude-opus-5-5,claude-haiku-4-5-20251001": "claude-haiku-4-5,claude-opus-5-5",
		"claude-sonnet-4-5[1m]":                     "claude-sonnet-4-5",
	}
	if database.pluckCalls != 1 || database.updateCalls != len(want) || len(updates) != len(want) {
		t.Fatalf("Pluck() calls = %d, UpdateColumns() calls = %d, updates = %v, want 1 Pluck and %v", database.pluckCalls, database.updateCalls, updates, want)
	}
	for from, to := range want {
		if updates[from] != to {
			t.Fatalf("update of %q = %q, want %q", from, updates[from], to)
		}
	}
}

func TestNormalizeModelsUsed20261022ReturnsLoadError(t *testing.T) {
	database := &fakeDal20261022{
		t: t,
		pluck: func(interface{}, ...dal.Clause) errors.Error {
			return errors.Default.New("connection lost")
		},
	}

	if err := normalizeModelsUsed20261022(database); err == nil {
		t.Fatal("normalizeModelsUsed20261022() error = nil, want the load error")
	}
}

func TestNormalizeModelsUsed20261022ReturnsUpdateError(t *testing.T) {
	database := &fakeDal20261022{
		t: t,
		pluck: func(destination interface{}, _ ...dal.Clause) errors.Error {
			*destination.(*[]string) = []string{"claude-sonnet-4-5[1m]", "claude-opus-5-5[1m]"}
			return nil
		},
		updateColumns: func([]dal.DalSet, ...dal.Clause) errors.Error {
			return errors.Default.New("lock wait timeout")
		},
	}

	if err := normalizeModelsUsed20261022(database); err == nil {
		t.Fatal("normalizeModelsUsed20261022() error = nil, want the update error")
	}
	if database.updateCalls != 1 {
		t.Fatalf("UpdateColumns() calls = %d, want 1 (stop at the first error)", database.updateCalls)
	}
}
