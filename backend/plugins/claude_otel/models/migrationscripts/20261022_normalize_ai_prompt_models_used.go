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
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
)

var _ plugin.MigrationScript = (*normalizeAiPromptModelsUsed)(nil)

// normalizeAiPromptModelsUsed rewrites the models_used of Claude prompts converted before the
// rollup recorded sorted base model IDs, so that old and new prompts group together. A log
// replay can only rewrite the last 90 days, because older raw batches are deleted.
type normalizeAiPromptModelsUsed struct{}

const (
	aiPromptsTable20261022   = "ai_prompts"
	aiProviderClaude20261022 = "claude"
)

// A frozen copy of the rollup's rule as of this script: drop each model ID's -YYYYMMDD snapshot
// date and trailing variant such as [1m]. A later change to the rule needs a new script.
var (
	modelSnapshotDate20261022  = regexp.MustCompile(`-[0-9]{8}`)
	modelVariantSuffix20261022 = regexp.MustCompile(`\[[^\]]*\]$`)
)

func (*normalizeAiPromptModelsUsed) Up(basicRes context.BasicRes) errors.Error {
	return normalizeModelsUsed20261022(basicRes.GetDal())
}

// normalizeModelsUsed20261022 rewrites each distinct Claude models_used value that the rule
// changes, for every prompt that has it. Values already in the new form are left alone, so a
// rerun changes nothing.
func normalizeModelsUsed20261022(db dal.Dal) errors.Error {
	values := make([]string, 0)
	if err := db.Pluck("models_used", &values,
		dal.From(aiPromptsTable20261022),
		dal.Where("provider = ? AND models_used <> ''", aiProviderClaude20261022),
		dal.Groupby("models_used"),
	); err != nil {
		return errors.Default.Wrap(err, "load Claude prompt models_used values")
	}
	for _, value := range values {
		normalized := baseModelIDs20261022(value)
		if normalized == value {
			continue
		}
		if err := db.UpdateColumns(aiPromptsTable20261022,
			[]dal.DalSet{{ColumnName: "models_used", Value: normalized}},
			dal.Where("provider = ? AND models_used = ?", aiProviderClaude20261022, value),
		); err != nil {
			return errors.Default.Wrap(err, fmt.Sprintf("normalize Claude prompt models_used %q", value))
		}
	}
	return nil
}

// baseModelIDs20261022 turns a comma-separated models_used value into its sorted, de-duplicated
// base model IDs, as the rollup now records them.
func baseModelIDs20261022(modelsUsed string) string {
	seen := make(map[string]struct{})
	for _, model := range strings.Split(modelsUsed, ",") {
		id := modelVariantSuffix20261022.ReplaceAllString(modelSnapshotDate20261022.ReplaceAllString(strings.TrimSpace(model), ""), "")
		if id != "" {
			seen[id] = struct{}{}
		}
	}
	ids := make([]string, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return strings.Join(ids, ",")
}

func (*normalizeAiPromptModelsUsed) Version() uint64 {
	return 20261022180000
}

func (*normalizeAiPromptModelsUsed) Name() string {
	return "normalize claude ai_prompts models_used to sorted base model ids"
}
