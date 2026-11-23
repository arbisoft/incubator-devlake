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
	"testing"

	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/stretchr/testify/require"
)

func TestFailedPhaseMessageCountsEveryFailedStatus(t *testing.T) {
	for _, status := range []models.AwsBuildPhaseStatus{models.AwsBuildPhaseFailed, models.AwsBuildPhaseFault, models.AwsBuildPhaseTimedOut} {
		t.Run(string(status), func(t *testing.T) {
			phases := []AwsBuildPhase{
				{PhaseType: "SUBMITTED", PhaseStatus: "SUCCEEDED", Contexts: []AwsBuildPhaseContext{{Message: "fine"}}},
				{PhaseType: "BUILD", PhaseStatus: string(status), Contexts: []AwsBuildPhaseContext{{Message: "boom"}}},
			}
			require.Equal(t, "boom", failedPhaseMessage(phases))
		})
	}
	require.Equal(t, "", failedPhaseMessage([]AwsBuildPhase{{PhaseStatus: "SUCCEEDED", Contexts: []AwsBuildPhaseContext{{Message: "fine"}}}}))
}
