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
	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/core/plugin"
)

var _ plugin.MigrationScript = (*addCanonicalAiDomain)(nil)

// addCanonicalAiDomain extends the existing shared AI activity contract without
// changing legacy rows, then creates the distinct daily model and tool-decision facts.
type addCanonicalAiDomain struct{}

func (script *addCanonicalAiDomain) Up(basicRes context.BasicRes) errors.Error {
	db := basicRes.GetDal()
	for _, model := range []interface{}{
		&ai.AiActivity{},
		&ai.AiModelUsage{},
		&ai.AiToolDecision{},
		&ai.AiSourcePreference{},
		&ai.AiSourceSnapshot{},
	} {
		if err := db.AutoMigrate(model); err != nil {
			return err
		}
	}
	return nil
}

func (*addCanonicalAiDomain) Version() uint64 { return 20260914140000 }

func (*addCanonicalAiDomain) Name() string {
	return "add canonical AI activity reconciliation tables"
}
