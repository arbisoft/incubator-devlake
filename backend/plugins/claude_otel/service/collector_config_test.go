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

package service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The raw ingest endpoint depends on these Collector settings: it reads uncompressed
// protobuf, trusts only datapoint attribution, and must not block in the queue deadlock path.
func TestMaintainedCollectorConfigsMatchRawIngestContract(t *testing.T) {
	requiredSettings := []string{
		"compression: none",
		"block_on_overflow: false",
		"directory: /var/lib/otel/compaction",
		"resource/attribution, attributes/team]",
	}
	for _, name := range []string{"collector-config.yaml", "collector-config-production.yaml"} {
		path := filepath.Join("..", "..", "..", "..", "telemetry", "otel-collector", name)
		config, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("ReadFile(%q) error = %v", path, err)
		}
		for _, setting := range requiredSettings {
			if !strings.Contains(string(config), setting) {
				t.Errorf("%s does not contain %q", name, setting)
			}
		}
	}
}
