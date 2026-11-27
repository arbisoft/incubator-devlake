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
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/models/domainlayer/codequality"
	"github.com/apache/incubator-devlake/helpers/e2ehelper"
	"github.com/apache/incubator-devlake/plugins/sonarqube/impl"
	"github.com/apache/incubator-devlake/plugins/sonarqube/models"
	"github.com/apache/incubator-devlake/plugins/sonarqube/tasks"
	"github.com/stretchr/testify/assert"
)

func TestSonarqubeIssueImpactSeverity(t *testing.T) {
	var sonarqube impl.Sonarqube
	dataflowTester := e2ehelper.NewDataFlowTester(t, "sonarqube", sonarqube)

	dataflowTester.FlushTabler(&models.SonarqubeIssue{})
	dataflowTester.FlushTabler(&models.SonarqubeIssueImpact{})
	dataflowTester.ImportCsvIntoTabler("./raw_tables/_tool_sonarqube_issues_for_impacts.csv", &models.SonarqubeIssue{})
	dataflowTester.ImportCsvIntoTabler("./raw_tables/_tool_sonarqube_issue_impacts.csv", &models.SonarqubeIssueImpact{})

	taskData := &tasks.SonarqubeTaskData{
		Options: &tasks.SonarqubeOptions{
			ConnectionId: 1,
			ProjectKey:   "impact-project",
		},
		TaskStartTime: time.Now(),
	}

	dataflowTester.FlushTabler(&codequality.CqIssueImpact{})
	dataflowTester.Subtask(tasks.ConvertIssueImpactsMeta, taskData)

	var impacts []codequality.CqIssueImpact
	assert.Nil(t, dataflowTester.Dal.All(&impacts))
	assert.Len(t, impacts, 1)
	assert.Equal(t, "MEDIUM", impacts[0].Severity)
	assert.Equal(t, "MAINTAINABILITY", impacts[0].SoftwareQuality)
}
