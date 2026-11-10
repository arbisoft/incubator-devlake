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
	"testing"

	"github.com/apache/incubator-devlake/core/errors"
	mockdal "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func TestDeleteBlueprintInTransaction(t *testing.T) {
	t.Run("uses the caller transaction for every delete", func(t *testing.T) {
		tx := mockdal.NewTransaction(t)
		tx.On("Delete", mock.Anything, mock.Anything).Return(nil)
		tx.On("Delete", mock.Anything).Return(nil)

		manager := &BlueprintManager{}
		err := manager.DeleteBlueprintInTransaction(tx, 42)

		assert.NoError(t, err)
		assert.Len(t, tx.Calls, 4)
	})

	t.Run("returns dependent deletion failures", func(t *testing.T) {
		expected := errors.Default.New("unable to delete blueprint")
		tx := mockdal.NewTransaction(t)
		tx.On("Delete", mock.AnythingOfType("*models.Blueprint")).Return(expected).Once()
		tx.On("Delete", mock.Anything, mock.Anything).Return(nil)

		manager := &BlueprintManager{}
		err := manager.DeleteBlueprintInTransaction(tx, 42)

		assert.ErrorIs(t, err, expected)
		assert.Len(t, tx.Calls, 2)
	})
}

func TestBlueprintTypesClause(t *testing.T) {
	tests := []struct {
		name       string
		types      []string
		wantErr    bool
		wantClause string
	}{
		{name: "ALL before unknown is rejected", types: []string{"ALL", "bogus"}, wantErr: true},
		{name: "unknown before ALL is rejected", types: []string{"bogus", "ALL"}, wantErr: true},
		{name: "ALL with a known type drops the filter", types: []string{"ALL", "DAILY"}},
		{name: "known types are OR'd", types: []string{"MANUAL", "DAILY"}, wantClause: "(is_manual = ?) OR (is_manual = ? AND cron_config = ?)"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			clause, _, err := blueprintTypesClause(&GetBlueprintQuery{Types: tt.types})
			if tt.wantErr {
				assert.Error(t, err)
				return
			}
			assert.NoError(t, err)
			assert.Equal(t, tt.wantClause, clause)
		})
	}
}

func TestBlueprintTypeClauseErrorDoesNotEchoInput(t *testing.T) {
	_, _, err := blueprintTypeClause("bogus-xyz123")
	if assert.Error(t, err) {
		assert.NotContains(t, err.Error(), "xyz123")
	}
}
