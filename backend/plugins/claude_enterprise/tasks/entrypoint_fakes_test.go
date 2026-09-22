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

package tasks

import (
	"context"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	coremodels "github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/unithelper"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
	mockdal "github.com/apache/incubator-devlake/mocks/core/dal"
	mockplugin "github.com/apache/incubator-devlake/mocks/core/plugin"
	"github.com/apache/incubator-devlake/plugins/claude_enterprise/models"
	"github.com/spf13/viper"
	"github.com/stretchr/testify/mock"
)

// This file provides shared test doubles used to drive the tasks package's
// SubTaskEntryPoint-shaped functions (Collect*/Extract*/ConvertUserActivities)
// to real, executed coverage instead of leaving them at the 0% documented in
// Phase 16. Two flavors of double are provided:
//
//   - A cheap, mockery-generated plugin.SubTaskContext/plugin.TaskContext pair
//     (newBadTaskDataSubTaskContext, newNoRawTableSubTaskContext,
//     newNoRowsConvertSubTaskContext) for entry points whose framework-level
//     work (helper.ApiExtractor/helper.DataConverter) can be driven to a real,
//     legitimate no-op outcome (missing raw table, empty cursor) with a
//     handful of *mockdal.Dal expectations.
//   - A small hand-written plugin.TaskContext/plugin.SubTaskContext pair
//     (fakeTaskContext/fakeSubTaskContext) built on top of DevLake's own
//     impls/context.DefaultBasicRes, used only where the collector path needs
//     a real, working config/logger/context trio to construct a real
//     *helper.ApiAsyncClient against an httptest server -- mocking that whole
//     chain field-by-field would be far more brittle than reusing DevLake's
//     own BasicRes implementation.

// validClaudeEnterpriseTaskData returns a minimal but realistic task data
// value good enough for driving collector/extractor/converter entry points
// end to end.
func validClaudeEnterpriseTaskData() *ClaudeEnterpriseTaskData {
	return &ClaudeEnterpriseTaskData{
		Options: &ClaudeEnterpriseOptions{
			ConnectionId:   1,
			ScopeId:        "org_synthetic_001",
			OrganizationId: "org_synthetic_001",
		},
		Connection: &models.ClaudeEnterpriseConnection{
			ClaudeEnterpriseConn: models.ClaudeEnterpriseConn{
				OrganizationId: "org_synthetic_001",
			},
		},
	}
}

// newBadTaskDataSubTaskContext returns a SubTaskContext whose
// TaskContext().GetData() does not resolve to *ClaudeEnterpriseTaskData, so
// every Collect*/Extract*/ConvertUserActivities entry point takes its first
// defensive branch and returns a descriptive error instead of panicking.
func newBadTaskDataSubTaskContext() *mockplugin.SubTaskContext {
	mockTaskContext := new(mockplugin.TaskContext)
	mockTaskContext.On("GetData").Return("not-a-*ClaudeEnterpriseTaskData")

	mockCtx := new(mockplugin.SubTaskContext)
	mockCtx.On("TaskContext").Return(mockTaskContext)
	return mockCtx
}

// newNoRawTableSubTaskContext returns a SubTaskContext wired with valid task
// data whose Dal reports the subtask's raw table does not exist yet. This
// mirrors the real, legitimate "never collected" state DevLake's
// helper.ApiExtractor already special-cases (see api_extractor.go's
// `if !db.HasTable(extractor.table) { return nil }`), letting the extractor
// entry point run to completion for real.
func newNoRawTableSubTaskContext(data *ClaudeEnterpriseTaskData) *mockplugin.SubTaskContext {
	mockDal := new(mockdal.Dal)
	mockDal.On("HasTable", mock.Anything).Return(false)

	mockTaskContext := new(mockplugin.TaskContext)
	mockTaskContext.On("GetData").Return(data)

	mockCtx := new(mockplugin.SubTaskContext)
	mockCtx.On("TaskContext").Return(mockTaskContext)
	mockCtx.On("GetDal").Return(mockDal)
	mockCtx.On("GetLogger").Return(unithelper.DummyLogger())
	return mockCtx
}

// newNoRowsConvertSubTaskContext returns a SubTaskContext wired with valid
// task data and an empty analytics-record cursor, so ConvertUserActivities
// runs its real helper.DataConverter to completion with zero source rows --
// the legitimate "nothing to convert yet" outcome.
func newNoRowsConvertSubTaskContext(data *ClaudeEnterpriseTaskData) *mockplugin.SubTaskContext {
	mockRows := new(mockdal.Rows)
	mockRows.On("Next").Return(false)
	mockRows.On("Close").Return(nil)

	mockDal := new(mockdal.Dal)
	mockDal.On("Cursor", mock.Anything).Return(mockRows, nil)

	mockTaskContext := new(mockplugin.TaskContext)
	mockTaskContext.On("GetData").Return(data)

	mockCtx := new(mockplugin.SubTaskContext)
	mockCtx.On("TaskContext").Return(mockTaskContext)
	mockCtx.On("GetDal").Return(mockDal)
	mockCtx.On("GetLogger").Return(unithelper.DummyLogger())
	mockCtx.On("GetContext").Return(context.Background())
	mockCtx.On("SetProgress", mock.Anything, mock.Anything)
	return mockCtx
}

// fakeTaskContext is a hand-written, non-mockery plugin.TaskContext built on
// top of DevLake's own impls/context.DefaultBasicRes (the same real BasicRes
// implementation plugins/plane/api/remote_api_test.go uses for its own
// ApiClient test). It exists only for the collector round-trip test, which
// needs a working config reader, logger, and context.Context to construct a
// real *helper.ApiAsyncClient talking to an httptest.Server -- reproducing
// that whole chain with field-by-field mocks would be far more brittle.
type fakeTaskContext struct {
	*contextimpl.DefaultBasicRes
	data       interface{}
	syncPolicy *coremodels.SyncPolicy
}

func newFakeTaskContext(db dal.Dal, data interface{}) *fakeTaskContext {
	return &fakeTaskContext{
		DefaultBasicRes: contextimpl.NewDefaultBasicRes(viper.New(), unithelper.DummyLogger(), db),
		data:            data,
	}
}

func (f *fakeTaskContext) GetName() string                         { return "claude_enterprise_test" }
func (f *fakeTaskContext) GetContext() context.Context             { return context.Background() }
func (f *fakeTaskContext) GetData() interface{}                    { return f.data }
func (f *fakeTaskContext) SetData(data interface{})                { f.data = data }
func (f *fakeTaskContext) SetProgress(_ int, _ int)                {}
func (f *fakeTaskContext) IncProgress(_ int)                       {}
func (f *fakeTaskContext) SetSyncPolicy(sp *coremodels.SyncPolicy) { f.syncPolicy = sp }
func (f *fakeTaskContext) SyncPolicy() *coremodels.SyncPolicy      { return f.syncPolicy }
func (f *fakeTaskContext) SubTaskContext(_ string) (plugin.SubTaskContext, errors.Error) {
	return newFakeSubTaskContext(f), nil
}

// fakeSubTaskContext adapts a fakeTaskContext into a plugin.SubTaskContext.
type fakeSubTaskContext struct {
	*contextimpl.DefaultBasicRes
	taskCtx plugin.TaskContext
}

func newFakeSubTaskContext(taskCtx *fakeTaskContext) *fakeSubTaskContext {
	return &fakeSubTaskContext{
		DefaultBasicRes: taskCtx.DefaultBasicRes,
		taskCtx:         taskCtx,
	}
}

func (f *fakeSubTaskContext) GetName() string                 { return f.taskCtx.GetName() }
func (f *fakeSubTaskContext) GetContext() context.Context     { return f.taskCtx.GetContext() }
func (f *fakeSubTaskContext) GetData() interface{}            { return f.taskCtx.GetData() }
func (f *fakeSubTaskContext) SetProgress(_ int, _ int)        {}
func (f *fakeSubTaskContext) IncProgress(_ int)               {}
func (f *fakeSubTaskContext) TaskContext() plugin.TaskContext { return f.taskCtx }
