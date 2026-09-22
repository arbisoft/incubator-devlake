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
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

// syntheticFixtureDir points at the shared synthetic fixture directory the
// tasks package's collector/extractor tests already use (Section: "Add
// synthetic fixtures ... following the existing fixture conventions from
// Phase 2"). The e2e package intentionally reuses the same fixtures instead
// of duplicating them, so a raw-to-tool snapshot always exercises the exact
// bytes the collector-level tests also verify.
const syntheticFixtureDir = "../tasks/testdata/synthetic"

type syntheticEnvelope struct {
	Data []json.RawMessage `json:"data"`
}

// readSyntheticFixtureRows reads one synthetic fixture and decodes its
// `{"data": [...]}` envelope into individual raw item rows, simulating what
// a collector's ResponseParser hands to the extractor for one page.
func readSyntheticFixtureRows(t *testing.T, name string) []json.RawMessage {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(syntheticFixtureDir, name))
	require.NoError(t, err)

	var envelope syntheticEnvelope
	require.NoError(t, json.Unmarshal(raw, &envelope))
	return envelope.Data
}
