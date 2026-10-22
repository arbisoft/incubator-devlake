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
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/stretchr/testify/mock"
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

// Each distinct value the rule changes is rewritten once for all its prompts; values already
// in the new form are not written, so a rerun is a no-op.
func TestNormalizeModelsUsed20261022UpdatesOnlyChangedValues(t *testing.T) {
	database := dalmocks.NewDal(t)
	database.EXPECT().Pluck("models_used", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Run(func(_ string, destination interface{}, clauses ...dal.Clause) {
		where := clauses[1].Data.(dal.DalClause)
		if where.Expr != "provider = ? AND models_used <> ''" || where.Params[0] != aiProviderClaude20261022 {
			t.Fatalf("Pluck() where = %q %v", where.Expr, where.Params)
		}
		*destination.(*[]string) = []string{"claude-opus-5-5", "claude-opus-5-5,claude-haiku-4-5-20251001", "claude-sonnet-4-5[1m]"}
	}).Return(nil).Once()
	updates := make(map[string]string)
	database.EXPECT().UpdateColumns(aiPromptsTable20261022, mock.Anything, mock.Anything).Run(func(_ interface{}, set []dal.DalSet, clauses ...dal.Clause) {
		where := clauses[0].Data.(dal.DalClause)
		if where.Expr != "provider = ? AND models_used = ?" || where.Params[0] != aiProviderClaude20261022 || len(set) != 1 || set[0].ColumnName != "models_used" {
			t.Fatalf("UpdateColumns() set = %v where = %q %v", set, where.Expr, where.Params)
		}
		updates[where.Params[1].(string)] = set[0].Value.(string)
	}).Return(nil).Times(2)

	if err := normalizeModelsUsed20261022(database); err != nil {
		t.Fatalf("normalizeModelsUsed20261022() error = %v", err)
	}
	want := map[string]string{
		"claude-opus-5-5,claude-haiku-4-5-20251001": "claude-haiku-4-5,claude-opus-5-5",
		"claude-sonnet-4-5[1m]":                     "claude-sonnet-4-5",
	}
	if len(updates) != len(want) {
		t.Fatalf("updates = %v, want %v", updates, want)
	}
	for from, to := range want {
		if updates[from] != to {
			t.Fatalf("update of %q = %q, want %q", from, updates[from], to)
		}
	}
}

func TestNormalizeModelsUsed20261022ReturnsLoadError(t *testing.T) {
	database := dalmocks.NewDal(t)
	database.EXPECT().Pluck("models_used", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(errors.Default.New("connection lost")).Once()

	if err := normalizeModelsUsed20261022(database); err == nil {
		t.Fatal("normalizeModelsUsed20261022() error = nil, want the load error")
	}
}

func TestNormalizeModelsUsed20261022ReturnsUpdateError(t *testing.T) {
	database := dalmocks.NewDal(t)
	database.EXPECT().Pluck("models_used", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Run(func(_ string, destination interface{}, _ ...dal.Clause) {
		*destination.(*[]string) = []string{"claude-sonnet-4-5[1m]", "claude-opus-5-5[1m]"}
	}).Return(nil).Once()
	database.EXPECT().UpdateColumns(aiPromptsTable20261022, mock.Anything, mock.Anything).Return(errors.Default.New("lock wait timeout")).Once()

	if err := normalizeModelsUsed20261022(database); err == nil {
		t.Fatal("normalizeModelsUsed20261022() error = nil, want the update error")
	}
}
